const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("../plugin/reading-core");
const creationWorkflow = require("../plugin/creation-workflow");
const skillRegistry = require("../plugin/skill-registry");

const fixedNow = "2026-06-10T11:59:00+08:00";

function loadPluginClass(options = {}) {
  const code = fs.readFileSync(path.join(__dirname, "../plugin/main.js"), "utf8");
  class ItemView {}
  class Modal {}
  class Plugin {
    async loadData() {
      return null;
    }
    async saveData(data) {
      this.savedData = data;
    }
    registerView() {}
  }
  class PluginSettingTab {}
  class Setting {}
  class Menu {
    addItem(callback) {
      const item = {
        setTitle() {
          return item;
        },
        setIcon() {
          return item;
        },
        onClick(handler) {
          item.handler = handler;
          return item;
        },
      };
      callback(item);
      this.item = item;
      return this;
    }
    showAtMouseEvent(event) {
      this.event = event;
    }
  }
  const MarkdownRenderer = {};
  function Notice() {}
  function normalizePath(value) {
    return String(value).replace(/\\/g, "/").replace(/\/+/g, "/");
  }
  const sandbox = {
    require(name) {
      if (name === "obsidian") return { ItemView, MarkdownRenderer, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath };
      if (name === "./reading-core") return core;
      if (name === "./creation-workflow") return creationWorkflow;
      if (name === "./skill-registry") return skillRegistry;
      if (name === "crypto") return require("crypto");
      if (name === "fs") return require("fs");
      if (name === "os") return require("os");
      if (name === "child_process" && options.childProcess) return options.childProcess;
      throw new Error(`Unexpected require: ${name}`);
    },
    module: { exports: {} },
    exports: {},
    console,
    Date,
    String,
    RegExp,
    JSON,
    Math,
    Array,
    setTimeout(callback) {
      callback();
    },
    setInterval(callback) {
      return { callback };
    },
    clearInterval() {},
    ...(options.localStorage ? { localStorage: options.localStorage } : {}),
    ...(options.process ? { process: options.process } : {}),
    ...(options.dirname ? { __dirname: options.dirname } : {}),
  };
  vm.runInNewContext(code, sandbox, { filename: "main.js" });
  return sandbox.module.exports;
}

function makeFile(path, content = "") {
  const name = path.split("/").pop();
  const basename = name.replace(/\.[^.]+$/, "");
  return {
    path,
    name,
    basename,
    stat: { mtime: 1781098200000, size: content.length },
  };
}

function makeFakeApp() {
  const files = new Map();
  const folders = new Set(["Learning", "Learning/web", "Learning/web/x_articles"]);
  const sourcePath = "Learning/web/x_articles/example/article_zh.md";
  const sourceFile = makeFile(sourcePath, "# Example\n\nSelected text");
  files.set(sourcePath, { file: sourceFile, content: "# Example\n\nSelected text" });

  const vault = {
    adapter: {
      getFullPath(path) {
        return `/vault/${path}`;
      },
      async exists(path) {
        return files.has(path) || folders.has(path);
      },
      async read(path) {
        return files.get(path).content;
      },
      async write(path, content) {
        if (!files.has(path)) {
          files.set(path, { file: makeFile(path, content), content });
          return;
        }
        files.get(path).content = content;
      },
      async list(path) {
        const prefix = `${path.replace(/\/+$/g, "")}/`;
        return {
          files: [...files.keys()].filter((filePath) => filePath.startsWith(prefix)),
          folders: [...folders].filter((folderPath) => folderPath.startsWith(prefix)),
        };
      },
      async rename(source, target) {
        const movedFiles = [...files.entries()].filter(([filePath]) => filePath === source || filePath.startsWith(`${source}/`));
        for (const [filePath, entry] of movedFiles) {
          const nextPath = `${target}${filePath.slice(source.length)}`;
          files.delete(filePath);
          files.set(nextPath, { ...entry, file: makeFile(nextPath, entry.content) });
        }
        const movedFolders = [...folders].filter((folderPath) => folderPath === source || folderPath.startsWith(`${source}/`));
        for (const folderPath of movedFolders) {
          folders.delete(folderPath);
          folders.add(`${target}${folderPath.slice(source.length)}`);
        }
      },
    },
    getAbstractFileByPath(path) {
      if (files.has(path)) return files.get(path).file;
      if (folders.has(path)) return { path, name: path.split("/").pop(), children: [] };
      return null;
    },
    async createFolder(path) {
      folders.add(path);
    },
    async create(path, content) {
      if (files.has(path)) throw new Error(`File already exists: ${path}`);
      const file = makeFile(path, content);
      files.set(path, { file, content });
      return file;
    },
    async read(file) {
      return files.get(file.path).content;
    },
    async modify(file, content) {
      files.get(file.path).content = content;
    },
    getMarkdownFiles() {
      return [...files.values()].map((entry) => entry.file).filter((file) => file.name.endsWith(".md"));
    },
    getFiles() {
      return [...files.values()].map((entry) => entry.file);
    },
  };

  return {
    sourceFile,
    files,
    folders,
    app: {
      vault,
      metadataCache: {
        getFileCache() {
          return { frontmatter: { title: "Example Article" } };
        },
      },
      workspace: {
        getLeaf() {
          return { async openFile() {} };
        },
      },
    },
  };
}

function markCreationTaskAwaiting(files, projectPath, kind) {
  const entry = [...files.entries()].find(([filePath, record]) => {
    if (!filePath.includes("/_runner/queue/") || !filePath.endsWith(".json")) return false;
    try {
      const task = JSON.parse(record.content);
      return task.projectPath === projectPath && task.kind === kind && task.status !== "cancelled";
    } catch (error) {
      return false;
    }
  });
  assert.ok(entry, `expected ${kind} task for ${projectPath}`);
  const task = JSON.parse(entry[1].content);
  task.status = "awaiting_approval";
  task.outputHashes = task.outputHashes || { [task.outputs[0]]: `${kind}-v1` };
  entry[1].content = `${JSON.stringify(task, null, 2)}\n`;
  return { ...task, taskPath: entry[0] };
}

function makeFakeElement(tag = "div") {
  const element = {
    tag,
    text: "",
    attrs: {},
    classes: new Set(),
    children: [],
    dataset: {},
    listeners: {},
    emptyCalls: 0,
    disabled: false,
    value: "",
    scrollTop: 0,
    style: {
      properties: {},
      setProperty(key, value) {
        this.properties[key] = value;
      },
    },
    empty() {
      this.emptyCalls += 1;
      this.children = [];
      this.text = "";
    },
    addClass(value) {
      for (const item of String(value || "").split(/\s+/).filter(Boolean)) this.classes.add(item);
    },
    removeClass(value) {
      this.classes.delete(value);
    },
    createDiv(options = {}) {
      return this.createEl("div", options);
    },
    createEl(childTag, options = {}) {
      const child = makeFakeElement(childTag);
      if (options.cls) child.addClass(options.cls);
      if (options.text) child.text = options.text;
      if (options.attr) child.attrs = { ...child.attrs, ...options.attr };
      if (Object.prototype.hasOwnProperty.call(options, "value")) child.value = options.value;
      if (child.attrs && Object.prototype.hasOwnProperty.call(child.attrs, "value")) child.value = child.attrs.value;
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttr(key, value) {
      this.attrs[key] = value;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
  return element;
}

function fakeElementTexts(element) {
  const texts = [];
  const visit = (node) => {
    if (node.text) texts.push(node.text);
    for (const child of node.children || []) visit(child);
  };
  visit(element);
  return texts;
}

function fakeElementsByClass(element, className) {
  const matches = [];
  const visit = (node) => {
    if (node.classes && node.classes.has(className)) matches.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(element);
  return matches;
}

function fakeElementsByTag(element, tagName) {
  const matches = [];
  const visit = (node) => {
    if (node.tag === tagName) matches.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(element);
  return matches;
}

function fakeElementByText(element, text) {
  let match = null;
  const visit = (node) => {
    if (match) return;
    if (node.text === text) {
      match = node;
      return;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(element);
  return match;
}

async function testCaptureWritesAnnotationAndIndex() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, sourceFile, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  plugin.now = () => fixedNow;

  const capture = await plugin.captureForFile(sourceFile, {
    selectedText: "Selected text",
    note: "My note",
    type: "highlight-with-note",
    heading: "标注记录",
  });

  assert.match(capture.annotationId, /^ann_20260610_115900_/);

  const readingPath = [...files.keys()].find((path) => path.startsWith("Learning/reading-notes/2026/06/") && path.endsWith(".md"));
  assert.ok(readingPath, "reading note should be created");
  const readingContent = files.get(readingPath).content;
  assert.match(readingContent, /### ann_/);
  assert.match(readingContent, /> Selected text/);
  assert.match(readingContent, /我的想法：\nMy note/);

  const indexContent = files.get("Learning/reading-notes/.reading-index.json").content;
  const index = JSON.parse(indexContent);
  assert.strictEqual(index.sources[sourceFile.path].reading_note_path, readingPath);
  assert.strictEqual(index.sources[sourceFile.path].annotation_count, 1);
  assert.doesNotMatch(files.get("Learning/reading-notes/index.md").content, /Codex|OpenClaw/);
}

async function testCaptureReusesExistingUnindexedFile() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, sourceFile, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  plugin.now = () => fixedNow;

  const source = core.buildSourceMetadata({
    vaultPath: sourceFile.path,
    title: "Example Article",
    stat: sourceFile.stat,
    now: plugin.now(),
  });
  const existingPath = core.buildReadingNotePath({
    source,
    readingRoot: "Learning/reading-notes",
    now: plugin.now(),
  });
  const initialContent = `---\ntype: reading-note\nsource_vault_path: "${sourceFile.path}"\nsource_title: "Example Article"\nstatus: reading\ncodex_status: pending_summary\nupdated: "2026-06-10T00:00:00+08:00"\n---\n\n# 阅读记录：Example Article\n\n## 标注记录\n\n`;
  files.set(existingPath, { file: makeFile(existingPath, initialContent), content: initialContent });

  await plugin.captureForFile(sourceFile, {
    selectedText: "Selected text",
    note: "Second note",
    type: "highlight-with-note",
    heading: "标注记录",
  });

  assert.match(files.get(existingPath).content, /Second note/);
  const index = JSON.parse(files.get("Learning/reading-notes/.reading-index.json").content);
  assert.strictEqual(index.sources[sourceFile.path].reading_note_path, existingPath);
}

async function testCaptureImageNote() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, sourceFile, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  plugin.now = () => fixedNow;

  const stableSrc = plugin.stableImageSource("app://abc/vault/Learning/web/x_articles/example/images/loop.png?12345", sourceFile);
  assert.strictEqual(stableSrc, "images/loop.png");

  await plugin.captureForFile(sourceFile, {
    selectedText: "",
    note: "This image explains the loop visually.",
    type: "image-note",
    heading: "标注记录",
    media: {
      type: "image",
      src: stableSrc,
      alt: "Loop diagram",
      index: 2,
    },
  });

  const readingPath = [...files.keys()].find((path) => path.startsWith("Learning/reading-notes/2026/06/") && path.endsWith(".md"));
  const readingContent = files.get(readingPath).content;
  assert.match(readingContent, /type: image-note/);
  assert.match(readingContent, /media_type: image/);
  assert.match(readingContent, /media_src: "images\/loop.png"/);
  assert.match(readingContent, /media_alt: "Loop diagram"/);
  assert.match(readingContent, /media_index: 2/);

  const annotations = plugin.parseAnnotationsFromReadingNote(readingContent);
  assert.strictEqual(annotations.length, 1);
  assert.strictEqual(annotations[0].mediaType, "image");
  assert.strictEqual(annotations[0].mediaSrc, "images/loop.png");
  assert.strictEqual(annotations[0].mediaAlt, "Loop diagram");
  assert.strictEqual(annotations[0].mediaIndex, "2");
  assert.strictEqual(plugin.annotationLabel(annotations[0]), "图片想法");
  assert.strictEqual(plugin.typeClass(annotations[0]), "is-image");
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[0], "image"), true);
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[0], "topic"), false);
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[0], "unlocated"), true);
  annotations[0].located = true;
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[0], "unlocated"), false);
}

function testRecordTargetAndHighlight() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  let target = plugin.resolveRecordTarget("thought", "note");
  assert.strictEqual(target.heading, "标注记录");
  assert.strictEqual(target.type, "highlight-with-note");
  target = plugin.resolveRecordTarget("thought", "");
  assert.strictEqual(target.heading, "标注记录");
  assert.strictEqual(target.type, "highlight");
  target = plugin.resolveRecordTarget("topic", "note");
  assert.strictEqual(target.heading, "创作灵感");
  assert.strictEqual(target.type, "topic");
  target = plugin.resolveRecordTarget("fact-check", "note");
  assert.strictEqual(target.heading, "事实待核查");
  assert.strictEqual(target.type, "fact-check");

  const calls = [];
  const editor = {
    replaceRange(text, from, to) {
      calls.push({ text, from, to });
    },
  };
  const range = { from: { line: 1, ch: 2 }, to: { line: 1, ch: 8 } };
  plugin.highlightOriginalSelection(editor, range, "important idea");
  assert.deepStrictEqual(calls[0], {
    text: "==important idea==",
    from: range.from,
    to: range.to,
  });

  const preview = plugin.previewSelectedText("==line one\nline two\nline three\nline four==");
  assert.strictEqual(preview, "line one\nline two\nline three...");

  const markdown = "before\nfirst line\nsecond line\nthird line\nafter";
  const highlighted = plugin.highlightTextInMarkdown(markdown, "first line\nsecond line\nthird line");
  assert.strictEqual(highlighted.changed, true);
  assert.strictEqual(highlighted.text, "before\n==first line\nsecond line\nthird line==\nafter");

  const cleanHighlight = plugin.highlightTextInMarkdown(markdown, "==first line\nsecond line\nthird line==");
  assert.strictEqual(cleanHighlight.changed, true);
  assert.strictEqual(cleanHighlight.text, "before\n==first line\nsecond line\nthird line==\nafter");

  const fullText = "路径一：Human-in-the-loop\n\n通过人类监督 Agent 行为。\n\n路径二：Containment";
  const quote = "路径一：Human-in-the-loop\n\n通过人类监督 Agent 行为。\n\n路径二：Containment";
  assert.strictEqual(plugin.normalizeTextWithMap("  A\n\n  B  ").text, "A B");
  const rawRange = plugin.findQuoteRawRange(fullText, quote);
  assert.strictEqual(rawRange.start, 0);
  assert.strictEqual(rawRange.end, fullText.length);
  assert.strictEqual(plugin.markdownTextForMatch("**第一阶段是学术的 while-loop。** 2022 年的 ReAct"), "第一阶段是学术的 while-loop。 2022 年的 ReAct");
  const markdownQuoteRange = plugin.findQuoteRawRange(
    "第一阶段是学术的 while-loop。 2022 年的 ReAct 论文把它形式化了",
    "**第一阶段是学术的 while-loop。** 2022 年的 ReAct"
  );
  assert.strictEqual(markdownQuoteRange.start, 0);
  assert.strictEqual(markdownQuoteRange.end, "第一阶段是学术的 while-loop。 2022 年的 ReAct".length);
  assert.strictEqual(plugin.trimTextRangeForHighlight("\n\n  ", 0, 4), null);
  const trimmedRange = plugin.trimTextRangeForHighlight("  路径一  ", 0, 6);
  assert.strictEqual(trimmedRange.from, 2);
  assert.strictEqual(trimmedRange.to, 5);

  const quotes = plugin.extractQuotesFromReadingNote(`## 标注记录

### ann_1

> first quote
> second line

我的想法：
note

## 可写选题

### ann_2

> ==topic quote==
`);
  assert.strictEqual(quotes.length, 2);
  assert.strictEqual(quotes[0], "first quote\nsecond line");
  assert.strictEqual(quotes[1], "topic quote");

  const annotations = plugin.parseAnnotationsFromReadingNote(`## 标注记录

### ann_1

- time: 2026-06-10T14:53:39+08:00
- capture_source: obsidian-plugin
- type: highlight-with-note
- quote_hash: q_1234
- confidence: high

> first quote
> second line

我的想法：
note one

## 可写选题

### ann_2

- time: 2026-06-10T15:00:00+08:00
- type: topic

我的想法：
topic idea
`);
  assert.strictEqual(annotations.length, 2);
  assert.strictEqual(annotations[0].id, "ann_1");
  assert.strictEqual(annotations[0].section, "标注记录");
  assert.strictEqual(annotations[0].type, "highlight-with-note");
  assert.strictEqual(annotations[0].quote, "first quote\nsecond line");
  assert.strictEqual(annotations[0].note, "note one");
  assert.strictEqual(plugin.annotationLabel(annotations[0]), "标注想法");
  assert.strictEqual(plugin.typeClass(annotations[1]), "is-topic");
  assert.strictEqual(plugin.annotationLabel(annotations[1]), "创作灵感");
  assert.strictEqual(plugin.shortTime(annotations[1].time), "15:00");
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[0], "thought"), true);
  assert.strictEqual(plugin.annotationMatchesFilter(annotations[1], "topic"), true);
}

async function testArticleLibraryGrouping() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
    articleLibraryRoots: "Learning/web/x_articles\nLearning/research",
    articleLibraryExcludeRoots: "Learning/reading-notes\n.obsidian",
  };

  const enriched = makeFile("Learning/web/x_articles/20260608_loop/article_zh_enriched.md", "# Loop Enriched\n\nThis is the enriched Chinese version.");
  const original = makeFile("Learning/web/x_articles/20260608_loop/article.md", "# Loop Original\n\nOriginal version.");
  const pdf = makeFile("Learning/web/x_articles/20260608_loop/article_zh_enriched.pdf", "");
  const single = makeFile("Learning/research/20260609_single_note.md", "# Single Note\n\nA standalone research article.");
  const nestedSingle = makeFile("Learning/research/single-folder/only.md", "# Nested Single\n\nA standalone article inside a folder.");
  const firstTopic = makeFile("Learning/research/mixed-topics/first-topic.md", "# First Topic\n\nThis is the first independent article.");
  const secondTopic = makeFile("Learning/research/mixed-topics/second-topic.md", "# Second Topic\n\nThis is the second independent article.");
  const secondTopicPdf = makeFile("Learning/research/mixed-topics/second-topic.pdf", "");
  const digest = makeFile("Learning/web/x_articles/digest/digest_20260308_185542.md", "# X 博主最新动态\n\nDigest should not be treated as an article.");
  files.set(enriched.path, { file: enriched, content: "# Loop Enriched\n\nThis is the enriched Chinese version." });
  files.set(original.path, { file: original, content: "# Loop Original\n\nOriginal version." });
  files.set(pdf.path, { file: pdf, content: "" });
  files.set(single.path, { file: single, content: "# Single Note\n\nA standalone research article." });
  files.set(nestedSingle.path, { file: nestedSingle, content: "# Nested Single\n\nA standalone article inside a folder." });
  files.set(firstTopic.path, { file: firstTopic, content: "# First Topic\n\nThis is the first independent article." });
  files.set(secondTopic.path, { file: secondTopic, content: "# Second Topic\n\nThis is the second independent article." });
  files.set(secondTopicPdf.path, { file: secondTopicPdf, content: "" });
  files.set(digest.path, { file: digest, content: "# X 博主最新动态\n\nDigest should not be treated as an article." });

  const directoryInfo = plugin.resolveArticleGroupPath(enriched.path, plugin.getArticleLibraryRoots());
  assert.strictEqual(directoryInfo.groupType, "directory");
  assert.strictEqual(directoryInfo.groupPath, "Learning/web/x_articles/20260608_loop");

  const singleInfo = plugin.resolveArticleGroupPath(single.path, plugin.getArticleLibraryRoots());
  assert.strictEqual(singleInfo.groupType, "single-file");
  assert.strictEqual(singleInfo.groupPath, single.path);

  assert.strictEqual(plugin.articleVersionRank("article_zh_enriched.md"), 1);
  assert.strictEqual(plugin.articleVersionRank("article_zh.md"), 3);
  assert.strictEqual(plugin.articleVersionRank("article.md"), 6);
  assert.strictEqual(plugin.articleVersionLabel("article_zh_enriched.md"), "扩展版");
  assert.strictEqual(plugin.articleVersionLabel("article_zh.md"), "中文版");
  assert.strictEqual(plugin.articleVersionLabel("article.md"), "原文");
  assert.strictEqual(plugin.articleVersionLabel("article_zh_enriched.pdf"), "扩展 PDF");
  assert.strictEqual(plugin.articleVersionLabel("article_zh.pdf"), "中文 PDF");
  assert.strictEqual(plugin.articleVersionLabel("article.pdf"), "原文 PDF");

  const groups = await plugin.buildArticleLibraryGroups();
  const directoryGroup = groups.find((group) => group.groupPath === "Learning/web/x_articles/20260608_loop");
  const singleGroup = groups.find((group) => group.groupPath === single.path);
  const nestedSingleGroup = groups.find((group) => group.groupPath === nestedSingle.path);
  const firstTopicGroup = groups.find((group) => group.groupPath === firstTopic.path);
  const secondTopicGroup = groups.find((group) => group.groupPath === secondTopic.path);
  assert.ok(directoryGroup, "directory article group should be present");
  assert.ok(singleGroup, "single-file article group should be present");
  assert.ok(nestedSingleGroup, "nested single-file article group should be present");
  assert.ok(firstTopicGroup, "different-topic markdown files should not be merged by directory");
  assert.ok(secondTopicGroup, "different-topic markdown files should not be merged by directory");
  assert.strictEqual(directoryGroup.bestVersion.path, enriched.path);
  assert.strictEqual(directoryGroup.versions.some((version) => version.kind === "pdf"), true);
  assert.strictEqual(singleGroup.groupType, "single-file");
  assert.strictEqual(nestedSingleGroup.groupType, "single-file");
  assert.strictEqual(firstTopicGroup.files.length, 1);
  assert.strictEqual(firstTopicGroup.files[0].path, firstTopic.path);
  assert.strictEqual(secondTopicGroup.files.length, 2);
  assert.strictEqual(secondTopicGroup.files.some((file) => file.path === secondTopic.path), true);
  assert.strictEqual(secondTopicGroup.files.some((file) => file.path === secondTopicPdf.path), true);
  assert.strictEqual(groups.some((group) => group.groupPath === "Learning/web/x_articles/digest"), false);
}

async function testArticleLibraryFiltersAndSortsForResearchWorkflow() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = {
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-library"]({});
  view.groups = [
    {
      id: "a",
      title: "Alpha",
      snippet: "",
      groupPath: "Articles/alpha",
      sourceLabel: "articles",
      mtime: 100,
      files: [makeFile("Articles/alpha/article_zh.md"), makeFile("Articles/alpha/article_zh.pdf")],
      versions: [
        { label: "中文版", kind: "markdown", path: "Articles/alpha/article_zh.md" },
        { label: "中文 PDF", kind: "pdf", path: "Articles/alpha/article_zh.pdf" },
      ],
      stats: { annotationCount: 2, topicCount: 0, factCount: 0, hasReading: true, lastReadTime: 40 },
    },
    {
      id: "b",
      title: "Beta",
      snippet: "",
      groupPath: "Articles/beta",
      sourceLabel: "articles",
      mtime: 300,
      files: [makeFile("Articles/beta/article.md")],
      versions: [{ label: "原文", kind: "markdown", path: "Articles/beta/article.md" }],
      stats: { annotationCount: 0, topicCount: 0, factCount: 0, hasReading: false, lastReadTime: 0 },
    },
    {
      id: "c",
      title: "Gamma",
      snippet: "",
      groupPath: "Research/gamma",
      sourceLabel: "research",
      mtime: 200,
      files: [makeFile("Research/gamma/article.md"), makeFile("Research/gamma/article.pdf"), makeFile("Research/gamma/notes.md")],
      versions: [
        { label: "原文", kind: "markdown", path: "Research/gamma/article.md" },
        { label: "原文 PDF", kind: "pdf", path: "Research/gamma/article.pdf" },
      ],
      stats: { annotationCount: 0, topicCount: 1, factCount: 0, hasReading: true, lastReadTime: 80 },
    },
  ];

  view.stateFilter = "unannotated";
  assert.deepStrictEqual(view.visibleGroups().map((group) => group.id), ["b", "c"]);

  view.stateFilter = "has-pdf";
  assert.deepStrictEqual(view.visibleGroups().map((group) => group.id), ["c", "a"]);

  view.stateFilter = "has-zh";
  assert.deepStrictEqual(view.visibleGroups().map((group) => group.id), ["a"]);

  view.stateFilter = "all";
  view.sortMode = "files-desc";
  assert.deepStrictEqual(view.visibleGroups().map((group) => group.id), ["c", "a", "b"]);

  const stateCounts = Object.fromEntries(view.stateOptions().map(([value, label, count]) => [value, { label, count }]));
  assert.strictEqual(stateCounts.all.count, 3);
  assert.strictEqual(stateCounts.annotated.count, 1);
  assert.strictEqual(stateCounts.unannotated.count, 2);
  assert.strictEqual(stateCounts["has-pdf"].count, 2);
  assert.strictEqual(stateCounts["has-zh"].count, 1);

  view.groups[0].stats.status = "reading";
  view.groups[1].stats.status = "unread";
  view.groups[2].stats.status = "annotated";
  view.groups[2].stats.codexStatus = "pending_summary";
  const progressCounts = Object.fromEntries(view.progressOptions().map(([value, label, count]) => [value, { label, count }]));
  assert.strictEqual(progressCounts.all.count, 3);
  assert.strictEqual(progressCounts.reading.count, 0);
  assert.strictEqual(progressCounts.annotated.count, 1);
  assert.strictEqual(progressCounts.unread.count, 1);
  assert.strictEqual(progressCounts["pending-summary"].count, 1);
  assert.strictEqual(progressCounts["writing-ready"], undefined);

  view.progressFilter = "pending-summary";
  assert.deepStrictEqual(view.visibleGroups().map((group) => group.id), ["c"]);
}

async function testArticleLibraryTopBarOpensCreativeIdeas() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = {
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  let openedTopicPool = false;
  let openedCreationProjects = false;
  plugin.openTopicPool = async () => {
    openedTopicPool = true;
  };
  plugin.openCreationProjects = async () => {
    openedCreationProjects = true;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-library"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  view.groups = [];
  await view.render();

  const buttons = [];
  const visit = (node) => {
    if (node.tag === "button") buttons.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(view.containerEl.children[1]);

  const topicButton = buttons.find((button) => button.text === "创作灵感");
  assert.ok(topicButton, "article library top bar should include creative ideas entry");
  assert.strictEqual(typeof topicButton.listeners.click, "function");
  await topicButton.listeners.click();
  assert.strictEqual(openedTopicPool, true);

  const creationButton = buttons.find((button) => button.text === "创作项目");
  assert.ok(creationButton, "article library top bar should include creation projects entry");
  assert.strictEqual(typeof creationButton.listeners.click, "function");
  await creationButton.listeners.click();
  assert.strictEqual(openedCreationProjects, true);
}

async function testArticleLibraryUsesCacheUntilSourceFilesChange() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
    articleLibraryRoots: "Learning/web/x_articles",
    articleLibraryExcludeRoots: "Learning/reading-notes\n.obsidian",
  };
  plugin.articleLibraryCache = { version: 1, groups: {} };
  plugin.saveSettings = async () => {};

  const article = makeFile("Learning/web/x_articles/20260703_cached/article_zh.md", "# Cached Title\n\nThis cached article summary should only be read once.");
  files.set(article.path, { file: article, content: "# Cached Title\n\nThis cached article summary should only be read once." });

  let sourceReadCount = 0;
  const originalReadText = plugin.readText.bind(plugin);
  plugin.readText = async (filePath) => {
    if (filePath === article.path) sourceReadCount += 1;
    return originalReadText(filePath);
  };

  const first = await plugin.buildArticleLibraryGroups();
  const second = await plugin.buildArticleLibraryGroups();
  const cachedGroup = second.find((group) => group.groupPath === article.path);

  assert.ok(first.find((group) => group.groupPath === article.path));
  assert.strictEqual(cachedGroup.title, "Cached Title");
  assert.strictEqual(sourceReadCount, 1);

  article.stat.mtime += 1;
  files.get(article.path).content = "# Fresh Title\n\nThis changed article should invalidate the cache.";
  const refreshed = await plugin.buildArticleLibraryGroups();
  const refreshedGroup = refreshed.find((group) => group.groupPath === article.path);

  assert.strictEqual(refreshedGroup.title, "Fresh Title");
  assert.strictEqual(sourceReadCount, 2);
}

async function testArticleLibrarySnapshotPersistsForFastInitialRender() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
    articleLibraryRoots: "Learning/web/x_articles",
    articleLibraryExcludeRoots: "Learning/reading-notes\n.obsidian",
  };
  plugin.articleLibraryCache = { version: 1, groups: {} };

  const article = makeFile("Learning/web/x_articles/20260703_snapshot/article_zh.md", "# Snapshot Title\n\nThis snapshot should be available before a fresh scan finishes.");
  files.set(article.path, { file: article, content: "# Snapshot Title\n\nThis snapshot should be available before a fresh scan finishes." });

  await plugin.buildArticleLibraryGroups();

  const snapshot = plugin.getArticleLibrarySnapshot();
  const snapshotGroup = snapshot.find((group) => group.groupPath === article.path);
  assert.ok(snapshotGroup, "article library snapshot should include built groups");
  assert.strictEqual(snapshotGroup.title, "Snapshot Title");
  assert.strictEqual(snapshotGroup.files[0].path, article.path);
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(snapshot))), JSON.stringify(snapshot));

  const restored = new PluginClass();
  restored.loadData = async () => plugin.savedData;
  await restored.loadSettings();

  const restoredGroup = restored.getArticleLibrarySnapshot().find((group) => group.groupPath === article.path);
  assert.ok(restoredGroup, "saved article library snapshot should be restored on load");
  assert.strictEqual(restoredGroup.title, "Snapshot Title");
}

async function testTopicPoolCollectsWritableTopicsFromReadingNotes() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files, sourceFile } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  const notePath = "Learning/reading-notes/2026/06/example.md";
  const noteMarkdown = `---
type: reading-note
source_vault_path: "${sourceFile.path}"
source_title: "Example Article"
status: reading
codex_status: pending_summary
updated: "2026-06-10T00:00:00+08:00"
---

# 阅读记录：Example Article

## 标注记录

### ann_normal

- time: 2026-06-10T12:00:00+08:00
- type: highlight-with-note

我的想法：
normal note

## 可写选题

### ann_topic

- time: 2026-06-10T13:00:00+08:00
- type: topic

> source quote

我的想法：
topic idea
`;
  files.set(notePath, { file: makeFile(notePath, noteMarkdown), content: noteMarkdown });
  const index = core.createEmptyIndex(fixedNow);
  index.sources[sourceFile.path] = {
    source_vault_path: sourceFile.path,
    source_title: "Example Article",
    reading_note_path: notePath,
    annotation_count: 2,
    status: "reading",
    codex_status: "pending_summary",
    updated: fixedNow,
  };
  files.set(plugin.indexPath(), { file: makeFile(plugin.indexPath(), JSON.stringify(index)), content: `${JSON.stringify(index, null, 2)}\n` });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 1);
  assert.strictEqual(topics[0].id, `${notePath}#ann_topic`);
  assert.strictEqual(topics[0].sourceTitle, "Example Article");
  assert.strictEqual(topics[0].sourcePath, sourceFile.path);
  assert.strictEqual(topics[0].readingNotePath, notePath);
  assert.strictEqual(topics[0].note, "topic idea");
  assert.strictEqual(topics[0].quote, "source quote");
}

async function testTopicPoolCombinesManualIdeasWithTopicMinerCandidatesAndFeedback() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files, sourceFile } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  const notePath = "Learning/reading-notes/2026/06/example.md";
  const noteMarkdown = `---
type: reading-note
source_vault_path: "${sourceFile.path}"
source_title: "Example Article"
---

# 阅读记录：Example Article

## 创作灵感

### ann_topic

- time: 2026-06-10T13:00:00+08:00
- type: topic

> source quote

我的想法：
manual idea
`;
  files.set(notePath, { file: makeFile(notePath, noteMarkdown), content: noteMarkdown });
  const index = core.createEmptyIndex(fixedNow);
  index.sources[sourceFile.path] = {
    source_vault_path: sourceFile.path,
    source_title: "Example Article",
    reading_note_path: notePath,
    annotation_count: 1,
    status: "reading",
    codex_status: "pending_summary",
    updated: fixedNow,
  };
  files.set(plugin.indexPath(), { file: makeFile(plugin.indexPath(), JSON.stringify(index)), content: `${JSON.stringify(index, null, 2)}\n` });

  const reportPath = "Learning/reading-notes/topic-miner/reports/2026-07-07.md";
  const reportMarkdown = `# AI 选题候选 - 2026-07-07

## 强推荐

### 1. OpenAI 作为负面 AI 转型案例是否值得写？

反馈：待定

来源类型：反面案例\\
适配度：9/10\\
新鲜度：8/10\\
可写性：8/10\\
时机判断：现在可写\\
重复风险：低，和旧文角度不同

核心判断：\\
可以写成一个组织转型失败的反面案例。

为什么现在值得写：\\
最近保存材料足够，而且和 AI 组织变化有关。

素材来源：
- Learning/web/articles/ai-transformation-case

与已发布内容关系：\\
不是重复，是延展。

第一动作：\\
先补充 OpenAI 和 Anthropic 的对比。
`;
  files.set(reportPath, { file: makeFile(reportPath, reportMarkdown), content: reportMarkdown });
  const feedbackPath = "Learning/reading-notes/topic-miner/feedback.jsonl";
  files.set(feedbackPath, {
    file: makeFile(feedbackPath, ""),
    content: `${JSON.stringify({
      candidateId: "2026-07-07-strong-01",
      title: "OpenAI 作为负面 AI 转型案例是否值得写？",
      feedback: "想写",
      note: "我想把它写成反面案例，继续找组织转型材料。",
      source: "reading-capture-plugin",
      reportDate: "2026-07-07",
      updatedAt: "2026-07-07T10:30:00+08:00",
    })}\n${JSON.stringify({
      candidateId: `${notePath}#ann_topic`,
      title: "manual idea",
      feedback: "暂存",
      note: "这个人工灵感还需要再补一篇关联文章。",
      source: "reading-capture-plugin",
      kind: "manual",
      reportDate: "",
      sourcePath: sourceFile.path,
      readingNotePath: notePath,
      updatedAt: "2026-07-07T10:35:00+08:00",
    })}\n`,
  });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 2);
  const aiTopic = topics.find((item) => item.kind === "ai");
  const manualTopic = topics.find((item) => item.kind === "manual");
  assert.ok(aiTopic, "Topic Miner candidate should be included");
  assert.ok(manualTopic, "manual creative idea should still be included");
  assert.strictEqual(aiTopic.id, "2026-07-07-strong-01");
  assert.strictEqual(aiTopic.feedback, "想写");
  assert.strictEqual(aiTopic.feedbackNote, "我想把它写成反面案例，继续找组织转型材料。");
  assert.strictEqual(aiTopic.sourceType, "反面案例");
  assert.strictEqual(aiTopic.duplicationRisk, "低，和旧文角度不同");
  assert.strictEqual(aiTopic.judgment, "可以写成一个组织转型失败的反面案例。");
  assert.strictEqual(aiTopic.firstAction, "先补充 OpenAI 和 Anthropic 的对比。");
  assert.strictEqual(manualTopic.kind, "manual");
  assert.strictEqual(manualTopic.note, "manual idea");
  assert.strictEqual(manualTopic.id, `${notePath}#ann_topic`);
  assert.strictEqual(manualTopic.feedback, "暂存");
  assert.strictEqual(manualTopic.feedbackNote, "这个人工灵感还需要再补一篇关联文章。");
}

async function testTopicPoolFindsTopicMinerReportsFromAdapterWhenVaultIndexIsStale() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };
  app.vault.getMarkdownFiles = () => [];

  const reportPath = "Learning/reading-notes/topic-miner/reports/2026-07-07.md";
  const reportMarkdown = `# AI 选题候选 - 2026-07-07

## 强推荐

### 1. 外部脚本生成的报告也应该被插件看到

反馈：待定
来源类型：探索发现
适配度：高
新鲜度：高
可写性：高
时机判断：现在可写
重复风险：低
选题成立度：D3

核心判断：
报告文件可能已经落盘，但 Obsidian 文件索引还没来得及刷新。

素材来源：
- Learning/web/articles/example

第一动作：
直接从底层目录扫描兜底。
`;
  files.set(reportPath, { file: makeFile(reportPath, reportMarkdown), content: reportMarkdown });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 1);
  assert.strictEqual(topics[0].kind, "ai");
  assert.strictEqual(topics[0].title, "外部脚本生成的报告也应该被插件看到");
  assert.strictEqual(topics[0].reportPath, reportPath);
}

async function testTopicPoolPrefersTopicMinerProjectionJsonWhenAvailable() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };

  files.set("Learning/reading-notes/topic-miner/current.json", {
    file: makeFile("Learning/reading-notes/topic-miner/current.json", ""),
    content: `${JSON.stringify({
      schemaVersion: 1,
      latestReportDate: "2026-07-09",
      reportPath: "Learning/reading-notes/topic-miner/reports/2026-07-09.md",
      viewPath: "Learning/reading-notes/topic-miner/candidates.view.json",
    }, null, 2)}\n`,
  });
  files.set("Learning/reading-notes/topic-miner/candidates.view.json", {
    file: makeFile("Learning/reading-notes/topic-miner/candidates.view.json", ""),
    content: `${JSON.stringify({
      schemaVersion: 1,
      reportDate: "2026-07-09",
      sortMode: "recommended",
      items: [
        {
          candidateId: "tm_20260709_meta_90days",
          title: "如果你的公司在做 AI 化，先看完 Meta 这 90 天",
          summary: "这个题适合做成面向企业客户的反面教材。",
          source: "AI 推荐",
          sourceType: "反面案例",
          feedback: "想写",
          feedbackNote: "补一组组织转型材料。",
          duplicateRisk: "中",
          timing: "先补材料",
          firstAction: "先列出 Meta 的时间线。",
          growth: {
            contentRole: "专业定位型",
            targetAction: "收藏",
            platformFit: ["wechat", "xiaohongshu"],
            seriesRelation: "AI 转型案例",
            accountPromise: "持续拆解 AI 落地中的真实案例",
            growthHypothesis: "真实案例比抽象判断更适合建立定位",
          },
          sourcePaths: ["Learning/web/articles/meta-90-days/article_zh.md"],
          sourceLabels: ["Meta 工程组织解构"],
          updatedAt: "2026-07-09",
        },
      ],
    }, null, 2)}\n`,
  });
  files.set("Learning/reading-notes/topic-miner/reports/2026-07-08.md", {
    file: makeFile("Learning/reading-notes/topic-miner/reports/2026-07-08.md", ""),
    content: `# AI 选题候选 - 2026-07-08

## 强推荐

### 1. 旧 Markdown 报告里的候选

反馈：待定
`,
  });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 1);
  assert.strictEqual(topics[0].id, "tm_20260709_meta_90days");
  assert.strictEqual(topics[0].kind, "ai");
  assert.strictEqual(topics[0].originLabel, "AI 推荐");
  assert.strictEqual(topics[0].reportDate, "2026-07-09");
  assert.strictEqual(topics[0].reportPath, "Learning/reading-notes/topic-miner/reports/2026-07-09.md");
  assert.strictEqual(topics[0].title, "如果你的公司在做 AI 化，先看完 Meta 这 90 天");
  assert.strictEqual(topics[0].judgment, "这个题适合做成面向企业客户的反面教材。");
  assert.strictEqual(topics[0].sourceType, "反面案例");
  assert.strictEqual(topics[0].duplicationRisk, "中");
  assert.strictEqual(topics[0].timing, "先补材料");
  assert.strictEqual(topics[0].firstAction, "先列出 Meta 的时间线。");
  assert.deepStrictEqual(topics[0].sources, ["Learning/web/articles/meta-90-days/article_zh.md"]);
  assert.strictEqual(topics[0].sourcePath, "Learning/web/articles/meta-90-days/article_zh.md");
  assert.strictEqual(topics[0].sourceTitle, "Meta 工程组织解构");
  assert.strictEqual(topics[0].feedback, "想写");
  assert.strictEqual(topics[0].feedbackNote, "补一组组织转型材料。");
  assert.strictEqual(topics[0].growth.contentRole, "专业定位型");
  assert.strictEqual(topics[0].growth.targetAction, "收藏");
  assert.deepStrictEqual([...topics[0].growth.platformFit], ["wechat", "xiaohongshu"]);
  assert.strictEqual(topics[0].growth.seriesRelation, "AI 转型案例");
  assert.strictEqual(topics[0].growth.accountPromise, "持续拆解 AI 落地中的真实案例");
  assert.strictEqual(topics[0].growth.growthHypothesis, "真实案例比抽象判断更适合建立定位");
}

function testTopicMinerReportParsesBulletedSourceSection() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const candidates = plugin.parseTopicMinerReport(`## 主选候选

### 1. AI Agent 上线前，至少要做哪五项风险评估

- 反馈：待定
- 核心判断：先定义风险边界。
- 素材来源：
- Learning/reading-notes/2026/07/agent-risk.md
- Learning/web/articles/agent-risk/article_zh.md
- 第一动作：整理成风险评估清单。
`, "Learning/reading-notes/topic-miner/reports/2026-07-19.md");

  assert.strictEqual(candidates.length, 1);
  assert.deepStrictEqual([...candidates[0].sources], [
    "Learning/reading-notes/2026/07/agent-risk.md",
    "Learning/web/articles/agent-risk/article_zh.md",
  ]);
  assert.strictEqual(candidates[0].firstAction, "整理成风险评估清单。");
}

async function testTopicPoolAiCandidatesPreferLatestReportOverFeedbackTime() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };

  const oldReportPath = "Learning/reading-notes/topic-miner/reports/2026-07-05.md";
  const newReportPath = "Learning/reading-notes/topic-miner/reports/2026-07-07.md";
  files.set(oldReportPath, {
    file: makeFile(oldReportPath, ""),
    content: `# AI 选题候选 - 2026-07-05

## 强推荐

### 1. 旧报告里刚反馈过的选题

反馈：待定
核心判断：
这条不应该因为反馈时间更新而压过新报告。
`,
  });
  files.set(newReportPath, {
    file: makeFile(newReportPath, ""),
    content: `# AI 选题候选 - 2026-07-07

## 强推荐

### 1. 今天报告里的选题

反馈：待定
核心判断：
刷新后应该优先看到最新报告里的选题。
`,
  });
  files.set("Learning/reading-notes/topic-miner/feedback.jsonl", {
    file: makeFile("Learning/reading-notes/topic-miner/feedback.jsonl", ""),
    content: `${JSON.stringify({
      candidateId: "2026-07-05-strong-01",
      title: "旧报告里刚反馈过的选题",
      feedback: "想写",
      note: "",
      source: "reading-capture-plugin",
      reportDate: "2026-07-05",
      updatedAt: "2026-07-07T23:30:00+08:00",
    })}\n`,
  });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 2);
  assert.strictEqual(topics[0].title, "今天报告里的选题");
  assert.strictEqual(topics[0].reportDate, "2026-07-07");
  assert.strictEqual(topics[1].title, "旧报告里刚反馈过的选题");
}

async function testTopicPoolSortsByContentDateNotFeedbackTime() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    readingRoot: "Learning/reading-notes",
    openNoteAfterCapture: false,
  };

  const oldSourcePath = "Learning/web/articles/2026-07-03_old-manual-topic/article_zh.md";
  const oldNotePath = "Learning/reading-notes/2026/07/20260703_old-manual-topic.md";
  files.set(oldSourcePath, { file: makeFile(oldSourcePath, "# Old"), content: "# Old" });
  const oldNoteMarkdown = `---
type: reading-note
source_vault_path: "${oldSourcePath}"
source_title: "Old Manual Topic"
---

# 阅读记录：Old Manual Topic

## 创作灵感

### ann_topic

- time: 2026-07-08T21:00:00+08:00
- type: topic

> old quote

我的想法：
旧文章里最近反馈过的人工灵感
`;
  files.set(oldNotePath, { file: makeFile(oldNotePath, oldNoteMarkdown), content: oldNoteMarkdown });

  const index = core.createEmptyIndex(fixedNow);
  index.sources[oldSourcePath] = {
    source_vault_path: oldSourcePath,
    source_title: "Old Manual Topic",
    reading_note_path: oldNotePath,
    annotation_count: 1,
    updated: "2026-07-08T21:00:00+08:00",
  };
  files.set(plugin.indexPath(), { file: makeFile(plugin.indexPath(), JSON.stringify(index)), content: `${JSON.stringify(index, null, 2)}\n` });

  const reportPath = "Learning/reading-notes/topic-miner/reports/2026-07-07.md";
  files.set(reportPath, {
    file: makeFile(reportPath, ""),
    content: `# AI 选题候选 - 2026-07-07

## 强推荐

### 1. 今天报告里的 AI 推荐

反馈：待定
核心判断：
这条应该排在旧内容前面。
`,
  });
  files.set("Learning/reading-notes/topic-miner/feedback.jsonl", {
    file: makeFile("Learning/reading-notes/topic-miner/feedback.jsonl", ""),
    content: `${JSON.stringify({
      candidateId: `${oldNotePath}#ann_topic`,
      title: "旧文章里最近反馈过的人工灵感",
      feedback: "已写",
      source: "reading-capture-plugin",
      kind: "manual",
      sourcePath: oldSourcePath,
      readingNotePath: oldNotePath,
      updatedAt: "2026-07-08T22:00:00+08:00",
    })}\n`,
  });

  const topics = await plugin.buildTopicPoolItems();

  assert.strictEqual(topics.length, 2);
  assert.strictEqual(topics[0].title, "今天报告里的 AI 推荐");
  assert.strictEqual(topics[0].sortDate, "2026-07-07");
  assert.strictEqual(topics[1].note, "旧文章里最近反馈过的人工灵感");
  assert.strictEqual(topics[1].sortDate, "2026-07-03");
}

async function testTopicMinerFeedbackIsAppendedAsJsonl() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.now = () => "2026-07-07T10:30:00+08:00";

  await plugin.saveTopicMinerFeedback(
    {
      id: "2026-07-07-strong-01",
      title: "OpenAI 作为负面 AI 转型案例是否值得写？",
      reportDate: "2026-07-07",
    },
    "想写",
    "我想把它写成反面案例。"
  );

  const feedbackPath = "Learning/reading-notes/topic-miner/feedback.jsonl";
  assert.ok(files.has(feedbackPath), "feedback.jsonl should be created");
  const lines = files.get(feedbackPath).content.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(JSON.parse(lines[0]), {
    candidateId: "2026-07-07-strong-01",
    title: "OpenAI 作为负面 AI 转型案例是否值得写？",
    feedback: "想写",
    note: "我想把它写成反面案例。",
    source: "reading-capture-plugin",
    kind: "ai",
    reportDate: "2026-07-07",
    updatedAt: "2026-07-07T10:30:00+08:00",
  });
}

async function testManualTopicFeedbackIsSavedWithSourceContext() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.now = () => "2026-07-07T10:40:00+08:00";

  await plugin.saveTopicMinerFeedback(
    {
      id: "Learning/reading-notes/2026/06/example.md#ann_topic",
      kind: "manual",
      note: "manual idea",
      sourcePath: "Learning/web/articles/example/article.md",
      readingNotePath: "Learning/reading-notes/2026/06/example.md",
    },
    "想写",
    "这条人工灵感可以延展成一个工作流案例。"
  );

  const feedbackPath = "Learning/reading-notes/topic-miner/feedback.jsonl";
  const lines = files.get(feedbackPath).content.trim().split(/\r?\n/);
  assert.deepStrictEqual(JSON.parse(lines[0]), {
    candidateId: "Learning/reading-notes/2026/06/example.md#ann_topic",
    title: "manual idea",
    feedback: "想写",
    note: "这条人工灵感可以延展成一个工作流案例。",
    source: "reading-capture-plugin",
    kind: "manual",
    reportDate: "",
    sourcePath: "Learning/web/articles/example/article.md",
    readingNotePath: "Learning/reading-notes/2026/06/example.md",
    updatedAt: "2026-07-07T10:40:00+08:00",
  });
}

async function testTopicPoolViewShowsDecisionWorkspaceControls() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  let buildCalls = 0;
  plugin.buildTopicPoolItems = async () => {
    buildCalls += 1;
    return [
      {
        id: "Learning/reading-notes/2026/06/example.md#ann_topic",
        kind: "manual",
        originLabel: "人工灵感",
        sourcePath: "Learning/web/articles/example/article.md",
        readingNotePath: "Learning/reading-notes/2026/06/example.md",
        note: "manual idea",
        feedback: "待定",
      },
    ];
  };
  plugin.loadData = async () => null;
  let openedCreationProjects = false;
  plugin.openCreationProjects = async () => {
    openedCreationProjects = true;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("回到知见录"), "topic pool should keep a back-to-library button");
  assert.ok(texts.includes("打开今日报告"), "topic pool should expose the latest report");
  assert.ok(texts.includes("创作项目"), "topic pool should expose a direct creation project entry");
  assert.ok(texts.includes("状态"), "topic pool should label feedback filters as status");
  assert.ok(texts.includes("保存给 AI"), "manual creative ideas should also be saved as feedback for Topic Miner");
  assert.ok(texts.includes("开始创作"), "creative ideas should expose the creation-project entry point");
  assert.ok(texts.includes("补充备注不是必填。没有额外想法时，只选状态并保存也可以。"));

  const buttons = [];
  const visit = (node) => {
    if (node.tag === "button") buttons.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(view.containerEl.children[1]);
  const saveButton = buttons.find((button) => button.text === "保存给 AI");
  assert.ok(saveButton, "topic pool should render a save button");
  assert.ok(saveButton.classes.has("reading-capture-topic-save-button"), "save button should use the plugin green primary style");
  const refreshButton = buttons.find((button) => button.text === "刷新");
  assert.ok(refreshButton, "topic pool should render a refresh button");
  await refreshButton.listeners.click();
  assert.strictEqual(buildCalls, 2, "clicking refresh should reload topic pool items");
  const projectsButton = buttons.find((button) => button.text === "创作项目");
  assert.ok(projectsButton, "topic pool should render a creation project button");
  await projectsButton.listeners.click();
  assert.strictEqual(openedCreationProjects, true, "creation project button should open the project view");
}

async function testTopicPoolSummaryUsesLatestReportDate() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  plugin.buildTopicPoolItems = async () => [
    {
      id: "2026-07-05-strong-01",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-05",
      title: "旧报告里刚反馈过的选题",
      judgment: "旧报告判断",
      feedback: "想写",
      updatedAt: "2026-07-07T23:30:00+08:00",
    },
    {
      id: "2026-07-07-strong-01",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "今天报告里的选题",
      judgment: "新报告判断",
      feedback: "待定",
      updatedAt: "2026-07-07",
    },
  ];
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("0 条人工灵感 · 2 条 AI 推荐 · 当前报告 2026-07-07"), "topic pool summary should use the latest report date");
}

async function testTopicPoolWorkflowSortModesAndCollapsedArchiveGroups() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  plugin.buildTopicPoolItems = async () => [
    {
      id: "done-latest",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-10",
      sortDate: "2026-07-10",
      title: "已写的选题",
      judgment: "已写判断",
      feedback: "已写",
      feedbackUpdatedAt: "2026-07-01T10:00:00+08:00",
    },
    {
      id: "rejected-newer",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-09",
      sortDate: "2026-07-09",
      title: "拒绝的选题",
      judgment: "拒绝判断",
      feedback: "不要",
      feedbackUpdatedAt: "2026-07-02T10:00:00+08:00",
    },
    {
      id: "want-write",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-08",
      sortDate: "2026-07-08",
      title: "想写的选题",
      judgment: "想写判断",
      feedback: "想写",
      feedbackUpdatedAt: "2026-07-03T10:00:00+08:00",
    },
    {
      id: "pending",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      sortDate: "2026-07-07",
      title: "待定的选题",
      judgment: "待定判断",
      feedback: "待定",
      feedbackUpdatedAt: "2026-07-04T10:00:00+08:00",
    },
    {
      id: "parked",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-06",
      sortDate: "2026-07-06",
      title: "暂存的选题",
      judgment: "暂存判断",
      feedback: "暂存",
      feedbackUpdatedAt: "2026-07-09T10:00:00+08:00",
    },
  ];
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  assert.deepStrictEqual(Array.from(view.visibleItems(), (item) => item.id), ["pending", "want-write", "parked", "rejected-newer", "done-latest"], "workflow sort should prioritize decision status before content date");
  view.topicSortMode = "content";
  assert.deepStrictEqual(Array.from(view.visibleItems(), (item) => item.id), ["done-latest", "rejected-newer", "want-write", "pending", "parked"], "latest content sort should use content/report date descending");
  view.topicSortMode = "feedback";
  assert.deepStrictEqual(Array.from(view.visibleItems(), (item) => item.id), ["parked", "pending", "want-write", "rejected-newer", "done-latest"], "latest feedback sort should use feedback timestamp descending");

  view.topicSortMode = "workflow";
  await view.render();
  let texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("不要"), "rejected group header should be visible");
  assert.ok(texts.includes("已写"), "done group header should be visible");
  assert.ok(!texts.includes("拒绝的选题"), "rejected topics should be collapsed by default");
  assert.ok(!texts.includes("已写的选题"), "done topics should be collapsed by default");

  const headers = fakeElementsByClass(view.containerEl.children[1], "reading-capture-topic-group-header");
  const rejectedHeader = headers.find((header) => fakeElementTexts(header).includes("不要"));
  assert.ok(rejectedHeader, "rejected group header should be clickable");
  await rejectedHeader.listeners.click();
  texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("拒绝的选题"), "clicking a collapsed archive group should expand it");
}

async function testTopicPoolFeedbackSaveFailureReenablesButton() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  plugin.buildTopicPoolItems = async () => [
    {
      id: "2026-07-07-strong-01",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      reportPath: "Learning/reading-notes/topic-miner/reports/2026-07-07.md",
      title: "OpenAI 作为负面 AI 转型案例是否值得写？",
      judgment: "可以写成一个组织转型失败的反面案例。",
      feedback: "待定",
    },
  ];
  plugin.saveTopicMinerFeedback = async () => {
    throw new Error("disk unavailable");
  };
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const buttons = [];
  const visit = (node) => {
    if (node.tag === "button") buttons.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(view.containerEl.children[1]);
  const saveButton = buttons.find((button) => button.text === "保存给 AI");
  await saveButton.listeners.click();
  assert.strictEqual(saveButton.disabled, false, "save button should recover after a failed save");
}

async function testTopicPoolCardClickUpdatesDetailWithoutRerenderingList() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  plugin.buildTopicPoolItems = async () => [
    {
      id: "topic-a",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "第一个选题",
      judgment: "第一个判断",
      feedback: "待定",
    },
    {
      id: "topic-b",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "第二个选题",
      judgment: "第二个判断",
      feedback: "想写",
    },
  ];
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  let renderCalls = 0;
  view.render = async () => {
    renderCalls += 1;
  };

  const cards = [];
  const visit = (node) => {
    if (node.classes && node.classes.has("reading-capture-topic-card")) cards.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(view.containerEl.children[1]);
  assert.strictEqual(cards.length, 2);
  assert.ok(cards[0].classes.has("is-selected"), "first card should be selected initially");

  await cards[1].listeners.click();

  assert.strictEqual(renderCalls, 0, "selecting a topic card should not rerender the whole list and reset scroll");
  assert.strictEqual(view.selectedId, "topic-b");
  assert.ok(!cards[0].classes.has("is-selected"), "previous card should lose selected state");
  assert.ok(cards[1].classes.has("is-selected"), "clicked card should become selected");
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("第二个判断"), "detail panel should update to the clicked topic");
}

async function testTopicPoolCardClickKeepsRepeatedCandidateIdsVisuallyIndependent() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  plugin.buildTopicPoolItems = async () => [
    { id: "2026-07-19-strong-02", kind: "ai", reportDate: "2026-07-19", title: "第一条重复编号", judgment: "第一个判断", feedback: "想写" },
    { id: "2026-07-19-strong-02", kind: "ai", reportDate: "2026-07-19", title: "第二条重复编号", judgment: "第二个判断", feedback: "想写" },
  ];
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const cards = [];
  const visit = (node) => {
    if (node.classes && node.classes.has("reading-capture-topic-card")) cards.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(view.containerEl.children[1]);
  assert.strictEqual(cards.length, 2);
  assert.ok(cards[0].classes.has("is-selected"), "first repeated id card should be selected initially");
  assert.ok(!cards[1].classes.has("is-selected"), "second repeated id card must remain unselected");

  await cards[1].listeners.click();

  assert.ok(!cards[0].classes.has("is-selected"), "first card should lose selected state after clicking the second");
  assert.ok(cards[1].classes.has("is-selected"), "only the clicked repeated id card should be selected");
  assert.ok(fakeElementTexts(view.containerEl.children[1]).includes("第二个判断"));
}

async function testTopicPoolSavePreservesListScrollPosition() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  let savedFeedback = "待定";
  plugin.buildTopicPoolItems = async () => [
    {
      id: "topic-a",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "第一条选题",
      judgment: "第一条判断",
      feedback: "待定",
    },
    {
      id: "topic-b",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "中部选中的选题",
      judgment: "中部判断",
      feedback: savedFeedback,
    },
    {
      id: "topic-c",
      kind: "ai",
      originLabel: "AI 推荐",
      reportDate: "2026-07-07",
      title: "第三条选题",
      judgment: "第三条判断",
      feedback: "暂存",
    },
  ];
  plugin.saveTopicMinerFeedback = async (_item, feedback) => {
    savedFeedback = feedback;
  };
  plugin.loadData = async () => null;

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const cards = [];
  const findCards = (node) => {
    if (node.classes && node.classes.has("reading-capture-topic-card")) cards.push(node);
    for (const child of node.children || []) findCards(child);
  };
  findCards(view.containerEl.children[1]);
  const targetCard = cards.find((card) => fakeElementTexts(card).includes("中部选中的选题"));
  assert.ok(targetCard, "target topic card should be rendered");
  await targetCard.listeners.click();
  view.topicListEl.scrollTop = 520;

  const buttons = [];
  const findButtons = (node) => {
    if (node.tag === "button") buttons.push(node);
    for (const child of node.children || []) findButtons(child);
  };
  findButtons(view.containerEl.children[1]);
  const saveButton = buttons.find((button) => button.text === "保存给 AI");
  await saveButton.listeners.click();

  assert.strictEqual(view.selectedId, "topic-b", "saving feedback should keep the same topic selected");
  assert.strictEqual(view.topicListEl.scrollTop, 520, "saving feedback should preserve the middle list scroll position");
}

async function testTopicPoolStylesPreventFloatingDetailOverlap() {
  const css = fs.readFileSync(path.join(__dirname, "../plugin/styles.css"), "utf8");
  const rule = (selector) => (css.match(new RegExp(`^\\${selector}\\s*\\{[\\s\\S]*?\\}`, "m")) || [])[0];
  const poolRule = rule(".reading-capture-topic-pool");
  const shellRule = rule(".reading-capture-topic-shell");
  const detailRule = rule(".reading-capture-topic-detail");
  const cardRule = rule(".reading-capture-topic-card");
  const mainRule = rule(".reading-capture-topic-main");
  const listRule = rule(".reading-capture-topic-list");
  const workspaceRule = rule(".reading-capture-topic-workspace");
  const sortSelectRule = rule(".reading-capture-topic-sort-select");
  const groupHeaderRule = rule(".reading-capture-topic-group-header");
  assert.ok(poolRule, "topic pool root style should exist");
  assert.ok(shellRule, "topic shell style should exist");
  assert.ok(detailRule, "topic detail style should exist");
  assert.ok(cardRule, "topic card style should exist");
  assert.ok(mainRule, "topic main style should exist");
  assert.ok(listRule, "topic list style should exist");
  assert.ok(workspaceRule, "topic workspace style should exist");
  assert.ok(/height:\s*100%/.test(poolRule), "topic pool should occupy the view height instead of growing with page content");
  assert.ok(/overflow:\s*hidden/.test(poolRule), "topic pool root should prevent whole-page scrolling");
  assert.ok(/display:\s*flex/.test(shellRule), "topic shell should use a column layout");
  assert.ok(/flex-direction:\s*column/.test(shellRule), "topic shell should keep the header fixed above the workspace");
  assert.ok(/overflow:\s*hidden/.test(workspaceRule), "topic workspace should keep three columns inside the viewport");
  assert.ok(/height:\s*100%/.test(workspaceRule), "topic workspace should take the remaining view height");
  assert.ok(/display:\s*flex/.test(mainRule), "topic main column should keep the list header above the scrolling list");
  assert.ok(/align-content:\s*start/.test(listRule), "topic cards should keep their natural height in the scrolling list");
  assert.ok(/grid-auto-rows:\s*max-content/.test(listRule), "topic list rows should not be compressed to fit the viewport");
  assert.ok(sortSelectRule, "topic sort select style should exist");
  assert.ok(/cursor:\s*pointer/.test(sortSelectRule), "topic sort select should look interactive");
  assert.ok(groupHeaderRule, "topic group header style should exist");
  assert.ok(/cursor:\s*pointer/.test(groupHeaderRule), "topic group headers should be clickable");
  assert.ok(/overflow-y:\s*auto/.test(listRule), "topic list should scroll independently");
  assert.ok(/overflow-y:\s*auto/.test(detailRule), "topic detail column should scroll independently and stay reachable");
  assert.ok(!/position:\s*sticky/.test(detailRule), "topic detail should stay in its grid column instead of floating");
  const toolsButtonRule = rule(".reading-capture-topic-tools button");
  assert.ok(toolsButtonRule, "topic toolbar button style should exist");
  assert.ok(/cursor:\s*pointer/.test(toolsButtonRule), "topic toolbar buttons should show a clickable cursor");
  assert.ok(/overflow:\s*hidden/.test(cardRule), "topic cards should clip long content inside the middle column");
  assert.ok(/minmax\(0,\s*1fr\)/.test(workspaceRule), "middle column should be allowed to shrink without overflowing under the detail column");
}

async function testOpenLibraryVersionUsesReaderForMarkdownAndObsidianForPdf() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  const markdown = makeFile("Articles/alpha/article_zh.md", "# Alpha");
  const pdf = makeFile("Articles/alpha/article_zh.pdf", "");
  files.set(markdown.path, { file: markdown, content: "# Alpha" });
  files.set(pdf.path, { file: pdf, content: "" });
  plugin.app = app;

  let readerPath = "";
  let openedPath = "";
  plugin.openReaderForFile = async (file) => {
    readerPath = file.path;
  };
  plugin.openFile = async (file) => {
    openedPath = file.path;
  };

  await plugin.openLibraryVersion({ kind: "markdown", path: markdown.path });
  await plugin.openLibraryVersion({ kind: "pdf", path: pdf.path });

  assert.strictEqual(readerPath, markdown.path);
  assert.strictEqual(openedPath, pdf.path);
}

async function testTopicPoolOpensBestArticleFromDirectorySource() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  const registeredViews = {};
  const sourceDirectory = "Learning/web/articles/agent-risk";
  const readingNote = makeFile("Learning/reading-notes/2026/07/agent-risk.md", "# Reading note");
  const original = makeFile(`${sourceDirectory}/article.md`, "# Original");
  const enriched = makeFile(`${sourceDirectory}/article_zh_enriched.md`, "# Enriched");
  files.set(readingNote.path, { file: readingNote, content: "# Reading note" });
  files.set(original.path, { file: original, content: "# Original" });
  files.set(enriched.path, { file: enriched, content: "# Enriched" });
  app.workspace.on = () => ({});
  plugin.app = app;
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  await plugin.onload();
  plugin.settings.readingRoot = "Learning/reading-notes";
  const view = registeredViews["reading-capture-topic-pool"]({});
  let openedPath = "";
  plugin.openReaderForFile = async (file) => {
    openedPath = file.path;
  };

  const resolved = plugin.resolveTopicSourceFile(`[[${sourceDirectory}|AI Agent 风险评估]]`);
  assert.strictEqual(resolved.path, enriched.path, "directory sources should resolve to the best Markdown version");
  await view.openItemSource({
    kind: "ai",
    sourcePath: readingNote.path,
    sources: [readingNote.path, sourceDirectory],
  });

  assert.strictEqual(openedPath, enriched.path, "article sources should be preferred over reading-note sources");
}

async function testGenericDefaultSettings() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();

  await plugin.loadSettings();

  assert.strictEqual(plugin.settings.readingRoot, "Reading Capture/notes");
  assert.strictEqual(plugin.settings.articleLibraryRoots, "");
  assert.strictEqual(plugin.settings.creationProjectRoot, "Reading Capture/creation-projects");
  assert.strictEqual(plugin.settings.defaultWritingStyle, "keke");
  assert.strictEqual(plugin.getArticleLibraryRoots().length, 0);
  assert.deepStrictEqual([...plugin.getArticleLibraryExcludeRoots()], ["Reading Capture/notes", ".obsidian"]);
  assert.strictEqual(plugin.articleLibraryEmptyMessage(), "还没有配置知见录扫描目录。请在 Reading Capture 设置里添加保存文章的文件夹。");

  plugin.settings.articleLibraryRoots = "Articles";
  assert.strictEqual(plugin.articleLibraryEmptyMessage(), "没有找到匹配的文章。可以调整搜索词或扫描目录。");
}

async function testCreationProjectCreateAppendAndList() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
  };
  plugin.now = () => fixedNow;

  const primary = {
    id: "2026-07-19-strong-01",
    kind: "ai",
    title: "AI Agent 上线前的五项风险评估",
    judgment: "先建立可观察、可回滚的上线评估清单。",
    sources: ["Learning/web/articles/agent/article_zh.md"],
  };
  const project = await plugin.createCreationProject(primary, { title: primary.title, platform: "wechat" });

  assert.ok(project.path.startsWith("Reading Capture/creation-projects/"));
  assert.ok(files.has(project.path), "project homepage should be created");
  assert.ok(files.has(`${project.directory}/planning/context.md`), "project context should be created");
  assert.ok(files.has(`${project.directory}/planning/master-brief.md`), "project brief placeholder should be created");
  assert.ok(files.has(`${project.directory}/workflow-state.json`), "durable eight-stage workflow state should be created");
  assert.ok(files.has(`${project.directory}/deliverables/wechat/wechat-001/drafts`) === false, "folders should not be represented as files");
  assert.match(files.get(project.path).content, /writing_style: "keke"/);
  assert.match(files.get(`${project.directory}/planning/context.md`).content, /## 主灵感：AI Agent 上线前的五项风险评估/);
  const workflowState = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(workflowState.schemaVersion, 2);
  assert.strictEqual(workflowState.currentStage, "relations");
  assert.strictEqual(workflowState.workflowMode, "idea_creation");
  assert.strictEqual(workflowState.activeDeliverable, "wechat");
  assert.strictEqual(
    [...files.keys()].filter((filePath) => filePath.includes("/_runner/queue/")).length,
    0,
    "project creation must not queue brief or outline work before stage-one review"
  );

  const related = {
    id: "2026-07-19-strong-01",
    kind: "ai",
    title: "AI 系统的可观察性指标",
    judgment: "用任务成功率与返工成本衡量，而不是只看调用量。",
  };
  const firstAppend = await plugin.appendInspirationToCreationProject(related, project.path);
  const secondAppend = await plugin.appendInspirationToCreationProject(related, project.path);
  assert.strictEqual(firstAppend.appended, true);
  assert.strictEqual(secondAppend.appended, false, "adding the same inspiration twice should be idempotent");
  assert.notStrictEqual(plugin.creationInspirationId(primary), plugin.creationInspirationId(related), "different titles must remain distinct even if Topic Miner reuses an id");
  const context = files.get(`${project.directory}/planning/context.md`).content;
  assert.strictEqual((context.match(/## 关联灵感：AI 系统的可观察性指标/g) || []).length, 1);

  files.delete(`${project.directory}/workflow-state.json`);
  const projects = await plugin.listCreationProjects();
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].title, primary.title);
  assert.strictEqual(projects[0].platform, "wechat");
  assert.strictEqual(projects[0].primaryTitle, primary.title);
  assert.deepStrictEqual([...projects[0].relatedTitles], [related.title]);
  assert.ok(files.has(`${project.directory}/workflow-state.json`), "legacy projects should receive durable workflow state on first read");
  assert.strictEqual(projects[0].workflowState.currentStage, "relations");
  assert.strictEqual(projects[0].stageStates.relations, "current");
}

async function testCreationProjectListExcludesRunnerWorkspaceCopies() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "真实项目", kind: "manual" }, { platform: "wechat" });
  const nestedPath = `${project.directory}/runs/task-1_attempt-1/workspace/project.md`;
  await app.vault.create(nestedPath, files.get(project.path).content);

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].path, project.path);
  await assert.rejects(() => plugin.queueCreationStageTask(nestedPath, "brief.master"), /真实创作项目根目录/);
}

async function testConfirmCreationRelationsPersistsDiagnosisStage() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "持久化阶段确认", kind: "manual" }, { platform: "wechat" });

  await plugin.confirmCreationRelations(project.path);

  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(state.currentStage, "diagnosis");
  const listed = await plugin.listCreationProjects();
  assert.strictEqual(listed[0].stageStates.relations, "complete");
  assert.strictEqual(listed[0].stageStates.diagnosis, "current");
  const queued = [...files.entries()].find(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  assert.ok(queued, "entering diagnosis should queue the local diagnosis task");
  assert.strictEqual(JSON.parse(queued[1].content).kind, "diagnosis.materials");
  const stateAfterQueue = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(stateAfterQueue.taskRefs["diagnosis.materials"], queued[0]);
}

async function testCancelledDiagnosisTaskCanBeReturnedToRunnerQueue() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "可恢复诊断", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const taskPath = [...files.keys()].find((filePath) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const pending = JSON.parse(files.get(taskPath).content);
  const cancelled = await plugin.cancelCreationTask({ ...pending, taskPath });
  assert.strictEqual(cancelled.status, "cancelled");

  const restarted = await plugin.retryCreationTask({ ...cancelled, taskPath });

  assert.strictEqual(restarted.status, "pending");
  const persisted = JSON.parse(files.get(taskPath).content);
  assert.strictEqual(persisted.status, "pending");
  assert.strictEqual(persisted.error, "");
  assert.strictEqual(persisted.waitingReason, null);
  assert.strictEqual(persisted.nextAttemptAt, null);
}

async function testCreationCoordinationWritesDoNotDependOnVaultModifyCache() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "持久写入", kind: "manual" }, { platform: "wechat" });
  app.vault.modify = async () => {};

  await plugin.confirmCreationRelations(project.path);

  assert.strictEqual(JSON.parse(files.get(`${project.directory}/workflow-state.json`).content).currentStage, "diagnosis");
  assert.strictEqual(plugin.readFrontmatterValue(files.get(project.path).content, "status"), "material-diagnosis");
}

async function testRunnerTaskStatusBypassesStaleVaultCache() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "外部 Runner 状态同步", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);

  const taskEntry = [...files.entries()].find(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const pendingSnapshot = taskEntry[1].content;
  const completedByRunner = JSON.parse(taskEntry[1].content);
  completedByRunner.status = "awaiting_approval";
  completedByRunner.updatedAt = "2026-06-10T04:00:00.000Z";
  taskEntry[1].content = `${JSON.stringify(completedByRunner, null, 2)}\n`;
  const originalVaultRead = app.vault.read;
  app.vault.read = async (file) => file.path === taskEntry[0] ? pendingSnapshot : originalVaultRead(file);

  const tasks = await plugin.listCreationRunnerTasks();

  assert.strictEqual(tasks[0].status, "awaiting_approval", "runner queue state must be read from disk instead of Obsidian's stale file cache");
}

async function testRunnerTasksFallBackToVaultIndexWhenAdapterListingLags() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "队列索引恢复", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const originalList = app.vault.adapter.list;
  app.vault.adapter.list = async (folderPath) => folderPath.endsWith("/_runner/queue")
    ? { files: [], folders: [] }
    : originalList(folderPath);

  const tasks = await plugin.listCreationRunnerTasks();

  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].kind, "diagnosis.materials");
}

async function testRunnerAcceptsRelativeAdapterListings() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "相对队列路径", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const taskPath = [...files.keys()].find((filePath) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const originalList = app.vault.adapter.list;
  app.vault.adapter.list = async (folderPath) => folderPath.endsWith("/_runner/queue")
    ? { files: [taskPath.split("/").pop()], folders: [] }
    : originalList(folderPath);
  app.vault.getFiles = () => [];

  const tasks = await plugin.listCreationRunnerTasks();

  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].taskPath, taskPath);
}

async function testProjectLoadsTaskFromDurableReferenceWithoutQueueListing() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "持久任务引用", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const originalList = app.vault.adapter.list;
  const originalGetFiles = app.vault.getFiles;
  app.vault.adapter.list = async (folderPath) => folderPath.endsWith("/_runner/queue")
    ? { files: [], folders: [] }
    : originalList(folderPath);
  app.vault.getFiles = () => originalGetFiles().filter((file) => !file.path.includes("/_runner/queue/"));

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects[0].tasks.length, 1);
  assert.strictEqual(projects[0].tasks[0].kind, "diagnosis.materials");
}

async function testCreationProjectVisualFilesUseNaturalFilenameOrder() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "视觉文件排序", kind: "manual" }, { platform: "wechat" });
  const wechatRoot = `${project.directory}/deliverables/wechat/wechat-001/visuals`;
  const xhsRoot = `${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/images`;
  for (const name of ["09-final.png", "02-middle.png", "01-cover.png", "10-extra.png"]) {
    await app.vault.create(`${wechatRoot}/${name}`, name);
  }
  for (const name of ["card-10.png", "card-2.png", "card-1.png"]) {
    await app.vault.create(`${xhsRoot}/${name}`, name);
  }

  const [listed] = await plugin.listCreationProjects();

  assert.deepStrictEqual(Array.from(listed.wechatVisualFiles, (file) => file.name), ["01-cover.png", "02-middle.png", "09-final.png", "10-extra.png"]);
  assert.deepStrictEqual(Array.from(listed.xhsImageFiles, (file) => file.name), ["card-1.png", "card-2.png", "card-10.png"]);
}

async function testProjectRecoversTaskReferenceFromRunHistory() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "历史运行迁移", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const taskEntry = [...files.entries()].find(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const task = JSON.parse(taskEntry[1].content);
  const runId = `${task.taskId}_attempt-1`;
  const runRoot = `${project.directory}/runs/${runId}`;
  await app.vault.adapter.write(`${runRoot}/task.json`, `${JSON.stringify(task)}\n`);
  await app.vault.adapter.write(`${runRoot}/result.json`, `${JSON.stringify({ status: "awaiting_approval", outputHashes: {}, completedAt: fixedNow })}\n`);
  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  delete state.taskRefs;
  files.get(`${project.directory}/workflow-state.json`).content = `${JSON.stringify(state, null, 2)}\n`;
  const originalList = app.vault.adapter.list;
  const originalGetFiles = app.vault.getFiles;
  app.vault.adapter.list = async (folderPath) => {
    if (folderPath.endsWith("/_runner/queue")) return { files: [], folders: [] };
    if (folderPath === `${project.directory}/runs`) return { files: [], folders: [runId] };
    return originalList(folderPath);
  };
  app.vault.getFiles = () => originalGetFiles().filter((file) => !file.path.includes("/_runner/queue/"));

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects[0].tasks[0].status, "awaiting_approval");
  const migratedState = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(migratedState.taskRefs[task.kind], taskEntry[0]);
}

async function testProjectReadsMarkdownRunReceiptWhenJsonIsNotIndexed() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "Markdown 回执", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const taskPath = [...files.keys()].find((filePath) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const task = JSON.parse(files.get(taskPath).content);
  const receipt = { ...task, status: "awaiting_approval", taskPath, completedAt: fixedNow, updatedAt: fixedNow, outputHashes: {} };
  await app.vault.create(`${project.directory}/runs/${task.taskId}_attempt-1/receipt.md`, `# Runner 回执\n\n<!-- reading-capture-run-receipt\n${JSON.stringify(receipt)}\n-->\n`);
  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  delete state.taskRefs;
  files.get(`${project.directory}/workflow-state.json`).content = `${JSON.stringify(state, null, 2)}\n`;
  app.vault.adapter.list = async () => ({ files: [], folders: [] });
  app.vault.getFiles = () => app.vault.getMarkdownFiles();

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects[0].tasks[0].status, "awaiting_approval");
  assert.strictEqual(projects[0].tasks[0].kind, "diagnosis.materials");
}

async function testRunnerResultReceiptRecoversStaleQueueFile() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "Runner 回执恢复", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  const taskEntry = [...files.entries()].find(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"));
  const pendingTask = JSON.parse(taskEntry[1].content);
  const runId = `${pendingTask.taskId}_attempt-1`;
  const resultPath = `${project.directory}/runs/${runId}/result.json`;
  await app.vault.adapter.write(resultPath, `${JSON.stringify({
    status: "awaiting_approval",
    outputHashes: { [`${project.directory}/planning/diagnosis.md`]: "receipt-v1" },
    completedAt: "2026-06-10T04:00:00.000Z",
  })}\n`);
  const originalAdapterRead = app.vault.adapter.read;
  const originalAdapterList = app.vault.adapter.list;
  app.vault.adapter.read = async (filePath) => filePath === taskEntry[0] ? taskEntry[1].content : originalAdapterRead(filePath);
  app.vault.adapter.list = async (folderPath) => folderPath === `${project.directory}/runs`
    ? { files: [], folders: [`${project.directory}/runs/${runId}`] }
    : originalAdapterList(folderPath);

  const tasks = await plugin.listCreationRunnerTasks();

  assert.strictEqual(tasks[0].status, "awaiting_approval");
  assert.strictEqual(tasks[0].runId, runId);
  assert.strictEqual(tasks[0].outputHashes[`${project.directory}/planning/diagnosis.md`], "receipt-v1");

  pendingTask.status = "superseded";
  pendingTask.error = "a newer user revision replaced this result";
  taskEntry[1].content = `${JSON.stringify(pendingTask, null, 2)}\n`;
  const terminalTasks = await plugin.listCreationRunnerTasks();
  assert.strictEqual(terminalTasks[0].status, "superseded", "a historical run receipt must never revive a deliberately superseded queue task");
}

async function testWorkflowStateBypassesStaleVaultCache() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "外部工作流状态同步", kind: "manual" }, { platform: "wechat" });
  const workflowPath = `${project.directory}/workflow-state.json`;
  const staleRelationsSnapshot = files.get(workflowPath).content;
  await plugin.confirmCreationRelations(project.path);
  const originalVaultRead = app.vault.read;
  app.vault.read = async (file) => file.path === workflowPath ? staleRelationsSnapshot : originalVaultRead(file);

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects[0].workflowState.currentStage, "diagnosis", "workflow state must be read from disk instead of Obsidian's stale file cache");
  assert.strictEqual(projects[0].stageStates.diagnosis, "current");
}

async function testProjectStatusRecoversLaggingWorkflowStage() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "恢复阶段", kind: "manual" }, { platform: "wechat" });
  const projectEntry = files.get(project.path);
  projectEntry.content = plugin.replaceFrontmatterValue(projectEntry.content, "status", "material-diagnosis");

  const projects = await plugin.listCreationProjects();

  assert.strictEqual(projects[0].workflowState.currentStage, "diagnosis");
  assert.strictEqual(projects[0].stageStates.diagnosis, "current");
}

async function testRelatedInspirationCanBeUnlinkedWithoutRemovingPrimary() {
  const ReadingCapturePlugin = loadPluginClass();
  const plugin = new ReadingCapturePlugin();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "主灵感", kind: "manual", id: "primary" }, { platform: "wechat" });
  await plugin.appendInspirationToCreationProject({ title: "应保留的关联灵感", kind: "manual", id: "keep" }, project.path);
  await plugin.appendInspirationToCreationProject({ title: "应解除的关联灵感", kind: "manual", id: "remove" }, project.path);

  await plugin.unlinkCreationInspiration(project.path, "应解除的关联灵感");

  const directory = project.path.slice(0, -"/project.md".length);
  const context = await plugin.readText(`${directory}/planning/context.md`);
  const markdown = await plugin.readText(project.path);
  assert.match(context, /## 主灵感：主灵感/);
  assert.match(context, /## 关联灵感：应保留的关联灵感/);
  assert.doesNotMatch(context, /应解除的关联灵感/);
  assert.strictEqual(Number(plugin.readFrontmatterValue(markdown, "related_inspiration_count")), 1);
}

async function testManualArtifactEditCreatesNamedVersionAndUpdatesApprovalTarget() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "人工改稿", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  markCreationTaskAwaiting(files, project.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(project.path, "skip");
  const taskEntry = [...files.entries()].find(([filePath, entry]) => filePath.includes("/_runner/queue/") && JSON.parse(entry.content).kind === "brief.master");
  const task = JSON.parse(taskEntry[1].content);
  task.status = "awaiting_approval";
  task.outputHashes = { [`${project.directory}/planning/master-brief.md`]: "ai-v1" };
  files.get(taskEntry[0]).content = `${JSON.stringify(task, null, 2)}\n`;

  const result = await plugin.saveCreationManualVersion(project.path, "masterBrief", "# 用户修改后的完整创作简报\n\n正文内容足够长，用于验证用户版本不会覆盖历史版本。\n");

  assert.strictEqual(result.versionId, "user-v1");
  assert.ok(files.has(`${project.directory}/planning/versions/master-brief-user-v1.md`));
  assert.match(files.get(`${project.directory}/planning/master-brief.md`).content, /用户修改后的完整创作简报/);
  const updatedTask = JSON.parse(files.get(taskEntry[0]).content);
  assert.match(updatedTask.outputHashes[`${project.directory}/planning/master-brief.md`], /^[a-f0-9]{64}$/u);
  assert.strictEqual(updatedTask.userEdited, true);
  const artifact = files.get(`${project.directory}/artifacts.jsonl`).content.trim().split("\n").map(JSON.parse).pop();
  assert.strictEqual(artifact.recordType, "artifact_version");
  assert.strictEqual(artifact.artifactId, `${project.id}:manual:masterBrief`);
  assert.strictEqual(artifact.artifactVersionId, `${project.id}:manual:masterBrief@user-v1`);
  assert.match(artifact.contentHash, /^[a-f0-9]{64}$/u, "manual versions should persist a real content digest rather than using their display label as a hash");
  assert.strictEqual(artifact.source, "user");
}

async function testAiRevisionSupersedesStaleQualityCheck() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "AI 改稿失效旧质检", kind: "manual" }, { platform: "wechat" });
  await plugin.ensureFolder(`${project.directory}/deliverables/wechat/wechat-001/drafts`);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 当前公众号正文\n\n这是等待改稿的正文。\n");
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/qa.md`, "# 质量报告\n\nL2：需要补足来源边界。\n");
  const draft = await plugin.queueCreationStageTask(project.path, "wechat.draft", { force: true });
  const qa = await plugin.queueCreationStageTask(project.path, "wechat.qa", { force: true });
  for (const queued of [draft, qa]) {
    const record = JSON.parse(files.get(queued.taskPath).content);
    record.status = "awaiting_approval";
    files.get(queued.taskPath).content = `${JSON.stringify(record, null, 2)}\n`;
  }

  const revised = await plugin.requestCreationRevision(project.path, "wechatDraft", "根据质检报告修订正文，但不要虚构事实。");

  assert.strictEqual(JSON.parse(files.get(draft.taskPath).content).status, "superseded");
  assert.strictEqual(JSON.parse(files.get(qa.taskPath).content).status, "superseded", "a QA result for the previous draft must disappear as soon as a new AI revision is requested");
  assert.strictEqual(JSON.parse(files.get(revised.taskPath).content).status, "pending");
  assert.ok(JSON.parse(files.get(revised.taskPath).content).inputs.includes(`${project.directory}/deliverables/wechat/wechat-001/qa.md`), "AI revisions requested after QA must receive the current QA report");
}

async function testXhsCaptionRevisionNeverRegeneratesAcceptedCards() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "小红书只改文案", kind: "manual" }, { platform: "xiaohongshu" });
  await plugin.ensureFolder(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/images`);
  await plugin.writeText(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`, "# 当前发布文案\n\n卡片已经确认，只需要修订发布文案。\n");
  await plugin.writeText(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/images/xhs-01.png`, "accepted-card");
  const packageTask = await plugin.queueCreationStageTask(project.path, "xhs.package", { force: true, outputDirectoriesOverride: [] });
  const copyQa = await plugin.queueCreationStageTask(project.path, "xhs.copy-qa", { force: true });
  for (const queued of [packageTask, copyQa]) {
    const record = JSON.parse(files.get(queued.taskPath).content);
    record.status = "awaiting_approval";
    files.get(queued.taskPath).content = `${JSON.stringify(record, null, 2)}\n`;
  }

  const revised = await plugin.requestCreationRevision(project.path, "xhsCaption", "缩短开头，但保留事实与卡片结论。");

  assert.strictEqual(revised.kind, "xhs.copy-qa", "caption revision should reuse the copy-only Writing Styles task");
  assert.strictEqual(revised.skillId, "writing-styles");
  assert.ok(revised.outputs.every((output) => !output.includes("/images/")), "caption revision must not declare any card image output");
  assert.deepStrictEqual([...(revised.outputDirectories || [])], [], "caption revision must not receive an image-directory write contract");
  assert.strictEqual(JSON.parse(files.get(packageTask.taskPath).content).status, "awaiting_approval", "an accepted card package is independent from copy-only revision");
  assert.strictEqual(JSON.parse(files.get(copyQa.taskPath).content).status, "superseded");
}

async function testFailedQaCanReturnProjectToResearchConfiguration() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "补研究恢复入口", kind: "manual" }, { platform: "wechat" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state = creationWorkflow.enterDiagnosis(state);
  state = creationWorkflow.chooseResearchDecision(state, "skip");
  state = creationWorkflow.approveMasterBrief(state, "brief-v1");
  state = creationWorkflow.approvePlatformPlan(state, "wechat", { outlineVersion: "outline-v1" });
  await plugin.saveCreationWorkflowState(project.directory, state);
  const qa = await plugin.queueCreationStageTask(project.path, "wechat.qa", { force: true });
  const qaRecord = JSON.parse(files.get(qa.taskPath).content);
  qaRecord.status = "awaiting_approval";
  qaRecord.qualityScore = 82;
  qaRecord.qualityPassed = false;
  files.get(qa.taskPath).content = `${JSON.stringify(qaRecord, null, 2)}\n`;

  const reopened = await plugin.reopenCreationResearch(project.path);

  assert.strictEqual(reopened.currentStage, "research");
  assert.strictEqual(reopened.research.decision, "research");
  assert.strictEqual(JSON.parse(files.get(qa.taskPath).content).status, "superseded");
}

async function testReopenedResearchCanRestoreContentReviewAndRecordHumanQaOverride() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "恢复正文审核", kind: "manual" }, { platform: "wechat" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state = creationWorkflow.enterDiagnosis(state);
  state = creationWorkflow.chooseResearchDecision(state, "research");
  state = creationWorkflow.acceptResearchResult(state, "research-v1");
  state = creationWorkflow.approveMasterBrief(state, "brief-v1");
  state = creationWorkflow.approvePlatformPlan(state, "wechat", { outlineVersion: "outline-v1", illustrationPlanVersion: "illustrations-v1" });
  state = creationWorkflow.recordDeliverableVersions(state, "wechat", { articleVersion: "draft-v1", taskState: "qa_queued" });
  state = creationWorkflow.reopenResearch(state);
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/qa.md`, "# 质量报告\n\nTOTAL_SCORE: 92\n\n这份报告可供人工审核。\n");
  const taskPath = (kind) => `${plugin.creationProjectRoot()}/_runner/queue/${kind.replace(/\./g, "-")}.json`;
  const writeTask = async (kind, status, extra = {}) => {
    const task = {
      schemaVersion: 2,
      taskId: `restore-${kind}`,
      projectId: project.id,
      projectPath: project.path,
      projectDirectory: project.directory,
      kind,
      skillId: "writing-styles",
      status,
      outputs: [`${project.directory}/${kind === "research.evidence" ? "research/routes/deep-research-skills/evidence.md" : kind === "wechat.qa" ? "deliverables/wechat/wechat-001/qa.md" : `deliverables/wechat/wechat-001/${kind}.md`}`],
      outputHashes: { [`${project.directory}/output-${kind}.md`]: `${kind}-v1` },
      ...extra,
    };
    await plugin.writeText(taskPath(kind), `${JSON.stringify(task, null, 2)}\n`);
    return { ...task, taskPath: taskPath(kind) };
  };
  await writeTask("research.evidence", "completed", { skillId: "deep-research-skills" });
  await writeTask("brief.master", "completed");
  await writeTask("wechat.plan", "completed");
  await writeTask("wechat.draft", "completed");
  await writeTask("wechat.qa", "superseded", {
    qualityThreshold: 95,
    qualityScore: 92,
    qualityPassed: false,
    error: "质量检查要求补充证据，后续产物等待新研究结果后重建",
  });

  const restoredState = await plugin.restoreCreationContentReview(project.path);
  assert.strictEqual(restoredState.currentStage, "draft");
  assert.strictEqual(restoredState.research.taskState, "accepted");
  assert.strictEqual(JSON.parse(files.get(taskPath("wechat.qa")).content).status, "awaiting_approval");
  const restoredQa = { ...JSON.parse(files.get(taskPath("wechat.qa")).content), taskPath: taskPath("wechat.qa") };
  await assert.rejects(() => plugin.acceptCreationTask(restoredQa), /未达到 95 分/u, "the automatic quality gate must remain enforced without an explicit human override");
  let visualQueueCount = 0;
  plugin.queueWechatVisualTasks = async () => { visualQueueCount += 1; };
  await plugin.acceptCreationTask(restoredQa, { allowQualityOverride: true });
  const finalState = await plugin.loadCreationWorkflowState(project.directory);
  assert.strictEqual(finalState.currentStage, "visual");
  assert.strictEqual(visualQueueCount, 1);
  assert.strictEqual(JSON.parse(files.get(taskPath("wechat.qa")).content).status, "completed");
  assert.match(files.get(`${project.directory}/approvals.jsonl`).content, /"qualityOverride":true/u);
}

async function testFinalExportCreatesImmutableNamedSnapshot() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  plugin.now = () => "2026-07-19T16:00:00.000Z";
  const project = await plugin.createCreationProject({ title: "不可变快照", kind: "manual" }, { platform: "wechat" });
  const state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "final";
  state.deliverables.wechat.stage = "final";
  state.deliverables.wechat.approvalVersion = "visual-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 最终正文\n\n不可变发布内容。\n");
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/qa.md`, "# QA\n\n总分：96/100\n");
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/visuals/01-cover.png`, "image-binary-placeholder");

  const snapshot = await plugin.exportCreationDeliverable(project.path, "wechat");

  assert.strictEqual(snapshot.targetDirectory, "Work/business/content-accounts/wechat/20260719_不可变快照");
  assert.ok(files.has(`${snapshot.targetDirectory}/article.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/images/01-cover.png`));
  assert.ok(files.has(`${snapshot.targetDirectory}/QA.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/publishing-notes.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/manifest.yaml`));
  assert.ok(files.has(`${snapshot.targetDirectory}/snapshot.json`));
  await assert.rejects(() => plugin.exportCreationDeliverable(project.path, "wechat"), /发布目录已存在/);
}

async function testXhsFinalExportUsesCanonicalPublishingPackage() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  plugin.now = () => "2026-07-19T16:00:00.000Z";
  const project = await plugin.createCreationProject({ title: "小红书发布包", kind: "manual" }, { platform: "xiaohongshu" });
  const state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "final";
  state.deliverables.xiaohongshu.stage = "final";
  state.deliverables.xiaohongshu.approvalVersion = "xhs-package-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  const root = `${project.directory}/deliverables/xiaohongshu/xiaohongshu-001`;
  await plugin.writeText(`${root}/plan.md`, "# 小红书内容与视觉简报\n\n完整分页计划。\n");
  await plugin.writeText(`${root}/caption.md`, "# 标题\n\n完整发布文案。\n");
  await plugin.writeText(`${root}/copy-qa.md`, "# 文案 QA\n\n总分：97/100\n");
  await plugin.writeText(`${root}/visual-qa.md`, "# 视觉 QA\n\n总分：96/100\n");
  await plugin.writeText(`${root}/images/01-cover.png`, "image-binary-placeholder");

  const snapshot = await plugin.exportCreationDeliverable(project.path, "xiaohongshu");

  assert.ok(files.has(`${snapshot.targetDirectory}/BRIEF.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/xiaohongshu-caption.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/copy-variants.md`));
  assert.ok(files.has(`${snapshot.targetDirectory}/images/01-cover.png`));
  assert.match(files.get(`${snapshot.targetDirectory}/QA.md`).content, /文案 QA/);
  assert.match(files.get(`${snapshot.targetDirectory}/QA.md`).content, /视觉 QA/);
  assert.ok(files.has(`${snapshot.targetDirectory}/manifest.yaml`));
}

async function testConcurrentSnapshotExportReservesDistinctVersionDirectories() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  plugin.now = () => "2026-07-19T16:00:00.000Z";
  const project = await plugin.createCreationProject({ title: "并发导出", kind: "manual" }, { platform: "wechat" });
  const state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "final";
  state.deliverables.wechat.stage = "final";
  state.deliverables.wechat.approvalVersion = "visual-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 最终正文\n\n并发导出内容。\n");

  const results = await Promise.all([
    plugin.exportCreationDeliverable(project.path, "wechat", { autoVersion: true }),
    plugin.exportCreationDeliverable(project.path, "wechat", { autoVersion: true }),
  ]);

  assert.deepStrictEqual(results.map((item) => item.targetDirectory).sort(), [
    "Work/business/content-accounts/wechat/20260719_并发导出",
    "Work/business/content-accounts/wechat/20260719_并发导出_v2",
  ]);
  assert.strictEqual(results.find((item) => /_v2$/u.test(item.targetDirectory)).snapshotVersion, 2);
}

async function testExportWriteFailureNeverExposesPartialSnapshotAsFinal() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  plugin.now = () => "2026-07-20T10:00:00.000Z";
  const project = await plugin.createCreationProject({ title: "失败导出仍可恢复", kind: "manual" }, { platform: "wechat" });
  const state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "final";
  state.deliverables.wechat.stage = "final";
  state.deliverables.wechat.approvalVersion = "visual-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 最终正文\n\n源项目必须保持完整。\n");
  const target = "Work/business/content-accounts/wechat/20260720_失败导出仍可恢复";
  const originalWrite = app.vault.adapter.write.bind(app.vault.adapter);
  app.vault.adapter.write = async (path, content) => {
    if (path.includes("Work/business/content-accounts/wechat/") && path.endsWith("/sources.md")) throw new Error("simulated export write failure");
    return originalWrite(path, content);
  };

  await assert.rejects(() => plugin.exportCreationDeliverable(project.path, "wechat"), /simulated export write failure/);

  assert.ok(files.has(project.path), "source project must survive a failed export");
  assert.ok(files.has(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`));
  assert.ok(![...files.keys()].some((path) => path === target || path.startsWith(`${target}/`)), "partial output must never appear under the final publishing path");
  assert.ok([...files.keys()].some((path) => path.includes(`${target}.staging-`) && path.endsWith("/_EXPORT_INCOMPLETE.json")), "failed staging output should be explicitly identifiable for recovery or cleanup");
}

async function testPublicationReviewProjectsIdempotentTopicMinerFeedback() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  plugin.now = () => "2026-07-20T09:00:00.000Z";
  const project = await plugin.createCreationProject({ title: "发布复盘", kind: "manual", id: "idea-review" }, { platform: "wechat" });
  const state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "final";
  state.deliverables.wechat.stage = "final";
  state.deliverables.wechat.approvalVersion = "visual-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 最终正文\n\n准备发布。\n");
  const snapshot = await plugin.exportCreationDeliverable(project.path, "wechat");
  const immutableBefore = files.get(`${snapshot.targetDirectory}/snapshot.json`).content;
  const review = {
    publishedAt: "2026-07-20T09:30:00.000Z",
    url: "https://example.com/post/1",
    outcome: "published",
    whatWorked: "风险清单结构便于收藏",
    whatFailed: "开头略长",
    reusableAngles: "上线前检查表",
    audienceResponse: "读者追问审计案例",
    followUpIdeas: "补一篇失败复盘",
  };

  const first = await plugin.recordCreationPublicationReview(project.path, "wechat", snapshot, review);
  const duplicate = await plugin.recordCreationPublicationReview(project.path, "wechat", snapshot, review);
  assert.strictEqual(duplicate.reviewId, first.reviewId, "saving the same review twice must be idempotent");
  const revised = await plugin.recordCreationPublicationReview(project.path, "wechat", snapshot, { ...review, whatFailed: "案例仍然不够具体" });
  assert.strictEqual(revised.reviewRevision, 2);
  assert.strictEqual(revised.previousReviewId, first.reviewId);
  const records = files.get(`${project.directory}/publication-records.jsonl`).content.trim().split("\n").map(JSON.parse);
  assert.strictEqual(records.filter((item) => item.recordType === "publication_review").length, 2);
  const feedbackPath = "Reading Capture/creation-projects/_topic-miner/feedback.jsonl";
  const feedback = files.get(feedbackPath).content.trim().split("\n").map(JSON.parse);
  assert.strictEqual(feedback.length, 2);
  assert.strictEqual(feedback[1].reviewRevision, 2);
  const consumer = JSON.parse(files.get("Reading Capture/creation-projects/_topic-miner/consumers/topic-miner.json").content);
  assert.strictEqual(consumer.records[0].reviewRevision, 2, "the consumer projection should expose only the latest revision per inspiration and publication");
  assert.strictEqual(files.get(`${snapshot.targetDirectory}/snapshot.json`).content, immutableBefore, "publication review must not mutate the immutable snapshot");
}

async function testCreationResearchDecisionPersistsDistinctPaths() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const researchProject = await plugin.createCreationProject({ title: "进入研究", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(researchProject.path);
  markCreationTaskAwaiting(files, researchProject.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(researchProject.path, "research");
  const researchState = JSON.parse(files.get(`${researchProject.directory}/workflow-state.json`).content);
  assert.strictEqual(researchState.currentStage, "research");
  assert.strictEqual(researchState.research.decision, "research");

  const skipProject = await plugin.createCreationProject({ title: "跳过研究", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(skipProject.path);
  markCreationTaskAwaiting(files, skipProject.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(skipProject.path, "skip");
  const skipState = JSON.parse(files.get(`${skipProject.directory}/workflow-state.json`).content);
  assert.strictEqual(skipState.currentStage, "brief");
  assert.strictEqual(skipState.research.decision, "skipped");
  assert.strictEqual(creationWorkflow.deriveStageStates(skipState).research, "skipped");
}

async function testParallelResearchRoutesKeepOutputsSeparateAndMergeOnAcceptance() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "多路线研究合并", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  markCreationTaskAwaiting(files, project.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(project.path, "research");
  const deep = await plugin.queueCreationStageTask(project.path, "research.evidence", { skillId: "deep-research-skills", networkAuthorized: true });
  await assert.rejects(
    () => plugin.queueCreationStageTask(project.path, "research.evidence", { skillId: "last30days", networkAuthorized: true }),
    /暂不允许自动运行 last30days/u,
  );
  const recent = await plugin.queueCreationStageTask(project.path, "research.evidence", { skillId: "academic-research-suite", networkAuthorized: true });
  assert.strictEqual(deep.skillRequirement.skillId, "deep-research-skills");
  assert.match(deep.skillRequirement.artifactDigest, /^[a-f0-9]{64}$/u);
  assert.match(deep.skillRequirement.manifestDigest, /^[a-f0-9]{64}$/u);
  assert.deepStrictEqual(deep.skillRequirement.permissions.network, ["public-web"]);
  assert.strictEqual(recent.skillRequirement.version, "0.1.21+16696ba2");
  assert.notDeepStrictEqual(deep.outputs, recent.outputs, "parallel research routes must never overwrite the same files");
  for (const [task, marker] of [[deep, "权威治理证据"], [recent, "最近三十天实践"]]) {
    const record = JSON.parse(files.get(task.taskPath).content);
    record.status = "awaiting_approval";
    record.runId = `${task.taskId}_attempt-1`;
    record.outputs = [`${project.directory}/research/evidence.md`, `${project.directory}/research/sources.md`];
    record.outputHashes = Object.fromEntries(record.outputs.map((output) => [output, `${marker}-v1`]));
    files.get(task.taskPath).content = `${JSON.stringify(record, null, 2)}\n`;
    await plugin.writeText(`${project.directory}/runs/${record.runId}/workspace/research/evidence.md`, `# ${marker}\n\n证据正文\n`);
    await plugin.writeText(`${project.directory}/runs/${record.runId}/workspace/research/sources.md`, `# ${marker}来源\n\n来源正文\n`);
  }

  await plugin.acceptCreationResearchResults(project.path);

  assert.match(files.get(`${project.directory}/research/evidence.md`).content, /权威治理证据/);
  assert.match(files.get(`${project.directory}/research/evidence.md`).content, /最近三十天实践/);
  assert.match(files.get(`${project.directory}/research/sources.md`).content, /权威治理证据来源/);
  assert.match(files.get(`${project.directory}/research/sources.md`).content, /最近三十天实践来源/);
}

async function testGeneratedDiagnosisCanAdvanceWhenLegacyTaskReceiptIsMissing() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "旧任务兼容", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  for (const filePath of [...files.keys()].filter((item) => item.includes("/_runner/queue/"))) files.delete(filePath);
  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  delete state.taskRefs;
  files.get(`${project.directory}/workflow-state.json`).content = `${JSON.stringify(state, null, 2)}\n`;
  files.get(`${project.directory}/planning/diagnosis.md`).content = `# 材料诊断\n\n${"这是已经完成的真实诊断内容，包含材料成熟度、证据缺口和后续路径建议。".repeat(12)}\n`;

  await plugin.chooseCreationResearchPath(project.path, "skip");

  const updated = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(updated.currentStage, "brief");
}

async function testTaskVersionLabelsDoNotExposeContentHashes() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  assert.strictEqual(plugin.creationTaskVersionLabel({ attempts: 1, outputHashes: { "brief.md": "a".repeat(64) } }), "AI 生成版 v1");
  assert.strictEqual(plugin.creationTaskVersionLabel({ attempts: 2, userVersion: "user-v3" }), "用户修改版 v3");
}

async function testCreationStageTasksUseExplicitContractsAndAuthorization() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "阶段任务", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);

  const diagnosis = await plugin.queueCreationStageTask(project.path, "diagnosis.materials");
  assert.strictEqual(diagnosis.schemaVersion, 2);
  assert.strictEqual(diagnosis.skillId, "writing-styles");
  assert.strictEqual(diagnosis.network.required, false);
  assert.strictEqual(diagnosis.network.authorized, false);
  assert.deepStrictEqual([...diagnosis.outputs], [`${project.directory}/planning/diagnosis.md`]);

  markCreationTaskAwaiting(files, project.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(project.path, "research");
  await assert.rejects(
    () => plugin.queueCreationStageTask(project.path, "research.evidence"),
    /明确授权联网研究/,
  );
  const research = await plugin.queueCreationStageTask(project.path, "research.evidence", {
    skillId: "deep-research-skills",
    networkAuthorized: true,
    researchGuidance: "重点查找真实失败案例与权威治理框架。",
  });
  assert.strictEqual(research.skillId, "deep-research-skills");
  assert.strictEqual(research.network.required, true);
  assert.strictEqual(research.network.authorized, true);
  assert.ok(files.has(`${project.directory}/planning/research-request.md`));
  assert.match(files.get(`${project.directory}/planning/research-request.md`).content, /真实失败案例/);
  assert.deepStrictEqual([...research.outputs], [
    `${project.directory}/research/routes/deep-research-skills/evidence.md`,
    `${project.directory}/research/routes/deep-research-skills/sources.md`,
  ]);
  const persistedState = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(persistedState.research.taskState, "queued");
  assert.deepStrictEqual([...persistedState.research.skills], ["deep-research-skills"]);

  const queuedResearch = JSON.parse(files.get(research.taskPath).content);
  queuedResearch.status = "awaiting_approval";
  queuedResearch.outputHashes = { [`${project.directory}/research/evidence.md`]: "research-v1" };
  files.get(research.taskPath).content = `${JSON.stringify(queuedResearch, null, 2)}\n`;
  const accepted = await plugin.acceptCreationTask({ ...queuedResearch, taskPath: research.taskPath });
  assert.strictEqual(accepted.workflowState.currentStage, "brief");
  assert.strictEqual(accepted.workflowState.research.taskState, "accepted");
  assert.strictEqual(accepted.workflowState.research.acceptedResultVersion, "research-v1");
  const taskFiles = [...files.entries()]
    .filter(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"))
    .map(([, record]) => JSON.parse(record.content));
  assert.ok(taskFiles.some((task) => task.kind === "brief.master" && task.status === "pending"), "accepting research should queue a separate master brief task");
  const briefEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "brief.master"; } catch (error) { return false; }
  });
  const queuedBrief = JSON.parse(briefEntry[1].content);
  queuedBrief.status = "awaiting_approval";
  queuedBrief.outputHashes = { [`${project.directory}/planning/master-brief.md`]: "brief-v2" };
  queuedBrief.inputHashes = {
    [`${project.directory}/project.md`]: "project-input-v1",
    [`${project.directory}/planning/diagnosis.md`]: "diagnosis-input-v1",
  };
  briefEntry[1].content = `${JSON.stringify(queuedBrief, null, 2)}\n`;
  const briefAccepted = await plugin.acceptCreationTask({ ...queuedBrief, taskPath: briefEntry[0] });
  assert.strictEqual(briefAccepted.workflowState.currentStage, "plan");
  assert.strictEqual(briefAccepted.workflowState.masterBriefVersion, "brief-v2");
  const artifactRecords = files.get(`${project.directory}/artifacts.jsonl`).content.trim().split("\n").map(JSON.parse);
  const briefArtifact = artifactRecords.find((record) => record.path === `${project.directory}/planning/master-brief.md`);
  assert.ok(briefArtifact, "accepting a generated output should append an Artifact version record");
  assert.strictEqual(briefArtifact.artifactId, `${project.id}:brief.master:planning/master-brief.md`);
  assert.strictEqual(briefArtifact.contentHash, "brief-v2");
  assert.deepStrictEqual({ ...briefArtifact.dependencyHashes }, { ...queuedBrief.inputHashes });
  const approvalRecords = files.get(`${project.directory}/approvals.jsonl`).content.trim().split("\n").map(JSON.parse);
  const briefApproval = approvalRecords.find((record) => record.taskId === queuedBrief.taskId);
  assert.deepStrictEqual([...briefApproval.artifactVersionIds], [briefArtifact.artifactVersionId], "approval must name the exact immutable Artifact version it accepts");
  const afterBriefTasks = [...files.entries()]
    .filter(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"))
    .map(([, record]) => JSON.parse(record.content));
  assert.ok(afterBriefTasks.some((task) => task.kind === "wechat.plan" && task.status === "pending"), "accepting the brief should queue the selected platform plan only");
  const planEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "wechat.plan"; } catch (error) { return false; }
  });
  const queuedPlan = JSON.parse(planEntry[1].content);
  queuedPlan.status = "awaiting_approval";
  queuedPlan.outputHashes = {
    [`${project.directory}/deliverables/wechat/wechat-001/outline.md`]: "outline-v1",
    [`${project.directory}/deliverables/wechat/wechat-001/illustration-plan.md`]: "illustrations-v1",
    [`${project.directory}/deliverables/wechat/wechat-001/illustration-plan.json`]: "illustrations-json-v1",
  };
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/illustration-plan.json`, `${JSON.stringify({ schemaVersion: 1, items: [
    { id: "hero", label: "开场解释图", skillId: "liangkeban-xiaoxiaoke-illustrations", fileName: "01-hero.png", insertionAnchor: "引言后" },
    { id: "matrix", label: "风险矩阵", skillId: "baoyu-infographic", fileName: "02-matrix.png", insertionAnchor: "行动章节" },
  ] }, null, 2)}\n`);
  planEntry[1].content = `${JSON.stringify(queuedPlan, null, 2)}\n`;
  const planAccepted = await plugin.acceptCreationTask({ ...queuedPlan, taskPath: planEntry[0] });
  assert.strictEqual(planAccepted.workflowState.currentStage, "draft");
  assert.strictEqual(planAccepted.workflowState.deliverables.wechat.outlineVersion, "outline-v1");
  assert.strictEqual(planAccepted.workflowState.deliverables.wechat.illustrationPlanVersion, "illustrations-v1");
  assert.ok([...files.values()].some((record) => {
    try { return JSON.parse(record.content).kind === "wechat.draft"; } catch (error) { return false; }
  }), "accepting the WeChat plan should queue its draft task");
  const draftEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "wechat.draft"; } catch (error) { return false; }
  });
  const queuedDraft = JSON.parse(draftEntry[1].content);
  assert.ok(queuedDraft.inputs.includes(`${project.directory}/research/evidence.md`), "the writer must receive accepted research evidence instead of relying on a lossy brief summary");
  assert.ok(queuedDraft.inputs.includes(`${project.directory}/research/sources.md`));
  queuedDraft.status = "awaiting_approval";
  queuedDraft.outputHashes = { [`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`]: "article-v1" };
  draftEntry[1].content = `${JSON.stringify(queuedDraft, null, 2)}\n`;
  const draftAccepted = await plugin.acceptCreationTask({ ...queuedDraft, taskPath: draftEntry[0] });
  assert.strictEqual(draftAccepted.workflowState.currentStage, "draft", "draft acceptance must wait for QA before advancing");
  assert.strictEqual(draftAccepted.workflowState.deliverables.wechat.articleVersion, "article-v1");
  const qaEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "wechat.qa"; } catch (error) { return false; }
  });
  assert.ok(qaEntry, "accepting a text candidate should queue Writing Styles QA");
  const queuedQa = JSON.parse(qaEntry[1].content);
  assert.ok(queuedQa.inputs.includes(`${project.directory}/research/evidence.md`), "QA must inspect the same evidence available to the writer");
  assert.ok(queuedQa.inputs.includes(`${project.directory}/research/sources.md`));
  queuedQa.status = "awaiting_approval";
  queuedQa.qualityScore = 94;
  queuedQa.qualityPassed = false;
  queuedQa.outputHashes = { [`${project.directory}/deliverables/wechat/wechat-001/qa.md`]: "qa-v1" };
  qaEntry[1].content = `${JSON.stringify(queuedQa, null, 2)}\n`;
  await assert.rejects(() => plugin.acceptCreationTask({ ...queuedQa, taskPath: qaEntry[0] }), /95/);
  queuedQa.qualityScore = 96;
  queuedQa.qualityPassed = true;
  qaEntry[1].content = `${JSON.stringify(queuedQa, null, 2)}\n`;
  const qaAccepted = await plugin.acceptCreationTask({ ...queuedQa, taskPath: qaEntry[0] });
  assert.strictEqual(qaAccepted.workflowState.currentStage, "visual");
  assert.strictEqual(qaAccepted.workflowState.deliverables.wechat.qaVersion, "qa-v1");
  const visualEntries = [...files.entries()].filter(([, record]) => {
    try { return JSON.parse(record.content).kind === "wechat.visual-item"; } catch (error) { return false; }
  });
  assert.strictEqual(visualEntries.length, 2, "passed QA should queue one durable Task per approved illustration");
  for (const [taskPath, record] of visualEntries) {
    const queuedVisual = JSON.parse(record.content);
    queuedVisual.status = "awaiting_approval";
    queuedVisual.outputHashes = { [queuedVisual.outputs[0]]: `${queuedVisual.childKey}-v1` };
    record.content = `${JSON.stringify(queuedVisual, null, 2)}\n`;
    await plugin.acceptCreationTask({ ...queuedVisual, taskPath });
  }
  const visualAccepted = await plugin.approveCreationVisualPackage(project.path, "wechat");
  assert.strictEqual(visualAccepted.currentStage, "final");
  assert.match(visualAccepted.deliverables.wechat.approvalVersion, /^[a-f0-9]{64}$/u);
  const withXhs = await plugin.addCreationDeliverable(project.path, "xiaohongshu");
  assert.ok(withXhs.deliverables.xiaohongshu);
  const xhsActive = await plugin.activateCreationDeliverable(project.path, "xiaohongshu");
  assert.strictEqual(xhsActive.activeDeliverable, "xiaohongshu");
  assert.strictEqual(xhsActive.currentStage, "plan");
}

async function testLegacyPlanningEntryRoutesToDiagnosisOnly() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "旧入口恢复", kind: "manual" }, { platform: "wechat" });

  const task = await plugin.queueCreationPlanningTask(project.path);

  assert.strictEqual(task.kind, "diagnosis.materials");
  assert.deepStrictEqual([...task.outputs], [`${project.directory}/planning/diagnosis.md`]);
  assert.ok(!task.outputs.some((output) => /master-brief|outline/u.test(output)), "a legacy click must never revive the unsafe combined brief-and-outline task");
}

async function testSkippingResearchQueuesRestrictedBriefCandidate() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "受限简报", kind: "manual" }, { platform: "wechat" });
  await plugin.confirmCreationRelations(project.path);
  markCreationTaskAwaiting(files, project.path, "diagnosis.materials");
  await plugin.chooseCreationResearchPath(project.path, "skip");
  const tasks = [...files.entries()]
    .filter(([filePath]) => filePath.includes("/_runner/queue/") && filePath.endsWith(".json"))
    .map(([, record]) => JSON.parse(record.content));
  const brief = tasks.find((task) => task.kind === "brief.master");
  assert.ok(brief, "the restricted path still needs a generated brief candidate");
  assert.strictEqual(brief.network.required, false);
}

async function testRepurposeSourceSearchIsMetadataOnlyAndReadsAfterConfirmation() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  const savedPath = "Learning/saved/agent-risk.md";
  files.set(savedPath, { file: makeFile(savedPath, "# Agent risk\n\n正文"), content: "# Agent risk\n\n正文" });
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    articleLibraryRoots: "Learning",
    articleLibraryExcludeRoots: ".obsidian",
    readingRoot: "Reading Capture/notes",
    defaultWritingStyle: "keke",
  };
  plugin.now = () => fixedNow;
  let reads = 0;
  const originalRead = app.vault.adapter.read;
  app.vault.adapter.read = async (path) => { reads += 1; return originalRead(path); };
  const originalVaultRead = app.vault.read;
  app.vault.read = async (file) => { reads += 1; return originalVaultRead(file); };
  const result = plugin.searchCreationSourceMetadata("agent-risk", { limit: 50, offset: 0 });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.items[0].path, savedPath);
  assert.strictEqual(reads, 0, "source search must not read article contents");

  const project = await plugin.createCreationProject({ title: "改编项目", kind: "manual" }, { platform: "wechat" });
  await plugin.startCreationRepurpose(project.path, savedPath, "xiaohongshu");
  assert.ok(reads > 0, "content is read only after the user confirms the selected source");
  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(state.workflowMode, "article_repurpose");
  assert.strictEqual(state.currentStage, "plan");
  assert.strictEqual(state.activeDeliverable, "xiaohongshu");
  assert.strictEqual(state.source.mainFile, savedPath);
  assert.ok(files.has(`${project.directory}/sources/primary.md`));
  const tasks = [...files.values()].map((record) => {
    try { return JSON.parse(record.content); } catch (error) { return null; }
  }).filter(Boolean);
  const planTask = tasks.find((task) => task.kind === "xhs.plan");
  assert.ok(planTask);
  assert.ok(planTask.inputs.includes(`${project.directory}/sources/primary.md`));
  assert.ok(!planTask.inputs.includes(savedPath), "Runner inputs remain project-contained");
  assert.ok(planTask.outputs.includes(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/proposals.json`), "the three proposal cards must come from a generated structured artifact");
}

async function testSupportingSourcesCanBeAddedTogetherAfterMetadataOnlySelection() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  const firstPath = "Learning/saved/one/article_zh.md";
  const secondPath = "Learning/saved/two/article_zh.md";
  files.set(firstPath, { file: makeFile(firstPath, "# First\n\n本地材料一"), content: "# First\n\n本地材料一" });
  files.set(secondPath, { file: makeFile(secondPath, "# Second\n\n本地材料二"), content: "# Second\n\n本地材料二" });
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    articleLibraryRoots: "Learning/saved",
    articleLibraryExcludeRoots: ".obsidian",
    readingRoot: "Reading Capture/notes",
    defaultWritingStyle: "keke",
  };
  plugin.now = () => fixedNow;
  let reads = 0;
  const originalRead = app.vault.adapter.read;
  app.vault.adapter.read = async (filePath) => { reads += 1; return originalRead(filePath); };
  const project = await plugin.createCreationProject({ title: "多份本地材料", kind: "manual" }, { platform: "wechat" });
  reads = 0;
  const metadata = plugin.searchCreationSourceMetadata("article_zh", { limit: 50 });
  assert.strictEqual(metadata.items.length, 2, "metadata search should return both same-name files");
  assert.strictEqual(reads, 0, "metadata search must not read selected files");

  await plugin.addCreationSupportingSources(project.path, [firstPath, secondPath]);

  const state = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.deepStrictEqual(state.source.supportingFiles.map((item) => item.path), [firstPath, secondPath]);
  assert.ok(files.has(`${project.directory}/sources/supporting/01_article_zh.md`));
  assert.ok(files.has(`${project.directory}/sources/supporting/02_article_zh.md`));
  assert.ok(reads >= 2, "selected files are read only when the batch is confirmed");
  const diagnosisTasks = [...files.values()]
    .map((record) => { try { return JSON.parse(record.content); } catch (error) { return null; } })
    .filter((task) => task && task.kind === "diagnosis.materials");
  assert.strictEqual(diagnosisTasks.length, 1, "a multi-file confirmation should queue one diagnosis refresh");
}

async function testSupportingPickerShowsFullNamesAndDefersMultiSelectionUntilConfirmation() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const workflowState = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({
    projectId: "picker-project",
    title: "Picker",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  }));
  const projectPath = "Reading Capture/creation-projects/picker-project/project.md";
  plugin.listCreationProjects = async () => [{
    path: projectPath,
    directory: "Reading Capture/creation-projects/picker-project",
    title: "Picker",
    platform: "wechat",
    statusLabel: "整理素材",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
  }];
  plugin.searchCreationSourceMetadata = () => ({ total: 2, items: [
    { name: "article_zh.md", title: "article_zh", path: "Learning/saved/one/article_zh.md", kind: "markdown", size: 101 },
    { name: "article_zh.md", title: "article_zh", path: "Learning/saved/two/article_zh.md", kind: "markdown", size: 202 },
  ] });
  plugin.articleLibraryEmptyMessage = () => "empty";
  let added = null;
  plugin.addCreationSupportingSources = async (path, paths) => { added = { path, paths }; };

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const openPicker = fakeElementByText(view.containerEl.children[1], "选择本地材料");
  await openPicker.listeners.click();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("选择本地补充材料"));
  assert.ok(texts.filter((text) => text === "article_zh.md").length >= 2, "same-name files should retain their full filenames");
  assert.ok(texts.includes("Learning/saved/one/article_zh.md"));
  assert.ok(texts.includes("Learning/saved/two/article_zh.md"));
  const checkboxes = fakeElementsByTag(view.containerEl.children[1], "input").filter((input) => input.attrs.type === "checkbox");
  assert.strictEqual(checkboxes.length, 2);
  checkboxes[0].checked = true;
  checkboxes[0].listeners.change();
  checkboxes[1].checked = true;
  checkboxes[1].listeners.change();
  assert.strictEqual(added, null, "checking rows must not read or add files before confirmation");
  const confirm = fakeElementByText(view.containerEl.children[1], "加入项目并重新诊断");
  await confirm.listeners.click();
  assert.strictEqual(added.path, projectPath);
  assert.deepStrictEqual([...added.paths], ["Learning/saved/one/article_zh.md", "Learning/saved/two/article_zh.md"]);
}

async function testXhsPlanRendersGeneratedProposalsInsteadOfHardcodedCards() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let state = creationWorkflow.createWorkflowState({ projectId: "xhs-generated", title: "Generated", activeDeliverable: "xiaohongshu" });
  state = {
    ...state,
    currentStage: "plan",
    masterBriefVersion: "brief-v1",
    deliverables: {
      ...state.deliverables,
      xiaohongshu: {
        ...state.deliverables.xiaohongshu,
        planVersion: "plan-v1",
      },
    },
  };
  const generated = [
    {
      id: "route-one",
      name: "证据审计地图",
      template: { visualSystem: "Swiss System", subTemplate: "审计轨迹", ratio: "3:4", routeRationale: "适合证据结构" },
      palette: { theme: "ikb", primary: "深蓝", surface: "暖白", accent: "朱红", usage: "只用于边界" },
      tradeoff: "信息密度高",
    },
    { id: "route-two", name: "上线闸门清单", template: "闸门卡", palette: "米白与朱红", tradeoff: "更便于收藏" },
    { id: "route-three", name: "事故复盘时间线", template: "事件线", palette: "深灰与电蓝", tradeoff: "叙事性更强" },
  ];
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/xhs-generated/project.md",
    directory: "Reading Capture/creation-projects/xhs-generated",
    title: "Generated",
    platform: "xiaohongshu",
    statusLabel: "方案审核",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: state,
    stageStates: creationWorkflow.deriveStageStates(state),
    xhsPlan: "# 生成方案",
    xhsProposals: generated,
    xhsPlanDecision: { selectedProposal: "route-two", planVersion: "plan-v1", sampleProposals: ["route-two", "route-three"] },
    xhsSampleFiles: [
      { name: "route-one-cover.png", path: "Reading Capture/creation-projects/xhs-generated/deliverables/xiaohongshu/xiaohongshu-001/samples/route-one-cover.png" },
      { name: "route-two-cover.png", path: "Reading Capture/creation-projects/xhs-generated/deliverables/xiaohongshu/xiaohongshu-001/samples/route-two-cover.png" },
    ],
    tasks: [
      { kind: "xhs.plan", status: "completed", taskPath: "queue/xhs-plan.json", outputHashes: { plan: "plan-v1" } },
      { kind: "xhs.samples", status: "awaiting_approval", taskPath: "queue/xhs-samples.json", outputHashes: { samples: "sample-v1" } },
    ],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);

  for (const proposal of generated) {
    assert.ok(texts.includes(proposal.name));
  }
  assert.ok(texts.includes("Swiss System · 审计轨迹 · 3:4"));
  assert.ok(texts.includes("ikb · 深蓝 · 暖白 · 朱红"));
  assert.ok(!texts.includes("[object Object]"));
  assert.ok(texts.includes("闸门卡"));
  assert.ok(texts.includes("米白与朱红"));
  assert.ok(texts.includes("已生成样张 · 直接比较视觉效果"));
  assert.ok(texts.includes("route-one-cover.png"));
  assert.ok(texts.includes("打开样张与差异记录（文字）"));
  assert.ok(texts.includes("打开样张目录"));
  assert.ok(texts.includes("按当前选择生成新一轮样张比较"), "an approved sample round must still allow a later design revision to generate another controlled comparison");
  assert.ok(!texts.includes("结构化评审板"), "the UI must not invent proposal content that was not generated by the selected Skills");
  const sampleChoices = fakeElementsByTag(view.containerEl.children[1], "input").filter((input) => input.attrs.type === "checkbox");
  assert.deepStrictEqual(sampleChoices.map((input) => input.checked), [false, true, true], "a refresh must restore the last saved sample comparison choices instead of silently reverting to the first two proposals");
  const proposalCards = fakeElementsByClass(view.containerEl.children[1], "reading-capture-creation-xhs-proposal");
  assert.ok(proposalCards[1].classes.has("is-selected"), "the selected final proposal must survive a refresh instead of silently reverting to the first card");
  const confirmPlan = fakeElementByText(view.containerEl.children[1], "确认小红书方案，生成完整初版");
  assert.ok(confirmPlan);
  assert.strictEqual(confirmPlan.disabled, false, "a completed plan with a saved version must remain actionable for starting the full card set");
  let savedDecision = null;
  let queuedCardsFor = null;
  plugin.saveCreationPlanDecision = async (_path, _platform, decision) => { savedDecision = decision; };
  plugin.queueXhsCardTasks = async (projectPath) => { queuedCardsFor = projectPath; return []; };
  await confirmPlan.listeners.click();
  assert.strictEqual(savedDecision.selectedProposal, "route-two", "continuing from a completed plan must retain the user's final proposal choice");
  assert.strictEqual(savedDecision.planVersion, "plan-v1");
  assert.strictEqual(queuedCardsFor, "Reading Capture/creation-projects/xhs-generated/project.md", "a completed plan must start the full card-generation queue rather than silently disabling the confirmation button");
}

async function testXhsSampleRoundsPreservePriorSamplesAndQueueCurrentDecision() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "可迭代样张比较", kind: "manual" }, { platform: "xiaohongshu" });
  await plugin.saveCreationPlanDecision(project.path, "xiaohongshu", {
    selectedProposal: "swiss-v2",
    sampleProposals: ["swiss-v2", "graphite-v2"],
  });
  const initial = await plugin.queueCreationStageTask(project.path, "xhs.samples", { force: true });
  const initialRecord = JSON.parse(files.get(initial.taskPath).content);
  initialRecord.status = "awaiting_approval";
  initialRecord.outputHashes = { [initial.outputs[0]]: "sample-v1" };
  files.get(initial.taskPath).content = `${JSON.stringify(initialRecord, null, 2)}\n`;

  const ensured = [];
  const originalEnsureFolder = plugin.ensureFolder.bind(plugin);
  plugin.ensureFolder = async (path) => {
    ensured.push(path);
    return originalEnsureFolder(path);
  };
  const nextRound = await plugin.queueXhsSampleRound(project.path);
  const superseded = JSON.parse(files.get(initial.taskPath).content);
  const roundDecisionPath = nextRound.inputs.find((input) => /\/samples\/sample-round-[^/]+\/plan-decision\.json$/u.test(input));
  const savedDecision = JSON.parse(files.get(roundDecisionPath).content);

  assert.strictEqual(superseded.status, "superseded", "the prior round must remain on disk but stop blocking the revised comparison");
  assert.match(superseded.error, /新一轮样张比较/u);
  assert.strictEqual(nextRound.kind, "xhs.samples");
  assert.ok(nextRound.groupId.startsWith("sample-round-"));
  assert.ok(nextRound.outputs[0].includes("/samples/sample-round-"), "a new round must write to a separate sample folder instead of overwriting prior images");
  assert.ok(nextRound.outputs[0].endsWith("/sample-manifest.md"));
  assert.ok(nextRound.outputDirectories[0].includes("/samples/sample-round-"));
  assert.ok(ensured.includes(nextRound.outputDirectories[0]), "the round folder must exist before its decision snapshot is written");
  assert.ok(roundDecisionPath, "the queued task must use the round-local decision snapshot");
  assert.deepStrictEqual(savedDecision.sampleProposals, ["swiss-v2", "graphite-v2"], "the queued round must consume an immutable copy of the current choices");
}

async function testXhsTaskChainUsesApprovedPlanAndIndependentDualQa() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "小红书完整链路", kind: "manual" }, { platform: "xiaohongshu" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "plan";
  state.masterBriefVersion = "brief-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.saveCreationPlanDecision(project.path, "xiaohongshu", { selectedProposal: "route-one", planVersion: "plan-v1" });
  const planTask = await plugin.queueCreationStageTask(project.path, "xhs.plan", { force: true });
  let planRecord = JSON.parse(files.get(planTask.taskPath).content);
  planRecord.status = "awaiting_approval";
  planRecord.outputHashes = {
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`]: "plan-v1",
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/proposals.json`]: "proposals-v1",
  };
  await plugin.writeText(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/proposals.json`, `${JSON.stringify({ schemaVersion: 1, proposals: [{
    id: "route-one",
    name: "证据审计地图",
    template: "Swiss System",
    palette: "IKB",
    pages: [
      { page: 1, role: "封面", content: "五道风险闸门", sourceAnchor: "核心判断", visualEvidence: "总览" },
      { page: 2, role: "行动", content: "上线评审表", sourceAnchor: "结尾", visualEvidence: "清单" },
    ],
  }] }, null, 2)}\n`);
  files.get(planTask.taskPath).content = `${JSON.stringify(planRecord, null, 2)}\n`;
  const preparedRequestPaths = [];
  const originalEnsureFolderForPath = plugin.ensureFolderForPath.bind(plugin);
  plugin.ensureFolderForPath = async (targetPath) => {
    preparedRequestPaths.push(targetPath);
    return originalEnsureFolderForPath(targetPath);
  };
  await plugin.acceptCreationTask({ ...planRecord, taskPath: planTask.taskPath });
  assert.ok(
    preparedRequestPaths.some((targetPath) => targetPath.endsWith("/deliverables/xiaohongshu/xiaohongshu-001/requests/page-01.json")),
    "the card request directory must be created before the first per-page request is written to the vault",
  );
  const pageEntries = [...files.entries()].filter(([, record]) => {
    try { return JSON.parse(record.content).kind === "xhs.card-page"; } catch (error) { return false; }
  });
  assert.strictEqual(pageEntries.length, 2);
  for (const [, record] of pageEntries) {
    const pageTask = JSON.parse(record.content);
    pageTask.status = "awaiting_approval";
    pageTask.outputHashes = { [pageTask.outputs[0]]: `${pageTask.childKey}-v1` };
    record.content = `${JSON.stringify(pageTask, null, 2)}\n`;
  }
  await plugin.acceptXhsCardSetAndQueueQa(project.path);
  const packageEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "xhs.package"; } catch (error) { return false; }
  });
  assert.ok(packageEntry);
  let packageTask = JSON.parse(packageEntry[1].content);
  assert.ok(packageTask.inputs.includes(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json`), "full-set generation must use the exact proposal approved by the user");
  packageTask.status = "awaiting_approval";
  packageTask.qualityScore = 96;
  packageTask.qualityPassed = true;
  packageTask.outputHashes = {
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`]: "caption-v1",
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/cards-manifest.md`]: "cards-v1",
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/visual-qa.md`]: "visual-qa-v1",
  };
  packageEntry[1].content = `${JSON.stringify(packageTask, null, 2)}\n`;
  const packageAccepted = await plugin.acceptCreationTask({ ...packageTask, taskPath: packageEntry[0] });
  assert.strictEqual(packageAccepted.workflowState.currentStage, "visual", "accepting the visual package must keep the user in the visual stage while copy QA runs");
  const copyEntry = [...files.entries()].find(([, record]) => {
    try { return JSON.parse(record.content).kind === "xhs.copy-qa"; } catch (error) { return false; }
  });
  assert.ok(copyEntry);
  let copyTask = JSON.parse(copyEntry[1].content);
  assert.ok(copyTask.outputs.includes(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`), "copy QA must be able to iteratively repair only the publishing copy");
  assert.ok(copyTask.outputs.includes(`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/copy-qa.md`));
  copyTask.status = "awaiting_approval";
  copyTask.qualityScore = 97;
  copyTask.qualityPassed = true;
  copyTask.outputHashes = {
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`]: "caption-v2",
    [`${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/copy-qa.md`]: "copy-qa-v2",
  };
  copyEntry[1].content = `${JSON.stringify(copyTask, null, 2)}\n`;
  const accepted = await plugin.acceptCreationTask({ ...copyTask, taskPath: copyEntry[0] });
  assert.strictEqual(accepted.workflowState.currentStage, "final");
  assert.strictEqual(accepted.workflowState.deliverables.xiaohongshu.cardVersion, "cards-v1");
  assert.strictEqual(accepted.workflowState.deliverables.xiaohongshu.visualQaVersion, "visual-qa-v1");
  assert.strictEqual(accepted.workflowState.deliverables.xiaohongshu.captionVersion, "caption-v2");
  assert.strictEqual(accepted.workflowState.deliverables.xiaohongshu.copyQaVersion, "copy-qa-v2");
}

async function testWechatVisualChildrenRetainSuccessRetryFailureAndBlockFinalization() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files, folders } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "公众号逐图恢复", kind: "manual" }, { platform: "wechat" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "visual";
  state.deliverables.wechat.stage = "visual";
  state.deliverables.wechat.articleVersion = "article-v3";
  state.deliverables.wechat.qaVersion = "qa-v3";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/drafts/v1.md`, "# 公众号正文\n\n## 引言\n\n会做任务不等于可以上线。\n\n## 核心章节\n\n五道风险闸门需要逐项验证。\n\n## 人工接管\n\n人工接管必须可以测试。\n");
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/illustration-plan.json`, `${JSON.stringify({
    schemaVersion: 1,
    articleVersion: "article-v3",
    items: [
      { id: "hero", label: "能力与可控性", skillId: "liangkeban-xiaoxiaoke-illustrations", fileName: "01-hero.png", insertionAnchor: "引言后", sourceAnchor: "## 引言" },
      { id: "gates", label: "五道风险闸门", skillId: "baoyu-infographic", fileName: "02-gates.png", insertionAnchor: "核心章节前", sourceAnchor: "## 核心章节" },
      { id: "handoff", label: "人工接管", skillId: "liangkeban-xiaoxiaoke-illustrations", fileName: "03-handoff.png", insertionAnchor: "第四节后", sourceAnchor: "## 人工接管" },
    ],
  }, null, 2)}\n`);

  const originalAdapterWrite = app.vault.adapter.write.bind(app.vault.adapter);
  app.vault.adapter.write = async (filePath, content) => {
    const parent = String(filePath).split("/").slice(0, -1).join("/");
    if (!folders.has(parent)) throw new Error(`ENOENT: missing parent folder ${parent}`);
    return originalAdapterWrite(filePath, content);
  };

  const children = await plugin.queueWechatVisualTasks(project.path);
  assert.strictEqual(children.length, 3);
  assert.strictEqual(new Set(children.map((task) => task.taskId)).size, 3, "each illustration must have a durable child Task");
  assert.ok(children.every((task) => task.kind === "wechat.visual-item"));
  assert.deepStrictEqual([...children].map((task) => task.childKey), ["hero", "gates", "handoff"]);
  assert.ok(children[1].outputs.some((output) => output.endsWith("/visuals/02-gates.png")));
  const referencedState = await plugin.loadCreationWorkflowState(project.directory);
  assert.ok(children.every((child) => Object.values(referencedState.taskRefs).includes(child.taskPath)), "every child Task needs its own durable reference when adapter listing lags");

  const records = children.map((task) => ({ task, record: JSON.parse(files.get(task.taskPath).content) }));
  records[0].record.status = "completed";
  records[0].record.outputHashes = { [records[0].record.outputs[0]]: "hero-v1" };
  records[1].record.status = "failed";
  records[1].record.error = "图中文字渲染失败";
  records[2].record.status = "completed";
  records[2].record.outputHashes = { [records[2].record.outputs[0]]: "handoff-v1" };
  for (const { task, record } of records) files.get(task.taskPath).content = `${JSON.stringify(record, null, 2)}\n`;

  await assert.rejects(() => plugin.approveCreationVisualPackage(project.path, "wechat"), /仍有 1 个配图任务未完成/u);
  const retried = await plugin.retryCreationTask({ ...records[1].record, taskPath: records[1].task.taskPath });
  assert.strictEqual(retried.status, "pending");
  assert.strictEqual(JSON.parse(files.get(records[0].task.taskPath).content).status, "completed", "successful siblings must stay complete");
  assert.strictEqual(JSON.parse(files.get(records[2].task.taskPath).content).status, "completed");

  const retriedRecord = JSON.parse(files.get(records[1].task.taskPath).content);
  retriedRecord.status = "completed";
  retriedRecord.outputHashes = { [retriedRecord.outputs[0]]: "gates-v2" };
  files.get(records[1].task.taskPath).content = `${JSON.stringify(retriedRecord, null, 2)}\n`;
  const approved = await plugin.approveCreationVisualPackage(project.path, "wechat");
  assert.strictEqual(approved.currentStage, "final");
  assert.match(approved.deliverables.wechat.approvalVersion, /^[a-f0-9]{64}$/u, "the integrated visual approval must identify the exact child set");

  await plugin.saveCreationManualVersion(project.path, "wechatDraft", "# 公众号正文\n\n## 引言\n\n会做任务不等于可以上线。\n\n## 核心章节\n\n五道风险闸门需要逐项验证。\n\n## 人工接管\n\n人工接管必须有演练、超时和明确负责人。\n");
  const staleChildren = children.map((child) => JSON.parse(files.get(child.taskPath).content));
  assert.strictEqual(staleChildren[0].status, "completed", "an image whose anchored source section did not change must remain valid");
  assert.strictEqual(staleChildren[1].status, "completed");
  assert.strictEqual(staleChildren[2].status, "stale", "only the image anchored to the changed section becomes stale");
  assert.strictEqual(staleChildren[0].outputHashes[staleChildren[0].outputs[0]], "hero-v1");
  assert.strictEqual(staleChildren[1].outputHashes[staleChildren[1].outputs[0]], "gates-v2");
  assert.strictEqual(staleChildren[2].outputHashes[staleChildren[2].outputs[0]], "handoff-v1", "stale image output remains available for comparison");
  const reopened = await plugin.loadCreationWorkflowState(project.directory);
  assert.strictEqual(reopened.currentStage, "draft");
  assert.ok(reopened.deliverables.wechat.staleStages.includes("visual"));
  assert.ok(reopened.deliverables.wechat.staleStages.includes("final"));
}

async function testWechatVisualTaskCanChangeSkillAndPromptBeforeFinalAcceptance() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "逐图可调整", kind: "manual" }, { platform: "wechat" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "visual";
  state.deliverables.wechat.stage = "visual";
  state.deliverables.wechat.visualGroupId = "wechat-visual-editable";
  await plugin.saveCreationWorkflowState(project.directory, state);
  await plugin.writeText(`${project.directory}/deliverables/wechat/wechat-001/visuals/requests/gates.json`, `${JSON.stringify({
    schemaVersion: 1,
    groupId: "wechat-visual-editable",
    id: "gates",
    label: "五道风险闸门",
    skillId: "baoyu-infographic",
    purpose: "用清晰的风险矩阵解释五道闸门",
  }, null, 2)}\n`);
  const task = await plugin.queueCreationStageTask(project.path, "wechat.visual-item", {
    skillId: "baoyu-infographic",
    childKey: "gates",
    childLabel: "五道风险闸门",
    groupId: "wechat-visual-editable",
    requiredChildCount: 1,
    inputOverride: ["project.md", "deliverables/wechat/wechat-001/visuals/requests/gates.json"],
    outputOverride: ["deliverables/wechat/wechat-001/visuals/02-gates.png", "deliverables/wechat/wechat-001/visuals/results/gates.json"],
  });
  const queuedTask = JSON.parse(files.get(task.taskPath).content);
  queuedTask.status = "awaiting_approval";
  files.get(task.taskPath).content = `${JSON.stringify(queuedTask, null, 2)}\n`;
  task.status = "awaiting_approval";
  const next = await plugin.editCreationVisualTask(task, {
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    prompt: "用两克伴小小克风格，画出五道风险闸门的工程现场隐喻，留白充足，不放文字。",
  });
  assert.strictEqual(next.skillId, "liangkeban-xiaoxiaoke-illustrations");
  assert.strictEqual(next.status, "pending");
  assert.strictEqual(JSON.parse(files.get(task.taskPath).content).status, "superseded");
  const request = JSON.parse(files.get(`${project.directory}/deliverables/wechat/wechat-001/visuals/requests/gates.json`).content);
  assert.strictEqual(request.skillId, "liangkeban-xiaoxiaoke-illustrations");
  assert.match(request.prompt, /两克伴小小克/);
  assert.strictEqual(request.previousTaskId, task.taskId);
  const savedState = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(savedState.currentStage, "visual");
  assert.strictEqual(savedState.deliverables.wechat.taskState, "visual_children_queued");
}

async function testXhsCardTaskCanBeRevisedWithoutDiscardingOtherPages() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "小红书逐页可调整", kind: "manual" }, { platform: "xiaohongshu" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "draft";
  state.deliverables.xiaohongshu.stage = "draft";
  state.deliverables.xiaohongshu.cardGroupId = "xhs-editable-pages";
  await plugin.saveCreationWorkflowState(project.directory, state);
  const requestPath = `${project.directory}/deliverables/xiaohongshu/xiaohongshu-001/requests/page-02.json`;
  await plugin.writeText(requestPath, `${JSON.stringify({
    schemaVersion: 1,
    groupId: "xhs-editable-pages",
    proposalId: "ikb",
    template: "Swiss System",
    palette: {
      theme: "ikb",
      colors: { paper: "#F4F0E6", accent: "#002FA7", ink: "#111318" },
    },
    page: 2,
    id: "page-02",
    fileName: "xhs-02.png",
    role: "关键内容页",
    content: "把记忆从聊天记录迁回项目目录。",
    sourceAnchor: "主简报的核心判断",
    visualEvidence: "可检索、可恢复、可交接",
  }, null, 2)}\n`);
  const task = await plugin.queueCreationStageTask(project.path, "xhs.card-page", {
    skillId: "keke-social-card-skill",
    childKey: "page-02",
    childLabel: "第 2 页 · 关键内容页",
    groupId: "xhs-editable-pages",
    requiredChildCount: 3,
    inputOverride: ["project.md", "deliverables/xiaohongshu/xiaohongshu-001/requests/page-02.json"],
    outputOverride: ["deliverables/xiaohongshu/xiaohongshu-001/images/xhs-02.png", "deliverables/xiaohongshu/xiaohongshu-001/results/page-02.json"],
  });
  const queuedTask = JSON.parse(files.get(task.taskPath).content);
  queuedTask.status = "awaiting_approval";
  files.get(task.taskPath).content = `${JSON.stringify(queuedTask, null, 2)}\n`;
  task.status = "awaiting_approval";

  const next = await plugin.editXhsCardTask(task, "保留 IKB 和 Swiss System，但把关键关系改为从聊天记录回流到项目目录，文字更少、留白更大。");

  assert.strictEqual(next.kind, "xhs.card-page");
  assert.strictEqual(next.skillId, "keke-social-card-skill");
  assert.strictEqual(next.status, "pending");
  assert.strictEqual(next.childKey, "page-02");
  assert.strictEqual(JSON.parse(files.get(task.taskPath).content).status, "superseded");
  const request = JSON.parse(files.get(requestPath).content);
  assert.strictEqual(request.revision, 2);
  assert.strictEqual(request.previousTaskId, task.taskId);
  assert.match(request.userRevisionInstruction, /回流到项目目录/u);
  assert.deepStrictEqual(request.palette, {
    theme: "ikb",
    colors: { paper: "#F4F0E6", accent: "#002FA7", ink: "#111318" },
  }, "单页自然语言修改必须保留既定模板与配色，不得改写其他方案参数");
  const savedState = JSON.parse(files.get(`${project.directory}/workflow-state.json`).content);
  assert.strictEqual(savedState.currentStage, "draft");
  assert.strictEqual(savedState.deliverables.xiaohongshu.taskState, "card_children_queued");
}

async function testVisualTaskPromptRewriteUsesSelectedSkillDesignBrief() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const request = {
    label: "Loop 在节点内，Graph 在节点之间",
    purpose: "把 Loop 与 Graph 从替代关系改写为嵌套和组合关系",
    insertionAnchor: "解释 Graph Engineering 的核心段落之后",
  };
  const xiaoxiaoke = plugin.buildCreationVisualPrompt(request, {}, "liangkeban-xiaoxiaoke-illustrations");
  assert.match(xiaoxiaoke, /1600×900/u);
  assert.match(xiaoxiaoke, /纯白背景/u);
  assert.match(xiaoxiaoke, /小小克 IP/u);
  assert.match(xiaoxiaoke, /节点内 Loop/u);
  assert.match(xiaoxiaoke, /至少保留 35% 留白/u);
  assert.match(xiaoxiaoke, /不要复刻旧图/u);
  assert.ok(xiaoxiaoke.length > 650, "小小克重写提示词必须保留完整的视觉、构图与禁忌约束");

  const infographic = plugin.buildCreationVisualPrompt(request, {}, "baoyu-infographic");
  assert.match(infographic, /technical-schematic/u);
  assert.match(infographic, /structural-breakdown/u);
  assert.match(infographic, /节点内部的 Loop/u);
  assert.ok(infographic.length > 550, "信息图重写提示词必须包含完整信息结构与视觉约束");

  const decision = plugin.buildCreationVisualPrompt({
    label: "你的 Agent 该继续 Loop，还是上 Graph？",
    purpose: "判断什么时候用局部闭环，什么时候需要多节点协作",
  }, {}, "liangkeban-xiaoxiaoke-illustrations");
  assert.match(decision, /不对称的工程选择台/u);
  assert.match(decision, /复杂度阈值/u);
  assert.match(decision, /绝不使用中心圆盘/u);
  assert.doesNotMatch(decision, /节点里的小循环嵌在更大网络中/u, "决策图不能复用嵌套结构图的构图");
  assert.notStrictEqual(decision, xiaoxiaoke, "同一主题簇的不同用途必须生成不同的配图提示词");
}

async function testXhsCardChildrenRetainSuccessfulPagesAndRetryOnlyFailure() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app, files } = makeFakeApp();
  plugin.app = app;
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects", defaultWritingStyle: "keke" };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "小红书逐页恢复", kind: "manual" }, { platform: "xiaohongshu" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state.currentStage = "draft";
  state.masterBriefVersion = "brief-v1";
  state.deliverables.xiaohongshu.stage = "draft";
  state.deliverables.xiaohongshu.planVersion = "plan-v1";
  await plugin.saveCreationWorkflowState(project.directory, state);
  const deliverableRoot = `${project.directory}/deliverables/xiaohongshu/xiaohongshu-001`;
  await plugin.writeText(`${deliverableRoot}/proposals.json`, `${JSON.stringify({ schemaVersion: 1, proposals: [{
    id: "route-a",
    name: "审计轨迹",
    template: "Swiss System",
    palette: "IKB",
    pageCount: 3,
    pages: [
      { page: 1, role: "封面", content: "上线前先过五道闸门", sourceAnchor: "核心判断", visualEvidence: "总览" },
      { page: 2, role: "问题", content: "会做任务不等于可上线", sourceAnchor: "引言", visualEvidence: "对照" },
      { page: 3, role: "行动", content: "保存评审表", sourceAnchor: "结尾", visualEvidence: "清单" },
    ],
  }] }, null, 2)}\n`);
  await plugin.saveCreationPlanDecision(project.path, "xiaohongshu", { selectedProposal: "route-a", planVersion: "plan-v1" });

  const children = await plugin.queueXhsCardTasks(project.path);
  assert.strictEqual(children.length, 3);
  assert.deepStrictEqual([...children].map((task) => task.childKey), ["page-01", "page-02", "page-03"]);
  assert.ok(children[2].outputs.some((output) => output.endsWith("/images/xhs-03.png")));
  const records = children.map((task) => ({ task, record: JSON.parse(files.get(task.taskPath).content) }));
  for (const [index, item] of records.entries()) {
    item.record.status = index === 1 ? "failed" : "awaiting_approval";
    item.record.error = index === 1 ? "第二页中文断行失败" : "";
    item.record.outputHashes = index === 1 ? {} : { [item.record.outputs[0]]: `page-${index + 1}-v1` };
    files.get(item.task.taskPath).content = `${JSON.stringify(item.record, null, 2)}\n`;
  }
  await assert.rejects(() => plugin.acceptXhsCardSetAndQueueQa(project.path), /仍有 1 页未生成成功/u);
  await plugin.retryCreationTask({ ...records[1].record, taskPath: records[1].task.taskPath });
  assert.strictEqual(JSON.parse(files.get(records[0].task.taskPath).content).status, "awaiting_approval");
  assert.strictEqual(JSON.parse(files.get(records[2].task.taskPath).content).status, "awaiting_approval");
  const repaired = JSON.parse(files.get(records[1].task.taskPath).content);
  repaired.status = "awaiting_approval";
  repaired.outputHashes = { [repaired.outputs[0]]: "page-2-v2" };
  files.get(records[1].task.taskPath).content = `${JSON.stringify(repaired, null, 2)}\n`;

  const packageTask = await plugin.acceptXhsCardSetAndQueueQa(project.path);
  assert.strictEqual(packageTask.kind, "xhs.package");
  assert.ok(packageTask.inputs.some((input) => input.endsWith("/images/xhs-01.png")));
  assert.ok(packageTask.inputs.some((input) => input.endsWith("/images/xhs-02.png")));
  assert.ok(packageTask.inputs.some((input) => input.endsWith("/images/xhs-03.png")));
  assert.ok(children.every((child) => JSON.parse(files.get(child.taskPath).content).status === "completed"));
  const firstQaAttempt = JSON.parse(files.get(packageTask.taskPath).content);
  firstQaAttempt.status = "awaiting_approval";
  firstQaAttempt.qualityScore = 91;
  firstQaAttempt.qualityPassed = false;
  firstQaAttempt.qualityIterations = 1;
  files.get(packageTask.taskPath).content = `${JSON.stringify(firstQaAttempt, null, 2)}\n`;
  const nextQaAttempt = await plugin.continueCreationQualityIteration({ ...firstQaAttempt, taskPath: packageTask.taskPath });
  assert.deepStrictEqual([...nextQaAttempt.inputs], [...firstQaAttempt.inputs], "visual QA iteration must keep the exact accepted page artifacts as inputs");
  assert.deepStrictEqual([...nextQaAttempt.outputDirectories], [], "visual QA iteration must not regain permission to overwrite page images");
}

async function testCreationViewExposesPerItemVisualRecoveryWithoutDiscardingSuccess() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let retried = "";
  plugin.retryCreationTask = async (task) => { retried = task.childKey; return task; };
  let edited = "";
  plugin.openXhsCardTaskEditor = (task) => { edited = task.childKey; };
  let state = creationWorkflow.createWorkflowState({ projectId: "xhs-partial-view", title: "XHS partial", activeDeliverable: "xiaohongshu" });
  state.currentStage = "draft";
  state.deliverables.xiaohongshu.stage = "draft";
  state.deliverables.xiaohongshu.cardGroupId = "group-a";
  const retryTask = { kind: "xhs.card-page", groupId: "group-a", childKey: "page-02", childLabel: "第 2 页 · 问题", skillId: "keke-social-card-skill", status: "failed", error: "中文断行失败", outputs: ["Reading Capture/creation-projects/xhs-partial-view/deliverables/xiaohongshu/xiaohongshu-001/images/xhs-02.png"], taskPath: "queue/page-02.json" };
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/xhs-partial-view/project.md",
    directory: "Reading Capture/creation-projects/xhs-partial-view",
    title: "XHS partial",
    platform: "xiaohongshu",
    statusLabel: "内容审核",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: state,
    stageStates: creationWorkflow.deriveStageStates(state),
    xhsCardsManifest: "",
    tasks: [
      { kind: "xhs.card-page", groupId: "group-a", childKey: "page-01", childLabel: "第 1 页 · 封面", skillId: "keke-social-card-skill", status: "awaiting_approval", outputs: ["Reading Capture/creation-projects/xhs-partial-view/deliverables/xiaohongshu/xiaohongshu-001/images/xhs-01.png"] },
      retryTask,
    ],
  }];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("逐页生成：1/2 页可审核。成功页面会保留，失败页面只重试自身。"));
  assert.ok(texts.includes("中文断行失败"));
  assert.ok(texts.includes("仅重试此页"));
  assert.ok(texts.includes("修改此页"));
  assert.ok(!texts.includes("重试此任务"), "visual child failures must expose one authoritative inline retry action");
  assert.ok(!texts.includes("取消任务"), "visual child failures must not duplicate generic task actions above the stage workspace");
  const allElements = [];
  const collect = (node) => { allElements.push(node); for (const child of node.children || []) collect(child); };
  collect(view.containerEl.children[1]);
  const batch = allElements.find((element) => element.tag === "button" && element.text === "确认当前页面集，启动整套视觉与文案质检");
  assert.strictEqual(batch.disabled, true, "one failed page must block package QA without hiding the successful page");
  const retry = allElements.find((element) => element.tag === "button" && element.text === "仅重试此页");
  await retry.listeners.click();
  assert.strictEqual(retried, "page-02");
  assert.strictEqual(retryTask.status, "pending", "点击重试后，该页必须立即在界面中显示为已入队，而不是继续停留在失败状态");
  const edit = allElements.find((element) => element.tag === "button" && element.text === "修改此页");
  await edit.listeners.click();
  assert.strictEqual(edited, "page-01");

}

async function testXhsContentReviewShowsCardThumbnailsInsteadOfManifestDump() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  app.vault.getResourcePath = (file) => `app://vault/${file.path}`;
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let edited = "";
  plugin.openXhsCardTaskEditor = (task) => { edited = task.childKey; };
  const root = "Reading Capture/creation-projects/xhs-review-gallery";
  const imageRoot = `${root}/deliverables/xiaohongshu/xiaohongshu-001/images`;
  const state = creationWorkflow.createWorkflowState({ projectId: "xhs-review-gallery", title: "XHS review", activeDeliverable: "xiaohongshu" });
  state.currentStage = "draft";
  state.deliverables.xiaohongshu.stage = "draft";
  state.deliverables.xiaohongshu.cardGroupId = "group-a";
  const project = {
    path: `${root}/project.md`,
    directory: root,
    title: "XHS review",
    platform: "xiaohongshu",
    statusLabel: "内容审核",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: state,
    stageStates: creationWorkflow.deriveStageStates(state),
    xhsCardsManifest: "## 卡片清单\\n这里是机器可读的长清单，不应该作为人工审核主界面。",
    xhsCaption: "一份可发布的小红书文案。",
    xhsImageFiles: [
      { path: `${imageRoot}/xhs-01.png`, name: "xhs-01.png" },
      { path: `${imageRoot}/xhs-02.png`, name: "xhs-02.png" },
    ],
    tasks: [
      { kind: "xhs.card-page", groupId: "group-a", childKey: "page-01", childLabel: "第 1 页 · 封面", skillId: "keke-social-card-skill", status: "completed", outputs: [`${imageRoot}/xhs-01.png`] },
      { kind: "xhs.card-page", groupId: "group-a", childKey: "page-02", childLabel: "第 2 页 · 要点", skillId: "keke-social-card-skill", status: "awaiting_approval", outputs: [`${imageRoot}/xhs-02.png`] },
      { kind: "xhs.package", groupId: "group-a", status: "awaiting_approval", qualityScore: 96, qualityPassed: true },
      { kind: "xhs.copy-qa", groupId: "group-a", status: "awaiting_approval", qualityScore: 97, qualityPassed: true },
    ],
  };
  plugin.listCreationProjects = async () => [project];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const screen = view.containerEl.children[1];
  const texts = fakeElementTexts(screen);
  assert.ok(texts.includes("逐页卡片审核"));
  assert.ok(!texts.includes("这里是机器可读的长清单，不应该作为人工审核主界面。"));
  assert.strictEqual(fakeElementsByClass(screen, "reading-capture-creation-xhs-card-tile").length, 2);
  assert.strictEqual(fakeElementsByTag(screen, "img").length, 2);
  const edit = fakeElementsByTag(screen, "button").find((element) => element.text === "修改此页");
  await edit.listeners.click();
  assert.strictEqual(edited, "page-01");

  // The accepted visual package must advance to the visual stage while the
  // copy QA is still running; raw manifests must never return as the review UI.
  project.workflowState.currentStage = "visual";
  project.workflowState.deliverables.xiaohongshu.stage = "visual";
  project.tasks = project.tasks.map((task) => task.kind === "xhs.package"
    ? { ...task, status: "completed" }
    : task.kind === "xhs.copy-qa"
      ? { ...task, status: "running" }
      : task);
  await view.reload();
  const visualTexts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(visualTexts.includes("视觉审核已通过 · 正在进行发布文案质检"));
  assert.ok(visualTexts.includes("逐页卡片审核"));
  assert.ok(!visualTexts.includes("这里是机器可读的长清单，不应该作为人工审核主界面。"));
  assert.strictEqual(fakeElementsByClass(view.containerEl.children[1], "reading-capture-creation-xhs-card-tile").length, 2);
}

async function testWechatVisualViewSummarizesBlockedAndPendingWork() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let state = creationWorkflow.createWorkflowState({ projectId: "wechat-visual-status", title: "Wechat visual status", activeDeliverable: "wechat" });
  state.currentStage = "visual";
  state.deliverables.wechat.stage = "visual";
  state.deliverables.wechat.taskState = "visual_children_queued";
  state.deliverables.wechat.visualGroupId = "group-a";
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/wechat-visual-status/project.md",
    directory: "Reading Capture/creation-projects/wechat-visual-status",
    title: "Wechat visual status",
    platform: "wechat",
    statusLabel: "视觉方案",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: state,
    stageStates: creationWorkflow.deriveStageStates(state),
    wechatVisualManifest: "",
    wechatVisualFiles: [],
    tasks: [
      { kind: "wechat.visual-item", groupId: "group-a", childKey: "image-01", childLabel: "已确认图", skillId: "liangkeban-xiaoxiaoke-illustrations", status: "completed" },
      { kind: "wechat.visual-item", groupId: "group-a", childKey: "image-02", childLabel: "待验收图", skillId: "liangkeban-xiaoxiaoke-illustrations", status: "awaiting_approval" },
      { kind: "wechat.visual-item", groupId: "group-a", childKey: "image-03", childLabel: "缺 Skill 图", skillId: "baoyu-infographic", status: "waiting_user", waitingReason: "missing_skill", error: "本机尚未安装任务锁定的 Skill 版本", skillRequirement: { skillId: "baoyu-infographic" } },
    ],
  }];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("配图任务状态 · 1/3 已确认"));
  assert.ok(texts.includes("已确认 1 张 · 已生成待你验收 1 张 · 正在执行 0 张 · 需要处理 1 张"));
  assert.ok(texts.includes("查看并安装固定版本"));
  assert.ok(texts.includes("查看并安装固定版本，然后继续 1 张图"));
  assert.ok(!texts.includes("查看任务执行与异常恢复"), "task status must be visible without an unopened disclosure");
}

async function testCreationProjectViewShowsEightStageEntryContract() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/project-1/project.md",
    directory: "Reading Capture/creation-projects/project-1",
    title: "Project 1",
    platform: "wechat",
    statusLabel: "策划中",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: creationWorkflow.createWorkflowState({
      projectId: "project-1",
      title: "Project 1",
      workflowMode: "idea_creation",
      activeDeliverable: "wechat",
    }),
    stageStates: {
      relations: "current",
      diagnosis: "blocked",
      research: "blocked",
      brief: "blocked",
      plan: "blocked",
      draft: "blocked",
      visual: "blocked",
      final: "blocked",
    },
    latestTask: null,
  }];
  plugin.buildTopicPoolItems = async () => [{ id: "related-1", kind: "manual", note: "Related idea" }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  for (const label of ["项目与灵感", "素材诊断", "研究与证据", "主简报审核", "平台内容方案", "内容审核", "视觉方案", "定稿与导出"]) {
    assert.ok(texts.includes(label), `stage navigation should show ${label}`);
  }
  assert.ok(texts.includes("从创作灵感开始"));
  assert.ok(texts.includes("我确认当前主灵感正确"));
  assert.ok(texts.includes("我确认关联灵感范围正确"));
  assert.ok(texts.includes("增加关联灵感"), "stage one should expose an explicit related inspiration add action");
  assert.ok(texts.includes("确认项目输入，进入素材诊断"));
  assert.ok(!texts.includes("确认简报与提纲"), "stage one must not expose the legacy combined approval");

  const addRelated = fakeElementsByTag(view.containerEl.children[1], "button").find((button) => button.text === "增加关联灵感");
  await addRelated.listeners.click();
  assert.ok(fakeElementTexts(view.containerEl.children[1]).includes("选择要关联的灵感"), "related inspiration picker should open in place");

  view.projects.push({ ...view.projects[0], path: "Reading Capture/creation-projects/project-2/project.md", title: "Project 2" });
  const switchButton = fakeElementsByTag(view.containerEl.children[1], "button").find((button) => button.text === "切换项目");
  await switchButton.listeners.click();
  const pickerOptions = fakeElementsByClass(view.containerEl.children[1], "reading-capture-creation-project-options")[0];
  const optionCopies = fakeElementsByClass(pickerOptions, "reading-capture-creation-project-option-copy");
  assert.strictEqual(optionCopies.length, 2, "project picker should show all available projects by default");
  assert.ok(fakeElementTexts(optionCopies[0]).includes("Project 1"));
  assert.ok(fakeElementTexts(optionCopies[0]).some((text) => text.includes("策划中")), "project option should keep status in a separate metadata row");
}

async function testCreationProjectViewShowsDiagnosisContract() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let selectedDecision = "";
  plugin.chooseCreationResearchPath = async (_projectPath, decision) => { selectedDecision = decision; };
  const workflowState = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({
    projectId: "project-2",
    title: "Diagnosis",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  }));
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/project-2/project.md",
    directory: "Reading Capture/creation-projects/project-2",
    title: "Diagnosis",
    platform: "wechat",
    statusLabel: "整理素材",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  for (const text of ["先看材料够不够，再决定是否研究", "补充本地材料", "直接进入研究配置", "本次不做联网研究", "我的补充材料", "联网研究指导"]) {
    assert.ok(texts.includes(text), `diagnosis should show ${text}`);
  }
  const researchButton = fakeElementByText(view.containerEl.children[1], "直接进入研究配置");
  assert.ok(researchButton && researchButton.listeners.click, "research action should be wired");
  await researchButton.listeners.click();
  assert.strictEqual(selectedDecision, "research");
}

async function testDiagnosisReviewReturnsToResearchWithoutRepeatingDecision() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let decisionCalls = 0;
  plugin.chooseCreationResearchPath = async () => { decisionCalls += 1; };
  let workflowState = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({
    projectId: "project-return-to-research",
    title: "Research configured",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  }));
  workflowState = creationWorkflow.chooseResearchDecision(workflowState, "research");
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/project-return-to-research/project.md",
    directory: "Reading Capture/creation-projects/project-return-to-research",
    title: "Research configured",
    platform: "wechat",
    statusLabel: "研究与证据",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  view.displayedStage = "diagnosis";
  await view.reload();
  const returnButton = fakeElementByText(view.containerEl.children[1], "返回研究配置");
  assert.ok(returnButton && returnButton.listeners.click, "reviewed diagnosis should offer a return to the active research stage");
  await returnButton.listeners.click();
  assert.strictEqual(decisionCalls, 0, "returning to research must not submit the diagnosis decision a second time");
  assert.ok(fakeElementTexts(view.containerEl.children[1]).includes("研究范围由你决定"), "return action should render the research configuration stage");
}

async function testCreationTaskAlertsExplainRecoveryByWaitingReason() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/project-alert/project.md",
    directory: "Reading Capture/creation-projects/project-alert",
    title: "Recovery",
    platform: "wechat",
    statusLabel: "等待处理",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: creationWorkflow.createWorkflowState({ projectId: "project-alert", title: "Recovery", activeDeliverable: "wechat" }),
    stageStates: {},
    tasks: [
      { status: "waiting_user", skillId: "missing-demo", waitingReason: "missing_skill", error: "skill not found" },
      { status: "waiting_user", skillId: "upgrade-demo", waitingReason: "skill_permission_expansion", error: "permission expansion" },
      { status: "waiting_user", skillId: "permission-demo", waitingReason: "credentials_or_permission", error: "permission denied" },
    ],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("本机缺少任务锁定的 Skill 版本，或已安装内容未通过摘要校验。安装前可查看来源、固定版本、依赖和权限。"));
  assert.ok(texts.includes("Skill 新版本扩大了读取、写入、联网或凭证权限。旧版本仍保留，新版本需重新批准后才能安装。"));
  assert.ok(texts.includes("查看并安装固定版本"));
  assert.ok(texts.includes("查看权限变化"));
}

async function testCancelledDiagnosisCanRestartFromTheCurrentProjectPage() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const projectPath = "Reading Capture/creation-projects/cancelled-diagnosis/project.md";
  const cancelledTask = {
    taskPath: "Reading Capture/creation-projects/_runner/queue/cancelled-diagnosis.json",
    projectPath,
    kind: "diagnosis.materials",
    skillId: "writing-styles",
    status: "cancelled",
    error: "已由用户取消",
  };
  let restarted = null;
  plugin.retryCreationTask = async (task) => { restarted = task; return { ...task, status: "pending" }; };
  const workflowState = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({
    projectId: "cancelled-diagnosis",
    title: "Cancelled diagnosis",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  }));
  plugin.listCreationProjects = async () => [{
    path: projectPath,
    directory: "Reading Capture/creation-projects/cancelled-diagnosis",
    title: "Cancelled diagnosis",
    platform: "wechat",
    statusLabel: "素材诊断",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
    tasks: [cancelledTask],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("材料诊断等待重新启动"));
  assert.ok(texts.includes("重新启动此任务"));
  assert.ok(!texts.includes("取消任务"), "a cancelled task must not offer a second cancellation");
  const restart = fakeElementByText(view.containerEl.children[1], "重新启动此任务");
  await restart.listeners.click();
  assert.strictEqual(restarted, cancelledTask);
}

async function testSupersededCancelledSampleDoesNotDistractTheActiveWorkflow() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const projectPath = "Reading Capture/creation-projects/current-xhs/project.md";
  const cancelledSample = {
    taskPath: "Reading Capture/creation-projects/_runner/queue/cancelled-samples.json",
    projectPath,
    kind: "xhs.samples",
    skillId: "keke-social-card-skill",
    status: "cancelled",
    createdAt: "2026-07-27T22:32:34+08:00",
    updatedAt: "2026-07-27T22:54:21+08:00",
    error: "已由用户取消",
  };
  const replacementSample = {
    taskPath: "Reading Capture/creation-projects/_runner/queue/replacement-samples.json",
    projectPath,
    kind: "xhs.samples",
    skillId: "keke-social-card-skill",
    status: "completed",
    createdAt: "2026-07-27T22:46:16+08:00",
    updatedAt: "2026-07-27T22:56:39+08:00",
  };
  const cardTask = {
    taskPath: "Reading Capture/creation-projects/_runner/queue/card-page.json",
    projectPath,
    kind: "xhs.card-page",
    skillId: "keke-social-card-skill",
    status: "running",
    createdAt: "2026-07-27T23:29:04+08:00",
    updatedAt: "2026-07-27T23:29:08+08:00",
  };
  const workflowSeed = creationWorkflow.createWorkflowState({
    projectId: "current-xhs",
    title: "Current xhs",
    workflowMode: "article_repurpose",
    activeDeliverable: "xiaohongshu",
  });
  const workflowState = {
    ...creationWorkflow.updateDeliverableStage(workflowSeed, "xiaohongshu", "draft"),
    currentStage: "draft",
  };
  plugin.listCreationProjects = async () => [{
    path: projectPath,
    directory: "Reading Capture/creation-projects/current-xhs",
    title: "Current xhs",
    platform: "xiaohongshu",
    statusLabel: "内容审核",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
    tasks: [cancelledSample, replacementSample, cardTask],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(!texts.includes("重新启动此任务"), "a cancelled sample with a newer replacement must stay in project history, not interrupt the active workflow");
  assert.ok(texts.includes("后台执行状态"));
}

function testPublicationReviewModalUsesWideCompactGrid() {
  const main = fs.readFileSync(path.join(__dirname, "../plugin/main.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../plugin/styles.css"), "utf8");
  assert.match(main, /class CreationPublicationReviewModal[\s\S]*?modalEl\.addClass\([^\n]*reading-capture-publication-review-shell/, "publication review should widen the modal shell, not only its inner content");
  assert.match(css, /\.reading-capture-modal-shell\.reading-capture-publication-review-shell\s*\{[\s\S]*?width:\s*min\(920px/, "publication review shell should be wide enough for the two-column review grid");
  assert.match(css, /\.reading-capture-publication-review-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/, "publication review fields should remain a compact two-column grid on normal windows");
}

async function testCreationProjectViewShowsOrderedResearchAuthorizationContract() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const queuedResearchSkills = [];
  plugin.queueCreationStageTask = async (_projectPath, kind, options) => { queuedResearchSkills.push([kind, options.skillId]); return {}; };
  let savedResearchGuidance = null;
  plugin.saveCreationResearchGuidance = async (projectPath, content) => { savedResearchGuidance = { projectPath, content }; };
  const base = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({ projectId: "p3", title: "Research", activeDeliverable: "wechat" }));
  const workflowState = creationWorkflow.chooseResearchDecision(base, "research");
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/p3/project.md",
    directory: "Reading Capture/creation-projects/p3",
    title: "Research",
    platform: "wechat",
    statusLabel: "研究配置",
    primaryTitle: "Primary",
    relatedTitles: [],
    diagnosis: "# 材料诊断\n\n## 结论\n\n需要核验真实生产案例与权威来源。",
    researchRequest: "优先核验近两年的生产案例。",
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
    tasks: [],
  }];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  const ordered = ["1. 选择研究能力", "2. 本次发送范围与修改入口", "3. 选择本阶段如何结束"];
  let last = -1;
  for (const text of ordered) {
    const index = texts.indexOf(text);
    assert.ok(index > last, `${text} should appear in explicit order`);
    last = index;
  }
  assert.ok(texts.includes("Deep Research Skills"));
  assert.ok(texts.includes("Last30Days"));
  assert.ok(texts.includes("第 2 步的诊断结论会自动带入本次研究"));
  assert.ok(texts.includes("自动带入：完整材料诊断（包括成熟度、已有证据、缺口、风险与建议研究路线）。"));
  assert.ok(texts.includes("补充研究指导（可留空）"));
  assert.ok(texts.includes("展开本次诊断结论"));
  assert.ok(texts.includes("以下内容会成为本次研究的上下文"));
  assert.ok(texts.includes("返回第 1 步调整关联灵感"));
  assert.ok(texts.includes("返回第 2 步调整材料与研究方向"));
  assert.ok(texts.includes("授权以上内容并开始研究"));
  assert.ok(texts.includes("改变决定：本次不联网"));
  const allElements = [];
  const collect = (node) => { allElements.push(node); for (const child of node.children || []) collect(child); };
  collect(view.containerEl.children[1]);
  const start = allElements.find((element) => element.tag === "button" && element.text === "授权以上内容并开始研究");
  const startHint = allElements.find((element) => element.tag === "small" && element.classes.has("reading-capture-creation-start-hint"));
  assert.strictEqual(startHint.textContent, "还需完成：确认以上发送范围并勾选联网研究授权。");
  const guidance = allElements.find((element) => element.tag === "textarea");
  assert.strictEqual(guidance.value, "优先核验近两年的生产案例。", "saved guidance must remain visible as optional additional direction");
  guidance.value = "只核验真实生产案例。";
  await guidance.listeners.blur();
  assert.deepStrictEqual(savedResearchGuidance, {
    projectPath: "Reading Capture/creation-projects/p3/project.md",
    content: "只核验真实生产案例。",
  }, "additional research guidance must persist before the task is started");
  const authorization = allElements.find((element) => element.tag === "input" && element.attrs.type === "checkbox" && !element.attrs.value && element.checked !== true);
  authorization.checked = true;
  authorization.listeners.change();
  assert.strictEqual(start.disabled, false, "authorization should enable research once a route is selected; viewing the scope is not an irreversible gate");
  assert.strictEqual(startHint.textContent, "已完成核对与授权，可以开始研究。");
  const selectedRoute = allElements.find((element) => element.tag === "input" && element.value === "deep-research-skills");
  const disabledRoute = allElements.find((element) => element.tag === "input" && element.value === "last30days");
  assert.strictEqual(disabledRoute.disabled, true, "unsafe optional research routes must be visibly unavailable before authorization");
  delete selectedRoute.attrs;
  await start.listeners.click();
  assert.deepStrictEqual(queuedResearchSkills, [["research.evidence", "deep-research-skills"]], "the browser input value must be used without relying on fake attrs metadata");
}

async function testResearchReviewOpensRouteOutputsBeforeAcceptance() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const opened = [];
  plugin.openCreationProjectFile = (filePath) => { opened.push(filePath); };
  const directory = "Reading Capture/creation-projects/review-route";
  const workflowState = creationWorkflow.chooseResearchDecision(
    creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({ projectId: "review-route", title: "Route review", activeDeliverable: "wechat" })),
    "research",
  );
  plugin.listCreationProjects = async () => [{
    path: `${directory}/project.md`,
    directory,
    title: "Route review",
    platform: "wechat",
    statusLabel: "研究与证据",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState,
    stageStates: creationWorkflow.deriveStageStates(workflowState),
    tasks: [{
      taskId: "route-review",
      kind: "research.evidence",
      skillId: "deep-research-skills",
      status: "awaiting_approval",
      outputs: [`${directory}/research/routes/deep-research-skills/evidence.md`, `${directory}/research/routes/deep-research-skills/sources.md`],
    }],
  }];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("Deep Research Skills · 等待你的审核"));
  assert.ok(texts.includes("请先检查每条研究路线的独立证据与来源。点击接受后，系统才会把已确认内容合并到项目的研究总汇。"));
  const evidence = fakeElementByText(view.containerEl.children[1], "查看研究证据");
  const sources = fakeElementByText(view.containerEl.children[1], "查看来源与冲突");
  evidence.listeners.click();
  sources.listeners.click();
  assert.deepStrictEqual(opened, [
    `${directory}/research/routes/deep-research-skills/evidence.md`,
    `${directory}/research/routes/deep-research-skills/sources.md`,
  ], "review buttons must open route outputs, never the pre-acceptance placeholder summary files");
}

async function testCreationProjectViewShowsBriefBeforeApproval() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  let state = creationWorkflow.enterDiagnosis(creationWorkflow.createWorkflowState({ projectId: "p4", title: "Brief", activeDeliverable: "wechat" }));
  state = creationWorkflow.chooseResearchDecision(state, "skip");
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/p4/project.md",
    directory: "Reading Capture/creation-projects/p4",
    title: "Brief",
    platform: "wechat",
    statusLabel: "受限简报",
    primaryTitle: "Primary",
    relatedTitles: [],
    workflowState: state,
    stageStates: creationWorkflow.deriveStageStates(state),
    masterBrief: "# 创作简报\n\n核心判断：必须先建立可回滚机制。",
    tasks: [{ kind: "brief.master", status: "awaiting_approval", attempts: 2, taskPath: "queue/brief.json", outputHashes: { brief: "hash-v2" } }],
  }];
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("完整创作简报"));
  const briefEditor = fakeElementsByClass(view.containerEl.children[1], "reading-capture-creation-brief-editor")[0];
  assert.ok(briefEditor && briefEditor.value.includes("必须先建立可回滚机制"), "brief content must be visible before approval");
  assert.ok(texts.includes("我已阅读完整简报"));
  assert.ok(texts.includes("确认简报 AI 生成版 v2，进入平台方案"));
  const approve = fakeElementByText(view.containerEl.children[1], "确认简报 AI 生成版 v2，进入平台方案");
  assert.strictEqual(approve.disabled, true, "approval stays disabled until the visible brief is acknowledged");
}

async function testCreationProjectListUsesActiveDeliverableAndFriendlyWorkflowStatus() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    defaultWritingStyle: "keke",
  };
  plugin.now = () => fixedNow;
  const project = await plugin.createCreationProject({ title: "状态展示", kind: "manual" }, { platform: "wechat" });
  let state = await plugin.loadCreationWorkflowState(project.directory);
  state = {
    ...state,
    currentStage: "final",
    activeDeliverable: "xiaohongshu",
    deliverables: {
      ...state.deliverables,
      xiaohongshu: { ...state.deliverables.xiaohongshu, stage: "final", approvalVersion: "xhs-v1" },
    },
  };
  await plugin.saveCreationWorkflowState(project.directory, state);

  const [listed] = await plugin.listCreationProjects();
  assert.strictEqual(listed.platform, "xiaohongshu", "the current-project badge follows the active deliverable, not the project's first platform");
  assert.strictEqual(listed.statusLabel, "定稿与导出", "internal workflow slugs must never leak into the visible status badge");
  assert.ok(!listed.statusLabel.includes("-"));
}

async function testCreationFinalStageMatchesInspectablePublishingPackageContract() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  const workflowState = creationWorkflow.createWorkflowState({
    projectId: "final-xhs",
    title: "最终包",
    workflowMode: "article_repurpose",
    activeDeliverable: "xiaohongshu",
  });
  workflowState.currentStage = "final";
  workflowState.deliverables.xiaohongshu = {
    ...workflowState.deliverables.xiaohongshu,
    stage: "final",
    cardVersion: "a".repeat(64),
    captionVersion: "b".repeat(64),
    visualQaVersion: "visual-qa-v1",
    copyQaVersion: "copy-qa-v2",
    approvalVersion: "package-v1",
  };
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/final-xhs/project.md",
    directory: "Reading Capture/creation-projects/final-xhs",
    title: "最终包",
    platform: "xiaohongshu",
    statusLabel: "定稿与导出",
    primaryTitle: "最终包",
    relatedTitles: [],
    workflowState,
    stageStates: {
      relations: "complete",
      diagnosis: "skipped",
      research: "skipped",
      brief: "skipped",
      plan: "complete",
      draft: "complete",
      visual: "complete",
      final: "current",
    },
    xhsCaption: "这是一段很长、但不应直接铺满定稿页的发布文案。",
    xhsImageFiles: Array.from({ length: 8 }, (_, index) => ({
      name: `xhs-${String(index + 1).padStart(2, "0")}.png`,
      path: `Reading Capture/creation-projects/final-xhs/images/xhs-${String(index + 1).padStart(2, "0")}.png`,
    })),
    latestPublication: {
      platform: "xiaohongshu",
      projectId: "final-xhs",
      deliverableId: "xiaohongshu-001",
      snapshotId: "snapshot-final-xhs",
      targetDirectory: "Work/business/content-accounts/xiaohongshu/20260720_最终包",
    },
    tasks: [],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);

  for (const expected of [
    "小红书定稿包将复制到独立发布目录",
    "最终卡片 PNG",
    "最终发布文案",
    "来源与素材记录",
    "阻塞问题",
    "小红书发布包内容",
    "当前可检查的定稿",
    "定稿预览",
    "查看最终发布文案",
    "查看最终配图",
    "打开当前发布包目录",
    "导出前最后确认",
    "完成检查后创建快照",
    "记录发布与复盘",
  ]) assert.ok(texts.includes(expected), `final stage should show ${expected}`);
  assert.ok(texts.includes("卡片已确认"));
  assert.ok(texts.includes("文案已确认"));
  assert.ok(!texts.some((text) => /\b[a-f0-9]{64}\b/u.test(text)), "content hashes are persistence details and must not appear as user-facing versions");
  assert.ok(texts.includes("这是一段很长、但不应直接铺满定稿页的发布文案。"), "the final stage should show a compact preview before the user opens the full publication copy");
}

async function testCreationFinalStageRendersWhenInactiveDeliverableIsMissing() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.addCommand = () => {};
  plugin.registerEvent = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  plugin.settings = {
    creationProjectRoot: "Reading Capture/creation-projects",
    wechatPublishingRoot: "Work/business/content-accounts/wechat",
    xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  };
  const workflowState = creationWorkflow.createWorkflowState({
    projectId: "final-wechat-only",
    title: "仅公众号定稿",
    activeDeliverable: "wechat",
  });
  workflowState.currentStage = "final";
  workflowState.deliverables.wechat.stage = "final";
  delete workflowState.deliverables.xiaohongshu;
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/final-wechat-only/project.md",
    directory: "Reading Capture/creation-projects/final-wechat-only",
    title: "仅公众号定稿",
    platform: "wechat",
    statusLabel: "定稿与导出",
    primaryTitle: "仅公众号定稿",
    relatedTitles: [],
    workflowState,
    stageStates: { relations: "complete", diagnosis: "skipped", research: "skipped", brief: "complete", plan: "complete", draft: "complete", visual: "complete", final: "current" },
    wechatVisualFiles: [{ name: "01-cover.png", path: "Reading Capture/creation-projects/final-wechat-only/visuals/01-cover.png" }],
    tasks: [],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const texts = fakeElementTexts(view.containerEl.children[1]);
  for (const expected of ["定稿不是一个按钮，而是一份可检查的发布包", "当前可检查的定稿", "定稿预览", "查看最终文章", "查看最终配图", "打开当前发布包目录", "发布目录快照"]) {
    assert.ok(texts.includes(expected), `wechat final stage should render ${expected} without an inactive Xiaohongshu deliverable`);
  }
}

async function testCreationProjectViewRefreshesWhileRunnerTaskIsActive() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const state = creationWorkflow.createWorkflowState({ projectId: "refresh", title: "自动刷新", activeDeliverable: "wechat" });
  let loads = 0;
  plugin.listCreationProjects = async () => {
    loads += 1;
    return [{
      path: "Reading Capture/creation-projects/refresh/project.md",
      directory: "Reading Capture/creation-projects/refresh",
      title: "自动刷新",
      platform: "wechat",
      statusLabel: "项目与灵感",
      primaryTitle: "自动刷新",
      relatedTitles: [],
      workflowState: state,
      stageStates: creationWorkflow.deriveStageStates(state),
      tasks: [{
        taskId: "diagnosis-refresh",
        kind: "diagnosis.materials",
        status: loads < 3 ? "running" : "awaiting_approval",
        attempts: 1,
        heartbeatAt: loads === 1 ? "2026-07-23T14:00:00.000Z" : "2026-07-23T14:00:05.000Z",
      }],
    }];
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.onOpen();
  assert.strictEqual(loads, 1);
  assert.ok(view.autoRefreshTimer && typeof view.autoRefreshTimer.callback === "function", "the view should monitor durable Runner task state");
  const initialPaints = view.containerEl.children[1].emptyCalls || 0;
  await view.autoRefreshTimer.callback();
  assert.strictEqual(loads, 2, "an active Runner task should refresh the view without requiring an Obsidian restart");
  assert.strictEqual(view.containerEl.children[1].emptyCalls || 0, initialPaints, "a heartbeat alone should not repaint the entire workbench");
  await view.autoRefreshTimer.callback();
  assert.strictEqual(loads, 3);
  assert.strictEqual(view.containerEl.children[1].emptyCalls || 0, initialPaints + 1, "a lifecycle transition should repaint once so the result review becomes available");
  view.onClose();
  assert.strictEqual(view.autoRefreshTimer, null);
}

async function testLocalSkillRunnerRejectsReusedPidBeforeStarting() {
  const storage = new Map([
    ["reading-capture:skill-runner:TestVault", "enabled"],
    ["reading-capture:skill-runner:TestVault:pid", "4242"],
  ]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const launches = [];
  const childProcess = {
    execFileSync(command, args) {
      if (command === "/bin/ps") {
        assert.strictEqual(JSON.stringify(args), JSON.stringify(["-p", "4242", "-o", "command="]));
        return "/Applications/Unrelated.app/Contents/MacOS/Unrelated\n";
      }
      assert.strictEqual(command, "/bin/zsh");
      if (args[1] === "command -v node") return "/opt/homebrew/bin/node\n";
      if (args[1] === "command -v codex") return "/Applications/ChatGPT.app/Contents/Resources/codex\n";
      launches.push(args[1]);
      return "5252\n";
    },
  };
  const fakeProcess = {
    execPath: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
    env: {},
    kill(pid, signal) {
      assert.strictEqual(pid, 4242);
      assert.strictEqual(signal, 0);
    },
  };
  const PluginClass = loadPluginClass({ childProcess, localStorage, process: fakeProcess, dirname: "/Applications/Obsidian.app/Contents/Resources" });
  const plugin = new PluginClass();
  plugin.manifest = { id: "reading-capture" };
  plugin.app = {
    vault: {
      getName() { return "TestVault"; },
      adapter: { getBasePath() { return "/vault"; } },
    },
  };
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  plugin.ensureLocalSkillRunnerOwnership = async () => ({ ownerDeviceId: "device-test", epoch: 1 });

  await plugin.startLocalSkillRunner();
  assert.strictEqual(launches.length, 1, "a live but unrelated reused PID must not suppress Runner startup");
  assert.ok(launches[0].includes("/usr/bin/nohup '/opt/homebrew/bin/node'"), "the background Runner must resolve the login-shell Node runtime instead of relaunching Electron as Node");
  assert.ok(launches[0].includes("'/vault/.obsidian/plugins/reading-capture/skill-runner.js'"));
  assert.ok(launches[0].includes("--vault '/vault'"));
  assert.ok(launches[0].includes("--creation-root 'Reading Capture/creation-projects'"));
  assert.ok(launches[0].includes("--codex '/Applications/ChatGPT.app/Contents/Resources/codex'"), "the background Runner must receive the resolved Codex CLI path rather than a bare command name");
  assert.ok(launches[0].includes("--device-id 'device-test'"));
  assert.ok(launches[0].includes("--epoch '1'"));
  assert.strictEqual(storage.get("reading-capture:skill-runner:TestVault:pid"), "5252");
}

async function testLocalSkillRunnerClearsExitedChildAndCanRestart() {
  const storage = new Map([["reading-capture:skill-runner:TestVault", "enabled"]]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const launches = [];
  const childProcess = {
    execFileSync(command, args) {
      if (command === "/bin/zsh" && args[1] === "command -v node") return "/opt/homebrew/bin/node\n";
      if (command === "/bin/zsh" && args[1] === "command -v codex") return "/Applications/ChatGPT.app/Contents/Resources/codex\n";
      if (command === "/bin/zsh") {
        launches.push(args[1]);
        return `${6000 + launches.length - 1}\n`;
      }
      if (command === "/bin/ps") return "";
      throw new Error(`Unexpected command: ${command}`);
    },
  };
  const fakeProcess = {
    env: {},
    kill(pid, signal) {
      assert.strictEqual(signal, 0);
      if (pid >= 6000) throw new Error("exited");
    },
  };
  const PluginClass = loadPluginClass({ childProcess, localStorage, process: fakeProcess, dirname: "/Applications/Obsidian.app/Contents/Resources" });
  const plugin = new PluginClass();
  plugin.manifest = { id: "reading-capture" };
  plugin.app = {
    vault: {
      getName() { return "TestVault"; },
      adapter: { getBasePath() { return "/vault"; } },
    },
  };
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  plugin.ensureLocalSkillRunnerOwnership = async () => ({ ownerDeviceId: "device-test", epoch: 1 });

  await plugin.startLocalSkillRunner();
  assert.strictEqual(launches.length, 1);
  assert.strictEqual(storage.get("reading-capture:skill-runner:TestVault:pid"), "6000");
  await plugin.startLocalSkillRunner();
  assert.strictEqual(launches.length, 2, "a later watchdog or user action must be able to restart an exited Runner");
  assert.strictEqual(storage.get("reading-capture:skill-runner:TestVault:pid"), "6001");
  const status = JSON.parse(storage.get("reading-capture:skill-runner:TestVault:status"));
  assert.strictEqual(status.state, "running");
  assert.ok(status.logPath.includes("reading-capture-skill-runner-TestVault.log"));
}

async function testLocalSkillRunnerReplacesLegacyUnfencedProcess() {
  const storage = new Map([["reading-capture:skill-runner:TestVault:pid", "4242"]]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  let launched = 0;
  const signals = [];
  const childProcess = {
    execFileSync(command, args) {
      if (command === "/bin/ps") return "/opt/homebrew/bin/node /vault/.obsidian/plugins/reading-capture/skill-runner.js --vault /vault --creation-root 'Reading Capture/creation-projects'\n";
      if (args[1] === "command -v node") return "/opt/homebrew/bin/node\n";
      if (args[1] === "command -v codex") return "/Applications/ChatGPT.app/Contents/Resources/codex\n";
      launched += 1;
      return "5252\n";
    },
  };
  const fakeProcess = {
    env: {},
    kill(pid, signal) {
      assert.strictEqual(pid, 4242);
      signals.push(signal);
    },
  };
  const PluginClass = loadPluginClass({ childProcess, localStorage, process: fakeProcess, dirname: "/Applications/Obsidian.app/Contents/Resources" });
  const plugin = new PluginClass();
  plugin.manifest = { id: "reading-capture" };
  plugin.app = { vault: { getName() { return "TestVault"; }, adapter: { getBasePath() { return "/vault"; } } } };
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  plugin.ensureLocalSkillRunnerOwnership = async () => ({ ownerDeviceId: "device-test", epoch: 7 });

  await plugin.startLocalSkillRunner();
  assert.ok(signals.includes("SIGTERM"), "a legacy process without fencing arguments must be retired before upgrade");
  assert.strictEqual(launched, 1);
  assert.strictEqual(storage.get("reading-capture:skill-runner:TestVault:pid"), "5252");
}

async function testLocalSkillRunnerRestartsWhenDeployedScriptChanges() {
  const storage = new Map([
    ["reading-capture:skill-runner:TestVault", "enabled"],
    ["reading-capture:skill-runner:TestVault:pid", "4242"],
    ["reading-capture:skill-runner:TestVault:status", JSON.stringify({ state: "running", pid: 4242, scriptDigest: "old-digest" })],
  ]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const signals = [];
  let launched = 0;
  const childProcess = {
    execFileSync(command, args) {
      if (command === "/bin/ps") return "/opt/homebrew/bin/node /vault/.obsidian/plugins/reading-capture/skill-runner.js --vault /vault --creation-root 'Reading Capture/creation-projects' --device-id device-test --epoch 7\n";
      if (args[1] === "command -v node") return "/opt/homebrew/bin/node\n";
      if (args[1] === "command -v codex") return "/Applications/ChatGPT.app/Contents/Resources/codex\n";
      launched += 1;
      return "5252\n";
    },
  };
  const fakeProcess = {
    env: {},
    kill(pid, signal) {
      assert.strictEqual(pid, 4242);
      signals.push(signal);
    },
  };
  const PluginClass = loadPluginClass({ childProcess, localStorage, process: fakeProcess, dirname: "/Applications/Obsidian.app/Contents/Resources" });
  const plugin = new PluginClass();
  plugin.manifest = { id: "reading-capture" };
  plugin.app = { vault: { getName() { return "TestVault"; }, adapter: { getBasePath() { return "/vault"; } } } };
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  plugin.ensureLocalSkillRunnerOwnership = async () => ({ ownerDeviceId: "device-test", epoch: 7 });
  plugin.localSkillRunnerScriptDigest = () => "new-digest";

  await plugin.startLocalSkillRunner();
  assert.ok(signals.includes("SIGTERM"), "deploying a changed Runner script must retire the still-running old process");
  assert.strictEqual(launched, 1);
  assert.strictEqual(storage.get("reading-capture:skill-runner:TestVault:pid"), "5252");
  assert.strictEqual(JSON.parse(storage.get("reading-capture:skill-runner:TestVault:status")).scriptDigest, "new-digest");
}

async function testLocalSkillRunnerReplacesBareCodexProcessEvenWhenStatusLooksCurrent() {
  const storage = new Map([
    ["reading-capture:skill-runner:TestVault", "enabled"],
    ["reading-capture:skill-runner:TestVault:pid", "4242"],
    ["reading-capture:skill-runner:TestVault:status", JSON.stringify({ state: "running", pid: 4242, scriptDigest: "current-digest" })],
  ]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const signals = [];
  let launched = 0;
  const childProcess = {
    execFileSync(command, args) {
      if (command === "/bin/ps") return "/opt/homebrew/bin/node /vault/.obsidian/plugins/reading-capture/skill-runner.js --vault /vault --creation-root 'Reading Capture/creation-projects' --codex codex --device-id device-test --epoch 7\n";
      if (args[1] === "command -v node") return "/opt/homebrew/bin/node\n";
      if (args[1] === "command -v codex") return "/Applications/ChatGPT.app/Contents/Resources/codex\n";
      launched += 1;
      return "5252\n";
    },
  };
  const fakeProcess = {
    env: {},
    kill(pid, signal) {
      assert.strictEqual(pid, 4242);
      signals.push(signal);
    },
  };
  const PluginClass = loadPluginClass({ childProcess, localStorage, process: fakeProcess, dirname: "/Applications/Obsidian.app/Contents/Resources" });
  const plugin = new PluginClass();
  plugin.manifest = { id: "reading-capture" };
  plugin.app = { vault: { getName() { return "TestVault"; }, adapter: { getBasePath() { return "/vault"; } } } };
  plugin.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  plugin.ensureLocalSkillRunnerOwnership = async () => ({ ownerDeviceId: "device-test", epoch: 7 });
  plugin.localSkillRunnerScriptDigest = () => "current-digest";

  await plugin.startLocalSkillRunner();
  assert.ok(signals.includes("SIGTERM"), "a Runner started with bare codex must be retired even if stale status metadata says its script is current");
  assert.strictEqual(launched, 1, "the replacement Runner must be started with the resolved executable");
  const status = JSON.parse(storage.get("reading-capture:skill-runner:TestVault:status"));
  assert.strictEqual(status.codexExecutable, "/Applications/ChatGPT.app/Contents/Resources/codex");
}

async function testViewedCreationStageControlsNavigationHighlight() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const { app } = makeFakeApp();
  plugin.app = app;
  plugin.app.workspace.on = () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  plugin.loadData = async () => null;
  const workflowState = creationWorkflow.createWorkflowState({ projectId: "viewed", title: "Viewed", activeDeliverable: "wechat" });
  workflowState.currentStage = "diagnosis";
  plugin.listCreationProjects = async () => [{
    path: "Reading Capture/creation-projects/viewed/project.md",
    directory: "Reading Capture/creation-projects/viewed",
    title: "Viewed",
    platform: "wechat",
    statusLabel: "素材诊断",
    primaryTitle: "Viewed",
    relatedTitles: [],
    workflowState,
    stageStates: Object.fromEntries(creationWorkflow.WORKFLOW_STAGES.map((stage) => [stage.id, stage.id === "relations" ? "complete" : stage.id === "diagnosis" ? "current" : "blocked"])),
    tasks: [],
  }];

  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();
  const buttons = fakeElementsByTag(view.containerEl.children[1], "button");
  const relationsButton = buttons.find((button) => fakeElementTexts(button).includes("项目与灵感"));
  assert.ok(relationsButton && relationsButton.listeners.click);
  await relationsButton.listeners.click();
  const viewedButtons = fakeElementsByClass(view.containerEl.children[1], "is-viewed");
  assert.strictEqual(viewedButtons.length, 1);
  assert.ok(fakeElementTexts(viewedButtons[0]).includes("项目与灵感"), "the navigation highlight must identify the stage whose canvas is visible");
}

async function testLocalRunnerOwnershipRequiresRelinquishmentBeforeTransfer() {
  const storageA = new Map();
  const storageB = new Map();
  const makeStorage = (store) => ({
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  });
  const { app, files } = makeFakeApp();
  app.vault.getName = () => "SharedVault";
  app.vault.adapter.getBasePath = () => "/vault";
  const PluginA = loadPluginClass({ localStorage: makeStorage(storageA) });
  const pluginA = new PluginA();
  pluginA.app = app;
  pluginA.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  const ownerA = await pluginA.ensureLocalSkillRunnerOwnership();
  assert.strictEqual(ownerA.epoch, 1);
  assert.strictEqual(ownerA.state, "active");
  assert.ok(ownerA.ownerDeviceId);

  const PluginB = loadPluginClass({ localStorage: makeStorage(storageB) });
  const pluginB = new PluginB();
  pluginB.app = app;
  pluginB.settings = { creationProjectRoot: "Reading Capture/creation-projects" };
  await assert.rejects(() => pluginB.ensureLocalSkillRunnerOwnership(), /另一台电脑/u);

  await pluginA.relinquishLocalSkillRunnerOwnership();
  const ownerB = await pluginB.ensureLocalSkillRunnerOwnership();
  assert.strictEqual(ownerB.epoch, 2);
  assert.notStrictEqual(ownerB.ownerDeviceId, ownerA.ownerDeviceId);
  const ownerRecord = JSON.parse(files.get("Reading Capture/creation-projects/_runner/owner.json").content);
  assert.strictEqual(ownerRecord.ownerDeviceId, ownerB.ownerDeviceId);
  assert.strictEqual(ownerRecord.state, "active");
}

async function testVersionPathTooltipAndCopy() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const version = {
    path: "Learning/web/articles/2026-07-03_codex-in-practice/article_zh.md",
  };
  const listeners = {};
  const event = {
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  const element = {
    attrs: {},
    dataset: {},
    setAttr(key, value) {
      this.attrs[key] = value;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  plugin.decorateVersionPathElement(element, version);

  assert.strictEqual(element.attrs.title, version.path);
  assert.strictEqual(element.dataset.versionPath, version.path);
  assert.strictEqual(typeof listeners.contextmenu, "function");

  let copied = "";
  plugin.writeClipboardText = async (text) => {
    copied = text;
  };
  listeners.contextmenu(event);
  assert.strictEqual(event.prevented, true);
  assert.strictEqual(event.stopped, true);
  await plugin.copyVersionPath(version.path);
  assert.strictEqual(copied, version.path);
}

async function testReaderSidebarKeepsAnnotationNavigationFocused() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = {
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-reader"]({});
  view.sourcePath = "Learning/web/articles/example/article.md";
  view.containerEl = makeFakeElement();

  const sidebar = makeFakeElement("aside");
  view.renderSidebar(
    sidebar,
    [
      {
        id: "ann_1",
        section: "标注记录",
        time: "2026-06-10T10:42:00+08:00",
        type: "highlight-with-note",
        quote: "值得做成一个创作者的研究工作流。",
        note: "这个点可以展开写。",
        located: true,
      },
      {
        id: "ann_2",
        section: "可写选题",
        time: "2026-06-10T11:00:00+08:00",
        type: "topic",
        quote: "从非技术 builder 的角度理解 Codex。",
        note: "",
        located: true,
      },
    ],
    makeFile(view.sourcePath)
  );

  const texts = fakeElementTexts(sidebar);
  assert.ok(texts.includes("阅读标注"));
  assert.ok(texts.includes("2 条记录"));
  assert.ok(texts.includes("打开阅读记录"));
  assert.ok(texts.includes("复制文章路径"));
  assert.ok(texts.includes("点击标注卡片可跳转到正文位置。"));
  assert.strictEqual(texts.includes("定位到正文"), false);

  const cards = fakeElementsByClass(sidebar, "reading-capture-sidebar-card");
  assert.strictEqual(cards.length, 2);
  assert.strictEqual(cards[0].dataset.annotationId, "ann_1");
  assert.strictEqual(typeof cards[0].listeners.click, "function");
  assert.strictEqual(cards[0].children.some((child) => child.tag === "button" && child.text === "打开阅读记录"), false);
}

async function testReaderPreservesExpandedDetailsAndPositionAfterRefresh() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = {
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-reader"]({});
  let details = [{ open: true }, { open: false }];
  const body = {
    scrollTop: 640,
    scrollLeft: 12,
    querySelector() {
      return this;
    },
    querySelectorAll(selector) {
      return selector === "details" ? details : [];
    },
  };
  view.containerEl = { children: [null, body] };

  const state = view.captureReaderState();
  details = [{ open: false }, { open: true }];
  body.scrollTop = 0;
  body.scrollLeft = 0;
  view.restoreReaderState(state);

  assert.deepStrictEqual(details.map((item) => item.open), [true, false]);
  assert.strictEqual(body.scrollTop, 640);
  assert.strictEqual(body.scrollLeft, 12);
}

async function testCreationTaskProgressMakesBackgroundExecutionInspectable() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  plugin.now = () => "2026-07-23T13:30:00.000Z";
  const registeredViews = {};
  plugin.app = { workspace: { on() { return {}; } } };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  const canvas = makeFakeElement();
  view.renderCreationTaskProgress(canvas, {
    tasks: [{
      taskId: "task_diagnosis",
      kind: "diagnosis.materials",
      status: "running",
      skillId: "writing-styles",
      attempts: 2,
      runId: "task_diagnosis_attempt-2",
      startedAt: "2026-07-23T13:28:30.000Z",
      heartbeatAt: "2026-07-23T13:29:58.000Z",
    }],
  });
  const texts = fakeElementTexts(canvas);
  assert.ok(texts.includes("后台执行状态"));
  assert.ok(texts.includes("正在后台执行 · 材料诊断"));
  assert.ok(texts.some((text) => text.includes("writing-styles 正在处理第 2 次执行")));
  assert.ok(texts.some((text) => text.includes("最近活动：")));
  assert.ok(texts.includes("立即刷新"));
}

async function testCreationViewRestoresCanvasScrollAfterBackgroundRefresh() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = { workspace: { on() { return {}; } } };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => { registeredViews[type] = factory; };
  await plugin.onload();
  const view = registeredViews["reading-capture-creation-project"]({});
  const canvas = { scrollTop: 684, scrollLeft: 19 };
  const host = {
    querySelector(selector) {
      return selector === ".reading-capture-creation-canvas" ? canvas : null;
    },
  };
  view.containerEl = { children: [null, host] };
  const state = view.captureCreationScrollState();
  canvas.scrollTop = 0;
  canvas.scrollLeft = 0;
  view.restoreCreationScrollState(state);
  assert.strictEqual(canvas.scrollTop, 684, "background refresh must retain the reader's vertical position");
  assert.strictEqual(canvas.scrollLeft, 19, "background refresh must retain the reader's horizontal position");
}

async function testReaderDisplayControlsAdjustFontSizeAndLineHeight() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  plugin.app = {
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };
  let saveCount = 0;
  plugin.saveSettings = async () => {
    saveCount += 1;
  };
  await plugin.onload();
  plugin.settings.readerFontSize = 17;
  plugin.settings.readerLineHeight = 1.72;
  const view = registeredViews["reading-capture-reader"]({});
  const actions = makeFakeElement();
  const body = makeFakeElement();

  view.renderReaderDisplayControls(actions, body);
  view.applyReaderDisplaySettings(body);

  const texts = fakeElementTexts(actions);
  assert.ok(texts.includes("Aa"), "reader toolbar should expose reading settings");
  assert.strictEqual(body.style.properties["--rc-reader-font-size"], "17px");
  assert.strictEqual(body.style.properties["--rc-reader-line-height"], "1.72");

  const settingsButton = fakeElementByText(actions, "Aa");
  assert.strictEqual(typeof settingsButton.listeners.click, "function");
  settingsButton.listeners.click();

  const range = fakeElementsByTag(actions, "input").find((input) => input.attrs.type === "range");
  assert.ok(range, "reader settings should include a font-size slider");
  assert.strictEqual(range.attrs.min, "14");
  assert.strictEqual(range.attrs.max, "28");
  range.value = "23";
  await range.listeners.input({ target: range });
  assert.strictEqual(plugin.settings.readerFontSize, 23);
  assert.strictEqual(body.style.properties["--rc-reader-font-size"], "23px");
  assert.ok(saveCount >= 1);

  const plusButton = fakeElementByText(actions, "A+");
  await plusButton.listeners.click();
  assert.strictEqual(plugin.settings.readerFontSize, 24);
  assert.strictEqual(body.style.properties["--rc-reader-font-size"], "24px");

  const relaxedButton = fakeElementByText(actions, "舒展");
  await relaxedButton.listeners.click();
  assert.strictEqual(plugin.settings.readerLineHeight, 1.9);
  assert.strictEqual(body.style.properties["--rc-reader-line-height"], "1.9");

  const resetButton = fakeElementByText(actions, "恢复默认");
  await resetButton.listeners.click();
  assert.strictEqual(plugin.settings.readerFontSize, 18);
  assert.strictEqual(plugin.settings.readerLineHeight, 1.72);
  assert.strictEqual(body.style.properties["--rc-reader-font-size"], "18px");
}

function testReaderBodyUsesDisplaySettingVariables() {
  const css = fs.readFileSync(path.join(__dirname, "../plugin/styles.css"), "utf8");
  assert.match(css, /--rc-reader-font-size/, "reader CSS should expose a font-size variable");
  assert.match(css, /font-size:\s*var\(--rc-reader-font-size/, "reader body should use the saved font-size variable");
  assert.match(css, /line-height:\s*var\(--rc-reader-line-height/, "reader body should use the saved line-height variable");
  assert.match(css, /reading-capture-reader-settings-slider/, "reader settings slider should have dedicated styling");
}

async function testReadingRecordViewGroupsAnnotationsAndSwitchesMarkdownInPlace() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const registeredViews = {};
  const notePath = "Learning/reading-notes/2026/06/example.md";
  const markdown = `---
type: reading-note
source_vault_path: "Learning/web/articles/example/article.md"
source_title: "Example Article"
status: reading
---

# 阅读记录：Example Article

## 标注记录

### ann_thought

- time: 2026-06-10T10:30:00+08:00
- type: highlight-with-note

> 普通标注引用

我的想法：
普通想法

## 可写选题

### ann_topic

- time: 2026-06-10T09:20:00+08:00
- type: topic

> 选题引用

我的想法：
可以写成选题

## 事实待核查

### ann_fact

- time: 2026-06-10T10:25:00+08:00
- type: fact-check

> 待核查引用

我的想法：
需要核查
`;
  const noteFile = makeFile(notePath, markdown);
  plugin.app = {
    vault: {
      getAbstractFileByPath(path) {
        if (path === notePath) return noteFile;
        if (path === "Learning/web/articles/example/article.md") return makeFile(path, "# Example");
        return null;
      },
      async read(file) {
        return markdown;
      },
    },
    workspace: {
      on() {
        return {};
      },
      getActiveFile() {
        return null;
      },
    },
  };
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerView = (type, factory) => {
    registeredViews[type] = factory;
  };

  await plugin.onload();
  const view = registeredViews["reading-capture-record"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.setRecord(notePath);

  assert.strictEqual(JSON.stringify(view.groupedRecords().map((group) => group.key)), JSON.stringify(["topic", "fact", "thought"]));
  assert.strictEqual(view.activeAnnotationId, "ann_topic");
  let texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("阅读沉淀"));
  assert.ok(texts.includes("创作灵感"));
  assert.ok(texts.includes("事实待核查"));
  assert.ok(texts.includes("标注想法"));
  assert.ok(texts.includes("当前记录"));
  assert.ok(texts.includes("可以写成选题"));

  await view.setMode("markdown");
  texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.some((text) => text.includes("ann_topic")));
  assert.ok(texts.includes("记录视图"));
}

async function testOpeningReadingNoteUsesRecordViewInsteadOfRawMarkdown() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  const views = {};
  const noteFile = makeFile("Learning/reading-notes/example.md", "note");
  const sourceFile = makeFile("Learning/web/articles/example.md", "# Example");
  plugin.app = {
    workspace: {
      getLeaf() {
        return {
          async setViewState(state) {
            this.state = state;
            this.view = views[state.type];
          },
        };
      },
    },
    vault: {
      getAbstractFileByPath(path) {
        if (path === noteFile.path) return noteFile;
        if (path === sourceFile.path) return sourceFile;
        return null;
      },
    },
  };
  const recordView = {
    async setRecord(notePath, sourcePath) {
      this.notePath = notePath;
      this.sourcePath = sourcePath;
    },
  };
  views["reading-capture-record"] = recordView;
  let rawOpened = "";
  plugin.openFile = async (file) => {
    rawOpened = file.path;
  };

  await plugin.openReadingRecord(noteFile, sourceFile);

  assert.strictEqual(recordView.notePath, noteFile.path);
  assert.strictEqual(recordView.sourcePath, sourceFile.path);
  assert.strictEqual(rawOpened, "");
}

testCaptureWritesAnnotationAndIndex()
  .then(testCaptureReusesExistingUnindexedFile)
  .then(testCaptureImageNote)
  .then(testRecordTargetAndHighlight)
  .then(testArticleLibraryGrouping)
  .then(testArticleLibraryFiltersAndSortsForResearchWorkflow)
  .then(testArticleLibraryTopBarOpensCreativeIdeas)
  .then(testArticleLibraryUsesCacheUntilSourceFilesChange)
  .then(testArticleLibrarySnapshotPersistsForFastInitialRender)
  .then(testTopicPoolCollectsWritableTopicsFromReadingNotes)
  .then(testTopicPoolCombinesManualIdeasWithTopicMinerCandidatesAndFeedback)
  .then(testTopicPoolFindsTopicMinerReportsFromAdapterWhenVaultIndexIsStale)
  .then(testTopicPoolPrefersTopicMinerProjectionJsonWhenAvailable)
  .then(testTopicMinerReportParsesBulletedSourceSection)
  .then(testTopicPoolAiCandidatesPreferLatestReportOverFeedbackTime)
  .then(testTopicPoolSortsByContentDateNotFeedbackTime)
  .then(testTopicMinerFeedbackIsAppendedAsJsonl)
  .then(testManualTopicFeedbackIsSavedWithSourceContext)
  .then(testTopicPoolViewShowsDecisionWorkspaceControls)
  .then(testTopicPoolSummaryUsesLatestReportDate)
  .then(testTopicPoolWorkflowSortModesAndCollapsedArchiveGroups)
  .then(testTopicPoolFeedbackSaveFailureReenablesButton)
  .then(testTopicPoolCardClickUpdatesDetailWithoutRerenderingList)
  .then(testTopicPoolCardClickKeepsRepeatedCandidateIdsVisuallyIndependent)
  .then(testTopicPoolSavePreservesListScrollPosition)
  .then(testTopicPoolStylesPreventFloatingDetailOverlap)
  .then(testOpenLibraryVersionUsesReaderForMarkdownAndObsidianForPdf)
  .then(testTopicPoolOpensBestArticleFromDirectorySource)
  .then(testGenericDefaultSettings)
  .then(testCreationProjectCreateAppendAndList)
  .then(testCreationProjectListExcludesRunnerWorkspaceCopies)
  .then(testConfirmCreationRelationsPersistsDiagnosisStage)
  .then(testCancelledDiagnosisTaskCanBeReturnedToRunnerQueue)
  .then(testCreationCoordinationWritesDoNotDependOnVaultModifyCache)
  .then(testRunnerTaskStatusBypassesStaleVaultCache)
  .then(testRunnerTasksFallBackToVaultIndexWhenAdapterListingLags)
  .then(testRunnerAcceptsRelativeAdapterListings)
  .then(testProjectLoadsTaskFromDurableReferenceWithoutQueueListing)
  .then(testCreationProjectVisualFilesUseNaturalFilenameOrder)
  .then(testProjectRecoversTaskReferenceFromRunHistory)
  .then(testProjectReadsMarkdownRunReceiptWhenJsonIsNotIndexed)
  .then(testRunnerResultReceiptRecoversStaleQueueFile)
  .then(testWorkflowStateBypassesStaleVaultCache)
  .then(testProjectStatusRecoversLaggingWorkflowStage)
  .then(testRelatedInspirationCanBeUnlinkedWithoutRemovingPrimary)
  .then(testManualArtifactEditCreatesNamedVersionAndUpdatesApprovalTarget)
  .then(testAiRevisionSupersedesStaleQualityCheck)
  .then(testXhsCaptionRevisionNeverRegeneratesAcceptedCards)
  .then(testFailedQaCanReturnProjectToResearchConfiguration)
  .then(testReopenedResearchCanRestoreContentReviewAndRecordHumanQaOverride)
  .then(testFinalExportCreatesImmutableNamedSnapshot)
  .then(testXhsFinalExportUsesCanonicalPublishingPackage)
  .then(testConcurrentSnapshotExportReservesDistinctVersionDirectories)
  .then(testExportWriteFailureNeverExposesPartialSnapshotAsFinal)
  .then(testPublicationReviewProjectsIdempotentTopicMinerFeedback)
  .then(testCreationResearchDecisionPersistsDistinctPaths)
  .then(testParallelResearchRoutesKeepOutputsSeparateAndMergeOnAcceptance)
  .then(testGeneratedDiagnosisCanAdvanceWhenLegacyTaskReceiptIsMissing)
  .then(testTaskVersionLabelsDoNotExposeContentHashes)
  .then(testCreationStageTasksUseExplicitContractsAndAuthorization)
  .then(testLegacyPlanningEntryRoutesToDiagnosisOnly)
  .then(testSkippingResearchQueuesRestrictedBriefCandidate)
  .then(testRepurposeSourceSearchIsMetadataOnlyAndReadsAfterConfirmation)
  .then(testSupportingSourcesCanBeAddedTogetherAfterMetadataOnlySelection)
  .then(testSupportingPickerShowsFullNamesAndDefersMultiSelectionUntilConfirmation)
  .then(testXhsPlanRendersGeneratedProposalsInsteadOfHardcodedCards)
  .then(testXhsTaskChainUsesApprovedPlanAndIndependentDualQa)
  .then(testWechatVisualChildrenRetainSuccessRetryFailureAndBlockFinalization)
  .then(testWechatVisualTaskCanChangeSkillAndPromptBeforeFinalAcceptance)
  .then(testXhsCardTaskCanBeRevisedWithoutDiscardingOtherPages)
  .then(testVisualTaskPromptRewriteUsesSelectedSkillDesignBrief)
  .then(testXhsCardChildrenRetainSuccessfulPagesAndRetryOnlyFailure)
  .then(testCreationViewExposesPerItemVisualRecoveryWithoutDiscardingSuccess)
  .then(testXhsContentReviewShowsCardThumbnailsInsteadOfManifestDump)
  .then(testWechatVisualViewSummarizesBlockedAndPendingWork)
  .then(testCreationProjectViewShowsEightStageEntryContract)
  .then(testCreationProjectViewShowsDiagnosisContract)
  .then(testDiagnosisReviewReturnsToResearchWithoutRepeatingDecision)
  .then(testCreationTaskAlertsExplainRecoveryByWaitingReason)
  .then(testCancelledDiagnosisCanRestartFromTheCurrentProjectPage)
  .then(testSupersededCancelledSampleDoesNotDistractTheActiveWorkflow)
  .then(testPublicationReviewModalUsesWideCompactGrid)
  .then(testCreationProjectViewShowsOrderedResearchAuthorizationContract)
  .then(testResearchReviewOpensRouteOutputsBeforeAcceptance)
  .then(testCreationProjectViewShowsBriefBeforeApproval)
  .then(testCreationProjectListUsesActiveDeliverableAndFriendlyWorkflowStatus)
  .then(testCreationFinalStageMatchesInspectablePublishingPackageContract)
  .then(testCreationFinalStageRendersWhenInactiveDeliverableIsMissing)
  .then(testCreationProjectViewRefreshesWhileRunnerTaskIsActive)
  .then(testLocalSkillRunnerRejectsReusedPidBeforeStarting)
  .then(testLocalSkillRunnerClearsExitedChildAndCanRestart)
  .then(testLocalSkillRunnerReplacesLegacyUnfencedProcess)
  .then(testLocalSkillRunnerRestartsWhenDeployedScriptChanges)
  .then(testLocalSkillRunnerReplacesBareCodexProcessEvenWhenStatusLooksCurrent)
  .then(testViewedCreationStageControlsNavigationHighlight)
  .then(testLocalRunnerOwnershipRequiresRelinquishmentBeforeTransfer)
  .then(testVersionPathTooltipAndCopy)
  .then(testReaderSidebarKeepsAnnotationNavigationFocused)
  .then(testReaderPreservesExpandedDetailsAndPositionAfterRefresh)
  .then(testCreationTaskProgressMakesBackgroundExecutionInspectable)
  .then(testCreationViewRestoresCanvasScrollAfterBackgroundRefresh)
  .then(testReaderDisplayControlsAdjustFontSizeAndLineHeight)
  .then(testReaderBodyUsesDisplaySettingVariables)
  .then(testReadingRecordViewGroupsAnnotationsAndSwitchesMarkdownInPlace)
  .then(testOpeningReadingNoteUsesRecordViewInsteadOfRawMarkdown)
  .then(() => console.log("plugin capture test passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
