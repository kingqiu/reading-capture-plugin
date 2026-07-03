const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("../plugin/reading-core");

const fixedNow = "2026-06-10T11:59:00+08:00";

function loadPluginClass() {
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

  await plugin.captureForFile(sourceFile, {
    selectedText: "Selected text",
    note: "My note",
    type: "highlight-with-note",
    heading: "标注记录",
  });

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
  assert.strictEqual(target.heading, "可写选题");
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
  assert.strictEqual(plugin.annotationLabel(annotations[1]), "可写选题");
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
  const digest = makeFile("Learning/web/x_articles/digest/digest_20260308_185542.md", "# X 博主最新动态\n\nDigest should not be treated as an article.");
  files.set(enriched.path, { file: enriched, content: "# Loop Enriched\n\nThis is the enriched Chinese version." });
  files.set(original.path, { file: original, content: "# Loop Original\n\nOriginal version." });
  files.set(pdf.path, { file: pdf, content: "" });
  files.set(single.path, { file: single, content: "# Single Note\n\nA standalone research article." });
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
  assert.ok(directoryGroup, "directory article group should be present");
  assert.ok(singleGroup, "single-file article group should be present");
  assert.strictEqual(directoryGroup.bestVersion.path, enriched.path);
  assert.strictEqual(directoryGroup.versions.some((version) => version.kind === "pdf"), true);
  assert.strictEqual(singleGroup.groupType, "single-file");
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

async function testGenericDefaultSettings() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();

  await plugin.loadSettings();

  assert.strictEqual(plugin.settings.readingRoot, "Reading Capture/notes");
  assert.strictEqual(plugin.settings.articleLibraryRoots, "");
  assert.strictEqual(plugin.getArticleLibraryRoots().length, 0);
  assert.deepStrictEqual([...plugin.getArticleLibraryExcludeRoots()], ["Reading Capture/notes", ".obsidian"]);
  assert.strictEqual(plugin.articleLibraryEmptyMessage(), "还没有配置知见录扫描目录。请在 Reading Capture 设置里添加保存文章的文件夹。");

  plugin.settings.articleLibraryRoots = "Articles";
  assert.strictEqual(plugin.articleLibraryEmptyMessage(), "没有找到匹配的文章。可以调整搜索词或扫描目录。");
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

testCaptureWritesAnnotationAndIndex()
  .then(testCaptureReusesExistingUnindexedFile)
  .then(testCaptureImageNote)
  .then(testRecordTargetAndHighlight)
  .then(testArticleLibraryGrouping)
  .then(testArticleLibraryFiltersAndSortsForResearchWorkflow)
  .then(testOpenLibraryVersionUsesReaderForMarkdownAndObsidianForPdf)
  .then(testGenericDefaultSettings)
  .then(testVersionPathTooltipAndCopy)
  .then(() => console.log("plugin capture test passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
