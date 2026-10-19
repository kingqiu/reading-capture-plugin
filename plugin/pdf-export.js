const { Modal, Notice } = require('obsidian');
const rules = require('./pdf-export-core');
const { buildDocument } = require('./pdf-export-render');
const { desktopHost, checkAbort, mergeNativePdf, printHtml, savePdf } = require('./pdf-export-desktop');
const crypto = require('crypto');

async function collectNotes(plugin, group) {
  const paths = new Set(group.versions.map(v => v.path));
  const labels = new Map(group.versions.map(v => [v.path, rules.exportCandidates([v]).candidates[0]?.label || v.label || v.name]));
  const index = await plugin.pathExists(plugin.indexPath()) ? JSON.parse(await plugin.readText(plugin.indexPath())) : { sources: {} };
  if (!index.sources || typeof index.sources !== 'object' || Array.isArray(index.sources)) throw new Error('阅读索引格式错误，请先重建索引后重试。');
  const indexed = new Map();
  for (const [source, entry] of Object.entries(index.sources)) {
    if (!paths.has(source) || !entry?.reading_note_path) continue;
    if (indexed.has(entry.reading_note_path) && indexed.get(entry.reading_note_path) !== source) throw new Error('一份阅读记录关联了多个来源，请先重建阅读索引后重试。');
    indexed.set(entry.reading_note_path, source);
  }
  const root = `${plugin.settings.readingRoot.replace(/\/+$/, '')}/`;
  const candidates = plugin.app.vault.getMarkdownFiles().filter(file => {
    const cache = plugin.app.metadataCache.getFileCache(file);
    const source = cache?.frontmatter?.source_vault_path;
    return indexed.has(file.path) || paths.has(source) || (!cache && file.path.startsWith(root));
  });
  const candidatePaths = new Set(candidates.map(f => f.path));
  for (const p of indexed.keys()) if (!candidatePaths.has(p)) throw new Error('有一份关联阅读记录已丢失，请修复或重建阅读索引后重试。');
  const result = [];
  for (const file of candidates) {
    const markdown = await plugin.readText(file.path);
    const source = plugin.readFrontmatterValue(markdown, 'source_vault_path');
    if (indexed.has(file.path) && source !== indexed.get(file.path)) throw new Error('阅读索引与笔记来源不一致，请重建索引后重试。');
    if (!paths.has(source)) continue;
    const context = { sourcePath: source, notePath: file.path, sourceLabel: labels.get(source) || '当前文档' };
    result.push({ ...context, raw: markdown, ...rules.parseReadingNote(markdown, context) });
  }
  return result;
}
function digestSnapshot(snapshot) {
  return crypto.createHash('sha256').update(snapshot.version.path).update(snapshot.markdown || '').update(snapshot.binary ? Buffer.from(snapshot.binary) : '').update(JSON.stringify(snapshot.notes.map(n => [n.notePath, n.raw]))).digest('hex');
}
async function readSnapshot(plugin, group, version, options, notes) {
  if (typeof plugin.collectArticleLibraryGroups === 'function') {
    const current = plugin.collectArticleLibraryGroups().find(item => item.id === group.id);
    const expected = group.versions.map(item => item.path).sort().join('\n');
    if (!current || current.files.map(item => item.path).sort().join('\n') !== expected) throw new Error('文章组已变化，请关闭导出窗口并重新扫描。');
  }
  const file = plugin.app.vault.getAbstractFileByPath(version.path);
  if (!plugin.isFile(file)) throw new Error('所选正文已不存在，请重新扫描文章组。');
  const snapshot = { version, notes: notes || await collectNotes(plugin, group) };
  if (version.kind === 'pdf') {
    snapshot.binary = new Uint8Array(await plugin.app.vault.readBinary(file));
    snapshot.title = file.basename;
  } else {
    snapshot.markdown = await plugin.readText(file.path);
    snapshot.frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    snapshot.title = rules.sourceTitle(snapshot.markdown, file.basename, snapshot.frontmatter);
  }
  snapshot.selected = rules.selectedNotes(snapshot.notes, version.path, options.scope);
  snapshot.signature = digestSnapshot(snapshot);
  return snapshot;
}
async function generatePdf(plugin, snapshot, options, signal, onProgress) {
  checkAbort(signal);
  if (snapshot.version.kind === 'pdf' && !options.includeNotes) return snapshot.binary;
  const rendered = await buildDocument(plugin.app, snapshot, options, signal, onProgress);
  checkAbort(signal);
  const bytes = await printHtml(rendered.html, snapshot.title, signal, onProgress);
  if (snapshot.version.kind !== 'pdf') return bytes;
  onProgress('拼接阅读笔记…');
  const merged = await mergeNativePdf(snapshot.binary, bytes); checkAbort(signal); return merged;
}
class PdfExportModal extends Modal {
  constructor(plugin, group) {
    super(plugin.app); this.plugin = plugin; this.group = group;
    const choices = rules.exportCandidates(group.versions);
    this.candidates = choices.candidates; this.path = choices.defaultPath;
    this.options = { includeNotes:false, includeAI:false, scope:'group', layout:'inline', ignoreMissing:false };
    this.notes = []; this.loading = true; this.busy = false; this.revision = 0; this.controller = new AbortController();
  }
  onOpen() {
    this.modalEl.addClass('reading-capture-pdf-modal'); this.titleEl.setText('导出 PDF'); this.render();
    this.load().catch(error => { if (!this.controller.signal.aborted) { this.loading = false; this.loadFailed = true; this.error = `无法准备导出：${error.message}`; this.render(); } });
  }
  onClose() { this.controller.abort(); this.revision++; clearTimeout(this.analyzeTimer); this.contentEl.empty(); }
  async load() {
    this.notes = await collectNotes(this.plugin, this.group); checkAbort(this.controller.signal);
    this.loading = false; this.loadFailed = false; this.error = ''; this.render(); this.analyze();
  }
  currentVersion() { return this.candidates.find(v => v.path === this.path); }
  currentNotes() { return rules.selectedNotes(this.notes, this.path, this.options.scope); }
  changed() {
    this.options.ignoreMissing = false; this.missing = null; this.error = ''; this.analysis = null;
    const notes = this.currentNotes();
    if (!notes.records.length && !notes.summaries.length) { this.options.includeNotes = false; this.options.includeAI = false; }
    if (!notes.ai.length || !this.options.includeNotes) this.options.includeAI = false;
    this.render(); this.analyze();
  }
  async analyze() {
    const revision = ++this.revision;
    if (!this.path || !this.options.includeNotes || this.currentVersion()?.kind === 'pdf') return;
    try {
      const snapshot = await readSnapshot(this.plugin, this.group, this.currentVersion(), this.options, this.notes);
      const result = await buildDocument(this.app, snapshot, { ...this.options, analyzeOnly:true }, this.controller.signal);
      if (revision !== this.revision || this.controller.signal.aborted) return;
      this.analysis = result; this.render();
    } catch (error) { if (revision === this.revision && !this.controller.signal.aborted) { this.error = error.message; this.render(); } }
  }
  radio(parent, name, value, title, detail, checked, callback) {
    const label = parent.createEl('label', { cls:`reading-capture-pdf-choice${checked ? ' is-selected' : ''}` });
    const input = label.createEl('input', { attr:{ type:'radio', name, value } }); input.checked = checked; input.disabled = this.busy;
    const copy = label.createDiv(); copy.createEl('strong', { text:title }); copy.createEl('small', { text:detail });
    input.addEventListener('change', callback);
  }
  checkbox(parent, title, checked, callback) {
    const label = parent.createEl('label', { cls:'reading-capture-pdf-check' });
    const input = label.createEl('input', { attr:{ type:'checkbox', name:title } }); input.checked = checked; input.disabled = this.busy;
    label.createEl('span', { text:title }); input.addEventListener('change', () => callback(input.checked)); return input;
  }
  render() {
    const scrollTop = this.contentEl.querySelector('.reading-capture-pdf-body')?.scrollTop || 0;
    const active = this.contentEl.ownerDocument.activeElement;
    const focusKey = active && this.contentEl.contains(active) ? `${active.name || ''}:${active.value || ''}:${active.type || ''}` : '';
    this.contentEl.empty();
    this.contentEl.createEl('p', { cls:'reading-capture-pdf-subtitle', text:this.group.title });
    const body = this.contentEl.createDiv({ cls:'reading-capture-pdf-body' });
    if (this.savedPath) body.createEl('p', { text:'PDF 已导出。可以打开文件查看或在文件夹中找到它。', attr:{role:'status'} });
    else if (this.loading) body.createEl('p', { text:'正在读取正文版本与阅读笔记…', attr:{ role:'status' } });
    else if (!this.candidates.length) body.createEl('p', { text:'当前只有扩展版或不支持的文件。此功能支持 Markdown 和 PDF 格式的原文或译文。' });
    else {
      body.createEl('h3', { text:'正文版本' });
      const versions = body.createDiv({ cls:'reading-capture-pdf-choices' });
      for (const version of this.candidates) {
        if (this.candidates.length === 1) versions.createDiv({ cls:'reading-capture-pdf-fixed', text:`${version.label} · ${version.kind === 'pdf' ? 'PDF' : 'Markdown'} · ${version.name}` });
        else this.radio(versions, 'pdf-source', version.path, `${version.label} · ${version.kind === 'pdf' ? 'PDF' : 'Markdown'}`, this.candidates.filter(v => v.name === version.name).length > 1 ? version.path : version.name, version.path === this.path, () => { this.path = version.path; this.changed(); });
      }
      if (!this.path) body.createEl('p', { text:'有多个正文候选，请选择要导出的版本。' });
      body.createEl('h3', { text:'导出内容' }); body.createDiv({ cls:'reading-capture-pdf-fixed', text:'完整正文与插图' });
      const selected = this.currentNotes(), hasNotes = selected.records.length + selected.summaries.length > 0;
      const all = rules.selectedNotes(this.notes, this.path, 'group');
      if (all.records.length || all.summaries.length) {
        this.checkbox(body, '同时导出我的阅读笔记', this.options.includeNotes, checked => { this.options.includeNotes = checked; this.changed(); });
        body.createDiv({ cls:'reading-capture-pdf-muted', text:`${selected.records.length} 条记录${selected.summaries.length ? ' · 含手写总结' : ''}` });
        if (this.options.includeNotes || this.options.scope === 'selected') {
          const sources = new Set(this.notes.filter(n => n.hasNotes).map(n => n.sourcePath));
          if (sources.size > 1 || !sources.has(this.path)) {
            const scope = body.createEl('label', { cls:'reading-capture-pdf-scope', text:'笔记范围' });
            const select = scope.createEl('select', { attr:{ 'aria-label':'笔记范围', name:'pdf-scope' } });
            select.createEl('option', { text:'整个文章组', value:'group' }); select.createEl('option', { text:'仅所选版本', value:'selected' }); select.value = this.options.scope; select.disabled = this.busy;
            select.addEventListener('change', () => { this.options.scope = select.value; this.changed(); });
          }
        }
        if (!hasNotes) body.createEl('p', { text:'所选版本暂无阅读笔记，可切换整个文章组或仅导出正文。' });
        if (this.options.includeNotes) {
          if (selected.ai.length) this.checkbox(body, '附加 AI 汇总（单独标识）', this.options.includeAI, checked => { this.options.includeAI = checked; this.changed(); });
          if (this.currentVersion()?.kind === 'pdf') body.createDiv({ cls:'reading-capture-pdf-hint', text:'保留原页 · 笔记在文末连续排版。多条短笔记共用一页，放不下时才换页。' });
          else {
            body.createEl('h3', { text:'笔记版式' }); const layouts = body.createDiv({ cls:'reading-capture-pdf-choices' });
            this.radio(layouts, 'pdf-layout', 'inline', '随文笔记 · 默认', '笔记紧接对应正文，按内容伸缩', this.options.layout === 'inline', () => { this.options.layout = 'inline'; this.changed(); });
            this.radio(layouts, 'pdf-layout', 'appendix', '文末笔记', '正文在前，笔记集中连续排版', this.options.layout === 'appendix', () => { this.options.layout = 'appendix'; this.changed(); });
            let hint = '完整正文 → 阅读笔记；笔记按内容分页，不逐条分页。';
            if (this.options.layout === 'inline') hint = this.analysis ? `${this.analysis.locatedCount} 条随文 · ${this.analysis.recordCount - this.analysis.locatedCount} 条补充笔记在文末${selected.summaries.length ? ' · 手写总结在文末' : ''}` : '正在检查笔记与正文的位置关联…';
            body.createDiv({ cls:'reading-capture-pdf-hint', text:hint, attr:{ role:'status' } });
          }
        }
      } else body.createEl('p', { cls:'reading-capture-pdf-muted', text:'暂无阅读笔记' });
      body.createDiv({ cls:'reading-capture-pdf-muted', text:this.currentVersion()?.kind === 'pdf' ? '保留原页 · 新增笔记页 A4' : 'A4 · 白底 · 保留正文与插图' });
    }
    if (this.error) {
      const error = body.createDiv({ cls:'reading-capture-pdf-error', attr:{ role:'alert' } }); error.createEl('p', { text:this.error });
      if (this.loadFailed) {
        const retry = error.createEl('button', { text:'重新读取' }); retry.addEventListener('click', () => { this.loading = true; this.render(); this.load().catch(e => { this.loading = false; this.error = e.message; this.render(); }); });
      }
      if (this.missing?.length) {
        const list = error.createEl('ul'); this.missing.forEach(name => list.createEl('li', { text:name }));
        const ignore = error.createEl('button', { text:`忽略这 ${this.missing.length} 张图片继续` }); ignore.addEventListener('click', () => { this.options.ignoreMissing = true; this.export(); });
      }
    }
    const footer = this.contentEl.createDiv({ cls:'reading-capture-pdf-footer' });
    const cancel = footer.createEl('button', { text:this.savedPath ? '完成' : '取消' }); cancel.addEventListener('click', () => this.close());
    if (this.savedPath) {
      const folder = footer.createEl('button', { text:'打开所在文件夹' }); folder.addEventListener('click', () => require('electron').shell.showItemInFolder(this.savedPath));
      const open = footer.createEl('button', { cls:'mod-cta', text:'打开 PDF' }); open.addEventListener('click', async () => { const error = await require('electron').shell.openPath(this.savedPath); if (error) new Notice('无法打开 PDF，请在保存位置手动打开。'); });
    } else {
      const button = footer.createEl('button', { cls:'mod-cta', text:this.busy ? (this.progress || '准备内容…') : this.missing ? '重试导出' : '导出 PDF' });
      button.disabled = this.loading || this.loadFailed || this.busy || !this.path; button.addEventListener('click', () => this.export());
    }
    body.scrollTop = scrollTop;
    if (focusKey) [...this.contentEl.querySelectorAll('input,select')].find(input => `${input.name || ''}:${input.value || ''}:${input.type || ''}` === focusKey)?.focus();
  }
  async export() {
    if (this.busy || !this.currentVersion()) return;
    this.busy = true; this.error = ''; this.progress = '准备内容…'; this.render();
    try {
      const snapshot = await readSnapshot(this.plugin, this.group, this.currentVersion(), this.options);
      const known = JSON.stringify(this.notes.map(n => [n.notePath, n.raw]));
      if (JSON.stringify(snapshot.notes.map(n => [n.notePath,n.raw])) !== known) {
        this.notes = snapshot.notes; throw new Error('阅读笔记已变化，选项已刷新，请核对后重新导出。');
      }
      const bytes = await generatePdf(this.plugin, snapshot, this.options, this.controller.signal, message => { this.progress = message; if (!this.controller.signal.aborted) this.render(); });
      const fresh = await readSnapshot(this.plugin, this.group, snapshot.version, this.options);
      if (fresh.signature !== snapshot.signature) throw new Error('生成期间正文或阅读笔记已变化，请重新导出。');
      const suffix = this.options.includeNotes ? (snapshot.version.kind === 'pdf' ? '_含阅读笔记' : this.options.layout === 'inline' ? '_随文笔记' : '_文末笔记') : '';
      const filename = `${rules.safeFilename(snapshot.title)}_${snapshot.version.label}${suffix}.pdf`;
      const sourcePaths = [...new Set([...this.group.versions.map(v => v.path), ...snapshot.notes.map(n => n.notePath)])].map(p => this.app.vault.adapter.getFullPath(p));
      this.savedPath = await savePdf(bytes, filename, sourcePaths, this.controller.signal);
      if (this.savedPath) { new Notice('PDF 已导出'); this.progress = ''; }
    } catch (error) {
      if (error.name !== 'AbortError' && !this.controller.signal.aborted) { this.error = error.message || '导出失败，请重试。'; this.missing = error.images || null; }
    } finally { this.busy = false; if (!this.controller.signal.aborted) this.render(); }
  }
}
function openPdfExport(plugin, group) {
  try { desktopHost(); const modal = new PdfExportModal(plugin, group); modal.open(); return modal; }
  catch (error) { new Notice(error.message); return null; }
}
module.exports = { openPdfExport, PdfExportModal, collectNotes, readSnapshot, generatePdf };
