const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');

function desktopHost() {
  const { Platform } = require('obsidian');
  if (!Platform?.isDesktopApp) throw new Error('PDF 导出仅支持桌面端 Obsidian。');
  let remote;
  try { remote = require('@electron/remote'); } catch (_) { remote = require('electron').remote; }
  if (!remote?.BrowserWindow || !remote?.dialog) throw new Error('当前 Obsidian 未提供本地 PDF 导出能力，请更新桌面版后重试。');
  return remote;
}
function checkAbort(signal) {
  if (signal?.aborted) { const error = new Error('已取消导出'); error.name = 'AbortError'; throw error; }
}
async function mergeNativePdf(original, notes) {
  let source;
  try { source = await PDFDocument.load(original, { updateMetadata: false, parseSpeed: 1000 }); }
  catch (_) { throw new Error('无法读取原 PDF：文件可能已加密或损坏。请先提供可正常打开、未加密的副本。'); }
  // Appending changes signed documents. Do not silently invalidate a signature.
  const form = source.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (source.catalog.has(PDFName.of('Perms')) || (form && form.has(PDFName.of('SigFlags')))) {
    throw new Error('原 PDF 含数字签名或认证信息。添加笔记会影响签名，请先另存无签名副本后导出。');
  }
  const appendix = await PDFDocument.load(notes, { updateMetadata: false, parseSpeed: 1000 });
  const originalCount = source.getPageCount();
  const pages = await source.copyPages(appendix, appendix.getPageIndices());
  pages.forEach(page => source.addPage(page));
  const bytes = await source.save({ useObjectStreams: false, objectsPerTick: 1000 });
  const verified = await PDFDocument.load(bytes, { updateMetadata: false, parseSpeed: 1000 });
  if (verified.getPageCount() !== originalCount + pages.length) throw new Error('PDF 合并校验失败，未保存文件。');
  return bytes;
}
async function printHtml(html, title, signal, onProgress = () => {}) {
  checkAbort(signal);
  const remote = desktopHost();
  const fs = require('fs').promises;
  const path = require('path');
  const dir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'reading-capture-pdf-'));
  let win, timer;
  const close = () => { if (win && !win.isDestroyed()) win.destroy(); };
  const abort = () => close();
  try {
    await fs.writeFile(path.join(dir, 'article.html'), html, { mode: 0o600 });
    checkAbort(signal);
    win = new remote.BrowserWindow({ show: false, width: 1000, height: 1200, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    signal?.addEventListener('abort', abort, { once: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    const work = async () => {
      await win.loadFile(path.join(dir, 'article.html'));
      await win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(i=>i.decode()));return true})()`);
      checkAbort(signal);
      onProgress('生成 PDF…');
      const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
      const result = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4', displayHeaderFooter: true, margins: { top: 0.72, bottom: 0.72, left: 0.78, right: 0.78 }, headerTemplate: `<div style="font-size:8px;color:#667360;width:100%;margin:0 20mm">${escape(title.slice(0, 65))}</div>`, footerTemplate: '<div style="font-size:8px;color:#667360;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
      checkAbort(signal);
      if (!result?.length) throw new Error('未能生成 PDF，请重试。');
      return new Uint8Array(result);
    };
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { close(); reject(new Error('PDF 生成超时，请检查文章资源后重试。')); }, 90000); })]);
  } catch (error) { checkAbort(signal); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); close(); await fs.rm(dir, { recursive: true, force: true }); }
}
async function savePdf(bytes, filename, sourcePaths, signal) {
  const remote = desktopHost();
  checkAbort(signal);
  const result = await remote.dialog.showSaveDialog(remote.getCurrentWindow(), { title: '导出 PDF', defaultPath: filename, filters: [{ name: 'PDF 文档', extensions: ['pdf'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
  checkAbort(signal);
  if (result.canceled || !result.filePath) return null;
  await writePdf(bytes, result.filePath, sourcePaths, signal);
  return result.filePath;
}
async function writePdf(bytes, target, sourcePaths = [], signal) {
  const fs = require('fs').promises;
  const path = require('path');
  checkAbort(signal);
  const targetStat = await fs.stat(target).catch(() => null);
  const targetReal = await fs.realpath(target).catch(() => path.resolve(target));
  for (const source of sourcePaths) {
    const real = await fs.realpath(source).catch(() => path.resolve(source));
    const stat = await fs.stat(source).catch(() => null);
    if (real === targetReal || (stat && targetStat && stat.ino === targetStat.ino && stat.dev === targetStat.dev)) throw new Error('不能覆盖文章或阅读笔记原文件，请选择其他文件名。');
  }
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${require('crypto').randomBytes(8).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    checkAbort(signal);
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
}
module.exports = { desktopHost, checkAbort, mergeNativePdf, printHtml, savePdf, writePdf };
