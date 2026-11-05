const assert = require("assert");
const { resolveReference, createHtmlViewClass } = require("../plugin/html-preview");
const { sourceKindFromPath } = require("../plugin/reading-core");
assert.strictEqual(sourceKindFromPath("a.HTM"), "html");
assert.deepStrictEqual(resolveReference("../assets/a%20b.png#icon", "Articles/demo/page.html"), { path: "Articles/assets/a b.png", anchor: "icon" });
for (const reference of ["../../../outside.png", "%2fetc/passwd", "file:///a", "javascript:alert(1)", "//host/image", "..\\outside", "../.obsidian/config", "%00bad", "https:\n//host/a"]) {
  assert.strictEqual(resolveReference(reference, "Articles/page.html"), null, reference);
}
assert.deepStrictEqual(resolveReference("https://example.com/", "a.html"), { external: "https://example.com/" });
assert.deepStrictEqual(resolveReference("#标题", "a.html"), { anchor: "标题" });
// Stored view state is scoped to a file and survives workspace restoration.
class ItemView { async setState() {} }
const View = createHtmlViewClass(ItemView);
const view = new View({}, {});
view.render = async () => {};
(async () => {
  await view.setState({ sourcePath: "Articles/page.html" }, {});
  assert.deepStrictEqual(view.getState(), { sourcePath: "Articles/page.html" });
  assert.strictEqual(view.getDisplayText(), "page.html");
  console.log("HTML reference boundaries and view state tests passed");
})();
