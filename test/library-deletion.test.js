const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  return {
    children: [], listeners: {}, disabled: false,
    empty() { this.children = []; }, addClass() {}, focus() { this.focused = true; },
    createEl(tag, options = {}) { const child = Object.assign(element(), { tag, ...options }); this.children.push(child); return child; },
    createDiv(options) { return this.createEl("div", options); },
    addEventListener(event, handler) { this.listeners[event] = handler; },
  };
}
class Modal {
  constructor() { this.contentEl = element(); }
  close() { this.closed = true; }
}
const sandbox = {
  module: { exports: {} }, console, setTimeout, clearTimeout,
  require(name) {
    if (name === "obsidian") return {
      ItemView: class {}, Plugin: class {}, PluginSettingTab: class {}, Modal,
      Notice: class {}, normalizePath: value => value.replace(/\\/g, "/"),
    };
    return require(name.startsWith("./") ? `../plugin/${name.slice(2)}` : name);
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../plugin/main.js"), "utf8")
  + "\nmodule.exports.DeleteModal = DeleteLibraryFilesModal;", sandbox);
const Plugin = sandbox.module.exports;

function fixture(paths = ["Articles/story/article.md", "Articles/story/article.pdf"]) {
  const files = new Map(), trashed = [];
  const plugin = new Plugin();
  const add = (p, text = "# Article") => {
    const file = { path: p, name: p.split("/").pop(), basename: p.split("/").pop().replace(/\.[^.]+$/, ""), stat: { mtime: 1, size: text.length } };
    files.set(p, { file, text });
    return file;
  };
  for (const p of paths) add(p);
  plugin.settings = { readingRoot: "Records", articleLibraryRoots: "Articles", articleLibraryExcludeRoots: "Records" };
  plugin.app = {
    metadataCache: { getFileCache(file) { return { frontmatter: { source_vault_path: plugin.readFrontmatterValue(files.get(file.path).text, "source_vault_path") } }; } },
    vault: {
      getFiles: () => [...files.values()].map(x => x.file),
      getMarkdownFiles: () => [...files.values()].map(x => x.file).filter(f => f.path.endsWith(".md")),
      getAbstractFileByPath: p => files.get(p)?.file || null,
      async trash(file, system) {
        assert.equal(system, false);
        assert.ok(files.has(file.path));
        trashed.push(file.path); files.delete(file.path);
      },
    },
  };
  plugin.pathExists = async p => files.has(p);
  plugin.readText = async p => { if (!files.has(p)) throw Error("read failed"); return files.get(p).text; };
  plugin.saveIndex = async index => add(plugin.indexPath(), JSON.stringify(index));
  plugin.saveSettings = async () => {};
  const group = p => plugin.collectArticleLibraryGroups().find(g => g.files.some(f => f.path === p));
  const plan = (p = paths[0], single = false) => plugin.prepareLibraryDeletion(group(p).id, single ? p : "");
  const record = (source = paths[0], note = "Records/note.md") => add(note, `---\nsource_vault_path: "${source}"\n---\n\n## 标注记录\n`);
  return { plugin, files, trashed, add, plan, record, paths };
}

async function run() {
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log(`ok ${count} - ${name}`); };
  await test("single file and last version are recoverably removed", async () => {
    const f = fixture(["Articles/solo.md"]);
    await f.plugin.executeLibraryDeletion(await f.plan(undefined, true));
    assert.deepEqual(f.trashed, f.paths);
    assert.equal(f.plugin.collectArticleLibraryGroups().length, 0);
  });
  await test("zero-annotation unindexed reading record blocks single deletion", async () => {
    const f = fixture(); f.record();
    await assert.rejects(f.plan(undefined, true), /已有阅读记录/);
    assert.equal(f.trashed.length, 0);
  });
  await test("PDF with its own reading record is protected", async () => {
    const f = fixture(); f.record(f.paths[1]);
    await assert.rejects(f.plan(f.paths[1], true), /已有阅读记录/);
    await f.plugin.executeLibraryDeletion(await f.plan(f.paths[0], true));
    assert.ok(f.files.has(f.paths[1]));
    assert.ok(f.files.has("Records/note.md"));
  });
  await test("group includes all duplicate and relocated reading records; preserves siblings and attachments", async () => {
    const f = fixture(); f.record(); f.record(f.paths[0], "Records/duplicate.md"); f.record(f.paths[1], "Elsewhere/pdf-note.md");
    f.add("Articles/story/image.png"); f.add("Articles/story/unrelated.md");
    const plan = await f.plan();
    assert.equal(plan.sourcePaths.length, 2); assert.equal(plan.recordPaths.length, 3);
    await f.plugin.executeLibraryDeletion(plan);
    assert.equal(f.trashed.length, 5);
    assert.ok(f.files.has("Articles/story/unrelated.md")); assert.ok(f.files.has("Articles/story/image.png"));
  });
  await test("multi-version best version is recomputed after deletion", async () => {
    const f = fixture(["Articles/story/article.md", "Articles/story/article_zh.md", "Articles/story/article.pdf"]);
    await f.plugin.executeLibraryDeletion(await f.plan(f.paths[1], true));
    const groups = await f.plugin.buildArticleLibraryGroups();
    assert.equal(groups.length, 1); assert.equal(groups[0].versions.length, 2);
    assert.equal(groups[0].bestVersion.path, f.paths[0]);
  });
  await test("multiple unrelated Markdown articles are separate deletion scopes", async () => {
    const f = fixture(["Articles/folder/alpha.md", "Articles/folder/beta.md", "Articles/folder/alpha.pdf"]);
    assert.equal((await f.plan()).sourcePaths.length, 2);
    await f.plugin.executeLibraryDeletion(await f.plan());
    assert.ok(f.files.has(f.paths[1]));
  });
  await test("missing and corrupt index references fail closed", async () => {
    const f = fixture();
    f.add(f.plugin.indexPath(), "{");
    await assert.rejects(f.plan());
    f.add(f.plugin.indexPath(), JSON.stringify({ sources: { [f.paths[0]]: { reading_note_path: "Records/missing.md" } } }));
    await assert.rejects(f.plan(), /缺失/);
    await assert.rejects(f.plan(undefined, true), /已有阅读记录/);
  });
  await test("shared or mismatched note prevents group deletion", async () => {
    const f = fixture(); f.record();
    f.add(f.plugin.indexPath(), JSON.stringify({ sources: {
      [f.paths[0]]: { reading_note_path: "Records/note.md" },
      "Articles/other.md": { reading_note_path: "Records/note.md" },
    } }));
    await assert.rejects(f.plan(), /共同引用/);
    assert.equal(f.trashed.length, 0);
  });
  await test("new record between preview and confirmation blocks deletion", async () => {
    const f = fixture(); const plan = await f.plan(undefined, true); f.record();
    await assert.rejects(f.plugin.executeLibraryDeletion(plan), /已有阅读记录/);
    assert.equal(f.trashed.length, 0);
  });
  await test("changed group membership and record content invalidate preview", async () => {
    const f = fixture(); f.record(); let plan = await f.plan();
    f.files.get("Records/note.md").text += "new annotation";
    await assert.rejects(f.plugin.executeLibraryDeletion(plan), /已变化/);
    plan = await f.plan(); f.add("Articles/story/article_zh.md");
    await assert.rejects(f.plugin.executeLibraryDeletion(plan), /已变化/);
    assert.equal(f.trashed.length, 0);
  });
  await test("only deleted article index entries are removed", async () => {
    const f = fixture(); f.record();
    f.add(f.plugin.indexPath(), JSON.stringify({ sources: {
      [f.paths[0]]: { reading_note_path: "Records/note.md" }, "Articles/other.md": { annotation_count: 7 },
    } }));
    await f.plugin.executeLibraryDeletion(await f.plan());
    const index = JSON.parse(f.files.get(f.plugin.indexPath()).text);
    assert.equal(index.sources[f.paths[0]], undefined);
    assert.equal(index.sources["Articles/other.md"].annotation_count, 7);
  });
  await test("partial failure reports progress and never permanently deletes", async () => {
    const f = fixture(); const trash = f.plugin.app.vault.trash;
    f.plugin.app.vault.trash = async (file, system) => { if (f.trashed.length) throw Error("disk failure"); await trash(file, system); };
    await assert.rejects(f.plugin.executeLibraryDeletion(await f.plan()), /已将 1 个文件.*[\s\S]*disk failure/);
    assert.equal(f.trashed.length, 1); assert.ok(f.files.has(f.paths[1]));
    assert.equal(f.plugin.libraryDeletionInProgress, false);
  });
  await test("concurrent deletion is rejected", async () => {
    const f = fixture(); const plan = await f.plan();
    const first = f.plugin.executeLibraryDeletion(plan);
    await assert.rejects(f.plugin.executeLibraryDeletion(plan), /正在删除/);
    await first; assert.equal(f.trashed.length, 2);
  });
  await test("confirmation defaults to cancel and only runs once", async () => {
    const f = fixture(); let calls = 0;
    const modal = new Plugin.DeleteModal({}, await f.plan(), async () => { calls++; });
    modal.onOpen(); const [cancel, confirm] = modal.contentEl.children.at(-1).children;
    assert.ok(cancel.focused); cancel.listeners.click(); assert.equal(calls, 0);
    await Promise.all([confirm.listeners.click(), confirm.listeners.click()]); assert.equal(calls, 1);
  });
  console.log(`${count} library deletion tests passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
