const crypto = require("crypto");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function textIndex(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4);
  const nodes = [];
  let text = "", node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,noscript,template,[hidden],[data-rc-ui]')) continue;
    if (!node.nodeValue) continue;
    nodes.push({ node, start: text.length, end: text.length + node.nodeValue.length });
    text += node.nodeValue;
  }
  return { text, nodes };
}
function selectionAnchor(root, selection) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const index = textIndex(root);
  let start = null, end = null;
  for (const item of index.nodes) {
    if (!range.intersectsNode(item.node)) continue;
    const from = range.startContainer === item.node ? range.startOffset : 0;
    const to = range.endContainer === item.node ? range.endOffset : item.node.length;
    if (to <= from || range.comparePoint(item.node, to) < 0 || range.comparePoint(item.node, from) > 0) continue;
    if (start === null) start = item.start + from;
    end = item.start + to;
  }
  if (start === null || end <= start || !index.text.slice(start, end).trim()) return null;
  return { version: 1, kind: "text", occurrences: index.text.split(index.text.slice(start,end)).length-1, exact: index.text.slice(start, end), prefix: index.text.slice(Math.max(0,start-64),start), suffix: index.text.slice(end,end+64), start, end, documentHash: digest(index.text) };
}
function locateText(text, anchor) {
  if (!anchor || anchor.kind !== "text" || !anchor.exact) return null;
  if (digest(text) === anchor.documentHash && text.slice(anchor.start, anchor.end) === anchor.exact) return { start: anchor.start, end: anchor.end };
  const hits = [];
  for (let at = text.indexOf(anchor.exact); at !== -1; at = text.indexOf(anchor.exact, at + 1)) hits.push({ start: at, end: at + anchor.exact.length });
  if (hits.length === 1 && anchor.occurrences === 1) return hits[0];
  const context = hits.filter(({start,end}) => (!anchor.prefix || text.slice(Math.max(0,start-anchor.prefix.length),start) === anchor.prefix) && (!anchor.suffix || text.slice(end,end+anchor.suffix.length) === anchor.suffix));
  return context.length === 1 ? context[0] : null;
}
function rangeFor(root, index, position) {
  const first=index.nodes.find(n=>n.end>position.start), last=[...index.nodes].reverse().find(n=>n.start<position.end);
  if (!first || !last) return null;
  const range=root.ownerDocument.createRange();
  range.setStart(first.node,position.start-first.start);range.setEnd(last.node,position.end-last.start);
  return range;
}
function imageElements(root) { return [...root.querySelectorAll("img,svg")].filter(el=>el.localName === "img" || !el.parentElement.closest("svg")); }
function imageContext(el) {
  const parent = el.closest("figure") || el.parentElement;
  return (parent?.textContent || "").replace(/\s+/g," ").trim().slice(0,300);
}
function imagePayload(el, sources = new Map()) {
  if (el.localName === "img") {
    const src = el.currentSrc || el.src;
    if (!el.complete || !el.naturalWidth) throw new Error("图片尚未加载完成，无法保存副本。");
    const match = src.match(/^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i);
    if (!match) throw new Error("图片不可用，无法保存副本。");
    const bytes = match[2] ? Buffer.from(match[3],"base64") : Buffer.from(decodeURIComponent(match[3]));
    const mime=match[1].toLowerCase();
    const ext=({"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp","image/avif":"avif","image/svg+xml":"svg","image/x-icon":"ico"})[mime];
    if (!ext) throw new Error("暂不支持此图片格式的副本。");
    return {bytes,ext,mime,hash:digest(bytes),source:sources.get(src) || "embedded-image",alt:el.alt || "图片",context:imageContext(el)};
  }
  const clone = el.cloneNode(true), win=el.ownerDocument.defaultView;
  const identity=el.cloneNode(true);
  for(const node of [identity,...identity.querySelectorAll("*")]) for(const attr of [...node.attributes]) if(attr.name.startsWith("data-rc-"))node.removeAttribute(attr.name);
  const identityHash=digest(new win.XMLSerializer().serializeToString(identity));
  const originals=[el,...el.querySelectorAll("*")], copies=[clone,...clone.querySelectorAll("*")];
  const props=["fill","fill-opacity","fill-rule","stroke","stroke-width","stroke-opacity","stroke-dasharray","stroke-linecap","stroke-linejoin","opacity","font-family","font-size","font-weight","font-style","text-anchor","dominant-baseline","letter-spacing","visibility","display","color","paint-order","width","height","box-sizing","line-height","text-align","white-space","word-break","background-color","padding","margin","border","border-radius","overflow","align-items","justify-content","flex-direction","gap"];
  copies.forEach((copy,i)=>{
    for (const a of [...copy.attributes]) if (a.name.startsWith("on") || a.name.startsWith("data-rc-") || a.name === "class") copy.removeAttribute(a.name);
    const computed=win.getComputedStyle(originals[i]);
    for (const prop of props) copy.style.setProperty(prop,computed.getPropertyValue(prop));
    // Never let a saved standalone SVG load outside resources.
    for (const attr of ["href","xlink:href"]) if(copy.hasAttribute(attr) && !/^(#|data:image\/)/i.test(copy.getAttribute(attr))) copy.removeAttribute(attr);
  });
  clone.querySelectorAll("script,iframe,object,embed,animate,animateTransform,set").forEach(n=>n.remove());
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  const box=el.getBoundingClientRect();
  clone.setAttribute("width",String(box.width));clone.setAttribute("height",String(box.height));
  const fontRules=[];
  for(const sheet of el.ownerDocument.styleSheets) {try { for(const rule of sheet.cssRules) if(rule.type===5) fontRules.push(rule.cssText); } catch {} }
  if(fontRules.length){const style=el.ownerDocument.createElementNS("http://www.w3.org/2000/svg","style");style.textContent=fontRules.join("\n");clone.prepend(style);}
  const bytes=Buffer.from(new win.XMLSerializer().serializeToString(clone));
  return {bytes,ext:"svg",mime:"image/svg+xml",identityHash,hash:digest(bytes),source:el.id ? `svg#${el.id}` : "inline-svg",alt:el.querySelector("title")?.textContent || "SVG 图表",context:imageContext(el)};
}
function locateImage(candidates, anchor) {
  if(!anchor || anchor.kind!=="image") return null;
  const matches=candidates.filter(c=>(c.payload.identityHash || c.payload.hash)===anchor.hash);
  if(matches.length===1 && (!anchor.context || matches[0].payload.context===anchor.context))return matches[0].element;
  const context=matches.filter(c=>c.payload.source===anchor.source && c.payload.context===anchor.context);
  return context.length===1 ? context[0].element : null;
}
async function saveSnapshot(plugin,payload) {
  const root=plugin.settings.readingRoot.replace(/\/+$/g,"");
  const path=`${root}/attachments/html/${payload.hash}.${payload.ext}`;
  await plugin.ensureFolderForPath(path);
  if(!await plugin.app.vault.adapter.exists(path)) {
    try {await plugin.app.vault.createBinary(path,payload.bytes.buffer.slice(payload.bytes.byteOffset,payload.bytes.byteOffset+payload.bytes.byteLength));}
    catch(error){if(!await plugin.app.vault.adapter.exists(path))throw error;}
  }
  const saved=await plugin.app.vault.adapter.readBinary(path);
  if(digest(Buffer.from(saved))!==payload.hash)throw new Error("图片副本校验失败，请重试。");
  return path;
}
function snapshotElement(plugin,container,path) {
  if(!path || !path.startsWith(`${plugin.settings.readingRoot.replace(/\/+$/g,"")}/attachments/html/`))return;
  const file=plugin.app.vault.getAbstractFileByPath(path);
  if(!plugin.isFile(file)){container.createEl("small",{text:"图片副本缺失"});return;}
  const img=container.createEl("img",{cls:"reading-capture-html-note-image",attr:{src:plugin.app.vault.getResourcePath(file),alt:"标注时保存的图片"}});
  img.addEventListener("error",()=>{img.hidden=true;container.createEl("small",{text:"图片副本无法显示"});},{once:true});
}
class HtmlAnnotations {
  constructor(view,frame,sidebar,sources){this.view=view;this.plugin=view.plugin;this.frame=frame;this.sidebar=sidebar;this.sources=sources;this.entries=[];this.targets=new Map();this.sequence=0;}
  async initialize(){
    const doc=this.frame.contentDocument;
    this.doc=doc;
    const style=doc.createElement("style");style.dataset.rcUi="true";
    style.textContent="::highlight(rc-reading){background:#f7cd65;color:#202018} [data-rc-image-mark]{outline:3px solid #db9d36!important;outline-offset:3px!important}";
    doc.head.append(style);
    doc.addEventListener("contextmenu",event=>{
      const anchor=selectionAnchor(doc.body,doc.defaultView.getSelection());
      let image=event.target.closest?.("img,svg");
      while(image?.localName==="svg" && image.parentElement.closest("svg"))image=image.parentElement.closest("svg");
      if(!image && !anchor)return;
      event.preventDefault();
      const host=this.view.contentEl.ownerDocument;
      this.view.closeContextMenu?.();
      const menu=host.body.createDiv({cls:"menu reading-capture-html-context",attr:{role:"menu"}});
      const rect=this.frame.getBoundingClientRect();
      menu.style.position="fixed";menu.style.zIndex="10000";
      menu.style.left=`${Math.min(rect.left+event.clientX,host.defaultView.innerWidth-230)}px`;
      menu.style.top=`${Math.min(rect.top+event.clientY,host.defaultView.innerHeight-100)}px`;
      const close=()=>{menu.remove();host.removeEventListener("pointerdown",outside,true);doc.removeEventListener("pointerdown",close,true);host.removeEventListener("keydown",key,true);};
      const outside=e=>{if(!menu.contains(e.target))close();};
      const key=e=>{if(e.key==="Escape")close();};
      this.view.closeContextMenu=close;
      const add=(text,action)=>{const button=menu.createEl("button",{cls:"menu-item",text,attr:{role:"menuitem"}});button.addEventListener("click",()=>{close();action();});return button;};
      const first=add(image?"记录图片想法":"标注选中文字",()=>this.capture(image,anchor));
      if(!image)add("仅高亮",()=>this.save(anchor,null,"","highlight").catch(()=>{}));
      host.addEventListener("pointerdown",outside,true);doc.addEventListener("pointerdown",close,true);host.addEventListener("keydown",key,true);
      first.focus();
    });
    doc.addEventListener("click",event=>{
      const el=event.target.closest?.("[data-rc-image-mark]");if(!el)return;
      this.view.setSidebarOpen(true);this.sidebar.querySelector(`[data-annotation-id="${el.getAttribute("data-rc-image-mark")}"]`)?.scrollIntoView({block:"nearest"});
    });
    await this.restore();
  }
  capture(image=null,anchor=null){
    let payload=null;
    try{if(image)payload=imagePayload(image,this.sources);}catch(error){this.view.showError(error);return;}
    this.plugin.promptHtmlAnnotation({image:!!image,preview:payload?.alt || anchor?.exact || "整篇想法",save:(note,type)=>this.save(anchor,payload,note,type)});
  }
  async save(anchor,payload,note,recordType){
    if(this.saving)throw new Error("正在保存上一条标注，请稍候。");this.saving=true;
    const previous=this.plugin.htmlCaptureQueue || Promise.resolve();
    let release;this.plugin.htmlCaptureQueue=new Promise(resolve=>{release=resolve;});
    await previous;
    try{
      if((payload || !anchor) && !note.trim())throw new Error("请填写想法。");
      const file=this.plugin.app.vault.getAbstractFileByPath(this.view.sourcePath);
      const target=this.plugin.resolveRecordTarget(recordType,note);
      let media=null;
      if(payload){const path=await saveSnapshot(this.plugin,payload);media={type:"image",src:path,alt:payload.alt};anchor={version:1,kind:"image",hash:payload.identityHash || payload.hash,source:payload.source,context:payload.context,snapshot:path};}
      const result=await this.plugin.captureForFile(file,{selectedText:anchor?.kind==="text"?anchor.exact:"",note,type:payload && target.type==="highlight-with-note"?"image-note":target.type,heading:target.heading,media,htmlAnchor:anchor,suppressOpen:true});
      if(!result)throw new Error("记录未保存，请检查源文件。");
      await this.restore();
      return result;
    }catch(error){this.view.showError(error);throw error;}finally{this.saving=false;release();}
  }
  async restore(){
    const sequence=++this.sequence,doc=this.doc;
    const file=this.plugin.app.vault.getAbstractFileByPath(this.view.sourcePath);
    const note=await this.plugin.findReadingNoteForSource(file);
    const entries=note?this.plugin.parseAnnotationsFromReadingNote(await this.plugin.readText(note.path)):[];
    if(sequence!==this.sequence || this.frame.contentDocument!==doc || !this.frame.isConnected)return;
    this.entries=entries;this.noteFile=note;this.targets.clear();
    doc.querySelectorAll("[data-rc-image-mark]").forEach(el=>el.removeAttribute("data-rc-image-mark"));
    const index=textIndex(doc.body),ranges=[];
    const images=[];
    for(const element of imageElements(doc.body)){try{images.push({element,payload:imagePayload(element,this.sources)});}catch{}}
    for(const entry of entries){
      const anchor=entry.htmlAnchor;
      if(anchor?.kind==="text"){
        const position=locateText(index.text,anchor);const range=position?rangeFor(doc.body,index,position):null;
        if(range){ranges.push(range);this.targets.set(entry.id,range);}
      }else if(anchor?.kind==="image"){
        const element=locateImage(images,anchor);
        if(element){element.setAttribute("data-rc-image-mark",entry.id);this.targets.set(entry.id,element);}
      }
      entry.located=this.targets.has(entry.id);
    }
    if(doc.defaultView.CSS?.highlights && doc.defaultView.Highlight)doc.defaultView.CSS.highlights.set("rc-reading",new doc.defaultView.Highlight(...ranges));
    this.renderSidebar();
    if(this.view.pendingAnnotationId){const id=this.view.pendingAnnotationId;this.view.pendingAnnotationId="";this.jump(id);}
  }
  jump(id){
    const target=this.targets.get(id),entry=this.entries.find(e=>e.id===id);
    if(!target){if(entry && !entry.quote && entry.mediaType!=="image")this.frame.contentWindow.scrollTo(0,0);else this.view.showError(new Error("这条记录在当前页面中未定位，原记录仍然保留。"));return;}
    const element=target.startContainer?.parentElement || target;
    element.scrollIntoView({block:"center",behavior:"smooth"});
  }
  renderSidebar(){
    const root=this.sidebar;root.empty();
    const head=root.createDiv({cls:"reading-capture-html-notes-head"});head.createEl("strong",{text:`阅读标注 · ${this.entries.length}`});
    head.createEl("button",{text:"收起"}).addEventListener("click",()=>this.view.setSidebarOpen(false));
    if(this.noteFile)root.createEl("button",{text:"打开阅读记录"}).addEventListener("click",()=>this.plugin.openReadingRecord(this.noteFile,this.plugin.app.vault.getAbstractFileByPath(this.view.sourcePath)));
    if(!this.entries.length)root.createEl("p",{text:"选中文字或右键图片，即可记录。"});
    for(const entry of this.entries){
      const card=root.createDiv({cls:"reading-capture-html-note",attr:{tabindex:"0","data-annotation-id":entry.id}});
      card.createEl("small",{text:`${this.plugin.annotationLabel(entry)} · ${entry.quote || entry.mediaType ? entry.located?"已定位":"未定位":"整篇想法"}`});
      if(entry.quote)card.createEl("blockquote",{text:entry.quote});
      if(entry.htmlAnchor?.snapshot)snapshotElement(this.plugin,card,entry.htmlAnchor.snapshot);
      if(entry.note)card.createEl("p",{text:entry.note});
      card.addEventListener("click",()=>this.jump(entry.id));
      card.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();this.jump(entry.id);}});
    }
  }
}
module.exports={digest,textIndex,selectionAnchor,locateText,imageElements,imagePayload,locateImage,saveSnapshot,snapshotElement,HtmlAnnotations};
