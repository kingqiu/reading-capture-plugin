module.exports=async function(app){
 const document=app.workspace.containerEl.ownerDocument,win=document.defaultView;
 delete require.cache[require.resolve('../plugin/html-annotations')];
 const A=require('../plugin/html-annotations');const p=app.plugins.plugins['reading-capture'];
 const checks=[];const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>win.setTimeout(r,25));}throw Error('timeout');};
 await p.openHtmlPreview('Articles/annotations/article.html');
 const v=app.workspace.activeLeaf.view;await wait(()=>v.controller?.doc.querySelector('#inline'));
 let c=v.controller,doc=c.doc;
 const oldPayload=A.imagePayload(doc.querySelector('#inline'),c.sources);
 const style=doc.querySelector('#inline').style.width;
 doc.querySelector('#inline').style.width='200px';
 const changedPayload=A.imagePayload(doc.querySelector('#inline'),c.sources);
 doc.querySelector('#inline').style.width=style;
 // Viewport resize (not changing authored style) must not affect source identity.
 const width=doc.defaultView.frameElement.style.width;
 const before=A.imagePayload(doc.querySelector('#inline'),c.sources);
 doc.defaultView.frameElement.style.width='350px';
 const after=A.imagePayload(doc.querySelector('#inline'),c.sources);
 check(before.identityHash===after.identityHash,'SVG identity independent of viewport');
 doc.defaultView.frameElement.style.width=width;
 const payload=A.imagePayload(doc.querySelector('#local'),c.sources);
 const priorCount=c.entries.length;
 const freshBytes=Buffer.concat([payload.bytes,Buffer.from(`\n<!--failure-${Date.now()}-->`)]);
 const failing={...payload,bytes:freshBytes,hash:A.digest(freshBytes)};
 const create=app.vault.createBinary;
 let rejected=false;
 try{app.vault.createBinary=async()=>{throw Error('simulated disk error');};await c.save(null,failing,'should not persist','thought');}catch{rejected=true;}finally{app.vault.createBinary=create;}
 check(rejected && c.entries.length===priorCount,'attachment failure does not create a note');
 const image=app.vault.getAbstractFileByPath('Articles/annotations/diagram.svg');const original=await app.vault.read(image);
 const saved=await c.save(null,payload,'替换图片验证','thought');
 try{
  await app.vault.modify(image,original.replace('#dce8dd','#eeaaaa'));
  await v.render();await wait(()=>v.controller?.entries.some(e=>e.id===saved.annotationId));c=v.controller;
  check(!c.targets.has(saved.annotationId),'replaced image is not mistaken for old image');
  check(await app.vault.adapter.exists(c.entries.find(e=>e.id===saved.annotationId).htmlAnchor.snapshot),'snapshot survives image replacement');
 }finally{await app.vault.modify(image,original);await v.render();await wait(()=>v.controller?.entries.length>0);}
 const state=v.getState();await v.leaf.detach();
 await p.openHtmlPreview(state.sourcePath,saved.annotationId);
 const restored=app.workspace.activeLeaf.view;await wait(()=>restored.controller?.entries.length>0);
 check(restored.controller.targets.has(saved.annotationId),'close and reopen restores image target');
 return checks;
};
