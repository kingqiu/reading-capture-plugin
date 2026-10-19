const { MarkdownRenderer, Component, requestUrl } = require('obsidian');
const { prepareArticle } = require('./pdf-export-core');
const { checkAbort } = require('./pdf-export-desktop');
const PRINT_WIDTH = 643;
const PAGE_HEIGHT = 980;
const PRINT_CSS = `
@page { size:A4; margin:18mm 20mm; }
@page wide { size:A4 landscape; margin:18mm 20mm; }
* { box-sizing:border-box; } html,body { margin:0; padding:0; background:#fff; color:#26392b; }
body { font-family:"Songti SC","Noto Serif CJK SC","SimSun",serif; font-size:11.5pt; line-height:1.7; overflow-wrap:anywhere; }
h1,h2,h3,h4,h5,h6 { color:#2e4932; line-height:1.35; break-after:avoid; }
h1 { font-size:25pt; margin:0 0 12pt; } h2 { font-size:17pt; margin:20pt 0 10pt; } h3 { font-size:13pt; }
p { margin:0 0 10pt; orphans:2; widows:2; } a { color:#3f613c; text-decoration:underline; }
img,svg { max-width:100%; height:auto; } img { object-fit:contain; } figure { margin:10pt 0; break-inside:avoid; }
blockquote { margin:10pt 0; border-left:2pt solid #bac6b5; padding-left:12pt; color:#53624e; }
pre,code { font-family:ui-monospace,"SFMono-Regular",Consolas,monospace; font-size:9pt; white-space:pre-wrap; overflow-wrap:anywhere; }
pre { background:#f4f5f1; padding:10pt; } table { width:100%; border-collapse:collapse; table-layout:auto; }
th,td { border:1px solid #dce1d6; padding:5pt; overflow-wrap:anywhere; } thead { display:table-header-group; } tr { break-inside:avoid; }
ul,ol { padding-left:20pt; } mark { background:#fff1b8; color:inherit; } hr { border:0; border-top:1px solid #c9d2c2; margin:18pt 0; }
.rc-pdf-meta,.rc-pdf-label,.rc-pdf-ref,.rc-pdf-source,figcaption { font-family:"PingFang SC","Microsoft YaHei",sans-serif; color:#64745b; font-size:9pt; }
.rc-pdf-meta { margin:0 0 16pt; line-height:1.7; } .rc-pdf-meta p { margin:0; } .rc-pdf-ref { display:inline-block; padding:0 5pt; margin-left:5pt; background:#edf2e7; }
.rc-pdf-note { margin:8pt 0 14pt 10pt; padding:9pt 11pt; border:1px solid #e6dfce; border-left:2pt solid #b38b43; background:#f7f4eb; font-family:"PingFang SC","Microsoft YaHei",sans-serif; font-size:10.5pt; line-height:1.6; }
.rc-pdf-note.is-topic { border-left-color:#70936b; } .rc-pdf-note.is-fact { border-left-color:#bb8036; } .rc-pdf-note.is-image { border-left-color:#6f8191; }
.rc-pdf-label { margin-bottom:5pt; color:#80622f; break-after:avoid; } .rc-pdf-note p:last-child { margin-bottom:0; }
.rc-pdf-note blockquote { font-size:9.5pt; margin:4pt 0 7pt; color:#66715e; } .rc-pdf-note h2 { font-size:13pt; margin:8pt 0; }
.rc-pdf-appendix { break-before:page; } .rc-pdf-supplement { border-top:1px solid #c9d2c2; margin-top:20pt; padding-top:8pt; }
.rc-pdf-summary { margin:12pt 0; } .rc-pdf-keep { break-inside:avoid; } .rc-pdf-near-note { break-after:avoid; }
.rc-pdf-wide { page:wide; } .rc-pdf-missing { border:1px dashed #a58c67; padding:10pt; font-family:sans-serif; font-size:10pt; }
.rc-pdf-continued { font-size:9pt; color:#66715e; font-family:sans-serif; } .rc-pdf-note-table { border:0; margin:0; }
.rc-pdf-note-table th,.rc-pdf-note-table td { border:0; padding:0; font-weight:normal; text-align:left; }
.rc-pdf-note-table tr { break-inside:auto; } .rc-pdf-note-table thead th { padding-bottom:5pt; }
.math, mjx-container { overflow:visible; } .math-block { text-align:center; margin:12pt 0; }
`;
function element(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function normalized(text) { return String(text || '').replace(/\s+/g, ' ').trim().normalize('NFC'); }
function scrub(root) {
  root.querySelectorAll('audio,video,iframe').forEach(media => {
    const src = media.getAttribute('src') || media.querySelector('source')?.getAttribute('src') || '';
    const link = element('a', '', media.getAttribute('title') || (media.tagName === 'AUDIO' ? '音频' : '视频'));
    if (/^https?:/i.test(src)) link.href = src;
    media.replaceWith(link);
  });
  root.querySelectorAll('script,object,embed,form,input,button,textarea,select,link,canvas,.copy-code-button').forEach(el => el.remove());
  root.querySelectorAll('style').forEach(el => { if (!el.closest('svg')) el.remove(); });
  root.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || (['contenteditable', 'srcdoc'].includes(attr.name) || (attr.name === 'style' && !el.tagName.startsWith('MJX-') && !el.closest('svg')))) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (!/^(https?:|mailto:|#)/i.test(href)) { el.removeAttribute('href'); el.classList.remove('internal-link'); }
      el.removeAttribute('target');
    }
  });
}
async function renderMarkdown(app, markdown, target, sourcePath, component) {
  let renderTimer;
  try { await Promise.race([MarkdownRenderer.render(app, markdown, target, sourcePath, component), new Promise((_,reject) => { renderTimer = setTimeout(() => reject(new Error('Markdown 内容渲染超时，请重试。')), 15000); })]); }
  finally { clearTimeout(renderTimer); }
  // Math rendering may be scheduled after MarkdownRenderer's promise resolves.
  const { finishRenderMath } = require('obsidian');
  if (typeof finishRenderMath === 'function' && target.querySelector('mjx-container,.math')) {
    let timer;
    try { await Promise.race([finishRenderMath(), new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('公式排版超时，请重试。')), 10000); })]); }
    finally { clearTimeout(timer); }
  }
  scrub(target);
  target.querySelectorAll('img').forEach(img => { img.dataset.rcBase = sourcePath; });
  // Preserve unresolved embeds as explicit missing resources, not empty output.
  target.querySelectorAll('.internal-embed').forEach(embed => {
    if (!embed.querySelector('img') && embed.tagName !== 'IMG') {
      const src = embed.getAttribute('src') || embed.getAttribute('alt') || '';
      if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:[|#]|$)/i.test(src)) {
        const img = element('img'); img.dataset.rcRaw = src.split('|')[0]; img.dataset.rcBase = sourcePath; img.alt = embed.getAttribute('alt') || '图片'; embed.replaceWith(img);
      }
    }
  });
}
function safeDecode(value) { try { return decodeURI(value); } catch (_) { return value; } }
function resolveResource(app, raw, base) {
  let value = String(raw || '').replace(/^<|>$/g, '');
  if (/^https?:\/\//i.test(value)) return { key: value, url: value };
  if (/^data:image\//i.test(value)) return { key: value, data: value };
  const filePrefix = app.vault.adapter.getResourcePath?.('');
  if (filePrefix && value.startsWith(filePrefix)) value = value.slice(filePrefix.length).split('?')[0];
  if (/^(app:|file:|https?:)/i.test(value)) {
    // Resolve only URLs that refer to an actual file in this vault.
    const found = app.vault.getFiles().find(file => {
      const resource = app.vault.getResourcePath(file).split('?')[0];
      return resource === value.split('?')[0] || safeDecode(resource) === safeDecode(value.split('?')[0]);
    });
    if (found) return { key: found.path, file: found };
    return null;
  }
  try { value = decodeURIComponent(value); } catch (_) {}
  value = value.split('#')[0];
  const file = app.metadataCache.getFirstLinkpathDest(value, base) || app.vault.getAbstractFileByPath(value);
  return file?.extension ? { key: file.path, file } : null;
}
function locateRecords(app, article, records, sourcePath) {
  const blockFor = target => {
    let block = target.nodeType === 3 ? target.parentElement : target;
    while (block?.parentElement && block.parentElement !== article) block = block.parentElement;
    return block?.parentElement === article ? block : null;
  };
  const positions = [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let text = '', node, previousBlock = null, space = false;
  while ((node = walker.nextNode())) {
    const block = blockFor(node);
    if (previousBlock && block !== previousBlock) space = true;
    for (const char of node.textContent.normalize('NFC')) {
      if (/\s/.test(char)) { space = true; continue; }
      if (space && text) { text += ' '; positions.push(node); }
      text += char;
      for (let i = 0; i < char.length; i++) positions.push(node);
      space = false;
    }
    previousBlock = block;
  }
  const images = [...article.querySelectorAll('img')];
  return records.map((record, index) => {
    let anchor = null;
    if (record.sourcePath === sourcePath) {
      if (record.mediaSrc) {
        const resource = resolveResource(app, record.mediaSrc, sourcePath);
        const matches = resource ? images.filter(img => resolveResource(app, img.dataset.rcRaw || img.getAttribute('src'), sourcePath)?.key === resource.key) : [];
        if (matches.length === 1) {
          anchor = blockFor(matches[0]);
          const caption = anchor?.nextElementSibling;
          if (caption?.tagName === 'P' && /^(?:图\s*\d|Figure\s*\d)/i.test(caption.textContent.trim())) anchor = caption;
        }
      } else if (record.quote) {
        const quote = normalized(record.quote);
        const start = text.indexOf(quote);
        if (quote && start >= 0 && text.indexOf(quote, start + 1) < 0) {
          const last = positions[start + quote.length - 1];
          if (last) anchor = blockFor(last);
        }
      }
    }
    return { ...record, number: `N${String(index + 1).padStart(2, '0')}`, anchor, fullBlockQuote: !!anchor && normalized(anchor.textContent) === normalized(record.quote) };
  });
}
async function noteCard(app, record, component, inline) {
  const card = element('aside', `rc-pdf-note is-${record.type}`); card.id = `note-${record.number}`;
  card.append(element('div', 'rc-pdf-label', `我的笔记 ${record.number} · ${record.label} · ${record.sourceLabel}`));
  // A full quote keeps the context available even if a card crosses a printed page.
  if (record.quote && (!inline || !record.fullBlockQuote || !record.note || record.note.length > 600)) {
    const quote = element('blockquote');
    await renderMarkdown(app, record.quote, quote, record.sourcePath, component);
    card.append(quote);
  }
  if (record.mediaSrc && (!inline || !record.anchor)) {
    const img = element('img'); img.dataset.rcRaw = record.mediaSrc; img.dataset.rcBase = record.sourcePath; img.alt = record.mediaAlt || '笔记所指图片'; card.append(img);
  }
  if (record.note) {
    const body = element('div'); await renderMarkdown(app, record.note, body, record.notePath, component); card.append(body);
  }
  if (record.anchor) {
    const back = element('a', 'rc-pdf-source', inline ? ' ↑' : '返回正文 ↑'); back.href = `#source-${record.number}`; (inline ? card.firstElementChild : card).append(back);
  } else card.append(element('div', 'rc-pdf-source', record.sourcePath === record.selectedPath ? '未定位到所选正文' : '记录于其他版本'));
  return card;
}
async function summariesSection(app, items, component, target) {
  for (const item of items) {
    const section = element('section', 'rc-pdf-summary');
    section.append(element('h3', '', `${item.title} · ${item.sourceLabel}`));
    const body = element('div'); section.append(body); target.append(section);
    await renderMarkdown(app, item.content, body, item.notePath, component);
  }
}
class MissingImagesError extends Error {
  constructor(images) { super(`${images.length} 张图片未能加载，请重试或明确选择忽略后导出。`); this.name = 'MissingImagesError'; this.images = images; }
}
async function imageData(app, resource, signal) {
  checkAbort(signal);
  if (!resource) throw new Error('找不到图片');
  if (resource.data) return resource.data;
  let data, type;
  if (resource.file) {
    if (resource.file.stat?.size > 40 * 1024 * 1024) throw new Error('图片超过 40 MB');
    data = await app.vault.readBinary(resource.file);
    type = ({ svg:'image/svg+xml', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', avif:'image/avif', bmp:'image/bmp' })[resource.file.extension.toLowerCase()];
  } else {
    let timer;
    try {
      const response = await Promise.race([requestUrl({ url: resource.url, throw: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('图片加载超时')), 20000); })]);
      data = response.arrayBuffer; type = response.headers['content-type']?.split(';')[0];
    } finally { clearTimeout(timer); }
  }
  checkAbort(signal);
  if (!data?.byteLength || data.byteLength > 40 * 1024 * 1024) throw new Error('图片为空或超过 40 MB');
  if (!/^image\//.test(type || '')) throw new Error('资源不是受支持的图片');
  if (type === 'image/svg+xml') {
    const svg = new DOMParser().parseFromString(new TextDecoder().decode(data), 'image/svg+xml');
    if (svg.querySelector('parsererror')) throw new Error('SVG 图片损坏');
    svg.querySelectorAll('script,foreignObject').forEach(e => e.remove());
    for (const el of svg.querySelectorAll('*')) for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ((attr.name === 'href' || attr.name === 'xlink:href') && !attr.value.startsWith('#'))) el.removeAttribute(attr.name);
    }
    data = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
  }
  return `data:${type};base64,${Buffer.from(data).toString('base64')}`;
}
async function embedImages(app, root, signal, onProgress, ignoreMissing) {
  const images = [...root.querySelectorAll('img')], missing = [], cache = new Map();
  let complete = 0;
  for (const img of images) {
    checkAbort(signal);
    const raw = img.dataset.rcRaw || img.getAttribute('src');
    const resource = resolveResource(app, raw, img.dataset.rcBase || '');
    try {
      const key = resource?.key;
      if (!cache.has(key)) cache.set(key, imageData(app, resource, signal));
      img.removeAttribute('srcset'); img.removeAttribute('loading'); img.removeAttribute('width'); img.removeAttribute('height');
      img.src = await cache.get(key); await img.decode();
      if (!img.naturalWidth) throw new Error('无法解码图片');
      img.style.maxWidth = `${Math.min(PRINT_WIDTH, img.naturalWidth)}px`;
      if (/^data:image\/gif/.test(img.src)) {
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0); img.src = canvas.toDataURL('image/png');
        img.after(element('figcaption', '', '动态图片的静态画面'));
      }
      const width = Math.min(PRINT_WIDTH, img.naturalWidth);
      const height = img.naturalHeight * width / img.naturalWidth;
      if (height > PAGE_HEIGHT * 1.05) {
        const holder = element('div');
        const sliceHeight = Math.floor((PAGE_HEIGHT - 70) * img.naturalWidth / width);
        const overlap = Math.max(1, Math.floor(12 * img.naturalWidth / width));
        for (let y = 0, i = 0; y < img.naturalHeight; y += sliceHeight - overlap, i++) {
          const h = Math.min(sliceHeight, img.naturalHeight - y);
          const canvas = document.createElement('canvas'); canvas.width = Math.min(img.naturalWidth, 1600); canvas.height = Math.round(h * canvas.width / img.naturalWidth);
          canvas.getContext('2d').drawImage(img, 0, y, img.naturalWidth, h, 0, 0, canvas.width, canvas.height);
          const figure = element('figure'), part = element('img'); part.src = canvas.toDataURL('image/png'); part.alt = img.alt;
          figure.append(part, element('figcaption', '', `${img.alt || '长图'}${i ? '（续图）' : ''}`)); holder.append(figure);
          if (y + h >= img.naturalHeight) break;
        }
        img.replaceWith(holder);
      }
    } catch (error) {
      checkAbort(signal);
      const name = `图片 ${complete + 1}${img.alt ? `（${img.alt.slice(0, 70)}）` : ''}`;
      missing.push(name); if (ignoreMissing) img.replaceWith(element('div', 'rc-pdf-missing', `${name}：未能加载，按导出时选择省略。`));
    }
    complete++; onProgress(`处理图片 ${complete}/${images.length}…`);
  }
  if (missing.length && !ignoreMissing) throw new MissingImagesError(missing);
  // Remove internal resource paths from the serialized document.
  root.querySelectorAll('*').forEach(el => { for (const attr of [...el.attributes]) if (/^data-|^src$/.test(attr.name) && !(el.tagName === 'IMG' && attr.name === 'src')) el.removeAttribute(attr.name); });
  return missing;
}
async function buildDocument(app, snapshot, options, signal, onProgress = () => {}) {
  const component = new Component(); component.load();
  const host = element('div'); host.style.cssText = `position:fixed;left:-20000px;top:0;width:${PRINT_WIDTH}px;visibility:hidden;pointer-events:none;`;
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' }), style = element('style'); style.textContent = PRINT_CSS; shadow.append(style);
  const root = element('div'); root.style.cssText = 'font-family:Songti SC,serif;font-size:11.5pt;line-height:1.7;color:#26392b'; shadow.append(root);
  try {
    checkAbort(signal);
    const native = snapshot.version.kind === 'pdf';
    const article = element('article');
    if (!native) root.append(article);
    if (!native) {
      const { body, metadata } = prepareArticle(snapshot.markdown, snapshot.frontmatter);
      const header = element('header');
      await renderMarkdown(app, `# ${snapshot.title}`, header, snapshot.version.path, component);
      const details = [metadata.author && `作者：${metadata.author}`, metadata.date && `日期：${metadata.date}`, metadata.url && `[原文链接](<${metadata.url.replace(/>/g, '%3E')}>)`].filter(Boolean);
      if (details.length) {
        const meta = element('div', 'rc-pdf-meta');
        await renderMarkdown(app, details.join('  \n'), meta, snapshot.version.path, component); header.append(meta);
      }
      await renderMarkdown(app, body, article, snapshot.version.path, component);
      article.prepend(header);
    }
    const selected = options.includeNotes ? snapshot.selected : { records: [], summaries: [], ai: [] };
    const located = native ? selected.records.map((record, i) => ({ ...record, number: `N${String(i + 1).padStart(2,'0')}`, anchor:null })) : locateRecords(app, article, selected.records, snapshot.version.path);
    if (options.analyzeOnly) return { locatedCount: located.filter(r => r.anchor).length, recordCount: located.length };
    const inOrder = [...located].sort((a,b) => {
      if (a.anchor && b.anchor && a.anchor !== b.anchor) return a.anchor.compareDocumentPosition(b.anchor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      if (!!a.anchor !== !!b.anchor) return a.anchor ? -1 : 1;
      return a.sourcePath.localeCompare(b.sourcePath) || a.time.localeCompare(b.time);
    });
    inOrder.forEach((record, i) => { record.number = `N${String(i+1).padStart(2, '0')}`; record.selectedPath = snapshot.version.path; });
    const inline = !native && options.layout === 'inline';
    const tails = new Map();
    for (const record of inOrder.filter(r => r.anchor)) {
      const ref = element('a', 'rc-pdf-ref', record.number); ref.id = `source-${record.number}`; ref.href = `#note-${record.number}`;
      record.anchor.append(ref);
      if (inline) {
        const card = await noteCard(app, record, component, true);
        const previous = tails.get(record.anchor) || record.anchor;
        previous.after(card); tails.set(record.anchor, card); record.anchor.classList.add('rc-pdf-near-note');
      }
    }
    onProgress('整理阅读笔记…');
    const remaining = inline ? inOrder.filter(r => !r.anchor) : inOrder;
    if (remaining.length || selected.summaries.length) {
      const section = element('section', inline ? 'rc-pdf-supplement' : native ? '' : 'rc-pdf-appendix');
      root.append(section);
      section.append(element('h2', '', inline ? '补充笔记' : '阅读笔记'));
      section.append(element('p', 'rc-pdf-source', `${selected.records.length} 条记录${selected.summaries.length ? ' · 含手写总结' : ''}`));
      await summariesSection(app, selected.summaries, component, section);
      for (const record of remaining) section.append(await noteCard(app, record, component, false));
    }
    if (options.includeNotes && options.includeAI && selected.ai.length) {
      const ai = element('section', 'rc-pdf-supplement'); ai.append(element('h2', '', 'AI 汇总'));
      await summariesSection(app, selected.ai, component, ai); root.append(ai);
    }
    onProgress('准备图片…');
    await embedImages(app, root, signal, onProgress, options.ignoreMissing);
    // Resolve print dimensions before deciding which blocks may split across pages.
    root.querySelectorAll('.rc-pdf-note').forEach(card => {
      if (card.getBoundingClientRect().height < PAGE_HEIGHT * .75) card.classList.add('rc-pdf-keep');
      else {
        const label = card.firstElementChild;
        const table = element('table', 'rc-pdf-note-table'), head = element('thead'), row = element('tr'), cell = element('th');
        label.textContent += '（跨页续读）'; cell.append(label); row.append(cell); head.append(row);
        const body = element('tbody'), bodyRow = element('tr'), bodyCell = element('td');
        while (card.firstChild) bodyCell.append(card.firstChild);
        bodyRow.append(bodyCell); body.append(bodyRow); table.append(head, body); card.append(table);
      }
    });
    root.querySelectorAll('table:not(.rc-pdf-note-table)').forEach(table => {
      if (table.scrollWidth > PRINT_WIDTH * 1.2) table.classList.add('rc-pdf-wide');
    });
    let mathStyles = [...document.querySelectorAll('style')].filter(el => /MathJax|mjx-|MJX-TEX/.test(el.textContent)).map(el => el.textContent.replace(/<\/style/gi, '')).join('\n');
    if (root.querySelector('mjx-container,.math')) {
      for (const match of [...mathStyles.matchAll(/url\(["']?(app:\/\/obsidian\.md\/lib\/mathjax\/[^)"']+)["']?\)/g)]) {
        checkAbort(signal);
        const response = await fetch(match[1]);
        if (!response.ok) throw new Error('公式字体加载失败，请重试。');
        const font = Buffer.from(await response.arrayBuffer()).toString('base64');
        mathStyles = mathStyles.replace(match[0], `url("data:font/woff;base64,${font}")`);
      }
    } else mathStyles = '';
    const titleEl = element('span', '', snapshot.title);
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;"><title>${titleEl.innerHTML}</title><style>${PRINT_CSS}\n${mathStyles}</style></head><body>${root.innerHTML}</body></html>`;
    return { html, locatedCount: located.filter(r=>r.anchor).length, recordCount: located.length };
  } finally { component.unload(); host.remove(); }
}
module.exports = { buildDocument, locateRecords, resolveResource, MissingImagesError, PRINT_CSS };
