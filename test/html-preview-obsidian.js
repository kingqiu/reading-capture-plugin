// Run against the isolated QA vault after creating the html-demo fixtures.
// Invoked with Obsidian CLI eval; returns assertions rather than private content.
module.exports = async function verify(app) {
  const plugin = app.plugins.plugins["reading-capture"];
  const results = [];
  const assert = (value, name) => { if (!value) throw new Error(name); results.push(name); };
  const wait = async (fn) => {
    for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error("Timed out waiting for view");
  };
  const path = "Articles/html-demo/preview.html";
  await plugin.openHtmlPreview(path);
  const view = app.workspace.getLeavesOfType("reading-capture-html").find((l) => l.view.sourcePath === path).view;
  await view.render();
  await wait(() => view.contentEl.querySelector("iframe")?.contentDocument?.querySelector("#art")?.complete);
  let frame = view.contentEl.querySelector("iframe");
  let doc = frame.contentDocument;
  await doc.fonts.ready;
  assert(frame.contentWindow.getComputedStyle(doc.body).backgroundColor === "rgb(247, 243, 232)", "external local CSS");
  assert(frame.contentWindow.getComputedStyle(doc.querySelector("header")).borderTopWidth === "6px", "nested CSS import");
  assert(doc.querySelector("img").naturalWidth === 1000, "relative local image");
  assert(doc.fonts.check("18px Demo"), "local font");
  assert(!frame.contentWindow.pageScriptRan, "page script disabled");
  assert(frame.getAttribute("sandbox") === "allow-same-origin", "scriptless sandbox");
  doc.querySelector("#jump").click();
  assert(frame.contentWindow.scrollY > 0, "in-page anchor");
  const count = app.workspace.getLeavesOfType("reading-capture-html").length;
  await plugin.openHtmlPreview(path);
  assert(app.workspace.getLeavesOfType("reading-capture-html").length === count, "reuse existing tab");
  assert(app.workspace.activeLeaf.view === view, "activate existing tab");
  doc.querySelector("#next").click();
  await wait(() => app.workspace.getLeavesOfType("reading-capture-html").some((l) => (l.view.sourcePath || "").endsWith("next.htm")));
  assert(true, "local HTML link");
  assert(view.getState().sourcePath === path, "persist source path");
  await view.setState({ sourcePath: "Articles/html-demo/empty.html" }, {});
  assert(view.contentEl.textContent.includes("此 HTML 文件为空"), "empty state");
  await view.setState({ sourcePath: "Articles/html-demo/missing.html" }, {});
  assert(view.contentEl.textContent.includes("无法预览"), "missing file state");
  await view.setState({ sourcePath: "Articles/html-demo/blocked.html" }, {});
  await wait(() => view.contentEl.querySelector("iframe")?.contentDocument?.querySelector("h1"));
  frame = view.contentEl.querySelector("iframe"); doc = frame.contentDocument;
  assert(!doc.querySelector("script,iframe,meta[http-equiv=refresh]"), "active embeds removed");
  assert([...doc.querySelectorAll("img")].every((img) => img.getAttribute("src").startsWith("data:")), "remote and missing assets blocked");
  doc.querySelector("button").click();
  assert(!window.htmlEscaped, "event handlers disabled");
  assert(view.contentEl.textContent.includes("部分资源"), "incomplete content notice");
  await view.setState({ sourcePath: path }, {});
  await wait(() => view.contentEl.querySelector("iframe")?.contentDocument?.querySelector("#art")?.complete);
  assert(view.getState().sourcePath === path, "restore saved state");
  await app.workspace.revealLeaf(view.leaf);
  return results;
};
