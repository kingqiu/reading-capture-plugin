const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function testReleaseMetadata() {
  const manifest = readJson("plugin/manifest.json");
  const packageJson = readJson("package.json");
  const versions = readJson("versions.json");

  assert.strictEqual(packageJson.version, manifest.version);
  assert.strictEqual(versions[manifest.version], manifest.minAppVersion);
  assert.strictEqual(packageJson.scripts.package, "node scripts/package-plugin.js");
  assert.strictEqual(packageJson.scripts["release:check"], "npm test && npm run package && node test/release-package.test.js");
}

function testPackageScriptDeclaresRuntimeFiles() {
  const script = fs.readFileSync(path.join(root, "scripts/package-plugin.js"), "utf8");

  for (const fileName of ["main.js", "manifest.json", "styles.css", "reading-core.js"]) {
    assert.match(script, new RegExp(JSON.stringify(fileName).slice(1, -1)));
  }
}

function testPackagedMainIsBundled() {
  const packagedMainPath = path.join(root, "dist/reading-capture/main.js");
  if (!fs.existsSync(packagedMainPath)) return;
  const packagedMain = fs.readFileSync(packagedMainPath, "utf8");

  assert.doesNotMatch(packagedMain, /require\(["']\.\/reading-core["']\)/);
  assert.match(packagedMain, /const core = \(\(\) =>/);
}

function testLibraryFiltersCanScroll() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const rule = styles.match(/\.reading-capture-library-filters\s*\{(?<body>[^}]+)\}/);
  assert.ok(rule, "library filters should have a dedicated CSS rule");
  assert.match(rule.groups.body, /max-height:\s*calc\(100vh - \d+px\)/);
  assert.match(rule.groups.body, /overflow-y:\s*auto/);
}

function testReaderToolbarIsIntegratedWithWorkspace() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const rule = styles.match(/\.reading-capture-reader-toolbar\s*\{(?<body>[^}]+)\}/);
  assert.ok(rule, "reader toolbar should have a dedicated CSS rule");
  assert.match(rule.groups.body, /background:\s*transparent/);
  assert.match(rule.groups.body, /border:\s*0/);
  assert.match(rule.groups.body, /position:\s*static/);
  assert.match(rule.groups.body, /width:\s*100%/);
}

function testReaderUsesFixedWorkspaceWithIndependentScrollAreas() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const readerRule = styles.match(/\.reading-capture-reader\s*\{(?<body>[^}]+)\}/);
  assert.ok(readerRule, "reader should have a dedicated layout rule");
  assert.match(readerRule.groups.body, /display:\s*flex/);
  assert.match(readerRule.groups.body, /flex-direction:\s*column/);
  assert.match(readerRule.groups.body, /overflow:\s*hidden/);

  const workspaceRule = styles.match(/\.reading-capture-reader-workspace\s*\{(?<body>[^}]+)\}/);
  assert.ok(workspaceRule, "reader workspace should have a dedicated layout rule");
  assert.match(workspaceRule.groups.body, /flex:\s*1 1 auto/);
  assert.match(workspaceRule.groups.body, /min-height:\s*0/);
  assert.match(workspaceRule.groups.body, /overflow:\s*hidden/);

  const bodyRule = styles.match(/\.reading-capture-reader \.reading-capture-reader-body\.markdown-preview-view\s*\{(?<body>[^}]+)\}/);
  assert.ok(bodyRule, "reader body should be independently scrollable");
  assert.match(bodyRule.groups.body, /height:\s*100%/);
  assert.match(bodyRule.groups.body, /overflow-y:\s*auto/);

  const sidebarRule = styles.match(/\.reading-capture-reader-sidebar\s*\{(?<body>[^}]+)\}/);
  assert.ok(sidebarRule, "reader sidebar should be independently scrollable");
  assert.match(sidebarRule.groups.body, /height:\s*100%/);
  assert.match(sidebarRule.groups.body, /max-height:\s*none/);
  assert.match(sidebarRule.groups.body, /overflow-y:\s*auto/);
}

function testReaderMatchesApprovedTwoPaneDesignStructure() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");

  assert.match(main, /reading-capture-reader-workspace/);
  assert.match(main, /reading-capture-reader-main/);
  assert.match(main, /reading-capture-reader-footer/);

  const workspaceRule = styles.match(/\.reading-capture-reader-workspace\s*\{(?<body>[^}]+)\}/);
  assert.ok(workspaceRule, "reader workspace should define the approved two-pane layout");
  assert.match(workspaceRule.groups.body, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(320px,\s*360px\)/);
  assert.match(workspaceRule.groups.body, /overflow:\s*hidden/);

  const mainRule = styles.match(/\.reading-capture-reader-main\s*\{(?<body>[^}]+)\}/);
  assert.ok(mainRule, "reader main pane should be a fixed column");
  assert.match(mainRule.groups.body, /display:\s*flex/);
  assert.match(mainRule.groups.body, /flex-direction:\s*column/);
  assert.match(mainRule.groups.body, /min-height:\s*0/);

  const articleRule = styles.match(/\.reading-capture-reader-article-panel\s*\{(?<body>[^}]+)\}/);
  assert.ok(articleRule, "reader article panel should have a dedicated rule");
  assert.match(articleRule.groups.body, /border:\s*0/);
  assert.match(articleRule.groups.body, /background:\s*transparent/);

  const footerRule = styles.match(/\.reading-capture-reader-footer\s*\{(?<body>[^}]+)\}/);
  assert.ok(footerRule, "reader should have a fixed bottom progress bar");
  assert.match(footerRule.groups.body, /flex:\s*0 0 auto/);
}

function testReaderAnnotationTypesUseSharedPalette() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");

  assert.match(main, /reading-capture-sidebar-card \$\{typeClass\}/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-thought/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-topic/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-fact/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-image/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-blue\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-mint\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-amber\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-slate\)/);
  assert.match(styles, /border-left:\s*2px solid var\(--rc-annotation-border\)/);
}

testReleaseMetadata();
testPackageScriptDeclaresRuntimeFiles();
testPackagedMainIsBundled();
testLibraryFiltersCanScroll();
testReaderToolbarIsIntegratedWithWorkspace();
testReaderUsesFixedWorkspaceWithIndependentScrollAreas();
testReaderMatchesApprovedTwoPaneDesignStructure();
testReaderAnnotationTypesUseSharedPalette();

console.log("release package tests passed");
