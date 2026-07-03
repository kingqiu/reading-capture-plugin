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
  assert.strictEqual(packageJson.scripts["release:check"], "npm test && npm run package");
}

function testPackageScriptDeclaresRuntimeFiles() {
  const script = fs.readFileSync(path.join(root, "scripts/package-plugin.js"), "utf8");

  for (const fileName of ["main.js", "manifest.json", "styles.css", "reading-core.js"]) {
    assert.match(script, new RegExp(JSON.stringify(fileName).slice(1, -1)));
  }
}

testReleaseMetadata();
testPackageScriptDeclaresRuntimeFiles();

console.log("release package tests passed");
