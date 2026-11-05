// Run against an isolated Obsidian vault, with at least one article group.
module.exports = async function(app) {
 const p=app.plugins.plugins['reading-capture'],doc=app.workspace.containerEl.ownerDocument,w=doc.defaultView;
 const pause=()=>new Promise(r=>w.setTimeout(r,100));const checks=[];const check=(b,label)=>{if(!b)throw Error(label);checks.push(label);};
 await p.openArticleLibrary();const v=app.workspace.activeLeaf.view;
 app.workspace.setActiveLeaf(v.leaf,{focus:true});
 const root=v.containerEl.children[1];await pause();
 v.saveLibraryPreference('left',true);v.saveLibraryPreference('right',true);v.saveLibraryPreference('theme','dark');await pause();
 check(!v.libraryNarrow,'wide viewport');
 for(const [left,right] of [[true,true],[false,true],[true,false],[false,false]]){
 v.saveLibraryPreference('left',left);v.saveLibraryPreference('right',right);await pause();
 check(root.querySelector('.rc-library-left-panel').hidden===!left && root.querySelector('.rc-library-right-panel').hidden===!right,`panels ${left}/${right}`);
 const list=root.querySelector('.reading-capture-library-list'),cols=w.getComputedStyle(list).gridTemplateColumns.split(' ').length;
 check(cols===Math.max(1,Math.min(4,Math.floor((list.clientWidth+12)/272))),`responsive columns ${cols}`);
 }
 v.searchDraft='保留未提交的搜索';const selected=v.selectedGroupId;await v.render();await pause();check(v.searchDraft==='保留未提交的搜索' && v.selectedGroupId===selected && root.querySelector('.rc-library-right-panel').hidden,'rerender preserves state');
 v.saveLibraryPreference('theme','light');await pause();check(w.getComputedStyle(root).backgroundColor==='rgb(247, 247, 247)','light background');
 check(root.querySelector('.rc-library-theme').getAttribute('aria-label')==='切换到深色','theme action label');
 const storage=JSON.parse(w.localStorage.getItem(v.libraryPreferenceKey));check(storage.theme==='light' && storage.left===false && storage.right===false,'local preference persistence');
 root.style.width='760px';await pause();check(v.libraryNarrow,'container narrow mode');
 v.toggleLibraryPanel('left',root.querySelector('[data-library-side="left"]'));await pause();check(!root.querySelector('.rc-library-left-panel').hidden,'left drawer');
 v.toggleLibraryPanel('right',root.querySelector('[data-library-side="right"]'));await pause();check(root.querySelector('.rc-library-left-panel').hidden && !root.querySelector('.rc-library-right-panel').hidden,'one drawer only');
 doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();check(root.querySelector('.rc-library-right-panel').hidden,'escape closes drawer');
 v.toggleLibraryPanel('left',root.querySelector('[data-library-side="left"]'));root.querySelector('.rc-library-backdrop').click();check(!v.libraryDrawer,'backdrop closes');
 check(JSON.parse(w.localStorage.getItem(v.libraryPreferenceKey)).left===false,'drawer does not overwrite preference');
 root.style.width='';await pause();check(!v.libraryNarrow && root.querySelector('.rc-library-left-panel').hidden,'wide restores preferences');
 v.searchDraft='';v.saveLibraryPreference('left',true);v.saveLibraryPreference('right',true);await v.render();await pause();
 return checks;
};
