const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pluginDir = path.join(root, "plugin");
const distDir = path.join(root, "dist");
const packageDir = path.join(distDir, "reading-capture");
const zipPath = path.join(distDir, "reading-capture.zip");
const runtimeFiles = ["main.js", "manifest.json", "styles.css", "reading-core.js", "creation-workflow.js", "skill-registry.js", "skill-runner.js", "skill-manager.js"];
const coreRequireLine = 'const core = require("./reading-core");';
const creationWorkflowRequireLine = 'const creationWorkflow = require("./creation-workflow");';
const skillRegistryRequireLine = 'const skillRegistry = require("./skill-registry");';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function ensureReleaseMetadata() {
  const manifest = readJson("plugin/manifest.json");
  const packageJson = readJson("package.json");
  const versions = readJson("versions.json");

  if (packageJson.version !== manifest.version) {
    throw new Error(`package.json version ${packageJson.version} does not match manifest version ${manifest.version}`);
  }
  if (versions[manifest.version] !== manifest.minAppVersion) {
    throw new Error(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
  }
  return manifest;
}

function copyRuntimeFiles() {
  fs.rmSync(packageDir, { recursive: true, force: true });
  fs.mkdirSync(packageDir, { recursive: true });

  for (const fileName of runtimeFiles) {
    const source = ["skill-runner.js", "skill-manager.js"].includes(fileName) ? path.join(root, "scripts", fileName) : path.join(pluginDir, fileName);
    if (!fs.existsSync(source)) throw new Error(`Missing plugin runtime file: ${path.relative(root, source)}`);
    if (fileName === "main.js") {
      fs.writeFileSync(path.join(packageDir, fileName), buildBundledMain(), "utf8");
    } else {
      fs.copyFileSync(source, path.join(packageDir, fileName));
    }
  }
}

function buildBundledMain() {
  const main = fs.readFileSync(path.join(pluginDir, "main.js"), "utf8");
  const core = fs.readFileSync(path.join(pluginDir, "reading-core.js"), "utf8");
  const creationWorkflow = fs.readFileSync(path.join(pluginDir, "creation-workflow.js"), "utf8");
  const skillRegistry = fs.readFileSync(path.join(pluginDir, "skill-registry.js"), "utf8");
  if (!main.includes(coreRequireLine)) throw new Error(`plugin/main.js must contain ${coreRequireLine}`);
  if (!main.includes(creationWorkflowRequireLine)) {
    throw new Error(`plugin/main.js must contain ${creationWorkflowRequireLine}`);
  }
  if (!main.includes(skillRegistryRequireLine)) throw new Error(`plugin/main.js must contain ${skillRegistryRequireLine}`);
  const bundledCore = `const core = (() => {\n  const module = { exports: {} };\n  const exports = module.exports;\n${indent(core)}\n  return module.exports;\n})();`;
  const bundledCreationWorkflow = `const creationWorkflow = (() => {\n  const module = { exports: {} };\n  const exports = module.exports;\n${indent(creationWorkflow)}\n  return module.exports;\n})();`;
  const bundledSkillRegistry = `const skillRegistry = (() => {\n  const module = { exports: {} };\n  const exports = module.exports;\n${indent(skillRegistry)}\n  return module.exports;\n})();`;
  return main
    .replace(coreRequireLine, bundledCore)
    .replace(creationWorkflowRequireLine, bundledCreationWorkflow)
    .replace(skillRegistryRequireLine, bundledSkillRegistry);
}

function indent(text) {
  return String(text)
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
}

function createZip() {
  fs.rmSync(zipPath, { force: true });
  try {
    execFileSync("zip", ["-qr", zipPath, "reading-capture"], { cwd: distDir, stdio: "ignore" });
    return true;
  } catch (error) {
    console.warn("Could not create dist/reading-capture.zip because the zip command is unavailable.");
    return false;
  }
}

const manifest = ensureReleaseMetadata();
fs.mkdirSync(distDir, { recursive: true });
copyRuntimeFiles();
const zipped = createZip();

console.log(`Packaged Reading Capture ${manifest.version} in dist/reading-capture/`);
if (zipped) console.log("Created dist/reading-capture.zip");
