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
  assert.match(rule.groups.body, /max-height:\s*calc\(100vh - 170px\)/);
  assert.match(rule.groups.body, /overflow-y:\s*auto/);
}

testReleaseMetadata();
testPackageScriptDeclaresRuntimeFiles();
testPackagedMainIsBundled();
testLibraryFiltersCanScroll();

console.log("release package tests passed");
