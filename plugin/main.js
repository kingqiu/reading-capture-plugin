const { ItemView, MarkdownRenderer, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require("obsidian");
const core = require("./reading-core");

const READER_VIEW_TYPE = "reading-capture-reader";
const ARTICLE_LIBRARY_VIEW_TYPE = "reading-capture-library";
const TOPIC_POOL_VIEW_TYPE = "reading-capture-topic-pool";
const RECORD_VIEW_TYPE = "reading-capture-record";

const { KNOWN_SOURCE_ROOTS, basename, extname, normalizeVaultPath, rootSlug, sourceKindFromPath, titleFromPath } = core;

const ALWAYS_EXCLUDED_LIBRARY_ROOTS = [
  "Learning/web/x_articles/digest",
  "Learning/web/x_articles/digests",
];

const ARTICLE_LIBRARY_ROOTS_PLACEHOLDER = ["Articles", "Reading", "Sources"].join("\n");
const ARTICLE_LIBRARY_CACHE_VERSION = 1;
const WORKFLOW_STATUS_OPTIONS = [
  ["reading", "阅读中"],
  ["annotated", "已标注"],
  ["pending-summary", "待总结"],
];

const DEFAULT_SETTINGS = {
  readingRoot: "Reading Capture/notes",
  openNoteAfterCapture: false,
  articleLibraryRoots: "",
  articleLibraryExcludeRoots: ".obsidian",
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
          .setPlaceholder(DEFAULT_SETTINGS.readingRoot)
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
          .setPlaceholder(ARTICLE_LIBRARY_ROOTS_PLACEHOLDER)
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
          .setPlaceholder([DEFAULT_SETTINGS.readingRoot, DEFAULT_SETTINGS.articleLibraryExcludeRoots].join("\n"))
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

  async setSource(sourcePath, annotationId = "") {
    this.sourcePath = sourcePath;
    this.pendingAnnotationId = annotationId || "";
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

  getScrollContainer() {
    const container = this.containerEl && this.containerEl.children ? this.containerEl.children[1] : null;
    if (container && typeof container.querySelector === "function") {
      return container.querySelector(".reading-capture-reader-body") || container;
    }
    return container;
  }

  async renderKeepingScroll() {
    const container = this.getScrollContainer();
    const scrollTop = container ? container.scrollTop : 0;
    const scrollLeft = container ? container.scrollLeft : 0;
    await this.render();
    const restored = this.getScrollContainer();
    if (!restored) return;
    const restore = () => {
      restored.scrollTop = scrollTop;
      restored.scrollLeft = scrollLeft;
    };
    restore();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else setTimeout(restore, 0);
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

    const workspace = container.createDiv({ cls: "reading-capture-reader-workspace" });
    if (this.sidebarCollapsed) workspace.addClass("is-sidebar-collapsed");
    const mainPane = workspace.createDiv({ cls: "reading-capture-reader-main" });
    const toolbar = mainPane.createDiv({ cls: "reading-capture-reader-toolbar" });
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
      await this.renderKeepingScroll();
    });

    const articlePanel = mainPane.createDiv({ cls: "reading-capture-reader-article-panel" });
    const body = articlePanel.createDiv({ cls: "reading-capture-reader-body markdown-preview-view" });
    const footer = mainPane.createDiv({ cls: "reading-capture-reader-footer" });
    const sidebar = workspace.createEl("aside", { cls: "reading-capture-reader-sidebar" });
    if (this.sidebarCollapsed) sidebar.addClass("is-collapsed");
    const tooltip = container.createDiv({ cls: "reading-capture-floating-note" });
    const markdown = await this.plugin.readText(sourceFile.path);
    if (MarkdownRenderer && typeof MarkdownRenderer.render === "function") {
      await MarkdownRenderer.render(this.app, markdown, body, sourceFile.path, this);
    } else {
      await MarkdownRenderer.renderMarkdown(markdown, body, sourceFile.path, this);
    }
    this.indexReaderImages(body);
    this.renderReaderFooter(footer, markdown, body);
    const annotations = await this.applyHighlights(body, sourceFile);
    this.renderSidebar(sidebar, annotations, sourceFile);
    this.bindHighlightInteractions(body, tooltip, sidebar, annotations);
    if (this.pendingAnnotationId) {
      const annotationId = this.pendingAnnotationId;
      this.pendingAnnotationId = "";
      this.activateAnnotation(annotationId, true);
    }

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

  renderReaderFooter(footer, markdown, body) {
    footer.empty();
    const text = this.plugin.markdownTextForMatch(markdown || "").replace(/\s+/g, " ").trim();
    const charCount = text.length;
    const minutes = Math.max(1, Math.ceil(charCount / 360));
    footer.createEl("span", { text: `字数 ${charCount.toLocaleString()}` });
    footer.createEl("span", { text: `预计阅读 ${minutes} 分钟` });
    const position = footer.createEl("span", { cls: "reading-capture-reader-position", text: `第 0 字 / 共 ${charCount.toLocaleString()} 字` });
    const progress = footer.createDiv({ cls: "reading-capture-reader-progress" });
    const bar = progress.createDiv({ cls: "reading-capture-reader-progress-bar" });
    const percent = footer.createEl("span", { cls: "reading-capture-reader-percent", text: "0%" });
    footer.createEl("span", { cls: "reading-capture-reader-saved", text: "阅读进度已自动保存" });

    const update = () => {
      const max = Math.max((body.scrollHeight || 0) - (body.clientHeight || 0), 0);
      const ratio = max ? Math.min(Math.max((body.scrollTop || 0) / max, 0), 1) : 0;
      const value = Math.round(ratio * 100);
      const current = Math.min(Math.round(charCount * ratio), charCount);
      bar.style.width = `${value}%`;
      percent.textContent = `${value}%`;
      position.textContent = `第 ${current.toLocaleString()} 字 / 共 ${charCount.toLocaleString()} 字`;
    };
    if (typeof body.addEventListener === "function") body.addEventListener("scroll", update);
    update();
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
        await this.renderKeepingScroll();
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
        await this.renderKeepingScroll();
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
        await this.renderKeepingScroll();
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

  renderSidebar(sidebar, annotations, sourceFile = null) {
    sidebar.empty();
    const items = annotations || [];
    const header = sidebar.createDiv({ cls: "reading-capture-sidebar-header" });
    header.createEl("h3", { text: "阅读标注" });
    header.createEl("div", { cls: "reading-capture-sidebar-count", text: `${items.length} 条记录` });
    this.renderSidebarFilters(sidebar, items);

    if (!items.length) {
      const empty = sidebar.createDiv({ cls: "reading-capture-sidebar-empty" });
      empty.createEl("strong", { text: "还没有记录" });
      empty.createEl("span", { text: "选中文字后右键记录，或直接写一条当前想法。" });
      this.renderSidebarGlobalActions(sidebar, sourceFile);
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
      const typeClass = this.plugin.typeClass(item);
      const card = list.createDiv({ cls: `reading-capture-sidebar-card ${typeClass}` });
      card.dataset.annotationId = item.id;
      const top = card.createDiv({ cls: "reading-capture-sidebar-card-top" });
      const meta = top.createDiv({ cls: "reading-capture-sidebar-card-meta" });
      meta.createEl("span", { cls: `reading-capture-type-pill ${typeClass}`, text: this.plugin.annotationLabel(item) });
      meta.createEl("span", { cls: "reading-capture-sidebar-time", text: this.plugin.shortTime(item.time) });
      const copy = top.createEl("button", {
        cls: "reading-capture-sidebar-copy",
        text: "...",
        attr: { title: "复制引用", "aria-label": "复制引用" },
      });
      copy.addEventListener("click", async (event) => {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        const text = item.quote || item.note || item.mediaAlt || item.mediaSrc || "";
        if (!text) return;
        await this.plugin.writeClipboardText(text);
        new Notice("已复制引用。");
      });
      if (!item.located && (item.quote || item.mediaType)) {
        card.addClass("is-unlocated");
        meta.createEl("span", { cls: "reading-capture-location-pill", text: "未定位" });
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
    sidebar.createEl("div", { cls: "reading-capture-sidebar-hint", text: "点击标注卡片可跳转到正文位置。" });
    this.renderSidebarGlobalActions(sidebar, sourceFile);
  }

  renderSidebarGlobalActions(sidebar, sourceFile) {
    const actions = sidebar.createDiv({ cls: "reading-capture-sidebar-global-actions" });
    const openNote = actions.createEl("button", { text: "打开阅读记录" });
    openNote.addEventListener("click", async () => {
      if (!sourceFile) return;
      const noteFile = await this.plugin.findReadingNoteForSource(sourceFile);
      if (!noteFile) {
        new Notice("还没有阅读记录。");
        return;
      }
      await this.plugin.openReadingRecord(noteFile, sourceFile);
    });
    const copyPath = actions.createEl("button", { text: "复制文章路径" });
    copyPath.addEventListener("click", async () => {
      if (!sourceFile || !sourceFile.path) return;
      await this.plugin.writeClipboardText(sourceFile.path);
      new Notice("已复制文章路径。");
    });
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
    this.searchDraft = "";
    this.sourceFilter = "all";
    this.stateFilter = "all";
    this.progressFilter = "all";
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
    if (!this.groups.length) {
      const snapshot = this.plugin.getArticleLibrarySnapshot();
      if (snapshot.length) {
        this.groups = snapshot;
        if (!this.selectedGroupId && this.groups.length) this.selectedGroupId = this.groups[0].id;
      }
    }
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
    const workspace = shell.createDiv({ cls: "reading-capture-library-workspace" });
    const primary = workspace.createDiv({ cls: "reading-capture-library-primary" });
    const top = primary.createDiv({ cls: "reading-capture-library-top" });
    const title = top.createDiv({ cls: "reading-capture-library-title" });
    title.createEl("h1", { text: "知见录" });
    title.createEl("div", { cls: "reading-capture-library-subtitle", text: `${this.groups.length} 个文章组 · ${this.totalAnnotationCount()} 条阅读标注` });
    const tools = top.createDiv({ cls: "reading-capture-library-tools" });
    const search = tools.createEl("input", {
      type: "search",
      placeholder: "搜索标题、路径、摘要...",
      value: this.searchDraft,
    });
    search.addEventListener("input", () => {
      this.searchDraft = search.value;
    });
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      this.applySearch();
    });
    const searchButton = tools.createEl("button", { text: "搜索" });
    searchButton.addEventListener("click", () => {
      this.searchDraft = search.value;
      this.applySearch();
    });
    const refresh = tools.createEl("button", { text: this.isLoading ? "扫描中..." : "重新扫描" });
    refresh.disabled = this.isLoading;
    refresh.addEventListener("click", () => this.reload());
    if (this.query) {
      const clearButton = tools.createEl("button", { text: "清除" });
      clearButton.addEventListener("click", () => {
        this.query = "";
        this.searchDraft = "";
        this.render();
      });
    }
    this.renderMainLayout(primary, workspace);
  }

  applySearch() {
    this.query = String(this.searchDraft || "").trim();
    const visibleGroups = this.visibleGroups();
    if (this.groups.length && !visibleGroups.find((group) => group.id === this.selectedGroupId)) {
      const first = visibleGroups[0];
      this.selectedGroupId = first ? first.id : "";
    }
    this.render();
  }

  renderMainLayout(primary, workspace) {
    const layout = primary.createDiv({ cls: "reading-capture-library-layout" });
    const filters = layout.createEl("aside", { cls: "reading-capture-library-filters" });
    const list = layout.createDiv({ cls: "reading-capture-library-list" });
    const detail = workspace.createEl("aside", { cls: "reading-capture-library-detail" });

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
      this.stateOptions(),
      this.stateFilter,
      (value) => {
        this.stateFilter = value;
        this.render();
      }
    );
    this.renderFilterSection(filters, "进度", this.progressOptions(), this.progressFilter, (value) => {
      this.progressFilter = value;
      this.render();
    });
    this.renderFilterSection(
      filters,
      "排序",
      [
        ["mtime-desc", "最近更新"],
        ["last-read-desc", "最近阅读"],
        ["annotations-desc", "标注最多"],
        ["files-desc", "文件最多"],
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
      const button = section.createEl("button");
      button.createEl("span", { cls: "reading-capture-library-filter-label", text: label });
      if (count !== undefined) button.createEl("span", { cls: "reading-capture-library-filter-count", text: String(count) });
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

  stateOptions() {
    const groups = this.filterBaseGroups();
    const count = (predicate) => groups.filter(predicate).length;
    return [
      ["all", "全部", groups.length],
      ["annotated", "有标注", count((group) => group.stats.annotationCount > 0)],
      ["unannotated", "无标注", count((group) => group.stats.annotationCount <= 0)],
      ["topic", "有选题", count((group) => group.stats.topicCount > 0)],
      ["fact", "待核查", count((group) => group.stats.factCount > 0)],
      ["has-pdf", "有 PDF", count((group) => this.groupHasPdf(group))],
      ["has-zh", "有中文", count((group) => this.groupHasChineseVersion(group))],
    ];
  }

  progressOptions() {
    const groups = this.filterBaseGroups();
    const count = (status) => groups.filter((group) => this.groupWorkflowStatus(group) === status).length;
    return [
      ["all", "全部", groups.length],
      ["unread", "未读", count("unread")],
      ...WORKFLOW_STATUS_OPTIONS.map(([value, label]) => [value, label, count(value)]),
    ];
  }

  filterBaseGroups() {
    const query = String(this.query || "").trim().toLowerCase();
    return this.groups.filter((group) => {
      if (this.sourceFilter !== "all" && group.sourceLabel !== this.sourceFilter) return false;
      if (!query) return true;
      return this.groupMatchesQuery(group, query);
    });
  }

  visibleGroups() {
    const query = String(this.query || "").trim().toLowerCase();
    const groups = this.groups.filter((group) => {
      if (this.sourceFilter !== "all" && group.sourceLabel !== this.sourceFilter) return false;
      if (this.stateFilter === "annotated" && group.stats.annotationCount <= 0) return false;
      if (this.stateFilter === "unannotated" && group.stats.annotationCount > 0) return false;
      if (this.stateFilter === "topic" && group.stats.topicCount <= 0) return false;
      if (this.stateFilter === "fact" && group.stats.factCount <= 0) return false;
      if (this.stateFilter === "has-pdf" && !this.groupHasPdf(group)) return false;
      if (this.stateFilter === "has-zh" && !this.groupHasChineseVersion(group)) return false;
      if (this.progressFilter !== "all" && this.groupWorkflowStatus(group) !== this.progressFilter) return false;
      if (!query) return true;
      return this.groupMatchesQuery(group, query);
    });

    return groups.sort((left, right) => {
      if (this.sortMode === "title-asc") return left.title.localeCompare(right.title);
      if (this.sortMode === "annotations-desc") return right.stats.annotationCount - left.stats.annotationCount || right.mtime - left.mtime;
      if (this.sortMode === "last-read-desc") return (right.stats.lastReadTime || 0) - (left.stats.lastReadTime || 0) || right.mtime - left.mtime;
      if (this.sortMode === "files-desc") return right.files.length - left.files.length || right.mtime - left.mtime;
      return right.mtime - left.mtime;
    });
  }

  groupMatchesQuery(group, query) {
    return [group.title, group.snippet, group.groupPath, group.files.map((file) => file.name).join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  groupHasPdf(group) {
    return !!(group && group.versions && group.versions.some((version) => version.kind === "pdf"));
  }

  groupHasChineseVersion(group) {
    return !!(
      group &&
      group.versions &&
      group.versions.some((version) => {
        const label = String(version.label || "");
        const path = String(version.path || "").toLowerCase();
        return label.includes("中文") || label.includes("扩展") || path.includes("_zh") || path.includes("translation");
      })
    );
  }

  groupWorkflowStatus(group) {
    const stats = group && group.stats ? group.stats : {};
    if (!stats.hasReading) return "unread";
    if (stats.status === "used") return "used";
    if (stats.status === "writing-ready") return "writing-ready";
    if (stats.status === "annotated" && stats.codexStatus === "pending_summary") return "pending-summary";
    if (stats.status === "annotated") return "annotated";
    if (Number(stats.annotationCount || 0) > 0) return "annotated";
    return stats.status || "reading";
  }

  workflowStatusLabel(status) {
    const labels = {
      unread: "未读",
      reading: "阅读中",
      annotated: "已标注",
      "pending-summary": "待总结",
      "writing-ready": "可写作",
      used: "已使用",
    };
    return labels[status] || "阅读中";
  }

  workflowStatusClass(status) {
    return `is-status-${String(status || "reading").replace(/[^a-z0-9-]/g, "-")}`;
  }

  renderList(list) {
    list.empty();
    const groups = this.visibleGroups();
    if (this.isLoading && !groups.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "正在整理知见录，请稍等。" });
      return;
    }
    if (!groups.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: this.plugin.articleLibraryEmptyMessage() });
      return;
    }
    for (const group of groups) {
      const status = this.groupWorkflowStatus(group);
      const statusClass = this.workflowStatusClass(status);
      const card = list.createDiv({ cls: `reading-capture-library-card ${statusClass}` });
      card.setAttr("role", "button");
      card.setAttr("tabindex", "0");
      if (group.id === this.selectedGroupId) card.addClass("is-active");
      card.addEventListener("click", () => {
        this.selectedGroupId = group.id;
        this.render();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.selectedGroupId = group.id;
        this.render();
      });

      const top = card.createDiv({ cls: "reading-capture-library-card-top" });
      const meta = top.createDiv({ cls: "reading-capture-library-card-meta" });
      meta.createEl("span", { text: group.sourceLabel });
      meta.createEl("span", { text: group.dateLabel });
      meta.createEl("span", { text: group.groupType === "single-file" ? "单文件" : "文章组" });
      top.createEl("span", {
        cls: `reading-capture-library-status-pill ${statusClass}`,
        text: this.workflowStatusLabel(status),
      });
      card.createEl("h2", { text: group.title });
      if (group.snippet) card.createEl("p", { text: group.snippet });
      const bottom = card.createDiv({ cls: "reading-capture-library-card-bottom" });
      const metrics = bottom.createDiv({ cls: "reading-capture-library-card-metrics" });
      metrics.createEl("span", { text: `${group.stats.annotationCount} 条标注` });
      metrics.createEl("span", { text: `${group.files.length} 个文件` });
      const open = bottom.createEl("button", { text: "阅读" });
      open.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.openBestVersion(group);
      });
    }
    if (this.isLoading) this.renderLoadingCards(list);
  }

  renderLoadingCards(list) {
    for (let index = 0; index < 2; index += 1) {
      const card = list.createDiv({ cls: "reading-capture-library-card reading-capture-library-skeleton" });
      card.createDiv({ cls: "reading-capture-skeleton-line is-short" });
      card.createDiv({ cls: "reading-capture-skeleton-line is-title" });
      card.createDiv({ cls: "reading-capture-skeleton-line" });
      card.createDiv({ cls: "reading-capture-skeleton-line is-bottom" });
    }
  }

  renderDetail(detail) {
    detail.empty();
    const selected = this.groups.find((group) => group.id === this.selectedGroupId);
    if (!selected) {
      detail.createDiv({ cls: "reading-capture-library-empty", text: "选择一篇文章后，这里会显示版本和阅读记录。" });
      return;
    }

    const status = this.groupWorkflowStatus(selected);
    const statusClass = this.workflowStatusClass(status);
    detail.addClass(statusClass);
    const detailHeader = detail.createDiv({ cls: "reading-capture-library-detail-header" });
    detailHeader.createEl("div", { cls: "reading-capture-library-detail-kicker", text: `${String(selected.sourceLabel || "").toUpperCase()} / ${selected.dateLabel}` });
    const titleRow = detailHeader.createDiv({ cls: "reading-capture-library-detail-title-row" });
    titleRow.createEl("h2", { text: selected.title });
    titleRow.createEl("span", {
      cls: `reading-capture-library-detail-status ${statusClass}`,
      text: this.workflowStatusLabel(status),
    });
    detailHeader.createEl("p", { cls: "reading-capture-library-detail-path", text: selected.groupPath });

    const signalSection = detail.createDiv({ cls: "reading-capture-library-detail-section" });
    signalSection.createEl("h3", { text: "信号" });
    const stats = signalSection.createDiv({ cls: "reading-capture-library-stats" });
    stats.createEl("span", { text: `标注 ${selected.stats.annotationCount}` });
    stats.createEl("span", { text: `选题 ${selected.stats.topicCount}` });
    stats.createEl("span", { text: `待核查 ${selected.stats.factCount}` });

    const actionSection = detail.createDiv({ cls: "reading-capture-library-detail-section" });
    actionSection.createEl("h3", { text: "动作" });
    const actions = actionSection.createDiv({ cls: "reading-capture-library-detail-actions" });
    const openBest = actions.createEl("button", { text: "打开最佳版本" });
    openBest.addClass("mod-cta");
    openBest.addEventListener("click", () => this.openBestVersion(selected));
    const openNote = actions.createEl("button", { text: "阅读记录" });
    openNote.disabled = !selected.stats.readingNotePath;
    openNote.addEventListener("click", async () => {
      if (!selected.stats.readingNotePath) return;
      const noteFile = this.plugin.app.vault.getAbstractFileByPath(selected.stats.readingNotePath);
      const sourceFile = selected.bestVersion ? this.plugin.app.vault.getAbstractFileByPath(selected.bestVersion.path) : null;
      await this.plugin.openReadingRecord(
        this.plugin.isFile(noteFile) ? noteFile : this.plugin.makeFileRef(selected.stats.readingNotePath),
        this.plugin.isFile(sourceFile) ? sourceFile : null
      );
    });

    detail.createEl("h3", { text: "版本" });
    const versions = detail.createDiv({ cls: "reading-capture-library-version-list" });
    for (const version of selected.versions) {
      const row = versions.createDiv({ cls: "reading-capture-library-version-row" });
      const isBest = selected.bestVersion && version.path === selected.bestVersion.path;
      if (isBest) row.addClass("is-best");
      this.plugin.decorateVersionPathElement(row, version);
      const versionTop = row.createDiv({ cls: "reading-capture-library-version-top" });
      versionTop.createEl("span", { text: version.label });
      if (isBest) versionTop.createEl("span", { cls: "reading-capture-library-version-best", text: "最佳" });
      const name = row.createEl("strong", { text: version.name });
      this.plugin.decorateVersionPathElement(name, version);
      const button = row.createEl("button", { text: version.kind === "markdown" ? "阅读" : "打开" });
      button.addEventListener("click", async () => this.plugin.openLibraryVersion(version));
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

class ReadingCaptureRecordView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.notePath = "";
    this.sourcePath = "";
    this.sourceTitle = "";
    this.mode = "record";
    this.markdown = "";
    this.items = [];
    this.activeAnnotationId = "";
  }

  getViewType() {
    return RECORD_VIEW_TYPE;
  }

  getDisplayText() {
    return this.sourceTitle ? `阅读记录：${this.sourceTitle}` : "阅读记录";
  }

  getIcon() {
    return "book-open";
  }

  async onOpen() {
    if (this.notePath) await this.reload();
    else await this.render();
  }

  async setRecord(notePath, sourcePath = "") {
    this.notePath = normalizePath(notePath || "");
    this.sourcePath = normalizePath(sourcePath || "");
    await this.reload();
  }

  async reload() {
    if (!this.notePath) {
      this.markdown = "";
      this.items = [];
      await this.render();
      return;
    }
    this.markdown = await this.plugin.readText(this.notePath);
    if (!this.sourcePath) this.sourcePath = normalizePath(this.plugin.readFrontmatterValue(this.markdown, "source_vault_path") || "");
    this.sourceTitle = this.plugin.readFrontmatterValue(this.markdown, "source_title") || this.sourcePath || this.notePath;
    this.items = this.plugin.parseAnnotationsFromReadingNote(this.markdown);
    const first = this.groupedRecords().flatMap((group) => group.items)[0];
    if (!this.activeAnnotationId || !this.items.some((item) => item.id === this.activeAnnotationId)) {
      this.activeAnnotationId = first ? first.id : "";
    }
    await this.render();
  }

  groupedRecords() {
    const groups = this.recordGroupDefinitions().map((group) => Object.assign({}, group, { items: [] }));
    const byKey = new Map(groups.map((group) => [group.key, group]));
    for (const item of this.items || []) {
      byKey.get(this.recordGroupKey(item)).items.push(item);
    }
    return groups.filter((group) => group.items.length);
  }

  recordGroupKey(item) {
    if (this.plugin.annotationMatchesFilter(item, "topic")) return "topic";
    if (this.plugin.annotationMatchesFilter(item, "fact")) return "fact";
    if (this.plugin.annotationMatchesFilter(item, "image")) return "image";
    return "thought";
  }

  recordGroupDefinitions() {
    return [
      { key: "topic", label: "可写选题", cls: "is-topic" },
      { key: "fact", label: "事实待核查", cls: "is-fact" },
      { key: "thought", label: "标注想法", cls: "is-thought" },
      { key: "image", label: "图片", cls: "is-image" },
    ];
  }

  recordCounts() {
    const counts = Object.fromEntries(this.recordGroupDefinitions().map((group) => [group.key, 0]));
    for (const item of this.items || []) {
      counts[this.recordGroupKey(item)] = (counts[this.recordGroupKey(item)] || 0) + 1;
    }
    return counts;
  }

  recordSummaryText() {
    const counts = this.recordCounts();
    const parts = [`${this.items.length} 条记录`];
    if (counts.topic) parts.push(`${counts.topic} 个选题`);
    if (counts.fact) parts.push(`${counts.fact} 个待核查`);
    if (counts.image) parts.push(`${counts.image} 张图片`);
    return parts.join(" · ");
  }

  groupMetaForItem(item) {
    return (
      this.groupedRecords().find((group) => group.items.some((candidate) => candidate.id === item.id)) || {
        key: "thought",
        label: "标注想法",
        cls: "is-thought",
      }
    );
  }

  async setMode(mode) {
    this.mode = mode === "markdown" ? "markdown" : "record";
    await this.render();
  }

  async setActiveAnnotation(annotationId) {
    this.activeAnnotationId = annotationId || "";
    await this.render();
  }

  activeAnnotation() {
    return (this.items || []).find((item) => item.id === this.activeAnnotationId) || (this.items || [])[0] || null;
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-record");

    if (!this.notePath) {
      container.createDiv({ cls: "reading-capture-record-empty", text: "还没有打开阅读记录。" });
      return;
    }

    const shell = container.createDiv({ cls: "reading-capture-record-shell" });
    this.renderHeader(shell);
    if (this.mode === "markdown") {
      await this.renderMarkdown(shell);
      return;
    }
    this.renderRecordMode(shell);
  }

  renderHeader(shell) {
    const header = shell.createDiv({ cls: "reading-capture-record-top" });
    const title = header.createDiv({ cls: "reading-capture-record-title" });
    title.createEl("div", { cls: "reading-capture-reader-kicker", text: "Reading Record" });
    title.createEl("h1", { text: this.sourceTitle || this.notePath.split("/").pop() || "阅读记录" });
    if (this.sourcePath) title.createEl("p", { text: this.sourcePath });

    const actions = header.createDiv({ cls: "reading-capture-record-actions" });
    const modeToggle = actions.createDiv({ cls: "reading-capture-record-mode-toggle" });
    const recordButton = modeToggle.createEl("button", { text: "记录视图" });
    if (this.mode === "record") recordButton.addClass("is-active");
    recordButton.addEventListener("click", () => this.setMode("record"));
    const markdownButton = modeToggle.createEl("button", { text: "Markdown" });
    if (this.mode === "markdown") markdownButton.addClass("is-active");
    markdownButton.addEventListener("click", () => this.setMode("markdown"));
    const sourceButton = actions.createEl("button", { text: "回到原文" });
    sourceButton.addEventListener("click", () => this.openSourceForRecord(this.activeAnnotation()));
    const copyButton = actions.createEl("button", { text: "复制路径" });
    copyButton.addEventListener("click", async () => {
      await this.plugin.writeClipboardText(this.sourcePath || this.notePath);
      new Notice("已复制路径。");
    });
    actions.createEl("button", { cls: "reading-capture-record-more", text: "..." });
  }

  async renderMarkdown(shell) {
    const pane = shell.createDiv({ cls: "reading-capture-record-markdown markdown-preview-view" });
    if (MarkdownRenderer && typeof MarkdownRenderer.render === "function") {
      await MarkdownRenderer.render(this.app, this.markdown, pane, this.notePath, this);
      return;
    }
    pane.createEl("pre", { text: this.markdown });
  }

  renderRecordMode(shell) {
    const layout = shell.createDiv({ cls: "reading-capture-record-layout" });
    const listPane = layout.createDiv({ cls: "reading-capture-record-list-pane" });
    const detailPane = layout.createEl("aside", { cls: "reading-capture-record-detail-pane" });
    this.renderRecordList(listPane);
    this.renderRecordDetail(detailPane);
  }

  renderRecordList(listPane) {
    const top = listPane.createDiv({ cls: "reading-capture-record-list-head" });
    const title = top.createDiv({ cls: "reading-capture-record-list-title" });
    title.createEl("h2", { text: "阅读沉淀" });
    title.createEl("p", { text: this.recordSummaryText() });
    top.createEl("button", { cls: "reading-capture-record-group-menu", text: "按类型分组" });
    const filters = top.createDiv({ cls: "reading-capture-record-filter-row" });
    filters.createEl("span", { text: `全部 ${this.items.length}` });
    const counts = this.recordCounts();
    for (const group of this.recordGroupDefinitions()) {
      filters.createEl("span", { cls: group.cls, text: `${group.label} ${counts[group.key] || 0}` });
    }

    const list = listPane.createDiv({ cls: "reading-capture-record-list" });
    const groups = this.groupedRecords();
    if (!groups.length) {
      const empty = list.createDiv({ cls: "reading-capture-record-empty-card" });
      empty.createEl("strong", { text: "还没有记录" });
      empty.createEl("span", { text: "可以回到原文，选中文字后记录想法、选题或待核查事实。" });
      return;
    }
    for (const group of groups) {
      const groupEl = list.createDiv({ cls: `reading-capture-record-group ${group.cls}` });
      const groupTitle = groupEl.createDiv({ cls: "reading-capture-record-group-title" });
      groupTitle.createEl("span", { text: group.label });
      groupTitle.createEl("strong", { text: String(group.items.length) });
      for (const item of group.items) {
        const card = groupEl.createDiv({ cls: `reading-capture-record-card ${group.cls}` });
        if (item.id === this.activeAnnotationId) card.addClass("is-active");
        card.dataset.annotationId = item.id;
        const meta = card.createDiv({ cls: "reading-capture-record-card-meta" });
        meta.createEl("span", { cls: `reading-capture-type-pill ${group.cls}`, text: this.plugin.annotationLabel(item) });
        if (this.plugin.shortTime(item.time)) meta.createEl("span", { text: this.plugin.shortTime(item.time) });
        const text = item.note || item.quote || item.mediaAlt || item.mediaSrc || "未命名记录";
        card.createEl("h3", { text: this.recordTitle(text) });
        const body = item.note && item.quote ? item.quote : item.note || item.quote || item.mediaAlt || item.mediaSrc || "";
        if (body) card.createEl("p", { text: this.plugin.previewSelectedText(body) });
        card.createEl("button", { text: "..." });
        card.addEventListener("click", () => this.setActiveAnnotation(item.id));
      }
    }
  }

  renderRecordDetail(detailPane) {
    const item = this.activeAnnotation();
    const header = detailPane.createDiv({ cls: "reading-capture-record-detail-head" });
    header.createEl("h2", { text: "当前记录" });
    if (!item) {
      const empty = detailPane.createDiv({ cls: "reading-capture-record-empty-card" });
      empty.createEl("strong", { text: "还没有可查看的记录" });
      empty.createEl("span", { text: "回到原文后，可以先记录一条想法。" });
      return;
    }
    const group = this.groupMetaForItem(item);
    const meta = header.createDiv({ cls: "reading-capture-record-detail-meta" });
    meta.createEl("span", { cls: `reading-capture-type-pill ${group.cls}`, text: this.plugin.annotationLabel(item) });
    if (this.plugin.shortTime(item.time)) meta.createEl("span", { text: this.plugin.shortTime(item.time) });

    if (item.quote) {
      detailPane.createEl("h3", { text: "原文引用" });
      detailPane.createEl("blockquote", { cls: group.cls, text: item.quote });
    }
    if (item.mediaType === "image") {
      detailPane.createEl("h3", { text: "图片" });
      detailPane.createEl("blockquote", { cls: group.cls, text: item.mediaAlt || item.mediaSrc || "图片记录" });
    }
    detailPane.createEl("h3", { text: "我的想法" });
    detailPane.createEl("p", { text: item.note || "这条记录还没有补充想法。" });

    const source = detailPane.createDiv({ cls: "reading-capture-record-source" });
    source.createEl("h3", { text: "来源" });
    const pathRow = source.createDiv({ cls: "reading-capture-record-source-row" });
    pathRow.createEl("span", { text: "文章路径" });
    pathRow.createEl("strong", { text: this.sourcePath || "未记录来源路径" });
    const statusRow = source.createDiv({ cls: "reading-capture-record-source-row" });
    statusRow.createEl("span", { text: "位置状态" });
    statusRow.createEl("strong", { cls: "reading-capture-record-location-status", text: item.quote || item.mediaType ? "已定位到正文" : "关联到文章" });

    const actions = detailPane.createDiv({ cls: "reading-capture-record-detail-actions" });
    const jump = actions.createEl("button", { text: "回到原文位置" });
    jump.addClass("mod-cta");
    jump.addEventListener("click", () => this.openSourceForRecord(item));
    const copyQuote = actions.createEl("button", { text: "复制引用" });
    copyQuote.addEventListener("click", async () => {
      await this.plugin.writeClipboardText(item.quote || item.note || "");
      new Notice("已复制引用。");
    });
    const copyNote = actions.createEl("button", { text: "复制想法" });
    copyNote.addEventListener("click", async () => {
      await this.plugin.writeClipboardText(item.note || item.quote || "");
      new Notice("已复制想法。");
    });
    const markdown = actions.createEl("button", { text: "打开原始 Markdown" });
    markdown.addEventListener("click", () => this.setMode("markdown"));
  }

  recordTitle(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "未命名记录";
    return text.length > 72 ? `${text.slice(0, 72)}...` : text;
  }

  async openSourceForRecord(item) {
    if (!this.sourcePath) {
      new Notice("这条阅读记录没有来源路径。");
      return;
    }
    const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
    if (this.plugin.isFile(sourceFile)) {
      await this.plugin.openReaderForFile(sourceFile, item && item.id ? item.id : "");
      return;
    }
    await this.plugin.openFile(this.plugin.makeFileRef(this.sourcePath));
  }
}

class ReadingCaptureTopicPoolView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.items = [];
    this.isLoading = false;
  }

  getViewType() {
    return TOPIC_POOL_VIEW_TYPE;
  }

  getDisplayText() {
    return "选题池";
  }

  getIcon() {
    return "lightbulb";
  }

  async onOpen() {
    await this.reload();
  }

  async reload() {
    this.isLoading = true;
    await this.render();
    try {
      this.items = await this.plugin.buildTopicPoolItems();
    } finally {
      this.isLoading = false;
      await this.render();
    }
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-topic-pool");

    const shell = container.createDiv({ cls: "reading-capture-topic-shell" });
    const top = shell.createDiv({ cls: "reading-capture-library-top" });
    const title = top.createDiv({ cls: "reading-capture-library-title" });
    title.createEl("h1", { text: "选题池" });
    title.createEl("div", { cls: "reading-capture-library-subtitle", text: this.isLoading ? "正在整理可写选题..." : `${this.items.length} 个可写选题` });
    const tools = top.createDiv({ cls: "reading-capture-library-tools" });
    const refresh = tools.createEl("button", { text: this.isLoading ? "刷新中..." : "刷新" });
    refresh.disabled = this.isLoading;
    refresh.addEventListener("click", () => this.reload());

    const list = shell.createDiv({ cls: "reading-capture-topic-list" });
    if (this.isLoading && !this.items.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "正在整理选题池，请稍等。" });
      return;
    }
    if (!this.items.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "还没有可写选题。你可以在阅读器里把想法加入“可写选题”。" });
      return;
    }

    for (const item of this.items) {
      const card = list.createDiv({ cls: "reading-capture-topic-card" });
      const meta = card.createDiv({ cls: "reading-capture-library-card-meta" });
      meta.createEl("span", { text: item.sourceRoot || "source" });
      if (item.time) meta.createEl("span", { text: item.time });
      card.createEl("h2", { text: item.note || item.quote || "未命名选题" });
      if (item.quote) card.createEl("blockquote", { text: item.quote });
      card.createEl("p", { text: item.sourceTitle || item.sourcePath });
      const actions = card.createDiv({ cls: "reading-capture-library-detail-actions" });
      const openSource = actions.createEl("button", { text: "打开来源" });
      openSource.addEventListener("click", async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(item.sourcePath);
        if (this.plugin.isFile(file)) await this.plugin.openReaderForFile(file);
      });
      const openNote = actions.createEl("button", { text: "阅读记录" });
      openNote.addEventListener("click", async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(item.readingNotePath);
        await this.plugin.openReadingRecord(this.plugin.isFile(file) ? file : this.plugin.makeFileRef(item.readingNotePath), this.plugin.makeFileRef(item.sourcePath));
      });
    }
  }
}

module.exports = class ReadingCapturePlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ReadingCaptureSettingTab(this.app, this));
    this.registerView(READER_VIEW_TYPE, (leaf) => new ReadingCaptureReaderView(leaf, this));
    this.registerView(ARTICLE_LIBRARY_VIEW_TYPE, (leaf) => new ReadingCaptureLibraryView(leaf, this));
    this.registerView(TOPIC_POOL_VIEW_TYPE, (leaf) => new ReadingCaptureTopicPoolView(leaf, this));
    this.registerView(RECORD_VIEW_TYPE, (leaf) => new ReadingCaptureRecordView(leaf, this));

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
      id: "open-topic-pool",
      name: "打开选题池",
      callback: async () => this.openTopicPool(),
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
        await this.openReadingRecord(noteFile, file);
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

  async openReaderForFile(file, annotationId = "") {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: READER_VIEW_TYPE,
      active: true,
    });
    const view = leaf.view;
    if (view && typeof view.setSource === "function") {
      await view.setSource(file.path, annotationId);
    }
  }

  async openReadingRecord(noteFile, sourceFile = null) {
    if (!noteFile || !noteFile.path) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: RECORD_VIEW_TYPE,
      active: true,
    });
    const view = leaf.view;
    if (view && typeof view.setRecord === "function") {
      await view.setRecord(noteFile.path, sourceFile && sourceFile.path ? sourceFile.path : "");
    }
  }

  async openLibraryVersion(version) {
    if (!version || !version.path) return;
    const file = this.app.vault.getAbstractFileByPath(version.path);
    if (!this.isFile(file)) {
      new Notice("找不到这个版本的源文件。");
      return;
    }
    if (version.kind === "markdown") {
      await this.openReaderForFile(file);
      return;
    }
    await this.openFile(file);
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

  async openTopicPool() {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: TOPIC_POOL_VIEW_TYPE,
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
      await reader.renderKeepingScroll();
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
      this.openTypedCaptureModal(file, selectedText, recordType, async () => reader.renderKeepingScroll());
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

  articleLibraryEmptyMessage() {
    if (!this.getArticleLibraryRoots().length) return "还没有配置知见录扫描目录。请在 Reading Capture 设置里添加保存文章的文件夹。";
    return "没有找到匹配的文章。可以调整搜索词或扫描目录。";
  }

  decorateVersionPathElement(element, version) {
    const versionPath = version && version.path ? normalizeVaultPath(version.path) : "";
    if (!element || !versionPath) return;
    if (typeof element.setAttr === "function") element.setAttr("title", versionPath);
    else element.title = versionPath;
    if (element.dataset) element.dataset.versionPath = versionPath;
    if (typeof element.addEventListener === "function") {
      element.addEventListener("contextmenu", (event) => this.showVersionPathMenu(event, versionPath));
    }
  }

  showVersionPathMenu(event, versionPath) {
    if (!versionPath) return;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle("复制文件路径")
        .setIcon("copy")
        .onClick(async () => this.copyVersionPath(versionPath));
    });
    menu.showAtMouseEvent(event);
  }

  async copyVersionPath(versionPath) {
    await this.writeClipboardText(versionPath);
    new Notice("已复制路径");
  }

  async writeClipboardText(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("当前环境不支持剪贴板写入。");
  }

  getArticleLibraryExcludeRoots() {
    const configured = this.parsePathList(this.settings.articleLibraryExcludeRoots, DEFAULT_SETTINGS.articleLibraryExcludeRoots);
    const readingRoot = normalizePath(this.settings.readingRoot || DEFAULT_SETTINGS.readingRoot).replace(/\/+$/g, "");
    const roots = this.getArticleLibraryRoots();
    const legacyDigestRoots = ALWAYS_EXCLUDED_LIBRARY_ROOTS.filter((excludedRoot) =>
      roots.some((root) => excludedRoot === root || excludedRoot.startsWith(`${root}/`))
    );
    return [...new Set([readingRoot, ...configured, ...legacyDigestRoots].filter(Boolean))];
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
    if (ext === ".pdf") {
      if (name.includes("zh_enriched") || name.includes("enriched")) return "扩展 PDF";
      if (name === "article_zh" || name.endsWith("_zh") || name.includes("_zh_") || name.includes("translation")) return "中文 PDF";
      if (name === "article") return "原文 PDF";
      return "PDF";
    }
    if (name.includes("zh_enriched") || name.includes("enriched")) return "扩展版";
    if (name === "article_zh" || name.endsWith("_zh") || name.includes("_zh_") || name.includes("translation")) return "中文版";
    if (name === "article") return "原文";
    return "Markdown";
  }

  shouldKeepDirectoryArticleGroup(group) {
    const markdownFiles = group.files.filter((file) => sourceKindFromPath(file.path) === "markdown");
    if (markdownFiles.length <= 1) return false;
    return markdownFiles.every((file) => this.isCanonicalArticleVersionName(file.name));
  }

  isCanonicalArticleVersionName(fileName) {
    const name = basename(fileName, extname(fileName)).toLowerCase();
    return name === "article" || /^article[_-]/.test(name) || name === "translation" || name.includes("translation") || name.includes("enriched");
  }

  splitArticleDirectoryGroup(group) {
    if (group.groupType !== "directory" || this.shouldKeepDirectoryArticleGroup(group)) return [group];
    const markdownFiles = group.files.filter((file) => sourceKindFromPath(file.path) === "markdown");
    if (!markdownFiles.length) return [group];
    const markdownByStem = new Map(markdownFiles.map((file) => [this.fileStem(file.name), file]));
    const fallbackMarkdown = markdownFiles.length === 1 ? markdownFiles[0] : null;
    const groups = new Map();

    for (const file of group.files) {
      const fileStem = this.fileStem(file.name);
      const pairedMarkdown = sourceKindFromPath(file.path) === "pdf" ? markdownByStem.get(fileStem) || fallbackMarkdown : file;
      const groupPath = pairedMarkdown ? pairedMarkdown.path : file.path;
      const id = `single-file:${groupPath}`;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          groupType: "single-file",
          groupPath,
          sourceRoot: group.sourceRoot,
          sourceLabel: group.sourceLabel,
          files: [],
        });
      }
      groups.get(id).files.push(file);
    }

    return [...groups.values()];
  }

  fileStem(fileName) {
    return basename(fileName, extname(fileName)).toLowerCase();
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
    const currentCache = this.normalizeArticleLibraryCache(this.articleLibraryCache);
    const nextCache = { version: ARTICLE_LIBRARY_CACHE_VERSION, groups: {} };
    for (const group of [...grouped.values()].flatMap((item) => this.splitArticleDirectoryGroup(item))) {
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
      const signature = this.articleGroupCacheSignature(group, index);
      const cached = currentCache.groups[group.id];
      if (cached && cached.signature === signature && cached.summary && cached.stats) {
        group.title = cached.summary.title;
        group.snippet = cached.summary.snippet;
        group.stats = cached.stats;
      } else {
        const summary = await this.readArticleGroupSummary(group);
        group.title = summary.title;
        group.snippet = summary.snippet;
        group.stats = await this.articleGroupStats(group, index);
      }
      group.dateLabel = this.articleDateLabel(group);
      nextCache.groups[group.id] = {
        signature,
        summary: { title: group.title, snippet: group.snippet },
        stats: group.stats,
      };
      groups.push(group);
    }
    const sortedGroups = groups.sort((left, right) => right.mtime - left.mtime);
    this.articleLibraryCache = nextCache;
    this.articleLibrarySnapshot = this.serializeArticleLibraryGroups(sortedGroups);
    await this.saveSettings();

    return sortedGroups;
  }

  getArticleLibrarySnapshot() {
    return Array.isArray(this.articleLibrarySnapshot) ? this.articleLibrarySnapshot : [];
  }

  serializeArticleLibraryGroups(groups) {
    return (Array.isArray(groups) ? groups : []).map((group) => ({
      id: group.id,
      groupType: group.groupType,
      groupPath: group.groupPath,
      sourceRoot: group.sourceRoot,
      sourceLabel: group.sourceLabel,
      title: group.title,
      snippet: group.snippet,
      dateLabel: group.dateLabel,
      mtime: group.mtime || 0,
      files: (group.files || []).map((file) => ({
        path: file.path,
        name: file.name,
        basename: file.basename || basename(file.name, extname(file.name)),
        stat: {
          mtime: file.stat && file.stat.mtime ? file.stat.mtime : 0,
          size: file.stat && file.stat.size ? file.stat.size : 0,
        },
      })),
      versions: (group.versions || []).map((version) => ({
        path: version.path,
        name: version.name,
        kind: version.kind,
        label: version.label,
        priority: version.priority,
        mtime: version.mtime || 0,
      })),
      bestVersion: group.bestVersion
        ? {
            path: group.bestVersion.path,
            name: group.bestVersion.name,
            kind: group.bestVersion.kind,
            label: group.bestVersion.label,
            priority: group.bestVersion.priority,
            mtime: group.bestVersion.mtime || 0,
          }
        : null,
      stats: Object.assign(
        {
          annotationCount: 0,
          topicCount: 0,
          factCount: 0,
          imageCount: 0,
          hasReading: false,
          lastReadTime: 0,
          readingNotePath: "",
          status: "unread",
          codexStatus: "pending_summary",
        },
        group.stats || {}
      ),
    }));
  }

  normalizeArticleLibraryCache(cache) {
    if (!cache || cache.version !== ARTICLE_LIBRARY_CACHE_VERSION || !cache.groups || typeof cache.groups !== "object") {
      return { version: ARTICLE_LIBRARY_CACHE_VERSION, groups: {} };
    }
    return cache;
  }

  articleGroupCacheSignature(group, index) {
    const files = group.files.map((file) => this.fileCacheSignature(file));
    const paths = new Set(group.versions.map((version) => version.path));
    const sources = index && index.sources ? index.sources : {};
    const reading = Object.entries(sources)
      .filter(([sourcePath]) => paths.has(sourcePath))
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([sourcePath, entry]) => {
        const notePath = entry && entry.reading_note_path ? entry.reading_note_path : "";
        const noteFile = notePath ? this.app.vault.getAbstractFileByPath(notePath) : null;
        return [
          sourcePath,
          notePath,
          entry && entry.annotation_count ? entry.annotation_count : 0,
          entry && entry.updated ? entry.updated : "",
          this.isFile(noteFile) ? this.fileCacheSignature(noteFile) : "",
        ].join("|");
      });
    return JSON.stringify({ files, reading });
  }

  fileCacheSignature(file) {
    const stat = file && file.stat ? file.stat : {};
    return [file && file.path ? file.path : "", stat.mtime || 0, stat.size || 0].join("|");
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
      status: "unread",
      codexStatus: "pending_summary",
    };
    const sources = index && index.sources ? index.sources : {};
    for (const [sourcePath, entry] of Object.entries(sources)) {
      if (!paths.has(sourcePath)) continue;
      stats.hasReading = true;
      stats.status = entry.status || stats.status || "reading";
      stats.codexStatus = entry.codex_status || stats.codexStatus || "pending_summary";
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

  async buildTopicPoolItems() {
    const index = await this.loadIndex();
    const sources = index && index.sources ? index.sources : {};
    const items = [];
    for (const [sourcePath, entry] of Object.entries(sources)) {
      if (!entry || !entry.reading_note_path) continue;
      try {
        const markdown = await this.readText(entry.reading_note_path);
        const annotations = this.parseAnnotationsFromReadingNote(markdown).filter((item) => this.annotationMatchesFilter(item, "topic"));
        for (const annotation of annotations) {
          items.push({
            id: annotation.id,
            time: annotation.time || "",
            sourcePath,
            sourceTitle: entry.source_title || sourcePath,
            sourceRoot: entry.source_root || rootSlug(sourcePath.split("/").slice(0, -1).join("/")),
            readingNotePath: entry.reading_note_path,
            note: annotation.note,
            quote: annotation.quote,
            type: annotation.type,
          });
        }
      } catch (error) {
        // A missing or malformed reading note should not block the topic pool.
      }
    }
    return items.sort((left, right) => String(right.time || "").localeCompare(String(left.time || "")));
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.articleLibraryCache = this.normalizeArticleLibraryCache(data.articleLibraryCache);
    this.articleLibrarySnapshot = Array.isArray(data.articleLibrarySnapshot) ? data.articleLibrarySnapshot : [];
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    delete this.settings.articleLibraryCache;
    delete this.settings.articleLibrarySnapshot;
    this.settings.readingRoot = normalizePath(this.settings.readingRoot || DEFAULT_SETTINGS.readingRoot);
    this.settings.articleLibraryRoots = this.settings.articleLibraryRoots || DEFAULT_SETTINGS.articleLibraryRoots;
    this.settings.articleLibraryExcludeRoots = this.settings.articleLibraryExcludeRoots || DEFAULT_SETTINGS.articleLibraryExcludeRoots;
  }

  async saveSettings() {
    await this.saveData(
      Object.assign({}, this.settings, {
        articleLibraryCache: this.normalizeArticleLibraryCache(this.articleLibraryCache),
        articleLibrarySnapshot: this.getArticleLibrarySnapshot(),
      })
    );
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
      await this.openReadingRecord(noteFile, file);
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
    await this.createFileIfMissing(indexMdPath, "# 阅读记录索引\n\n这里可以后续由你或自动化工具生成可读索引。\n");
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
