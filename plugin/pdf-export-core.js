// Pure export data rules. Never rewrite a source article or reading record.
const SECTION_NAMES = new Set(['源文档', '一句话判断', '标注记录', '创作灵感', '可写选题', '事实待核查', 'AI 汇总', '内容转化记录']);
const META_KEYS = new Set(['time', 'capture_source', 'type', 'quote_hash', 'location_hint', 'confidence', 'media_type', 'media_src', 'media_alt', 'media_index', 'media_hash']);
function stripFrontmatter(text) {
  return String(text || '').replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}
function unquote(value) {
  try { return JSON.parse(value); } catch (_) { return value.replace(/^['"]|['"]$/g, ''); }
}
function cleanContent(text) {
  const value = String(text || '').trim();
  return /^(?:>\s*)?等待你或自动化工具写入。$/.test(value) ? '' : value;
}
function classifyVersion(version) {
  const name = (version.name || version.path.split('/').pop()).replace(/\.[^.]+$/, '').toLowerCase();
  const kind = /\.pdf$/i.test(version.path) ? 'pdf' : /\.md$/i.test(version.path) ? 'markdown' : '';
  if (!kind || name.includes('enriched') || /扩展/.test(version.label || '')) return null;
  const language = name === 'article_zh' || name.endsWith('_zh') || name.includes('_zh_') || name.includes('translation') || /中文/.test(version.label || '') ? 'zh' : name === 'article' || /^原文/.test(version.label || '') ? 'original' : 'unknown';
  const label = language === 'zh' ? '中文译文' : language === 'original' ? '原文' : '当前文档';
  return { ...version, kind, language, label, stem: name };
}
function exportCandidates(versions) {
  const candidates = versions.map(classifyVersion).filter(Boolean);
  const preferred = candidates.filter(v => v.language === 'zh');
  const pool = preferred.length ? preferred : candidates;
  let defaultPath = pool.length === 1 ? pool[0].path : '';
  if (!defaultPath && pool.length === 2 && pool[0].stem === pool[1].stem && pool[0].kind !== pool[1].kind) defaultPath = pool.find(v => v.kind === 'markdown').path;
  return { candidates, defaultPath };
}
function parseRecord(lines, section, context) {
  const meta = {};
  let i = 1;
  for (; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const match = lines[i].match(/^-\s+([a-z_]+):\s*(.*)$/);
    if (!match || !META_KEYS.has(match[1])) break;
    meta[match[1]] = unquote(match[2]);
  }
  const body = lines.slice(i);
  const thought = body.findIndex(line => /^我的想法[：:]/.test(line));
  const quoteLines = thought >= 0 ? body.slice(0, thought) : body;
  const quote = quoteLines.map(line => line.replace(/^>\s?/, '')).join('\n').trim().replace(/^==|==$/g, '');
  const note = thought >= 0 ? [body[thought].replace(/^我的想法[：:]\s*/, ''), ...body.slice(thought + 1)].join('\n').trim() : '';
  if (!quote && !note && !meta.media_src) return null;
  const type = meta.type === 'topic' || ['创作灵感', '可写选题'].includes(section) ? 'topic' : meta.type === 'fact-check' || section === '事实待核查' ? 'fact' : meta.media_type === 'image' ? 'image' : 'thought';
  return { ...context, kind: 'record', quote, note, section, type, time: String(meta.time || ''), mediaSrc: String(meta.media_src || ''), mediaAlt: String(meta.media_alt || ''), label: type === 'topic' ? '创作灵感' : type === 'fact' ? '事实待核查' : type === 'image' ? (note ? '图片想法' : '图片摘录') : note ? (quote ? '标注想法' : '整篇想法') : '摘录' };
}
function parseReadingNote(markdown, context = {}) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const records = [], summaries = [], ai = [];
  let section = '', buffer = [], annotation = false, fence = null;
  function flush() {
    if (annotation) {
      const record = parseRecord(buffer, section, context);
      if (record) records.push(record);
    } else {
      let content = cleanContent(buffer.join('\n'));
      if (!section) content = content.replace(/^# 阅读记录[：:][^\n]*(?:\n|$)/, '').trim();
      if (content && section !== '源文档' && section !== '内容转化记录') {
        (section === 'AI 汇总' ? ai : summaries).push({ ...context, kind: 'summary', title: section || '我的笔记', content });
      }
    }
    buffer = [];
  }
  for (const line of lines) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*(?:`+|~+)\s*$/.test(line)) fence = null;
      buffer.push(line); continue;
    }
    if (!fence && /^### ann_\S+\s*$/.test(line)) { flush(); annotation = true; buffer.push(line); continue; }
    const heading = !fence && line.match(/^## (.+?)\s*$/);
    // Within a user's thought, an arbitrary H2 is content, not an annotation boundary.
    if (heading && (!annotation || SECTION_NAMES.has(heading[1]))) { flush(); annotation = false; section = heading[1]; continue; }
    buffer.push(line);
  }
  flush();
  return { records, summaries, ai, hasNotes: records.length + summaries.length > 0 };
}
function selectedNotes(notes, path, scope = 'group') {
  const groups = notes.filter(n => scope === 'group' || n.sourcePath === path);
  return { records: groups.flatMap(n => n.records), summaries: groups.flatMap(n => n.summaries), ai: groups.flatMap(n => n.ai) };
}
function safeFilename(title) {
  return String(title || '文章').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 90) || '文章';
}
function sourceTitle(markdown, fallback, frontmatter = {}) {
  const title = stripFrontmatter(markdown).match(/^#\s+(.+)$/m)?.[1];
  return String(frontmatter.title || title || fallback || '文章').trim();
}
// Only consume the capture preamble. Once article prose, an image or code starts,
// identically named headings/fields belong to the article and must stay intact.
function prepareArticle(markdown, frontmatter = {}) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  let i = 0, sawMetadata = false;
  const metadata = {};
  const blank = line => !String(line || '').trim();
  const rule = line => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  const heading = line => String(line || '').replace(/^\s*#{1,6}\s+/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const field = line => String(line || '').trim().match(/^(?:\*\*)?(作者|Author|日期|时间|发布时间|发布日期|Date|Published|原文链接|原文地址|链接|URL|Link|Source|来源|作者简介|Author bio)(?:\*\*)?\s*[：:]\s*(.*)$/i);
  const url = value => {
    const raw = String(value || '').trim();
    const link = raw.match(/^\[[^\]]*\]\((https?:\/\/\S+)\)$/i);
    const candidate = link ? link[1] : raw.replace(/^<|>$/g, '');
    if (!/^https?:\/\/\S+$/i.test(candidate)) return '';
    try { return new URL(candidate).href; } catch (_) { return ''; }
  };
  while (blank(lines[i]) && i < lines.length) i++;
  if (/^#\s+/.test(lines[i] || '')) i++;
  for (; i < lines.length;) {
    if (blank(lines[i])) { i++; continue; }
    const match = field(lines[i]);
    if (match) {
      const key = match[1].toLowerCase(), value = match[2].trim();
      if (/^(作者|author)$/.test(key)) metadata.author ||= value;
      else if (/^(日期|时间|发布时间|发布日期|date|published)$/.test(key)) metadata.date ||= value;
      else if (!/^(作者简介|author bio)$/.test(key)) metadata.url ||= url(value);
      sawMetadata = true; i++; continue;
    }
    if (rule(lines[i]) && sawMetadata) { i++; continue; }
    if (sawMetadata && /^#{1,6}\s+/.test(lines[i]) && /^(统计数据|互动数据|Engagement|Statistics)$/i.test(heading(lines[i]))) {
      let end = i + 1, metrics = 0;
      while (end < lines.length) {
        if (blank(lines[end])) { end++; continue; }
        const metric = lines[end].match(/^\s*[-*+]\s+([^：:]+)[：:]\s*([\d,.\s万千亿kmb]+)\s*$/i);
        if (!metric || !/^(点赞|回复|评论|转发|引用|浏览|阅读|收藏|Likes?|Replies|Comments?|Reposts?|Retweets?|Quotes?|Views?|Bookmarks?)$/i.test(metric[1].replace(/^[^\p{L}\p{N}]+/u, '').trim())) break;
        metrics++; end++;
      }
      // Require a complete, recognizable social counter block; never discard a
      // real statistics section just because its heading happens to match.
      if (metrics && (end === lines.length || rule(lines[end]) || field(lines[end]) || /^#{1,6}\s+/.test(lines[end]))) { i = end; continue; }
    }
    if (/^#{1,6}\s+/.test(lines[i]) && /^(正文内容|正文|Article content|Article body)$/i.test(heading(lines[i]))) { i++; break; }
    break;
  }
  const scalar = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const first = keys => keys.map(key => scalar(frontmatter[key])).find(Boolean) || '';
  metadata.author ||= first(['author', '作者']) || (Array.isArray(frontmatter.authors) ? frontmatter.authors.map(scalar).filter(Boolean).join('、') : '');
  metadata.date ||= first(['published', 'published_at', 'publishedAt', 'date', '日期', '时间']);
  metadata.url ||= ['original_url', 'source_url', 'url', 'link', 'source', '原文链接', '链接'].map(key => url(scalar(frontmatter[key]))).find(Boolean) || '';
  metadata.date = metadata.date.replace(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)$/, '$1');
  return { body: lines.slice(i).join('\n').trim(), metadata };
}
module.exports = { stripFrontmatter, parseReadingNote, exportCandidates, selectedNotes, safeFilename, sourceTitle, prepareArticle };
