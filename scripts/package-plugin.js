const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pluginDir = path.join(root, "plugin");
const distDir = path.join(root, "dist");
const packageDir = path.join(distDir, "reading-capture");
const zipPath = path.join(distDir, "reading-capture.zip");
const runtimeFiles = ["main.js", "manifest.json", "styles.css", "reading-core.js"];

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
    const source = path.join(pluginDir, fileName);
    if (!fs.existsSync(source)) throw new Error(`Missing plugin runtime file: plugin/${fileName}`);
    fs.copyFileSync(source, path.join(packageDir, fileName));
  }
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
