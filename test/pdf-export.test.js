const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const rules = require('../plugin/pdf-export-core');
const core = require('../plugin/reading-core');
const { mergeNativePdf, writePdf } = require('../plugin/pdf-export-desktop');
const { PDFDocument, PDFName, degrees } = require('pdf-lib');
const tests = [];
function test(name, run) { tests.push({name,run}); }
const version = name => ({name,path:`Articles/example/${name}`,kind:name.endsWith('.pdf')?'pdf':'markdown'});
const context = { sourcePath:'Articles/example/article.md',notePath:'Notes/one.md',sourceLabel:'原文' };

test('translation preferred; enriched excluded; ambiguous candidates not guessed', () => {
  let result = rules.exportCandidates(['article_zh_enriched.md','article.md','article_zh.md','article.pdf'].map(version));
  assert.equal(result.defaultPath, version('article_zh.md').path); assert.equal(result.candidates.length,3);
  result = rules.exportCandidates(['article_zh.md','article_zh.pdf'].map(version)); assert.equal(result.defaultPath,version('article_zh.md').path);
  assert.equal(rules.exportCandidates(['notes.md','other.md'].map(version)).defaultPath,'');
  assert.equal(rules.exportCandidates(['article_zh.md','translation.md'].map(version)).defaultPath,'');
  assert.equal(rules.exportCandidates([version('article_zh_enriched.pdf')]).candidates.length,0);
  assert.equal(rules.exportCandidates([version('report.pdf')]).defaultPath,version('report.pdf').path);
});
test('empty template is not a note or AI summary', () => {
  const text = core.buildInitialReadingNote({source:core.buildSourceMetadata({vaultPath:context.sourcePath,title:'Example'}),now:'2026-10-19T10:00:00Z'});
  const parsed = rules.parseReadingNote(text,context);
  assert.equal(parsed.hasNotes,false); assert.equal(parsed.ai.length,0);
});
test('preserves thought lists, blockquotes, headings, fenced fake metadata and custom summaries', () => {
  const thought = '- 原因: 有上下文\n\n> 自己的引用\n\n## 我的小标题\n\n```md\n### ann_fake\n## AI 汇总\n- time: 这是代码\n```\n\n最后一行';
  const record = core.buildAnnotationBlock({selectedText:'引用原文',note:thought,now:'2026-10-19T10:00:00Z'});
  const text = `# 阅读记录：Example\n\n## 一句话判断\n\n自己的判断\n\n## 自写章节\n\n我的额外总结\n\n## 标注记录\n${record}\n## AI 汇总\n\nAI 内容\n\n## 内容转化记录\n- 微信公众号：\n`;
  const parsed = rules.parseReadingNote(text,context);
  assert.equal(parsed.records.length,1); assert.equal(parsed.records[0].quote,'引用原文'); assert.equal(parsed.records[0].note,thought);
  assert.equal(parsed.summaries.length,2); assert.equal(parsed.ai.length,1); assert.equal(parsed.ai[0].content,'AI 内容');
  assert(!JSON.stringify(parsed.records).includes('quote_hash'));
});
test('pure highlight, whole-article thought, image note and summary-only are valid', () => {
  for(const params of [{selectedText:'摘录'},{note:'整篇想法'},{media:{type:'image',src:'images/figure.png'},note:'图片想法'}]) {
    const parsed=rules.parseReadingNote(`## 标注记录\n${core.buildAnnotationBlock({...params,now:'2026-10-19T10:00:00Z'})}`,context);
    assert(parsed.hasNotes); assert.equal(parsed.records.length,1);
  }
  assert(rules.parseReadingNote('## 一句话判断\n只有总结').hasNotes);
  assert.equal(rules.parseReadingNote('## AI 汇总\n只有 AI').hasNotes,false);
});
test('group scope retains other-version records, selected scope excludes them', () => {
  const notes = ['a.md','b.md'].map(sourcePath=>({sourcePath,records:[{sourcePath}],summaries:[],ai:[]}));
  assert.equal(rules.selectedNotes(notes,'a.md','group').records.length,2);
  assert.equal(rules.selectedNotes(notes,'a.md','selected').records.length,1);
  assert.equal(rules.sourceTitle('---\ntitle: Fake\n---\n# Chosen title','Fallback'),'Chosen title');
  assert.equal(rules.safeFilename('name / unsafe:title'),'name _ unsafe_title');
});
test('export removes capture counters and biography, retaining only supplied article metadata and full illustrated body', () => {
  const body = '开头正文。\n\n![正文插图](images/figure.png)\n\n## 统计数据\n\n这里是作者分析的真实统计数据。\n\n- 点赞：100\n\n作者简介：这是正文里引用的文字。\n\n```md\n## 正文内容\n```';
  const source = '# 文章标题\n\n**作者**: [某作者](https://example.com/author)\n**时间**: 2026-10-18 12:35:48 UTC\n**链接**: https://example.com/article\n\n---\n\n## 📊 统计数据\n\n- ❤️ 点赞: 1,627\n- 💬 回复: 188\n- 🔄 转发: 221\n- 📨 引用: 69\n- 👁️ 浏览: 315,166\n- 🔖 收藏: 2,280\n\n**作者简介**: 采集的作者介绍\n\n---\n\n## 正文内容\n\n' + body;
  const result = rules.prepareArticle(source);
  assert.equal(result.body, body);
  assert.deepEqual(result.metadata, {author:'[某作者](https://example.com/author)',date:'2026-10-18',url:'https://example.com/article'});
});
test('missing article metadata stays absent; frontmatter metadata is used without inventing publication dates', () => {
  const source = '# 文章\n\n![开头插图](image.svg)\n\n第一段正文。';
  assert.equal(rules.prepareArticle(source).body,'![开头插图](image.svg)\n\n第一段正文。');
  assert.deepEqual(rules.prepareArticle(source).metadata,{author:'',date:'',url:''});
  assert.deepEqual(rules.prepareArticle(source,{authors:['作者甲','作者乙'],date:'2026-10-18',source_url:'https://example.com/original',created:'2026-10-19'}).metadata,{author:'作者甲、作者乙',date:'2026-10-18',url:'https://example.com/original'});
  const absent=rules.prepareArticle(source,{created:'2026-10-19',updated:'2026-10-20',url:'javascript:alert(1)'}).metadata;
  assert.equal(absent.date,'');assert.equal(absent.url,'');
});
test('ordinary statistics, code and metadata-looking prose are not removed from article bodies', () => {
  for (const body of ['## 统计数据\n\n- 样本数: 200\n- 正确率: 95%', '```md\n**作者**: 示例\n## 正文内容\n```', '开头正文\n\n**作者简介**: 正文中的引用\n\n## 正文内容\n\n更多内容', '## 统计数据\n\n- 点赞: 200\n\n这段分析属于正文。']) {
    assert.equal(rules.prepareArticle('# 文章\n\n**作者**: 示例作者\n\n'+body).body,body);
  }
});
test('native merge retains original page size, rotation, outlines, annotations and metadata', async () => {
  const original = await PDFDocument.create(); original.setTitle('Original title');
  const page = original.addPage([420,700]); page.setRotation(degrees(90)); page.drawText('Original searchable text');
  const annotation=original.context.obj({Type:'Annot',Subtype:'Link',Rect:[10,10,50,30],A:{S:'URI',URI:require('pdf-lib').PDFString.of('https://example.com')}});
  const ref=original.context.register(annotation); page.node.set(PDFName.of('Annots'),original.context.obj([ref]));
  const outlines=original.context.obj({Type:'Outlines',Count:0}); original.catalog.set(PDFName.of('Outlines'),original.context.register(outlines));
  const appendix = await PDFDocument.create(); appendix.addPage([595,842]).drawText('Two short notes share this page');
  const merged = await PDFDocument.load(await mergeNativePdf(await original.save(),await appendix.save()),{updateMetadata:false});
  assert.equal(merged.getPageCount(),2); assert.deepEqual(merged.getPage(0).getSize(),{width:420,height:700}); assert.equal(merged.getPage(0).getRotation().angle,90);
  assert.equal(merged.getTitle(),'Original title'); assert(merged.catalog.has(PDFName.of('Outlines'))); assert.equal(merged.getPage(0).node.Annots().size(),1);
  await assert.rejects(mergeNativePdf(Buffer.from('not pdf'),await appendix.save()),/加密或损坏/);
  original.catalog.set(PDFName.of('Perms'), original.context.obj({}));
  await assert.rejects(mergeNativePdf(await original.save(),await appendix.save()),/数字签名/);
});
test('save rejects source aliases, preserves sources, and cancellation leaves no file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'rc-export-test-'));
  try {
    const source=path.join(dir,'source.pdf'),alias=path.join(dir,'alias.pdf'),out=path.join(dir,'out.pdf');
    await fs.writeFile(source,'original'); await fs.link(source,alias);
    await assert.rejects(writePdf(Buffer.from('replacement'),alias,[source]),/不能覆盖/);
    assert.equal(await fs.readFile(source,'utf8'),'original');
    const abort=new AbortController();abort.abort();
    await assert.rejects(writePdf(Buffer.from('new'),out,[source],abort.signal),/已取消/);
    await assert.rejects(fs.stat(out));
    await writePdf(Buffer.from('new'),out,[source]); assert.equal(await fs.readFile(out,'utf8'),'new');
    assert.deepEqual((await fs.readdir(dir)).sort(),['alias.pdf','out.pdf','source.pdf']);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
(async()=>{for(const t of tests){await t.run();console.log(`✓ ${t.name}`)}console.log(`${tests.length} PDF export tests passed.`)})().catch(error=>{console.error(error);process.exitCode=1});
