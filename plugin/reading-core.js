const KNOWN_SOURCE_ROOTS = [
  "Learning/web/seaart_articles",
  "Learning/web/wechat_articles",
  "Learning/web/x_articles",
  "Learning/web/articles",
  "Learning/research",
  "Learning/papers",
  "Raw",
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

function buildReadingNotePath({ source, readingRoot = "Reading Capture/notes", now = new Date().toISOString() }) {
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
  return `---\ntype: reading-note\nschema_version: 1\nsource_id: ${source.source_id}\nsource_vault_path: ${yamlValue(source.source_vault_path)}\nsource_abs_path: ${yamlValue(source.source_abs_path)}\nsource_title: ${yamlValue(source.source_title)}\nsource_file_name: ${yamlValue(source.source_file_name)}\nsource_root: ${yamlValue(source.source_root)}\nsource_kind: ${yamlValue(source.source_kind)}\nsource_mtime: ${yamlValue(source.source_mtime)}\nsource_size: ${source.source_size || 0}\nsource_content_hash: ${yamlValue(source.source_content_hash)}\nsource_aliases: []\nstatus: reading\ncodex_status: pending_summary\npublish_intent: []\ncreated: ${yamlValue(updated)}\nupdated: ${yamlValue(updated)}\n---\n\n# 阅读记录：${source.source_title}\n\n## 源文档\n\n- 来源：[[${source.source_vault_path}]]\n- 类型：${source.source_kind}\n- 首次记录：${updated}\n\n## 一句话判断\n\n\n## 标注记录\n\n\n## 创作灵感\n\n\n## 事实待核查\n\n\n## AI 汇总\n\n> 等待你或自动化工具写入。\n\n## 内容转化记录\n\n- 微信公众号：\n- 小红书：\n- 视频号：\n`;
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

module.exports = {
  KNOWN_SOURCE_ROOTS,
  sha1,
  basename,
  extname,
  rootSlug,
  safeSlug,
  sourceKindFromPath,
  titleFromPath,
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
