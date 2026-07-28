#!/usr/bin/env node
"use strict";

const fs = require("fs/promises");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
let registry;
try {
  registry = require("./skill-registry");
} catch (error) {
  registry = require("../plugin/skill-registry");
}

function parseArgs(argv) {
  const result = { runtime: "", skillId: "", manifestDigest: "", deviceId: "", source: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--runtime") result.runtime = path.resolve(argv[++index] || "");
    else if (value === "--skill-id") result.skillId = argv[++index] || "";
    else if (value === "--manifest-digest") result.manifestDigest = argv[++index] || "";
    else if (value === "--device-id") result.deviceId = argv[++index] || "";
    else if (value === "--source") result.source = path.resolve(argv[++index] || "");
  }
  return result;
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env || process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr || stdout}`)));
  });
}

function hasInstalledNpmDependency(tree, packageName, version, seen = new Set()) {
  if (!tree || typeof tree !== "object" || seen.has(tree)) return false;
  seen.add(tree);
  const dependencies = tree.dependencies && typeof tree.dependencies === "object" ? tree.dependencies : {};
  if (dependencies[packageName] && dependencies[packageName].version === version) return true;
  return Object.values(dependencies).some((dependency) => hasInstalledNpmDependency(dependency, packageName, version, seen));
}

async function provisionDeclaredDependencies(runtimeRoot, entry, runCommand = run) {
  const directory = registry.installedSkillPath(runtimeRoot, entry);
  const npmDependencies = entry.dependencies.filter((dependency) => dependency.id.startsWith("npm:"));
  const pythonWheels = entry.dependencies.filter((dependency) => dependency.id.startsWith("python-wheel:"));
  const playwrightBrowsers = entry.dependencies.filter((dependency) => dependency.id.startsWith("playwright-browser:"));
  if (npmDependencies.length) {
    await runCommand("npm", ["ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], { cwd: directory });
    const listed = JSON.parse((await runCommand("npm", ["ls", "--json", "--all"], { cwd: directory })).stdout || "{}");
    for (const dependency of npmDependencies) {
      const packageName = dependency.id.slice("npm:".length);
      if (!hasInstalledNpmDependency(listed, packageName, dependency.version)) {
        throw new Error(`Installed dependency mismatch for ${entry.skillId}: ${dependency.id}`);
      }
    }
  }
  if (pythonWheels.length) {
    const downloadRoot = await fs.mkdtemp(path.join(directory, ".installing-python-"));
    const pythonTarget = path.join(directory, ".python");
    const wheelPaths = [];
    try {
      for (let index = 0; index < pythonWheels.length; index += 1) {
        const dependency = pythonWheels[index];
        const packageName = dependency.id.slice("python-wheel:".length);
        const destination = path.join(downloadRoot, String(index));
        await fs.mkdir(destination, { recursive: true });
        await runCommand("python3", ["-m", "pip", "download", "--no-deps", "--only-binary=:all:", "--dest", destination, `${packageName}==${dependency.version}`], { cwd: directory });
        const files = (await fs.readdir(destination)).filter((name) => name.endsWith(".whl"));
        if (files.length !== 1) throw new Error(`Expected one wheel for ${dependency.id}, found ${files.length}`);
        const wheelPath = path.join(destination, files[0]);
        const actualDigest = crypto.createHash("sha256").update(await fs.readFile(wheelPath)).digest("hex");
        if (actualDigest !== dependency.digest) throw new Error(`Downloaded wheel digest mismatch for ${dependency.id}`);
        wheelPaths.push(wheelPath);
      }
      await fs.rm(pythonTarget, { recursive: true, force: true });
      await fs.mkdir(pythonTarget, { recursive: true });
      await runCommand("python3", ["-m", "pip", "install", "--no-index", "--no-deps", "--target", pythonTarget, ...wheelPaths], { cwd: directory });
    } catch (error) {
      await fs.rm(pythonTarget, { recursive: true, force: true });
      throw error;
    } finally {
      await fs.rm(downloadRoot, { recursive: true, force: true });
    }
  }
  if (playwrightBrowsers.length) {
    const browserRoot = path.join(directory, ".playwright-browsers");
    const browserEnvironment = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserRoot };
    try {
      await fs.rm(browserRoot, { recursive: true, force: true });
      for (const dependency of playwrightBrowsers) {
        const browserName = dependency.id.slice("playwright-browser:".length);
        const cli = path.join(directory, "node_modules", "playwright-core", "cli.js");
        await runCommand("node", [cli, "install", browserName], { cwd: directory, env: browserEnvironment });
        const script = `const { ${browserName} } = require("playwright"); process.stdout.write(${browserName}.executablePath());`;
        const executable = String((await runCommand("node", ["-e", script], { cwd: directory, env: browserEnvironment })).stdout || "").trim();
        if (!executable) throw new Error(`Playwright did not report an executable for ${dependency.id}`);
        const actualDigest = crypto.createHash("sha256").update(await fs.readFile(executable)).digest("hex");
        if (actualDigest !== dependency.digest) throw new Error(`Playwright browser digest mismatch for ${dependency.id}`);
      }
    } catch (error) {
      await fs.rm(browserRoot, { recursive: true, force: true });
      throw error;
    }
  }
  const metadataPath = path.join(directory, registry.INSTALL_METADATA_FILE);
  const installed = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const dependencyState = {
    status: "ready",
    verifiedAt: new Date().toISOString(),
    dependencies: entry.dependencies.map((dependency) => ({
      ...dependency,
      mode: dependency.id.startsWith("npm:") || dependency.id.startsWith("python-wheel:") || dependency.id.startsWith("playwright-browser:") ? "installed" : "manifest-locked",
    })),
  };
  await fs.writeFile(metadataPath, `${JSON.stringify({ ...installed, dependencyState }, null, 2)}\n`, "utf8");
  return dependencyState;
}

async function installManagedSkill(options) {
  if (!options.runtime || !options.skillId || !options.deviceId) throw new Error("runtime, skill-id, and device-id are required");
  const policy = registry.skillRuntimePolicy(options.skillId);
  if (!policy.enabled) throw new Error(`Skill ${options.skillId} is disabled by runtime policy: ${policy.reason}`);
  const entry = registry.skillRequirement(options.skillId, options.manifestDigest);
  let checkoutRoot = "";
  let sourceDirectory = options.source || "";
  try {
    if (!sourceDirectory) {
      if (entry.source.type !== "git") throw new Error(`Skill ${entry.skillId} requires a verified local source on this computer`);
      checkoutRoot = await fs.mkdtemp(path.join(os.tmpdir(), `reading-capture-skill-${entry.skillId}-`));
      await run("git", ["clone", "--filter=blob:none", "--no-checkout", entry.source.repository, checkoutRoot]);
      await run("git", ["checkout", "--detach", entry.source.ref], { cwd: checkoutRoot });
      const actualRef = (await run("git", ["rev-parse", "HEAD"], { cwd: checkoutRoot })).stdout.trim();
      if (actualRef !== entry.source.ref) throw new Error(`Skill source ref mismatch for ${entry.skillId}`);
      sourceDirectory = entry.source.subpath ? path.join(checkoutRoot, ...entry.source.subpath.split("/")) : checkoutRoot;
    } else if (entry.source.type !== "local-vendor") {
      throw new Error(`A local source override is not allowed for ${entry.skillId}`);
    }
    const installed = await registry.installSkillFromDirectory(sourceDirectory, options.runtime, entry, {
      approvedBy: options.deviceId,
      approvedAt: options.approvedAt || new Date().toISOString(),
    });
    try {
      await provisionDeclaredDependencies(options.runtime, entry, options.runCommand || run);
    } catch (error) {
      await fs.rm(registry.installedSkillPath(options.runtime, entry), { recursive: true, force: true });
      throw error;
    }
    return { ...installed, dependencyState: JSON.parse(await fs.readFile(path.join(registry.installedSkillPath(options.runtime, entry), registry.INSTALL_METADATA_FILE), "utf8")).dependencyState };
  } finally {
    if (checkoutRoot) await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const installed = await installManagedSkill(options);
  process.stdout.write(`${JSON.stringify({ status: "installed", skillId: installed.skillId, version: installed.version, artifactDigest: installed.artifactDigest })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { hasInstalledNpmDependency, installManagedSkill, parseArgs, provisionDeclaredDependencies, run };
