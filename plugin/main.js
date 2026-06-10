const { ItemView, MarkdownRenderer, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require("obsidian");

const READER_VIEW_TYPE = "reading-capture-reader";
const ARTICLE_LIBRARY_VIEW_TYPE = "reading-capture-library";

const KNOWN_SOURCE_ROOTS = [
  "Learning/web/seaart_articles",
  "Learning/web/wechat_articles",
  "Learning/web/x_articles",
  "Learning/web/articles",
  "Learning/research",
  "Learning/papers",
  "Raw",
];

const ALWAYS_EXCLUDED_LIBRARY_ROOTS = [
  "Learning/web/x_articles/digest",
  "Learning/web/x_articles/digests",
];

function sha1(value, length = 8) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, length);
}

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function dateParts(now) {
  const text = toIsoString(now);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const date = new Date(text);
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return { year, month, day, ymd: `${year}${month}${day}` };
  }
  return { year: match[1], month: match[2], day: match[3], ymd: `${match[1]}${match[2]}${match[3]}` };
}

function timePart(now) {
  const text = toIsoString(now);
  const match = text.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return "000000";
  return `${match[1]}${match[2]}${match[3]}`;
}

function normalizeVaultPath(vaultPath) {
  return String(vaultPath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function determineSourceRoot(vaultPath) {
  const normalized = normalizeVaultPath(vaultPath);
  const found = KNOWN_SOURCE_ROOTS.find((root) => normalized === root || normalized.startsWith(`${root}/`));
  if (found) return found;
  const parts = normalized.split("/");
  return parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0] || "unknown";
}

function rootSlug(sourceRoot) {
  const parts = normalizeVaultPath(sourceRoot).split("/");
  return String(parts[parts.length - 1] || "source")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "source";
}

function sourceKindFromPath(vaultPath) {
  const ext = extname(vaultPath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".pdf") return "pdf";
  if ([".mp3", ".m4a", ".wav", ".aac", ".flac"].includes(ext)) return "audio";
  if ([".mp4", ".mov", ".mkv", ".webm"].includes(ext)) return "video";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  return ext ? ext.slice(1) : "unknown";
}

function titleFromPath(vaultPath) {
  const base = basename(String(vaultPath || ""), extname(String(vaultPath || "")));
  return base || "Untitled";
}

function basename(filePath, ext = "") {
  const base = normalizeVaultPath(filePath).split("/").pop() || "";
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

function extname(filePath) {
  const base = normalizeVaultPath(filePath).split("/").pop() || "";
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

function safeSlug(value, maxLength = 72) {
  const slug = String(value || "untitled")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

function buildSourceMetadata({ vaultPath, absPath = "", title = "", stat = {}, now = new Date().toISOString() }) {
  const sourceVaultPath = normalizeVaultPath(vaultPath);
  const sourceRoot = determineSourceRoot(sourceVaultPath);
  return {
    source_id: sha1(sourceVaultPath, 8),
    source_vault_path: sourceVaultPath,
    source_abs_path: absPath,
    source_title: title || titleFromPath(sourceVaultPath),
    source_file_name: basename(sourceVaultPath),
    source_root: sourceRoot,
    source_kind: sourceKindFromPath(sourceVaultPath),
    source_mtime: stat && stat.mtime ? new Date(stat.mtime).toISOString() : "",
    source_size: stat && typeof stat.size === "number" ? stat.size : 0,
    source_content_hash: "",
    source_aliases: [],
    created: toIsoString(now),
    updated: toIsoString(now),
  };
}

function buildReadingNotePath({ source, readingRoot = "Learning/reading-notes", now = new Date().toISOString() }) {
  const parts = dateParts(now);
  const titleSlug = safeSlug(source.source_title, 72);
  const fileName = `${parts.ymd}_${rootSlug(source.source_root)}_${titleSlug}_${source.source_id}.md`;
  return normalizeVaultPath(`${readingRoot}/${parts.year}/${parts.month}/${fileName}`);
}

function createEmptyIndex(now = new Date().toISOString()) {
  return {
    schema_version: 1,
    updated: toIsoString(now),
    sources: {},
    aliases: {},
  };
}

function upsertIndexEntry(
  index,
  { source, readingNotePath, annotationCount = 0, status = "reading", codexStatus = "pending_summary", captureSource = "", now = new Date().toISOString() }
) {
  const updated = toIsoString(now);
  index.schema_version = index.schema_version || 1;
  index.updated = updated;
  index.sources = index.sources || {};
  index.aliases = index.aliases || {};
  const previous = index.sources[source.source_vault_path] || {};
  index.sources[source.source_vault_path] = {
    source_id: source.source_id,
    source_vault_path: source.source_vault_path,
    source_title: source.source_title,
    source_root: source.source_root,
    source_kind: source.source_kind,
    reading_note_path: readingNotePath,
    created: previous.created || updated,
    updated,
    annotation_count: annotationCount,
    codex_status: codexStatus,
    status,
    last_capture_source: captureSource,
  };
  index.aliases[source.source_id] = source.source_vault_path;
  return index;
}

function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "number") return String(value);
  if (!value) return "";
  return JSON.stringify(String(value));
}

function buildInitialReadingNote({ source, now = new Date().toISOString() }) {
  const updated = toIsoString(now);
  return `---\ntype: reading-note\nschema_version: 1\nsource_id: ${source.source_id}\nsource_vault_path: ${yamlValue(source.source_vault_path)}\nsource_abs_path: ${yamlValue(source.source_abs_path)}\nsource_title: ${yamlValue(source.source_title)}\nsource_file_name: ${yamlValue(source.source_file_name)}\nsource_root: ${yamlValue(source.source_root)}\nsource_kind: ${yamlValue(source.source_kind)}\nsource_mtime: ${yamlValue(source.source_mtime)}\nsource_size: ${source.source_size || 0}\nsource_content_hash: ${yamlValue(source.source_content_hash)}\nsource_aliases: []\nstatus: reading\ncodex_status: pending_summary\npublish_intent: []\ncreated: ${yamlValue(updated)}\nupdated: ${yamlValue(updated)}\n---\n\n# 阅读记录：${source.source_title}\n\n## 源文档\n\n- 来源：[[${source.source_vault_path}]]\n- 类型：${source.source_kind}\n- 首次记录：${updated}\n\n## 一句话判断\n\n\n## 标注记录\n\n\n## 可写选题\n\n\n## 事实待核查\n\n\n## Codex 汇总\n\n> 等待 Codex 写入。\n\n## 内容转化记录\n\n- 微信公众号：\n- 小红书：\n- 视频号：\n`;
}

function countAnnotations(markdown) {
  const matches = String(markdown || "").match(/^### ann_/gm);
  return matches ? matches.length : 0;
}

function blockquote(text) {
  return cleanSelectedText(text)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function cleanSelectedText(text) {
  return String(text || "")
    .replace(/^=+\s*/, "")
    .replace(/\s*=+$/, "");
}

function wrapMarkdownHighlight(text) {
  const value = String(text || "");
  if (!value.trim()) return value;
  if (/^==[\s\S]*==$/.test(value)) return value;
  return `==${value}==`;
}

function wrapMarkdownHighlightBlockwise(text) {
  const value = String(text || "");
  if (!value.includes("\n")) return wrapMarkdownHighlight(value);
  return value
    .split(/\r?\n/)
    .map((line) => wrapMarkdownHighlightLine(line))
    .join("\n");
}

function wrapMarkdownHighlightLine(line) {
  if (!String(line || "").trim()) return line;
  const match = String(line).match(/^(\s*(?:>\s*)?(?:(?:[-*+])\s+|\d+\.\s+)?)(.*?)(\s*)$/);
  if (!match) return wrapMarkdownHighlight(line);
  const [, prefix, body, suffix] = match;
  if (!body.trim()) return line;
  if (/^==[\s\S]*==$/.test(body.trim())) return line;
  return `${prefix}==${body}==${suffix}`;
}

function buildAnnotationBlock({
  selectedText = "",
  note = "",
  type = "highlight-with-note",
  captureSource = "obsidian-plugin",
  locationHint = "",
  confidence = "high",
  media = null,
  now = new Date().toISOString(),
}) {
  const parts = dateParts(now);
  const timestamp = toIsoString(now);
  const cleanQuote = cleanSelectedText(selectedText);
  const mediaKey = media ? `${media.type || ""}:${media.src || ""}:${media.index || ""}` : "";
  const annotationId = `ann_${parts.ymd}_${timePart(now)}_${sha1(`${timestamp}:${cleanQuote}:${note}:${type}:${mediaKey}`, 4)}`;
  const quoteHash = cleanQuote ? `q_${sha1(cleanQuote, 8)}` : "";
  const lines = [
    `### ${annotationId}`,
    "",
    `- time: ${timestamp}`,
    `- capture_source: ${captureSource}`,
    `- type: ${type}`,
    `- quote_hash: ${quoteHash}`,
    `- location_hint: ${locationHint}`,
    `- confidence: ${confidence}`,
  ];
  if (media) {
    lines.push(
      `- media_type: ${media.type || ""}`,
      `- media_src: ${yamlValue(media.src || "")}`,
      `- media_alt: ${yamlValue(media.alt || "")}`,
      `- media_index: ${typeof media.index === "number" ? media.index : ""}`,
      `- media_hash: ${media.src ? `m_${sha1(media.src, 8)}` : ""}`
    );
  }
  lines.push("");
  if (cleanQuote) {
    lines.push(blockquote(cleanQuote), "");
  }
  if (note) {
    lines.push("我的想法：", note, "");
  }
  return `${lines.join("\n")}\n`;
}

function appendUnderHeading(markdown, heading, block) {
  const text = String(markdown || "");
  const marker = `## ${heading}`;
  const index = text.indexOf(marker);
  if (index === -1) return `${text.trimEnd()}\n\n${marker}\n\n${block}`;
  const start = index + marker.length;
  const nextHeading = text.slice(start).search(/\n## /);
  if (nextHeading === -1) {
    return `${text.slice(0, start).trimEnd()}\n\n${block}${text.slice(start).trimStart()}`;
  }
  const insertAt = start + nextHeading;
  return `${text.slice(0, insertAt).trimEnd()}\n\n${block}\n${text.slice(insertAt).trimStart()}`;
}

const core = {
  KNOWN_SOURCE_ROOTS,
  sha1,
  safeSlug,
  buildSourceMetadata,
  buildReadingNotePath,
  createEmptyIndex,
  upsertIndexEntry,
  buildInitialReadingNote,
  buildAnnotationBlock,
  cleanSelectedText,
  wrapMarkdownHighlight,
  wrapMarkdownHighlightBlockwise,
  appendUnderHeading,
  countAnnotations,
  normalizeVaultPath,
};


const DEFAULT_SETTINGS = {
  readingRoot: "Learning/reading-notes",
  openNoteAfterCapture: false,
  articleLibraryRoots: KNOWN_SOURCE_ROOTS.join("\n"),
  articleLibraryExcludeRoots: ["Learning/reading-notes", ".obsidian", ...ALWAYS_EXCLUDED_LIBRARY_ROOTS].join("\n"),
};

class TextInputModal extends Modal {
  constructor(app, title, placeholder, onSubmit, options = {}) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    this.includeTypeSelect = !!options.includeTypeSelect;
    this.previewText = options.previewText || "";
    this.submitted = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("reading-capture-modal-shell");
    contentEl.addClass("reading-capture-modal");
    const titleEl = contentEl.createEl("h2", { cls: "reading-capture-drag-handle", text: this.title });
    this.enableDrag(this.modalEl);
    let typeSelect = null;
    if (this.includeTypeSelect) {
      const typeRow = contentEl.createDiv({ cls: "reading-capture-type-row" });
      typeRow.createEl("label", { text: "记录类型" });
      typeSelect = typeRow.createEl("select", { cls: "reading-capture-type-select" });
      [
        ["thought", "普通想法"],
        ["topic", "可写选题"],
        ["fact-check", "事实待核查"],
      ].forEach(([value, label]) => {
        typeSelect.createEl("option", { value, text: label });
      });
    }
    if (this.previewText) {
      const preview = contentEl.createDiv({ cls: "reading-capture-preview" });
      preview.createEl("div", { cls: "reading-capture-preview-label", text: "选中内容" });
      preview.createEl("blockquote", {
        cls: "reading-capture-preview-text",
        text: this.previewText,
      });
    }
    const textarea = contentEl.createEl("textarea", {
      cls: "reading-capture-textarea",
      attr: { placeholder: this.placeholder },
    });
    textarea.focus();
    contentEl.createEl("div", {
      cls: "reading-capture-hint",
      text: "Cmd/Ctrl + Enter 保存，Esc 取消。",
    });

    const buttonRow = contentEl.createDiv({ cls: "reading-capture-button-row" });
    const saveButton = buttonRow.createEl("button", { text: "保存" });
    saveButton.addClass("mod-cta");
    buttonRow.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());

    const submit = async () => {
      if (this.submitted) return;
      this.submitted = true;
      const value = textarea.value.trim();
      saveButton.disabled = true;
      try {
        await this.onSubmit(value, typeSelect ? typeSelect.value : "thought");
        this.close();
      } catch (error) {
        console.error("Reading Capture save failed", error);
        new Notice(`Reading Capture 保存失败：${error && error.message ? error.message : String(error)}`, 8000);
        this.submitted = false;
        saveButton.disabled = false;
      }
    };
    saveButton.addEventListener("click", submit);
    textarea.addEventListener("keydown", async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        await submit();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  enableDrag(handleEl) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const modalEl = this.modalEl;

    const onMove = (event) => {
      if (!dragging) return;
      event.preventDefault();
      modalEl.style.left = `${event.clientX - offsetX}px`;
      modalEl.style.top = `${event.clientY - offsetY}px`;
      modalEl.style.margin = "0";
      modalEl.style.transform = "none";
      modalEl.style.position = "fixed";
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    handleEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.isInteractiveDragTarget(event.target)) return;
      const rect = modalEl.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      modalEl.style.left = `${rect.left}px`;
      modalEl.style.top = `${rect.top}px`;
      modalEl.style.margin = "0";
      modalEl.style.transform = "none";
      modalEl.style.position = "fixed";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      event.preventDefault();
    });
  }

  isInteractiveDragTarget(target) {
    let element = target;
    while (element && element !== this.modalEl) {
      const tagName = element.tagName ? element.tagName.toLowerCase() : "";
      if (["textarea", "select", "option", "button", "input"].includes(tagName)) return true;
      if (element.closest && element.closest(".modal-close-button")) return true;
      element = element.parentElement;
    }
    return false;
  }
}

class ReadingCaptureSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Reading Capture" });

    new Setting(containerEl)
      .setName("阅读笔记根目录")
      .setDesc("所有阅读记录和索引会保存在这个目录下。")
      .addText((text) =>
        text
          .setPlaceholder("Learning/reading-notes")
          .setValue(this.plugin.settings.readingRoot)
          .onChange(async (value) => {
            this.plugin.settings.readingRoot = normalizePath(value.trim() || DEFAULT_SETTINGS.readingRoot);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("记录后打开阅读笔记")
      .setDesc("开启后，每次保存标注都会打开对应的阅读记录。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openNoteAfterCapture).onChange(async (value) => {
          this.plugin.settings.openNoteAfterCapture = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("知见录扫描目录")
      .setDesc("每行一个目录。知见录会扫描这些目录下的 Markdown / PDF 文件，并按文章组展示。")
      .addTextArea((text) =>
        text
          .setPlaceholder(KNOWN_SOURCE_ROOTS.join("\n"))
          .setValue(this.plugin.settings.articleLibraryRoots || DEFAULT_SETTINGS.articleLibraryRoots)
          .onChange(async (value) => {
            this.plugin.settings.articleLibraryRoots = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("知见录排除目录")
      .setDesc("每行一个目录。阅读笔记目录和 Obsidian 配置目录默认会排除。")
      .addTextArea((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.articleLibraryExcludeRoots)
          .setValue(this.plugin.settings.articleLibraryExcludeRoots || DEFAULT_SETTINGS.articleLibraryExcludeRoots)
          .onChange(async (value) => {
            this.plugin.settings.articleLibraryExcludeRoots = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

class ReadingCaptureReaderView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sourcePath = "";
    this.activeAnnotationId = "";
    this.sidebarFilter = "all";
    this.sidebarCollapsed = false;
  }

  getViewType() {
    return READER_VIEW_TYPE;
  }

  getDisplayText() {
    return this.sourcePath ? `阅读：${this.sourcePath.split("/").pop()}` : "Reading Capture Reader";
  }

  getIcon() {
    return "highlighter";
  }

  async setSource(sourcePath) {
    this.sourcePath = sourcePath;
    await this.render();
  }

  async onOpen() {
    await this.render();
  }

  getSourceFile() {
    if (!this.sourcePath) return null;
    const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
    return this.plugin.isFile(sourceFile) ? sourceFile : null;
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-reader");

    if (!this.sourcePath) {
      container.createEl("div", { cls: "reading-capture-reader-empty", text: "从命令面板运行 Reading Capture: 打开阅读器视图。" });
      return;
    }

    const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!this.plugin.isFile(sourceFile)) {
      container.createEl("div", { cls: "reading-capture-reader-empty", text: `找不到源文件：${this.sourcePath}` });
      return;
    }

    const toolbar = container.createDiv({ cls: "reading-capture-reader-toolbar" });
    const titleWrap = toolbar.createDiv({ cls: "reading-capture-reader-title-wrap" });
    titleWrap.createEl("div", { cls: "reading-capture-reader-kicker", text: "Reading Capture" });
    titleWrap.createEl("div", { cls: "reading-capture-reader-title", text: sourceFile.basename || sourceFile.name });
    const actions = toolbar.createDiv({ cls: "reading-capture-reader-actions" });
    const thoughtButton = actions.createEl("button", { text: "记录想法" });
    thoughtButton.addEventListener("click", () => this.captureFreeThought(sourceFile));
    const captureButton = actions.createEl("button", { text: "记录选中内容" });
    captureButton.addClass("mod-cta");
    captureButton.addEventListener("click", () => this.captureSelection(sourceFile));
    const sidebarButton = actions.createEl("button", { text: this.sidebarCollapsed ? "显示标注" : "隐藏标注" });
    sidebarButton.addEventListener("click", async () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      await this.render();
    });

    const stage = container.createDiv({ cls: "reading-capture-reader-stage" });
    if (this.sidebarCollapsed) stage.addClass("is-sidebar-collapsed");
    const articlePanel = stage.createDiv({ cls: "reading-capture-reader-article-panel" });
    const body = articlePanel.createDiv({ cls: "reading-capture-reader-body markdown-preview-view" });
    const sidebar = stage.createEl("aside", { cls: "reading-capture-reader-sidebar" });
    if (this.sidebarCollapsed) sidebar.addClass("is-collapsed");
    const tooltip = container.createDiv({ cls: "reading-capture-floating-note" });
    const markdown = await this.plugin.readText(sourceFile.path);
    if (MarkdownRenderer && typeof MarkdownRenderer.render === "function") {
      await MarkdownRenderer.render(this.app, markdown, body, sourceFile.path, this);
    } else {
      await MarkdownRenderer.renderMarkdown(markdown, body, sourceFile.path, this);
    }
    this.indexReaderImages(body);
    const annotations = await this.applyHighlights(body, sourceFile);
    this.renderSidebar(sidebar, annotations);
    this.bindHighlightInteractions(body, tooltip, sidebar, annotations);

    body.addEventListener("mouseup", () => {
      const selection = window.getSelection();
      if (!selection || !selection.toString().trim()) return;
    });
    body.addEventListener("contextmenu", (event) => {
      const image = event.target && event.target.closest ? event.target.closest("img") : null;
      if (image && body.contains(image)) {
        event.preventDefault();
        this.captureImage(sourceFile, image, body);
        return;
      }
      const selectedText = this.getSelectedTextWithin(body);
      if (!selectedText) return;
      event.preventDefault();
      this.captureSelectedText(sourceFile, selectedText);
    });
  }

  indexReaderImages(body) {
    body.querySelectorAll("img").forEach((image, index) => {
      image.dataset.readingCaptureImageIndex = String(index);
      image.dataset.readingCaptureImageKey = this.plugin.imageKeyFromElement(image, index);
      image.addClass("reading-capture-reader-image");
      if (!image.getAttribute("title")) image.setAttribute("title", "右键记录这张图的想法");
    });
  }

  captureFreeThought(sourceFile) {
    new TextInputModal(
      this.app,
      "记录当前想法",
      "这条想法会关联到当前文章，不需要选中文字。",
      async (note, recordType) => {
        if (!note) {
          new Notice("没有输入内容。");
          return;
        }
        const target = this.plugin.resolveRecordTarget(recordType, note);
        await this.plugin.captureForFile(sourceFile, {
          selectedText: "",
          note,
          type: target.type === "highlight-with-note" ? "idea" : target.type,
          heading: target.heading,
        });
        await this.render();
      },
      { includeTypeSelect: true }
    ).open();
  }

  async captureSelection(sourceFile) {
    const selectedText = this.getSelectedTextWithin(this.containerEl);
    if (!selectedText) {
      new Notice("请先在阅读器里选中一段文字。");
      return;
    }
    this.captureSelectedText(sourceFile, selectedText);
  }

  captureSelectedText(sourceFile, selectedText) {
    new TextInputModal(
      this.app,
      "记录想法",
      "写下你对这段内容的想法。可留空。",
      async (note, recordType) => {
        const target = this.plugin.resolveRecordTarget(recordType, note);
        await this.plugin.captureForFile(sourceFile, {
          selectedText,
          note,
          type: target.type,
          heading: target.heading,
        });
        await this.render();
      },
      { includeTypeSelect: true, previewText: this.plugin.previewSelectedText(selectedText) }
    ).open();
  }

  captureImage(sourceFile, image, body) {
    const media = this.plugin.imageMetadataFromElement(image, body, sourceFile);
    new TextInputModal(
      this.app,
      "记录图片想法",
      "写下你对这张图的想法。",
      async (note, recordType) => {
        if (!note) {
          new Notice("没有输入内容。");
          return;
        }
        const target = this.plugin.resolveRecordTarget(recordType, note);
        await this.plugin.captureForFile(sourceFile, {
          selectedText: "",
          note,
          type: target.type === "highlight-with-note" ? "image-note" : target.type,
          heading: target.heading,
          media,
        });
        await this.render();
      },
      { includeTypeSelect: true, previewText: this.plugin.imagePreviewText(media) }
    ).open();
  }

  getSelectedTextWithin(container) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";
    const text = selection.toString().trim();
    if (!text) return "";
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (anchorNode && !container.contains(anchorNode)) return "";
    if (focusNode && !container.contains(focusNode)) return "";
    return text;
  }

  async applyHighlights(body, sourceFile) {
    const noteFile = await this.plugin.findReadingNoteForSource(sourceFile);
    if (!noteFile) return [];
    const noteMarkdown = await this.plugin.readText(noteFile.path);
    const annotations = this.plugin.parseAnnotationsFromReadingNote(noteMarkdown);
    for (const annotation of annotations) {
      if (annotation.mediaType === "image") this.highlightImageInElement(body, annotation);
      else if (annotation.quote) this.highlightQuoteInElement(body, annotation);
    }
    return annotations;
  }

  highlightImageInElement(root, annotation) {
    const image = this.plugin.findImageForAnnotation(root, annotation);
    if (!image) return;
    annotation.located = true;
    image.addClass("reading-capture-reader-image-highlight");
    image.dataset.annotationId = annotation.id;
    image.dataset.quoteHash = annotation.mediaHash || "";
  }

  highlightQuoteInElement(root, annotation) {
    const quote = annotation && annotation.quote ? annotation.quote : annotation;
    const cleanQuote = this.plugin.markdownTextForMatch(quote).replace(/\s+/g, " ").trim();
    if (!cleanQuote) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let fullText = "";
    while (walker.nextNode()) {
      const node = walker.currentNode;
      textNodes.push({ node, start: fullText.length, end: fullText.length + node.nodeValue.length });
      fullText += node.nodeValue;
    }
    const rawRange = this.plugin.findQuoteRawRange(fullText, quote);
    if (!rawRange) return;

    let didHighlight = false;
    for (const item of textNodes) {
      if (item.end <= rawRange.start || item.start >= rawRange.end) continue;
      const from = Math.max(rawRange.start - item.start, 0);
      const to = Math.min(rawRange.end - item.start, item.node.nodeValue.length);
      const visibleRange = this.plugin.trimTextRangeForHighlight(item.node.nodeValue, from, to);
      if (!visibleRange) continue;
      const range = document.createRange();
      range.setStart(item.node, visibleRange.from);
      range.setEnd(item.node, visibleRange.to);
      const mark = document.createElement("mark");
      mark.classList.add("reading-capture-reader-highlight");
      if (annotation && annotation.id) {
        mark.dataset.annotationId = annotation.id;
        mark.dataset.quoteHash = annotation.quoteHash || "";
      }
      try {
        range.surroundContents(mark);
        didHighlight = true;
      } catch (error) {
        // Complex inline markup can make surroundContents unhappy. Skip rather than breaking render.
      }
    }
    if (didHighlight && annotation) annotation.located = true;
  }

  renderSidebar(sidebar, annotations) {
    sidebar.empty();
    const items = annotations || [];
    const header = sidebar.createDiv({ cls: "reading-capture-sidebar-header" });
    header.createEl("div", { cls: "reading-capture-sidebar-kicker", text: "Notes" });
    header.createEl("h3", { text: "阅读标注" });
    header.createEl("div", { cls: "reading-capture-sidebar-count", text: `${items.length} 条记录` });
    this.renderSidebarFilters(sidebar, items);

    if (!items.length) {
      const empty = sidebar.createDiv({ cls: "reading-capture-sidebar-empty" });
      empty.createEl("strong", { text: "还没有记录" });
      empty.createEl("span", { text: "选中文字后记录，或直接写一条当前想法。" });
      return;
    }

    const list = sidebar.createDiv({ cls: "reading-capture-sidebar-list" });
    const visibleItems = items.filter((item) => this.plugin.annotationMatchesFilter(item, this.sidebarFilter));
    if (!visibleItems.length) {
      const empty = list.createDiv({ cls: "reading-capture-sidebar-empty" });
      empty.createEl("strong", { text: "当前筛选没有记录" });
      empty.createEl("span", { text: "切换到全部可以查看完整标注。" });
      return;
    }
    for (const item of visibleItems) {
      const card = list.createDiv({ cls: "reading-capture-sidebar-card" });
      card.dataset.annotationId = item.id;
      const top = card.createDiv({ cls: "reading-capture-sidebar-card-top" });
      top.createEl("span", { cls: `reading-capture-type-pill ${this.plugin.typeClass(item)}`, text: this.plugin.annotationLabel(item) });
      top.createEl("span", { cls: "reading-capture-sidebar-time", text: this.plugin.shortTime(item.time) });
      if (!item.located && (item.quote || item.mediaType)) {
        card.addClass("is-unlocated");
        top.createEl("span", { cls: "reading-capture-location-pill", text: "未定位" });
      }
      if (item.quote) {
        card.createEl("blockquote", { cls: "reading-capture-sidebar-quote", text: this.plugin.previewSelectedText(item.quote) });
      } else if (item.mediaType === "image") {
        const media = card.createDiv({ cls: "reading-capture-sidebar-media" });
        media.createEl("span", { text: "图片" });
        media.createEl("strong", { text: item.mediaAlt || item.mediaSrc || `第 ${Number(item.mediaIndex || 0) + 1} 张图` });
      }
      if (item.note) {
        card.createEl("div", { cls: "reading-capture-sidebar-note", text: item.note });
      }
      card.addEventListener("click", () => this.activateAnnotation(item.id, true));
    }
  }

  renderSidebarFilters(sidebar, items) {
    const filters = [
      ["all", "全部"],
      ["thought", "想法"],
      ["image", "图片"],
      ["topic", "选题"],
      ["fact", "待核查"],
      ["unlocated", "未定位"],
    ];
    const row = sidebar.createDiv({ cls: "reading-capture-sidebar-filters" });
    for (const [value, label] of filters) {
      const count = items.filter((item) => this.plugin.annotationMatchesFilter(item, value)).length;
      const button = row.createEl("button", { text: `${label}${value === "all" ? "" : ` ${count}`}` });
      if (this.sidebarFilter === value) button.addClass("is-active");
      button.addEventListener("click", () => {
        this.sidebarFilter = value;
        this.renderSidebar(sidebar, items);
      });
    }
  }

  bindHighlightInteractions(body, tooltip, sidebar, annotations) {
    const byId = new Map((annotations || []).map((item) => [item.id, item]));
    const hideTooltip = () => {
      tooltip.removeClass("is-visible");
      tooltip.empty();
    };
    body.addEventListener("mouseover", (event) => {
      const mark = event.target && event.target.closest ? event.target.closest(".reading-capture-reader-highlight, .reading-capture-reader-image-highlight") : null;
      if (!mark || !body.contains(mark)) return;
      const item = byId.get(mark.dataset.annotationId);
      if (!item) return;
      this.showFloatingNote(tooltip, mark, item);
    });
    body.addEventListener("mouseout", (event) => {
      const mark = event.target && event.target.closest ? event.target.closest(".reading-capture-reader-highlight, .reading-capture-reader-image-highlight") : null;
      if (!mark || !body.contains(mark)) return;
      const next = event.relatedTarget;
      if (next && tooltip.contains(next)) return;
      hideTooltip();
    });
    tooltip.addEventListener("mouseleave", hideTooltip);
    body.addEventListener("click", (event) => {
      const mark = event.target && event.target.closest ? event.target.closest(".reading-capture-reader-highlight, .reading-capture-reader-image-highlight") : null;
      if (!mark || !body.contains(mark)) return;
      this.activateAnnotation(mark.dataset.annotationId, false);
    });
    sidebar.addEventListener("click", (event) => {
      const card = event.target && event.target.closest ? event.target.closest(".reading-capture-sidebar-card") : null;
      if (!card || !sidebar.contains(card)) return;
      this.activateAnnotation(card.dataset.annotationId, true);
    });
  }

  showFloatingNote(tooltip, mark, item) {
    tooltip.empty();
    tooltip.createEl("div", { cls: "reading-capture-floating-note-label", text: this.plugin.annotationLabel(item) });
    tooltip.createEl("div", { cls: "reading-capture-floating-note-body", text: item.note || "这条记录只有高亮，还没有补充想法。" });
    const rect = mark.getBoundingClientRect();
    const width = 300;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
    const top = Math.min(rect.bottom + 10, window.innerHeight - 160);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(16, top)}px`;
    tooltip.addClass("is-visible");
  }

  activateAnnotation(annotationId, scrollArticle) {
    if (!annotationId) return;
    this.activeAnnotationId = annotationId;
    this.containerEl.querySelectorAll(".reading-capture-reader-highlight.is-active").forEach((element) => element.removeClass("is-active"));
    this.containerEl.querySelectorAll(".reading-capture-reader-image-highlight.is-active").forEach((element) => element.removeClass("is-active"));
    this.containerEl.querySelectorAll(".reading-capture-sidebar-card.is-active").forEach((element) => element.removeClass("is-active"));
    const escapedId = this.plugin.cssEscape(annotationId);
    this.containerEl.querySelectorAll(`.reading-capture-reader-highlight[data-annotation-id="${escapedId}"], .reading-capture-reader-image-highlight[data-annotation-id="${escapedId}"]`).forEach((element, index) => {
      element.addClass("is-active");
      if (scrollArticle && index === 0) element.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const card = this.containerEl.querySelector(`.reading-capture-sidebar-card[data-annotation-id="${escapedId}"]`);
    if (card) {
      card.addClass("is-active");
      if (!scrollArticle) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

class ReadingCaptureLibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.groups = [];
    this.selectedGroupId = "";
    this.query = "";
    this.sourceFilter = "all";
    this.stateFilter = "all";
    this.sortMode = "mtime-desc";
    this.isLoading = false;
  }

  getViewType() {
    return ARTICLE_LIBRARY_VIEW_TYPE;
  }

  getDisplayText() {
    return "知见录";
  }

  getIcon() {
    return "library";
  }

  async onOpen() {
    await this.reload();
  }

  async reload() {
    this.isLoading = true;
    await this.render();
    try {
      this.groups = await this.plugin.buildArticleLibraryGroups();
      if (!this.selectedGroupId && this.groups.length) this.selectedGroupId = this.groups[0].id;
      if (this.selectedGroupId && !this.groups.find((group) => group.id === this.selectedGroupId)) {
        this.selectedGroupId = this.groups.length ? this.groups[0].id : "";
      }
    } finally {
      this.isLoading = false;
      await this.render();
    }
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-library");

    const shell = container.createDiv({ cls: "reading-capture-library-shell" });
    const top = shell.createDiv({ cls: "reading-capture-library-top" });
    const title = top.createDiv({ cls: "reading-capture-library-title" });
    title.createEl("h1", { text: "知见录" });
    title.createEl("div", { cls: "reading-capture-library-subtitle", text: `${this.groups.length} 个文章组 · ${this.totalAnnotationCount()} 条阅读标注` });
    const tools = top.createDiv({ cls: "reading-capture-library-tools" });
    const search = tools.createEl("input", {
      type: "search",
      placeholder: "搜索标题、路径、摘要...",
      value: this.query,
    });
    search.addEventListener("input", () => {
      this.query = search.value;
      this.render();
    });
    const refresh = tools.createEl("button", { text: this.isLoading ? "扫描中..." : "重新扫描" });
    refresh.disabled = this.isLoading;
    refresh.addEventListener("click", () => this.reload());

    const layout = shell.createDiv({ cls: "reading-capture-library-layout" });
    const filters = layout.createEl("aside", { cls: "reading-capture-library-filters" });
    const list = layout.createDiv({ cls: "reading-capture-library-list" });
    const detail = layout.createEl("aside", { cls: "reading-capture-library-detail" });

    this.renderFilters(filters);
    this.renderList(list);
    this.renderDetail(detail);
  }

  renderFilters(filters) {
    filters.empty();
    this.renderFilterSection(filters, "来源", this.sourceOptions(), this.sourceFilter, (value) => {
      this.sourceFilter = value;
      this.render();
    });
    this.renderFilterSection(
      filters,
      "状态",
      [
        ["all", "全部"],
        ["annotated", "有标注"],
        ["topic", "有选题"],
        ["fact", "待核查"],
        ["unread", "未读"],
      ],
      this.stateFilter,
      (value) => {
        this.stateFilter = value;
        this.render();
      }
    );
    this.renderFilterSection(
      filters,
      "排序",
      [
        ["mtime-desc", "最近更新"],
        ["last-read-desc", "最近阅读"],
        ["annotations-desc", "标注最多"],
        ["title-asc", "标题 A-Z"],
      ],
      this.sortMode,
      (value) => {
        this.sortMode = value;
        this.render();
      }
    );
  }

  totalAnnotationCount() {
    return this.groups.reduce((sum, group) => sum + Number(group.stats && group.stats.annotationCount ? group.stats.annotationCount : 0), 0);
  }

  renderFilterSection(container, title, options, activeValue, onSelect) {
    const section = container.createDiv({ cls: "reading-capture-library-filter-section" });
    section.createEl("h2", { text: title });
    for (const [value, label, count] of options) {
      const button = section.createEl("button", { text: count === undefined ? label : `${label} ${count}` });
      if (activeValue === value) button.addClass("is-active");
      button.addEventListener("click", () => onSelect(value));
    }
  }

  sourceOptions() {
    const counts = new Map();
    for (const group of this.groups) {
      const label = group.sourceLabel || "未分类";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [["all", "全部", this.groups.length], ...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => [label, label, count])];
  }

  visibleGroups() {
    const query = String(this.query || "").trim().toLowerCase();
    const groups = this.groups.filter((group) => {
      if (this.sourceFilter !== "all" && group.sourceLabel !== this.sourceFilter) return false;
      if (this.stateFilter === "annotated" && group.stats.annotationCount <= 0) return false;
      if (this.stateFilter === "topic" && group.stats.topicCount <= 0) return false;
      if (this.stateFilter === "fact" && group.stats.factCount <= 0) return false;
      if (this.stateFilter === "unread" && group.stats.hasReading) return false;
      if (!query) return true;
      return [group.title, group.snippet, group.groupPath, group.files.map((file) => file.name).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return groups.sort((left, right) => {
      if (this.sortMode === "title-asc") return left.title.localeCompare(right.title);
      if (this.sortMode === "annotations-desc") return right.stats.annotationCount - left.stats.annotationCount || right.mtime - left.mtime;
      if (this.sortMode === "last-read-desc") return (right.stats.lastReadTime || 0) - (left.stats.lastReadTime || 0) || right.mtime - left.mtime;
      return right.mtime - left.mtime;
    });
  }

  renderList(list) {
    list.empty();
    const groups = this.visibleGroups();
    const header = list.createDiv({ cls: "reading-capture-library-list-header" });
    header.createEl("strong", { text: this.isLoading ? "正在扫描文章..." : `${groups.length} 个文章组` });
    if (this.isLoading) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "正在整理知见录，请稍等。" });
      return;
    }
    if (!groups.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "没有找到匹配的文章。可以调整搜索词或扫描目录。" });
      return;
    }
    for (const group of groups) {
      const card = list.createDiv({ cls: "reading-capture-library-card" });
      if (group.id === this.selectedGroupId) card.addClass("is-active");
      card.addEventListener("click", () => {
        this.selectedGroupId = group.id;
        this.render();
      });

      const meta = card.createDiv({ cls: "reading-capture-library-card-meta" });
      meta.createEl("span", { text: group.sourceLabel });
      meta.createEl("span", { text: group.dateLabel });
      meta.createEl("span", { text: group.groupType === "single-file" ? "单文件" : "文章组" });
      card.createEl("h2", { text: group.title });
      if (group.snippet) card.createEl("p", { text: group.snippet });
      const versions = card.createDiv({ cls: "reading-capture-library-versions" });
      for (const version of group.versions.slice(0, 4)) {
        versions.createEl("span", { text: version.label });
      }
      const bottom = card.createDiv({ cls: "reading-capture-library-card-bottom" });
      bottom.createEl("span", { text: `${group.stats.annotationCount} 条标注` });
      bottom.createEl("span", { text: `${group.files.length} 个文件` });
      const open = bottom.createEl("button", { text: "阅读" });
      open.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.openBestVersion(group);
      });
    }
  }

  renderDetail(detail) {
    detail.empty();
    const selected = this.groups.find((group) => group.id === this.selectedGroupId);
    if (!selected) {
      detail.createDiv({ cls: "reading-capture-library-empty", text: "选择一篇文章后，这里会显示版本和阅读记录。" });
      return;
    }

    detail.createEl("div", { cls: "reading-capture-library-detail-kicker", text: selected.sourceLabel });
    detail.createEl("h2", { text: selected.title });
    detail.createEl("p", { text: selected.groupPath });
    const stats = detail.createDiv({ cls: "reading-capture-library-stats" });
    stats.createEl("span", { text: `标注 ${selected.stats.annotationCount}` });
    stats.createEl("span", { text: `选题 ${selected.stats.topicCount}` });
    stats.createEl("span", { text: `待核查 ${selected.stats.factCount}` });

    const actions = detail.createDiv({ cls: "reading-capture-library-detail-actions" });
    const openBest = actions.createEl("button", { text: "打开最佳版本" });
    openBest.addClass("mod-cta");
    openBest.addEventListener("click", () => this.openBestVersion(selected));
    const openNote = actions.createEl("button", { text: "阅读记录" });
    openNote.disabled = !selected.stats.readingNotePath;
    openNote.addEventListener("click", async () => {
      if (!selected.stats.readingNotePath) return;
      const noteFile = this.plugin.app.vault.getAbstractFileByPath(selected.stats.readingNotePath);
      await this.plugin.openFile(this.plugin.isFile(noteFile) ? noteFile : this.plugin.makeFileRef(selected.stats.readingNotePath));
    });

    detail.createEl("h3", { text: "版本" });
    const versions = detail.createDiv({ cls: "reading-capture-library-version-list" });
    for (const version of selected.versions) {
      const row = versions.createDiv({ cls: "reading-capture-library-version-row" });
      row.createEl("span", { text: version.label });
      row.createEl("strong", { text: version.name });
      if (version.kind === "markdown") {
        const button = row.createEl("button", { text: "阅读" });
        button.addEventListener("click", async () => {
          const file = this.plugin.app.vault.getAbstractFileByPath(version.path);
          if (this.plugin.isFile(file)) await this.plugin.openReaderForFile(file);
        });
      }
    }

    if (selected.snippet) {
      detail.createEl("h3", { text: "摘要" });
      detail.createEl("blockquote", { text: selected.snippet });
    }
  }

  async openBestVersion(group) {
    const version = group && group.bestVersion;
    if (!version || version.kind !== "markdown") {
      new Notice("这个文章组没有可打开的 Markdown 版本。");
      return;
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(version.path);
    if (!this.plugin.isFile(file)) {
      new Notice("找不到这个版本的源文件。");
      return;
    }
    await this.plugin.openReaderForFile(file);
  }
}

module.exports = class ReadingCapturePlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ReadingCaptureSettingTab(this.app, this));
    this.registerView(READER_VIEW_TYPE, (leaf) => new ReadingCaptureReaderView(leaf, this));
    this.registerView(ARTICLE_LIBRARY_VIEW_TYPE, (leaf) => new ReadingCaptureLibraryView(leaf, this));

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const selectedText = editor.getSelection().trim();
        if (!selectedText || !view || !view.file) return;

        menu.addItem((item) => {
          item
            .setTitle("Reading Capture: 标注选中文本并记录想法")
            .setIcon("highlighter")
            .onClick(() => {
              this.openCaptureModal(view.file, editor, selectedText, this.getSelectionRange(editor));
            });
        });
      })
    );

    this.addCommand({
      id: "open-reader-view",
      name: "打开阅读器视图",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!this.isFile(file)) {
          new Notice("请先打开一篇 Markdown 文章。");
          return;
        }
        await this.openReaderForFile(file);
      },
    });

    this.addCommand({
      id: "open-article-library",
      name: "打开知见录",
      callback: async () => this.openArticleLibrary(),
    });

    this.addCommand({
      id: "capture-selection-with-note",
      name: "标注选中文本并记录想法",
      callback: async () => this.captureSelectionFromActiveContext(),
    });

    this.addCommand({
      id: "quick-highlight-selection",
      name: "快速高亮选中文本",
      callback: async () => this.quickHighlightFromActiveContext(),
    });

    this.addCommand({
      id: "capture-current-thought",
      name: "记录当前想法",
      callback: async () => {
        const reader = this.getActiveReaderView();
        if (reader) {
          const file = reader.getSourceFile();
          if (!file) {
            new Notice("没有找到当前阅读器源文件。");
            return;
          }
          reader.captureFreeThought(file);
          return;
        }
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("没有找到当前文件。");
          return;
        }
        new TextInputModal(this.app, "记录当前想法", "这条想法会关联到当前打开的文件。", async (note) => {
          if (!note) {
            new Notice("没有输入内容。");
            return;
          }
          await this.captureForFile(file, {
            selectedText: "",
            note,
            type: "idea",
            heading: "标注记录",
          });
        }).open();
      },
    });

    this.addCommand({
      id: "add-writing-topic",
      name: "加入可写选题",
      callback: async () => this.captureTypedEntryFromActiveContext("topic"),
    });

    this.addCommand({
      id: "add-fact-check",
      name: "加入事实待核查",
      callback: async () => this.captureTypedEntryFromActiveContext("fact-check"),
    });

    this.addCommand({
      id: "open-reading-note",
      name: "打开当前文件的阅读记录",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("没有找到当前文件。");
          return;
        }
        const noteFile = await this.getOrCreateReadingNote(file);
        await this.openFile(noteFile);
      },
    });

    this.addCommand({
      id: "mark-reading-complete",
      name: "标记当前阅读为已完成",
      callback: async () => {
        const noteFile = await this.resolveCurrentReadingNote();
        if (!noteFile) {
          new Notice("没有找到可标记的阅读记录。");
          return;
        }
        await this.updateReadingStatus(noteFile, "annotated", "pending_summary");
        new Notice("已标记为已完成阅读。");
      },
    });

    this.addCommand({
      id: "rebuild-reading-index",
      name: "重建阅读索引",
      callback: async () => {
        const count = await this.rebuildIndex();
        new Notice(`阅读索引已重建：${count} 条记录。`);
      },
    });
  }

  async openReaderForFile(file) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: READER_VIEW_TYPE,
      active: true,
    });
    const view = leaf.view;
    if (view && typeof view.setSource === "function") {
      await view.setSource(file.path);
    }
  }

  async openArticleLibrary() {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: ARTICLE_LIBRARY_VIEW_TYPE,
      active: true,
    });
    const view = leaf.view;
    if (view && typeof view.reload === "function") {
      await view.reload();
    }
  }

  getActiveReaderView() {
    const leaf = this.app.workspace.getActiveViewOfType ? this.app.workspace.getActiveViewOfType(ReadingCaptureReaderView) : null;
    if (leaf) return leaf;
    const activeLeaf = this.app.workspace.activeLeaf;
    const view = activeLeaf && activeLeaf.view;
    return view && typeof view.getViewType === "function" && view.getViewType() === READER_VIEW_TYPE ? view : null;
  }

  getActiveMarkdownContext() {
    const leaf = this.app.workspace.activeLeaf;
    const view = leaf && leaf.view ? leaf.view : null;
    const editor = view && view.editor;
    const file = view && view.file ? view.file : this.app.workspace.getActiveFile();
    if (!editor || !file) return null;
    return { editor, file };
  }

  async captureSelectionFromActiveContext() {
    const reader = this.getActiveReaderView();
    if (reader) {
      const file = reader.getSourceFile();
      if (!file) {
        new Notice("没有找到当前阅读器源文件。");
        return;
      }
      await reader.captureSelection(file);
      return;
    }
    const context = this.getActiveMarkdownContext();
    if (!context) {
      new Notice("请在 Markdown 文件或阅读器视图中使用。");
      return;
    }
    const selectedText = context.editor.getSelection().trim();
    if (!selectedText) {
      new Notice("请先选中一段文字。");
      return;
    }
    this.openCaptureModal(context.file, context.editor, selectedText, this.getSelectionRange(context.editor));
  }

  async quickHighlightFromActiveContext() {
    const reader = this.getActiveReaderView();
    if (reader) {
      const file = reader.getSourceFile();
      if (!file) {
        new Notice("没有找到当前阅读器源文件。");
        return;
      }
      const selectedText = reader.getSelectedTextWithin(reader.containerEl);
      if (!selectedText) {
        new Notice("请先在阅读器里选中一段文字。");
        return;
      }
      await this.captureForFile(file, {
        selectedText,
        note: "",
        type: "highlight",
        heading: "标注记录",
      });
      await reader.render();
      return;
    }
    const context = this.getActiveMarkdownContext();
    if (!context) {
      new Notice("请在 Markdown 文件或阅读器视图中使用。");
      return;
    }
    const selectedText = context.editor.getSelection().trim();
    if (!selectedText) {
      new Notice("请先选中一段文字。");
      return;
    }
    await this.captureForFile(context.file, {
      selectedText,
      note: "",
      type: "highlight",
      heading: "标注记录",
    });
  }

  async captureTypedEntryFromActiveContext(recordType) {
    const reader = this.getActiveReaderView();
    if (reader) {
      const file = reader.getSourceFile();
      if (!file) {
        new Notice("没有找到当前阅读器源文件。");
        return;
      }
      const selectedText = reader.getSelectedTextWithin(reader.containerEl);
      this.openTypedCaptureModal(file, selectedText, recordType, async () => reader.render());
      return;
    }
    const context = this.getActiveMarkdownContext();
    if (!context) {
      new Notice("请在 Markdown 文件或阅读器视图中使用。");
      return;
    }
    const selectedText = context.editor.getSelection().trim();
    this.openTypedCaptureModal(context.file, selectedText, recordType);
  }

  openTypedCaptureModal(file, selectedText, recordType, afterSave = null) {
    const isTopic = recordType === "topic";
    new TextInputModal(
      this.app,
      isTopic ? "加入可写选题" : "加入事实待核查",
      isTopic ? "写下这个选题或补充说明。" : "写下需要核查的问题或说明。",
      async (note) => {
        const finalNote = note || selectedText;
        if (!finalNote && !selectedText) {
          new Notice("没有可记录的内容。");
          return;
        }
        await this.captureForFile(file, {
          selectedText,
          note: finalNote,
          type: recordType,
          heading: isTopic ? "可写选题" : "事实待核查",
        });
        if (afterSave) await afterSave();
      },
      { previewText: this.previewSelectedText(selectedText) }
    ).open();
  }

  openCaptureModal(file, editor, selectedText, selectionRange) {
    new TextInputModal(
      this.app,
      "记录想法",
      "写下你对这段内容的想法。可留空。",
      async (note, recordType) => {
        const target = this.resolveRecordTarget(recordType, note);
        await this.captureForFile(file, {
          selectedText,
          note,
          type: target.type,
          heading: target.heading,
        });
      },
      { includeTypeSelect: true, previewText: this.previewSelectedText(selectedText) }
    ).open();
  }

  resolveRecordTarget(recordType, note) {
    if (recordType === "topic") {
      return { heading: "可写选题", type: "topic" };
    }
    if (recordType === "fact-check") {
      return { heading: "事实待核查", type: "fact-check" };
    }
    return { heading: "标注记录", type: note ? "highlight-with-note" : "highlight" };
  }

  getSelectionRange(editor) {
    if (!editor || typeof editor.getCursor !== "function") return null;
    try {
      return {
        from: editor.getCursor("from"),
        to: editor.getCursor("to"),
      };
    } catch (error) {
      return null;
    }
  }

  highlightOriginalSelection(editor, selectionRange, selectedText) {
    if (!editor || !selectionRange || !selectedText) return;
    if (selectedText.trim().startsWith("==") && selectedText.trim().endsWith("==")) return;
    try {
      if (typeof editor.replaceRange === "function") {
        editor.replaceRange(core.wrapMarkdownHighlight(selectedText), selectionRange.from, selectionRange.to);
      } else if (typeof editor.replaceSelection === "function") {
        editor.replaceSelection(core.wrapMarkdownHighlight(selectedText));
      }
    } catch (error) {
      console.error("Reading Capture highlight failed", error);
      new Notice("阅读记录已保存，但原文高亮失败。");
    }
  }

  async highlightOriginalInFile(file, selectedText, editor = null, selectionRange = null) {
    if (!this.isFile(file) || !selectedText) return;
    const cleanText = core.cleanSelectedText(selectedText);
    if (!cleanText.trim()) return;

    try {
      const original = await this.readText(file.path);
      const highlighted = this.highlightTextInMarkdown(original, selectedText);
      if (highlighted.changed) {
        await this.writeText(file.path, highlighted.text);
        return;
      }
    } catch (error) {
      console.error("Reading Capture file highlight failed", error);
    }

    this.highlightOriginalSelection(editor, selectionRange, selectedText);
  }

  highlightTextInMarkdown(markdown, selectedText) {
    const original = String(markdown || "");
    const candidates = this.highlightCandidates(selectedText);
    for (const candidate of candidates) {
      if (!candidate || !candidate.trim()) continue;
      const alreadyHighlighted = core.wrapMarkdownHighlight(candidate);
      if (original.includes(alreadyHighlighted)) return { text: original, changed: false };
      const index = original.indexOf(candidate);
      if (index !== -1) {
        return {
          text: `${original.slice(0, index)}${alreadyHighlighted}${original.slice(index + candidate.length)}`,
          changed: true,
        };
      }
    }
    return { text: original, changed: false };
  }

  highlightCandidates(selectedText) {
    const raw = String(selectedText || "");
    const clean = core.cleanSelectedText(raw);
    const normalizedRaw = raw.replace(/\r\n/g, "\n");
    const normalizedClean = clean.replace(/\r\n/g, "\n");
    const candidates = [normalizedRaw, normalizedClean];
    const collapsedClean = normalizedClean.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
    candidates.push(collapsedClean);
    return [...new Set(candidates.filter(Boolean))];
  }

  normalizeTextWithMap(text) {
    const normalized = [];
    const rawIndexes = [];
    let lastWasSpace = false;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (/\s/.test(char)) {
        if (normalized.length === 0 || lastWasSpace) continue;
        normalized.push(" ");
        rawIndexes.push(index);
        lastWasSpace = true;
        continue;
      }
      normalized.push(char);
      rawIndexes.push(index);
      lastWasSpace = false;
    }
    if (lastWasSpace) {
      normalized.pop();
      rawIndexes.pop();
    }
    return { text: normalized.join(""), rawIndexes };
  }

  findQuoteRawRange(fullText, quote) {
    const cleanQuote = this.markdownTextForMatch(quote).replace(/\s+/g, " ").trim();
    if (!cleanQuote) return null;
    const normalizedFull = this.normalizeTextWithMap(fullText);
    const index = normalizedFull.text.indexOf(cleanQuote);
    if (index === -1) return null;
    const start = normalizedFull.rawIndexes[index];
    const last = normalizedFull.rawIndexes[index + cleanQuote.length - 1];
    if (typeof start !== "number" || typeof last !== "number") return null;
    return { start, end: last + 1 };
  }

  markdownTextForMatch(text) {
    return core.cleanSelectedText(text)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
      .replace(/(^|\n)\s{0,3}>\s?/g, "$1")
      .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
      .replace(/(^|\n)\s*\d+\.\s+/g, "$1")
      .replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
      .replace(/(\*|_)([\s\S]*?)\1/g, "$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/~~([\s\S]*?)~~/g, "$1")
      .replace(/==([\s\S]*?)==/g, "$1");
  }

  imageMetadataFromElement(image, body, sourceFile = null) {
    const images = [...body.querySelectorAll("img")];
    const index = images.indexOf(image);
    const src = image.getAttribute("src") || image.currentSrc || "";
    const alt = image.getAttribute("alt") || "";
    return {
      type: "image",
      src: this.stableImageSource(src, sourceFile),
      alt,
      index: index >= 0 ? index : Number(image.dataset.readingCaptureImageIndex || 0),
    };
  }

  imageKeyFromElement(image, fallbackIndex = 0) {
    const src = this.normalizeImageSource(image.getAttribute("src") || image.currentSrc || "");
    const base = this.imageBaseName(src);
    return base || `image-${fallbackIndex}`;
  }

  normalizeImageSource(src) {
    const value = String(src || "").trim();
    if (!value) return "";
    try {
      return decodeURIComponent(value).replace(/\\/g, "/").replace(/[?#].*$/, "");
    } catch (error) {
      return value.replace(/\\/g, "/").replace(/[?#].*$/, "");
    }
  }

  stableImageSource(src, sourceFile = null) {
    const normalized = this.normalizeImageSource(src);
    if (!normalized) return "";
    const sourceDir = sourceFile && sourceFile.path ? normalizeVaultPath(sourceFile.path).split("/").slice(0, -1).join("/") : "";
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    const sourceAbs = sourceFile && adapter && typeof adapter.getFullPath === "function" ? this.normalizeImageSource(adapter.getFullPath(sourceFile.path)) : "";
    const sourceAbsDir = sourceAbs ? sourceAbs.split("/").slice(0, -1).join("/") : "";

    if (sourceAbsDir && normalized.includes(`${sourceAbsDir}/`)) {
      return normalizeVaultPath(normalized.slice(normalized.indexOf(`${sourceAbsDir}/`) + sourceAbsDir.length + 1));
    }
    if (sourceDir && normalized.includes(`${sourceDir}/`)) {
      return normalizeVaultPath(normalized.slice(normalized.indexOf(`${sourceDir}/`) + sourceDir.length + 1));
    }
    const vaultRoot = adapter && typeof adapter.getFullPath === "function" ? this.normalizeImageSource(adapter.getFullPath("")) : "";
    if (vaultRoot && normalized.includes(`${vaultRoot}/`)) {
      return normalizeVaultPath(normalized.slice(normalized.indexOf(`${vaultRoot}/`) + vaultRoot.length + 1));
    }
    if (!/^[a-z]+:\/\//i.test(normalized) && !normalized.startsWith("/")) return normalizeVaultPath(normalized);
    return this.imageBaseName(normalized);
  }

  imageBaseName(src) {
    const clean = this.normalizeImageSource(src).split(/[?#]/)[0];
    return clean.split("/").filter(Boolean).pop() || clean;
  }

  imagePreviewText(media) {
    const label = media && (media.alt || media.src || `第 ${Number(media.index || 0) + 1} 张图`);
    return `图片：${label}`;
  }

  findImageForAnnotation(root, annotation) {
    const images = [...root.querySelectorAll("img")];
    const mediaSrc = this.normalizeImageSource(annotation.mediaSrc || "");
    const mediaBase = this.imageBaseName(mediaSrc);
    if (mediaSrc || mediaBase) {
      const bySrc = images.find((image) => {
        const src = this.normalizeImageSource(image.getAttribute("src") || image.currentSrc || "");
        const stableSrc = this.stableImageSource(src);
        const base = this.imageBaseName(src);
        return (mediaSrc && (src.includes(mediaSrc) || stableSrc === mediaSrc || stableSrc.endsWith(`/${mediaSrc}`))) || (mediaBase && base === mediaBase);
      });
      if (bySrc) return bySrc;
    }
    const index = Number(annotation.mediaIndex);
    if (Number.isInteger(index) && index >= 0 && index < images.length) return images[index];
    return null;
  }

  trimTextRangeForHighlight(text, from, to) {
    const value = String(text || "");
    let start = Math.max(0, from);
    let end = Math.min(value.length, to);
    while (start < end && /\s/.test(value[start])) start += 1;
    while (end > start && /\s/.test(value[end - 1])) end -= 1;
    if (start >= end) return null;
    return { from: start, to: end };
  }

  previewSelectedText(text) {
    const cleanText = core.cleanSelectedText(text).trim();
    const lines = cleanText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const preview = (lines.length ? lines.slice(0, 3).join("\n") : cleanText).slice(0, 260);
    if (cleanText.length > preview.length || lines.length > 3) return `${preview}...`;
    return preview;
  }

  parsePathList(value, fallback = "") {
    return String(value || fallback || "")
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()).replace(/\/+$/g, ""))
      .filter(Boolean);
  }

  getArticleLibraryRoots() {
    return this.parsePathList(this.settings.articleLibraryRoots, DEFAULT_SETTINGS.articleLibraryRoots);
  }

  getArticleLibraryExcludeRoots() {
    const configured = this.parsePathList(this.settings.articleLibraryExcludeRoots, DEFAULT_SETTINGS.articleLibraryExcludeRoots);
    const readingRoot = normalizePath(this.settings.readingRoot || DEFAULT_SETTINGS.readingRoot).replace(/\/+$/g, "");
    return [...new Set([...configured, readingRoot, ...ALWAYS_EXCLUDED_LIBRARY_ROOTS].filter(Boolean))];
  }

  getVaultFiles() {
    const vault = this.app && this.app.vault;
    if (!vault) return [];
    if (typeof vault.getFiles === "function") return vault.getFiles();
    if (typeof vault.getMarkdownFiles === "function") return vault.getMarkdownFiles();
    return [];
  }

  isLibraryCandidate(file) {
    if (!this.isFile(file)) return false;
    const kind = sourceKindFromPath(file.path);
    return kind === "markdown" || kind === "pdf";
  }

  resolveArticleGroupPath(filePath, roots = this.getArticleLibraryRoots()) {
    const normalized = normalizeVaultPath(filePath);
    const matchedRoot = roots
      .map((root) => normalizeVaultPath(root).replace(/\/+$/g, ""))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .find((root) => normalized === root || normalized.startsWith(`${root}/`));
    if (!matchedRoot) return null;
    const relative = normalized.slice(matchedRoot.length).replace(/^\/+/, "");
    if (!relative) return null;
    const parts = relative.split("/").filter(Boolean);
    if (parts.length <= 1) {
      return {
        groupType: "single-file",
        groupPath: normalized,
        sourceRoot: matchedRoot,
      };
    }
    return {
      groupType: "directory",
      groupPath: `${matchedRoot}/${parts[0]}`,
      sourceRoot: matchedRoot,
    };
  }

  isExcludedLibraryPath(filePath) {
    const normalized = normalizeVaultPath(filePath);
    return this.getArticleLibraryExcludeRoots().some((root) => normalized === root || normalized.startsWith(`${root}/`));
  }

  articleVersionRank(fileName) {
    const name = basename(fileName, extname(fileName)).toLowerCase();
    const ext = extname(fileName).toLowerCase();
    if (ext === ".pdf") return 90;
    if (name === "article_zh_enriched") return 1;
    if (name.includes("zh_enriched") || name.includes("enriched")) return 2;
    if (name === "article_zh") return 3;
    if (name.endsWith("_zh") || name.includes("_zh_")) return 4;
    if (name === "translation" || name.includes("translation")) return 5;
    if (name === "article") return 6;
    return 20;
  }

  articleVersionLabel(fileName) {
    const name = basename(fileName, extname(fileName)).toLowerCase();
    const ext = extname(fileName).toLowerCase();
    if (ext === ".pdf") return "PDF";
    if (name.includes("zh_enriched") || name.includes("enriched")) return "扩展版";
    if (name === "article_zh" || name.endsWith("_zh") || name.includes("_zh_") || name.includes("translation")) return "中文版";
    if (name === "article") return "原文";
    return "Markdown";
  }

  async buildArticleLibraryGroups() {
    const roots = this.getArticleLibraryRoots();
    const files = this.getVaultFiles().filter((file) => this.isLibraryCandidate(file) && !this.isExcludedLibraryPath(file.path));
    const grouped = new Map();

    for (const file of files) {
      const groupInfo = this.resolveArticleGroupPath(file.path, roots);
      if (!groupInfo) continue;
      const id = `${groupInfo.groupType}:${groupInfo.groupPath}`;
      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          groupType: groupInfo.groupType,
          groupPath: groupInfo.groupPath,
          sourceRoot: groupInfo.sourceRoot,
          sourceLabel: rootSlug(groupInfo.sourceRoot),
          files: [],
        });
      }
      grouped.get(id).files.push(file);
    }

    const index = await this.loadIndex();
    const groups = [];
    for (const group of grouped.values()) {
      group.files.sort((left, right) => left.path.localeCompare(right.path));
      group.versions = group.files
        .map((file) => ({
          path: file.path,
          name: file.name,
          kind: sourceKindFromPath(file.path),
          label: this.articleVersionLabel(file.name),
          priority: this.articleVersionRank(file.name),
          mtime: file.stat && file.stat.mtime ? file.stat.mtime : 0,
        }))
        .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
      group.bestVersion = group.versions.find((version) => version.kind === "markdown") || group.versions[0] || null;
      group.mtime = Math.max(...group.files.map((file) => (file.stat && file.stat.mtime ? file.stat.mtime : 0)), 0);
      const summary = await this.readArticleGroupSummary(group);
      group.title = summary.title;
      group.snippet = summary.snippet;
      group.dateLabel = this.articleDateLabel(group);
      group.stats = await this.articleGroupStats(group, index);
      groups.push(group);
    }

    return groups.sort((left, right) => right.mtime - left.mtime);
  }

  async readArticleGroupSummary(group) {
    const fallbackTitle = this.cleanArticleTitle(group.groupType === "single-file" ? titleFromPath(group.groupPath) : basename(group.groupPath));
    const best = group.bestVersion;
    if (!best || best.kind !== "markdown") return { title: fallbackTitle, snippet: "" };
    try {
      const markdown = await this.readText(best.path);
      const frontmatterTitle = this.readFrontmatterValue(markdown, "title");
      const heading = (markdown.match(/^\s*#\s+(.+)$/m) || [])[1] || "";
      const title = this.cleanArticleTitle(frontmatterTitle || heading || fallbackTitle);
      const snippet = this.articleSnippet(markdown, title);
      return { title, snippet };
    } catch (error) {
      return { title: fallbackTitle, snippet: "" };
    }
  }

  cleanArticleTitle(value) {
    return String(value || "未命名文章")
      .replace(/^\d{8}[_-]?/, "")
      .replace(/^\d{4}-\d{2}-\d{2}[_-]?/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "未命名文章";
  }

  articleSnippet(markdown, title) {
    const withoutFrontmatter = String(markdown || "").replace(/^---[\s\S]*?\n---\s*/, "");
    const lines = withoutFrontmatter
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/!\[[^\]]*]\([^)]+\)/g, "")
          .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
          .replace(/^#{1,6}\s+/, "")
          .replace(/^>\s?/, "")
          .trim()
      )
      .filter((line) => line && line !== title && !/^[-*_]{3,}$/.test(line));
    const text = lines.find((line) => line.length >= 18) || lines[0] || "";
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }

  articleDateLabel(group) {
    const value = `${group.groupPath} ${group.title}`;
    const compact = value.match(/(20\d{2})(\d{2})(\d{2})/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dashed = value.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    if (group.mtime) return new Date(group.mtime).toISOString().slice(0, 10);
    return "";
  }

  async articleGroupStats(group, index) {
    const paths = new Set(group.versions.map((version) => version.path));
    const stats = {
      annotationCount: 0,
      topicCount: 0,
      factCount: 0,
      imageCount: 0,
      hasReading: false,
      lastReadTime: 0,
      readingNotePath: "",
    };
    const sources = index && index.sources ? index.sources : {};
    for (const [sourcePath, entry] of Object.entries(sources)) {
      if (!paths.has(sourcePath)) continue;
      stats.hasReading = true;
      stats.annotationCount += Number(entry.annotation_count || 0);
      const updatedTime = Date.parse(entry.updated || "");
      if (Number.isFinite(updatedTime)) stats.lastReadTime = Math.max(stats.lastReadTime, updatedTime);
      if (!stats.readingNotePath && entry.reading_note_path) stats.readingNotePath = entry.reading_note_path;
      if (!entry.reading_note_path) continue;
      try {
        const noteMarkdown = await this.readText(entry.reading_note_path);
        const annotations = this.parseAnnotationsFromReadingNote(noteMarkdown);
        stats.topicCount += annotations.filter((item) => this.annotationMatchesFilter(item, "topic")).length;
        stats.factCount += annotations.filter((item) => this.annotationMatchesFilter(item, "fact")).length;
        stats.imageCount += annotations.filter((item) => this.annotationMatchesFilter(item, "image")).length;
      } catch (error) {
        // A missing note should not block the library from opening.
      }
    }
    return stats;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.readingRoot = normalizePath(this.settings.readingRoot || DEFAULT_SETTINGS.readingRoot);
    this.settings.articleLibraryRoots = this.settings.articleLibraryRoots || DEFAULT_SETTINGS.articleLibraryRoots;
    this.settings.articleLibraryExcludeRoots = this.settings.articleLibraryExcludeRoots || DEFAULT_SETTINGS.articleLibraryExcludeRoots;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async captureForFile(file, { selectedText, note, type, heading, media = null }) {
    if (!this.isFile(file)) {
      new Notice("没有找到当前文件。");
      return;
    }
    if (file.path.startsWith(`${this.settings.readingRoot}/`)) {
      new Notice("当前文件已经是阅读记录，请在源文档中标注。");
      return;
    }

    const noteFile = await this.getOrCreateReadingNote(file);
    const block = core.buildAnnotationBlock({
      selectedText,
      note,
      type,
      captureSource: "obsidian-plugin",
      media,
      now: this.now(),
    });
    const original = await this.readText(noteFile.path);
    const updated = core.appendUnderHeading(original, heading, block);
    await this.writeText(noteFile.path, this.touchFrontmatter(updated));
    await this.refreshIndexEntry(file, noteFile, "obsidian-plugin");
    new Notice("已保存到阅读记录。");

    if (this.settings.openNoteAfterCapture) {
      await this.openFile(noteFile);
    }
  }

  async getOrCreateReadingNote(sourceFile) {
    await this.ensureReadingRoot();
    const source = this.buildSource(sourceFile);
    const index = await this.loadIndex();
    const existing = index.sources && index.sources[source.source_vault_path];
    if (existing && existing.reading_note_path) {
      const existingFile = this.app.vault.getAbstractFileByPath(existing.reading_note_path);
      if (this.isFile(existingFile)) return existingFile;
    }

    const notePath = core.buildReadingNotePath({
      source,
      readingRoot: this.settings.readingRoot,
      now: this.now(),
    });
    await this.ensureFolderForPath(notePath);
    const noteFile = await this.createFileIfMissing(notePath, core.buildInitialReadingNote({ source, now: this.now() }));
    await this.refreshIndexEntry(sourceFile, noteFile, "obsidian-plugin");
    return noteFile;
  }

  buildSource(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const title = cache && cache.frontmatter && cache.frontmatter.title ? String(cache.frontmatter.title) : file.basename;
    const adapter = this.app.vault.adapter;
    const absPath = adapter && typeof adapter.getFullPath === "function" ? adapter.getFullPath(file.path) : "";
    return core.buildSourceMetadata({
      vaultPath: file.path,
      absPath,
      title,
      stat: file.stat,
      now: this.now(),
    });
  }

  async refreshIndexEntry(sourceFile, noteFile, captureSource) {
    const source = this.buildSource(sourceFile);
    const index = await this.loadIndex();
    const markdown = await this.readText(noteFile.path);
    core.upsertIndexEntry(index, {
      source,
      readingNotePath: noteFile.path,
      annotationCount: core.countAnnotations(markdown),
      status: this.readFrontmatterValue(markdown, "status") || "reading",
      codexStatus: this.readFrontmatterValue(markdown, "codex_status") || "pending_summary",
      captureSource,
      now: this.now(),
    });
    await this.saveIndex(index);
  }

  async findReadingNoteForSource(sourceFile) {
    const source = this.buildSource(sourceFile);
    const index = await this.loadIndex();
    const existing = index.sources && index.sources[source.source_vault_path];
    if (!existing || !existing.reading_note_path) return null;
    const noteFile = this.app.vault.getAbstractFileByPath(existing.reading_note_path);
    if (this.isFile(noteFile)) return noteFile;
    if (await this.pathExists(existing.reading_note_path)) return this.makeFileRef(existing.reading_note_path);
    return null;
  }

  extractQuotesFromReadingNote(markdown) {
    return this.parseAnnotationsFromReadingNote(markdown).map((item) => item.quote).filter(Boolean);
  }

  parseAnnotationsFromReadingNote(markdown) {
    const items = [];
    const lines = String(markdown || "").split(/\r?\n/);
    let section = "";
    let current = null;
    let mode = "";

    const finish = () => {
      if (!current) return;
      current.quote = core.cleanSelectedText(current.quoteLines.join("\n").trim());
      current.note = current.noteLines.join("\n").trim();
      delete current.quoteLines;
      delete current.noteLines;
      items.push(current);
      current = null;
      mode = "";
    };

    for (const line of lines) {
      if (line.startsWith("## ")) {
        finish();
        section = line.replace(/^##\s+/, "").trim();
        continue;
      }
      if (line.startsWith("### ann_")) {
        finish();
        current = {
          id: line.replace(/^###\s+/, "").trim(),
          section,
          time: "",
          captureSource: "",
          type: "",
          quoteHash: "",
          locationHint: "",
          confidence: "",
          mediaType: "",
          mediaSrc: "",
          mediaAlt: "",
          mediaIndex: "",
          mediaHash: "",
          quote: "",
          note: "",
          quoteLines: [],
          noteLines: [],
        };
        mode = "";
        continue;
      }
      if (!current) continue;
      const metaMatch = line.match(/^-\s+([^:]+):\s*(.*)$/);
      if (metaMatch) {
        const key = metaMatch[1].trim();
        const value = metaMatch[2].trim();
        if (key === "time") current.time = value;
        if (key === "capture_source") current.captureSource = value;
        if (key === "type") current.type = value;
        if (key === "quote_hash") current.quoteHash = value;
        if (key === "location_hint") current.locationHint = value;
        if (key === "confidence") current.confidence = value;
        if (key === "media_type") current.mediaType = value;
        if (key === "media_src") current.mediaSrc = this.readInlineValue(value);
        if (key === "media_alt") current.mediaAlt = this.readInlineValue(value);
        if (key === "media_index") current.mediaIndex = value;
        if (key === "media_hash") current.mediaHash = value;
        mode = "";
        continue;
      }
      if (line.startsWith(">")) {
        current.quoteLines.push(line.replace(/^>\s?/, ""));
        mode = "quote";
        continue;
      }
      if (line.startsWith("我的想法：")) {
        const rest = line.replace(/^我的想法：\s*/, "");
        if (rest) current.noteLines.push(rest);
        mode = "note";
        continue;
      }
      if (mode === "quote" && line.trim() === "") {
        current.quoteLines.push("");
        continue;
      }
      if (mode === "note") {
        current.noteLines.push(line);
      }
    }
    finish();
    return items.filter((item) => item.quote || item.note);
  }

  annotationLabel(item) {
    if (!item) return "记录";
    if (item.mediaType === "image") return item.type === "topic" ? "图片选题" : item.type === "fact-check" ? "图片待核查" : "图片想法";
    if (item.section === "可写选题" || item.type === "topic") return "可写选题";
    if (item.section === "事实待核查" || item.type === "fact-check") return "事实待核查";
    if (item.type === "idea" || !item.quote) return "想法";
    if (item.note) return "标注想法";
    return "高亮";
  }

  typeClass(item) {
    if (!item) return "is-thought";
    if (item.mediaType === "image") return "is-image";
    if (item.section === "可写选题" || item.type === "topic") return "is-topic";
    if (item.section === "事实待核查" || item.type === "fact-check") return "is-fact";
    if (!item.quote || item.type === "idea") return "is-idea";
    return "is-thought";
  }

  annotationMatchesFilter(item, filter) {
    if (!item) return false;
    if (!filter || filter === "all") return true;
    if (filter === "unlocated") return !item.located && !!(item.quote || item.mediaType);
    if (filter === "image") return item.mediaType === "image";
    if (filter === "topic") return item.section === "可写选题" || item.type === "topic";
    if (filter === "fact") return item.section === "事实待核查" || item.type === "fact-check";
    if (filter === "thought") return item.mediaType !== "image" && !(item.section === "可写选题" || item.type === "topic") && !(item.section === "事实待核查" || item.type === "fact-check");
    return true;
  }

  shortTime(value) {
    const text = String(value || "");
    const match = text.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "";
  }

  cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  async resolveCurrentReadingNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    if (file.path.startsWith(`${this.settings.readingRoot}/`)) return file;
    return this.getOrCreateReadingNote(file);
  }

  async updateReadingStatus(noteFile, status, codexStatus) {
    const original = await this.readText(noteFile.path);
    let updated = this.replaceFrontmatterValue(original, "status", status);
    updated = this.replaceFrontmatterValue(updated, "codex_status", codexStatus);
    updated = this.touchFrontmatter(updated);
    await this.writeText(noteFile.path, updated);
  }

  async rebuildIndex() {
    await this.ensureReadingRoot();
    const index = core.createEmptyIndex(this.now());
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${this.settings.readingRoot}/`) && file.path !== this.indexPath() && file.name !== "inbox.md");

    for (const file of files) {
      const text = await this.readText(file.path);
      const sourcePath = this.readFrontmatterValue(text, "source_vault_path");
      if (!sourcePath) continue;
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      const source = this.isFile(sourceFile) ? this.buildSource(sourceFile) : core.buildSourceMetadata({
        vaultPath: sourcePath,
        title: this.readFrontmatterValue(text, "source_title") || sourcePath,
        stat: {},
        now: this.now(),
      });
      core.upsertIndexEntry(index, {
        source,
        readingNotePath: file.path,
        annotationCount: core.countAnnotations(text),
        status: this.readFrontmatterValue(text, "status") || "reading",
        codexStatus: this.readFrontmatterValue(text, "codex_status") || "pending_summary",
        captureSource: "rebuild-index",
        now: this.now(),
      });
    }

    await this.saveIndex(index);
    return Object.keys(index.sources || {}).length;
  }

  async ensureReadingRoot() {
    await this.ensureFolder(this.settings.readingRoot);
    const inboxPath = normalizePath(`${this.settings.readingRoot}/inbox.md`);
    await this.createFileIfMissing(inboxPath, "# 阅读记录 Inbox\n\n未能明确关联到源文档的想法先放这里。\n");
    const indexMdPath = normalizePath(`${this.settings.readingRoot}/index.md`);
    await this.createFileIfMissing(indexMdPath, "# 阅读记录索引\n\n这里可以后续由 Codex 定期生成可读索引。\n");
    await this.createFileIfMissing(this.indexPath(), `${JSON.stringify(core.createEmptyIndex(this.now()), null, 2)}\n`);
  }

  async ensureFolderForPath(filePath) {
    const parts = normalizePath(filePath).split("/");
    parts.pop();
    await this.ensureFolder(parts.join("/"));
  }

  async ensureFolder(folderPath) {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing && !(await this.pathExists(current))) await this.app.vault.createFolder(current);
    }
  }

  indexPath() {
    return normalizePath(`${this.settings.readingRoot}/.reading-index.json`);
  }

  async loadIndex() {
    const file = this.app.vault.getAbstractFileByPath(this.indexPath());
    if (!this.isFile(file) && !(await this.pathExists(this.indexPath()))) return core.createEmptyIndex(this.now());
    try {
      return JSON.parse(await this.readText(this.indexPath()));
    } catch (error) {
      new Notice("阅读索引解析失败，将使用空索引。");
      return core.createEmptyIndex(this.now());
    }
  }

  async saveIndex(index) {
    const indexPath = this.indexPath();
    await this.ensureFolderForPath(indexPath);
    const text = `${JSON.stringify(index, null, 2)}\n`;
    await this.writeText(indexPath, text);
  }

  async openFile(file) {
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  isFile(value) {
    return !!value && typeof value.path === "string" && typeof value.name === "string" && !Array.isArray(value.children);
  }

  makeFileRef(filePath) {
    const normalized = normalizePath(filePath);
    const name = normalized.split("/").pop() || normalized;
    return {
      path: normalized,
      name,
      basename: name.replace(/\.[^.]+$/, ""),
      stat: { mtime: Date.now(), size: 0 },
    };
  }

  async pathExists(filePath) {
    const normalized = normalizePath(filePath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) return true;
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.exists === "function") {
      return !!(await adapter.exists(normalized));
    }
    return false;
  }

  async createFileIfMissing(filePath, content) {
    const normalized = normalizePath(filePath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (this.isFile(existing)) return existing;
    if (await this.pathExists(normalized)) return this.makeFileRef(normalized);
    try {
      return await this.app.vault.create(normalized, content);
    } catch (error) {
      if (/already exists/i.test(String(error && error.message ? error.message : error))) {
        return this.makeFileRef(normalized);
      }
      throw error;
    }
  }

  async readText(filePath) {
    const normalized = normalizePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (this.isFile(file)) return this.app.vault.read(file);
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.read === "function") return adapter.read(normalized);
    throw new Error(`Cannot read file: ${normalized}`);
  }

  async writeText(filePath, content) {
    const normalized = normalizePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (this.isFile(file)) {
      await this.app.vault.modify(file, content);
      return;
    }
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.write === "function") {
      await adapter.write(normalized, content);
      return;
    }
    await this.app.vault.create(normalized, content);
  }

  replaceFrontmatterValue(markdown, key, value) {
    const text = String(markdown || "");
    const escaped = JSON.stringify(String(value));
    if (!text.startsWith("---\n")) return text;
    const end = text.indexOf("\n---", 4);
    if (end === -1) return text;
    const frontmatter = text.slice(0, end);
    if (new RegExp(`^${key}:`, "m").test(frontmatter)) {
      return text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${escaped}`);
    }
    return `${frontmatter}\n${key}: ${escaped}${text.slice(end)}`;
  }

  touchFrontmatter(markdown) {
    return this.replaceFrontmatterValue(markdown, "updated", this.now());
  }

  readFrontmatterValue(markdown, key) {
    const text = String(markdown || "");
    const match = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    if (!match) return "";
    return this.readInlineValue(match[1]);
  }

  readInlineValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw.replace(/^["']|["']$/g, "");
    }
  }

  now() {
    const date = new Date();
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = String(Math.floor(abs / 60)).padStart(2, "0");
    const minutes = String(abs % 60).padStart(2, "0");
    const local = new Date(date.getTime() + offsetMinutes * 60000).toISOString().slice(0, 19);
    return `${local}${sign}${hours}:${minutes}`;
  }
};
