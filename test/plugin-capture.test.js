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
      async list(path) {
        const prefix = `${path.replace(/\/+$/g, "")}/`;
        return {
          files: [...files.keys()].filter((filePath) => filePath.startsWith(prefix)),
          folders: [...folders].filter((folderPath) => folderPath.startsWith(prefix)),
        };
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

function makeFakeElement(tag = "div") {
  const element = {
    tag,
    text: "",
    attrs: {},
    classes: new Set(),
    children: [],
    dataset: {},
    listeners: {},
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
  plugin.openTopicPool = async () => {
    openedTopicPool = true;
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

  await plugin.onload();
  const view = registeredViews["reading-capture-topic-pool"]({});
  view.containerEl = { children: [makeFakeElement(), makeFakeElement()] };
  await view.reload();

  const texts = fakeElementTexts(view.containerEl.children[1]);
  assert.ok(texts.includes("回到知见录"), "topic pool should keep a back-to-library button");
  assert.ok(texts.includes("打开今日报告"), "topic pool should expose the latest report");
  assert.ok(texts.includes("状态"), "topic pool should label feedback filters as status");
  assert.ok(texts.includes("保存给 AI"), "manual creative ideas should also be saved as feedback for Topic Miner");
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
  .then(testTopicPoolAiCandidatesPreferLatestReportOverFeedbackTime)
  .then(testTopicPoolSortsByContentDateNotFeedbackTime)
  .then(testTopicMinerFeedbackIsAppendedAsJsonl)
  .then(testManualTopicFeedbackIsSavedWithSourceContext)
  .then(testTopicPoolViewShowsDecisionWorkspaceControls)
  .then(testTopicPoolSummaryUsesLatestReportDate)
  .then(testTopicPoolWorkflowSortModesAndCollapsedArchiveGroups)
  .then(testTopicPoolFeedbackSaveFailureReenablesButton)
  .then(testTopicPoolCardClickUpdatesDetailWithoutRerenderingList)
  .then(testTopicPoolSavePreservesListScrollPosition)
  .then(testTopicPoolStylesPreventFloatingDetailOverlap)
  .then(testOpenLibraryVersionUsesReaderForMarkdownAndObsidianForPdf)
  .then(testGenericDefaultSettings)
  .then(testVersionPathTooltipAndCopy)
  .then(testReaderSidebarKeepsAnnotationNavigationFocused)
  .then(testReaderDisplayControlsAdjustFontSizeAndLineHeight)
  .then(testReaderBodyUsesDisplaySettingVariables)
  .then(testReadingRecordViewGroupsAnnotationsAndSwitchesMarkdownInPlace)
  .then(testOpeningReadingNoteUsesRecordViewInsteadOfRawMarkdown)
  .then(() => console.log("plugin capture test passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
