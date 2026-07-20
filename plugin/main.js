const { ItemView, MarkdownRenderer, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require("obsidian");
const crypto = require("crypto");
const core = require("./reading-core");
const creationWorkflow = require("./creation-workflow");
const skillRegistry = require("./skill-registry");

const READER_VIEW_TYPE = "reading-capture-reader";
const ARTICLE_LIBRARY_VIEW_TYPE = "reading-capture-library";
const TOPIC_POOL_VIEW_TYPE = "reading-capture-topic-pool";
const RECORD_VIEW_TYPE = "reading-capture-record";
const CREATION_PROJECT_VIEW_TYPE = "reading-capture-creation-project";
const CREATIVE_IDEA_SECTION = "创作灵感";
const LEGACY_TOPIC_SECTION = "可写选题";

const { KNOWN_SOURCE_ROOTS, basename, extname, normalizeVaultPath, rootSlug, sourceKindFromPath, titleFromPath } = core;

const ALWAYS_EXCLUDED_LIBRARY_ROOTS = [
  "Learning/web/x_articles/digest",
  "Learning/web/x_articles/digests",
];

const ARTICLE_LIBRARY_ROOTS_PLACEHOLDER = ["Articles", "Reading", "Sources"].join("\n");
const ARTICLE_LIBRARY_CACHE_VERSION = 1;
const DIAGNOSTIC_LOG_PATH = "Reading Capture/diagnostics/diagnostic-log.md";
const DIAGNOSTIC_REPORT_PATH = "Reading Capture/diagnostics/diagnostic-report.md";
const DIAGNOSTIC_LOG_MAX_CHARS = 120000;
const RUNTIME_FILE_NAMES = ["manifest.json", "main.js", "styles.css", "reading-core.js", "creation-workflow.js", "skill-registry.js", "skill-runner.js", "skill-manager.js"];
const TOPIC_MINER_ROOT = "Learning/reading-notes/topic-miner";
const TOPIC_MINER_FEEDBACK_PATH = `${TOPIC_MINER_ROOT}/feedback.jsonl`;
const TOPIC_MINER_CURRENT_PATH = `${TOPIC_MINER_ROOT}/current.json`;
const TOPIC_MINER_VIEW_PATH = `${TOPIC_MINER_ROOT}/candidates.view.json`;
const TOPIC_FEEDBACK_OPTIONS = ["待定", "想写", "暂存", "不要", "已写"];
const TOPIC_SORT_OPTIONS = [
  ["workflow", "工作流排序"],
  ["content", "最新内容"],
  ["feedback", "最新反馈"],
];
const TOPIC_DEFAULT_COLLAPSED_FEEDBACKS = ["不要", "已写"];
const CREATION_PROJECT_TYPE = "reading-capture-creation-project";
const CREATION_PLATFORM_OPTIONS = [
  ["wechat", "微信公众号"],
  ["xiaohongshu", "小红书"],
];

function formatCreationProposalField(value, preferredKeys, fallback) {
  if (typeof value === "string") return value.trim() || fallback;
  if (!value || typeof value !== "object") return fallback;
  const values = preferredKeys
    .map((key) => value[key])
    .filter((item) => ["string", "number"].includes(typeof item) && String(item).trim())
    .map((item) => String(item).trim());
  return [...new Set(values)].join(" · ") || fallback;
}

const CREATION_STAGE_TASKS = Object.freeze({
  "diagnosis.materials": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "planning/context.md", "planning/user-material.md", "planning/research-request.md"],
    outputs: ["planning/diagnosis.md"],
    network: false,
  }),
  "research.evidence": Object.freeze({
    skillId: "deep-research-skills",
    inputs: ["project.md", "planning/context.md", "planning/diagnosis.md", "planning/research-request.md"],
    outputs: ["research/evidence.md", "research/sources.md"],
    network: true,
  }),
  "brief.master": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "workflow-state.json", "planning/context.md", "planning/diagnosis.md", "research/evidence.md", "research/sources.md"],
    outputs: ["planning/master-brief.md"],
    network: false,
  }),
  "wechat.plan": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "planning/master-brief.md", "research/evidence.md", "research/sources.md"],
    outputs: ["deliverables/wechat/wechat-001/outline.md", "deliverables/wechat/wechat-001/illustration-plan.md", "deliverables/wechat/wechat-001/illustration-plan.json"],
    network: false,
  }),
  "wechat.draft": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "planning/master-brief.md", "research/evidence.md", "research/sources.md", "deliverables/wechat/wechat-001/outline.md"],
    outputs: ["deliverables/wechat/wechat-001/drafts/v1.md"],
    network: false,
  }),
  "wechat.qa": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "research/evidence.md", "research/sources.md", "deliverables/wechat/wechat-001/drafts/v1.md"],
    outputs: ["deliverables/wechat/wechat-001/qa.md"],
    network: false,
    qualityThreshold: 95,
  }),
  "wechat.visual": Object.freeze({
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    inputs: ["project.md", "deliverables/wechat/wechat-001/drafts/v1.md", "deliverables/wechat/wechat-001/illustration-plan.md"],
    outputs: ["deliverables/wechat/wechat-001/visuals/manifest.md"],
    outputDirectories: ["deliverables/wechat/wechat-001/visuals"],
    network: false,
  }),
  "wechat.visual-item": Object.freeze({
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    inputs: [],
    outputs: [],
    network: false,
  }),
  "xhs.plan": Object.freeze({
    skillId: "keke-social-card-skill",
    inputs: ["project.md", "planning/master-brief.md", "research/evidence.md", "research/sources.md"],
    outputs: ["deliverables/xiaohongshu/xiaohongshu-001/plan.md", "deliverables/xiaohongshu/xiaohongshu-001/proposals.json"],
    network: false,
  }),
  "xhs.samples": Object.freeze({
    skillId: "keke-social-card-skill",
    inputs: ["project.md", "deliverables/xiaohongshu/xiaohongshu-001/plan.md", "deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json"],
    outputs: ["deliverables/xiaohongshu/xiaohongshu-001/sample-manifest.md"],
    outputDirectories: ["deliverables/xiaohongshu/xiaohongshu-001/samples"],
    network: false,
  }),
  "xhs.card-page": Object.freeze({
    skillId: "keke-social-card-skill",
    inputs: [],
    outputs: [],
    network: false,
  }),
  "xhs.package": Object.freeze({
    skillId: "keke-social-card-skill",
    inputs: ["project.md", "deliverables/xiaohongshu/xiaohongshu-001/plan.md", "deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json"],
    outputs: ["deliverables/xiaohongshu/xiaohongshu-001/caption.md", "deliverables/xiaohongshu/xiaohongshu-001/cards-manifest.md", "deliverables/xiaohongshu/xiaohongshu-001/visual-qa.md"],
    outputDirectories: ["deliverables/xiaohongshu/xiaohongshu-001/images"],
    network: false,
    qualityThreshold: 95,
  }),
  "xhs.copy-qa": Object.freeze({
    skillId: "writing-styles",
    inputs: ["project.md", "deliverables/xiaohongshu/xiaohongshu-001/caption.md"],
    outputs: ["deliverables/xiaohongshu/xiaohongshu-001/caption.md", "deliverables/xiaohongshu/xiaohongshu-001/copy-qa.md"],
    network: false,
    qualityThreshold: 95,
  }),
});
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
  readerFontSize: 18,
  readerLineHeight: 1.72,
  creationProjectRoot: "Reading Capture/creation-projects",
  wechatPublishingRoot: "Work/business/content-accounts/wechat",
  xiaohongshuPublishingRoot: "Work/business/content-accounts/xiaohongshu",
  defaultWritingStyle: "keke",
};

const READER_FONT_SIZE_MIN = 14;
const READER_FONT_SIZE_MAX = 28;
const READER_LINE_HEIGHTS = [
  { id: "compact", label: "紧凑", value: 1.55 },
  { id: "standard", label: "标准", value: 1.72 },
  { id: "relaxed", label: "舒展", value: 1.9 },
];

function clampReaderFontSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.readerFontSize;
  return Math.min(Math.max(Math.round(number), READER_FONT_SIZE_MIN), READER_FONT_SIZE_MAX);
}

function normalizeReaderLineHeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.readerLineHeight;
  const match = READER_LINE_HEIGHTS.find((item) => Math.abs(item.value - number) < 0.01);
  return match ? match.value : DEFAULT_SETTINGS.readerLineHeight;
}

class TextInputModal extends Modal {
  constructor(app, title, placeholder, onSubmit, options = {}) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    this.includeTypeSelect = !!options.includeTypeSelect;
    this.previewText = options.previewText || "";
    this.onError = typeof options.onError === "function" ? options.onError : null;
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
        ["topic", CREATIVE_IDEA_SECTION],
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
        if (this.onError) await this.onError(error);
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

class CreationProjectModal extends Modal {
  constructor(app, plugin, idea, projects) {
    super(app);
    this.plugin = plugin;
    this.idea = idea;
    this.projects = projects || [];
    this.submitted = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("reading-capture-modal-shell");
    contentEl.addClass("reading-capture-modal", "reading-capture-creation-modal");
    contentEl.createEl("h2", { text: "开始创作" });
    contentEl.createEl("p", {
      cls: "reading-capture-creation-modal-intro",
      text: `将“${this.plugin.creationIdeaTitle(this.idea)}”建立为创作项目，或追加到已有项目。`,
    });

    const modeRow = contentEl.createDiv({ cls: "reading-capture-creation-form-row" });
    modeRow.createEl("label", { text: "处理方式" });
    const modeSelect = modeRow.createEl("select");
    modeSelect.createEl("option", { attr: { value: "create" }, text: "创建新项目" });
    if (this.projects.length) modeSelect.createEl("option", { attr: { value: "append" }, text: "追加到已有项目" });

    const titleRow = contentEl.createDiv({ cls: "reading-capture-creation-form-row" });
    titleRow.createEl("label", { text: "项目主题" });
    const titleInput = titleRow.createEl("input", { attr: { type: "text" } });
    titleInput.value = this.plugin.creationIdeaTitle(this.idea);

    const platformRow = contentEl.createDiv({ cls: "reading-capture-creation-form-row" });
    platformRow.createEl("label", { text: "首个内容形态" });
    const platformSelect = platformRow.createEl("select");
    for (const [value, label] of CREATION_PLATFORM_OPTIONS) platformSelect.createEl("option", { attr: { value }, text: label });

    const projectRow = contentEl.createDiv({ cls: "reading-capture-creation-form-row is-hidden" });
    projectRow.createEl("label", { text: "已有项目" });
    const projectSelect = projectRow.createEl("select");
    for (const project of this.projects) projectSelect.createEl("option", { attr: { value: project.path }, text: project.title });

    const syncMode = () => {
      const appending = modeSelect.value === "append";
      titleRow.toggleClass("is-hidden", appending);
      platformRow.toggleClass("is-hidden", appending);
      projectRow.toggleClass("is-hidden", !appending);
    };
    modeSelect.addEventListener("change", syncMode);

    const hint = contentEl.createEl("p", {
      cls: "reading-capture-hint",
      text: "项目文件保存在 Obsidian Vault 中，可随笔记同步；创建后会打开创作项目视图。",
    });
    const buttons = contentEl.createDiv({ cls: "reading-capture-button-row" });
    const confirm = buttons.createEl("button", { cls: "mod-cta", text: "确认" });
    buttons.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());

    confirm.addEventListener("click", async () => {
      if (this.submitted) return;
      this.submitted = true;
      confirm.disabled = true;
      hint.textContent = "正在建立创作项目...";
      try {
        let projectPath = "";
        if (modeSelect.value === "append") {
          projectPath = projectSelect.value;
          await this.plugin.appendInspirationToCreationProject(this.idea, projectPath);
        } else {
          const title = titleInput.value.trim();
          if (!title) throw new Error("请输入项目主题");
          const project = await this.plugin.createCreationProject(this.idea, {
            title,
            platform: platformSelect.value || "wechat",
          });
          projectPath = project.path;
        }
        this.close();
        await this.plugin.openCreationProjects(projectPath);
      } catch (error) {
        this.submitted = false;
        confirm.disabled = false;
        hint.textContent = `操作失败：${error && error.message ? error.message : String(error)}`;
      }
    });
    syncMode();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ManagedSkillInstallModal extends Modal {
  constructor(app, plugin, task, onInstalled) {
    super(app);
    this.plugin = plugin;
    this.task = task;
    this.onInstalled = onInstalled;
  }

  onOpen() {
    const requirement = this.task.skillRequirement || (this.task.skillPreflight && this.task.skillPreflight.requirement);
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("reading-capture-modal-shell", "reading-capture-skill-install-shell");
    contentEl.addClass("reading-capture-modal", "reading-capture-skill-install-modal");
    contentEl.createEl("p", { cls: "reading-capture-creation-kicker", text: this.task.waitingReason === "skill_permission_expansion" ? "SKILL PERMISSION UPDATE" : "MANAGED SKILL INSTALL" });
    contentEl.createEl("h2", { text: this.task.waitingReason === "skill_permission_expansion" ? "此版本扩大了权限，需重新批准" : "安装任务锁定的 Skill 版本" });
    contentEl.createEl("p", { text: "安装只进入 Reading Capture 的本机受控运行目录，不会修改你交互使用的全局 Codex Skills。" });
    if (!requirement) {
      contentEl.createEl("p", { cls: "reading-capture-error", text: "此任务缺少固定版本清单，不能安装。请取消并重新创建任务。" });
      return;
    }
    const facts = contentEl.createDiv({ cls: "reading-capture-skill-install-facts" });
    for (const [label, value] of [
      ["Skill", `${requirement.displayName} (${requirement.skillId})`],
      ["来源", requirement.source.repository],
      ["固定版本", requirement.version],
      ["内容摘要", requirement.artifactDigest],
      ["清单摘要", requirement.manifestDigest],
      ["依赖", requirement.dependencies.length ? requirement.dependencies.map((item) => `${item.id}@${item.version}`).join("、") : "无额外锁定依赖"],
    ]) {
      const row = facts.createDiv();
      row.createEl("strong", { text: label });
      row.createEl("span", { text: value });
    }
    const permission = contentEl.createDiv({ cls: "reading-capture-skill-install-permissions" });
    permission.createEl("h3", { text: "本版本声明的权限" });
    for (const [key, label] of [["read", "读取"], ["write", "写入"], ["network", "联网"], ["secrets", "凭证"]]) {
      permission.createEl("p", { text: `${label}：${requirement.permissions[key].length ? requirement.permissions[key].join("、") : "无"}` });
    }
    const expansion = this.task.skillPreflight && this.task.skillPreflight.expansion;
    if (expansion) {
      const additions = Object.entries(expansion).filter(([, items]) => items.length).map(([key, items]) => `${key}: ${items.join("、")}`);
      contentEl.createEl("p", { cls: "reading-capture-skill-permission-warning", text: `相较已安装版本新增：${additions.join("；")}` });
    }
    const acknowledgment = contentEl.createEl("label", { cls: "reading-capture-creation-check" });
    const checkbox = acknowledgment.createEl("input", { attr: { type: "checkbox" } });
    acknowledgment.createEl("span", { text: "我已核对来源、固定版本、摘要和权限，同意在这台电脑安装此版本" });
    const status = contentEl.createEl("p", { cls: "reading-capture-hint", text: "安装后 Runner 会再次核验实际内容摘要，再重新执行当前任务。" });
    const buttons = contentEl.createDiv({ cls: "reading-capture-button-row" });
    const install = buttons.createEl("button", { cls: "mod-cta", text: "安装固定版本" });
    install.disabled = true;
    buttons.createEl("button", { text: "暂不安装" }).addEventListener("click", () => this.close());
    checkbox.addEventListener("change", () => { install.disabled = !checkbox.checked; });
    install.addEventListener("click", async () => {
      install.disabled = true;
      status.textContent = "正在下载并核验固定版本…";
      try {
        await this.plugin.installManagedCreationSkill(this.task);
        await this.plugin.retryCreationTask(this.task);
        this.close();
        if (this.onInstalled) await this.onInstalled();
      } catch (error) {
        status.textContent = `安装失败：${error && error.message ? error.message : String(error)}`;
        install.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CreationExportConflictModal extends Modal {
  constructor(app, targetDirectory, suffix, onConfirm) {
    super(app);
    this.targetDirectory = targetDirectory;
    this.suffix = suffix;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("reading-capture-modal-shell");
    contentEl.addClass("reading-capture-modal", "reading-capture-creation-modal");
    contentEl.createEl("h2", { text: "发布目录已经存在" });
    contentEl.createEl("p", { text: "现有发布快照不会被覆盖。你可以创建一个新的版本目录，或取消本次导出。" });
    contentEl.createEl("code", { text: this.targetDirectory });
    const buttons = contentEl.createDiv({ cls: "reading-capture-button-row" });
    const create = buttons.createEl("button", { cls: "mod-cta", text: `创建新版本 ${this.suffix}` });
    buttons.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    create.addEventListener("click", async () => {
      create.disabled = true;
      try {
        await this.onConfirm(this.suffix);
        this.close();
      } catch (error) {
        create.disabled = false;
        new Notice(`创建发布快照失败：${error && error.message ? error.message : String(error)}`);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CreationPublicationReviewModal extends Modal {
  constructor(app, plugin, projectPath, platform, snapshot, onSaved) {
    super(app);
    this.plugin = plugin;
    this.projectPath = projectPath;
    this.platform = platform;
    this.snapshot = snapshot;
    this.onSaved = onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("reading-capture-modal-shell", "reading-capture-publication-review-shell");
    contentEl.addClass("reading-capture-modal", "reading-capture-creation-modal", "reading-capture-publication-review-modal");
    contentEl.createEl("div", { cls: "reading-capture-creation-kicker", text: "PUBLICATION REVIEW" });
    contentEl.createEl("h2", { text: "记录发布与复盘" });
    contentEl.createEl("p", { text: "这些记录保存在创作项目和 Topic Miner 反馈区，不会修改已经导出的不可变快照。除发布时间和结果外，其余复盘内容都可留空后再补。" });
    const addField = (parent, label, value = "", multiline = false, placeholder = "", extraClass = "") => {
      const field = parent.createEl("label", { cls: `reading-capture-creation-field${extraClass ? ` ${extraClass}` : ""}` });
      field.createEl("span", { text: label });
      const input = multiline ? field.createEl("textarea") : field.createEl("input", { attr: { type: "text" } });
      input.value = value;
      if (placeholder) input.setAttr("placeholder", placeholder);
      return input;
    };
    const metadata = contentEl.createDiv({ cls: "reading-capture-publication-meta-grid" });
    const publishedAt = addField(metadata, "发布时间", this.plugin.now(), false, "ISO-8601 时间");
    const url = addField(metadata, "发布链接（可选）", "", false, "https://…");
    const outcomeField = metadata.createEl("label", { cls: "reading-capture-creation-field" });
    outcomeField.createEl("span", { text: "结果标签" });
    const outcome = outcomeField.createEl("select");
    for (const [value, label] of [["published", "已发布"], ["performed_well", "表现好"], ["average", "一般"], ["underperformed", "不理想"]]) {
      outcome.createEl("option", { value, text: label });
    }
    const reviewGrid = contentEl.createDiv({ cls: "reading-capture-publication-review-grid" });
    const whatWorked = addField(reviewGrid, "哪些做得好（可选）", "", true, "结构、观点、视觉或互动中值得复用的部分");
    const whatFailed = addField(reviewGrid, "哪些没有达到预期（可选）", "", true, "需要调整的内容或流程");
    const reusableAngles = addField(reviewGrid, "可复用角度（可选）", "", true, "可继续发展的主题、框架或表达方式");
    const audienceResponse = addField(reviewGrid, "读者反馈（可选）", "", true, "评论、问题或真实响应");
    const followUpIdeas = addField(reviewGrid, "后续灵感（可选）", "", true, "下一篇内容或补充研究方向", "is-wide");
    const actions = contentEl.createDiv({ cls: "reading-capture-button-row" });
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存发布记录与复盘" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await this.plugin.recordCreationPublicationReview(this.projectPath, this.platform, this.snapshot, {
          publishedAt: publishedAt.value,
          url: url.value,
          outcome: outcome.value,
          whatWorked: whatWorked.value,
          whatFailed: whatFailed.value,
          reusableAngles: reusableAngles.value,
          audienceResponse: audienceResponse.value,
          followUpIdeas: followUpIdeas.value,
        });
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
        new Notice("发布记录和 Topic Miner 复盘已保存。");
      } catch (error) {
        save.disabled = false;
        new Notice(`保存发布复盘失败：${error && error.message ? error.message : String(error)}`);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
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

    containerEl.createEl("h3", { text: "创作工作流" });
    new Setting(containerEl)
      .setName("创作项目目录")
      .setDesc("使用 Vault 内的相对路径，项目可跟随 Obsidian 笔记同步。")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.creationProjectRoot).setValue(this.plugin.settings.creationProjectRoot).onChange(async (value) => {
          this.plugin.settings.creationProjectRoot = normalizePath(value.trim() || DEFAULT_SETTINGS.creationProjectRoot);
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("微信公众号发布目录")
      .setDesc("最终定稿将按 YYYYMMDD_主题 创建子目录。")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.wechatPublishingRoot).setValue(this.plugin.settings.wechatPublishingRoot).onChange(async (value) => {
          this.plugin.settings.wechatPublishingRoot = normalizePath(value.trim() || DEFAULT_SETTINGS.wechatPublishingRoot);
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("小红书发布目录")
      .setDesc("最终定稿将按 YYYYMMDD_主题 创建子目录。")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.xiaohongshuPublishingRoot).setValue(this.plugin.settings.xiaohongshuPublishingRoot).onChange(async (value) => {
          this.plugin.settings.xiaohongshuPublishingRoot = normalizePath(value.trim() || DEFAULT_SETTINGS.xiaohongshuPublishingRoot);
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("默认写作风格")
      .setDesc("V1 使用 Writing Styles 中的克克风格；后续可扩展为项目级选择。")
      .addDropdown((dropdown) => dropdown.addOption("keke", "克克").setValue("keke"));
    const runnerSetting = new Setting(containerEl)
      .setName("在这台电脑启用 Skill Runner")
      .setDesc(this.plugin.localSkillRunnerDescription())
      .addToggle((toggle) => toggle.setValue(this.plugin.isLocalSkillRunnerEnabled()).onChange(async (value) => {
        await this.plugin.setLocalSkillRunnerEnabled(value);
        runnerSetting.setDesc(this.plugin.localSkillRunnerDescription());
      }));
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

  captureReaderState() {
    const container = this.getScrollContainer();
    const details = container && typeof container.querySelectorAll === "function"
      ? Array.from(container.querySelectorAll("details")).map((element, index) => ({ index, open: !!element.open }))
      : [];
    return {
      scrollTop: container ? container.scrollTop : 0,
      scrollLeft: container ? container.scrollLeft : 0,
      details,
    };
  }

  restoreReaderState(state, annotationId = "") {
    const container = this.getScrollContainer();
    if (!container || !state) return;

    const details = typeof container.querySelectorAll === "function" ? Array.from(container.querySelectorAll("details")) : [];
    for (const item of state.details || []) {
      if (details[item.index]) details[item.index].open = item.open;
    }

    const restoreScroll = () => {
      container.scrollTop = state.scrollTop || 0;
      container.scrollLeft = state.scrollLeft || 0;
    };
    const didFocusAnnotation = annotationId && this.activateAnnotation(annotationId, true);
    if (didFocusAnnotation) return;
    restoreScroll();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreScroll);
    else setTimeout(restoreScroll, 0);
  }

  async renderKeepingScroll({ annotationId = "" } = {}) {
    const state = this.captureReaderState();
    await this.render();
    this.restoreReaderState(state, annotationId);
  }

  async renderCreationWorkbenchPreview() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-creation-projects", "reading-capture-creation-workbench");
    const shell = container.createDiv({ cls: "reading-capture-creation-shell" });
    const hero = shell.createDiv({ cls: "reading-capture-creation-hero" });
    const heroCopy = hero.createDiv();
    heroCopy.createEl("div", { cls: "reading-capture-creation-kicker", text: "READING CAPTURE / CREATION WORKBENCH" });
    heroCopy.createEl("h1", { text: "创作项目" });
    heroCopy.createEl("p", { text: "所有生成内容先展示、可修改、可撤回，再进入下一阶段。" });
    const heroActions = hero.createDiv({ cls: "reading-capture-creation-hero-actions" });
    heroActions.createEl("button", { text: "项目记录" });
    heroActions.createEl("button", { text: "回到创作灵感" }).addEventListener("click", () => this.plugin.openTopicPool());

    if (!this.projects.length) {
      shell.createDiv({ cls: "reading-capture-library-empty", text: this.isLoading ? "正在读取项目…" : "还没有创作项目。请从“创作灵感”选择一条并点击“开始创作”。" });
      return;
    }

    const selected = this.projects.find((project) => project.path === this.selectedPath) || this.projects[0];
    const projectSwitch = shell.createDiv({ cls: "reading-capture-creation-project-switch" });
    const projectLabel = projectSwitch.createDiv();
    projectLabel.createEl("div", { cls: "reading-capture-creation-kicker", text: "CURRENT PROJECT" });
    projectLabel.createEl("h2", { text: "当前项目" });
    const current = projectSwitch.createDiv({ cls: "reading-capture-creation-current-project" });
    const currentCopy = current.createDiv();
    currentCopy.createEl("strong", { text: selected.title });
    const currentMeta = currentCopy.createDiv({ cls: "reading-capture-creation-meta" });
    currentMeta.createEl("span", { cls: "is-platform", text: this.plugin.creationPlatformLabel(selected.platform) });
    currentMeta.createEl("span", { cls: "is-status", text: selected.statusLabel });
    const switchButton = current.createEl("button", { text: this.isProjectPickerOpen ? "收起项目" : "切换项目" });
    switchButton.addEventListener("click", async () => {
      this.isProjectPickerOpen = !this.isProjectPickerOpen;
      await this.render();
    });
    projectSwitch.createEl("span", { cls: "reading-capture-creation-sync", text: "Vault 已同步" });
    if (this.isProjectPickerOpen) this.renderApprovedProjectPicker(projectSwitch);

    const workspace = shell.createDiv({ cls: "reading-capture-creation-stage-workspace" });
    const navigation = workspace.createEl("nav", { cls: "reading-capture-creation-stage-nav" });
    navigation.createEl("h3", { text: "创作流程" });
    navigation.createEl("p", { text: "点击任一阶段查看对应界面。橙色表示需要你处理。" });
    const stageStates = selected.stageStates || creationWorkflow.deriveStageStates(selected.workflowState);
    const visibleStage = this.displayedStage && stageStates[this.displayedStage] !== "blocked"
      ? this.displayedStage
      : selected.workflowState.currentStage;
    const subtitles = {
      relations: "确认主题关系和素材边界",
      diagnosis: "识别缺口并选择研究方式",
      research: "控制联网范围和证据质量",
      brief: "阅读、编辑、反馈和确认",
      plan: "公众号提纲 / 小红书方案",
      draft: "正文修改和版本比较",
      visual: "逐张确认用途和生成技能",
      final: "检查发布包并创建快照",
    };
    creationWorkflow.WORKFLOW_STAGES.forEach((stage, index) => {
      const status = stageStates[stage.id] || "blocked";
      const viewedClass = stage.id === visibleStage ? " is-viewed" : "";
      const button = navigation.createEl("button", { cls: `reading-capture-creation-stage is-${status}${viewedClass}` });
      button.createEl("span", { cls: "reading-capture-creation-stage-number", text: String(index + 1) });
      const copy = button.createEl("span");
      copy.createEl("strong", { text: stage.label });
      copy.createEl("small", { text: subtitles[stage.id] });
      button.disabled = status === "blocked";
      if (!button.disabled) button.addEventListener("click", async () => {
        this.displayedStage = stage.id;
        await this.render();
      });
    });

    const canvas = workspace.createDiv({ cls: "reading-capture-creation-canvas" });
    this.renderCreationTaskAlerts(canvas, selected);
    const renderStage = {
      relations: () => this.renderApprovedRelations(canvas, selected),
      diagnosis: () => this.renderApprovedDiagnosis(canvas, selected),
      research: () => this.renderApprovedResearch(canvas, selected),
      brief: () => this.renderApprovedBrief(canvas, selected),
      plan: () => this.renderApprovedPlan(canvas, selected),
      draft: () => this.renderApprovedDraft(canvas, selected),
      visual: () => this.renderApprovedVisual(canvas, selected),
      final: () => this.renderApprovedFinal(canvas, selected),
    }[visibleStage];
    (renderStage || (() => this.renderApprovedRelations(canvas, selected)))();
  }

  renderCreationTaskAlerts(canvas, selected) {
    const inlineRecoveryKinds = new Set(["wechat.visual-item", "xhs.card-page"]);
    const actionable = (selected.tasks || []).filter((task) => (
      ["failed", "waiting_user", "partial"].includes(task.status)
      && !inlineRecoveryKinds.has(task.kind)
    ));
    if (!actionable.length) return;
    const recoveryByReason = {
      missing_skill: {
        message: "本机缺少任务锁定的 Skill 版本，或已安装内容未通过摘要校验。安装前可查看来源、固定版本、依赖和权限。",
        action: "查看并安装固定版本",
      },
      skill_permission_expansion: {
        message: "Skill 新版本扩大了读取、写入、联网或凭证权限。旧版本仍保留，新版本需重新批准后才能安装。",
        action: "查看权限变化",
      },
      skill_runtime_disabled: {
        message: "该研究能力的受控执行边界尚未完成，本版本不会安装、重试或调用它。请选择其他研究能力。",
        action: "",
      },
      credentials_or_permission: {
        message: "任务需要额外凭证或文件权限。完成授权后，可从这里重新执行。",
        action: "授权完成后重试",
      },
      invalid_output_contract: {
        message: "Skill 返回的内容不符合当前交付格式。修复 Skill 或输出配置后可重新执行。",
        action: "修复后重试",
      },
      ownership_conflict: {
        message: "任务仍由另一台设备或旧执行租约持有。请先在 Runner 设置中完成执行权交接。",
        action: "重新检查执行权",
      },
    };
    const alerts = canvas.createDiv({ cls: "reading-capture-creation-task-alerts" });
    for (const task of actionable.slice(0, 3)) {
      const alert = alerts.createDiv({ cls: `reading-capture-creation-task-alert is-${task.status}` });
      const copy = alert.createDiv();
      copy.createEl("strong", { text: `${this.plugin.creationTaskStatusLabel(task.status)} · ${task.skillId}` });
      const recovery = recoveryByReason[task.waitingReason] || {
        message: task.error || "任务需要你处理后才能继续。已完成的其他任务和临时结果会保留。",
        action: "重试此任务",
      };
      copy.createEl("p", { text: recovery.message });
      if (task.error && task.error !== recovery.message) copy.createEl("small", { text: `诊断信息：${task.error}` });
      const actions = alert.createDiv();
      if (["missing_skill", "skill_permission_expansion"].includes(task.waitingReason) && task.skillRequirement) {
        actions.createEl("button", { text: recovery.action }).addEventListener("click", () => {
          new ManagedSkillInstallModal(this.app, this.plugin, task, async () => this.reload()).open();
        });
      } else if (task.waitingReason === "ownership_conflict") {
        actions.createEl("button", { text: recovery.action }).addEventListener("click", async () => {
          await this.reload();
        });
      } else if (task.waitingReason !== "skill_runtime_disabled") {
        actions.createEl("button", { text: recovery.action }).addEventListener("click", async () => {
          await this.plugin.retryCreationTask(task);
          await this.reload();
        });
      }
      actions.createEl("button", { text: "取消任务" }).addEventListener("click", async () => {
        await this.plugin.cancelCreationTask(task);
        await this.reload();
      });
    }
  }

  renderApprovedProjectPicker(container) {
    const picker = container.createDiv({ cls: "reading-capture-creation-project-picker" });
    const pickerHeader = picker.createDiv({ cls: "reading-capture-creation-project-picker-header" });
    pickerHeader.createEl("strong", { text: `全部项目 · ${this.projects.length}` });
    pickerHeader.createEl("small", { text: "已完成项目仍会保留，可随时切换查看" });
    const search = picker.createEl("input", { attr: { type: "search", placeholder: "搜索项目标题…", "aria-label": "搜索创作项目" } });
    const options = picker.createDiv({ cls: "reading-capture-creation-project-options" });
    const rows = [];
    for (const project of this.projects) {
      const button = options.createEl("button", { cls: project.path === this.selectedPath ? "is-selected" : "" });
      const copy = button.createDiv({ cls: "reading-capture-creation-project-option-copy" });
      copy.createEl("strong", { text: project.title });
      copy.createEl("small", { text: `${this.plugin.creationPlatformLabel(project.platform)} · ${project.statusLabel}` });
      button.addEventListener("click", async () => {
        this.selectedPath = project.path;
        this.isProjectPickerOpen = false;
        await this.render();
      });
      rows.push({ button, value: `${project.title} ${project.statusLabel}`.toLocaleLowerCase() });
    }
    search.addEventListener("input", () => {
      const query = String(search.value || "").trim().toLocaleLowerCase();
      for (const row of rows) row.button.toggleClass("is-filtered-out", !!query && !row.value.includes(query));
    });
  }

  renderApprovedRelations(canvas, selected) {
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const headCopy = head.createDiv();
    headCopy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 01 / CREATION ENTRY" });
    headCopy.createEl("h2", { text: "先选择这次内容从哪里开始" });
    headCopy.createEl("p", { text: "从灵感创建新内容需要建立简报；已有完整文章做平台改编时，不重复走研究和主简报流程。" });
    head.createEl("span", { cls: "reading-capture-creation-state", text: "当前：从灵感创建" });
    const entries = screen.createDiv({ cls: "reading-capture-creation-entry-choice" });
    const idea = entries.createDiv({ cls: "reading-capture-creation-entry-card is-active" });
    idea.createEl("span", { cls: "reading-capture-creation-entry-icon", text: "✦" });
    const ideaCopy = idea.createDiv();
    ideaCopy.createEl("h3", { text: "从创作灵感开始" });
    ideaCopy.createEl("p", { text: "适合只有主题、灵感或零散材料的任务。先诊断、研究并确认主简报。" });
    idea.createEl("button", { text: "当前路径", attr: { disabled: "disabled" } });
    const article = entries.createDiv({ cls: "reading-capture-creation-entry-card" });
    article.createEl("span", { cls: "reading-capture-creation-entry-icon", text: "文" });
    const articleCopy = article.createDiv();
    articleCopy.createEl("h3", { text: "从已保存文章或笔记开始" });
    articleCopy.createEl("p", { text: "选择 Obsidian 中的文章、长笔记或 PDF，再决定生成微信公众号文章还是小红书图文。" });
    const articleButton = article.createEl("button", { text: "选择来源与平台" });
    articleButton.addEventListener("click", async () => {
      this.isSourcePickerOpen = true;
      await this.render();
    });
    if (this.isSourcePickerOpen) this.renderApprovedSourcePicker(screen, selected);
    screen.createDiv({ cls: "reading-capture-creation-notice", text: "当前主简报和提纲引用的灵感关系发生变化时，下游产物会标记为需要重新检查。" });
    screen.createEl("h3", { text: "主灵感" });
    const primary = screen.createDiv({ cls: "reading-capture-creation-relation is-primary" });
    primary.createEl("strong", { text: selected.primaryTitle || selected.title });
    primary.createEl("p", { text: "创建项目时由你选择；主灵感必须保留一条。" });
    screen.createEl("h3", { text: "关联灵感" });
    if (selected.relatedTitles && selected.relatedTitles.length) {
      for (const title of selected.relatedTitles) {
        const related = screen.createDiv({ cls: "reading-capture-creation-relation" });
        related.createEl("strong", { text: title });
        const unlink = related.createEl("button", { text: "解除关联" });
        unlink.addEventListener("click", async () => {
          unlink.disabled = true;
          await this.plugin.unlinkCreationInspiration(selected.path, title);
          await this.reload();
        });
      }
    } else {
      screen.createEl("p", { cls: "reading-capture-creation-empty-copy", text: "当前没有关联灵感；关联灵感可以为空。" });
    }
    const relatedActions = screen.createDiv({ cls: "reading-capture-creation-related-actions" });
    const addRelated = relatedActions.createEl("button", { cls: "mod-cta", text: "增加关联灵感" });
    let relatedPicker = null;
    addRelated.addEventListener("click", async () => {
      if (relatedPicker) {
        relatedPicker.remove();
        relatedPicker = null;
        this.isRelatedInspirationPickerOpen = false;
        return;
      }
      this.isRelatedInspirationPickerOpen = true;
      try {
        relatedPicker = this.renderApprovedRelatedInspirationPicker(screen, selected);
      } catch (error) {
        this.isRelatedInspirationPickerOpen = false;
        console.error("Reading Capture related inspiration picker failed", error);
        new Notice("关联灵感选择器暂时无法打开。");
      }
    });
    if (this.isRelatedInspirationPickerOpen) relatedPicker = this.renderApprovedRelatedInspirationPicker(screen, selected);
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    gate.createEl("h4", { text: "完成本阶段前需要确认" });
    gate.createEl("p", { text: "进入下一步后仍可修改，但下游产物会被标记为需要重新检查。" });
    const checks = gate.createDiv({ cls: "reading-capture-creation-gate-checks" });
    const primaryLabel = checks.createEl("label", { text: "我确认当前主灵感正确" });
    const primaryCheck = primaryLabel.createEl("input", { attr: { type: "checkbox" } });
    const relatedLabel = checks.createEl("label", { text: "我确认关联灵感范围正确" });
    const relatedCheck = relatedLabel.createEl("input", { attr: { type: "checkbox" } });
    const nextButton = gate.createEl("button", { cls: "mod-cta", text: "确认项目输入，进入素材诊断" });
    nextButton.disabled = true;
    const syncGate = () => { nextButton.disabled = !(primaryCheck.checked && relatedCheck.checked); };
    primaryCheck.addEventListener("change", syncGate);
    relatedCheck.addEventListener("change", syncGate);
    nextButton.addEventListener("click", async () => {
      nextButton.disabled = true;
      await this.plugin.confirmCreationRelations(selected.path);
      await this.reload();
    });
  }

  renderApprovedRelatedInspirationPicker(screen, selected) {
    const picker = screen.createDiv({ cls: "reading-capture-creation-related-picker" });
    const head = picker.createDiv({ cls: "reading-capture-creation-source-picker-head" });
    const copy = head.createDiv();
    copy.createEl("h3", { text: "选择要关联的灵感" });
    copy.createEl("p", { text: "主灵感不会出现在这里；已关联的灵感也会自动排除。" });
    head.createEl("button", { text: "关闭" }).addEventListener("click", async () => {
      this.isRelatedInspirationPickerOpen = false;
      picker.remove();
    });
    const search = picker.createEl("input", { attr: { type: "search", placeholder: "搜索灵感标题…", "aria-label": "搜索要关联的灵感" } });
    const resultMeta = picker.createEl("small", { cls: "reading-capture-creation-related-picker-meta", text: "正在读取灵感…" });
    const results = picker.createDiv({ cls: "reading-capture-creation-related-results" });
    let candidates = [];
    const renderResults = () => {
      results.empty();
      const query = String(search.value || "").trim().toLocaleLowerCase();
      const visible = candidates.filter((item) => {
        const title = this.plugin.creationIdeaTitle(item).toLocaleLowerCase();
        return !query || `${title} ${String(item.judgment || item.note || item.quote || "")}`.toLocaleLowerCase().includes(query);
      });
      resultMeta.textContent = `${visible.length} 条可关联灵感`;
      if (!visible.length) {
        results.createEl("p", { cls: "reading-capture-creation-empty-copy", text: query ? "没有匹配的灵感" : "暂时没有可新增的关联灵感" });
        return;
      }
      for (const item of visible.slice(0, 50)) {
        const title = this.plugin.creationIdeaTitle(item);
        const row = results.createEl("button", { cls: "reading-capture-creation-related-row", attr: { type: "button" } });
        const rowCopy = row.createDiv();
        rowCopy.createEl("strong", { text: title });
        rowCopy.createEl("small", { text: `${item.originLabel || "灵感"} · 点击后加入项目` });
        row.addEventListener("click", async () => {
          row.disabled = true;
          await this.plugin.appendInspirationToCreationProject(item, selected.path);
          this.isRelatedInspirationPickerOpen = false;
          new Notice("关联灵感已加入项目。");
          await this.reload();
        });
      }
    };
    search.addEventListener("input", renderResults);
    this.plugin.buildTopicPoolItems().then((items) => {
      const excluded = new Set([selected.primaryTitle, ...(selected.relatedTitles || [])].map((title) => String(title || "").trim()).filter(Boolean));
      candidates = (items || []).filter((item) => {
        const title = this.plugin.creationIdeaTitle(item);
        return title && !excluded.has(title);
      });
      renderResults();
    }).catch(() => {
      resultMeta.textContent = "灵感读取失败";
      results.createEl("p", { cls: "reading-capture-creation-empty-copy", text: "暂时无法读取创作灵感，请稍后重试。" });
    });
    return picker;
  }

  renderApprovedSourcePicker(screen, selected) {
    const picker = screen.createDiv({ cls: "reading-capture-creation-source-picker" });
    const head = picker.createDiv({ cls: "reading-capture-creation-source-picker-head" });
    const copy = head.createDiv();
    copy.createEl("h3", { text: "选择一篇已保存文章或笔记" });
    copy.createEl("p", { text: "这里只读取文件元数据。确认主文件后才读取正文；每次最多显示 50 项。" });
    head.createEl("button", { text: "关闭" }).addEventListener("click", async () => {
      this.isSourcePickerOpen = false;
      await this.render();
    });
    const controls = picker.createDiv({ cls: "reading-capture-creation-source-controls" });
    const platform = controls.createEl("select", { attr: { "aria-label": "目标平台" } });
    [["wechat", "微信公众号"], ["xiaohongshu", "小红书图文"]].forEach(([value, label]) => platform.createEl("option", { text: label, value }));
    platform.value = selected.workflowState.activeDeliverable;
    const search = controls.createEl("input", { attr: { type: "search", placeholder: "搜索标题或 Vault 路径…", "aria-label": "搜索已保存文章" } });
    const resultMeta = controls.createEl("span");
    const results = picker.createDiv({ cls: "reading-capture-creation-source-results" });
    const selection = picker.createDiv({ cls: "reading-capture-creation-source-selection" });
    let chosenPath = "";
    let offset = 0;
    let timer = null;
    const confirm = selection.createEl("button", { cls: "mod-cta", text: "读取所选主文件并进入平台方案" });
    confirm.disabled = true;
    const renderResults = (append = false) => {
      const page = this.plugin.searchCreationSourceMetadata(search.value, { offset, limit: 50 });
      if (!append) results.empty();
      resultMeta.textContent = `${Math.min(offset + page.items.length, page.total)} / ${page.total}`;
      for (const item of page.items) {
        const row = results.createEl("button", { cls: "reading-capture-creation-source-row" });
        const rowCopy = row.createDiv();
        rowCopy.createEl("strong", { text: item.title });
        rowCopy.createEl("small", { text: item.path });
        row.createEl("span", { text: `${item.kind === "pdf" ? "PDF" : "Markdown"} · ${item.size} bytes · 尚未读取正文` });
        row.addEventListener("click", () => {
          chosenPath = item.path;
          for (const element of results.children || []) element.removeClass("is-selected");
          row.addClass("is-selected");
          confirm.disabled = false;
          selection.createEl("p", { text: `已选择：${item.path}。确认后只复制这一主文件到项目，不递归读取目录。` });
        });
      }
      if (offset + page.items.length < page.total) {
        const more = results.createEl("button", { text: "加载下一批 50 项" });
        more.addEventListener("click", () => { offset += 50; renderResults(true); });
      }
      if (!page.total) results.createEl("p", { cls: "reading-capture-creation-empty-copy", text: this.plugin.articleLibraryEmptyMessage() });
    };
    search.addEventListener("input", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { offset = 0; chosenPath = ""; confirm.disabled = true; renderResults(false); }, 280);
    });
    confirm.addEventListener("click", async () => {
      if (!chosenPath) return;
      confirm.disabled = true;
      await this.plugin.startCreationRepurpose(selected.path, chosenPath, platform.value);
      this.isSourcePickerOpen = false;
      this.displayedStage = "";
      await this.reload();
    });
    renderResults(false);
  }

  renderApprovedDiagnosis(canvas, selected) {
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 02 / MATERIAL DIAGNOSIS" });
    copy.createEl("h2", { text: "先看材料够不够，再决定是否研究" });
    copy.createEl("p", { text: "系统展示判断依据，不替你做决定。你可以补材料、修改目标，或者明确选择下一条路径。" });
    const diagnosisTask = (selected.tasks || []).find((task) => task.kind === "diagnosis.materials");
    const diagnosisReady = !!(diagnosisTask && ["awaiting_approval", "completed"].includes(diagnosisTask.status))
      || (!diagnosisTask && this.plugin.isCompletedCreationDiagnosis(selected.diagnosis));
    const diagnosisStateLabel = diagnosisReady
      ? "诊断已生成 · 等待你选择路径"
      : diagnosisTask
        ? `诊断任务 · ${this.plugin.creationTaskStatusLabel(diagnosisTask.status)}`
        : "未找到诊断任务";
    head.createEl("span", { cls: "reading-capture-creation-state", text: diagnosisStateLabel });
    const summary = screen.createDiv({ cls: "reading-capture-creation-diagnosis-card" });
    summary.createEl("strong", { text: diagnosisReady ? "材料诊断已经生成" : "正在根据当前灵感和材料生成诊断" });
    summary.createEl("p", { text: selected.diagnosis || "诊断结果会分别说明主题、读者价值、证据和真实场景是否充分。" });
    screen.createEl("h3", { text: "你可以参与的操作" });
    const actions = screen.createDiv({ cls: "reading-capture-creation-diagnosis-actions" });
    const local = actions.createDiv({ cls: "reading-capture-creation-action-card" });
    local.createEl("h3", { text: "补充本地材料" });
    local.createEl("p", { text: "从 Obsidian 选择文章、笔记或标注，说明它支持哪个判断。" });
    const localButton = local.createEl("button", { text: "选择本地材料" });
    localButton.addEventListener("click", async () => {
      this.isSupportingPickerOpen = !this.isSupportingPickerOpen;
      await this.render();
    });
    const research = actions.createDiv({ cls: "reading-capture-creation-action-card" });
    research.createEl("h3", { text: "进入联网研究" });
    research.createEl("p", { text: "补充材料和研究指导都是可选项；也可以直接使用默认研究配置。" });
    const researchButton = research.createEl("button", { cls: "mod-cta", text: "直接进入研究配置" });
    researchButton.disabled = !diagnosisReady;
    researchButton.addEventListener("click", async () => {
      researchButton.disabled = true;
      await this.plugin.chooseCreationResearchPath(selected.path, "research");
      await this.reload();
    });
    const skip = actions.createDiv({ cls: "reading-capture-creation-action-card" });
    skip.createEl("h3", { text: "本次不做联网研究" });
    skip.createEl("p", { text: "仅在你明确不想研究、但仍要按现有材料先写一版时使用。" });
    const skipButton = skip.createEl("button", { text: "查看不联网的影响" });
    skipButton.disabled = !diagnosisReady;
    skipButton.addEventListener("click", async () => {
      this.showResearchRiskLimits = true;
      await this.render();
    });
    screen.createEl("h3", { text: "可选：补充材料与研究指导" });
    const inputs = screen.createDiv({ cls: "reading-capture-creation-input-workbench" });
    if (this.isSupportingPickerOpen) this.renderApprovedSupportingPicker(screen, selected);
    const material = inputs.createDiv({ cls: "reading-capture-creation-input-panel" });
    material.createEl("h3", { text: "我的补充材料" });
    material.createEl("p", { text: "可选；不填写时无需进行任何保存操作。" });
    const materialInput = material.createEl("textarea", { attr: { placeholder: "填写个人经验、作者判断、事实线索或本地材料说明…" } });
    materialInput.value = selected.userMaterial || "";
    materialInput.addEventListener("blur", async () => {
      if (String(materialInput.value || "") === String(selected.userMaterial || "")) return;
      await this.plugin.saveCreationDiagnosisInput(selected.path, "material", materialInput.value);
      new Notice("补充材料已保存，诊断任务已更新。");
    });
    const guidance = inputs.createDiv({ cls: "reading-capture-creation-input-panel" });
    guidance.createEl("h3", { text: "联网研究指导" });
    guidance.createEl("p", { text: "可选；没有具体要求也可以直接进入研究配置。" });
    const guidanceInput = guidance.createEl("textarea", { attr: { placeholder: "填写希望研究回答的问题、来源偏好或排除项…" } });
    guidanceInput.value = selected.researchRequest || "";
    guidanceInput.addEventListener("blur", async () => {
      if (String(guidanceInput.value || "") === String(selected.researchRequest || "")) return;
      await this.plugin.saveCreationDiagnosisInput(selected.path, "research", guidanceInput.value);
      new Notice("研究指导已保存；它不会自动授权联网。");
    });
    if (this.showResearchRiskLimits) {
      const risk = screen.createDiv({ cls: "reading-capture-creation-risk-panel" });
      risk.createEl("h3", { text: "本次不联网会保留的限制" });
      risk.createEl("p", { text: "未解决缺口：五项风险的权威依据和真实失败案例不足。允许使用条件性、作者判断式表达；禁止声称框架已被行业验证或覆盖全部风险。" });
      risk.createEl("p", { text: "后续主简报、提纲、初稿和质量报告都会持续显示证据限制；本决定只适用于当前材料版本。" });
      const ackLabel = risk.createEl("label", { text: "我理解这些限制，并仍要基于当前材料生成受限简报" });
      const ack = ackLabel.createEl("input", { attr: { type: "checkbox" } });
      const confirm = risk.createEl("button", { cls: "mod-warning", text: "确认本次不联网，进入受限简报审核" });
      confirm.disabled = true;
      ack.addEventListener("change", () => { confirm.disabled = !ack.checked; });
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        await this.plugin.chooseCreationResearchPath(selected.path, "skip");
        this.showResearchRiskLimits = false;
        this.displayedStage = "";
        await this.reload();
      });
      risk.createEl("button", { text: "暂不决定，留在素材诊断" }).addEventListener("click", async () => {
        this.showResearchRiskLimits = false;
        await this.render();
      });
    }
  }

  renderApprovedSupportingPicker(screen, selected) {
    const picker = screen.createDiv({ cls: "reading-capture-creation-source-picker" });
    const head = picker.createDiv({ cls: "reading-capture-creation-source-picker-head" });
    const copy = head.createDiv();
    copy.createEl("h3", { text: "选择一份本地补充材料" });
    copy.createEl("p", { text: "仅按标题和路径搜索元数据；确认后才读取并复制到当前项目。每次最多显示 50 项。" });
    head.createEl("button", { text: "关闭" }).addEventListener("click", async () => {
      this.isSupportingPickerOpen = false;
      await this.render();
    });
    const controls = picker.createDiv({ cls: "reading-capture-creation-source-controls" });
    const search = controls.createEl("input", { attr: { type: "search", placeholder: "搜索标题或 Vault 路径…", "aria-label": "搜索本地补充材料" } });
    const resultMeta = controls.createEl("span");
    const results = picker.createDiv({ cls: "reading-capture-creation-source-results" });
    const renderResults = () => {
      const page = this.plugin.searchCreationSourceMetadata(search.value, { offset: 0, limit: 50 });
      results.empty();
      resultMeta.textContent = `${page.items.length} / ${page.total}`;
      for (const item of page.items) {
        const row = results.createEl("button", { cls: "reading-capture-creation-source-row" });
        const rowCopy = row.createDiv();
        rowCopy.createEl("strong", { text: item.title });
        rowCopy.createEl("small", { text: item.path });
        row.createEl("span", { text: item.kind === "pdf" ? "PDF" : "Markdown" });
        row.addEventListener("click", async () => {
          row.disabled = true;
          await this.plugin.addCreationSupportingSource(selected.path, item.path);
          this.isSupportingPickerOpen = false;
          new Notice("本地材料已加入项目，并重新生成材料诊断。");
          await this.reload();
        });
      }
    };
    search.addEventListener("input", renderResults);
    renderResults();
  }

  renderApprovedResearch(canvas, selected) {
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 03 / RESEARCH CONTROL" });
    copy.createEl("h2", { text: "研究范围由你决定" });
    copy.createEl("p", { text: "联网研究是可选项。选择能力、核对准确发送范围，再决定授权研究或不联网进入受限简报。" });
    head.createEl("span", { cls: "reading-capture-creation-state", text: "等待你选择处理方式" });
    const tasks = (selected.tasks || []).filter((task) => task.kind === "research.evidence");
    const reviewable = tasks.filter((task) => task.status === "awaiting_approval");
    const active = tasks.filter((task) => ["pending", "running"].includes(task.status));
    if (tasks.length && reviewable.length === tasks.length) {
      screen.createEl("h3", { text: "研究结果等待审核" });
      const result = screen.createDiv({ cls: "reading-capture-creation-result-review" });
      result.createEl("p", { text: "研究证据、来源、冲突与未解决缺口已经生成。接受前可打开文件逐条检查。" });
      result.createEl("button", { text: "查看研究证据" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/research/evidence.md`));
      result.createEl("button", { text: "查看来源与冲突" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/research/sources.md`));
      const accept = result.createEl("button", { cls: "mod-cta", text: "接受研究结果，生成主简报候选" });
      accept.addEventListener("click", async () => {
        accept.disabled = true;
        await this.plugin.acceptCreationResearchResults(selected.path);
        await this.reload();
      });
      return;
    }
    if (active.length) {
      screen.createEl("h3", { text: "研究任务执行状态" });
      const taskList = screen.createDiv({ cls: "reading-capture-creation-task-list" });
      active.forEach((task) => {
        const row = taskList.createDiv();
        row.createEl("strong", { text: task.skillId });
        row.createEl("span", { text: this.plugin.creationTaskStatusLabel(task.status) });
      });
      screen.createEl("p", { text: "可以关闭 Obsidian；本机 Runner 会继续执行。全部结果完成后再统一审核，不会自动生成主简报。" });
      return;
    }
    screen.createEl("h3", { text: "1. 选择研究能力" });
    const routes = screen.createDiv({ cls: "reading-capture-creation-research-routes" });
    const routeInputs = [];
    [
      ["deep-research-skills", "Deep Research Skills", "默认：补足治理、权限、审计、失控与案例证据。", true],
      ["last30days", "Last30Days", "V1 受控路线尚未完成，暂不可选；不会读取浏览器 Cookie 或系统钥匙串。", false],
      ["academic-research-suite", "Academic Research Suite", "仅在需要论文、实验或因果证据时选择。", false],
    ].forEach(([value, title, description, checked]) => {
      const label = routes.createEl("label", { cls: "reading-capture-creation-research-route" });
      const input = label.createEl("input", { attr: { type: "checkbox", value } });
      input.checked = checked;
      const policy = skillRegistry.skillRuntimePolicy(value);
      input.disabled = !policy.enabled;
      if (!policy.enabled) label.addClass("is-disabled");
      const routeCopy = label.createDiv();
      routeCopy.createEl("strong", { text: title });
      routeCopy.createEl("p", { text: description });
      routeInputs.push(input);
    });
    screen.createEl("h3", { text: "2. 核对发送内容" });
    const scope = screen.createDiv({ cls: "reading-capture-creation-transmission" });
    scope.createEl("p", { text: "仅发送项目主题、两条灵感摘要、五个本地来源标题与证据缺口；不包含 Vault 其他文件。" });
    const scopeDetails = scope.createDiv({ cls: "reading-capture-creation-transmission-details is-collapsed" });
    scopeDetails.createEl("p", { text: `项目文件：${selected.path}` });
    scopeDetails.createEl("p", { text: "输入：项目上下文、材料诊断、你填写的研究指导。输出只写回当前项目 research 目录。" });
    let scopeViewed = false;
    const viewScope = scope.createEl("button", { text: "查看完整发送清单" });
    viewScope.addEventListener("click", () => {
      scopeViewed = true;
      scopeDetails.removeClass("is-collapsed");
      viewScope.textContent = "发送清单已展开";
      syncStart();
    });
    const guidance = scope.createEl("textarea", { attr: { placeholder: "可选：补充研究问题、来源偏好、排除项或时间范围…" } });
    const authorization = scope.createEl("label", { cls: "reading-capture-creation-authorization", text: "我已核对以上发送范围，并授权所选研究任务联网" });
    const authorizationCheck = authorization.createEl("input", { attr: { type: "checkbox" } });
    screen.createEl("h3", { text: "3. 选择本阶段如何结束" });
    const ending = screen.createDiv({ cls: "reading-capture-creation-research-ending" });
    const start = ending.createEl("button", { cls: "mod-cta", text: "授权以上内容并开始研究" });
    start.disabled = true;
    const syncStart = () => {
      start.disabled = !(scopeViewed && authorizationCheck.checked && routeInputs.some((input) => input.checked));
    };
    authorizationCheck.addEventListener("change", syncStart);
    routeInputs.forEach((input) => input.addEventListener("change", syncStart));
    start.addEventListener("click", async () => {
      start.disabled = true;
      const skills = routeInputs.filter((input) => input.checked).map((input) => input.value);
      for (const skillId of skills) {
        await this.plugin.queueCreationStageTask(selected.path, "research.evidence", {
          skillId,
          networkAuthorized: true,
          researchGuidance: guidance.value,
        });
      }
      await this.reload();
    });
    const skip = ending.createEl("button", { text: "改变决定：本次不联网" });
    skip.addEventListener("click", async () => {
      this.showResearchRiskLimits = true;
      await this.render();
    });
    if (this.showResearchRiskLimits) {
      const risk = screen.createDiv({ cls: "reading-capture-creation-risk-panel" });
      risk.createEl("h3", { text: "改变决定后会保留的限制" });
      risk.createEl("p", { text: "研究任务不会启动；现有材料中缺少的权威依据、真实失败案例和近期变化仍会显示为证据缺口。后续只允许使用条件性、作者判断式表达。" });
      risk.createEl("p", { text: "第三步会标记为“未执行”，然后直接进入第四步受限主简报审核，不会再经过一个空的研究页面。" });
      const label = risk.createEl("label", { text: "我理解这些限制，并确认本次不联网" });
      const acknowledgment = label.createEl("input", { attr: { type: "checkbox" } });
      const confirmSkip = risk.createEl("button", { cls: "mod-warning", text: "确认改变决定，进入受限主简报审核" });
      confirmSkip.disabled = true;
      acknowledgment.addEventListener("change", () => { confirmSkip.disabled = !acknowledgment.checked; });
      confirmSkip.addEventListener("click", async () => {
        confirmSkip.disabled = true;
        await this.plugin.chooseCreationResearchPath(selected.path, "skip");
        this.showResearchRiskLimits = false;
        await this.reload();
      });
      risk.createEl("button", { text: "继续配置联网研究" }).addEventListener("click", async () => {
        this.showResearchRiskLimits = false;
        await this.render();
      });
    }
  }

  renderApprovedBrief(canvas, selected) {
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 04 / MASTER BRIEF REVIEW" });
    copy.createEl("h2", { text: "先完整阅读，再确认主简报" });
    copy.createEl("p", { text: "可直接编辑，也可填写意见让 AI 生成新版本。任何修改都会使旧的阅读确认失效。" });
    head.createEl("span", { cls: "reading-capture-creation-state", text: selected.workflowState.briefMode === "restricted" ? "受限简报 · 证据边界持续显示" : "等待审核" });
    const workspace = screen.createDiv({ cls: "reading-capture-creation-brief-workspace" });
    const document = workspace.createDiv({ cls: "reading-capture-creation-brief-document" });
    document.createEl("h3", { text: "完整创作简报" });
    const editor = document.createEl("textarea", { cls: "reading-capture-creation-brief-editor", attr: { "aria-label": "完整创作简报" } });
    editor.value = selected.masterBrief || "创作简报尚未生成。请等待 Skill Runner 完成。";
    const autosave = document.createEl("p", { cls: "reading-capture-creation-autosave", text: "未修改 · 当前版本会保留" });
    const saveManual = document.createEl("button", { text: "内容有修改后，可保存为用户版本" });
    saveManual.disabled = true;
    const revision = workspace.createDiv({ cls: "reading-capture-creation-brief-revision" });
    revision.createEl("h3", { text: "让 AI 修订（可选）" });
    revision.createEl("p", { text: "只在你希望 AI 按意见重写时使用；意见输入后自动保存，不会立即调用 AI。" });
    const feedback = revision.createEl("textarea", { attr: { placeholder: "例如：保留五项风险框架，但增加真实失败场景，并收紧无法证实的判断…" } });
    const revise = revision.createEl("button", { text: "填写意见后生成新版本" });
    revise.disabled = true;
    let hasUnsavedManualDraft = false;
    feedback.addEventListener("input", () => { revise.disabled = hasUnsavedManualDraft || !String(feedback.value || "").trim(); });
    revise.addEventListener("click", async () => {
      if (hasUnsavedManualDraft || !String(feedback.value || "").trim()) return;
      revise.disabled = true;
      await this.plugin.requestCreationRevision(selected.path, "masterBrief", feedback.value);
      new Notice("已保留当前简报版本，并创建 AI 修订任务。");
      await this.reload();
    });
    const task = (selected.tasks || []).find((item) => item.kind === "brief.master" && item.status === "awaiting_approval");
    const version = this.plugin.creationTaskVersionLabel(task);
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    gate.createEl("h4", { text: `最后一步：确认创作简报 ${version}` });
    const readLabel = gate.createEl("label", { text: "我已阅读完整简报" });
    const readCheck = readLabel.createEl("input", { attr: { type: "checkbox" } });
    const confirm = gate.createEl("button", { cls: "mod-cta", text: `确认简报 ${version}，进入平台方案` });
    confirm.disabled = true;
    readCheck.addEventListener("change", () => { confirm.disabled = !(readCheck.checked && task); });
    editor.addEventListener("input", () => {
      hasUnsavedManualDraft = true;
      readCheck.checked = false;
      confirm.disabled = true;
      revise.disabled = true;
      saveManual.disabled = false;
      saveManual.textContent = "完成编辑，保存为新的用户版本";
      autosave.textContent = "工作草稿将在离开编辑框时自动保存；尚不能确认或交给 AI 修订";
      gate.addClass("has-work-draft");
    });
    editor.addEventListener("blur", async () => {
      if (!hasUnsavedManualDraft) return;
      await this.plugin.saveCreationWorkDraft(selected.path, "masterBrief", editor.value);
      autosave.textContent = "工作草稿已自动保存 · 仍需保存为用户版本后才能确认";
    });
    saveManual.addEventListener("click", async () => {
      if (!hasUnsavedManualDraft) return;
      saveManual.disabled = true;
      const saved = await this.plugin.saveCreationManualVersion(selected.path, "masterBrief", editor.value);
      new Notice(`已保存创作简报 ${saved.versionId}，请重新通读并确认。`);
      await this.reload();
    });
    confirm.addEventListener("click", async () => {
      if (!task) return;
      confirm.disabled = true;
      try {
        await this.plugin.acceptCreationTask(task);
        await this.reload();
      } catch (error) {
        confirm.disabled = false;
        await this.plugin.writeDiagnosticEvent("error", "creation-brief-accept", { error: this.plugin.errorToDiagnostic(error), taskId: task.taskId });
        new Notice(`无法确认简报：${error && error.message ? error.message : error}`);
      }
    });
  }

  renderApprovedPlan(canvas, selected) {
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 05 / PLATFORM PLAN" });
    copy.createEl("h2", { text: "先选择交付物，再编辑对应内容方案" });
    copy.createEl("p", { text: "公众号和小红书可以同时存在，分别维护自己的版本、审核和任务状态。" });
    head.createEl("span", { cls: "reading-capture-creation-state", text: "当前交付物的方案等待审核" });
    const switcher = screen.createDiv({ cls: "reading-capture-creation-platform-switcher" });
    [
      ["wechat", "微信公众号"],
      ["xiaohongshu", "小红书图文"],
    ].forEach(([platform, label]) => {
      const deliverable = selected.workflowState.deliverables[platform];
      const button = switcher.createEl("button", { cls: selected.workflowState.activeDeliverable === platform ? "is-active" : "" });
      button.createEl("strong", { text: label });
      button.createEl("small", { text: deliverable ? `已创建 · 当前在${this.plugin.creationStageLabel(deliverable.stage)}` : "尚未创建" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        if (!deliverable) await this.plugin.addCreationDeliverable(selected.path, platform);
        await this.plugin.activateCreationDeliverable(selected.path, platform);
        this.displayedStage = "";
        await this.reload();
      });
    });
    if (selected.workflowState.activeDeliverable === "xiaohongshu") this.renderApprovedXhsPlan(screen, selected);
    else this.renderApprovedWechatPlan(screen, selected);
  }

  renderApprovedWechatPlan(screen, selected) {
    screen.createEl("h3", { text: "微信公众号内容提纲与配图计划" });
    if (selected.workflowState.workflowMode === "article_repurpose" && selected.workflowState.source.mainFile) {
      const source = screen.createDiv({ cls: "reading-capture-creation-source-read" });
      source.createEl("strong", { text: "文章来源已按需读取" });
      source.createEl("p", { text: selected.workflowState.source.mainFile });
      source.createEl("small", { text: "只读取主文件；不会递归读取所在目录。" });
    }
    const columns = screen.createDiv({ cls: "reading-capture-creation-plan-columns" });
    const outline = columns.createDiv({ cls: "reading-capture-creation-plan-document" });
    outline.createEl("h3", { text: "文章提纲" });
    outline.createEl("p", { text: "每一节都应包含写作目的、核心判断、证据要求与必要子节。" });
    const outlineEditor = outline.createEl("textarea", { attr: { "aria-label": "微信公众号文章提纲" } });
    outlineEditor.value = selected.wechatOutline || "提纲尚未生成；等待 Writing Styles 完成。";
    const visuals = columns.createDiv({ cls: "reading-capture-creation-plan-document" });
    visuals.createEl("h3", { text: "正文配图计划" });
    visuals.createEl("p", { text: "这里只确定插入位置、认知任务、视觉意图、比例与 Skill，不生成图片。" });
    const visualEditor = visuals.createEl("textarea", { attr: { "aria-label": "微信公众号正文配图计划" } });
    visualEditor.value = selected.wechatIllustrationPlan || "配图计划尚未生成。";
    const discussion = screen.createDiv({ cls: "reading-capture-creation-agent-discussion" });
    discussion.createEl("h3", { text: "和 Agent 讨论整体方案（可选）" });
    const discussionInput = discussion.createEl("textarea", { attr: { placeholder: "例如：先从上线评审的真实场景切入；第三节改成风险门槛表；配图减少装饰性场景…" } });
    const revise = discussion.createEl("button", { text: "填写意见后生成新版方案" });
    revise.disabled = true;
    let hasManualChanges = false;
    const saveManual = screen.createEl("button", { text: "内容有修改后，可保存为用户方案版本" });
    saveManual.disabled = true;
    const markDirty = () => {
      hasManualChanges = true;
      saveManual.disabled = false;
      revise.disabled = true;
      if (typeof confirm !== "undefined") confirm.disabled = true;
    };
    outlineEditor.addEventListener("input", markDirty);
    visualEditor.addEventListener("input", markDirty);
    discussionInput.addEventListener("input", () => { revise.disabled = hasManualChanges || !String(discussionInput.value || "").trim(); });
    saveManual.addEventListener("click", async () => {
      saveManual.disabled = true;
      const outlineVersion = await this.plugin.saveCreationManualVersion(selected.path, "wechatOutline", outlineEditor.value);
      const visualVersion = await this.plugin.saveCreationManualVersion(selected.path, "wechatIllustrationPlan", visualEditor.value);
      new Notice(`已保存提纲 ${outlineVersion.versionId} 与配图计划 ${visualVersion.versionId}，请重新核对。`);
      await this.reload();
    });
    revise.addEventListener("click", async () => {
      revise.disabled = true;
      await this.plugin.requestCreationRevision(selected.path, "wechatOutline", discussionInput.value);
      new Notice("已保留当前方案，并创建公众号方案修订任务。");
      await this.reload();
    });
    const task = (selected.tasks || []).find((item) => item.kind === "wechat.plan" && item.status === "awaiting_approval");
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    gate.createEl("h4", { text: "确认公众号提纲与配图计划" });
    gate.createEl("p", { text: "确认后只生成文字初稿；配图会在正文锁定后执行。" });
    const confirm = gate.createEl("button", { cls: "mod-cta", text: "确认两个方案，生成公众号初稿" });
    confirm.disabled = !task || hasManualChanges;
    confirm.addEventListener("click", async () => {
      if (!task) return;
      confirm.disabled = true;
      await this.plugin.acceptCreationTask(task);
      this.displayedStage = "";
      await this.reload();
    });
  }

  renderApprovedXhsPlan(screen, selected) {
    screen.createEl("h3", { text: "小红书图文方案工作台" });
    const xhsDeliverable = selected.workflowState.deliverables.xiaohongshu;
    const inferredSourceMode = xhsDeliverable.sourceMode || (selected.workflowState.source.mainFile ? "saved_article" : "master_brief");
    const sourceRoutes = screen.createDiv({ cls: "reading-capture-creation-platform-switcher reading-capture-creation-xhs-source-routes" });
    [
      ["saved_article", "已保存文章", !!selected.workflowState.source.projectCopy],
      ["master_brief", "当前主简报", !!selected.workflowState.masterBriefVersion],
      ["wechat_final", "本项目定稿公众号文章", !!(selected.workflowState.deliverables.wechat && selected.workflowState.deliverables.wechat.stage === "final" && selected.workflowState.deliverables.wechat.articleVersion)],
    ].forEach(([mode, label, available]) => {
      const button = sourceRoutes.createEl("button", { cls: inferredSourceMode === mode ? "is-active" : "" });
      button.createEl("strong", { text: label });
      button.createEl("small", { text: available ? (inferredSourceMode === mode ? "当前输入来源" : "可切换") : "前置条件未满足" });
      button.disabled = !available || inferredSourceMode === mode;
      if (!button.disabled) button.addEventListener("click", async () => {
        button.disabled = true;
        await this.plugin.selectCreationXhsSource(selected.path, mode);
        await this.reload();
      });
    });
    const source = screen.createDiv({ cls: "reading-capture-creation-source-read" });
    source.createEl("strong", { text: inferredSourceMode === "wechat_final" ? "Agent 使用本项目定稿公众号文章" : inferredSourceMode === "saved_article" ? "Agent 已按需读取所选主文章" : "使用当前已确认主简报" });
    source.createEl("p", { text: inferredSourceMode === "wechat_final" ? "deliverables/wechat/wechat-001/drafts/v1.md" : selected.workflowState.source.mainFile || "当前项目主简报" });
    source.createEl("small", { text: "更换来源是显式操作；这里不会再次要求选择同一篇文章。" });
    const phases = screen.createDiv({ cls: "reading-capture-creation-xhs-phases" });
    ["读取来源", "三套方案", "样张讨论", "整套生成", "双重质检", "人工验收与导出"].forEach((label, index) => {
      const phase = phases.createDiv({ cls: index < 2 ? "is-active" : "" });
      phase.createEl("span", { text: String(index + 1) });
      phase.createEl("strong", { text: label });
    });
    const proposals = screen.createDiv({ cls: "reading-capture-creation-xhs-proposals" });
    const proposalCards = [];
    const generatedProposals = Array.isArray(selected.xhsProposals) ? selected.xhsProposals.slice(0, 3) : [];
    let selectedProposal = generatedProposals[0] ? String(generatedProposals[0].id || generatedProposals[0].name || "proposal-1") : "";
    if (!generatedProposals.length) {
      const waiting = proposals.createDiv({ cls: "reading-capture-creation-empty-copy" });
      waiting.createEl("strong", { text: "三套视觉方案尚未生成" });
      waiting.createEl("p", { text: "方案会由 Keke Social Card 与 Writing Styles 根据当前来源生成；这里不会显示预设模板冒充分析结果。" });
    }
    generatedProposals.forEach((proposal, index) => {
      const id = String(proposal.id || proposal.name || `proposal-${index + 1}`);
      const name = String(proposal.name || `方案 ${String.fromCharCode(65 + index)}`);
      const template = formatCreationProposalField(proposal.template, ["visualSystem", "subTemplate", "template", "ratio"], "模板待补充");
      const palette = formatCreationProposalField(proposal.palette, ["theme", "primary", "secondary", "surface", "accent", "text"], "配色待补充");
      const tradeoff = String(proposal.tradeoff || proposal.pageCountReason || "请查看完整方案中的适用条件与取舍");
      const card = proposals.createDiv({ cls: `reading-capture-creation-xhs-proposal ${index === 0 ? "is-selected" : ""}` });
      card.createEl("strong", { text: name });
      card.createEl("h4", { text: template });
      card.createEl("p", { text: palette });
      if (proposal.pageCount) card.createEl("small", { text: `${proposal.pageCount} 页 · ${proposal.pageCountReason || "页数随内容结构确定"}` });
      card.createEl("small", { text: tradeoff });
      const choose = card.createEl("button", { text: index === 0 ? "当前候选" : "选择并查看完整分页" });
      choose.addEventListener("click", () => {
        selectedProposal = id;
        proposalCards.forEach(({ card: item, button }) => {
          item.removeClass("is-selected");
          button.textContent = "选择并查看完整分页";
        });
        card.addClass("is-selected");
        choose.textContent = "当前候选";
      });
      proposalCards.push({ card, button: choose });
    });
    const plan = screen.createDiv({ cls: "reading-capture-creation-xhs-page-plan" });
    plan.createEl("h3", { text: "完整分页叙事（可直接编辑）" });
    const planEditor = plan.createEl("textarea", { attr: { "aria-label": "小红书完整分页叙事" } });
    planEditor.value = selected.xhsPlan || "方案尚未生成；系统会根据来源结构决定页数，不默认限制为 3–5 页。";
    let hasManualChanges = false;
    const saveManual = plan.createEl("button", { text: "内容有修改后，可保存为用户分页版本" });
    saveManual.disabled = true;
    planEditor.addEventListener("input", () => {
      hasManualChanges = true;
      saveManual.disabled = false;
      if (typeof confirm !== "undefined") confirm.disabled = true;
      revise.disabled = true;
    });
    saveManual.addEventListener("click", async () => {
      saveManual.disabled = true;
      const saved = await this.plugin.saveCreationManualVersion(selected.path, "xhsPlan", planEditor.value);
      await this.plugin.saveCreationPlanDecision(selected.path, "xiaohongshu", { selectedProposal, planVersion: saved.versionId });
      new Notice(`已保存小红书分页方案 ${saved.versionId}。`);
      await this.reload();
    });
    const discussion = screen.createDiv({ cls: "reading-capture-creation-agent-discussion" });
    discussion.createEl("h3", { text: "和 Agent 讨论模板、配色与分页（可选）" });
    const feedback = discussion.createEl("textarea", { attr: { placeholder: "说明只希望改变哪些变量；未提及的模板、配色、页数或页面内容会保持不变。" } });
    const revise = discussion.createEl("button", { text: "填写意见后生成新版方案" });
    revise.disabled = true;
    feedback.addEventListener("input", () => { revise.disabled = hasManualChanges || !String(feedback.value || "").trim(); });
    revise.addEventListener("click", async () => {
      revise.disabled = true;
      await this.plugin.requestCreationRevision(selected.path, "xhsPlan", feedback.value);
      new Notice("已保留当前小红书方案，并创建修订任务。");
      await this.reload();
    });
    const comparison = screen.createDiv({ cls: "reading-capture-creation-sample-comparison" });
    comparison.createEl("h3", { text: "样张比较（可选）" });
    comparison.createEl("p", { text: "可让两到三套方案使用同一封面任务与同一关键内容页，控制变量后再选择。" });
    const sampleChoices = comparison.createDiv({ cls: "reading-capture-creation-sample-choices" });
    const sampleInputs = generatedProposals.map((proposal, index) => {
      const name = String(proposal.name || `方案 ${String.fromCharCode(65 + index)}`);
      const label = sampleChoices.createEl("label", { text: name });
      const input = label.createEl("input", { attr: { type: "checkbox" } });
      input.value = String(proposal.id || proposal.name || `proposal-${index + 1}`);
      input.checked = index < 2;
      return input;
    });
    const sampleTask = (selected.tasks || []).find((item) => item.kind === "xhs.samples" && ["pending", "running", "awaiting_approval"].includes(item.status));
    if (sampleTask && sampleTask.status === "awaiting_approval") {
      comparison.createEl("button", { text: "查看样张与差异记录" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/deliverables/xiaohongshu/xiaohongshu-001/sample-manifest.md`));
      comparison.createEl("button", { text: "保留本轮样张，继续选择最终方案" }).addEventListener("click", async () => {
        await this.plugin.acceptCreationTask(sampleTask);
        await this.reload();
      });
    } else {
      const sampleButton = comparison.createEl("button", { text: sampleTask ? this.plugin.creationTaskStatusLabel(sampleTask.status) : "生成所选方案的封面与关键页样张" });
      sampleButton.disabled = !!sampleTask || generatedProposals.length < 2;
      sampleButton.addEventListener("click", async () => {
        const proposals = sampleInputs.map((input) => input.checked ? input.value : "").filter(Boolean);
        if (proposals.length < 2) {
          new Notice("请至少选择两个方案进行控制变量比较。");
          return;
        }
        sampleButton.disabled = true;
        await this.plugin.saveCreationPlanDecision(selected.path, "xiaohongshu", { selectedProposal, sampleProposals: proposals });
        await this.plugin.queueCreationStageTask(selected.path, "xhs.samples");
        await this.reload();
      });
    }
    const task = (selected.tasks || []).find((item) => item.kind === "xhs.plan" && item.status === "awaiting_approval");
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    gate.createEl("h4", { text: "确认模板、配色和完整分页计划" });
    gate.createEl("p", { text: "确认后才会生成整套卡片与第一版发布文案。" });
    const confirm = gate.createEl("button", { cls: "mod-cta", text: "确认小红书方案，生成完整初版" });
    confirm.disabled = !task || hasManualChanges || !selectedProposal;
    confirm.addEventListener("click", async () => {
      if (!task) return;
      confirm.disabled = true;
      await this.plugin.saveCreationPlanDecision(selected.path, "xiaohongshu", { selectedProposal, planVersion: Object.values(task.outputHashes || {}).find(Boolean) || "current" });
      await this.plugin.acceptCreationTask(task);
      this.displayedStage = "";
      await this.reload();
    });
  }

  renderApprovedDraft(canvas, selected) {
    const isXhs = selected.workflowState.activeDeliverable === "xiaohongshu";
    const screen = canvas.createEl("article", { cls: `reading-capture-creation-screen is-active ${isXhs ? "is-xhs" : "is-wechat"}` });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 06 / CONTENT REVIEW" });
    copy.createEl("h2", { text: isXhs ? "审核卡片初版与发布文案" : "审核公众号正文与质量报告" });
    copy.createEl("p", { text: isXhs ? "卡片和文案分别质检，两个分数都达到 95 后才进入最终视觉验收。" : "可先让 AI 改稿，也可直接人工校对；当前文字版本通过 95 分质量门槛后才能锁定。" });
    head.createEl("span", { cls: "reading-capture-creation-state", text: "内容尚未锁定" });
    if (isXhs) this.renderApprovedXhsDraft(screen, selected);
    else this.renderApprovedWechatDraft(screen, selected);
  }

  renderApprovedWechatDraft(screen, selected) {
    const task = (selected.tasks || []).find((item) => item.kind === "wechat.draft" && item.status === "awaiting_approval");
    const qaTask = (selected.tasks || []).find((item) => item.kind === "wechat.qa" && item.status === "awaiting_approval");
    const failedQaTask = (selected.tasks || []).find((item) => item.kind === "wechat.qa" && ["failed", "waiting_user", "partial"].includes(item.status));
    const layout = screen.createDiv({ cls: "reading-capture-creation-review-layout" });
    const article = layout.createDiv({ cls: "reading-capture-creation-review-document" });
    article.createEl("h3", { text: "完整公众号正文" });
    const editor = article.createEl("textarea", { cls: "reading-capture-creation-content-editor", attr: { "aria-label": "完整公众号正文" } });
    editor.value = selected.wechatDraft || "正文尚未生成；等待 Writing Styles 完成。";
    const editState = article.createEl("p", { cls: "reading-capture-creation-autosave", text: "未修改 · 当前文字版本保留" });
    const saveManual = article.createEl("button", { text: "内容有修改后，可保存为用户正文版本" });
    saveManual.disabled = true;
    const agent = layout.createDiv({ cls: "reading-capture-creation-agent-discussion" });
    agent.createEl("h3", { text: "先让 AI 改稿（可选）" });
    const feedback = agent.createEl("textarea", { attr: { placeholder: "描述希望保留、删除、合并或重排的内容；每次生成新版本，旧版本保留。" } });
    const revise = agent.createEl("button", { text: "填写意见后生成改稿候选" });
    revise.disabled = true;
    let hasManualChanges = false;
    let syncDraftGate = () => {};
    editor.addEventListener("input", () => {
      hasManualChanges = true;
      saveManual.disabled = false;
      revise.disabled = true;
      editState.textContent = "工作草稿将在离开编辑框时自动保存；旧质量检查已不再适用";
      syncDraftGate();
    });
    editor.addEventListener("blur", async () => {
      if (!hasManualChanges) return;
      await this.plugin.saveCreationWorkDraft(selected.path, "wechatDraft", editor.value);
      editState.textContent = "工作草稿已自动保存 · 保存为用户版本后会重新运行质量检查";
    });
    saveManual.addEventListener("click", async () => {
      saveManual.disabled = true;
      const saved = await this.plugin.saveCreationManualVersion(selected.path, "wechatDraft", editor.value);
      new Notice(`已保存公众号正文 ${saved.versionId}，并重新运行质量检查。`);
      await this.reload();
    });
    feedback.addEventListener("input", () => { revise.disabled = hasManualChanges || !String(feedback.value || "").trim(); });
    revise.addEventListener("click", async () => {
      revise.disabled = true;
      await this.plugin.requestCreationRevision(selected.path, "wechatDraft", feedback.value);
      new Notice("已保留当前正文，并创建 AI 改稿任务。");
      await this.reload();
    });
    if (qaTask) {
      const qa = screen.createDiv({ cls: `reading-capture-creation-qa ${qaTask.qualityPassed ? "is-passed" : "is-failed"}` });
      qa.createEl("h3", { text: `Writing Styles 质量检查：${qaTask.qualityScore || 0} / 100` });
      qa.createEl("p", { text: qaTask.qualityPassed ? "当前版本达到 95 分门槛；仍需要完成两项人工确认。" : "未达到 95 分。请查看具体问题后加入 AI 修改意见或手工定位修改。" });
      qa.createEl("button", { text: "查看 L0–L4 完整报告" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/deliverables/wechat/wechat-001/qa.md`));
      if (!qaTask.qualityPassed) {
        const research = qa.createEl("button", { text: "证据不足？返回研究与证据" });
        research.addEventListener("click", async () => {
          research.disabled = true;
          await this.plugin.reopenCreationResearch(selected.path);
          this.displayedStage = "";
          await this.reload();
        });
      }
      const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
      gate.createEl("h4", { text: "锁定当前文字版本" });
      const readLabel = gate.createEl("label", { text: "我已通读当前完整正文" });
      const read = readLabel.createEl("input", { attr: { type: "checkbox" } });
      const proofLabel = gate.createEl("label", { text: "我已完成事实、引用和表达校对" });
      const proof = proofLabel.createEl("input", { attr: { type: "checkbox" } });
      const lock = gate.createEl("button", { cls: "mod-cta", text: "确认文字版本，执行已批准配图计划" });
      lock.disabled = true;
      const sync = () => { lock.disabled = !(qaTask.qualityPassed && !hasManualChanges && read.checked && proof.checked); };
      syncDraftGate = sync;
      read.addEventListener("change", sync);
      proof.addEventListener("change", sync);
      lock.addEventListener("click", async () => {
        lock.disabled = true;
        await this.plugin.acceptCreationTask(qaTask);
        this.displayedStage = "";
        await this.reload();
      });
    } else if (failedQaTask) {
      const gate = screen.createDiv({ cls: "reading-capture-creation-gate is-error" });
      gate.createEl("h4", { text: "质量检查未完成" });
      gate.createEl("p", { text: failedQaTask.error || "Runner 未能生成有效质量报告；正文候选仍然保留。" });
      const retry = gate.createEl("button", { cls: "mod-cta", text: "重新运行质量检查" });
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        await this.plugin.retryCreationTask(failedQaTask);
        await this.reload();
      });
    } else {
      const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
      gate.createEl("h4", { text: task ? "初稿候选已生成" : "等待初稿候选" });
      gate.createEl("p", { text: "接受候选只会启动 Writing Styles 质量检查，不会直接锁定正文。" });
      const review = gate.createEl("button", { cls: "mod-cta", text: "接受当前候选并运行质量检查" });
      review.disabled = !task || hasManualChanges;
      syncDraftGate = () => { review.disabled = !task || hasManualChanges; };
      review.addEventListener("click", async () => {
        if (!task) return;
        review.disabled = true;
        await this.plugin.acceptCreationTask(task);
        await this.reload();
      });
    }
  }

  renderApprovedXhsDraft(screen, selected) {
    const packageTask = (selected.tasks || []).find((item) => item.kind === "xhs.package" && item.status === "awaiting_approval");
    const activePackageTask = (selected.tasks || []).find((item) => item.kind === "xhs.package" && ["pending", "running", "waiting_user", "failed", "partial"].includes(item.status));
    const copyQaTask = (selected.tasks || []).find((item) => item.kind === "xhs.copy-qa" && item.status === "awaiting_approval");
    const cardGroupId = selected.workflowState.deliverables.xiaohongshu && selected.workflowState.deliverables.xiaohongshu.cardGroupId;
    const cardTasks = (selected.tasks || []).filter((item) => item.kind === "xhs.card-page" && (!cardGroupId || item.groupId === cardGroupId));
    const summary = screen.createDiv({ cls: "reading-capture-creation-xhs-review" });
    const cards = summary.createDiv();
    cards.createEl("h3", { text: "卡片组与视觉规则" });
    cards.createEl("p", { text: selected.xhsCardsManifest || "卡片清单尚未生成。" });
    cards.createEl("strong", { text: `视觉分：${packageTask ? packageTask.qualityScore || 0 : selected.workflowState.deliverables.xiaohongshu.visualQaVersion ? "已通过" : "等待"}` });
    if (!packageTask && !copyQaTask && activePackageTask) {
      const execution = screen.createDiv({ cls: "reading-capture-creation-gate" });
      execution.createEl("h4", { text: "正在基于已确认页面执行整套质检" });
      execution.createEl("p", { text: `${this.plugin.creationTaskStatusLabel(activePackageTask.status)}。逐页图片不会被重新生成；完成后会显示发布文案、卡片清单和视觉 QA。` });
      if (activePackageTask.error) execution.createEl("p", { text: activePackageTask.error });
      return;
    }
    if (!packageTask && !copyQaTask && cardTasks.length) {
      const readyCount = cardTasks.filter((item) => ["awaiting_approval", "completed"].includes(item.status)).length;
      cards.createEl("p", { text: `逐页生成：${readyCount}/${cardTasks.length} 页可审核。成功页面会保留，失败页面只重试自身。` });
      const list = screen.createDiv({ cls: "reading-capture-creation-card-page-tasks" });
      cardTasks.sort((left, right) => String(left.childKey || "").localeCompare(String(right.childKey || ""), undefined, { numeric: true })).forEach((child) => {
        const row = list.createDiv({ cls: `reading-capture-creation-visual-child is-${child.status}` });
        const rowCopy = row.createDiv();
        rowCopy.createEl("strong", { text: child.childLabel || child.childKey || "卡片页" });
        rowCopy.createEl("small", { text: `${this.plugin.creationTaskStatusLabel(child.status)} · ${child.skillId}` });
        if (child.error) rowCopy.createEl("p", { text: child.error });
        const actions = row.createDiv();
        const outputPath = Array.isArray(child.outputs) ? child.outputs.find((value) => /\.(png|jpe?g|webp)$/iu.test(value)) : "";
        if (outputPath && ["awaiting_approval", "completed"].includes(child.status)) {
          actions.createEl("button", { text: "打开此页" }).addEventListener("click", () => this.plugin.openCreationProjectFile(outputPath));
        }
        if (outputPath && child.runId && ["failed", "partial", "stale"].includes(child.status)) {
          const relative = outputPath.startsWith(`${selected.directory}/`) ? outputPath.slice(selected.directory.length + 1) : outputPath;
          actions.createEl("button", { text: "查看临时输出" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/runs/${child.runId}/workspace/${relative}`));
        }
        if (["failed", "waiting_user", "partial", "stale"].includes(child.status)) {
          const retry = actions.createEl("button", { text: "仅重试此页" });
          retry.addEventListener("click", async () => {
            retry.disabled = true;
            await this.plugin.retryCreationTask(child);
            await this.reload();
          });
        }
      });
      const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
      gate.createEl("h4", { text: "全部页面生成成功后再启动整套质检" });
      gate.createEl("p", { text: "这一步会接受当前逐页版本，随后只生成发布文案、卡片清单和整套视觉 QA，不会重新覆盖图片。" });
      const startQa = gate.createEl("button", { cls: "mod-cta", text: "确认当前页面集，启动整套视觉与文案质检" });
      startQa.disabled = !cardTasks.every((item) => ["awaiting_approval", "completed"].includes(item.status));
      startQa.addEventListener("click", async () => {
        startQa.disabled = true;
        await this.plugin.acceptXhsCardSetAndQueueQa(selected.path);
        await this.reload();
      });
      return;
    }
    const caption = summary.createDiv();
    caption.createEl("h3", { text: "完整发布文案" });
    const captionEditor = caption.createEl("textarea", { attr: { "aria-label": "小红书完整发布文案" } });
    captionEditor.value = selected.xhsCaption || "发布文案尚未生成。";
    caption.createEl("strong", { text: `文案分：${copyQaTask ? copyQaTask.qualityScore || 0 : "等待"}` });
    const captionState = caption.createEl("p", { cls: "reading-capture-creation-autosave", text: "未修改 · 当前发布文案版本保留" });
    const saveCaption = caption.createEl("button", { text: "内容有修改后，可保存为用户文案版本" });
    saveCaption.disabled = true;
    const discussion = screen.createDiv({ cls: "reading-capture-creation-agent-discussion" });
    discussion.createEl("h3", { text: "让 Agent 调整卡片与发布文案（可选）" });
    const feedback = discussion.createEl("textarea", { attr: { placeholder: "说明要调整的页面、卡片判断或发布文案；旧版本会保留。" } });
    const revise = discussion.createEl("button", { text: "填写意见后生成新版本" });
    revise.disabled = true;
    let hasManualChanges = false;
    let syncXhsGate = () => {};
    captionEditor.addEventListener("input", () => {
      hasManualChanges = true;
      saveCaption.disabled = false;
      revise.disabled = true;
      captionState.textContent = "工作草稿将在离开编辑框时自动保存；旧文案质检已失效";
      syncXhsGate();
    });
    captionEditor.addEventListener("blur", async () => {
      if (!hasManualChanges) return;
      await this.plugin.saveCreationWorkDraft(selected.path, "xhsCaption", captionEditor.value);
      captionState.textContent = "工作草稿已自动保存 · 保存为用户版本后会重新运行文案质检";
    });
    saveCaption.addEventListener("click", async () => {
      saveCaption.disabled = true;
      const saved = await this.plugin.saveCreationManualVersion(selected.path, "xhsCaption", captionEditor.value);
      new Notice(`已保存小红书发布文案 ${saved.versionId}，并重新运行文案质检。`);
      await this.reload();
    });
    feedback.addEventListener("input", () => { revise.disabled = hasManualChanges || !String(feedback.value || "").trim(); });
    revise.addEventListener("click", async () => {
      revise.disabled = true;
      await this.plugin.requestCreationRevision(selected.path, "xhsCaption", feedback.value);
      new Notice("已保留当前卡片与文案，并创建修订任务。");
      await this.reload();
    });
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    if (copyQaTask) {
      gate.createEl("h4", { text: "双重质检完成后进入最终验收" });
      if (!copyQaTask.qualityPassed) {
        gate.createEl("p", { text: `发布文案当前为 ${copyQaTask.qualityScore || 0} 分，未达到 95 分。请在上方手工修改文案，或填写意见让 Agent 生成新版本。` });
      }
      const readLabel = gate.createEl("label", { text: "我已检查完整卡片组、标题、正文与标签" });
      const read = readLabel.createEl("input", { attr: { type: "checkbox" } });
      const next = gate.createEl("button", { cls: "mod-cta", text: "确认双重质检结果，进入小红书最终验收" });
      next.disabled = true;
      const sync = () => { next.disabled = !(read.checked && copyQaTask.qualityPassed && !hasManualChanges); };
      syncXhsGate = sync;
      read.addEventListener("change", sync);
      next.addEventListener("click", async () => {
        next.disabled = true;
        await this.plugin.acceptCreationTask(copyQaTask);
        this.displayedStage = "";
        await this.reload();
      });
    } else {
      gate.createEl("h4", { text: packageTask ? "卡片与文案初版等待审核" : "等待完整初版" });
      gate.createEl("p", { text: "接受视觉初版后会单独运行 Writing Styles 文案质检；不会直接进入下一步。" });
      if (packageTask && !packageTask.qualityPassed) {
        const iteration = Number(packageTask.qualityIterations || 1);
        gate.createEl("p", { text: `视觉规则当前为 ${packageTask.qualityScore || 0} 分，未达到 95 分（第 ${iteration} / 5 轮）。` });
        const iterate = gate.createEl("button", { text: iteration >= 5 ? "已达自动迭代上限，请人工调整方案" : "按质检结果继续自动迭代" });
        iterate.disabled = iteration >= 5;
        iterate.addEventListener("click", async () => {
          iterate.disabled = true;
          await this.plugin.continueCreationQualityIteration(packageTask);
          await this.reload();
        });
      }
      const accept = gate.createEl("button", { cls: "mod-cta", text: "接受视觉初版，运行发布文案质检" });
      accept.disabled = !(packageTask && packageTask.qualityPassed) || hasManualChanges;
      syncXhsGate = () => { accept.disabled = !(packageTask && packageTask.qualityPassed) || hasManualChanges; };
      accept.addEventListener("click", async () => {
        accept.disabled = true;
        await this.plugin.acceptCreationTask(packageTask);
        await this.reload();
      });
    }
  }

  renderApprovedVisual(canvas, selected) {
    const isXhs = selected.workflowState.activeDeliverable === "xiaohongshu";
    const screen = canvas.createEl("article", { cls: `reading-capture-creation-screen is-active ${isXhs ? "is-xhs" : "is-wechat"}` });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: "STAGE 07 / VISUAL ACCEPTANCE" });
    copy.createEl("h2", { text: isXhs ? "小红书最终视觉与文案同步验收" : "验收已批准计划生成的公众号配图" });
    copy.createEl("p", { text: isXhs ? "检查页序、最弱页、封面承诺、中文断行、页脚、品牌署名和文案一致性。" : "逐张查看插入位置、执行 Skill、来源准确性和文章上下文；失败图片可单独重试。" });
    const currentVisualGroup = selected.workflowState.deliverables.wechat && selected.workflowState.deliverables.wechat.visualGroupId;
    const visualTasks = (selected.tasks || []).filter((item) => item.kind === "wechat.visual-item" && (!currentVisualGroup || item.groupId === currentVisualGroup));
    const task = (selected.tasks || []).find((item) => item.kind === "wechat.visual" && item.status === "awaiting_approval");
    const manifest = screen.createDiv({ cls: "reading-capture-creation-visual-manifest" });
    manifest.createEl("h3", { text: isXhs ? "通过双重质检的发布包" : "配图与插入位置清单" });
    manifest.createEl("p", { text: isXhs ? (selected.xhsCardsManifest || "卡片清单等待载入。") : (selected.wechatVisualManifest || "配图任务正在执行或等待 Runner。") });
    const imageFiles = isXhs ? (selected.xhsImageFiles || []) : (selected.wechatVisualFiles || []);
    if (imageFiles.length) {
      const gallery = manifest.createDiv({ cls: "reading-capture-creation-visual-gallery" });
      imageFiles.forEach((file, index) => {
        const item = gallery.createDiv({ cls: "reading-capture-creation-visual-item" });
        item.createEl("span", { text: String(index + 1).padStart(2, "0") });
        const itemCopy = item.createDiv();
        itemCopy.createEl("strong", { text: file.name });
        itemCopy.createEl("small", { text: isXhs ? "检查页序、断行、页脚和文案一致性" : "检查插入位置、来源准确性和上下文" });
        item.createEl("button", { text: "打开检查" }).addEventListener("click", () => this.plugin.openCreationProjectFile(file.path));
      });
    } else {
      manifest.createEl("p", { cls: "reading-capture-creation-empty-copy", text: "当前还没有可验收的图片文件。" });
    }
    if (!isXhs && visualTasks.length) {
      const execution = screen.createEl("details", { cls: "reading-capture-creation-visual-task-details" });
      const completeCount = visualTasks.filter((item) => item.status === "completed").length;
      execution.createEl("summary", { text: `查看任务执行与异常恢复 · ${completeCount}/${visualTasks.length} 完成` });
      const rows = execution.createDiv({ cls: "reading-capture-creation-task-list" });
      visualTasks.sort((left, right) => String(left.childKey || "").localeCompare(String(right.childKey || ""), undefined, { numeric: true })).forEach((child) => {
        const row = rows.createDiv({ cls: `reading-capture-creation-visual-child is-${child.status}` });
        const rowCopy = row.createDiv();
        rowCopy.createEl("strong", { text: child.childLabel || child.childKey || "配图任务" });
        rowCopy.createEl("small", { text: `${child.skillId} · ${this.plugin.creationTaskStatusLabel(child.status)}` });
        if (child.error) rowCopy.createEl("p", { text: child.error });
        const actions = row.createDiv();
        if (["failed", "waiting_user", "partial", "stale"].includes(child.status)) {
          const retry = actions.createEl("button", { text: "仅重试这张图" });
          retry.addEventListener("click", async () => {
            retry.disabled = true;
            await this.plugin.retryCreationTask(child);
            await this.reload();
          });
        }
        if (child.status === "awaiting_approval") {
          const accept = actions.createEl("button", { text: "接受这张图" });
          accept.addEventListener("click", async () => {
            accept.disabled = true;
            await this.plugin.acceptCreationTask(child);
            await this.reload();
          });
        }
      });
    }
    const gate = screen.createDiv({ cls: "reading-capture-creation-gate" });
    const checkLabel = gate.createEl("label", { text: isXhs ? "我已逐页检查视觉和发布文案的一致性" : "我已逐张检查配图、插入位置与正文上下文" });
    const check = checkLabel.createEl("input", { attr: { type: "checkbox" } });
    const confirm = gate.createEl("button", { cls: "mod-cta", text: isXhs ? "确认小红书发布包，进入定稿与导出" : "确认图文整合版本，进入定稿与导出" });
    confirm.disabled = true;
    const childSetComplete = visualTasks.length > 0 && visualTasks.every((item) => item.status === "completed");
    check.addEventListener("change", () => { confirm.disabled = !(check.checked && (isXhs || task || childSetComplete)); });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      if (isXhs) await this.plugin.approveCreationVisualPackage(selected.path, "xiaohongshu");
      else if (visualTasks.length) await this.plugin.approveCreationVisualPackage(selected.path, "wechat");
      else await this.plugin.acceptCreationTask(task);
      this.displayedStage = "";
      await this.reload();
    });
  }

  renderApprovedFinal(canvas, selected) {
    const platform = selected.workflowState.activeDeliverable;
    const isXhs = platform === "xiaohongshu";
    const screen = canvas.createEl("article", { cls: "reading-capture-creation-screen is-active" });
    const head = screen.createDiv({ cls: "reading-capture-creation-screen-head" });
    const copy = head.createDiv();
    copy.createEl("div", { cls: "reading-capture-creation-kicker", text: isXhs ? "STAGE 08 / XIAOHONGSHU FINALIZATION" : "STAGE 08 / FINALIZATION & EXPORT" });
    copy.createEl("h2", { text: isXhs ? "小红书定稿包将复制到独立发布目录" : "定稿不是一个按钮，而是一份可检查的发布包" });
    copy.createEl("p", { text: isXhs
      ? "只复制已确认的卡片集、最终发布文案、来源记录和 QA；试样、旧版本和临时预览不会混入发布目录。"
      : "发布包的文章、图片、来源和 QA 都可见。导出只创建不可变快照，不删除创作项目，也不会自动发布。" });
    head.createEl("span", { cls: "reading-capture-creation-state is-ready", text: isXhs ? "小红书发布候选包 · 全部通过" : "全部检查通过" });
    const target = isXhs ? this.plugin.settings.xiaohongshuPublishingRoot : this.plugin.settings.wechatPublishingRoot;
    const sourceDirectory = `${selected.directory}/deliverables/${isXhs ? "xiaohongshu/xiaohongshu-001" : "wechat/wechat-001"}`;
    const finalImages = isXhs ? (selected.xhsImageFiles || []) : (selected.wechatVisualFiles || []);
    const xhsCardVersionLabel = this.plugin.creationArtifactVersionLabel(selected.workflowState.deliverables.xiaohongshu.cardVersion, "卡片");
    const xhsCaptionVersionLabel = this.plugin.creationArtifactVersionLabel(selected.workflowState.deliverables.xiaohongshu.captionVersion, "文案");
    const metrics = screen.createDiv({ cls: "reading-capture-creation-summary-metrics" });
    const metricValues = isXhs
      ? [[finalImages.length, "最终卡片 PNG"], [1, "最终发布文案"], [2, "来源与素材记录"], [0, "阻塞问题"]]
      : [[1, "定稿文章"], [finalImages.length, "视觉文件"], [1, "来源记录"], [0, "阻塞问题"]];
    for (const [value, label] of metricValues) {
      const metric = metrics.createDiv({ cls: "reading-capture-creation-metric" });
      metric.createEl("strong", { text: String(value) });
      metric.createEl("span", { text: label });
    }
    const packageGrid = screen.createDiv({ cls: "reading-capture-creation-final-grid" });
    const packageCard = packageGrid.createDiv({ cls: "reading-capture-creation-final-card" });
    packageCard.createEl("h3", { text: isXhs ? "小红书发布包内容" : "发布包内容" });
    const packageRows = isXhs
      ? [
        [`images/ · ${finalImages.length} 张`, xhsCardVersionLabel],
        ["xiaohongshu-caption.md", xhsCaptionVersionLabel],
        ["sources.md", "已核验"],
        ["publishing-notes.md", "已记录"],
        ["QA.md", "视觉＋文案通过"],
      ]
      : [
        ["article.md", "通过"],
        [`images/ · ${finalImages.length} 张`, "通过"],
        ["sources.md", "已核验"],
        ["publishing-notes.md", "已记录"],
        ["QA.md", "无阻塞项"],
      ];
    for (const [name, state] of packageRows) {
      const row = packageCard.createDiv({ cls: "reading-capture-creation-qa-row" });
      row.createEl("span", { text: name });
      row.createEl("span", { cls: "is-pass", text: state });
    }
    const checksCard = packageGrid.createDiv({ cls: "reading-capture-creation-final-card" });
    checksCard.createEl("h3", { text: isXhs ? "导出前最后确认" : "最终人工检查" });
    const checkLabels = isXhs
      ? ["8 张卡片顺序与预览一致", "最终发布文案是我要发布的版本", "目录主题名称正确，不包含中间版本"]
      : ["标题、正文和配图均为最终版本", "来源和风险表述已检查", "发布说明和署名信息正确"];
    const checks = checkLabels.map((label) => {
      const row = checksCard.createEl("label", { cls: "reading-capture-creation-final-check" });
      const input = row.createEl("input", { attr: { type: "checkbox" } });
      row.createEl("span", { text: label });
      return input;
    });
    const checkState = checksCard.createEl("p", { cls: "reading-capture-creation-manual-state", text: "完成 3 项检查后才能创建发布快照" });
    const sectionTitle = screen.createDiv({ cls: "reading-capture-creation-section-title" });
    sectionTitle.createEl("h3", { text: isXhs ? "小红书发布目录快照" : "发布目录快照" });
    sectionTitle.createEl("span", { text: "同名目录存在时创建版本后缀，不覆盖原发布包" });
    const directoryName = `${String(this.plugin.now()).slice(0, 10).replace(/-/g, "")}_${this.plugin.sanitizeCreationProjectTitle(selected.title)}`;
    const exportCard = screen.createDiv({ cls: "reading-capture-creation-export-card" });
    const exportCopy = exportCard.createDiv();
    exportCopy.createEl("h3", { text: directoryName });
    exportCopy.createEl("p", { text: isXhs ? "目标：小红书独立发布目录。公众号交付物和目录不会受到影响。" : "目标：微信公众号发布目录。若同名目录已存在，系统会创建版本后缀，不会覆盖。" });
    exportCopy.createEl("div", { cls: "reading-capture-creation-path", text: `${target}/${directoryName}/` });
    if (isXhs) exportCopy.createEl("div", { cls: "reading-capture-creation-branch-note", text: `当前交付物：小红书 · ${xhsCardVersionLabel} · ${xhsCaptionVersionLabel}` });
    const exportActions = exportCard.createDiv({ cls: "reading-capture-creation-export-actions" });
    exportActions.createEl("button", { text: isXhs ? "预览小红书发布包" : "预览发布包" }).addEventListener("click", () => this.plugin.openCreationProjectDirectory(sourceDirectory));
    const latestSnapshot = selected.latestPublication && selected.latestPublication.platform === platform ? selected.latestPublication : null;
    if (latestSnapshot && latestSnapshot.targetDirectory) {
      const exported = screen.createDiv({ cls: "reading-capture-creation-export-result" });
      exported.createEl("strong", { text: "最近一次不可变发布快照" });
      exported.createEl("p", { text: latestSnapshot.targetDirectory });
      exported.createEl("button", { text: "打开发布目录" }).addEventListener("click", () => this.plugin.openCreationProjectDirectory(latestSnapshot.targetDirectory));
      exported.createEl("button", { text: "复制发布路径" }).addEventListener("click", async () => {
        await this.plugin.writeClipboardText(latestSnapshot.targetDirectory);
        new Notice("发布路径已复制。");
      });
      exported.createEl("button", { text: "记录发布与复盘" }).addEventListener("click", () => {
        new CreationPublicationReviewModal(this.app, this.plugin, selected.path, platform, latestSnapshot, async () => this.reload()).open();
      });
    }
    const exportButton = exportActions.createEl("button", { cls: "mod-cta", text: "完成检查后创建快照" });
    exportButton.disabled = true;
    const sync = () => {
      const ready = checks.every((item) => item.checked);
      exportButton.disabled = !ready;
      exportButton.textContent = ready ? (isXhs ? "创建小红书发布快照" : "创建微信公众号发布快照") : "完成检查后创建快照";
      checkState.textContent = ready ? "最终人工检查已完成 · 可以创建不可变快照" : "完成 3 项检查后才能创建发布快照";
    };
    checks.forEach((item) => item.addEventListener("change", sync));
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      const next = await this.plugin.nextCreationExportSuffix(selected.path, platform);
      const complete = async (suffix = "") => {
        const result = await this.plugin.exportCreationDeliverable(selected.path, platform, { suffix });
        new Notice(`发布快照已创建：${result.targetDirectory}`);
        await this.reload();
      };
      if (!next.suffix) {
        await complete("");
        return;
      }
      exportButton.disabled = false;
      new CreationExportConflictModal(this.app, next.conflictDirectory, next.suffix, complete).open();
    });
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
    this.applyReaderDisplaySettings(body);
    this.renderReaderDisplayControls(actions, body);
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

  applyReaderDisplaySettings(body) {
    if (!body || !body.style || typeof body.style.setProperty !== "function") return;
    const fontSize = clampReaderFontSize(this.plugin.settings.readerFontSize);
    const lineHeight = normalizeReaderLineHeight(this.plugin.settings.readerLineHeight);
    body.style.setProperty("--rc-reader-font-size", `${fontSize}px`);
    body.style.setProperty("--rc-reader-line-height", String(lineHeight));
  }

  renderReaderDisplayControls(actions, body) {
    const settings = actions.createDiv({ cls: "reading-capture-reader-settings" });
    const trigger = settings.createEl("button", {
      cls: "reading-capture-reader-settings-trigger",
      text: "Aa",
      attr: { "aria-label": "阅读设置", title: "阅读设置" },
    });
    const panel = settings.createDiv({ cls: "reading-capture-reader-settings-popover is-hidden" });
    panel.createEl("div", { cls: "reading-capture-reader-settings-title", text: "阅读设置" });

    const sizeRow = panel.createDiv({ cls: "reading-capture-reader-settings-row" });
    sizeRow.createEl("span", { cls: "reading-capture-reader-settings-label", text: "字号" });
    const sizeValue = sizeRow.createEl("span", { cls: "reading-capture-reader-settings-value", text: `${clampReaderFontSize(this.plugin.settings.readerFontSize)}px` });

    const sliderRow = panel.createDiv({ cls: "reading-capture-reader-settings-slider-row" });
    const minusButton = sliderRow.createEl("button", { cls: "reading-capture-reader-settings-step", text: "A-" });
    const slider = sliderRow.createEl("input", {
      cls: "reading-capture-reader-settings-slider",
      attr: {
        type: "range",
        min: String(READER_FONT_SIZE_MIN),
        max: String(READER_FONT_SIZE_MAX),
        step: "1",
        value: String(clampReaderFontSize(this.plugin.settings.readerFontSize)),
        "aria-label": "正文字号",
      },
    });
    slider.value = String(clampReaderFontSize(this.plugin.settings.readerFontSize));
    const plusButton = sliderRow.createEl("button", { cls: "reading-capture-reader-settings-step", text: "A+" });

    panel.createEl("div", { cls: "reading-capture-reader-settings-label", text: "行距" });
    const lineHeightRow = panel.createDiv({ cls: "reading-capture-reader-line-height-row" });
    const lineHeightButtons = READER_LINE_HEIGHTS.map((item) => {
      const button = lineHeightRow.createEl("button", { cls: "reading-capture-reader-line-height-option", text: item.label });
      button.dataset.lineHeight = String(item.value);
      return { item, button };
    });

    const resetButton = panel.createEl("button", { cls: "reading-capture-reader-settings-reset", text: "恢复默认" });

    const setPanelOpen = (isOpen) => {
      if (isOpen) panel.removeClass("is-hidden");
      else panel.addClass("is-hidden");
    };
    const updateLineHeightButtons = () => {
      const current = normalizeReaderLineHeight(this.plugin.settings.readerLineHeight);
      lineHeightButtons.forEach(({ item, button }) => {
        if (Math.abs(item.value - current) < 0.01) button.addClass("is-active");
        else button.removeClass("is-active");
      });
    };
    const updateDisplay = async (fontSize, lineHeight = this.plugin.settings.readerLineHeight) => {
      const nextFontSize = clampReaderFontSize(fontSize);
      const nextLineHeight = normalizeReaderLineHeight(lineHeight);
      this.plugin.settings.readerFontSize = nextFontSize;
      this.plugin.settings.readerLineHeight = nextLineHeight;
      slider.value = String(nextFontSize);
      sizeValue.text = `${nextFontSize}px`;
      sizeValue.textContent = `${nextFontSize}px`;
      this.applyReaderDisplaySettings(body);
      updateLineHeightButtons();
      await this.plugin.saveSettings();
    };

    trigger.addEventListener("click", () => {
      const isHidden = panel.classes && typeof panel.classes.has === "function" ? panel.classes.has("is-hidden") : panel.classList.contains("is-hidden");
      setPanelOpen(isHidden);
    });
    slider.addEventListener("input", async (event) => {
      await updateDisplay(event.target && event.target.value ? event.target.value : slider.value);
    });
    minusButton.addEventListener("click", async () => {
      await updateDisplay(clampReaderFontSize(this.plugin.settings.readerFontSize) - 1);
    });
    plusButton.addEventListener("click", async () => {
      await updateDisplay(clampReaderFontSize(this.plugin.settings.readerFontSize) + 1);
    });
    lineHeightButtons.forEach(({ item, button }) => {
      button.addEventListener("click", async () => {
        await updateDisplay(this.plugin.settings.readerFontSize, item.value);
      });
    });
    resetButton.addEventListener("click", async () => {
      await updateDisplay(DEFAULT_SETTINGS.readerFontSize, DEFAULT_SETTINGS.readerLineHeight);
    });

    updateLineHeightButtons();
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
        const capture = await this.plugin.captureForFile(sourceFile, {
          selectedText: "",
          note,
          type: target.type === "highlight-with-note" ? "idea" : target.type,
          heading: target.heading,
        });
        await this.renderKeepingScroll({ annotationId: capture && capture.annotationId });
      },
      { includeTypeSelect: true, onError: (error) => this.plugin.writeDiagnosticEvent("error", "reader-free-thought-save", this.plugin.errorToDiagnostic(error)) }
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
        const capture = await this.plugin.captureForFile(sourceFile, {
          selectedText,
          note,
          type: target.type,
          heading: target.heading,
        });
        await this.renderKeepingScroll({ annotationId: capture && capture.annotationId });
      },
      {
        includeTypeSelect: true,
        previewText: this.plugin.previewSelectedText(selectedText),
        onError: (error) => this.plugin.writeDiagnosticEvent("error", "reader-selection-save", this.plugin.errorToDiagnostic(error)),
      }
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
        const capture = await this.plugin.captureForFile(sourceFile, {
          selectedText: "",
          note,
          type: target.type === "highlight-with-note" ? "image-note" : target.type,
          heading: target.heading,
          media,
        });
        await this.renderKeepingScroll({ annotationId: capture && capture.annotationId });
      },
      {
        includeTypeSelect: true,
        previewText: this.plugin.imagePreviewText(media),
        onError: (error) => this.plugin.writeDiagnosticEvent("error", "reader-image-save", this.plugin.errorToDiagnostic(error)),
      }
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
      ["topic", "灵感"],
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
    if (!annotationId) return false;
    this.activeAnnotationId = annotationId;
    this.containerEl.querySelectorAll(".reading-capture-reader-highlight.is-active").forEach((element) => element.removeClass("is-active"));
    this.containerEl.querySelectorAll(".reading-capture-reader-image-highlight.is-active").forEach((element) => element.removeClass("is-active"));
    this.containerEl.querySelectorAll(".reading-capture-sidebar-card.is-active").forEach((element) => element.removeClass("is-active"));
    const escapedId = this.plugin.cssEscape(annotationId);
    const articleMatches = this.containerEl.querySelectorAll(`.reading-capture-reader-highlight[data-annotation-id="${escapedId}"], .reading-capture-reader-image-highlight[data-annotation-id="${escapedId}"]`);
    articleMatches.forEach((element, index) => {
      element.addClass("is-active");
      if (scrollArticle && index === 0) element.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const card = this.containerEl.querySelector(`.reading-capture-sidebar-card[data-annotation-id="${escapedId}"]`);
    if (card) {
      card.addClass("is-active");
      if (!scrollArticle) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return articleMatches.length > 0;
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
    const topicButton = tools.createEl("button", {
      cls: "reading-capture-topic-entry-button",
      text: CREATIVE_IDEA_SECTION,
      attr: { title: "打开创作灵感工作台" },
    });
    topicButton.addEventListener("click", async () => {
      await this.plugin.openTopicPool();
    });
    const creationButton = tools.createEl("button", {
      cls: "reading-capture-creation-entry-button",
      text: "创作项目",
      attr: { title: "打开创作项目工作台" },
    });
    creationButton.addEventListener("click", async () => {
      await this.plugin.openCreationProjects();
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
      ["topic", "有灵感", count((group) => group.stats.topicCount > 0)],
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
    stats.createEl("span", { text: `灵感 ${selected.stats.topicCount}` });
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
      { key: "topic", label: CREATIVE_IDEA_SECTION, cls: "is-topic" },
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
    if (counts.topic) parts.push(`${counts.topic} 个灵感`);
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
      empty.createEl("span", { text: "可以回到原文，选中文字后记录想法、创作灵感或待核查事实。" });
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

class ReadingCaptureCreationProjectView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.projects = [];
    this.selectedPath = "";
    this.isLoading = false;
    this.isProjectPickerOpen = false;
    this.isRelatedInspirationPickerOpen = false;
    this.autoRefreshTimer = null;
    this.autoRefreshInFlight = false;
  }

  getViewType() {
    return CREATION_PROJECT_VIEW_TYPE;
  }

  getDisplayText() {
    return "创作项目";
  }

  getIcon() {
    return "file-pen-line";
  }

  async onOpen() {
    await this.reload();
    if (typeof setInterval === "function" && !this.autoRefreshTimer) {
      this.autoRefreshTimer = setInterval(() => this.refreshFromRunnerIfNeeded(), 5000);
    }
  }

  onClose() {
    if (this.autoRefreshTimer && typeof clearInterval === "function") clearInterval(this.autoRefreshTimer);
    this.autoRefreshTimer = null;
  }

  async refreshFromRunnerIfNeeded() {
    if (this.isLoading || this.autoRefreshInFlight) return;
    const hasActiveTask = this.projects.some((project) => (project.tasks || []).some((task) => ["pending", "running"].includes(task.status)));
    if (!hasActiveTask) return;
    this.autoRefreshInFlight = true;
    try {
      await this.reload();
    } finally {
      this.autoRefreshInFlight = false;
    }
  }

  async setProject(projectPath) {
    this.selectedPath = normalizePath(projectPath || "");
    await this.reload();
  }

  async reload() {
    this.isLoading = true;
    await this.render();
    try {
      this.projects = await this.plugin.listCreationProjects();
      if (!this.projects.some((project) => project.path === this.selectedPath)) {
        this.selectedPath = this.projects[0] ? this.projects[0].path : "";
      }
    } finally {
      this.isLoading = false;
      await this.render();
    }
  }

  async render() {
    return ReadingCaptureReaderView.prototype.renderCreationWorkbenchPreview.call(this);
  }

  renderApprovedProjectPicker(container) {
    return ReadingCaptureReaderView.prototype.renderApprovedProjectPicker.call(this, container);
  }

  renderCreationTaskAlerts(container, selected) {
    return ReadingCaptureReaderView.prototype.renderCreationTaskAlerts.call(this, container, selected);
  }

  renderApprovedRelations(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedRelations.call(this, container, selected);
  }

  renderApprovedRelatedInspirationPicker(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedRelatedInspirationPicker.call(this, container, selected);
  }

  renderApprovedSourcePicker(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedSourcePicker.call(this, container, selected);
  }

  renderApprovedDiagnosis(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedDiagnosis.call(this, container, selected);
  }

  renderApprovedSupportingPicker(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedSupportingPicker.call(this, container, selected);
  }

  renderApprovedResearch(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedResearch.call(this, container, selected);
  }

  renderApprovedBrief(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedBrief.call(this, container, selected);
  }

  renderApprovedPlan(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedPlan.call(this, container, selected);
  }

  renderApprovedWechatPlan(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedWechatPlan.call(this, container, selected);
  }

  renderApprovedXhsPlan(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedXhsPlan.call(this, container, selected);
  }

  renderApprovedDraft(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedDraft.call(this, container, selected);
  }

  renderApprovedWechatDraft(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedWechatDraft.call(this, container, selected);
  }

  renderApprovedXhsDraft(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedXhsDraft.call(this, container, selected);
  }

  renderApprovedVisual(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedVisual.call(this, container, selected);
  }

  renderApprovedFinal(container, selected) {
    return ReadingCaptureReaderView.prototype.renderApprovedFinal.call(this, container, selected);
  }

  async renderLegacy() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-creation-projects");
    const shell = container.createDiv({ cls: "reading-capture-creation-shell" });
    const hero = shell.createDiv({ cls: "reading-capture-topic-hero" });
    const title = hero.createDiv({ cls: "reading-capture-topic-title" });
    title.createEl("div", { cls: "reading-capture-library-kicker", text: "READING CAPTURE / CREATION WORKFLOW" });
    title.createEl("h1", { text: "创作项目" });
    title.createEl("div", {
      cls: "reading-capture-library-subtitle",
      text: this.isLoading ? "正在读取项目..." : `${this.projects.length} 个项目 · 文件保存在 Obsidian Vault`,
    });
    const tools = hero.createDiv({ cls: "reading-capture-topic-tools" });
    tools.createEl("button", { text: "刷新" }).addEventListener("click", () => this.reload());
    tools.createEl("button", { text: "回到创作灵感" }).addEventListener("click", () => this.plugin.openTopicPool());

    const workspace = shell.createDiv({ cls: "reading-capture-creation-workspace" });
    const list = workspace.createDiv({ cls: "reading-capture-creation-list" });
    const listHead = list.createDiv({ cls: "reading-capture-creation-list-head" });
    const listTitle = listHead.createDiv();
    listTitle.createEl("div", { cls: "reading-capture-library-kicker", text: "PROJECTS" });
    listTitle.createEl("h2", { text: "项目列表" });
    listHead.createEl("span", { cls: "reading-capture-creation-count", text: String(this.projects.length) });
    if (!this.projects.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: this.isLoading ? "正在读取..." : "还没有创作项目。请从“创作灵感”选择一条并点击“开始创作”。" });
    } else {
      const currentProject = this.projects.find((project) => project.path === this.selectedPath) || this.projects[0];
      const current = list.createEl("button", {
        cls: `reading-capture-creation-current ${this.isProjectPickerOpen ? "is-open" : ""}`,
        attr: { type: "button" },
      });
      const currentCopy = current.createDiv({ cls: "reading-capture-creation-current-copy" });
      currentCopy.createEl("span", { cls: "reading-capture-creation-current-label", text: "当前项目" });
      currentCopy.createEl("strong", { text: currentProject.title });
      const currentMeta = current.createDiv({ cls: "reading-capture-creation-card-meta" });
      currentMeta.createEl("span", { cls: "is-platform", text: this.plugin.creationPlatformLabel(currentProject.platform) });
      currentMeta.createEl("span", { cls: "is-status", text: currentProject.statusLabel });
      current.createEl("span", { cls: "reading-capture-creation-current-action", text: this.isProjectPickerOpen ? "收起" : "切换项目" });
      current.addEventListener("click", async () => {
        this.isProjectPickerOpen = !this.isProjectPickerOpen;
        await this.render();
      });

      if (this.isProjectPickerOpen) {
        const picker = list.createDiv({ cls: "reading-capture-creation-picker" });
        const pickerTop = picker.createDiv({ cls: "reading-capture-creation-picker-top" });
        const search = pickerTop.createEl("input", {
          cls: "reading-capture-creation-search",
          attr: { type: "search", placeholder: "搜索项目标题…", "aria-label": "搜索创作项目" },
        });
        const resultCount = pickerTop.createEl("span", { text: `${this.projects.length} 个项目` });
        const options = picker.createDiv({ cls: "reading-capture-creation-options" });
        const optionRows = [];
        for (const project of this.projects) {
          const card = options.createEl("button", {
            cls: `reading-capture-creation-card ${project.path === this.selectedPath ? "is-selected" : ""}`,
            attr: { type: "button" },
          });
          card.createEl("strong", { cls: "reading-capture-creation-card-title", text: project.title });
          const cardMeta = card.createDiv({ cls: "reading-capture-creation-card-meta" });
          cardMeta.createEl("span", { cls: "is-platform", text: this.plugin.creationPlatformLabel(project.platform) });
          cardMeta.createEl("span", { cls: "is-status", text: project.statusLabel });
          card.addEventListener("click", async () => {
            this.selectedPath = project.path;
            this.isProjectPickerOpen = false;
            await this.render();
          });
          optionRows.push({ card, searchText: `${project.title} ${project.statusLabel} ${this.plugin.creationPlatformLabel(project.platform)}`.toLocaleLowerCase() });
        }
        const noResults = options.createDiv({ cls: "reading-capture-creation-no-results is-hidden", text: "没有匹配的项目" });
        search.addEventListener("input", () => {
          const query = String(search.value || "").trim().toLocaleLowerCase();
          let visibleCount = 0;
          for (const row of optionRows) {
            const visible = !query || row.searchText.includes(query);
            row.card.toggleClass("is-filtered-out", !visible);
            if (visible) visibleCount += 1;
          }
          noResults.toggleClass("is-hidden", visibleCount > 0);
          resultCount.textContent = `${visibleCount} / ${this.projects.length}`;
        });
        search.addEventListener("keydown", async (event) => {
          if (event.key !== "Escape") return;
          this.isProjectPickerOpen = false;
          await this.render();
        });
        window.setTimeout(() => search.focus(), 0);
      }
    }

    const detail = workspace.createDiv({ cls: "reading-capture-creation-detail" });
    const selected = this.projects.find((project) => project.path === this.selectedPath);
    if (!selected) {
      detail.createDiv({ cls: "reading-capture-library-empty", text: "选择一个项目查看详情。" });
      return;
    }
    const detailHead = detail.createDiv({ cls: "reading-capture-creation-detail-head" });
    const detailTitle = detailHead.createDiv({ cls: "reading-capture-creation-detail-title" });
    detailTitle.createEl("div", { cls: "reading-capture-library-kicker", text: "CREATION PROJECT" });
    detailTitle.createEl("h2", { text: selected.title });
    const badges = detailHead.createDiv({ cls: "reading-capture-creation-badges" });
    badges.createEl("span", { cls: "is-status", text: selected.statusLabel });
    badges.createEl("span", { text: this.plugin.creationPlatformLabel(selected.platform) });
    badges.createEl("span", { text: "克克风格" });
    const context = detail.createDiv({ cls: "reading-capture-creation-context" });
    this.renderDetailBlock(context, "主灵感", selected.primaryTitle || "尚未记录", "is-primary");
    this.renderDetailBlock(context, "关联灵感", selected.relatedTitles.length ? selected.relatedTitles.join("\n") : "尚未追加关联灵感", "is-related");
    this.renderDetailBlock(detail, "项目位置", selected.directory, "is-path");
    const next = detail.createDiv({ cls: "reading-capture-creation-next" });
    const nextHead = next.createDiv({ cls: "reading-capture-creation-next-head" });
    nextHead.createEl("span", { text: "NEXT" });
    nextHead.createEl("h3", { text: "下一步" });
    const task = selected.latestTask;
    const taskLabel = task ? this.plugin.creationTaskStatusLabel(task.status) : "尚未进入任务队列";
    next.createEl("p", { text: `项目上下文与内容目录已建立。简报与提纲任务：${taskLabel}。` });
    if (task && task.error) next.createEl("p", { cls: "reading-capture-creation-error", text: task.error });
    const actions = detail.createDiv({ cls: "reading-capture-creation-actions" });
    if (!task || ["failed", "cancelled"].includes(task.status)) {
      const queueButton = actions.createEl("button", { cls: "mod-cta", text: task ? "重试生成简报与提纲" : "生成简报与提纲" });
      queueButton.addEventListener("click", async () => {
        queueButton.disabled = true;
        await this.plugin.queueCreationPlanningTask(selected.path);
        await this.reload();
        new Notice("任务已进入 Skill Runner 队列。");
      });
    } else if (task.status === "awaiting_approval") {
      actions.createEl("button", { text: "查看创作简报" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/planning/master-brief.md`));
      actions.createEl("button", { text: "查看内容提纲" }).addEventListener("click", () => this.plugin.openCreationProjectFile(`${selected.directory}/planning/outline.md`));
      const approveButton = actions.createEl("button", { cls: "mod-cta", text: "确认简报与提纲" });
      approveButton.addEventListener("click", async () => {
        approveButton.disabled = true;
        await this.plugin.approveCreationPlanningTask(task);
        await this.reload();
        new Notice("简报与提纲已确认，可以继续生成平台初稿。");
      });
    }
    actions.createEl("button", { text: "打开项目文件" }).addEventListener("click", () => this.plugin.openCreationProjectFile(selected.path));
    actions.createEl("button", { text: "打开项目目录" }).addEventListener("click", () => this.plugin.openCreationProjectDirectory(selected.directory));
  }

  renderDetailBlock(container, title, text, extraClass = "") {
    const block = container.createDiv({ cls: `reading-capture-creation-detail-block ${extraClass}` });
    block.createEl("h3", { text: title });
    block.createEl("p", { text });
  }
}

class ReadingCaptureTopicPoolView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.items = [];
    this.isLoading = false;
    this.selectedId = "";
    this.sourceFilter = "all";
    this.feedbackFilter = "all";
    this.topicSortMode = "workflow";
    this.collapsedTopicFeedbacks = new Set(TOPIC_DEFAULT_COLLAPSED_FEEDBACKS);
    this.topicCardEls = new Map();
    this.topicDetailEl = null;
    this.topicListEl = null;
  }

  getViewType() {
    return TOPIC_POOL_VIEW_TYPE;
  }

  getDisplayText() {
    return CREATIVE_IDEA_SECTION;
  }

  getIcon() {
    return "lightbulb";
  }

  async onOpen() {
    await this.reload();
  }

  async reload(options = {}) {
    const previousListScrollTop = options.preserveListScroll && this.topicListEl ? this.topicListEl.scrollTop : null;
    const previousSelectedId = options.preserveSelectedId || "";
    this.isLoading = true;
    if (!options.skipLoadingRender) await this.render();
    try {
      this.items = this.assignTopicViewIds(await this.plugin.buildTopicPoolItems());
      if (previousSelectedId) this.selectedId = previousSelectedId;
    } finally {
      this.isLoading = false;
      await this.render();
      this.restoreTopicListScroll(previousListScrollTop);
    }
    if (options.notify) new Notice("创作灵感已刷新。");
  }

  assignTopicViewIds(items) {
    const counts = new Map();
    return (items || []).map((item) => {
      const baseId = String((item && item.id) || "topic");
      const occurrence = (counts.get(baseId) || 0) + 1;
      counts.set(baseId, occurrence);
      return Object.assign({}, item, { topicViewId: occurrence === 1 ? baseId : `${baseId}::${occurrence}` });
    });
  }

  topicViewId(item) {
    return String((item && (item.topicViewId || item.id)) || "");
  }

  restoreTopicListScroll(scrollTop) {
    if (!Number.isFinite(scrollTop) || !this.topicListEl) return;
    this.topicListEl.scrollTop = scrollTop;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (this.topicListEl) this.topicListEl.scrollTop = scrollTop;
      });
    }
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("reading-capture-topic-pool");

    const shell = container.createDiv({ cls: "reading-capture-topic-shell" });
    const top = shell.createDiv({ cls: "reading-capture-topic-hero" });
    const title = top.createDiv({ cls: "reading-capture-topic-title" });
    title.createEl("div", { cls: "reading-capture-library-kicker", text: "READING CAPTURE / TOPIC MINER" });
    title.createEl("h1", { text: CREATIVE_IDEA_SECTION });
    title.createEl("div", { cls: "reading-capture-library-subtitle", text: this.isLoading ? "正在整理创作灵感..." : this.summaryText() });
    const tools = top.createDiv({ cls: "reading-capture-topic-tools" });
    const refresh = tools.createEl("button", { attr: { type: "button" }, text: this.isLoading ? "刷新中..." : "刷新" });
    refresh.disabled = this.isLoading;
    refresh.addEventListener("click", () => this.reload({ notify: true }));
    const report = tools.createEl("button", { attr: { type: "button" }, text: "打开今日报告" });
    report.addEventListener("click", () => this.openLatestTopicMinerReport());
    const projects = tools.createEl("button", {
      cls: "reading-capture-topic-projects-button",
      attr: { type: "button", title: "打开创作项目工作台" },
      text: "创作项目",
    });
    projects.addEventListener("click", async () => this.plugin.openCreationProjects());
    const back = tools.createEl("button", { attr: { type: "button" }, text: "回到知见录" });
    back.addEventListener("click", async () => this.plugin.openArticleLibrary());

    const workspace = shell.createDiv({ cls: "reading-capture-topic-workspace" });
    const filters = workspace.createDiv({ cls: "reading-capture-topic-filters" });
    this.renderTopicFilters(filters);

    const main = workspace.createDiv({ cls: "reading-capture-topic-main" });
    const listTop = main.createDiv({ cls: "reading-capture-topic-list-top" });
    listTop.createEl("h2", { text: "候选列表" });
    const listControls = listTop.createDiv({ cls: "reading-capture-topic-list-controls" });
    listControls.createEl("span", { text: `${this.visibleItems().length} 条` });
    const sortSelect = listControls.createEl("select", { cls: "reading-capture-topic-sort-select", attr: { "aria-label": "创作灵感排序方式" } });
    for (const [value, label] of TOPIC_SORT_OPTIONS) {
      const option = sortSelect.createEl("option", { text: label, attr: { value } });
      if (value === this.topicSortMode) option.setAttr("selected", "selected");
    }
    sortSelect.value = this.topicSortMode;
    sortSelect.addEventListener("change", async () => {
      this.topicSortMode = sortSelect.value || "workflow";
      await this.render();
    });
    const list = main.createDiv({ cls: "reading-capture-topic-list" });
    this.topicListEl = list;
    if (this.isLoading && !this.items.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "正在整理创作灵感，请稍等。" });
      return;
    }
    if (!this.items.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "还没有创作灵感。你可以在阅读器里把值得继续写、继续研究的想法加入“创作灵感”。" });
      return;
    }

    const visibleItems = this.visibleItems();
    if (!visibleItems.some((item) => this.topicViewId(item) === this.selectedId)) this.selectedId = visibleItems[0] ? this.topicViewId(visibleItems[0]) : "";
    if (!visibleItems.length) {
      list.createDiv({ cls: "reading-capture-library-empty", text: "当前筛选下没有创作灵感。" });
      this.renderTopicDetail(workspace.createDiv({ cls: "reading-capture-topic-detail" }), null);
      return;
    }

    this.topicCardEls = new Map();
    if (this.shouldGroupTopicItems()) {
      this.renderTopicGroups(list, visibleItems);
    } else {
      this.renderTopicCards(list, visibleItems);
    }
    this.topicDetailEl = workspace.createDiv({ cls: "reading-capture-topic-detail" });
    this.renderTopicDetail(this.topicDetailEl, visibleItems.find((item) => this.topicViewId(item) === this.selectedId) || visibleItems[0]);
  }

  renderTopicGroups(container, items) {
    const groups = new Map();
    for (const item of items) {
      const feedback = this.topicFeedback(item);
      if (!groups.has(feedback)) groups.set(feedback, []);
      groups.get(feedback).push(item);
    }
    for (const feedback of TOPIC_FEEDBACK_OPTIONS) {
      const groupItems = groups.get(feedback) || [];
      if (!groupItems.length) continue;
      const collapsed = this.collapsedTopicFeedbacks.has(feedback);
      const header = container.createEl("button", {
        cls: `reading-capture-topic-group-header ${collapsed ? "is-collapsed" : ""}`,
        attr: { type: "button" },
      });
      const title = header.createDiv({ cls: "reading-capture-topic-group-title" });
      title.createEl("span", { cls: `reading-capture-topic-group-dot ${this.feedbackClass(feedback)}` });
      title.createEl("strong", { text: feedback });
      title.createEl("span", { text: `${groupItems.length}` });
      header.createEl("span", { cls: "reading-capture-topic-group-action", text: collapsed ? "展开" : "收起" });
      header.addEventListener("click", async () => {
        if (collapsed) this.collapsedTopicFeedbacks.delete(feedback);
        else this.collapsedTopicFeedbacks.add(feedback);
        await this.render();
      });
      if (!collapsed) this.renderTopicCards(container, groupItems);
    }
  }

  renderTopicCards(container, items) {
    for (const item of items) {
      this.renderTopicCard(container, item);
    }
  }

  renderTopicCard(container, item) {
    const viewId = this.topicViewId(item);
    const card = container.createDiv({ cls: `reading-capture-topic-card ${viewId === this.selectedId ? "is-selected" : ""} ${item.kind === "ai" ? "is-ai" : "is-manual"}` });
    this.topicCardEls.set(viewId, card);
    card.addEventListener("click", async () => {
      this.selectTopicItem(item);
    });
    const meta = card.createDiv({ cls: "reading-capture-library-card-meta" });
    meta.createEl("span", { cls: item.kind === "ai" ? "is-ai" : "is-manual", text: item.originLabel || (item.kind === "ai" ? "AI 推荐" : "人工灵感") });
    if (item.feedback) meta.createEl("span", { cls: `is-feedback ${this.feedbackClass(item.feedback)}`, text: item.feedback });
    if (item.sourceType) meta.createEl("span", { text: item.sourceType });
    card.createEl("h2", { text: this.itemTitle(item) });
    const summary = item.judgment || item.reason || item.note || item.quote || item.sourceTitle || item.sourcePath || "";
    if (summary) card.createEl("p", { text: this.truncate(summary, 120) });
    const footer = card.createDiv({ cls: "reading-capture-topic-card-footer" });
    footer.createEl("span", { text: item.duplicationRisk ? `重复风险 ${item.duplicationRisk}` : item.sourceTitle || item.reportDate || "" });
    footer.createEl("span", { text: item.firstAction ? "有第一动作" : item.kind === "manual" ? "来自阅读标注" : "等待反馈" });
  }

  selectTopicItem(item) {
    if (!item) return;
    this.selectedId = this.topicViewId(item);
    for (const [id, card] of this.topicCardEls.entries()) {
      if (id === this.selectedId) card.addClass("is-selected");
      else card.removeClass("is-selected");
    }
    if (this.topicDetailEl) {
      this.topicDetailEl.empty();
      this.renderTopicDetail(this.topicDetailEl, item);
    }
  }

  renderTopicFilters(container) {
    this.renderFilterSection(container, "来源", [
      ["all", `全部 ${this.items.length}`],
      ["manual", `人工灵感 ${this.items.filter((item) => item.kind === "manual").length}`],
      ["ai", `AI 推荐 ${this.items.filter((item) => item.kind === "ai").length}`],
    ], this.sourceFilter, async (value) => {
      this.sourceFilter = value;
      await this.render();
    });
    this.renderFilterSection(container, "状态", [
      ["all", `全部 ${this.items.length}`],
      ...TOPIC_FEEDBACK_OPTIONS.map((value) => [value, `${value} ${this.items.filter((item) => (item.feedback || "待定") === value).length}`]),
    ], this.feedbackFilter, async (value) => {
      this.feedbackFilter = value;
      await this.render();
    });
  }

  renderFilterSection(container, title, options, active, onSelect) {
    const section = container.createDiv({ cls: "reading-capture-topic-filter-section" });
    section.createEl("h3", { text: title });
    for (const [value, label] of options) {
      const button = section.createEl("button", { cls: value === active ? "is-active" : "", text: label });
      button.addEventListener("click", () => onSelect(value));
    }
  }

  renderTopicDetail(container, item) {
    if (!item) {
      container.createEl("h2", { text: "当前选题" });
      container.createDiv({ cls: "reading-capture-library-empty", text: "选择一个候选后，可以在这里查看详情和写给 AI 的补充。" });
      return;
    }

    container.createEl("div", { cls: "reading-capture-library-kicker", text: item.kind === "ai" ? `AI 推荐 / ${item.reportDate || "Topic Miner"}` : "人工灵感" });
    const heading = container.createDiv({ cls: "reading-capture-topic-detail-heading" });
    heading.createEl("h2", { text: this.itemTitle(item) });
    heading.createEl("span", { cls: `reading-capture-topic-feedback-pill ${this.feedbackClass(item.feedback || "待定")}`, text: item.feedback || "待定" });

    this.renderDetailBlock(container, "核心判断", this.detailPrimaryText(item));
    if (item.whyNow) this.renderDetailBlock(container, "为什么现在值得写", item.whyNow);
    const sourceSummary = this.sourceSummary(item);
    if (sourceSummary) this.renderDetailBlock(container, "素材来源", sourceSummary);
    if (item.relationship) this.renderDetailBlock(container, "与已发布内容关系", item.relationship);
    if (item.firstAction || item.reason) this.renderDetailBlock(container, "第一动作", item.firstAction || item.reason);

    const feedbackPanel = container.createDiv({ cls: "reading-capture-topic-feedback-panel" });
    feedbackPanel.createEl("h3", { text: "反馈给 AI" });
    feedbackPanel.createEl("p", { cls: "reading-capture-topic-feedback-hint", text: "补充备注不是必填。没有额外想法时，只选状态并保存也可以。" });
    let selectedFeedback = item.feedback || "待定";
    const buttons = feedbackPanel.createDiv({ cls: "reading-capture-topic-feedback-buttons" });
    const buttonEls = [];
    for (const value of TOPIC_FEEDBACK_OPTIONS) {
      const button = buttons.createEl("button", { cls: value === selectedFeedback ? "is-active" : "", text: value });
      button.addEventListener("click", () => {
        selectedFeedback = value;
        for (const itemButton of buttonEls) itemButton.removeClass("is-active");
        button.addClass("is-active");
      });
      buttonEls.push(button);
    }
    const textarea = feedbackPanel.createEl("textarea", {
      cls: "reading-capture-topic-feedback-note",
      attr: { placeholder: "可选：补充你对这个选题的判断、关联文章、扩展方向或搜索建议。" },
    });
    textarea.value = item.feedbackNote || "";
    const save = feedbackPanel.createEl("button", { cls: "reading-capture-topic-save-button", text: "保存给 AI" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = "保存中...";
      try {
        await this.plugin.saveTopicMinerFeedback(item, selectedFeedback, textarea.value);
        if (TOPIC_DEFAULT_COLLAPSED_FEEDBACKS.includes(selectedFeedback)) this.collapsedTopicFeedbacks.delete(selectedFeedback);
        await this.reload({ preserveListScroll: true, preserveSelectedId: item.id, skipLoadingRender: true });
        new Notice("已保存给 Topic Miner 的反馈。");
      } catch (error) {
        save.disabled = false;
        save.textContent = "保存给 AI";
        new Notice(`保存失败：${error && error.message ? error.message : "请稍后重试"}`);
      }
    });

    const actions = container.createDiv({ cls: "reading-capture-topic-detail-actions" });
    const createButton = actions.createEl("button", { cls: "mod-cta", text: "开始创作" });
    createButton.addEventListener("click", async () => this.plugin.startCreationForTopic(item));
    const sourceButton = actions.createEl("button", { text: item.kind === "ai" ? "打开来源文章" : "打开来源" });
    sourceButton.addEventListener("click", async () => this.openItemSource(item));
    const recordButton = actions.createEl("button", { text: item.kind === "ai" ? "打开 Topic Miner 报告" : "阅读记录" });
    recordButton.addEventListener("click", async () => this.openItemRecord(item));
  }

  detailPrimaryText(item) {
    return item.judgment || item.note || item.reason || item.quote || item.sourceTitle || this.itemTitle(item);
  }

  sourceSummary(item) {
    if (Array.isArray(item.sources) && item.sources.length) return item.sources.join("\n");
    return item.sourcePath || item.readingNotePath || "";
  }

  renderDetailBlock(container, title, text) {
    const block = container.createDiv({ cls: "reading-capture-topic-detail-block" });
    block.createEl("h3", { text: title });
    block.createEl("p", { text });
  }

  async openItemSource(item) {
    const sourceReferences = Array.isArray(item.sources) && item.sources.length ? item.sources : [item.sourcePath];
    const sourceFiles = sourceReferences
      .map((sourceReference) => this.plugin.resolveTopicSourceFile(sourceReference))
      .filter(Boolean);
    const readingRoot = normalizePath(this.plugin.settings.readingRoot || DEFAULT_SETTINGS.readingRoot).replace(/\/+$/g, "");
    const file = sourceFiles.find((candidate) => !candidate.path.startsWith(`${readingRoot}/`)) || sourceFiles[0] || null;
    const sourceReference = sourceReferences.find(Boolean) || "";
    if (!file) {
      new Notice(sourceReference ? `找不到来源文章：${sourceReference}` : "这条创作灵感没有可打开的来源文章。");
      return;
    }
    if (sourceKindFromPath(file.path) === "markdown") {
      await this.plugin.openReaderForFile(file);
      return;
    }
    await this.plugin.openFile(file);
  }

  async openItemRecord(item) {
    if (item.kind === "ai") {
      const file = this.plugin.app.vault.getAbstractFileByPath(item.reportPath);
      if (this.plugin.isFile(file)) await this.plugin.openFile(file);
      return;
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(item.readingNotePath);
    await this.plugin.openReadingRecord(this.plugin.isFile(file) ? file : this.plugin.makeFileRef(item.readingNotePath), this.plugin.makeFileRef(item.sourcePath));
  }

  async openLatestTopicMinerReport() {
    const report = (await this.plugin.getTopicMinerReportFiles())[0];
    if (!report) {
      new Notice("还没有找到 Topic Miner 报告。");
      return;
    }
    await this.plugin.openFile(report);
  }

  visibleItems() {
    return this.sortTopicItems(this.items.filter((item) => {
      if (this.sourceFilter !== "all" && item.kind !== this.sourceFilter) return false;
      if (this.feedbackFilter !== "all" && this.topicFeedback(item) !== this.feedbackFilter) return false;
      return true;
    }));
  }

  sortTopicItems(items) {
    const sorted = [...items];
    if (this.topicSortMode === "feedback") {
      return sorted.sort((left, right) => this.compareTopicDates(this.topicFeedbackDate(right), this.topicFeedbackDate(left)) || this.compareTopicDates(this.topicContentDate(right), this.topicContentDate(left)) || this.compareTopicTitles(left, right));
    }
    if (this.topicSortMode === "content") {
      return sorted.sort((left, right) => this.compareTopicDates(this.topicContentDate(right), this.topicContentDate(left)) || this.compareTopicTitles(left, right));
    }
    return sorted.sort((left, right) => {
      const statusOrder = this.topicFeedbackRank(left) - this.topicFeedbackRank(right);
      if (statusOrder !== 0) return statusOrder;
      return this.compareTopicDates(this.topicContentDate(right), this.topicContentDate(left)) || this.compareTopicTitles(left, right);
    });
  }

  shouldGroupTopicItems() {
    return this.topicSortMode === "workflow" && this.feedbackFilter === "all";
  }

  topicFeedback(item) {
    return TOPIC_FEEDBACK_OPTIONS.includes(item && item.feedback) ? item.feedback : "待定";
  }

  topicFeedbackRank(item) {
    const index = TOPIC_FEEDBACK_OPTIONS.indexOf(this.topicFeedback(item));
    return index === -1 ? 0 : index;
  }

  topicContentDate(item) {
    if (this.plugin && typeof this.plugin.topicPoolSortDate === "function") return this.plugin.topicPoolSortDate(item);
    return item && (item.sortDate || item.reportDate || item.updatedAt || item.time) || "";
  }

  topicFeedbackDate(item) {
    return item && (item.feedbackUpdatedAt || item.updatedAt || this.topicContentDate(item)) || "";
  }

  compareTopicDates(left, right) {
    return String(left || "").localeCompare(String(right || ""));
  }

  compareTopicTitles(left, right) {
    return String(this.itemTitle(left)).localeCompare(String(this.itemTitle(right)));
  }

  summaryText() {
    const aiCount = this.items.filter((item) => item.kind === "ai").length;
    const manualCount = this.items.filter((item) => item.kind === "manual").length;
    const reportDate = this.items
      .filter((item) => item.kind === "ai" && item.reportDate)
      .map((item) => item.reportDate)
      .sort()
      .pop();
    return `${manualCount} 条人工灵感 · ${aiCount} 条 AI 推荐${reportDate ? ` · 当前报告 ${reportDate}` : ""}`;
  }

  itemTitle(item) {
    return item.title || item.note || item.quote || "未命名灵感";
  }

  feedbackClass(value) {
    if (value === "想写" || value === "已写") return "is-green";
    if (value === "不要") return "is-red";
    if (value === "暂存") return "is-amber";
    return "is-blue";
  }

  truncate(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
}

module.exports = class ReadingCapturePlugin extends Plugin {
  async onload() {
    try {
      await this.loadSettings();
      await this.writeDiagnosticEvent("info", "plugin-load-start", this.getRuntimeInfo());
      this.registerGlobalErrorHandlers();
      this.addSettingTab(new ReadingCaptureSettingTab(this.app, this));
      this.registerView(READER_VIEW_TYPE, (leaf) => new ReadingCaptureReaderView(leaf, this));
      this.registerView(ARTICLE_LIBRARY_VIEW_TYPE, (leaf) => new ReadingCaptureLibraryView(leaf, this));
      this.registerView(TOPIC_POOL_VIEW_TYPE, (leaf) => new ReadingCaptureTopicPoolView(leaf, this));
      this.registerView(RECORD_VIEW_TYPE, (leaf) => new ReadingCaptureRecordView(leaf, this));
      this.registerView(CREATION_PROJECT_VIEW_TYPE, (leaf) => new ReadingCaptureCreationProjectView(leaf, this));
    } catch (error) {
      await this.writeDiagnosticEvent("error", "plugin-load-failed", this.errorToDiagnostic(error));
      throw error;
    }

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const selectedText = editor.getSelection().trim();
        if (!selectedText || !view || !view.file) return;

        menu.addItem((item) => {
          item
            .setTitle("Reading Capture: 标注选中文本并记录想法")
            .setIcon("highlighter")
            .onClick(() => {
              this.runWithDiagnostics("editor-menu-capture", async () => {
                this.openCaptureModal(view.file, editor, selectedText, this.getSelectionRange(editor));
              });
            });
        });
      })
    );

    this.addCommand({
      id: "open-reader-view",
      name: "打开阅读器视图",
      callback: this.withDiagnostics("open-reader-view", async () => {
        const file = this.app.workspace.getActiveFile();
        if (!this.isFile(file)) {
          new Notice("请先打开一篇 Markdown 文章。");
          return;
        }
        await this.openReaderForFile(file);
      }),
    });

    this.addCommand({
      id: "open-article-library",
      name: "打开知见录",
      callback: this.withDiagnostics("open-article-library", async () => this.openArticleLibrary()),
    });

    this.addCommand({
      id: "open-topic-pool",
      name: "打开创作灵感",
      callback: this.withDiagnostics("open-topic-pool", async () => this.openTopicPool()),
    });

    this.addCommand({
      id: "open-creation-projects",
      name: "打开创作项目",
      callback: this.withDiagnostics("open-creation-projects", async () => this.openCreationProjects()),
    });

    this.addCommand({
      id: "capture-selection-with-note",
      name: "标注选中文本并记录想法",
      callback: this.withDiagnostics("capture-selection-with-note", async () => this.captureSelectionFromActiveContext()),
    });

    this.addCommand({
      id: "quick-highlight-selection",
      name: "快速高亮选中文本",
      callback: this.withDiagnostics("quick-highlight-selection", async () => this.quickHighlightFromActiveContext()),
    });

    this.addCommand({
      id: "capture-current-thought",
      name: "记录当前想法",
      callback: this.withDiagnostics("capture-current-thought", async () => {
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
        new TextInputModal(
          this.app,
          "记录当前想法",
          "这条想法会关联到当前打开的文件。",
          async (note) => {
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
          },
          { onError: (error) => this.writeDiagnosticEvent("error", "current-thought-save", this.errorToDiagnostic(error)) }
        ).open();
      }),
    });

    this.addCommand({
      id: "add-writing-topic",
      name: "加入创作灵感",
      callback: this.withDiagnostics("add-writing-topic", async () => this.captureTypedEntryFromActiveContext("topic")),
    });

    this.addCommand({
      id: "add-fact-check",
      name: "加入事实待核查",
      callback: this.withDiagnostics("add-fact-check", async () => this.captureTypedEntryFromActiveContext("fact-check")),
    });

    this.addCommand({
      id: "open-reading-note",
      name: "打开当前文件的阅读记录",
      callback: this.withDiagnostics("open-reading-note", async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("没有找到当前文件。");
          return;
        }
        const noteFile = await this.getOrCreateReadingNote(file);
        await this.openReadingRecord(noteFile, file);
      }),
    });

    this.addCommand({
      id: "mark-reading-complete",
      name: "标记当前阅读为已完成",
      callback: this.withDiagnostics("mark-reading-complete", async () => {
        const noteFile = await this.resolveCurrentReadingNote();
        if (!noteFile) {
          new Notice("没有找到可标记的阅读记录。");
          return;
        }
        await this.updateReadingStatus(noteFile, "annotated", "pending_summary");
        new Notice("已标记为已完成阅读。");
      }),
    });

    this.addCommand({
      id: "rebuild-reading-index",
      name: "重建阅读索引",
      callback: this.withDiagnostics("rebuild-reading-index", async () => {
        const count = await this.rebuildIndex();
        new Notice(`阅读索引已重建：${count} 条记录。`);
      }),
    });

    this.addCommand({
      id: "export-diagnostic-report",
      name: "导出诊断日志",
      callback: this.withDiagnostics("export-diagnostic-report", async () => this.exportDiagnosticReport()),
    });

    await this.writeDiagnosticEvent("info", "plugin-load-complete", {
      commands: 13,
      views: [READER_VIEW_TYPE, ARTICLE_LIBRARY_VIEW_TYPE, TOPIC_POOL_VIEW_TYPE, RECORD_VIEW_TYPE, CREATION_PROJECT_VIEW_TYPE],
    });
    if (this.isLocalSkillRunnerEnabled()) {
      this.startLocalSkillRunnerWatchdog();
      try {
        await this.startLocalSkillRunner();
      } catch (error) {
        this.setLocalSkillRunnerStatus("error", { message: error.message || String(error) });
        await this.writeDiagnosticEvent("error", "skill-runner-start-failed", this.errorToDiagnostic(error));
      }
    }
  }

  onunload() {
    this.stopLocalSkillRunnerWatchdog();
    if (this.localSkillRunnerProcess && typeof this.localSkillRunnerProcess.unref === "function") this.localSkillRunnerProcess.unref();
    this.localSkillRunnerProcess = null;
  }

  localSkillRunnerPreferenceKey() {
    const vaultName = this.app && this.app.vault && typeof this.app.vault.getName === "function" ? this.app.vault.getName() : "vault";
    return `reading-capture:skill-runner:${vaultName}`;
  }

  localSkillRunnerPidKey() {
    return `${this.localSkillRunnerPreferenceKey()}:pid`;
  }

  localSkillRunnerDeviceKey() {
    return `${this.localSkillRunnerPreferenceKey()}:device-id`;
  }

  localSkillRunnerStatusKey() {
    return `${this.localSkillRunnerPreferenceKey()}:status`;
  }

  setLocalSkillRunnerStatus(state, details = {}) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(this.localSkillRunnerStatusKey(), JSON.stringify({
      state,
      updatedAt: new Date().toISOString(),
      ...details,
    }));
  }

  localSkillRunnerStatus() {
    if (typeof localStorage === "undefined") return { state: "unavailable" };
    try {
      return JSON.parse(localStorage.getItem(this.localSkillRunnerStatusKey()) || "null") || { state: "idle" };
    } catch (error) {
      return { state: "idle" };
    }
  }

  localSkillRunnerDeviceId() {
    if (typeof localStorage === "undefined") throw new Error("当前平台不支持本机 Runner 设备标识");
    const key = this.localSkillRunnerDeviceKey();
    let value = localStorage.getItem(key);
    if (!value) {
      value = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, value);
    }
    return value;
  }

  localSkillRunnerDeviceName() {
    if (typeof process !== "undefined" && process.env) return process.env.COMPUTERNAME || process.env.HOSTNAME || "This Mac";
    return "This Mac";
  }

  localSkillRunnerOwnerPath() {
    return `${this.creationRunnerRoot()}/owner.json`;
  }

  async ensureLocalSkillRunnerOwnership() {
    const ownerPath = this.localSkillRunnerOwnerPath();
    const deviceId = this.localSkillRunnerDeviceId();
    const now = this.now();
    let current = null;
    if (await this.pathExists(ownerPath)) {
      try { current = JSON.parse(await this.readText(ownerPath)); } catch (error) { throw new Error("Runner 设备记录损坏，请先解决 Vault 同步冲突"); }
    }
    if (current && current.state === "active" && current.ownerDeviceId !== deviceId) {
      throw new Error(`另一台电脑（${current.ownerDeviceName || current.ownerDeviceId}）仍是执行设备；请先在原设备关闭 Skill Runner 并等待 Vault 同步`);
    }
    if (current && current.state === "active" && current.ownerDeviceId === deviceId) return current;
    const owner = {
      schemaVersion: 1,
      state: "active",
      ownerDeviceId: deviceId,
      ownerDeviceName: this.localSkillRunnerDeviceName(),
      epoch: Math.max(0, Number(current && current.epoch) || 0) + 1,
      heartbeatAt: now,
      updatedAt: now,
    };
    await this.ensureFolderForPath(ownerPath);
    await this.writeText(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
    return owner;
  }

  async relinquishLocalSkillRunnerOwnership() {
    const ownerPath = this.localSkillRunnerOwnerPath();
    if (!(await this.pathExists(ownerPath))) return null;
    let current;
    try { current = JSON.parse(await this.readText(ownerPath)); } catch (error) { throw new Error("Runner 设备记录损坏，请先解决 Vault 同步冲突"); }
    if (!current || current.ownerDeviceId !== this.localSkillRunnerDeviceId() || current.state !== "active") return current;
    const now = this.now();
    const relinquished = { ...current, state: "relinquished", relinquishedAt: now, heartbeatAt: now, updatedAt: now };
    await this.writeText(ownerPath, `${JSON.stringify(relinquished, null, 2)}\n`);
    return relinquished;
  }

  localSkillRunnerDescription() {
    if (!this.isLocalSkillRunnerEnabled()) return "仅保存在本机，不随 Vault 同步。当前：未启用。";
    const storedPid = typeof localStorage !== "undefined" ? Number(localStorage.getItem(this.localSkillRunnerPidKey())) : 0;
    if (this.isLocalSkillRunnerProcess(storedPid)) return `仅保存在本机，不随 Vault 同步。当前：运行中（PID ${storedPid}）。`;
    const status = this.localSkillRunnerStatus();
    if (status.state === "error" && status.message) return `当前：启动异常，插件会自动重试。${status.message}`;
    if (status.state === "starting") return "当前：正在启动。";
    return "当前：等待自动启动或恢复。";
  }

  isLocalProcessAlive(pid) {
    if (!pid || typeof process === "undefined" || typeof process.kill !== "function") return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  isLocalSkillRunnerProcess(pid) {
    if (!this.isLocalProcessAlive(pid)) return false;
    const command = this.localSkillRunnerProcessCommand(pid);
    if (!command) return false;
    const vault = this.vaultBasePath();
    const runnerPath = this.localSkillRunnerPath(vault);
    return command.includes(runnerPath) && command.includes("--vault") && (!vault || command.includes(vault));
  }

  localSkillRunnerProcessCommand(pid) {
    if (!this.isLocalProcessAlive(pid)) return "";
    try {
      const { execFileSync } = require("child_process");
      if (typeof execFileSync !== "function") return false;
      return String(execFileSync("/bin/ps", ["-p", String(pid), "-o", "command="], {
        encoding: "utf8",
        timeout: 1500,
      }) || "");
    } catch (error) {
      return "";
    }
  }

  isLocalSkillRunnerEnabled() {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(this.localSkillRunnerPreferenceKey()) === "enabled";
  }

  async setLocalSkillRunnerEnabled(enabled) {
    if (typeof localStorage === "undefined") throw new Error("当前平台不支持本机 Runner 设置");
    if (!enabled) {
      localStorage.removeItem(this.localSkillRunnerPreferenceKey());
      this.stopLocalSkillRunnerWatchdog();
      this.stopLocalSkillRunner();
      try { await this.relinquishLocalSkillRunnerOwnership(); } catch (error) {
        this.setLocalSkillRunnerStatus("error", { message: error.message || String(error) });
        new Notice(`Runner 已停止，但设备交接记录写入失败：${error.message || String(error)}`);
      }
      return;
    }
    try {
      await this.ensureLocalSkillRunnerOwnership();
    } catch (error) {
      localStorage.removeItem(this.localSkillRunnerPreferenceKey());
      this.setLocalSkillRunnerStatus("error", { message: error.message || String(error) });
      new Notice(`Skill Runner 无法启用：${error.message || String(error)}`);
      return;
    }
    localStorage.setItem(this.localSkillRunnerPreferenceKey(), "enabled");
    this.startLocalSkillRunnerWatchdog();
    try {
      await this.startLocalSkillRunner();
    } catch (error) {
      this.setLocalSkillRunnerStatus("error", { message: error.message || String(error) });
      new Notice(`Skill Runner 启动失败：${error.message || String(error)}`);
    }
  }

  startLocalSkillRunnerWatchdog() {
    if (this.localSkillRunnerWatchdog || typeof setInterval !== "function") return;
    this.localSkillRunnerWatchdog = setInterval(() => {
      if (!this.isLocalSkillRunnerEnabled() || this.localSkillRunnerStarting) return;
      this.startLocalSkillRunner().catch((error) => {
        this.setLocalSkillRunnerStatus("error", { message: error.message || String(error) });
      });
    }, 15000);
  }

  stopLocalSkillRunnerWatchdog() {
    if (this.localSkillRunnerWatchdog && typeof clearInterval === "function") clearInterval(this.localSkillRunnerWatchdog);
    this.localSkillRunnerWatchdog = null;
  }

  vaultBasePath() {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (adapter && typeof adapter.getBasePath === "function") return adapter.getBasePath();
    if (adapter && typeof adapter.getFullPath === "function") return adapter.getFullPath("");
    return "";
  }

  localNodeExecutable() {
    try {
      const { execFileSync } = require("child_process");
      const resolved = String(execFileSync("/bin/zsh", ["-lc", "command -v node"], {
        encoding: "utf8",
        timeout: 2000,
      }) || "").trim();
      if (resolved.startsWith("/") && !/[\r\n]/u.test(resolved)) return resolved;
    } catch (error) {
      // The actionable error below is shown by the settings toggle.
    }
    throw new Error("找不到本机 Node.js。请先安装 Node.js，或确认登录终端中可以运行 node。");
  }

  localSkillRunnerPath(vault = this.vaultBasePath()) {
    const pluginId = this.manifest && this.manifest.id ? this.manifest.id : "reading-capture";
    if (vault) return `${String(vault).replace(/\/+$/gu, "")}/.obsidian/plugins/${pluginId}/skill-runner.js`;
    if (typeof __dirname !== "undefined") return `${__dirname}/skill-runner.js`;
    return "";
  }

  localSkillRunnerScriptDigest(runnerPath = this.localSkillRunnerPath()) {
    if (!runnerPath) return "";
    try {
      const { readFileSync } = require("fs");
      const { createHash } = require("crypto");
      return createHash("sha256").update(readFileSync(runnerPath)).digest("hex");
    } catch (error) {
      return "";
    }
  }

  localSkillManagerPath(vault = this.vaultBasePath()) {
    const pluginId = this.manifest && this.manifest.id ? this.manifest.id : "reading-capture";
    if (vault) return `${String(vault).replace(/\/+$/gu, "")}/.obsidian/plugins/${pluginId}/skill-manager.js`;
    if (typeof __dirname !== "undefined") return `${__dirname}/skill-manager.js`;
    return "";
  }

  localManagedSkillRuntimePath() {
    const os = require("os");
    return `${os.homedir()}/Library/Application Support/Reading Capture/skill-runtime`;
  }

  localManagedSkillSource(skillId) {
    const os = require("os");
    const sources = {
      "baoyu-infographic": `${os.homedir()}/.agents/skills/baoyu-infographic`,
      "liangkeban-xiaoxiaoke-illustrations": `${os.homedir()}/.codex/skills/ian-xiaohei-illustrations`,
    };
    return sources[skillId] || "";
  }

  async installManagedCreationSkill(task) {
    if (!task || !task.skillRequirement || !task.skillId) throw new Error("任务缺少 Skill 固定版本信息");
    const registered = skillRegistry.resolveRegisteredSkillRequirement(task.skillRequirement);
    const managerPath = this.localSkillManagerPath();
    const nodePath = this.localNodeExecutable();
    if (!managerPath || !nodePath) throw new Error("找不到本机 Skill Manager 或 Node.js");
    const args = [managerPath, "--runtime", this.localManagedSkillRuntimePath(), "--skill-id", task.skillId, "--manifest-digest", registered.manifestDigest, "--device-id", this.localSkillRunnerDeviceId()];
    const localSource = this.localManagedSkillSource(task.skillId);
    if (localSource) args.push("--source", localSource);
    const { execFile } = require("child_process");
    await new Promise((resolve, reject) => {
      execFile(nodePath, args, { timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || stdout || error.message || error).trim()));
        else resolve(stdout);
      });
    });
    return registered;
  }

  localSkillRunnerLogPath() {
    const vaultName = this.app && this.app.vault && typeof this.app.vault.getName === "function" ? this.app.vault.getName() : "vault";
    const safeName = String(vaultName || "vault").replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "vault";
    return `/tmp/reading-capture-skill-runner-${safeName}.log`;
  }

  shellQuote(value) {
    return `'${String(value == null ? "" : value).replace(/'/gu, `'"'"'`)}'`;
  }

  async startLocalSkillRunner() {
    const vault = this.vaultBasePath();
    if (!vault || typeof process === "undefined") throw new Error("无法定位本机 Vault 或插件运行目录");
    const owner = await this.ensureLocalSkillRunnerOwnership();
    const storedPid = typeof localStorage !== "undefined" ? Number(localStorage.getItem(this.localSkillRunnerPidKey())) : 0;
    const runnerPath = this.localSkillRunnerPath(vault);
    const scriptDigest = this.localSkillRunnerScriptDigest(runnerPath);
    if (this.isLocalSkillRunnerProcess(storedPid)) {
      const command = this.localSkillRunnerProcessCommand(storedPid);
      const expectedDevice = `--device-id ${owner.ownerDeviceId}`;
      const expectedEpoch = `--epoch ${owner.epoch}`;
      const previousStatus = this.localSkillRunnerStatus();
      const scriptMatches = !scriptDigest || previousStatus.scriptDigest === scriptDigest;
      if (command.includes(expectedDevice) && command.includes(expectedEpoch) && scriptMatches) {
        this.setLocalSkillRunnerStatus("running", { pid: storedPid, deviceId: owner.ownerDeviceId, epoch: owner.epoch, scriptDigest });
        return;
      }
      try { process.kill(storedPid, "SIGTERM"); } catch (error) { /* Legacy process already exited. */ }
    }
    if (typeof localStorage !== "undefined") localStorage.removeItem(this.localSkillRunnerPidKey());
    if (this.localSkillRunnerProcess && this.isLocalSkillRunnerProcess(this.localSkillRunnerProcess.pid)) return;
    this.localSkillRunnerProcess = null;
    if (this.localSkillRunnerStarting) return;
    const { execFileSync } = require("child_process");
    const nodeExecutable = this.localNodeExecutable();
    const logPath = this.localSkillRunnerLogPath();
    this.localSkillRunnerStopping = false;
    this.localSkillRunnerStarting = true;
    this.setLocalSkillRunnerStatus("starting");
    try {
      const command = [
        "/usr/bin/nohup",
        this.shellQuote(nodeExecutable),
        this.shellQuote(runnerPath),
        "--vault", this.shellQuote(vault),
        "--creation-root", this.shellQuote(this.creationProjectRoot()),
        "--codex", this.shellQuote("codex"),
        "--interval", this.shellQuote("5000"),
        "--device-id", this.shellQuote(owner.ownerDeviceId),
        "--epoch", this.shellQuote(String(owner.epoch)),
        "--skill-runtime", this.shellQuote(this.localManagedSkillRuntimePath()),
        `>> ${this.shellQuote(logPath)} 2>&1 < /dev/null & echo $!`,
      ].join(" ");
      const pid = Number(String(execFileSync("/bin/zsh", ["-lc", command], {
        encoding: "utf8",
        timeout: 5000,
      }) || "").trim());
      if (!Number.isFinite(pid) || pid <= 0) throw new Error("系统没有返回 Skill Runner 的进程编号");
      if (typeof localStorage !== "undefined") localStorage.setItem(this.localSkillRunnerPidKey(), String(pid));
      this.setLocalSkillRunnerStatus("running", { pid, logPath, deviceId: owner.ownerDeviceId, epoch: owner.epoch, scriptDigest });
    } finally {
      this.localSkillRunnerStarting = false;
    }
  }

  stopLocalSkillRunner() {
    this.localSkillRunnerStopping = true;
    const storedPid = typeof localStorage !== "undefined" ? Number(localStorage.getItem(this.localSkillRunnerPidKey())) : 0;
    if (this.isLocalSkillRunnerProcess(storedPid)) {
      try { process.kill(storedPid, "SIGTERM"); } catch (error) { /* Process already exited. */ }
    }
    if (typeof localStorage !== "undefined") localStorage.removeItem(this.localSkillRunnerPidKey());
    this.localSkillRunnerProcess = null;
    this.setLocalSkillRunnerStatus("stopped");
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

  resolveTopicSourceFile(sourceReference) {
    const sourcePath = this.normalizeTopicSourceReference(sourceReference);
    if (!sourcePath) return null;
    const exactFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (this.isFile(exactFile)) return exactFile;

    const candidates = this.getVaultFiles()
      .filter((file) => this.isLibraryCandidate(file) && normalizePath(file.path).startsWith(`${sourcePath}/`))
      .sort((left, right) => {
        const priority = this.articleVersionRank(left.name) - this.articleVersionRank(right.name);
        return priority || left.path.localeCompare(right.path);
      });
    return candidates[0] || null;
  }

  normalizeTopicSourceReference(value) {
    let source = String(value || "").trim();
    const wikiLink = source.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
    const markdownLink = source.match(/^\[[^\]]*\]\(([^)]+)\)$/);
    if (wikiLink) source = wikiLink[1];
    else if (markdownLink) source = markdownLink[1];
    return normalizePath(source).replace(/\/+$/g, "");
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

  async openCreationProjects(projectPath = "") {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: CREATION_PROJECT_VIEW_TYPE,
      active: true,
    });
    const view = leaf.view;
    if (view && typeof view.setProject === "function") await view.setProject(projectPath);
  }

  async startCreationForTopic(item) {
    const projects = await this.listCreationProjects();
    new CreationProjectModal(this.app, this, item, projects).open();
  }

  creationProjectRoot() {
    return normalizePath(this.settings.creationProjectRoot || DEFAULT_SETTINGS.creationProjectRoot).replace(/\/+$/g, "");
  }

  creationIdeaTitle(item) {
    return String((item && (item.title || item.note || item.judgment || item.quote)) || "未命名创作主题").replace(/\s+/g, " ").trim();
  }

  creationPlatformLabel(platform) {
    const matched = CREATION_PLATFORM_OPTIONS.find(([value]) => value === platform);
    return matched ? matched[1] : "待确认内容形态";
  }

  creationStageLabel(stage) {
    const matched = creationWorkflow.WORKFLOW_STAGES.find((item) => item.id === stage);
    return matched ? matched.label : String(stage || "未知阶段");
  }

  creationWorkflowStatusLabel(workflowState, latestPublication = null) {
    const state = workflowState || {};
    const platform = state.activeDeliverable || "wechat";
    if (state.currentStage === "final" && latestPublication && latestPublication.platform === platform) return "已创建发布快照";
    return this.creationStageLabel(state.currentStage || "relations");
  }

  searchCreationSourceMetadata(query = "", options = {}) {
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 50));
    const offset = Math.max(0, Number(options.offset) || 0);
    const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
    const roots = this.getArticleLibraryRoots();
    const items = this.getVaultFiles()
      .filter((file) => this.isLibraryCandidate(file) && !this.isExcludedLibraryPath(file.path))
      .filter((file) => roots.some((root) => file.path === root || file.path.startsWith(`${root}/`)))
      .map((file) => ({
        path: normalizePath(file.path),
        name: file.name,
        title: file.basename || basename(file.name, extname(file.name)),
        kind: sourceKindFromPath(file.path),
        mtime: file.stat && file.stat.mtime ? file.stat.mtime : 0,
        size: file.stat && file.stat.size ? file.stat.size : 0,
      }))
      .filter((item) => !normalizedQuery || `${item.title} ${item.path}`.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path));
    return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
  }

  async startCreationRepurpose(projectPath, sourcePath, platform) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    const normalizedSourcePath = normalizePath(sourcePath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!["wechat", "xiaohongshu"].includes(platform)) throw new Error("不支持的交付平台");
    const sourceFile = this.app.vault.getAbstractFileByPath(normalizedSourcePath);
    if (!this.isFile(sourceFile) || !this.isLibraryCandidate(sourceFile) || this.isExcludedLibraryPath(normalizedSourcePath)) throw new Error("所选文件不是可读取的 Markdown 或 PDF 来源");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const extension = extname(sourceFile.name).toLowerCase() || ".md";
    const projectCopyRelative = `sources/primary${extension}`;
    const projectCopy = `${directory}/${projectCopyRelative}`;
    await this.ensureFolder(`${directory}/sources`);
    const adapter = this.app.vault.adapter;
    if (extension === ".pdf" && typeof adapter.readBinary === "function" && typeof adapter.writeBinary === "function") {
      await adapter.writeBinary(projectCopy, await adapter.readBinary(normalizedSourcePath));
    } else {
      await this.writeText(projectCopy, await this.readText(normalizedSourcePath));
    }
    let state = creationWorkflow.startRepurposeWorkflow(await this.loadCreationWorkflowState(directory), platform);
    state = creationWorkflow.selectRepurposeSource(state, {
      path: normalizedSourcePath,
      projectCopy: projectCopyRelative,
      readVersion: `mtime:${sourceFile.stat && sourceFile.stat.mtime ? sourceFile.stat.mtime : 0}:size:${sourceFile.stat && sourceFile.stat.size ? sourceFile.stat.size : 0}`,
    });
    if (platform === "xiaohongshu") {
      state = creationWorkflow.recordDeliverableVersions(state, "xiaohongshu", { sourceMode: "saved_article", sourceVersion: state.source.readVersion });
    }
    await this.saveCreationWorkflowState(directory, state);
    if (platform === "wechat") {
      await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/drafts`);
      await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/visuals`);
    } else {
      await this.ensureFolder(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/images`);
    }
    let markdown = await this.readText(normalizedProjectPath);
    markdown = this.replaceFrontmatterValue(markdown, "platform", platform);
    markdown = this.replaceFrontmatterValue(markdown, "status", "platform-plan");
    await this.writeText(normalizedProjectPath, this.touchFrontmatter(markdown));
    await this.queueCreationStageTask(normalizedProjectPath, platform === "wechat" ? "wechat.plan" : "xhs.plan");
    return state;
  }

  async addCreationSupportingSource(projectPath, sourcePath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    const normalizedSourcePath = normalizePath(sourcePath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const sourceFile = this.app.vault.getAbstractFileByPath(normalizedSourcePath);
    if (!this.isFile(sourceFile) || !this.isLibraryCandidate(sourceFile) || this.isExcludedLibraryPath(normalizedSourcePath)) throw new Error("所选文件不是可读取的 Markdown 或 PDF 来源");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    let state = await this.loadCreationWorkflowState(directory);
    if ((state.source.supportingFiles || []).some((item) => (typeof item === "string" ? item : item.path) === normalizedSourcePath)) return state;
    const safeName = String(sourceFile.name || "supporting.md").replace(/[\\/:*?"<>|]/g, "_");
    const projectCopyRelative = `sources/supporting/${String((state.source.supportingFiles || []).length + 1).padStart(2, "0")}_${safeName}`;
    const projectCopy = `${directory}/${projectCopyRelative}`;
    await this.ensureFolderForPath(projectCopy);
    const extension = extname(sourceFile.name).toLowerCase();
    const adapter = this.app.vault.adapter;
    if (extension === ".pdf" && typeof adapter.readBinary === "function" && typeof adapter.writeBinary === "function") {
      await adapter.writeBinary(projectCopy, await adapter.readBinary(normalizedSourcePath));
    } else {
      await this.writeText(projectCopy, await this.readText(normalizedSourcePath));
    }
    state = {
      ...state,
      source: {
        ...state.source,
        supportingFiles: [...(state.source.supportingFiles || []), { path: normalizedSourcePath, projectCopy: projectCopyRelative, readVersion: `mtime:${sourceFile.stat && sourceFile.stat.mtime ? sourceFile.stat.mtime : 0}` }],
      },
    };
    await this.saveCreationWorkflowState(directory, state);
    const existingMaterial = (await this.pathExists(`${directory}/planning/user-material.md`))
      ? (await this.readText(`${directory}/planning/user-material.md`)).replace(/^# 用户补充材料\s*/u, "").trim()
      : "";
    await this.saveCreationDiagnosisInput(normalizedProjectPath, "material", `${existingMaterial}${existingMaterial ? "\n\n" : ""}- 本地材料：${normalizedSourcePath}\n  - 项目副本：${projectCopyRelative}`);
    return state;
  }

  creationTaskStatusLabel(status) {
    return ({
      pending: "等待本机 Runner",
      running: "正在调用 Writing Styles",
      awaiting_approval: "等待你审核产物",
      completed: "产物已确认",
      waiting_user: "等待你处理",
      partial: "部分任务完成",
      stale: "输入已变化，结果待重做",
      superseded: "已由新版本替代",
      failed: "执行失败",
      cancelled: "已取消",
    })[status] || String(status || "未知状态");
  }

  creationTaskVersionLabel(task) {
    if (!task) return "尚未生成";
    const userVersion = String(task.userVersion || Object.values(task.outputHashes || {}).find((value) => /^user-v\d+$/u.test(String(value))) || "");
    if (userVersion) return `用户修改版 v${userVersion.replace(/^user-v/u, "")}`;
    return `AI 生成版 v${Math.max(1, Number(task.attempts || task.qualityIterations || 1))}`;
  }

  creationArtifactVersionLabel(value, label) {
    const normalized = String(value || "").trim();
    const version = normalized.match(/(?:^|[-_ ])v(\d+)$/iu);
    return version ? `${label} v${version[1]}` : `${label}已确认`;
  }

  sanitizeCreationProjectTitle(value) {
    const cleaned = String(value || "未命名创作主题")
      .replace(/[\\/:*?"<>|#\[\]^]/g, " ")
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (cleaned || "未命名创作主题").slice(0, 64).trim();
  }

  creationProjectId() {
    const time = this.now().replace(/[-:T+]/g, "").slice(0, 14);
    return `${time}_${Math.random().toString(36).slice(2, 6)}`;
  }

  creationInspirationId(item) {
    const raw = String((item && (item.id || item.candidateId || item.sourcePath || item.readingNotePath)) || this.creationIdeaTitle(item));
    const title = this.creationIdeaTitle(item);
    return `${String((item && item.kind) || "idea")}:${raw}:${title}`;
  }

  creationInspirationMarker(item) {
    return `<!-- reading-capture-inspiration:${encodeURIComponent(this.creationInspirationId(item))} -->`;
  }

  creationContextEntry(item, role = "related") {
    const title = this.creationIdeaTitle(item);
    const sources = Array.isArray(item && item.sources) ? item.sources : [item && item.sourcePath, item && item.readingNotePath];
    const sourceLines = sources.filter(Boolean).map((source) => `- ${source}`).join("\n") || "- 暂无明确来源路径";
    const summary = String((item && (item.judgment || item.note || item.reason || item.quote || item.whyNow)) || "").trim();
    return [
      this.creationInspirationMarker(item),
      `## ${role === "primary" ? "主灵感" : "关联灵感"}：${title}`,
      "",
      summary || "（尚未补充核心判断）",
      "",
      "### 来源",
      "",
      sourceLines,
      "",
      `- 灵感 ID：${this.creationInspirationId(item)}`,
      `- 来源类型：${String((item && item.kind) || "idea")}`,
      `- 加入时间：${this.now()}`,
      "",
    ].join("\n");
  }

  renderCreationProjectMarkdown(project) {
    return [
      "---",
      `type: ${JSON.stringify(CREATION_PROJECT_TYPE)}`,
      `project_id: ${JSON.stringify(project.id)}`,
      `title: ${JSON.stringify(project.title)}`,
      `status: ${JSON.stringify("planning")}`,
      `platform: ${JSON.stringify(project.platform)}`,
      `writing_style: ${JSON.stringify(this.settings.defaultWritingStyle || "keke")}`,
      `primary_inspiration_id: ${JSON.stringify(this.creationInspirationId(project.idea))}`,
      "related_inspiration_count: 0",
      `created: ${JSON.stringify(project.createdAt)}`,
      `updated: ${JSON.stringify(project.createdAt)}`,
      "---",
      "",
      `# ${project.title}`,
      "",
      "> 这是 Reading Capture 创建的创作项目主页。素材统一汇入 planning/context.md；后续由 Skill Runner 生成简报、提纲、初稿和视觉内容。",
      "",
      "## 项目状态",
      "",
      "- 当前阶段：策划中",
      `- 首个内容形态：${this.creationPlatformLabel(project.platform)}`,
      "- 默认写作风格：克克",
      "- Skill Runner：尚未执行",
      "",
      "## 项目文件",
      "",
      "- [[planning/context|灵感与素材上下文]]",
      "- [[planning/master-brief|创作简报]]",
      "- [[planning/outline|内容提纲]]",
      "- [[planning/research|研究记录]]",
      "- [[planning/sources|来源索引]]",
      "",
    ].join("\n");
  }

  async createCreationProject(item, options = {}) {
    const title = this.sanitizeCreationProjectTitle(options.title || this.creationIdeaTitle(item));
    const platform = CREATION_PLATFORM_OPTIONS.some(([value]) => value === options.platform) ? options.platform : "wechat";
    const id = this.creationProjectId();
    const directory = normalizePath(`${this.creationProjectRoot()}/${id}_${title}`);
    const project = { id, title, platform, idea: item || {}, createdAt: this.now(), directory, path: `${directory}/project.md` };
    await this.ensureFolder(`${directory}/planning`);
    await this.ensureFolder(`${directory}/runs`);
    await this.ensureFolder(`${directory}/deliverables/${platform}/${platform}-001`);
    if (platform === "wechat") {
      await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/drafts`);
      await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/visuals`);
    } else {
      await this.ensureFolder(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/images`);
    }
    await this.createFileIfMissing(project.path, this.renderCreationProjectMarkdown(project));
    const workflowState = creationWorkflow.createWorkflowState({
      projectId: id,
      title,
      workflowMode: "idea_creation",
      activeDeliverable: platform,
    });
    await this.createFileIfMissing(`${directory}/workflow-state.json`, `${JSON.stringify(workflowState, null, 2)}\n`);
    await this.createFileIfMissing(`${directory}/planning/context.md`, `# 灵感与素材上下文\n\n${this.creationContextEntry(item, "primary")}`);
    await this.createFileIfMissing(`${directory}/planning/master-brief.md`, "# 创作简报\n\n> 等待 Skill Runner 生成，生成后由你确认。\n");
    await this.createFileIfMissing(`${directory}/planning/outline.md`, "# 内容提纲\n\n> 等待 Skill Runner 基于已确认简报生成。\n");
    await this.createFileIfMissing(`${directory}/planning/research.md`, "# 研究记录\n\n> 联网研究和资料整合结果将记录在这里。\n");
    await this.createFileIfMissing(`${directory}/planning/sources.md`, "# 来源索引\n\n> 研究过程中引用的来源将记录在这里。\n");
    await this.createFileIfMissing(`${directory}/planning/diagnosis.md`, "# 选题诊断\n\n> 等待 Skill Runner 分析。\n");
    await this.createFileIfMissing(`${directory}/planning/user-material.md`, "# 用户补充材料\n\n");
    await this.createFileIfMissing(`${directory}/planning/research-request.md`, "# 联网研究指导\n\n");
    await this.createFileIfMissing(`${directory}/artifacts.jsonl`, "");
    await this.createFileIfMissing(`${directory}/approvals.jsonl`, "");
    await this.createFileIfMissing(`${directory}/publication-records.jsonl`, "");
    await this.createFileIfMissing(`${directory}/project-lock.yaml`, "state: idle\nowner: null\nupdated: null\n");
    return project;
  }

  creationRunnerRoot() {
    return `${this.creationProjectRoot()}/_runner`;
  }

  isTopLevelCreationProjectPath(projectPath) {
    const root = this.creationProjectRoot();
    const normalized = normalizePath(String(projectPath || ""));
    if (!normalized.startsWith(`${root}/`) || !normalized.endsWith("/project.md")) return false;
    const relative = normalized.slice(root.length + 1);
    return relative.split("/").length === 2 && !relative.startsWith("_runner/");
  }

  creationTaskId() {
    return `task_${this.creationProjectId()}`;
  }

  async queueCreationPlanningTask(projectPath) {
    // Compatibility for an early hidden view. Never recreate the obsolete
    // combined diagnosis + brief + outline task, because it bypasses review
    // gates. Route the call into the first approved stage contract instead.
    return this.queueCreationStageTask(projectPath, "diagnosis.materials");
  }

  async acceptCreationTask(task) {
    if (!task || !task.taskPath || task.status !== "awaiting_approval") throw new Error("当前任务不在等待确认状态");
    const normalizedProjectPath = normalizePath(task.projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = task.projectDirectory || normalizedProjectPath.slice(0, -"/project.md".length);
    const outputVersion = Object.values(task.outputHashes || {}).find(Boolean) || task.completedAt || this.now();
    const versionFor = (fragment, fallback = outputVersion) => {
      const match = Object.entries(task.outputHashes || {}).find(([outputPath]) => outputPath.includes(fragment));
      return match ? match[1] : fallback;
    };
    if (task.qualityThreshold && (!task.qualityPassed || Number(task.qualityScore) < Number(task.qualityThreshold))) {
      throw new Error(`当前质量分 ${Number(task.qualityScore) || 0}，未达到 ${task.qualityThreshold} 分门槛`);
    }
    let workflowState = await this.loadCreationWorkflowState(directory);
    if (task.kind === "research.evidence") {
      workflowState = creationWorkflow.acceptResearchResult(workflowState, outputVersion);
    } else if (task.kind === "brief.master") {
      workflowState = creationWorkflow.approveMasterBrief(workflowState, outputVersion);
    } else if (task.kind === "wechat.plan") {
      workflowState = creationWorkflow.approvePlatformPlan(workflowState, "wechat", {
        outlineVersion: versionFor("outline.md"),
        illustrationPlanVersion: versionFor("illustration-plan.md"),
      });
    } else if (task.kind === "xhs.plan") {
      workflowState = creationWorkflow.approvePlatformPlan(workflowState, "xiaohongshu", {
        planVersion: versionFor("plan.md"),
        sourceVersion: workflowState.deliverables.xiaohongshu.sourceVersion || workflowState.source.readVersion || workflowState.masterBriefVersion,
      });
    } else if (task.kind === "xhs.samples") {
      workflowState = creationWorkflow.recordDeliverableVersions(workflowState, "xiaohongshu", {
        sampleVersion: versionFor("sample-manifest.md"),
      });
    } else if (task.kind === "wechat.draft") {
      workflowState = creationWorkflow.recordDeliverableVersions(workflowState, "wechat", {
        articleVersion: versionFor("drafts/"),
        taskState: "qa_queued",
      });
    } else if (task.kind === "wechat.qa") {
      workflowState = creationWorkflow.approveContent(workflowState, "wechat", {
        qaVersion: versionFor("qa.md"),
        taskState: "visual_queued",
      });
    } else if (task.kind === "wechat.visual") {
      workflowState = creationWorkflow.approveVisuals(workflowState, "wechat", {
        approvalVersion: versionFor("manifest.md"),
        taskState: "ready_to_export",
      });
    } else if (task.kind === "wechat.visual-item") {
      workflowState = creationWorkflow.recordDeliverableVersions(workflowState, "wechat", {
        taskState: "visual_review",
      });
    } else if (task.kind === "xhs.card-page") {
      workflowState = creationWorkflow.recordDeliverableVersions(workflowState, "xiaohongshu", {
        taskState: "card_pages_review",
      });
    } else if (task.kind === "xhs.package") {
      workflowState = creationWorkflow.recordDeliverableVersions(workflowState, "xiaohongshu", {
        cardVersion: versionFor("cards-manifest.md"),
        captionVersion: versionFor("caption.md"),
        visualQaVersion: versionFor("visual-qa.md"),
        taskState: "copy_qa_queued",
      });
    } else if (task.kind === "xhs.copy-qa") {
      workflowState = creationWorkflow.approveContent(workflowState, "xiaohongshu", {
        captionVersion: versionFor("caption.md"),
        copyQaVersion: versionFor("copy-qa.md"),
        taskState: "human_visual_review",
      });
    } else {
      throw new Error(`当前任务不能通过这个验收入口：${task.kind}`);
    }
    await this.saveCreationWorkflowState(directory, workflowState);
    const artifactVersions = await this.recordAcceptedCreationArtifacts(directory, task);
    const approval = {
      approvalId: `approval_${this.creationProjectId()}`,
      taskId: task.taskId,
      projectId: task.projectId,
      gate: task.kind,
      decision: "accepted",
      artifactVersion: outputVersion,
      artifactVersionIds: artifactVersions.map((record) => record.artifactVersionId),
      createdAt: this.now(),
    };
    const approvalPath = `${directory}/approvals.jsonl`;
    const previous = (await this.pathExists(approvalPath)) ? await this.readText(approvalPath) : "";
    await this.writeText(approvalPath, `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(approval)}\n`);
    const updatedTask = Object.assign({}, task, { status: "completed", approvalId: approval.approvalId, updatedAt: this.now() });
    delete updatedTask.taskPath;
    await this.writeText(task.taskPath, `${JSON.stringify(updatedTask, null, 2)}\n`);
    if (task.kind === "research.evidence") await this.queueCreationStageTask(normalizedProjectPath, "brief.master");
    if (task.kind === "brief.master") {
      const planKind = workflowState.activeDeliverable === "xiaohongshu" ? "xhs.plan" : "wechat.plan";
      await this.queueCreationStageTask(normalizedProjectPath, planKind);
    }
    if (task.kind === "wechat.plan") await this.queueCreationStageTask(normalizedProjectPath, "wechat.draft");
    if (task.kind === "xhs.plan") await this.queueXhsCardTasks(normalizedProjectPath);
    if (task.kind === "wechat.draft") await this.queueCreationStageTask(normalizedProjectPath, "wechat.qa");
    if (task.kind === "wechat.qa") await this.queueWechatVisualTasks(normalizedProjectPath);
    if (task.kind === "xhs.package") await this.queueCreationStageTask(normalizedProjectPath, "xhs.copy-qa");
    return { task: updatedTask, workflowState };
  }

  async recordAcceptedCreationArtifacts(directory, task) {
    const artifactPath = `${directory}/artifacts.jsonl`;
    const previousText = (await this.pathExists(artifactPath)) ? await this.readText(artifactPath) : "";
    const existing = previousText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter(Boolean);
    const appended = [];
    const projectId = String(task.projectId || "project");
    for (const [outputPath, contentHash] of Object.entries(task.outputHashes || {})) {
      if (!contentHash) continue;
      const normalizedOutput = normalizePath(outputPath);
      const relativePath = normalizedOutput.startsWith(`${directory}/`) ? normalizedOutput.slice(directory.length + 1) : normalizedOutput;
      const artifactId = `${projectId}:${task.kind}:${relativePath}`;
      const artifactVersionId = `${artifactId}@${contentHash}`;
      const priorVersions = existing.filter((record) => record.artifactId === artifactId);
      const record = {
        recordType: "artifact_version",
        artifactId,
        artifactVersionId,
        projectId,
        taskId: task.taskId,
        kind: task.kind,
        path: normalizedOutput,
        contentHash,
        dependencyHashes: { ...(task.inputHashes || {}) },
        source: "skill",
        createdAt: task.completedAt || this.now(),
        ...(priorVersions.length ? { supersedesArtifactVersionId: priorVersions[priorVersions.length - 1].artifactVersionId } : {}),
      };
      if (!existing.some((item) => item.artifactVersionId === artifactVersionId)) {
        existing.push(record);
        appended.push(record);
      } else {
        appended.push(existing.find((item) => item.artifactVersionId === artifactVersionId));
      }
    }
    if (appended.some((record) => !previousText.includes(`\"artifactVersionId\":\"${record.artifactVersionId}\"`))) {
      await this.writeText(artifactPath, `${existing.map((record) => JSON.stringify(record)).join("\n")}\n`);
    }
    return appended;
  }

  async acceptCreationResearchResults(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const tasks = (await this.listCreationRunnerTasks()).filter((task) => task.projectPath === normalizedProjectPath && task.kind === "research.evidence" && task.status !== "cancelled");
    if (!tasks.length || tasks.some((task) => task.status !== "awaiting_approval")) throw new Error("需要等待全部研究路线完成后再统一审核");
    const evidenceSections = [];
    const sourceSections = [];
    for (const task of tasks) {
      let evidencePath = (task.outputs || []).find((output) => /\/evidence\.md$/u.test(output));
      let sourcesPath = (task.outputs || []).find((output) => /\/sources\.md$/u.test(output));
      if (tasks.length > 1 && task.runId) {
        const legacyEvidencePath = `${directory}/runs/${task.runId}/workspace/research/evidence.md`;
        const legacySourcesPath = `${directory}/runs/${task.runId}/workspace/research/sources.md`;
        if (await this.pathExists(legacyEvidencePath)) evidencePath = legacyEvidencePath;
        if (await this.pathExists(legacySourcesPath)) sourcesPath = legacySourcesPath;
      }
      if (evidencePath && await this.pathExists(evidencePath)) evidenceSections.push(`## ${task.skillId}\n\n${(await this.readText(evidencePath)).trim()}`);
      if (sourcesPath && await this.pathExists(sourcesPath)) sourceSections.push(`## ${task.skillId}\n\n${(await this.readText(sourcesPath)).trim()}`);
    }
    await this.writeText(`${directory}/research/evidence.md`, `# 研究证据\n\n${evidenceSections.join("\n\n")}\n`);
    await this.writeText(`${directory}/research/sources.md`, `# 研究来源与冲突\n\n${sourceSections.join("\n\n")}\n`);
    const version = tasks.map((task) => `${task.skillId}:${Object.values(task.outputHashes || {}).find(Boolean) || task.completedAt}`).join("|");
    const workflowState = creationWorkflow.acceptResearchResult(await this.loadCreationWorkflowState(directory), version);
    await this.saveCreationWorkflowState(directory, workflowState);
    const approvalPath = `${directory}/approvals.jsonl`;
    let previous = (await this.pathExists(approvalPath)) ? await this.readText(approvalPath) : "";
    for (const task of tasks) {
      const artifactVersions = await this.recordAcceptedCreationArtifacts(directory, task);
      const approval = { approvalId: `approval_${this.creationProjectId()}_${task.skillId}`, taskId: task.taskId, projectId: task.projectId, gate: task.kind, decision: "accepted", artifactVersion: version, artifactVersionIds: artifactVersions.map((record) => record.artifactVersionId), createdAt: this.now() };
      previous = `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(approval)}\n`;
      const updated = Object.assign({}, task, { status: "completed", approvalId: approval.approvalId, updatedAt: this.now() });
      delete updated.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
    await this.writeText(approvalPath, previous);
    await this.queueCreationStageTask(normalizedProjectPath, "brief.master");
    return workflowState;
  }

  normalizeWechatIllustrationItems(value) {
    const items = Array.isArray(value && value.items) ? value.items : [];
    if (!items.length) throw new Error("配图计划没有可执行的逐图任务");
    const seen = new Set();
    return items.map((item, index) => {
      const id = String(item && item.id || `image-${index + 1}`).trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
      if (!id || seen.has(id)) throw new Error("配图计划包含空白或重复的任务 ID");
      seen.add(id);
      const skillId = String(item && item.skillId || "liangkeban-xiaoxiaoke-illustrations");
      if (!["liangkeban-xiaoxiaoke-illustrations", "baoyu-infographic"].includes(skillId)) throw new Error(`配图任务 ${id} 使用了未批准的 Skill`);
      const rawFileName = String(item && item.fileName || `${String(index + 1).padStart(2, "0")}-${id}.png`).replace(/\\/gu, "/");
      const fileName = rawFileName.split("/").pop();
      if (!/^[^/]+\.(png|jpe?g|webp)$/iu.test(fileName)) throw new Error(`配图任务 ${id} 的文件名无效`);
      return {
        id,
        label: String(item && item.label || `配图 ${index + 1}`).trim(),
        skillId,
        fileName,
        insertionAnchor: String(item && item.insertionAnchor || "").trim(),
        sourceAnchor: String(item && item.sourceAnchor || item && item.insertionAnchor || "").trim(),
        purpose: String(item && item.purpose || "").trim(),
        prompt: String(item && item.prompt || "").trim(),
      };
    });
  }

  creationSourceExcerpt(content, anchor) {
    const text = String(content || "");
    const marker = String(anchor || "").trim();
    if (!marker) return text.trim();
    const start = text.indexOf(marker);
    if (start === -1) return "";
    const rest = text.slice(start + marker.length);
    const nextHeading = /\n#{1,6}\s+/u.exec(rest);
    const end = nextHeading ? start + marker.length + nextHeading.index : text.length;
    return text.slice(start, end).trim();
  }

  async queueWechatVisualTasks(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!this.isTopLevelCreationProjectPath(normalizedProjectPath) || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const planRelative = "deliverables/wechat/wechat-001/illustration-plan.json";
    const planPath = `${directory}/${planRelative}`;
    let planText = "";
    let plan;
    if (await this.pathExists(planPath)) {
      planText = await this.readText(planPath);
      try { plan = JSON.parse(planText); } catch (error) { throw new Error("配图计划 JSON 无法解析，不能创建逐图任务"); }
    } else {
      // Compatibility for projects created before structured illustration plans.
      // The single migration task is explicit and can later be replaced by an
      // edited structured plan; new Tasks must always produce the JSON file.
      plan = { schemaVersion: 1, items: [{ id: "legacy-plan", label: "旧版完整配图计划", skillId: "liangkeban-xiaoxiaoke-illustrations", fileName: "01-legacy-plan.png", insertionAnchor: "按 illustration-plan.md 执行" }] };
      planText = `${JSON.stringify(plan, null, 2)}\n`;
      await this.writeText(planPath, planText);
    }
    const items = this.normalizeWechatIllustrationItems(plan);
    const workflowState = await this.loadCreationWorkflowState(directory);
    const articleVersion = workflowState.deliverables.wechat && workflowState.deliverables.wechat.articleVersion || "unknown";
    const draftPath = `${directory}/deliverables/wechat/wechat-001/drafts/v1.md`;
    const draftText = (await this.pathExists(draftPath)) ? await this.readText(draftPath) : "";
    const groupId = `wechat-visual-${crypto.createHash("sha256").update(`${articleVersion}\0${planText}`).digest("hex").slice(0, 16)}`;
    const tasks = [];
    for (const item of items) {
      const requestRelative = `deliverables/wechat/wechat-001/visuals/requests/${item.id}.json`;
      await this.writeText(`${directory}/${requestRelative}`, `${JSON.stringify({
        schemaVersion: 1,
        groupId,
        articleVersion,
        ...item,
        sourceExcerpt: this.creationSourceExcerpt(draftText, item.sourceAnchor || item.insertionAnchor),
      }, null, 2)}\n`);
      tasks.push(await this.queueCreationStageTask(normalizedProjectPath, "wechat.visual-item", {
        skillId: item.skillId,
        childKey: item.id,
        childLabel: item.label,
        dependencyAnchor: item.sourceAnchor || item.insertionAnchor,
        groupId,
        requiredChildCount: items.length,
        inputOverride: [
          "project.md",
          planRelative,
          requestRelative,
        ],
        outputOverride: [
          `deliverables/wechat/wechat-001/visuals/${item.fileName}`,
          `deliverables/wechat/wechat-001/visuals/results/${item.id}.json`,
        ],
      }));
    }
    const referencedState = await this.loadCreationWorkflowState(directory);
    await this.saveCreationWorkflowState(directory, creationWorkflow.recordDeliverableVersions(referencedState, "wechat", {
      taskState: "visual_children_queued",
      visualGroupId: groupId,
    }));
    return tasks;
  }

  normalizeXhsCardPages(proposal) {
    const pages = Array.isArray(proposal && proposal.pages) ? proposal.pages : [];
    if (!pages.length) throw new Error("所选小红书方案没有逐页计划");
    const seen = new Set();
    return pages.map((page, index) => {
      const pageNumber = Number(page && page.page || index + 1);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 99 || seen.has(pageNumber)) throw new Error("小红书方案包含无效或重复页码");
      seen.add(pageNumber);
      return {
        page: pageNumber,
        id: `page-${String(pageNumber).padStart(2, "0")}`,
        fileName: `xhs-${String(pageNumber).padStart(2, "0")}.png`,
        role: String(page && page.role || "内容页"),
        content: String(page && page.content || "").trim(),
        sourceAnchor: String(page && page.sourceAnchor || "").trim(),
        visualEvidence: String(page && page.visualEvidence || "").trim(),
      };
    }).sort((left, right) => left.page - right.page);
  }

  async queueXhsCardTasks(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!this.isTopLevelCreationProjectPath(normalizedProjectPath) || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const rootRelative = "deliverables/xiaohongshu/xiaohongshu-001";
    const proposalsPath = `${directory}/${rootRelative}/proposals.json`;
    const decisionPath = `${directory}/${rootRelative}/plan-decision.json`;
    if (!(await this.pathExists(proposalsPath)) || !(await this.pathExists(decisionPath))) throw new Error("请先生成三套方案并确认其中一套");
    let proposals;
    let decision;
    try {
      proposals = JSON.parse(await this.readText(proposalsPath));
      decision = JSON.parse(await this.readText(decisionPath));
    } catch (error) {
      throw new Error("小红书方案或确认记录无法解析");
    }
    const selectedId = String(decision.selectedProposal || "");
    const proposal = (Array.isArray(proposals.proposals) ? proposals.proposals : []).find((item) => String(item && item.id) === selectedId);
    if (!proposal) throw new Error("已确认的小红书方案不在 proposals.json 中");
    const pages = this.normalizeXhsCardPages(proposal);
    const proposalText = JSON.stringify(proposal);
    const groupId = `xhs-cards-${crypto.createHash("sha256").update(`${decision.planVersion || ""}\0${proposalText}`).digest("hex").slice(0, 16)}`;
    const tasks = [];
    for (const page of pages) {
      const requestRelative = `${rootRelative}/requests/${page.id}.json`;
      await this.writeText(`${directory}/${requestRelative}`, `${JSON.stringify({
        schemaVersion: 1,
        groupId,
        proposalId: selectedId,
        template: proposal.template,
        palette: proposal.palette,
        ...page,
      }, null, 2)}\n`);
      tasks.push(await this.queueCreationStageTask(normalizedProjectPath, "xhs.card-page", {
        skillId: "keke-social-card-skill",
        childKey: page.id,
        childLabel: `第 ${page.page} 页 · ${page.role}`,
        dependencyAnchor: page.sourceAnchor,
        groupId,
        requiredChildCount: pages.length,
        inputOverride: ["project.md", `${rootRelative}/plan.md`, `${rootRelative}/plan-decision.json`, requestRelative],
        outputOverride: [`${rootRelative}/images/${page.fileName}`, `${rootRelative}/results/${page.id}.json`],
      }));
    }
    const state = await this.loadCreationWorkflowState(directory);
    await this.saveCreationWorkflowState(directory, creationWorkflow.recordDeliverableVersions(state, "xiaohongshu", {
      taskState: "card_children_queued",
      cardGroupId: groupId,
    }));
    return tasks;
  }

  async acceptXhsCardSetAndQueueQa(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!this.isTopLevelCreationProjectPath(normalizedProjectPath) || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const state = await this.loadCreationWorkflowState(directory);
    const groupId = state.deliverables.xiaohongshu && state.deliverables.xiaohongshu.cardGroupId;
    const tasks = (await this.listCreationRunnerTasks()).filter((task) => task.projectPath === normalizedProjectPath && task.kind === "xhs.card-page" && (!groupId || task.groupId === groupId));
    if (!tasks.length) throw new Error("当前项目没有逐页卡片任务");
    const incomplete = tasks.filter((task) => !["awaiting_approval", "completed"].includes(task.status));
    if (incomplete.length) throw new Error(`仍有 ${incomplete.length} 页未生成成功，不能启动整套质检`);
    for (const task of tasks.filter((item) => item.status === "awaiting_approval")) await this.acceptCreationTask(task);
    const rootRelative = "deliverables/xiaohongshu/xiaohongshu-001";
    const pageInputs = tasks.flatMap((task) => task.outputs.map((output) => output.slice(directory.length + 1)));
    return this.queueCreationStageTask(normalizedProjectPath, "xhs.package", {
      force: true,
      groupId,
      inputOverride: ["project.md", `${rootRelative}/plan.md`, `${rootRelative}/plan-decision.json`, ...pageInputs],
      outputDirectoriesOverride: [],
    });
  }

  async queueCreationStageTask(projectPath, kind, options = {}) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!this.isTopLevelCreationProjectPath(normalizedProjectPath)) throw new Error("任务只能属于真实创作项目根目录");
    if (!(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const contract = CREATION_STAGE_TASKS[kind];
    if (!contract) throw new Error(`不支持的创作阶段任务：${kind}`);
    if (contract.network && options.networkAuthorized !== true) throw new Error("联网研究任务需要你明确授权联网研究");
    const requestedSkill = String(options.skillId || contract.skillId);
    const allowedSkills = kind === "research.evidence"
      ? ["deep-research-skills", "last30days", "academic-research-suite"]
      : [contract.skillId, ...(kind === "xhs.plan" ? ["writing-styles"] : []), ...(["wechat.visual", "wechat.visual-item"].includes(kind) ? ["baoyu-infographic"] : [])];
    if (!allowedSkills.includes(requestedSkill)) throw new Error(`当前阶段不允许调用 Skill：${requestedSkill}`);
    const runtimePolicy = skillRegistry.skillRuntimePolicy(requestedSkill);
    if (!runtimePolicy.enabled) throw new Error(`当前版本暂不允许自动运行 ${requestedSkill}：${runtimePolicy.reason}`);
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const workflowState = await this.loadCreationWorkflowState(directory);
    const existing = !options.force && (await this.listCreationRunnerTasks()).find((task) => (
      task.projectPath === normalizedProjectPath
      && task.kind === kind
      && (kind !== "research.evidence" || task.skillId === requestedSkill)
      && (!options.childKey || task.childKey === options.childKey)
      && (!options.groupId || task.groupId === options.groupId)
      && ["pending", "running", "awaiting_approval"].includes(task.status)
    ));
    if (existing) return existing;
    if (kind === "research.evidence") {
      const guidance = String(options.researchGuidance || "").trim();
      await this.writeText(`${directory}/planning/research-request.md`, `# 联网研究任务\n\n${guidance || "请根据材料诊断补足关键证据缺口，并记录冲突与限制。"}\n`);
      await this.ensureFolder(`${directory}/research`);
      await this.createFileIfMissing(`${directory}/research/evidence.md`, "# 研究证据\n\n> 等待 Skill Runner 完成。\n");
      await this.createFileIfMissing(`${directory}/research/sources.md`, "# 研究来源\n\n> 等待 Skill Runner 完成。\n");
    }
    const outputRelatives = Array.isArray(options.outputOverride) && options.outputOverride.length
      ? options.outputOverride.map((relative) => normalizePath(String(relative || "")).replace(/^\/+/, ""))
      : kind === "research.evidence"
      ? [`research/routes/${requestedSkill}/evidence.md`, `research/routes/${requestedSkill}/sources.md`]
      : contract.outputs;
    const outputDirectoryRelatives = Array.isArray(options.outputDirectoriesOverride)
      ? options.outputDirectoriesOverride.map((relative) => normalizePath(String(relative || "")).replace(/^\/+/, "")).filter(Boolean)
      : (contract.outputDirectories || []);
    for (const relative of outputRelatives) {
      if (!relative || relative === ".." || relative.startsWith("../") || relative.includes("/../")) throw new Error("任务输出必须位于当前创作项目内");
    }
    for (const relative of outputRelatives) await this.ensureFolderForPath(`${directory}/${relative}`);
    for (const relative of outputDirectoryRelatives) await this.ensureFolder(`${directory}/${relative}`);
    const projectMarkdown = await this.readText(normalizedProjectPath);
    const skillRequirement = skillRegistry.skillRequirement(requestedSkill);
    await this.updateCreationProjectSkillLock(directory, skillRequirement);
    const groupSuffix = options.groupId ? `_${String(options.groupId).replace(/[^a-z0-9]+/gi, "-")}` : "";
    const childSuffix = options.childKey ? `_${String(options.childKey).replace(/[^a-z0-9]+/gi, "-")}` : "";
    const taskId = `${this.creationTaskId()}_${kind.replace(/[^a-z0-9]+/gi, "-")}_${requestedSkill.replace(/[^a-z0-9]+/gi, "-")}${groupSuffix}${childSuffix}`;
    const task = {
      schemaVersion: 2,
      taskId,
      kind,
      executor: "codex",
      skillId: requestedSkill,
      skillRequirement,
      skillProfile: requestedSkill === "writing-styles" ? (this.settings.defaultWritingStyle || "keke") : "default",
      status: "pending",
      approvalPolicy: "manual-output-acceptance",
      projectId: this.readFrontmatterValue(projectMarkdown, "project_id"),
      projectPath: normalizedProjectPath,
      projectDirectory: directory,
      inputs: [...(Array.isArray(options.inputOverride) && options.inputOverride.length
        ? options.inputOverride
        : ((workflowState.workflowMode === "article_repurpose" && ["wechat.plan", "xhs.plan"].includes(kind))
        ? ["project.md", workflowState.source.projectCopy || "sources/primary.md"]
        : contract.inputs)), ...(options.extraInputs || []).map((relative) => {
          const normalized = normalizePath(String(relative || "")).replace(/^\/+/, "");
          if (!normalized || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error("额外输入必须位于当前创作项目内");
          return normalized;
        })].map((relative) => `${directory}/${relative}`),
      outputs: outputRelatives.map((relative) => `${directory}/${relative}`),
      outputDirectories: outputDirectoryRelatives.map((relative) => `${directory}/${relative}`),
      ...(contract.qualityThreshold ? { qualityThreshold: contract.qualityThreshold } : {}),
      network: {
        required: contract.network,
        authorized: contract.network ? options.networkAuthorized === true : false,
        ...(contract.network && options.networkAuthorized === true ? { authorizedAt: this.now() } : {}),
      },
      createdAt: this.now(),
      updatedAt: this.now(),
      attempts: 0,
      error: "",
      ...(options.groupId ? { groupId: String(options.groupId) } : {}),
      ...(options.childKey ? { childKey: String(options.childKey) } : {}),
      ...(options.childLabel ? { childLabel: String(options.childLabel) } : {}),
      ...(options.dependencyAnchor ? { dependencyAnchor: String(options.dependencyAnchor) } : {}),
      ...(options.requiredChildCount ? { requiredChildCount: Number(options.requiredChildCount) } : {}),
    };
    const taskPath = `${this.creationRunnerRoot()}/queue/${taskId}.json`;
    await this.ensureFolderForPath(taskPath);
    await this.writeText(taskPath, `${JSON.stringify(task, null, 2)}\n`);
    const referencedState = await this.loadCreationWorkflowState(directory);
    const taskRefKey = options.childKey
      ? `${kind}:${String(options.groupId || "group")}:${String(options.childKey)}`
      : kind;
    await this.saveCreationWorkflowState(directory, {
      ...referencedState,
      taskRefs: {
        ...(referencedState.taskRefs || {}),
        [taskRefKey]: taskPath,
      },
    });
    if (kind === "research.evidence") {
      const state = await this.loadCreationWorkflowState(directory);
      const skills = [...new Set([...(state.research.skills || []), requestedSkill])];
      await this.saveCreationWorkflowState(directory, creationWorkflow.authorizeResearch(state, { skills }));
    }
    return Object.assign({ taskPath }, task);
  }

  async updateCreationProjectSkillLock(directory, requirement) {
    const lockPath = `${directory}/project-lock.yaml`;
    let current = { schemaVersion: 1, lockVersion: 1, skills: {} };
    if (await this.pathExists(lockPath)) {
      const lockText = await this.readText(lockPath);
      try {
        const parsed = JSON.parse(lockText);
        if (parsed && typeof parsed === "object") current = parsed;
      } catch (error) {
        if (!/^state:\s*idle\s*$/mu.test(lockText) || !/^owner:\s*null\s*$/mu.test(lockText)) {
          throw new Error("project-lock.yaml 无法解析，已停止创建任务以避免覆盖固定版本");
        }
      }
    }
    const previous = current.skills && current.skills[requirement.skillId];
    const changed = previous && previous.manifestDigest !== requirement.manifestDigest;
    const next = {
      ...current,
      schemaVersion: 1,
      lockVersion: Math.max(1, Number(current.lockVersion || 1)) + (changed ? 1 : 0),
      updatedAt: this.now(),
      skills: {
        ...(current.skills || {}),
        [requirement.skillId]: requirement,
      },
    };
    await this.writeText(lockPath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  async listCreationRunnerTasks() {
    const queueRoot = `${this.creationRunnerRoot()}/queue/`;
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    let paths = [];
    if (adapter && typeof adapter.list === "function") {
      try {
        const listed = await adapter.list(queueRoot.replace(/\/$/, ""));
        paths = Array.isArray(listed && listed.files)
          ? listed.files.map((path) => this.resolveAdapterListedPath(queueRoot, path)).filter((path) => path.endsWith(".json"))
          : [];
      } catch (error) {
        paths = [];
      }
    }
    const indexedPaths = this.getVaultFiles()
      .map((file) => normalizePath(file && file.path ? file.path : ""))
      .filter((filePath) => filePath.startsWith(queueRoot) && filePath.endsWith(".json"));
    paths = [...new Set([...paths.map((filePath) => normalizePath(filePath)), ...indexedPaths])];
    const tasks = [];
    for (const taskPath of paths) {
      try {
        // Skill Runner is a separate process. Obsidian can retain the version
        // that was present when the queue file first entered the Vault index,
        // so task state must be read directly from the adapter every time.
        const task = JSON.parse(await this.readFreshText(taskPath));
        if (task && [1, 2].includes(task.schemaVersion) && task.taskId) {
          tasks.push(await this.reconcileCreationTaskRunResult(Object.assign({ taskPath: normalizePath(taskPath) }, task)));
        }
      } catch (error) {
        await this.writeDiagnosticEvent("error", "creation-task-read", { taskPath, error: this.errorToDiagnostic(error) });
      }
    }
    return tasks.sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
      return rightTime - leftTime;
    });
  }

  async reconcileCreationTaskRunResult(task) {
    if (!task || !task.taskId || !task.projectPath || ["awaiting_approval", "completed", "failed", "waiting_user", "partial", "superseded", "cancelled"].includes(task.status)) return task;
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter || typeof adapter.list !== "function") return task;
    const projectPath = normalizePath(task.projectPath);
    if (!projectPath.endsWith("/project.md")) return task;
    const runsRoot = `${projectPath.slice(0, -"/project.md".length)}/runs`;
    try {
      const listed = await adapter.list(runsRoot);
      const prefix = `${runsRoot}/${task.taskId}_attempt-`;
      const directFiles = listed && Array.isArray(listed.files)
        ? listed.files.map((filePath) => this.resolveAdapterListedPath(runsRoot, filePath))
        : [];
      const nestedResults = listed && Array.isArray(listed.folders)
        ? listed.folders.map((folderPath) => `${this.resolveAdapterListedPath(runsRoot, folderPath)}/result.json`)
        : [];
      const results = [...directFiles, ...nestedResults]
        .map((filePath) => normalizePath(filePath))
        .filter((filePath) => filePath.startsWith(prefix) && filePath.endsWith("/result.json"))
        .sort()
        .reverse();
      for (const resultPath of results) {
        const result = JSON.parse(await this.readFreshText(resultPath));
        if (!result || !["awaiting_approval", "completed", "failed", "waiting_user", "partial"].includes(result.status)) continue;
        const runId = resultPath.slice(runsRoot.length + 1, -"/result.json".length);
        return {
          ...task,
          ...result,
          runId,
          updatedAt: result.completedAt || task.updatedAt,
        };
      }
    } catch (error) {
      await this.writeDiagnosticEvent("error", "creation-task-result-read", { taskId: task.taskId, error: this.errorToDiagnostic(error) });
    }
    return task;
  }

  async discoverCreationProjectRunTasks(directory) {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter || typeof adapter.list !== "function") return [];
    const runsRoot = `${normalizePath(directory)}/runs`;
    try {
      const listed = await adapter.list(runsRoot);
      const folders = listed && Array.isArray(listed.folders)
        ? listed.folders.map((folder) => this.resolveAdapterListedPath(runsRoot, folder))
        : [];
      const discovered = [];
      for (const runFolder of folders.sort().reverse()) {
        if (!runFolder.startsWith(`${runsRoot}/`) || !/_attempt-\d+$/u.test(runFolder)) continue;
        try {
          const task = JSON.parse(await this.readFreshText(`${runFolder}/task.json`));
          if (!task || !task.taskId || ![1, 2].includes(task.schemaVersion)) continue;
          let result = {};
          try {
            result = JSON.parse(await this.readFreshText(`${runFolder}/result.json`));
          } catch (error) {
            result = {};
          }
          discovered.push({
            ...task,
            ...result,
            runId: runFolder.slice(runsRoot.length + 1),
            taskPath: `${this.creationRunnerRoot()}/queue/${task.taskId}.json`,
            updatedAt: result.completedAt || task.updatedAt,
          });
        } catch (error) {
          await this.writeDiagnosticEvent("error", "creation-run-history-read", { runFolder, error: this.errorToDiagnostic(error) });
        }
      }
      return discovered.filter((task, index, all) => all.findIndex((item) => item.taskId === task.taskId) === index);
    } catch (error) {
      return [];
    }
  }

  async listCreationMarkdownRunReceipts() {
    const root = `${this.creationProjectRoot()}/`;
    const receipts = [];
    const files = typeof this.app.vault.getMarkdownFiles === "function" ? this.app.vault.getMarkdownFiles() : [];
    for (const file of files) {
      const filePath = normalizePath(file && file.path ? file.path : "");
      if (!filePath.startsWith(root) || !/\/runs\/[^/]+\/receipt\.md$/u.test(filePath)) continue;
      try {
        const markdown = await this.readText(filePath);
        const match = markdown.match(/<!-- reading-capture-run-receipt\s*\n([\s\S]*?)\n-->/u);
        if (!match) continue;
        const receipt = JSON.parse(match[1]);
        if (receipt && receipt.taskId && receipt.projectPath && receipt.kind) {
          receipts.push({ receiptPath: filePath, ...receipt });
        }
      } catch (error) {
        await this.writeDiagnosticEvent("error", "creation-markdown-receipt-read", { filePath, error: this.errorToDiagnostic(error) });
      }
    }
    return receipts.sort((left, right) => (Date.parse(right.updatedAt || right.completedAt || right.failedAt || "") || 0) - (Date.parse(left.updatedAt || left.completedAt || left.failedAt || "") || 0));
  }

  async retryCreationTask(task) {
    if (!task || !task.taskPath || !["failed", "waiting_user", "partial", "stale"].includes(task.status)) throw new Error("当前任务不能重试");
    const updated = { ...task, status: "pending", updatedAt: this.now(), error: "", waitingReason: null, nextAttemptAt: null };
    delete updated.taskPath;
    await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    return updated;
  }

  async markCreationVisualTasksStale(projectPath, platform, reason, taskRecords = null, contentChange = null) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    const visualKinds = platform === "wechat" ? new Set(["wechat.visual", "wechat.visual-item"]) : new Set(["xhs.package", "xhs.card-page"]);
    const tasks = Array.isArray(taskRecords) ? taskRecords : await this.listCreationRunnerTasks();
    const changed = [];
    for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && visualKinds.has(item.kind) && !["cancelled", "superseded", "stale"].includes(item.status))) {
      if (platform === "wechat" && task.kind === "wechat.visual-item" && contentChange) {
        const requestPath = (task.inputs || []).find((value) => /\/visuals\/requests\/[^/]+\.json$/u.test(value));
        if (requestPath && await this.pathExists(requestPath)) {
          try {
            const request = JSON.parse(await this.readText(requestPath));
            const previousExcerpt = request.sourceExcerpt == null
              ? this.creationSourceExcerpt(contentChange.previous, request.sourceAnchor || request.insertionAnchor)
              : String(request.sourceExcerpt);
            const nextExcerpt = this.creationSourceExcerpt(contentChange.next, request.sourceAnchor || request.insertionAnchor);
            if (previousExcerpt && previousExcerpt === nextExcerpt) continue;
          } catch (error) {
            // Invalid dependency metadata fails closed and marks the image stale.
          }
        }
      }
      const updated = { ...task, status: "stale", updatedAt: this.now(), staleReason: String(reason || "上游文字版本发生变化"), error: String(reason || "上游文字版本发生变化") };
      delete updated.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
      changed.push({ ...updated, taskPath: task.taskPath });
    }
    return changed;
  }

  async continueCreationQualityIteration(task) {
    if (!task || !task.taskPath || task.status !== "awaiting_approval" || task.qualityPassed) throw new Error("当前任务不需要继续质量迭代");
    const iteration = Number(task.qualityIterations || 1);
    if (iteration >= 5) throw new Error("已经完成 5 轮自动迭代，请先人工修改或更换方案");
    const superseded = { ...task, status: "superseded", qualityIterations: iteration, updatedAt: this.now(), error: `质量分 ${task.qualityScore || 0} 未达到 ${task.qualityThreshold || 95}` };
    delete superseded.taskPath;
    await this.writeText(task.taskPath, `${JSON.stringify(superseded, null, 2)}\n`);
    const directory = normalizePath(task.projectDirectory || String(task.projectPath || "").replace(/\/project\.md$/u, ""));
    const relativeToProject = (value) => {
      const normalized = normalizePath(String(value || ""));
      if (!normalized.startsWith(`${directory}/`)) throw new Error("质量迭代只能复用当前项目内的输入输出");
      return normalized.slice(directory.length + 1);
    };
    return this.queueCreationStageTask(task.projectPath, task.kind, {
      force: true,
      skillId: task.skillId,
      qualityIterations: iteration + 1,
      inputOverride: (task.inputs || []).map(relativeToProject),
      outputOverride: (task.outputs || []).map(relativeToProject),
      outputDirectoriesOverride: (task.outputDirectories || []).map(relativeToProject),
      ...(task.groupId ? { groupId: task.groupId } : {}),
    });
  }

  async cancelCreationTask(task) {
    if (!task || !task.taskPath || ["completed", "cancelled"].includes(task.status)) throw new Error("当前任务不能取消");
    const updated = { ...task, status: "cancelled", updatedAt: this.now(), error: "已由用户取消" };
    delete updated.taskPath;
    await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    return updated;
  }

  async approveCreationPlanningTask(task) {
    if (!task || !task.taskPath || task.status !== "awaiting_approval") throw new Error("当前任务不在等待确认状态");
    const approval = {
      approvalId: `approval_${this.creationProjectId()}`,
      taskId: task.taskId,
      projectId: task.projectId,
      gate: "planning-brief-outline",
      decision: "approved",
      createdAt: this.now(),
    };
    const directory = task.projectDirectory || String(task.projectPath).slice(0, -"/project.md".length);
    const approvalPath = `${directory}/approvals.jsonl`;
    const previous = (await this.pathExists(approvalPath)) ? await this.readText(approvalPath) : "";
    await this.writeText(approvalPath, `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(approval)}\n`);
    const updatedTask = Object.assign({}, task, { status: "completed", approvalId: approval.approvalId, updatedAt: this.now() });
    delete updatedTask.taskPath;
    await this.writeText(task.taskPath, `${JSON.stringify(updatedTask, null, 2)}\n`);
    let projectMarkdown = await this.readText(task.projectPath);
    projectMarkdown = this.replaceFrontmatterValue(projectMarkdown, "status", "brief-approved");
    await this.writeText(task.projectPath, this.touchFrontmatter(projectMarkdown));
  }

  async appendInspirationToCreationProject(item, projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到要追加的创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const contextPath = `${directory}/planning/context.md`;
    const marker = this.creationInspirationMarker(item);
    const context = (await this.pathExists(contextPath)) ? await this.readText(contextPath) : "# 灵感与素材上下文\n";
    if (!context.includes(marker)) {
      await this.writeText(contextPath, `${context.replace(/\s*$/g, "")}\n\n${this.creationContextEntry(item, "related")}`);
      let projectMarkdown = await this.readText(normalizedProjectPath);
      const currentCount = Number(this.readFrontmatterValue(projectMarkdown, "related_inspiration_count")) || 0;
      projectMarkdown = this.replaceFrontmatterValue(projectMarkdown, "related_inspiration_count", currentCount + 1);
      await this.writeText(normalizedProjectPath, this.touchFrontmatter(projectMarkdown));
    }
    return { path: normalizedProjectPath, appended: !context.includes(marker) };
  }

  creationEditableArtifact(directory, artifact) {
    const root = `${directory}/deliverables`;
    const definitions = {
      masterBrief: { current: `${directory}/planning/master-brief.md`, versions: `${directory}/planning/versions`, prefix: "master-brief", taskKind: "brief.master" },
      wechatOutline: { current: `${root}/wechat/wechat-001/outline.md`, versions: `${root}/wechat/wechat-001/versions`, prefix: "outline", taskKind: "wechat.plan" },
      wechatIllustrationPlan: { current: `${root}/wechat/wechat-001/illustration-plan.md`, versions: `${root}/wechat/wechat-001/versions`, prefix: "illustration-plan", taskKind: "wechat.plan" },
      wechatDraft: { current: `${root}/wechat/wechat-001/drafts/v1.md`, versions: `${root}/wechat/wechat-001/drafts`, prefix: "article", taskKind: "wechat.draft" },
      xhsPlan: { current: `${root}/xiaohongshu/xiaohongshu-001/plan.md`, versions: `${root}/xiaohongshu/xiaohongshu-001/versions`, prefix: "plan", taskKind: "xhs.plan" },
      xhsCaption: { current: `${root}/xiaohongshu/xiaohongshu-001/caption.md`, versions: `${root}/xiaohongshu/xiaohongshu-001/versions`, prefix: "caption", taskKind: "xhs.copy-qa" },
    };
    const definition = definitions[artifact];
    if (!definition) throw new Error(`不支持编辑的创作产物：${artifact}`);
    return definition;
  }

  async saveCreationWorkDraft(projectPath, artifact, content) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const definition = this.creationEditableArtifact(directory, artifact);
    await this.ensureFolder(definition.versions);
    const workDraftPath = `${definition.versions}/${definition.prefix}-work-draft.md`;
    await this.writeText(workDraftPath, String(content || ""));
    return { workDraftPath };
  }

  async saveCreationManualVersion(projectPath, artifact, content) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const body = String(content || "").trim();
    if (!body) throw new Error("不能保存空的创作版本");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const definition = this.creationEditableArtifact(directory, artifact);
    const previousCurrentContent = (await this.pathExists(definition.current)) ? await this.readText(definition.current) : "";
    await this.ensureFolder(definition.versions);
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    const listed = adapter && typeof adapter.list === "function" ? await adapter.list(definition.versions) : { files: [] };
    const pattern = new RegExp(`${definition.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-user-v(\\d+)\\.md$`);
    const versions = (listed.files || []).map((filePath) => {
      const match = String(filePath).match(pattern);
      return match ? Number(match[1]) : 0;
    });
    const number = Math.max(0, ...versions) + 1;
    const versionId = `user-v${number}`;
    const versionPath = `${definition.versions}/${definition.prefix}-${versionId}.md`;
    const persistedBody = `${body}\n`;
    const contentHash = crypto.createHash("sha256").update(persistedBody).digest("hex");
    await this.writeText(versionPath, persistedBody);
    await this.writeText(definition.current, persistedBody);
    const workDraftPath = `${definition.versions}/${definition.prefix}-work-draft.md`;
    if (await this.pathExists(workDraftPath)) await this.writeText(workDraftPath, "");
    const tasks = await this.listCreationRunnerTasks();
    const approvalTask = tasks.find((task) => task.projectPath === normalizedProjectPath && task.kind === definition.taskKind && task.status === "awaiting_approval");
    if (approvalTask) {
      const updated = { ...approvalTask, userEdited: true, userVersion: versionId, updatedAt: this.now(), outputHashes: { ...(approvalTask.outputHashes || {}), [definition.current]: contentHash } };
      delete updated.taskPath;
      await this.writeText(approvalTask.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
    const artifactPath = `${directory}/artifacts.jsonl`;
    const previous = (await this.pathExists(artifactPath)) ? await this.readText(artifactPath) : "";
    const projectMarkdown = await this.readText(normalizedProjectPath);
    const projectId = this.readFrontmatterValue(projectMarkdown, "project_id") || "project";
    const artifactId = `${projectId}:manual:${artifact}`;
    const priorRecords = previous.split("\n").map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter((item) => item && item.artifactId === artifactId);
    const record = {
      recordType: "artifact_version",
      artifact,
      artifactId,
      artifactVersionId: `${artifactId}@${versionId}`,
      versionId,
      path: versionPath,
      contentHash,
      dependencyHashes: {},
      source: "user",
      createdAt: this.now(),
      ...(priorRecords.length ? { supersedesArtifactVersionId: priorRecords[priorRecords.length - 1].artifactVersionId } : {}),
    };
    await this.writeText(artifactPath, `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(record)}\n`);
    if (artifact === "wechatDraft" || artifact === "xhsCaption") {
      const platform = artifact === "wechatDraft" ? "wechat" : "xiaohongshu";
      const qaKind = artifact === "wechatDraft" ? "wechat.qa" : "xhs.copy-qa";
      for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && item.kind === qaKind && ["pending", "running", "awaiting_approval"].includes(item.status))) {
        const superseded = { ...task, status: "superseded", updatedAt: this.now(), error: "文字版本发生变化，旧质量检查已失效" };
        delete superseded.taskPath;
        await this.writeText(task.taskPath, `${JSON.stringify(superseded, null, 2)}\n`);
      }
      if (artifact === "wechatDraft") await this.markCreationVisualTasksStale(
        normalizedProjectPath,
        "wechat",
        `公众号正文已保存为 ${versionId}，对应配图依赖的文字片段已变化`,
        tasks,
        { previous: previousCurrentContent, next: persistedBody },
      );
      let state = await this.loadCreationWorkflowState(directory);
      state = creationWorkflow.recordDeliverableVersions(state, platform, platform === "wechat"
        ? { articleVersion: versionId, qaVersion: null, taskState: "qa_queued" }
        : { captionVersion: versionId, copyQaVersion: null, taskState: "copy_qa_queued" });
      state = creationWorkflow.invalidateDeliverableFrom(state, platform, "draft");
      await this.saveCreationWorkflowState(directory, state);
      await this.queueCreationStageTask(normalizedProjectPath, qaKind, { force: true });
    }
    return { versionId, versionPath, currentPath: definition.current };
  }

  async requestCreationRevision(projectPath, artifact, feedback) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const instruction = String(feedback || "").trim();
    if (!instruction) throw new Error("请先填写修订意见");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const definition = this.creationEditableArtifact(directory, artifact);
    await this.ensureFolder(definition.versions);
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    const listed = adapter && typeof adapter.list === "function" ? await adapter.list(definition.versions) : { files: [] };
    const escapedPrefix = definition.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const aiPattern = new RegExp(`${escapedPrefix}-ai-v(\\d+)\\.md$`);
    const numbers = (listed.files || []).map((filePath) => {
      const match = String(filePath).match(aiPattern);
      return match ? Number(match[1]) : 0;
    });
    const aiVersion = `ai-v${Math.max(0, ...numbers) + 1}`;
    if (await this.pathExists(definition.current)) {
      await this.writeText(`${definition.versions}/${definition.prefix}-${aiVersion}.md`, await this.readText(definition.current));
    }
    const requestRelative = `${definition.versions.slice(directory.length + 1)}/${definition.prefix}-revision-request.md`;
    await this.writeText(`${directory}/${requestRelative}`, `# 修订意见\n\n${instruction}\n`);
    const tasks = await this.listCreationRunnerTasks();
    for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && item.kind === definition.taskKind && ["pending", "running", "awaiting_approval"].includes(item.status))) {
      const updated = { ...task, status: "superseded", updatedAt: this.now(), error: "用户提交了新的修订意见" };
      delete updated.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
    if (artifact === "wechatDraft" || artifact === "xhsCaption") {
      const platform = artifact === "wechatDraft" ? "wechat" : "xiaohongshu";
      const qaKind = artifact === "wechatDraft" ? "wechat.qa" : "xhs.copy-qa";
      for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && item.kind === qaKind && ["pending", "running", "awaiting_approval"].includes(item.status))) {
        const superseded = { ...task, status: "superseded", updatedAt: this.now(), error: "正文进入新一轮 AI 修订，旧质量检查已失效" };
        delete superseded.taskPath;
        await this.writeText(task.taskPath, `${JSON.stringify(superseded, null, 2)}\n`);
      }
      let state = await this.loadCreationWorkflowState(directory);
      state = creationWorkflow.recordDeliverableVersions(state, platform, platform === "wechat"
        ? { qaVersion: null, taskState: "draft_queued" }
        : { copyQaVersion: null, taskState: "copy_qa_queued" });
      state = creationWorkflow.invalidateDeliverableFrom(state, platform, "draft");
      await this.saveCreationWorkflowState(directory, state);
      if (artifact === "wechatDraft") await this.markCreationVisualTasksStale(normalizedProjectPath, "wechat", "公众号正文进入新一轮 AI 修订，旧配图依赖待重新核对", tasks);
    }
    return this.queueCreationStageTask(normalizedProjectPath, definition.taskKind, { force: true, extraInputs: [requestRelative] });
  }

  async saveCreationPlanDecision(projectPath, platform, decision) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!['wechat', 'xiaohongshu'].includes(platform)) throw new Error("不支持的交付平台");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const target = `${directory}/deliverables/${platform}/${platform}-001/plan-decision.json`;
    await this.writeText(target, `${JSON.stringify({ schemaVersion: 1, platform, ...decision, updatedAt: this.now() }, null, 2)}\n`);
    return target;
  }

  async unlinkCreationInspiration(projectPath, title) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) throw new Error("缺少要解除的关联灵感");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const contextPath = `${directory}/planning/context.md`;
    const context = await this.readText(contextPath);
    const blocks = context.split(/(?=<!-- reading-capture-inspiration:)/g);
    const heading = `## 关联灵感：${normalizedTitle}`;
    let removed = false;
    const kept = blocks.filter((block) => {
      if (!removed && block.includes(heading)) {
        removed = true;
        return false;
      }
      return true;
    });
    if (!removed) throw new Error("找不到要解除的关联灵感");
    const nextContext = kept.join("").replace(/\s+$/g, "\n");
    await this.writeText(contextPath, nextContext);
    let markdown = await this.readText(normalizedProjectPath);
    const count = (nextContext.match(/^## 关联灵感：/gm) || []).length;
    markdown = this.replaceFrontmatterValue(markdown, "related_inspiration_count", count);
    await this.writeText(normalizedProjectPath, this.touchFrontmatter(markdown));
    let state = await this.loadCreationWorkflowState(directory);
    if (state.masterBriefVersion) state = creationWorkflow.setStageOverride(state, "brief", "stale");
    for (const stage of ["plan", "draft", "visual", "final"]) {
      const status = creationWorkflow.deriveStageStates(state)[stage];
      if (["complete", "current"].includes(status)) state = creationWorkflow.setStageOverride(state, stage, "stale");
    }
    await this.saveCreationWorkflowState(directory, state);
    return { removed: true, relatedCount: count };
  }

  async loadCreationWorkflowState(directory, project = {}) {
    const statePath = `${directory}/workflow-state.json`;
    if (await this.pathExists(statePath)) {
      // This JSON is also updated by the external Runner. Read through the
      // adapter so reopening a view never restores an older cached stage.
      return creationWorkflow.normalizeWorkflowState(JSON.parse(await this.readFreshText(statePath)));
    }
    const state = creationWorkflow.createWorkflowState({
      projectId: project.id || "",
      title: project.title || "",
      workflowMode: "idea_creation",
      activeDeliverable: project.platform === "xiaohongshu" ? "xiaohongshu" : "wechat",
    });
    await this.createFileIfMissing(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  async saveCreationWorkflowState(directory, state) {
    const normalized = creationWorkflow.normalizeWorkflowState(state);
    await this.writeText(`${directory}/workflow-state.json`, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  }

  async addCreationDeliverable(projectPath, platform) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!["wechat", "xiaohongshu"].includes(platform)) throw new Error("不支持的交付平台");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const current = await this.loadCreationWorkflowState(directory);
    const existed = !!current.deliverables[platform];
    const updated = creationWorkflow.addDeliverable(current, platform);
    await this.saveCreationWorkflowState(directory, updated);
    if (!existed) {
      if (platform === "wechat") {
        await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/drafts`);
        await this.ensureFolder(`${directory}/deliverables/wechat/wechat-001/visuals`);
      } else {
        await this.ensureFolder(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/images`);
      }
      if (updated.masterBriefVersion || updated.workflowMode === "article_repurpose") {
        await this.queueCreationStageTask(normalizedProjectPath, platform === "wechat" ? "wechat.plan" : "xhs.plan");
      }
    }
    return updated;
  }

  async activateCreationDeliverable(projectPath, platform) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const updated = creationWorkflow.activateDeliverable(await this.loadCreationWorkflowState(directory), platform);
    return this.saveCreationWorkflowState(directory, updated);
  }

  async selectCreationXhsSource(projectPath, sourceMode) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!["saved_article", "master_brief", "wechat_final"].includes(sourceMode)) throw new Error("不支持的小红书输入来源");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    let state = await this.loadCreationWorkflowState(directory);
    const xhs = state.deliverables.xiaohongshu;
    if (!xhs) throw new Error("请先创建小红书交付物");
    if (sourceMode === "saved_article" && !state.source.projectCopy) throw new Error("当前项目没有已读取的主文章");
    if (sourceMode === "master_brief" && !state.masterBriefVersion) throw new Error("当前项目还没有已确认的主简报");
    if (sourceMode === "wechat_final" && !(state.deliverables.wechat && state.deliverables.wechat.stage === "final" && state.deliverables.wechat.articleVersion)) throw new Error("公众号文章尚未定稿");
    const sourceVersion = sourceMode === "saved_article"
      ? state.source.readVersion
      : sourceMode === "wechat_final"
        ? state.deliverables.wechat.articleVersion
        : state.masterBriefVersion;
    state = creationWorkflow.recordDeliverableVersions(state, "xiaohongshu", { sourceMode, sourceVersion, planVersion: null });
    state = creationWorkflow.activateDeliverable(state, "xiaohongshu");
    state = creationWorkflow.invalidateDeliverableFrom(state, "xiaohongshu", "plan");
    await this.saveCreationWorkflowState(directory, state);
    const tasks = await this.listCreationRunnerTasks();
    for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && item.kind === "xhs.plan" && ["pending", "running", "awaiting_approval"].includes(item.status))) {
      const superseded = { ...task, status: "superseded", updatedAt: this.now(), error: "小红书输入来源已改变" };
      delete superseded.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(superseded, null, 2)}\n`);
    }
    const sourceInput = sourceMode === "saved_article"
      ? state.source.projectCopy
      : sourceMode === "wechat_final"
        ? "deliverables/wechat/wechat-001/drafts/v1.md"
        : "planning/master-brief.md";
    await this.queueCreationStageTask(normalizedProjectPath, "xhs.plan", { force: true, inputOverride: ["project.md", sourceInput] });
    return state;
  }

  async approveCreationVisualPackage(projectPath, platform) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const state = await this.loadCreationWorkflowState(directory);
    const deliverable = state.deliverables[platform];
    if (!deliverable) throw new Error("找不到要验收的交付物");
    let version = deliverable.cardVersion || deliverable.articleVersion || this.now();
    if (platform === "wechat") {
      const tasks = (await this.listCreationRunnerTasks()).filter((task) => task.projectPath === normalizedProjectPath && task.kind === "wechat.visual-item" && (!deliverable.visualGroupId || task.groupId === deliverable.visualGroupId));
      if (!tasks.length) throw new Error("当前公众号项目没有可验收的逐图任务");
      const incomplete = tasks.filter((task) => task.status !== "completed");
      if (incomplete.length) throw new Error(`仍有 ${incomplete.length} 个配图任务未完成，不能进入定稿`);
      version = crypto.createHash("sha256").update(JSON.stringify(tasks
        .map((task) => ({ childKey: task.childKey, outputHashes: task.outputHashes || {} }))
        .sort((left, right) => String(left.childKey).localeCompare(String(right.childKey))))).digest("hex");
    }
    const updated = creationWorkflow.approveVisuals(state, platform, {
      approvalVersion: version,
      taskState: "ready_to_export",
    });
    await this.saveCreationWorkflowState(directory, updated);
    return updated;
  }

  async copyCreationSnapshotTree(sourceDirectory, targetDirectory) {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter || typeof adapter.list !== "function") throw new Error("当前 Vault 适配器不支持创建发布快照");
    const files = await this.listCreationSnapshotFiles(sourceDirectory);
    for (const sourcePath of files) {
      const relative = sourcePath.slice(sourceDirectory.length).replace(/^\/+/, "");
      const targetPath = `${targetDirectory}/${relative}`;
      await this.copyCreationSnapshotFile(sourcePath, targetPath);
    }
    return files.length;
  }

  async listCreationSnapshotFiles(sourceDirectory) {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter || typeof adapter.list !== "function") throw new Error("当前 Vault 适配器不支持读取发布内容");
    const files = new Set();
    const visited = new Set();
    const visit = async (directory) => {
      if (visited.has(directory)) return;
      visited.add(directory);
      const listed = await adapter.list(directory);
      for (const filePath of Array.isArray(listed && listed.files) ? listed.files : []) {
        if (filePath.startsWith(`${sourceDirectory}/`)) files.add(filePath);
      }
      for (const folderPath of Array.isArray(listed && listed.folders) ? listed.folders : []) {
        if (folderPath.startsWith(`${sourceDirectory}/`)) await visit(folderPath);
      }
    };
    await visit(sourceDirectory);
    return [...files].sort();
  }

  async copyCreationSnapshotFile(sourcePath, targetPath) {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter) throw new Error("当前 Vault 适配器不可用");
    await this.ensureFolderForPath(targetPath);
    if (typeof adapter.readBinary === "function" && typeof adapter.writeBinary === "function" && !/\.(?:md|txt|json|jsonl|ya?ml|csv|html|css|js)$/i.test(sourcePath)) {
      await adapter.writeBinary(targetPath, await adapter.readBinary(sourcePath));
    } else {
      await adapter.write(targetPath, await adapter.read(sourcePath));
    }
  }

  async withCreationExportLock(key, callback) {
    if (!this.creationExportLocks) this.creationExportLocks = new Map();
    const previous = this.creationExportLocks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.creationExportLocks.set(key, queued);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (this.creationExportLocks.get(key) === queued) this.creationExportLocks.delete(key);
    }
  }

  async exportCreationDeliverable(projectPath, platform, options = {}) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const state = await this.loadCreationWorkflowState(directory);
    if (state.currentStage !== "final" || state.activeDeliverable !== platform) throw new Error("当前交付物尚未完成最终验收");
    const projectMarkdown = await this.readText(normalizedProjectPath);
    const title = this.sanitizeCreationProjectTitle(this.readFrontmatterValue(projectMarkdown, "title") || state.title);
    const date = String(options.date || this.now().slice(0, 10)).replace(/-/g, "");
    const root = normalizePath(platform === "xiaohongshu" ? this.settings.xiaohongshuPublishingRoot : this.settings.wechatPublishingRoot).replace(/\/+$/g, "");
    return this.withCreationExportLock(`${root}/${date}_${title}`, async () => {
      let suffix = String(options.suffix || "");
      if (suffix && !/^_v[2-9]\d*$/.test(suffix)) throw new Error("发布快照后缀必须使用 _v2、_v3 等格式");
      if (options.autoVersion === true && !suffix) suffix = (await this.nextCreationExportSuffix(normalizedProjectPath, platform, date)).suffix;
      const targetDirectory = `${root}/${date}_${title}${suffix}`;
      if (await this.pathExists(targetDirectory)) throw new Error(`发布目录已存在：${targetDirectory}。请选择 _v2、_v3 等新版本后缀，或取消。`);
      const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
      if (!adapter || typeof adapter.rename !== "function") throw new Error("当前 Vault 适配器不支持原子发布快照");
      const stagingDirectory = `${targetDirectory}.staging-${this.creationProjectId()}`;
      await this.ensureFolder(stagingDirectory);
      const sourceDirectory = `${directory}/deliverables/${platform}/${platform}-001`;
      let copiedFiles = 0;
      let promoted = false;
      try {
      const copyIfPresent = async (sourcePath, targetPath) => {
        if (!(await this.pathExists(sourcePath))) return false;
        await this.copyCreationSnapshotFile(sourcePath, targetPath);
        copiedFiles += 1;
        return true;
      };
      const copyImages = async (sourceImageDirectory) => {
        if (!(await this.pathExists(sourceImageDirectory))) return;
        for (const sourcePath of await this.listCreationSnapshotFiles(sourceImageDirectory)) {
          if (!/\.(?:png|jpe?g|webp|svg)$/iu.test(sourcePath)) continue;
          await this.copyCreationSnapshotFile(sourcePath, `${stagingDirectory}/images/${sourcePath.split("/").pop()}`);
          copiedFiles += 1;
        }
      };
      const firstExistingText = async (paths, fallback) => {
        for (const candidate of paths) if (await this.pathExists(candidate)) return this.readText(candidate);
        return fallback;
      };
      if (platform === "wechat") {
        await copyIfPresent(`${sourceDirectory}/drafts/v1.md`, `${stagingDirectory}/article.md`);
        await copyImages(`${sourceDirectory}/visuals`);
        await copyIfPresent(`${sourceDirectory}/qa.md`, `${stagingDirectory}/QA.md`);
      } else {
        await copyIfPresent(`${sourceDirectory}/plan.md`, `${stagingDirectory}/BRIEF.md`);
        const caption = await firstExistingText([`${sourceDirectory}/caption.md`], "# 小红书发布文案\n\n> 当前快照未包含发布文案。\n");
        await this.writeText(`${stagingDirectory}/xiaohongshu-caption.md`, caption);
        await this.writeText(`${stagingDirectory}/copy-variants.md`, `# 文案版本\n\n## 最终采用版本\n\n${caption.replace(/^#.*\n+/u, "")}`);
        const visualQa = await firstExistingText([`${sourceDirectory}/visual-qa.md`], "# 视觉质量检查\n\n> 未提供独立视觉质检记录。\n");
        const copyQa = await firstExistingText([`${sourceDirectory}/copy-qa.md`], "# 文案质量检查\n\n> 未提供独立文案质检记录。\n");
        await this.writeText(`${stagingDirectory}/QA.md`, `${visualQa.trim()}\n\n---\n\n${copyQa.trim()}\n`);
        await copyImages(`${sourceDirectory}/images`);
      }
      const sources = await firstExistingText([
        `${sourceDirectory}/sources.md`,
        `${directory}/research/sources.md`,
        `${directory}/planning/sources.md`,
      ], "# 来源记录\n\n> 本次交付没有额外来源记录。\n");
      await this.writeText(`${stagingDirectory}/sources.md`, sources);
      await this.writeText(`${stagingDirectory}/publishing-notes.md`, `# 发布说明\n\n- 平台：${this.creationPlatformLabel(platform)}\n- 来源项目：${normalizedProjectPath}\n- 导出只创建不可变快照，不会自动发布。\n`);
      const snapshotVersion = suffix ? Number(suffix.replace("_v", "")) : 1;
      const snapshot = {
        schemaVersion: 1,
        recordType: "snapshot_export",
        projectId: state.projectId,
        deliverableId: `${platform}-001`,
        platform,
        inputMode: platform === "xiaohongshu" ? state.deliverables[platform].sourceMode || null : null,
        title,
        targetDirectory,
        directoryName: targetDirectory.split("/").pop(),
        sourceProject: normalizedProjectPath,
        sourceDirectory,
        approvalVersion: state.deliverables[platform].approvalVersion,
        snapshotVersion,
        snapshotId: `snapshot_${core.sha1(`${state.projectId}|${platform}|${targetDirectory}`, 8)}`,
        createdAt: this.now(),
        exportedAt: this.now(),
        copiedFiles,
      };
      await this.writeText(`${stagingDirectory}/manifest.yaml`, `${JSON.stringify(snapshot, null, 2)}\n`);
      await this.writeText(`${stagingDirectory}/snapshot.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
      await adapter.rename(stagingDirectory, targetDirectory);
      promoted = true;
      const publicationPath = `${directory}/publication-records.jsonl`;
      const previous = (await this.pathExists(publicationPath)) ? await this.readText(publicationPath) : "";
      await this.writeText(publicationPath, `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(snapshot)}\n`);
      return snapshot;
      } catch (error) {
        if (!promoted) {
          try {
            await this.writeText(`${stagingDirectory}/_EXPORT_INCOMPLETE.json`, `${JSON.stringify({
              schemaVersion: 1,
              targetDirectory,
              failedAt: this.now(),
              error: error && error.message ? error.message : String(error),
            }, null, 2)}\n`);
          } catch (markerError) {
            // Keep the original export failure; the staging directory name is still identifiable.
          }
        }
        throw error;
      }
    });
  }

  async recordCreationPublicationReview(projectPath, platform, snapshot, review = {}) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!["wechat", "xiaohongshu"].includes(platform)) throw new Error("不支持的发布平台");
    if (!snapshot || snapshot.platform !== platform || !snapshot.targetDirectory) throw new Error("找不到对应平台的发布快照");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const publicationPath = `${directory}/publication-records.jsonl`;
    const existingText = (await this.pathExists(publicationPath)) ? await this.readText(publicationPath) : "";
    const records = existingText.split(/\r?\n/u).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter(Boolean);
    const snapshotId = snapshot.snapshotId || `snapshot_${core.sha1(`${snapshot.projectId || ""}|${platform}|${snapshot.targetDirectory}`, 8)}`;
    const publicationRecordId = `publication_${core.sha1(snapshotId, 8)}`;
    const normalizedReview = {
      publishedAt: String(review.publishedAt || this.now()),
      url: String(review.url || "").trim(),
      outcome: String(review.outcome || "published").trim() || "published",
      whatWorked: String(review.whatWorked || "").trim(),
      whatFailed: String(review.whatFailed || "").trim(),
      reusableAngles: String(review.reusableAngles || "").trim(),
      audienceResponse: String(review.audienceResponse || "").trim(),
      followUpIdeas: String(review.followUpIdeas || "").trim(),
    };
    const reviewFingerprint = core.sha1(JSON.stringify(normalizedReview), 8);
    const prior = records.filter((item) => item.recordType === "publication_review" && item.publicationRecordId === publicationRecordId);
    const duplicate = prior.find((item) => item.reviewFingerprint === reviewFingerprint);
    if (duplicate) return duplicate;
    const previous = prior.slice().sort((left, right) => Number(right.reviewRevision || 0) - Number(left.reviewRevision || 0))[0] || null;
    const reviewRevision = Number(previous && previous.reviewRevision || 0) + 1;
    const record = {
      schemaVersion: 1,
      recordType: "publication_review",
      publicationRecordId,
      reviewId: `${publicationRecordId}_r${reviewRevision}`,
      reviewRevision,
      ...(previous ? { previousReviewId: previous.reviewId } : {}),
      reviewFingerprint,
      snapshotId,
      projectId: snapshot.projectId,
      deliverableId: snapshot.deliverableId || `${platform}-001`,
      platform,
      targetDirectory: snapshot.targetDirectory,
      ...normalizedReview,
      createdAt: this.now(),
    };
    await this.writeText(publicationPath, `${existingText.replace(/\s*$/gu, "")}${existingText.trim() ? "\n" : ""}${JSON.stringify(record)}\n`);

    const projectMarkdown = await this.readText(normalizedProjectPath);
    const contextPath = `${directory}/planning/context.md`;
    const context = (await this.pathExists(contextPath)) ? await this.readText(contextPath) : "";
    const inspirationIds = new Set();
    const primaryId = this.readFrontmatterValue(projectMarkdown, "primary_inspiration_id");
    if (primaryId) inspirationIds.add(String(primaryId));
    for (const match of context.matchAll(/^- 灵感 ID：(.+)$/gmu)) if (match[1].trim()) inspirationIds.add(match[1].trim());
    if (!inspirationIds.size) inspirationIds.add(`project:${snapshot.projectId}`);

    const feedbackPath = `${this.creationProjectRoot()}/_topic-miner/feedback.jsonl`;
    const feedbackText = (await this.pathExists(feedbackPath)) ? await this.readText(feedbackPath) : "";
    const feedbackRecords = feedbackText.split(/\r?\n/u).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter(Boolean);
    const additions = [];
    for (const inspirationId of inspirationIds) {
      const feedbackId = `feedback_${core.sha1(`${publicationRecordId}|${inspirationId}|${reviewRevision}`, 8)}`;
      if (feedbackRecords.some((item) => item.feedbackId === feedbackId)) continue;
      additions.push({
        schemaVersion: 1,
        feedbackId,
        publicationRecordId,
        reviewId: record.reviewId,
        reviewRevision,
        projectId: snapshot.projectId,
        deliverableId: record.deliverableId,
        snapshotId,
        inspirationId,
        platform,
        inputMode: snapshot.inputMode || null,
        outcome: normalizedReview.outcome,
        reviewSummary: [normalizedReview.whatWorked, normalizedReview.whatFailed, normalizedReview.reusableAngles].filter(Boolean).join("；"),
        whatWorked: normalizedReview.whatWorked,
        whatFailed: normalizedReview.whatFailed,
        reusableAngles: normalizedReview.reusableAngles,
        audienceResponse: normalizedReview.audienceResponse,
        followUpIdeas: normalizedReview.followUpIdeas,
        updatedAt: this.now(),
      });
    }
    if (additions.length) {
      await this.ensureFolderForPath(feedbackPath);
      const combinedText = `${feedbackText.replace(/\s*$/gu, "")}${feedbackText.trim() ? "\n" : ""}${additions.map((item) => JSON.stringify(item)).join("\n")}\n`;
      await this.writeText(feedbackPath, combinedText);
      feedbackRecords.push(...additions);
    }
    const latest = new Map();
    for (const item of feedbackRecords) {
      const key = `${item.publicationRecordId}|${item.inspirationId}`;
      const current = latest.get(key);
      if (!current || Number(item.reviewRevision || 0) >= Number(current.reviewRevision || 0)) latest.set(key, item);
    }
    const consumerPath = `${this.creationProjectRoot()}/_topic-miner/consumers/topic-miner.json`;
    await this.ensureFolderForPath(consumerPath);
    await this.writeText(consumerPath, `${JSON.stringify({ schemaVersion: 1, updatedAt: this.now(), records: [...latest.values()] }, null, 2)}\n`);
    return record;
  }

  async nextCreationExportSuffix(projectPath, platform, date = "") {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const state = await this.loadCreationWorkflowState(directory);
    const projectMarkdown = await this.readText(normalizedProjectPath);
    const title = this.sanitizeCreationProjectTitle(this.readFrontmatterValue(projectMarkdown, "title") || state.title);
    const day = String(date || this.now().slice(0, 10)).replace(/-/g, "");
    const root = normalizePath(platform === "xiaohongshu" ? this.settings.xiaohongshuPublishingRoot : this.settings.wechatPublishingRoot).replace(/\/+$/g, "");
    const base = `${root}/${day}_${title}`;
    if (!(await this.pathExists(base))) return { suffix: "", targetDirectory: base };
    for (let number = 2; number < 1000; number += 1) {
      const suffix = `_v${number}`;
      const targetDirectory = `${base}${suffix}`;
      if (!(await this.pathExists(targetDirectory))) return { suffix, targetDirectory, conflictDirectory: base };
    }
    throw new Error("找不到可用的发布版本目录");
  }

  async confirmCreationRelations(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const state = await this.loadCreationWorkflowState(directory);
    const updated = creationWorkflow.enterDiagnosis(state);
    await this.saveCreationWorkflowState(directory, updated);
    let markdown = await this.readText(normalizedProjectPath);
    markdown = this.replaceFrontmatterValue(markdown, "status", "material-diagnosis");
    await this.writeText(normalizedProjectPath, this.touchFrontmatter(markdown));
    await this.queueCreationStageTask(normalizedProjectPath, "diagnosis.materials");
    return updated;
  }

  async saveCreationDiagnosisInput(projectPath, type, content) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    if (!["material", "research"].includes(type)) throw new Error("不支持的诊断输入类型");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const filePath = type === "material" ? `${directory}/planning/user-material.md` : `${directory}/planning/research-request.md`;
    const title = type === "material" ? "# 用户补充材料" : "# 联网研究指导";
    await this.writeText(filePath, `${title}\n\n${String(content || "").trim()}\n`);
    const tasks = await this.listCreationRunnerTasks();
    for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && item.kind === "diagnosis.materials" && ["pending", "running", "awaiting_approval"].includes(item.status))) {
      const updated = Object.assign({}, task, { status: "cancelled", updatedAt: this.now(), error: "输入发生变化，已创建新的诊断任务" });
      delete updated.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
    return this.queueCreationStageTask(normalizedProjectPath, "diagnosis.materials");
  }

  async chooseCreationResearchPath(projectPath, decision) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const diagnosisTasks = (await this.listCreationRunnerTasks()).filter((task) => task.projectPath === normalizedProjectPath && task.kind === "diagnosis.materials" && task.status !== "cancelled" && task.status !== "superseded");
    const diagnosisTask = diagnosisTasks[0];
    const diagnosisPath = `${directory}/planning/diagnosis.md`;
    const hasGeneratedDiagnosis = (await this.pathExists(diagnosisPath)) && this.isCompletedCreationDiagnosis(await this.readText(diagnosisPath));
    if ((!diagnosisTask || !["awaiting_approval", "completed"].includes(diagnosisTask.status)) && !hasGeneratedDiagnosis) throw new Error("请先等待材料诊断完成，再选择后续路径");
    if (diagnosisTask && diagnosisTask.status === "awaiting_approval") {
      const accepted = { ...diagnosisTask, status: "completed", decision: "reviewed_for_path_selection", updatedAt: this.now() };
      delete accepted.taskPath;
      await this.writeText(diagnosisTask.taskPath, `${JSON.stringify(accepted, null, 2)}\n`);
    }
    const state = await this.loadCreationWorkflowState(directory);
    const updated = creationWorkflow.chooseResearchDecision(state, decision);
    await this.saveCreationWorkflowState(directory, updated);
    let markdown = await this.readText(normalizedProjectPath);
    markdown = this.replaceFrontmatterValue(markdown, "status", decision === "skip" ? "restricted-brief" : "research-configuration");
    await this.writeText(normalizedProjectPath, this.touchFrontmatter(markdown));
    if (decision === "skip") await this.queueCreationStageTask(normalizedProjectPath, "brief.master");
    return updated;
  }

  async reopenCreationResearch(projectPath) {
    const normalizedProjectPath = normalizePath(projectPath || "");
    if (!normalizedProjectPath.endsWith("/project.md") || !(await this.pathExists(normalizedProjectPath))) throw new Error("找不到创作项目");
    const directory = normalizedProjectPath.slice(0, -"/project.md".length);
    const updated = creationWorkflow.reopenResearch(await this.loadCreationWorkflowState(directory));
    const tasks = await this.listCreationRunnerTasks();
    for (const task of tasks.filter((item) => item.projectPath === normalizedProjectPath && !["diagnosis.materials", "research.evidence"].includes(item.kind) && ["pending", "running", "awaiting_approval"].includes(item.status))) {
      const superseded = { ...task, status: "superseded", updatedAt: this.now(), error: "质量检查要求补充证据，后续产物等待新研究结果后重建" };
      delete superseded.taskPath;
      await this.writeText(task.taskPath, `${JSON.stringify(superseded, null, 2)}\n`);
    }
    await this.saveCreationWorkflowState(directory, updated);
    let markdown = await this.readText(normalizedProjectPath);
    markdown = this.replaceFrontmatterValue(markdown, "status", "research-configuration");
    await this.writeText(normalizedProjectPath, this.touchFrontmatter(markdown));
    return updated;
  }

  isCompletedCreationDiagnosis(content) {
    const text = String(content || "").trim();
    if (text.length < 180) return false;
    return !/(?:等待\s*Skill Runner|等待[^\n]{0,20}(?:分析|诊断结果))/iu.test(text);
  }

  async listCreationProjects() {
    const root = `${this.creationProjectRoot()}/`;
    const files = typeof this.app.vault.getMarkdownFiles === "function" ? this.app.vault.getMarkdownFiles() : [];
    const projects = [];
    const tasks = await this.listCreationRunnerTasks();
    const markdownReceipts = await this.listCreationMarkdownRunReceipts();
    for (const file of files) {
      const path = normalizePath(file.path || "");
      if (!this.isTopLevelCreationProjectPath(path)) continue;
      try {
        const markdown = await this.readText(path);
        if (this.readFrontmatterValue(markdown, "type") !== CREATION_PROJECT_TYPE) continue;
        const directory = path.slice(0, -"/project.md".length);
        const contextPath = `${directory}/planning/context.md`;
        const context = (await this.pathExists(contextPath)) ? await this.readText(contextPath) : "";
        const primaryMatch = context.match(/^## 主灵感：(.+)$/m);
        const relatedTitles = [...context.matchAll(/^## 关联灵感：(.+)$/gm)].map((match) => match[1].trim());
        const status = this.readFrontmatterValue(markdown, "status") || "planning";
        const title = this.readFrontmatterValue(markdown, "title") || directory.split("/").pop();
        const platform = this.readFrontmatterValue(markdown, "platform") || "wechat";
        let workflowState = await this.loadCreationWorkflowState(directory, {
          id: this.readFrontmatterValue(markdown, "project_id"),
          title,
          platform,
        });
        // project.md and workflow-state.json are synced as separate files.
        // If cloud sync or Obsidian indexing exposes the project status first,
        // never send the user back to stage one after it was already confirmed.
        if (status === "material-diagnosis" && workflowState.currentStage === "relations") {
          workflowState = creationWorkflow.enterDiagnosis(workflowState);
          await this.saveCreationWorkflowState(directory, workflowState);
        }
        const projectTasks = tasks.filter((task) => task.projectPath === path);
        for (const receipt of markdownReceipts.filter((item) => normalizePath(item.projectPath || "") === path)) {
          const existingIndex = projectTasks.findIndex((task) => task.taskId === receipt.taskId);
          if (existingIndex === -1) projectTasks.push(receipt);
          else if ((Date.parse(receipt.updatedAt || receipt.completedAt || receipt.failedAt || "") || 0) > (Date.parse(projectTasks[existingIndex].updatedAt || "") || 0)) {
            projectTasks[existingIndex] = { ...projectTasks[existingIndex], ...receipt };
          }
        }
        for (const taskPath of Object.values(workflowState.taskRefs || {})) {
          const normalizedTaskPath = normalizePath(String(taskPath || ""));
          if (!normalizedTaskPath || projectTasks.some((task) => task.taskPath === normalizedTaskPath)) continue;
          try {
            const referencedTask = JSON.parse(await this.readFreshText(normalizedTaskPath));
            if (referencedTask && [1, 2].includes(referencedTask.schemaVersion) && referencedTask.taskId) {
              projectTasks.push(await this.reconcileCreationTaskRunResult({ taskPath: normalizedTaskPath, ...referencedTask }));
            }
          } catch (error) {
            await this.writeDiagnosticEvent("error", "creation-task-reference-read", { taskPath: normalizedTaskPath, error: this.errorToDiagnostic(error) });
          }
        }
        const discoveredTasks = await this.discoverCreationProjectRunTasks(directory);
        let recoveredRefs = false;
        for (const discoveredTask of discoveredTasks) {
          if (!projectTasks.some((task) => task.taskId === discoveredTask.taskId)) projectTasks.push(discoveredTask);
          if (!Object.values(workflowState.taskRefs || {}).includes(discoveredTask.taskPath)) {
            const discoveredRefKey = discoveredTask.childKey
              ? `${discoveredTask.kind}:${discoveredTask.groupId || "group"}:${discoveredTask.childKey}`
              : discoveredTask.kind;
            workflowState = {
              ...workflowState,
              taskRefs: { ...(workflowState.taskRefs || {}), [discoveredRefKey]: discoveredTask.taskPath },
            };
            recoveredRefs = true;
          }
        }
        if (recoveredRefs) await this.saveCreationWorkflowState(directory, workflowState);
        projectTasks.sort((left, right) => (Date.parse(right.updatedAt || right.createdAt || "") || 0) - (Date.parse(left.updatedAt || left.createdAt || "") || 0));
        let latestPublication = null;
        for (const publicationFile of [`${directory}/publication-records.jsonl`, `${directory}/publications.jsonl`]) {
          if (!(await this.pathExists(publicationFile))) continue;
          for (const line of (await this.readText(publicationFile)).split(/\r?\n/u).filter(Boolean)) {
            try {
              const record = JSON.parse(line);
              if (!latestPublication || (Date.parse(record.createdAt || record.exportedAt || "") || 0) >= (Date.parse(latestPublication.createdAt || latestPublication.exportedAt || "") || 0)) latestPublication = record;
            } catch (error) {
              // Keep valid append-only records visible even if a sync conflict leaves one incomplete line.
            }
          }
        }
        let xhsProposals = [];
        const xhsProposalsPath = `${directory}/deliverables/xiaohongshu/xiaohongshu-001/proposals.json`;
        if (await this.pathExists(xhsProposalsPath)) {
          try {
            const parsed = JSON.parse(await this.readText(xhsProposalsPath));
            if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.proposals)) xhsProposals = parsed.proposals.slice(0, 3);
          } catch (error) {
            await this.writeDiagnosticEvent("error", "creation-xhs-proposals-read", { path: xhsProposalsPath, error: this.errorToDiagnostic(error) });
          }
        }
        projects.push({
          path,
          directory,
          title,
          platform: workflowState.activeDeliverable || platform,
          status,
          statusLabel: this.creationWorkflowStatusLabel(workflowState, latestPublication),
          updated: this.readFrontmatterValue(markdown, "updated") || "",
          primaryTitle: primaryMatch ? primaryMatch[1].trim() : "",
          relatedTitles,
          workflowState,
          stageStates: creationWorkflow.deriveStageStates(workflowState),
          masterBrief: (await this.pathExists(`${directory}/planning/master-brief.md`)) ? await this.readText(`${directory}/planning/master-brief.md`) : "",
          diagnosis: (await this.pathExists(`${directory}/planning/diagnosis.md`)) ? await this.readText(`${directory}/planning/diagnosis.md`) : "",
          userMaterial: (await this.pathExists(`${directory}/planning/user-material.md`)) ? (await this.readText(`${directory}/planning/user-material.md`)).replace(/^# 用户补充材料\s*/u, "").trim() : "",
          researchRequest: (await this.pathExists(`${directory}/planning/research-request.md`)) ? (await this.readText(`${directory}/planning/research-request.md`)).replace(/^# (?:联网研究指导|联网研究任务)\s*/u, "").trim() : "",
          wechatOutline: (await this.pathExists(`${directory}/deliverables/wechat/wechat-001/outline.md`)) ? await this.readText(`${directory}/deliverables/wechat/wechat-001/outline.md`) : "",
          wechatIllustrationPlan: (await this.pathExists(`${directory}/deliverables/wechat/wechat-001/illustration-plan.md`)) ? await this.readText(`${directory}/deliverables/wechat/wechat-001/illustration-plan.md`) : "",
          xhsPlan: (await this.pathExists(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`)) ? await this.readText(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`) : "",
          xhsProposals,
          wechatDraft: (await this.pathExists(`${directory}/deliverables/wechat/wechat-001/drafts/v1.md`)) ? await this.readText(`${directory}/deliverables/wechat/wechat-001/drafts/v1.md`) : "",
          wechatVisualManifest: (await this.pathExists(`${directory}/deliverables/wechat/wechat-001/visuals/manifest.md`)) ? await this.readText(`${directory}/deliverables/wechat/wechat-001/visuals/manifest.md`) : "",
          wechatVisualFiles: this.getVaultFiles()
            .filter((item) => normalizePath(item.path || "").startsWith(`${directory}/deliverables/wechat/wechat-001/visuals/`) && /\.(?:png|jpe?g|webp|svg)$/i.test(item.name || ""))
            .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), undefined, { numeric: true, sensitivity: "base" })),
          xhsCaption: (await this.pathExists(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`)) ? await this.readText(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/caption.md`) : "",
          xhsCardsManifest: (await this.pathExists(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/cards-manifest.md`)) ? await this.readText(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/cards-manifest.md`) : "",
          xhsImageFiles: this.getVaultFiles()
            .filter((item) => normalizePath(item.path || "").startsWith(`${directory}/deliverables/xiaohongshu/xiaohongshu-001/images/`) && /\.(?:png|jpe?g|webp|svg)$/i.test(item.name || ""))
            .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), undefined, { numeric: true, sensitivity: "base" })),
          tasks: projectTasks,
          latestTask: projectTasks[0] || null,
          latestPublication,
        });
      } catch (error) {
        await this.writeDiagnosticEvent("error", "creation-project-read", { path, error: this.errorToDiagnostic(error) });
      }
    }
    return projects.sort((left, right) => String(right.updated).localeCompare(String(left.updated)) || right.path.localeCompare(left.path));
  }

  async openCreationProjectFile(projectPath) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(projectPath));
    if (!this.isFile(file)) {
      new Notice("找不到创作项目文件。");
      return;
    }
    await this.openFile(file);
  }

  async openCreationProjectDirectory(directory) {
    const explorerLeaf = this.app.workspace.getLeavesOfType ? this.app.workspace.getLeavesOfType("file-explorer")[0] : null;
    if (explorerLeaf && explorerLeaf.view && typeof explorerLeaf.view.revealInFolder === "function") {
      await explorerLeaf.view.revealInFolder(normalizePath(directory));
      return;
    }
    new Notice(`项目目录：${directory}`);
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
      const capture = await this.captureForFile(file, {
        selectedText,
        note: "",
        type: "highlight",
        heading: "标注记录",
      });
      await reader.renderKeepingScroll({ annotationId: capture && capture.annotationId });
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
      this.openTypedCaptureModal(file, selectedText, recordType, async (capture) => reader.renderKeepingScroll({ annotationId: capture && capture.annotationId }));
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
      isTopic ? "加入创作灵感" : "加入事实待核查",
      isTopic ? "写下这个灵感、问题或补充说明。" : "写下需要核查的问题或说明。",
      async (note) => {
        const finalNote = note || selectedText;
        if (!finalNote && !selectedText) {
          new Notice("没有可记录的内容。");
          return;
        }
        const capture = await this.captureForFile(file, {
          selectedText,
          note: finalNote,
          type: recordType,
          heading: isTopic ? CREATIVE_IDEA_SECTION : "事实待核查",
        });
        if (afterSave) await afterSave(capture);
      },
      {
        previewText: this.previewSelectedText(selectedText),
        onError: (error) => this.writeDiagnosticEvent("error", `${recordType}-save`, this.errorToDiagnostic(error)),
      }
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
      {
        includeTypeSelect: true,
        previewText: this.previewSelectedText(selectedText),
        onError: (error) => this.writeDiagnosticEvent("error", "markdown-selection-save", this.errorToDiagnostic(error)),
      }
    ).open();
  }

  resolveRecordTarget(recordType, note) {
    if (recordType === "topic") {
      return { heading: CREATIVE_IDEA_SECTION, type: "topic" };
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
    const feedbackItems = await this.loadTopicMinerFeedback();
    const feedbackById = new Map(feedbackItems.filter((item) => item.candidateId).map((item) => [item.candidateId, item]));
    const feedbackByTitle = new Map(feedbackItems.filter((item) => item.title).map((item) => [item.title, item]));
    const items = [];
    for (const [sourcePath, entry] of Object.entries(sources)) {
      if (!entry || !entry.reading_note_path) continue;
      try {
        const markdown = await this.readText(entry.reading_note_path);
        const annotations = this.parseAnnotationsFromReadingNote(markdown).filter((item) => this.annotationMatchesFilter(item, "topic"));
        for (const annotation of annotations) {
          const manualId = `${entry.reading_note_path}#${annotation.id}`;
          const feedback = feedbackById.get(manualId) || feedbackByTitle.get(annotation.note) || null;
          items.push({
            id: manualId,
            kind: "manual",
            originLabel: "人工灵感",
            feedback: feedback ? feedback.feedback : "待定",
            feedbackNote: feedback ? feedback.note : "",
            feedbackUpdatedAt: feedback ? feedback.updatedAt : "",
            time: annotation.time || "",
            updatedAt: feedback && feedback.updatedAt ? feedback.updatedAt : annotation.time || entry.updated || "",
            sortDate: this.topicPoolManualSortDate(sourcePath, entry, annotation),
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
        // A missing or malformed reading note should not block the creative ideas view.
      }
    }
    items.push(...(await this.buildTopicMinerCandidateItems(feedbackItems)));
    return items.sort((left, right) => this.compareTopicPoolItems(left, right));
  }

  compareTopicPoolItems(left, right) {
    const leftKey = this.topicPoolSortDate(left);
    const rightKey = this.topicPoolSortDate(right);
    const dateOrder = String(rightKey).localeCompare(String(leftKey));
    if (dateOrder !== 0) return dateOrder;
    if (left.kind !== right.kind) return left.kind === "manual" ? -1 : 1;
    return String(this.topicPoolSortTitle(left)).localeCompare(String(this.topicPoolSortTitle(right)));
  }

  topicPoolSortDate(item) {
    if (!item) return "";
    if (item.sortDate) return item.sortDate;
    if (item.kind === "ai") return item.reportDate || this.dateFromTopicPath(item.reportPath) || "";
    return this.dateFromTopicPath(item.sourcePath) || this.dateFromTopicPath(item.readingNotePath) || this.dateFromTimestamp(item.time) || this.dateFromTimestamp(item.updatedAt) || "";
  }

  topicPoolSortTitle(item) {
    return item && (item.title || item.note || item.quote || item.id) || "";
  }

  topicPoolManualSortDate(sourcePath, entry, annotation) {
    return this.dateFromTopicPath(sourcePath)
      || this.dateFromTopicPath(entry && entry.reading_note_path)
      || this.dateFromTimestamp(annotation && annotation.time)
      || this.dateFromTimestamp(entry && entry.updated)
      || "";
  }

  dateFromTopicPath(value) {
    const text = String(value || "");
    const dashed = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    const compact = text.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
    return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : "";
  }

  dateFromTimestamp(value) {
    const match = String(value || "").match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  async buildTopicMinerCandidateItems(feedbackItems = null) {
    if (!feedbackItems) feedbackItems = await this.loadTopicMinerFeedback();
    const projectedCandidates = await this.loadTopicMinerProjectionCandidates(feedbackItems);
    if (projectedCandidates) return projectedCandidates;

    const feedbackById = new Map(feedbackItems.filter((item) => item.candidateId).map((item) => [item.candidateId, item]));
    const feedbackByTitle = new Map(feedbackItems.filter((item) => item.title).map((item) => [item.title, item]));
    const candidates = [];

    for (const reportFile of await this.getTopicMinerReportFiles()) {
      try {
        const markdown = await this.readText(reportFile.path);
        for (const candidate of this.parseTopicMinerReport(markdown, reportFile.path)) {
          const feedback = feedbackById.get(candidate.id) || feedbackByTitle.get(candidate.title) || null;
          candidates.push(Object.assign({}, candidate, {
            feedback: feedback ? feedback.feedback : candidate.feedback,
            feedbackNote: feedback ? feedback.note : "",
            feedbackUpdatedAt: feedback ? feedback.updatedAt : "",
            updatedAt: feedback && feedback.updatedAt ? feedback.updatedAt : candidate.updatedAt,
          }));
        }
      } catch (error) {
        // A broken report should not block manual creative ideas.
      }
    }

    return candidates;
  }

  async loadTopicMinerProjectionCandidates(feedbackItems = null) {
    try {
      const current = await this.loadTopicMinerCurrentProjection();
      const viewPath = normalizePath((current && current.viewPath) || TOPIC_MINER_VIEW_PATH);
      if (!(await this.pathExists(viewPath))) return null;
      const view = JSON.parse(await this.readText(viewPath));
      if (!view || view.schemaVersion !== 1 || !Array.isArray(view.items)) return null;
      const reportDate = String(view.reportDate || (current && current.latestReportDate) || "").trim();
      const reportPath = normalizePath(
        (current && current.reportPath)
          || (reportDate ? `${TOPIC_MINER_ROOT}/reports/${reportDate}.md` : "")
      );
      return this.normalizeTopicMinerProjectionItems({
        items: view.items,
        reportDate,
        reportPath,
        feedbackItems: feedbackItems || [],
      });
    } catch (error) {
      return null;
    }
  }

  async loadTopicMinerCurrentProjection() {
    if (!(await this.pathExists(TOPIC_MINER_CURRENT_PATH))) return null;
    try {
      return JSON.parse(await this.readText(TOPIC_MINER_CURRENT_PATH));
    } catch (error) {
      return null;
    }
  }

  normalizeTopicMinerProjectionItems({ items, reportDate, reportPath, feedbackItems }) {
    const feedbackById = new Map((feedbackItems || []).filter((item) => item.candidateId).map((item) => [item.candidateId, item]));
    const feedbackByTitle = new Map((feedbackItems || []).filter((item) => item.title).map((item) => [item.title, item]));
    return (items || []).map((item, index) => {
      const id = String(item.candidateId || item.id || this.topicMinerCandidateId(reportDate, "strong", index + 1)).trim();
      const title = String(item.title || item.name || "未命名选题").trim();
      const feedback = feedbackById.get(id) || feedbackByTitle.get(title) || null;
      const sourcePaths = Array.isArray(item.sourcePaths)
        ? item.sourcePaths.map((sourcePath) => normalizePath(sourcePath)).filter(Boolean)
        : [];
      const sourceLabels = Array.isArray(item.sourceLabels)
        ? item.sourceLabels.map((label) => String(label || "").trim()).filter(Boolean)
        : [];
      const updatedAt = String((feedback && feedback.updatedAt) || item.updatedAt || item.createdAt || reportDate || "").trim();
      return {
        id,
        kind: "ai",
        originLabel: String(item.source || item.originLabel || "AI 推荐").trim() || "AI 推荐",
        reportDate: String(item.reportDate || reportDate || "").trim(),
        reportPath,
        title,
        feedback: feedback ? feedback.feedback : this.normalizeTopicFeedback(item.feedback || item.status),
        feedbackNote: feedback ? feedback.note : String(item.feedbackNote || item.noteForAi || "").trim(),
        feedbackUpdatedAt: feedback ? feedback.updatedAt : "",
        updatedAt,
        sortDate: String(item.sortDate || item.reportDate || reportDate || updatedAt || "").trim(),
        sourceType: String(item.sourceType || item.type || "").trim(),
        timing: String(item.timing || item.timeJudgment || "").trim(),
        duplicationRisk: String(item.duplicateRisk || item.duplicationRisk || item.repetitionRisk || "").trim(),
        maturity: String(item.maturity || "").trim(),
        judgment: String(item.judgment || item.summary || item.coreJudgment || "").trim(),
        whyNow: String(item.whyNow || "").trim(),
        relationship: String(item.relationship || item.publishedRelationship || "").trim(),
        firstAction: String(item.firstAction || item.nextAction || "").trim(),
        reason: String(item.reason || "").trim(),
        sources: sourcePaths,
        sourceLabels,
        sourcePath: sourcePaths[0] || "",
        sourceTitle: sourceLabels[0] || sourcePaths[0] || "",
      };
    });
  }

  async getTopicMinerReportFiles() {
    const files = typeof this.app.vault.getMarkdownFiles === "function" ? this.app.vault.getMarkdownFiles() : [];
    const indexedFiles = files
      .filter((file) => file && typeof file.path === "string" && normalizePath(file.path).startsWith(`${TOPIC_MINER_ROOT}/reports/`))
      .map((file) => this.makeFileRef(file.path));
    const adapterFiles = await this.listTopicMinerReportFilesFromAdapter();
    const byPath = new Map();
    for (const file of [...indexedFiles, ...adapterFiles]) {
      if (file && file.path) byPath.set(normalizePath(file.path), this.makeFileRef(file.path));
    }
    return [...byPath.values()].sort((left, right) => String(right.path).localeCompare(String(left.path)));
  }

  async listTopicMinerReportFilesFromAdapter() {
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (!adapter || typeof adapter.list !== "function") return [];
    try {
      const listed = await adapter.list(`${TOPIC_MINER_ROOT}/reports`);
      const paths = Array.isArray(listed && listed.files) ? listed.files : [];
      return paths
        .filter((filePath) => /\.md$/i.test(String(filePath || "")))
        .map((filePath) => this.makeFileRef(filePath));
    } catch (error) {
      return [];
    }
  }

  parseTopicMinerReport(markdown, reportPath = "") {
    const text = String(markdown || "");
    const reportDate = (text.match(/^#\s+AI 选题候选\s*-\s*(\d{4}-\d{2}-\d{2})/m) || [])[1] || this.dateFromTopicMinerPath(reportPath);
    const lines = text.split(/\r?\n/);
    const candidates = [];
    let current = null;

    const finish = () => {
      if (!current) return;
      const parsed = this.parseTopicMinerCandidateBlock(current.lines);
      candidates.push(Object.assign({
        id: this.topicMinerCandidateId(reportDate, current.kind, current.index),
        kind: "ai",
        originLabel: "AI 推荐",
        reportDate,
        reportPath,
        title: current.title,
        updatedAt: reportDate,
        sortDate: reportDate,
      }, parsed));
    };

    for (const line of lines) {
      const heading = line.match(/^###\s+(?:(B)(\d+)|(\d+))\.\s*(.+?)\s*$/);
      if (heading) {
        finish();
        const isBackup = !!heading[1];
        current = {
          kind: isBackup ? "backup" : "strong",
          index: Number(heading[2] || heading[3] || candidates.length + 1),
          title: heading[4].trim(),
          lines: [],
        };
        continue;
      }
      if (current) current.lines.push(line);
    }
    finish();
    return candidates;
  }

  parseTopicMinerCandidateBlock(lines) {
    const body = lines.join("\n");
    const valueAfter = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = body.match(new RegExp(`^${escaped}：\\s*(.*?)\\s*$`, "m"));
      return match ? this.cleanTopicMinerField(match[1]) : "";
    };
    return {
      feedback: this.normalizeTopicFeedback(valueAfter("反馈")),
      sourceType: valueAfter("来源类型"),
      fit: valueAfter("适配度"),
      novelty: valueAfter("新鲜度"),
      writeability: valueAfter("可写性"),
      timing: valueAfter("时机判断"),
      duplicationRisk: valueAfter("重复风险"),
      maturity: valueAfter("选题成立度"),
      judgment: this.readTopicMinerSection(lines, "核心判断"),
      whyNow: this.readTopicMinerSection(lines, "为什么现在值得写"),
      sources: this.readTopicMinerListSection(lines, "素材来源"),
      relationship: this.readTopicMinerSection(lines, "与已发布内容关系"),
      firstAction: this.readTopicMinerSection(lines, "第一动作"),
      reason: this.readTopicMinerSection(lines, "为什么暂时放入备选"),
    };
  }

  readTopicMinerSection(lines, label) {
    const collected = this.readTopicMinerSectionLines(lines, label);
    return collected.join("\n").trim();
  }

  readTopicMinerListSection(lines, label) {
    return this.readTopicMinerSectionLines(lines, label)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  readTopicMinerSectionLines(lines, label) {
    const result = [];
    let collecting = false;
    const labelPattern = /^[\u4e00-\u9fa5A-Za-z0-9/（）()]+：/;
    for (const line of lines) {
      const trimmed = line.trim();
      const fieldLine = trimmed.replace(/^[-*]\s+/, "");
      if (fieldLine.startsWith(`${label}：`)) {
        const inlineValue = this.cleanTopicMinerField(fieldLine.slice(`${label}：`.length));
        collecting = true;
        if (inlineValue) result.push(inlineValue);
        continue;
      }
      if (!collecting) continue;
      if (labelPattern.test(fieldLine)) break;
      if (!trimmed && !result.length) continue;
      if (!trimmed && result.length) break;
      result.push(this.cleanTopicMinerField(trimmed));
    }
    return result;
  }

  cleanTopicMinerField(value) {
    return String(value || "").trim().replace(/\\$/, "").trim();
  }

  topicMinerCandidateId(reportDate, kind, index) {
    const safeDate = reportDate || "unknown-date";
    return `${safeDate}-${kind === "backup" ? "backup" : "strong"}-${String(index || 1).padStart(2, "0")}`;
  }

  dateFromTopicMinerPath(reportPath) {
    return (String(reportPath || "").match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  }

  async loadTopicMinerFeedback() {
    if (!(await this.pathExists(TOPIC_MINER_FEEDBACK_PATH))) return [];
    try {
      return this.parseTopicMinerFeedback(await this.readText(TOPIC_MINER_FEEDBACK_PATH));
    } catch (error) {
      return [];
    }
  }

  parseTopicMinerFeedback(text) {
    const latest = new Map();
    for (const line of String(text || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw;
      try {
        raw = JSON.parse(trimmed);
      } catch (error) {
        continue;
      }
      const item = {
        candidateId: String(raw.candidateId || raw.id || "").trim(),
        title: String(raw.title || "").trim(),
        feedback: this.normalizeTopicFeedback(raw.feedback),
        note: String(raw.note || "").trim(),
        source: String(raw.source || "").trim(),
        kind: String(raw.kind || "").trim(),
        reportDate: String(raw.reportDate || "").trim(),
        sourcePath: String(raw.sourcePath || "").trim(),
        readingNotePath: String(raw.readingNotePath || "").trim(),
        updatedAt: String(raw.updatedAt || "").trim(),
      };
      if (!item.candidateId && !item.title) continue;
      const key = item.candidateId || item.title;
      const previous = latest.get(key);
      if (!previous || this.compareTopicFeedbackTime(item.updatedAt, previous.updatedAt) >= 0) latest.set(key, item);
    }
    return [...latest.values()];
  }

  normalizeTopicFeedback(value) {
    const normalized = String(value || "待定").trim().replace(/^`+|`+$/g, "");
    return TOPIC_FEEDBACK_OPTIONS.includes(normalized) ? normalized : "待定";
  }

  compareTopicFeedbackTime(left, right) {
    const leftTime = Date.parse(left || "");
    const rightTime = Date.parse(right || "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
    if (Number.isFinite(leftTime)) return 1;
    if (Number.isFinite(rightTime)) return -1;
    return 0;
  }

  async saveTopicMinerFeedback(item, feedback, note) {
    const record = {
      candidateId: String((item && item.id) || (item && item.candidateId) || "").trim(),
      title: String((item && item.title) || (item && item.note) || "").trim(),
      feedback: this.normalizeTopicFeedback(feedback),
      note: String(note || "").trim(),
      source: "reading-capture-plugin",
      kind: String((item && item.kind) || "ai").trim() || "ai",
      reportDate: String((item && item.reportDate) || "").trim(),
      updatedAt: this.now(),
    };
    const sourcePath = String((item && item.sourcePath) || "").trim();
    const readingNotePath = String((item && item.readingNotePath) || "").trim();
    if (sourcePath) record.sourcePath = sourcePath;
    if (readingNotePath) record.readingNotePath = readingNotePath;
    await this.ensureFolderForPath(TOPIC_MINER_FEEDBACK_PATH);
    const previous = (await this.pathExists(TOPIC_MINER_FEEDBACK_PATH)) ? await this.readText(TOPIC_MINER_FEEDBACK_PATH) : "";
    const next = `${previous.replace(/\s*$/g, "")}${previous.trim() ? "\n" : ""}${JSON.stringify(record)}\n`;
    await this.writeText(TOPIC_MINER_FEEDBACK_PATH, next);
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
    this.settings.readerFontSize = clampReaderFontSize(this.settings.readerFontSize);
    this.settings.readerLineHeight = normalizeReaderLineHeight(this.settings.readerLineHeight);
    this.settings.creationProjectRoot = normalizePath(this.settings.creationProjectRoot || DEFAULT_SETTINGS.creationProjectRoot);
    this.settings.wechatPublishingRoot = normalizePath(this.settings.wechatPublishingRoot || DEFAULT_SETTINGS.wechatPublishingRoot);
    this.settings.xiaohongshuPublishingRoot = normalizePath(this.settings.xiaohongshuPublishingRoot || DEFAULT_SETTINGS.xiaohongshuPublishingRoot);
    this.settings.defaultWritingStyle = "keke";
  }

  async saveSettings() {
    await this.saveData(
      Object.assign({}, this.settings, {
        articleLibraryCache: this.normalizeArticleLibraryCache(this.articleLibraryCache),
        articleLibrarySnapshot: this.getArticleLibrarySnapshot(),
      })
    );
  }

  withDiagnostics(action, callback) {
    return async (...args) => this.runWithDiagnostics(action, () => callback(...args));
  }

  async runWithDiagnostics(action, callback) {
    try {
      return await callback();
    } catch (error) {
      console.error(`Reading Capture failed: ${action}`, error);
      await this.writeDiagnosticEvent("error", action, this.errorToDiagnostic(error));
      new Notice(`Reading Capture 操作失败：${this.describeError(error)}`, 8000);
      return null;
    }
  }

  registerGlobalErrorHandlers() {
    if (typeof window === "undefined" || !window || typeof window.addEventListener !== "function") return;
    const onError = (event) => {
      const message = event && event.message ? event.message : "Unhandled window error";
      this.writeDiagnosticEvent("error", "window-error", {
        message,
        filename: event && event.filename ? event.filename : "",
        line: event && event.lineno ? event.lineno : "",
        column: event && event.colno ? event.colno : "",
        error: this.errorToDiagnostic(event && event.error ? event.error : message),
      });
    };
    const onUnhandledRejection = (event) => {
      this.writeDiagnosticEvent("error", "unhandled-rejection", this.errorToDiagnostic(event && event.reason ? event.reason : "Unhandled promise rejection"));
    };

    if (typeof this.registerDomEvent === "function") {
      this.registerDomEvent(window, "error", onError);
      this.registerDomEvent(window, "unhandledrejection", onUnhandledRejection);
      return;
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    if (typeof this.register === "function") {
      this.register(() => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onUnhandledRejection);
      });
    }
  }

  async writeDiagnosticEvent(level, action, details = {}) {
    if (!this.app || !this.app.vault) return;
    try {
      const entry = {
        time: this.now(),
        level,
        action,
        details,
      };
      const previous = await this.readDiagnosticLog();
      const next = `${previous}${previous ? "\n" : ""}${JSON.stringify(entry)}`;
      const trimmed = next.length > DIAGNOSTIC_LOG_MAX_CHARS ? next.slice(next.length - DIAGNOSTIC_LOG_MAX_CHARS) : next;
      await this.ensureFolderForPath(DIAGNOSTIC_LOG_PATH);
      await this.writeText(DIAGNOSTIC_LOG_PATH, trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`);
    } catch (error) {
      // Diagnostics must never block normal plugin usage.
    }
  }

  async readDiagnosticLog() {
    try {
      if (!(await this.pathExists(DIAGNOSTIC_LOG_PATH))) return "";
      return await this.readText(DIAGNOSTIC_LOG_PATH);
    } catch (error) {
      return "";
    }
  }

  async exportDiagnosticReport() {
    const report = await this.buildDiagnosticReport();
    await this.ensureFolderForPath(DIAGNOSTIC_REPORT_PATH);
    await this.writeText(DIAGNOSTIC_REPORT_PATH, report);
    const file = this.app.vault.getAbstractFileByPath(DIAGNOSTIC_REPORT_PATH) || this.makeFileRef(DIAGNOSTIC_REPORT_PATH);
    await this.openFile(file);
    new Notice("Reading Capture 诊断报告已生成。");
  }

  async buildDiagnosticReport() {
    const runtimeInfo = this.getRuntimeInfo();
    const runtimeFiles = await this.getRuntimeFileStatus();
    const log = await this.readDiagnosticLog();
    const settings = this.getSanitizedSettings();
    return [
      "# Reading Capture 诊断报告",
      "",
      "请把这份文件内容发给插件作者，用于排查插件加载、划线、保存标注或打开视图失败的问题。",
      "",
      "## 基本信息",
      "",
      `- 生成时间：${this.now()}`,
      `- 插件版本：${runtimeInfo.pluginVersion}`,
      `- Obsidian 版本：${runtimeInfo.obsidianVersion}`,
      `- 操作系统 / 客户端：${runtimeInfo.platform}`,
      `- 用户代理：${runtimeInfo.userAgent}`,
      `- 插件 ID：${runtimeInfo.pluginId}`,
      `- 插件目录：${runtimeInfo.pluginDir}`,
      `- Vault 名称：${runtimeInfo.vaultName}`,
      "",
      "## 当前配置",
      "",
      "```json",
      JSON.stringify(settings, null, 2),
      "```",
      "",
      "## 运行文件检查",
      "",
      "```json",
      JSON.stringify(runtimeFiles, null, 2),
      "```",
      "",
      "## 最近诊断日志",
      "",
      "```jsonl",
      log.trim() || "暂无诊断日志。",
      "```",
      "",
    ].join("\n");
  }

  getRuntimeInfo() {
    const manifest = this.manifest || {};
    const appVersion = this.app && typeof this.app.getVersion === "function" ? this.app.getVersion() : "";
    const vaultName = this.app && this.app.vault && typeof this.app.vault.getName === "function" ? this.app.vault.getName() : "";
    return {
      pluginId: manifest.id || "reading-capture",
      pluginVersion: manifest.version || "unknown",
      pluginDir: manifest.dir || "",
      obsidianVersion: appVersion || "unknown",
      platform: this.getPlatformInfo(),
      userAgent: typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "",
      vaultName,
    };
  }

  getPlatformInfo() {
    if (typeof navigator === "undefined" || !navigator) return "unknown";
    return [navigator.platform || "", navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : ""].filter(Boolean).join(" / ") || "unknown";
  }

  getSanitizedSettings() {
    return {
      readingRoot: this.settings && this.settings.readingRoot ? this.settings.readingRoot : DEFAULT_SETTINGS.readingRoot,
      openNoteAfterCapture: !!(this.settings && this.settings.openNoteAfterCapture),
      articleLibraryRoots: this.settings && this.settings.articleLibraryRoots ? this.settings.articleLibraryRoots : "",
      articleLibraryExcludeRoots: this.settings && this.settings.articleLibraryExcludeRoots ? this.settings.articleLibraryExcludeRoots : "",
    };
  }

  async getRuntimeFileStatus() {
    const manifest = this.manifest || {};
    const pluginId = manifest.id || "reading-capture";
    const pluginDir = manifest.dir || `.obsidian/plugins/${pluginId}`;
    const candidates = RUNTIME_FILE_NAMES.map((fileName) => normalizePath(`${pluginDir}/${fileName}`));
    const status = {};
    for (const filePath of candidates) {
      status[filePath] = await this.pathExists(filePath);
    }
    return status;
  }

  errorToDiagnostic(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack || "",
      };
    }
    return {
      name: typeof error,
      message: String(error),
      stack: "",
    };
  }

  describeError(error) {
    if (error && error.message) return String(error.message).slice(0, 120);
    return String(error).slice(0, 120);
  }

  async captureForFile(file, { selectedText, note, type, heading, media = null }) {
    if (!this.isFile(file)) {
      new Notice("没有找到当前文件。");
      return null;
    }
    if (file.path.startsWith(`${this.settings.readingRoot}/`)) {
      new Notice("当前文件已经是阅读记录，请在源文档中标注。");
      return null;
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
    const annotationMatch = block.match(/^###\s+(\S+)/m);
    return {
      annotationId: annotationMatch ? annotationMatch[1] : "",
      noteFile,
    };
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
    if (item.mediaType === "image") return item.type === "topic" ? "图片灵感" : item.type === "fact-check" ? "图片待核查" : "图片想法";
    if (this.isTopicSection(item.section) || item.type === "topic") return CREATIVE_IDEA_SECTION;
    if (item.section === "事实待核查" || item.type === "fact-check") return "事实待核查";
    if (item.type === "idea" || !item.quote) return "想法";
    if (item.note) return "标注想法";
    return "高亮";
  }

  typeClass(item) {
    if (!item) return "is-thought";
    if (item.mediaType === "image") return "is-image";
    if (this.isTopicSection(item.section) || item.type === "topic") return "is-topic";
    if (item.section === "事实待核查" || item.type === "fact-check") return "is-fact";
    if (!item.quote || item.type === "idea") return "is-idea";
    return "is-thought";
  }

  annotationMatchesFilter(item, filter) {
    if (!item) return false;
    if (!filter || filter === "all") return true;
    if (filter === "unlocated") return !item.located && !!(item.quote || item.mediaType);
    if (filter === "image") return item.mediaType === "image";
    if (filter === "topic") return this.isTopicSection(item.section) || item.type === "topic";
    if (filter === "fact") return item.section === "事实待核查" || item.type === "fact-check";
    if (filter === "thought") return item.mediaType !== "image" && !(this.isTopicSection(item.section) || item.type === "topic") && !(item.section === "事实待核查" || item.type === "fact-check");
    return true;
  }

  isTopicSection(section) {
    return section === CREATIVE_IDEA_SECTION || section === LEGACY_TOPIC_SECTION;
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
    const adapter = this.app.vault.adapter;
    if (this.isCreationCoordinationPath(normalized) && adapter && typeof adapter.read === "function") return adapter.read(normalized);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (this.isFile(file)) return this.app.vault.read(file);
    if (adapter && typeof adapter.read === "function") return adapter.read(normalized);
    throw new Error(`Cannot read file: ${normalized}`);
  }

  async readFreshText(filePath) {
    const normalized = normalizePath(filePath);
    const adapter = this.app && this.app.vault ? this.app.vault.adapter : null;
    if (adapter && typeof adapter.read === "function") return adapter.read(normalized);
    return this.readText(normalized);
  }

  resolveAdapterListedPath(basePath, listedPath) {
    const base = normalizePath(String(basePath || "")).replace(/\/+$/g, "");
    const listed = normalizePath(String(listedPath || "")).replace(/^\/+/, "");
    if (!listed) return base;
    if (listed === base || listed.startsWith(`${base}/`)) return listed;
    return `${base}/${listed}`;
  }

  isCreationCoordinationPath(filePath) {
    const root = normalizePath((this.settings && this.settings.creationProjectRoot) || DEFAULT_SETTINGS.creationProjectRoot).replace(/\/+$/g, "");
    const normalized = normalizePath(String(filePath || ""));
    return normalized === root || normalized.startsWith(`${root}/`);
  }

  async writeText(filePath, content) {
    const normalized = normalizePath(filePath);
    const adapter = this.app.vault.adapter;
    if (this.isCreationCoordinationPath(normalized) && adapter && typeof adapter.write === "function") {
      await adapter.write(normalized, content);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (this.isFile(file)) {
      await this.app.vault.modify(file, content);
      return;
    }
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
