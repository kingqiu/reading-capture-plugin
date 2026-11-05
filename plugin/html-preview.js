const { HtmlAnnotations } = require("./html-annotations");
// Static HTML documents are prepared off-screen. Only rewritten, vault-contained
// assets are allowed by the frame's CSP; page scripts never execute.
const VIEW_TYPE = "reading-capture-html";
const CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function resolveReference(reference, sourcePath) {
  const raw = String(reference || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return { anchor: raw.slice(1) };
  if (/^https?:\/\//i.test(raw)) return { external: raw };
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("/") || raw.includes("\\")) return null;
  const [filePart] = raw.split(/[?#]/);
  let decoded;
  try { decoded = decodeURIComponent(filePart); } catch { return null; }
  if (/[\x00-\x1f\\]/.test(decoded) || decoded.startsWith("/") || decoded.includes(":")) return null;
  const parts = sourcePath.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  // Hidden configuration files aren't article assets.
  if (parts.some((part) => part.startsWith("."))) return null;
  return { path: parts.join("/"), anchor: raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : "" };
}

async function checkedVaultFile(plugin, path) {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!plugin.isFile(file)) throw new Error("找不到文件，请检查文件是否已移动或删除。");
  const adapter = plugin.app.vault.adapter;
  // Desktop adapters can contain symlinks: enforce the physical vault boundary.
  if (typeof adapter.getBasePath === "function") {
    const fs = require("fs");
    const nodePath = require("path");
    const root = await fs.promises.realpath(adapter.getBasePath());
    const actual = await fs.promises.realpath(nodePath.join(root, path));
    const relative = nodePath.relative(root, actual);
    if (relative.startsWith(`..${nodePath.sep}`) || relative === ".." || nodePath.isAbsolute(relative)) throw new Error("文件位于仓库外，无法预览。");
  }
  return file;
}

async function prepareHtml(plugin, sourcePath, source, hostDocument) {
  const win = hostDocument.defaultView;
  const warnings = new Set();
  const doc = new win.DOMParser().parseFromString(source, "text/html");
  // Detached documents have no CSSOM in Chromium. A hidden, policy-restricted
  // frame supplies a real CSS parser without allowing imports to hit the network.
  const parserFrame = hostDocument.createElement("iframe");
  parserFrame.hidden = true;
  parserFrame.setAttribute("sandbox", "allow-same-origin");
  const parserReady = new Promise((resolve, reject) => {
    const timeout = win.setTimeout(() => reject(new Error("样式解析器初始化超时，请刷新重试。")), 10000);
    parserFrame.onload = () => { win.clearTimeout(timeout); resolve(); };
    parserFrame.onerror = () => { win.clearTimeout(timeout); reject(new Error("无法初始化样式解析器")); };
  });
  parserFrame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`;
  hostDocument.body.append(parserFrame);
  try {
    await parserReady;
    const links = new Map();
    const assets = new Map();
    const sources = new Map();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };
    const warn = () => warnings.add("部分资源缺失或被阻止，页面可能显示不完整。");
    async function asset(raw, base) {
      if (/^data:(image\/(?:png|jpeg|gif|webp|avif|svg\+xml|x-icon)|font\/[\w-]+)[;,]/i.test(raw)) return raw;
      const ref = resolveReference(raw, base);
      if (ref && !ref.path && ref.anchor != null) return `#${ref.anchor}`;
      if (!ref || !ref.path) { warn(); return "data:,"; }
      if (!assets.has(ref.path)) assets.set(ref.path, (async () => {
        try {
          const ext = ref.path.split(".").pop().toLowerCase();
          if (!mime[ext]) throw new Error("unsupported asset");
          const file = await checkedVaultFile(plugin, ref.path);
          const bytes = await plugin.app.vault.readBinary(file);
          return `data:${mime[ext]};base64,${Buffer.from(bytes).toString("base64")}`;
        } catch { warn(); return "data:,"; }
      })());
      const url = (await assets.get(ref.path)) + (ref.anchor ? `#${ref.anchor}` : "");
      sources.set(url, ref.path);
      return url;
    }
    function cssUnescape(value) {
      return value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, literal) => literal || String.fromCodePoint(parseInt(hex, 16) || 0xfffd));
    }
    async function rewriteUrls(text, base) {
      const matches = [...text.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi)];
      for (const match of matches.reverse()) {
        const url = await asset(cssUnescape((match[1] ?? match[2] ?? match[3]).trim()), base);
        text = text.slice(0, match.index) + `url("${url.replace(/"/g, "%22")}")` + text.slice(match.index + match[0].length);
      }
      return text;
    }
    async function css(text, base, ancestry = new Set()) {
      const detached = parserFrame.contentDocument;
      const style = detached.createElement("style");
      style.textContent = text;
      detached.head.append(style);
      async function rules(list) {
        const result = [];
        for (const rule of Array.from(list || [])) {
          if (rule.type === 3) {
            const ref = resolveReference(rule.href, base);
            if (!ref || !ref.path || ancestry.has(ref.path)) { warn(); continue; }
            try {
              const file = await checkedVaultFile(plugin, ref.path);
              const imported = await css(await plugin.app.vault.read(file), ref.path, new Set([...ancestry, ref.path]));
              result.push(rule.media.mediaText ? `@media ${rule.media.mediaText}{${imported}}` : imported);
            } catch { warn(); }
          } else if (rule.cssRules && !rule.style) {
            result.push(`${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${await rules(rule.cssRules)}}`);
          } else result.push(await rewriteUrls(rule.cssText, base));
        }
        return result.join("\n");
      }
      try { return await rules(style.sheet && style.sheet.cssRules); }
      finally { style.remove(); }
    }
    for (const node of doc.querySelectorAll("script,iframe,frame,frameset,object,embed,base,meta[http-equiv],template")) {
      if (node.matches("script,iframe,object,embed")) warnings.add("此预览不运行网页脚本或嵌入页面。");
      node.remove();
    }
    for (const node of doc.querySelectorAll("*")) {
      if (node.hasAttribute("srcset") && ["IMG", "SOURCE"].includes(node.tagName)) {
        const entries = [...node.getAttribute("srcset").matchAll(/(data:[^\s]+|[^\s,]+)(?:\s+(\d+(?:\.\d+)?[wx]))?/g)];
        const rewritten = [];
        for (const entry of entries) rewritten.push(`${await asset(entry[1].replace(/,+$/, ""), sourcePath)}${entry[2] ? ` ${entry[2]}` : ""}`);
        node.setAttribute("srcset", rewritten.join(", "));
      }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || ["srcdoc", "imagesrcset", "action", "formaction", "ping", "target", "download", "autofocus", "autoplay", "background", "manifest"].includes(name)) node.removeAttribute(attr.name);
      }
      if (node.hasAttribute("style")) node.setAttribute("style", await rewriteUrls(node.getAttribute("style"), sourcePath));
      if (node.tagName === "STYLE") node.textContent = await css(node.textContent, sourcePath);
      if (node.tagName === "LINK") {
        if (node.rel.toLowerCase() === "stylesheet") {
          const ref = resolveReference(node.getAttribute("href"), sourcePath);
          try {
            if (!ref || !ref.path) throw new Error("blocked stylesheet");
            const file = await checkedVaultFile(plugin, ref.path);
            const style = doc.createElement("style");
            style.textContent = await css(await plugin.app.vault.read(file), ref.path, new Set([ref.path]));
            if (node.media) style.media = node.media;
            node.replaceWith(style);
          } catch { warn(); node.remove(); }
        } else node.remove();
        continue;
      }
      if (node.hasAttribute("src")) {
        if (node.tagName === "IMG") node.setAttribute("src", await asset(node.getAttribute("src"), sourcePath));
        else node.removeAttribute("src");
      }
      if (node.hasAttribute("poster")) node.removeAttribute("poster");
      // Includes SVG links. Keep original targets out of the live document.
      for (const attr of ["href", "xlink:href"]) {
        if (!node.hasAttribute(attr)) continue;
        const raw = node.getAttribute(attr);
        if (["a", "area"].includes(node.localName)) {
          const id = String(links.size);
          links.set(id, resolveReference(raw, sourcePath));
          node.setAttribute("data-rc-link", id);
          node.setAttribute(attr, "#");
        } else node.setAttribute(attr, await asset(raw, sourcePath));
      }
    }
    const policy = doc.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = CSP;
    doc.head.prepend(policy);
    return { html: `<!doctype html>\n${doc.documentElement.outerHTML}`, links, warnings, sources };
  } finally { parserFrame.remove(); }
}

function createHtmlViewClass(ItemView) {
  return class HtmlPreviewView extends ItemView {
    constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.sourcePath = ""; this.generation = 0; this.pendingAnnotationId = ""; }
    getViewType() { return VIEW_TYPE; }
    getDisplayText() { return this.sourcePath.split("/").pop() || "HTML 预览"; }
    getIcon() { return "file-code"; }
    getState() { return { sourcePath: this.sourcePath }; }
    async setState(state, result) { this.sourcePath = state.sourcePath || ""; this.pendingAnnotationId = state.annotationId || ""; await this.render(); await super.setState(state, result); }
    async onOpen() { await this.render(); }
    async onClose() { this.closeContextMenu?.(); this.generation++; this.contentEl.empty(); this.containerEl.removeClass("reading-capture-html-leaf"); }
    showError(error) {
      const { Notice } = require("obsidian");
      new Notice(error.message || String(error));
    }
    setSidebarOpen(open) {
      this.plugin.settings.htmlSidebarOpen = open;
      if (this.sidebar) this.sidebar.hidden = !open;
      this.plugin.saveSettings().catch(error => this.showError(error));
    }
    setToolbarCollapsed(collapsed) {
      this.plugin.settings.htmlToolbarCollapsed = collapsed;
      this.contentEl.toggleClass("is-toolbar-collapsed", collapsed);
      this.plugin.saveSettings().catch(error => this.showError(error));
    }
    async render() {
      this.closeContextMenu?.();
      const generation = ++this.generation;
      const root = this.contentEl;
      root.empty(); root.addClass("reading-capture-html-preview");
      this.controller = null;
      this.containerEl.addClass("reading-capture-html-leaf");
      root.toggleClass("is-toolbar-collapsed", !!this.plugin.settings.htmlToolbarCollapsed);
      const toolbar = root.createDiv({ cls: "reading-capture-html-toolbar" });
      toolbar.createEl("button", { text: "刷新" }).addEventListener("click", () => this.render());
      toolbar.createEl("button", { text: "整篇想法" }).addEventListener("click", () => this.controller?.capture());
      toolbar.createEl("button", { text: "标注" }).addEventListener("click", () => this.setSidebarOpen(!this.plugin.settings.htmlSidebarOpen));
      const info = toolbar.createEl("button", { text: "更多", attr: { "aria-label": "页面状态与说明" } });
      toolbar.createEl("button", { text: "收起", attr: { "aria-label": "收起阅读工具条" } }).addEventListener("click", () => this.setToolbarCollapsed(true));
      root.createEl("button", { cls: "reading-capture-html-restore", text: "展开", attr: { "aria-label": "展开阅读工具条" } }).addEventListener("click", () => this.setToolbarCollapsed(false));
      const status = root.createDiv({ cls: "reading-capture-html-status", text: "正在加载…", attr: { role: "status" } });
      info.addEventListener("click", () => { status.hidden = !status.hidden; });
      const workspace = root.createDiv({ cls: "reading-capture-html-workspace" });
      const article = workspace.createDiv({ cls: "reading-capture-html-article" });
      this.sidebar = workspace.createEl("aside", { cls: "reading-capture-html-notes" });
      this.sidebar.hidden = !this.plugin.settings.htmlSidebarOpen;
      try {
        const file = await checkedVaultFile(this.plugin, this.sourcePath);
        const source = await this.app.vault.read(file);
        if (generation !== this.generation) return;
        if (!source.trim()) { status.textContent = "此 HTML 文件为空"; return; }
        const prepared = await prepareHtml(this.plugin, this.sourcePath, source, root.ownerDocument);
        if (generation !== this.generation) return;
        status.textContent = [...prepared.warnings].join(" ");
        status.textContent = status.textContent || "静态阅读：网页脚本和自动网络资源加载已禁用。";
        status.hidden = true;
        info.title = status.textContent;
        if ([...prepared.warnings].some(text => text.includes("资源"))) info.textContent = "⚠ 详情";
        const frame = article.createEl("iframe", { cls: "reading-capture-html-frame", attr: { sandbox: "allow-same-origin", title: this.getDisplayText(), referrerpolicy: "no-referrer" } });
        frame.addEventListener("load", async () => {
          const doc = frame.contentDocument;
          if (!doc) return;
          doc.addEventListener("submit", (event) => event.preventDefault(), true);
          doc.addEventListener("error", () => { info.textContent = "⚠ 详情"; status.textContent = "部分资源加载失败，页面可能显示不完整。"; info.title = status.textContent; }, true);
          const navigate = (event) => {
            const link = event.target.closest && event.target.closest("[data-rc-link]");
            if (!link) return;
            event.preventDefault();
            const ref = prepared.links.get(link.getAttribute("data-rc-link"));
            if (!ref) return;
            if (ref.external) { window.open(ref.external, "_blank", "noopener,noreferrer"); return; }
            if (!ref.path || ref.path === this.sourcePath) {
              let anchor = ref.anchor || "";
              try { anchor = decodeURIComponent(anchor); } catch { /* use literal anchor */ }
              const target = doc.getElementById(anchor) || doc.getElementsByName(anchor)[0];
              if (target) target.scrollIntoView();
              return;
            }
            if (/\.html?$/i.test(ref.path)) this.plugin.openHtmlPreview(ref.path);
          };
          doc.addEventListener("click", navigate, true);
          doc.addEventListener("auxclick", navigate, true);
          try {
            await doc.fonts.ready;
            if (generation !== this.generation) return;
            this.controller = new HtmlAnnotations(this, frame, this.sidebar, prepared.sources);
            await this.controller.initialize();
          } catch (error) { this.showError(error); }
        });
        frame.srcdoc = prepared.html;
      } catch (error) {
        if (generation !== this.generation) return;
        status.hidden = false; status.textContent = `无法预览：${error.message || error}`;
        status.addClass("reading-capture-error");
      }
    }
  };
}
module.exports = { VIEW_TYPE, checkedVaultFile, resolveReference, prepareHtml, createHtmlViewClass };
