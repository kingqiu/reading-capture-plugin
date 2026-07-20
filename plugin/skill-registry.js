"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const PERMISSION_KEYS = Object.freeze(["read", "write", "network", "secrets"]);
const INSTALL_METADATA_FILE = "installed.json";
const SKILL_RUNTIME_POLICIES = Object.freeze({
  last30days: Object.freeze({
    enabled: false,
    reason: "V1 受控路线尚未完成；禁止浏览器 Cookie、系统钥匙串、运行时安装和未声明 Provider。",
  }),
});

function skillRuntimePolicy(skillId) {
  return SKILL_RUNTIME_POLICIES[String(skillId || "")] || { enabled: true, reason: "" };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeStringList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))].sort();
}

function normalizePermissions(value = {}) {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, normalizeStringList(value[key])]));
}

function normalizeRegistryEntry(value = {}) {
  const entry = {
    skillId: String(value.skillId || "").trim(),
    displayName: String(value.displayName || value.skillId || "").trim(),
    executor: String(value.executor || "codex").trim(),
    source: {
      type: String(value.source && value.source.type || "").trim(),
      repository: String(value.source && value.source.repository || "").trim(),
      ref: String(value.source && value.source.ref || value.version || "").trim(),
      subpath: String(value.source && value.source.subpath || "").replace(/\\/gu, "/").replace(/^\/+|\/+$/g, ""),
    },
    entryPath: String(value.entryPath || "SKILL.md").replace(/\\/gu, "/").replace(/^\/+/, ""),
    version: String(value.version || "").trim(),
    artifactDigest: String(value.artifactDigest || "").trim().toLowerCase(),
    manifestDigest: String(value.manifestDigest || "").trim().toLowerCase(),
    dependencies: (Array.isArray(value.dependencies) ? value.dependencies : []).map((dependency) => ({
      id: String(dependency.id || dependency.skillId || "").trim(),
      version: String(dependency.version || "").trim(),
      digest: String(dependency.digest || "").trim().toLowerCase(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    permissions: normalizePermissions(value.permissions),
  };
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.skillId)) throw new Error("Skill registry entry has an invalid skillId");
  if (entry.executor !== "codex") throw new Error(`Unsupported Skill executor: ${entry.executor}`);
  if (!entry.source.type || !entry.source.repository || !entry.source.ref) throw new Error(`Skill ${entry.skillId} must have an immutable source`);
  if (entry.source.subpath === ".." || entry.source.subpath.startsWith("../") || entry.source.subpath.includes("/../")) throw new Error(`Skill ${entry.skillId} has an invalid source subpath`);
  if (!entry.entryPath || entry.entryPath === ".." || entry.entryPath.startsWith("../") || entry.entryPath.includes("/../")) throw new Error(`Skill ${entry.skillId} has an invalid entry path`);
  if (!entry.version) throw new Error(`Skill ${entry.skillId} must have a pinned version`);
  if (!/^[a-f0-9]{64}$/u.test(entry.artifactDigest)) throw new Error(`Skill ${entry.skillId} must have a SHA-256 artifact digest`);
  if (!/^[a-f0-9]{64}$/u.test(entry.manifestDigest)) throw new Error(`Skill ${entry.skillId} must have a SHA-256 manifest digest`);
  for (const dependency of entry.dependencies) {
    if (!dependency.id || !dependency.version || !/^[a-f0-9]{64}$/u.test(dependency.digest)) throw new Error(`Skill ${entry.skillId} has an invalid dependency lock`);
  }
  return entry;
}

function registryManifestDigest(entry) {
  const normalized = normalizeRegistryEntry(entry);
  return sha256(JSON.stringify(canonicalize({
    skillId: normalized.skillId,
    executor: normalized.executor,
    source: normalized.source,
    entryPath: normalized.entryPath,
    version: normalized.version,
    artifactDigest: normalized.artifactDigest,
    dependencies: normalized.dependencies,
    permissions: normalized.permissions,
  })));
}

function permissionExpansion(previous, next) {
  const before = normalizePermissions(previous);
  const after = normalizePermissions(next);
  return Object.fromEntries(PERMISSION_KEYS.map((key) => {
    const known = new Set(before[key]);
    return [key, after[key].filter((item) => !known.has(item))];
  }));
}

function hasPermissionExpansion(previous, next) {
  return Object.values(permissionExpansion(previous, next)).some((items) => items.length > 0);
}

async function listSkillFiles(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if ([".git", "node_modules", ".venv", ".python", ".playwright-browsers", "__pycache__"].includes(entry.name) || entry.name === INSTALL_METADATA_FILE || entry.name.startsWith(".installing-")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSkillFiles(absolute, base));
    else if (entry.isFile()) files.push({ absolute, relative: path.relative(base, absolute).split(path.sep).join("/") });
  }
  return files;
}

async function hashSkillDirectory(directory) {
  const files = await listSkillFiles(path.resolve(directory));
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(await fs.readFile(file.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function verifyDeclaredDependencyLock(directory, entry) {
  const normalized = normalizeRegistryEntry(entry);
  if (!normalized.dependencies.length) return { status: "ready", dependencies: [] };
  let packageLock = null;
  const results = [];
  for (const dependency of normalized.dependencies) {
    if (dependency.id.startsWith("npm:")) {
      if (!packageLock) {
        try { packageLock = JSON.parse(await fs.readFile(path.join(directory, "package-lock.json"), "utf8")); } catch (error) {
          throw new Error(`Dependency lock mismatch for ${normalized.skillId}: package-lock.json is missing or invalid`);
        }
      }
      const packageName = dependency.id.slice("npm:".length);
      const locked = packageLock.packages && packageLock.packages[`node_modules/${packageName}`];
      const actualDigest = locked && locked.integrity ? sha256(String(locked.integrity)) : "";
      if (!locked || String(locked.version) !== dependency.version || actualDigest !== dependency.digest) {
        throw new Error(`Dependency lock mismatch for ${normalized.skillId}: ${dependency.id}`);
      }
      results.push({ ...dependency, status: "locked" });
      continue;
    }
    if (dependency.id === "python:requirements-manifest") {
      const files = ["pyproject.toml", "requirements-dev.txt"];
      const hash = crypto.createHash("sha256");
      for (const name of files) {
        const candidate = path.join(directory, "ars", name);
        let content;
        try { content = await fs.readFile(candidate); } catch (error) {
          throw new Error(`Dependency lock mismatch for ${normalized.skillId}: ${name} is missing`);
        }
        hash.update(name);
        hash.update("\0");
        hash.update(content);
        hash.update("\0");
      }
      if (hash.digest("hex") !== dependency.digest) throw new Error(`Dependency lock mismatch for ${normalized.skillId}: Python requirements manifest`);
      results.push({ ...dependency, status: "locked" });
      continue;
    }
    if (dependency.id.startsWith("python-wheel:")) {
      results.push({ ...dependency, status: "locked" });
      continue;
    }
    if (dependency.id.startsWith("playwright-browser:")) {
      results.push({ ...dependency, status: "locked" });
      continue;
    }
    throw new Error(`Unsupported dependency lock for ${normalized.skillId}: ${dependency.id}`);
  }
  return { status: "ready", dependencies: results };
}

function installedSkillPath(runtimeRoot, entry) {
  const normalized = normalizeRegistryEntry(entry);
  return path.join(path.resolve(runtimeRoot), normalized.skillId, `${normalized.artifactDigest}-${normalized.manifestDigest}`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function verifyInstalledSkill(runtimeRoot, entry) {
  const normalized = normalizeRegistryEntry(entry);
  const directory = installedSkillPath(runtimeRoot, normalized);
  if (!(await pathExists(path.join(directory, normalized.entryPath))) || !(await pathExists(path.join(directory, INSTALL_METADATA_FILE)))) {
    return { status: "missing_skill", skillId: normalized.skillId, directory };
  }
  let installed;
  try {
    installed = JSON.parse(await fs.readFile(path.join(directory, INSTALL_METADATA_FILE), "utf8"));
  } catch (error) {
    return { status: "invalid_install_manifest", skillId: normalized.skillId, directory };
  }
  const actualDigest = await hashSkillDirectory(directory);
  if (actualDigest !== normalized.artifactDigest || installed.artifactDigest !== normalized.artifactDigest || installed.manifestDigest !== normalized.manifestDigest) {
    return { status: "digest_mismatch", skillId: normalized.skillId, directory, expectedDigest: normalized.artifactDigest, actualDigest };
  }
  try {
    await verifyDeclaredDependencyLock(directory, normalized);
  } catch (error) {
    return { status: "dependency_mismatch", skillId: normalized.skillId, directory, error: error.message };
  }
  if (normalized.dependencies.length && (!installed.dependencyState || installed.dependencyState.status !== "ready")) {
    return { status: "dependency_missing", skillId: normalized.skillId, directory };
  }
  return { status: "ready", skillId: normalized.skillId, directory, installed };
}

async function installSkillFromDirectory(sourceDirectory, runtimeRoot, entry, approval = {}) {
  const normalized = normalizeRegistryEntry(entry);
  if (!approval.approvedBy) throw new Error(`Installation approval is required for ${normalized.skillId}`);
  const source = path.resolve(sourceDirectory);
  if (!(await pathExists(path.join(source, normalized.entryPath)))) throw new Error(`Skill source does not contain its declared entry: ${normalized.skillId}`);
  const sourceDigest = await hashSkillDirectory(source);
  if (sourceDigest !== normalized.artifactDigest) throw new Error(`Skill artifact digest mismatch for ${normalized.skillId}`);
  await verifyDeclaredDependencyLock(source, normalized);
  const parent = path.join(path.resolve(runtimeRoot), normalized.skillId);
  const target = installedSkillPath(runtimeRoot, normalized);
  const temporary = path.join(parent, `.installing-${normalized.artifactDigest}-${Date.now()}`);
  await fs.mkdir(parent, { recursive: true });
  await fs.rm(temporary, { recursive: true, force: true });
  try {
    await fs.cp(source, temporary, {
      recursive: true,
      force: false,
      filter: (candidate) => !candidate.split(path.sep).includes(".git") && path.basename(candidate) !== INSTALL_METADATA_FILE,
    });
    const copiedDigest = await hashSkillDirectory(temporary);
    if (copiedDigest !== normalized.artifactDigest) throw new Error(`Copied Skill digest mismatch for ${normalized.skillId}`);
    const installed = {
      schemaVersion: 1,
      ...normalized,
      approvedBy: String(approval.approvedBy),
      approvedAt: String(approval.approvedAt || new Date().toISOString()),
      installedAt: String(approval.installedAt || new Date().toISOString()),
    };
    await fs.writeFile(path.join(temporary, INSTALL_METADATA_FILE), `${JSON.stringify(installed, null, 2)}\n`, "utf8");
    if (await pathExists(target)) {
      const existing = await verifyInstalledSkill(runtimeRoot, normalized);
      if (existing.status === "ready") {
        await fs.rm(temporary, { recursive: true, force: true });
        return existing.installed;
      }
      throw new Error(`Existing managed Skill failed digest validation: ${normalized.skillId}`);
    }
    await fs.rename(temporary, target);
    return installed;
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function finalizeRegistryEntry(value) {
  const provisional = normalizeRegistryEntry({ ...value, manifestDigest: "0".repeat(64) });
  return normalizeRegistryEntry({ ...provisional, manifestDigest: registryManifestDigest(provisional) });
}

function createSkillRegistryHistory(entries = []) {
  const history = {};
  for (const value of entries) {
    const entry = normalizeRegistryEntry(value);
    if (!history[entry.skillId]) history[entry.skillId] = {};
    const existing = history[entry.skillId][entry.manifestDigest];
    if (existing && JSON.stringify(canonicalize(existing)) !== JSON.stringify(canonicalize(entry))) {
      throw new Error(`Conflicting managed Skill manifest: ${entry.skillId}@${entry.manifestDigest}`);
    }
    history[entry.skillId][entry.manifestDigest] = Object.freeze(entry);
  }
  for (const versions of Object.values(history)) Object.freeze(versions);
  return Object.freeze(history);
}

function resolveRegisteredSkillRequirement(value, history) {
  const requirement = normalizeRegistryEntry(value);
  const catalog = history || DEFAULT_SKILL_REGISTRY_HISTORY;
  const registered = catalog[requirement.skillId] && catalog[requirement.skillId][requirement.manifestDigest];
  if (!registered || JSON.stringify(canonicalize(registered)) !== JSON.stringify(canonicalize(requirement))) {
    throw new Error(`Skill requirement is not in the managed registry: ${requirement.skillId}@${requirement.version}`);
  }
  return JSON.parse(JSON.stringify(registered));
}

const DEFAULT_SKILL_REGISTRY = Object.freeze(Object.fromEntries([
  {
    skillId: "writing-styles",
    displayName: "Writing Styles",
    source: { type: "git", repository: "https://github.com/kingqiu/writing-styles.git", ref: "0e85e2f8b3b196f1ac1298c48f956467da3260fb" },
    version: "0e85e2f8b3b196f1ac1298c48f956467da3260fb",
    artifactDigest: "e58839df74e5c590cd68f1322ce87bfe8071a9d397fd0cd16792b3d4ac9e7639",
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
  },
  {
    skillId: "keke-social-card-skill",
    displayName: "Keke Social Card Skill",
    source: { type: "git", repository: "https://github.com/kingqiu/keke-social-card-skill.git", ref: "227316de72788a30c0452455ec9d917193fb2a22" },
    version: "227316de72788a30c0452455ec9d917193fb2a22",
    artifactDigest: "7ca103836eb5940de794730304f56cdaaed9a3eb6f233b84bdf39c901fa4faff",
    dependencies: [
      { id: "npm:playwright", version: "1.61.0", digest: "81c3ec5062fcb8a5ac8016ba1b902cd4caaaa69a4c6fe3a2de01e4c9d8757034" },
      { id: "npm:playwright-core", version: "1.61.0", digest: "ee6535ff33c4adaf60f3ccf6ccfdb736fa185102db9f08c3d2775084545e179f" },
      { id: "playwright-browser:chromium", version: "149.0.7827.55+revision-1228+macos-arm64", digest: "b1b9e2dd063115031f08eadc10ed381ca0fa05b2284baff8f721d87f5f0f61b7" },
    ],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["image-generation"], secrets: [] },
  },
  {
    skillId: "deep-research-skills",
    displayName: "Deep Research Skills",
    source: { type: "git", repository: "https://github.com/Weizhena/Deep-Research-skills.git", ref: "e5479f857f484cde13fe69d2f3ce8de7af193bc7", subpath: "skills/research-codex-zh" },
    entryPath: "research/SKILL.md",
    version: "e5479f857f484cde13fe69d2f3ce8de7af193bc7",
    artifactDigest: "23ad26f94a4647ed0be588e51c9097da606457eb96cd846b5b1a1ca250577795",
    dependencies: [
      { id: "python-wheel:PyYAML", version: "6.0.3", digest: "2283a07e2c21a2aa78d9c4442724ec1eb15f5e42a723b99cb3d822d48f5f7ad1" },
    ],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["public-web"], secrets: [] },
  },
  {
    skillId: "last30days",
    displayName: "Last30days",
    source: { type: "git", repository: "https://github.com/mvanhorn/last30days-skill.git", ref: "249c7a4c040558a903d6838dee31012980d4946d", subpath: "skills/last30days" },
    version: "3.16.0+249c7a4c",
    artifactDigest: "bcda2fa67c4c980d85992bec539158fde2c592492925249e46263a9559326757",
    permissions: { read: ["declared-inputs"], write: ["declared-outputs", "machine-cache"], network: ["public-web", "social-platforms"], secrets: ["optional-provider-tokens"] },
  },
  {
    skillId: "academic-research-suite",
    displayName: "Academic Research Suite",
    source: { type: "git", repository: "https://github.com/Imbad0202/academic-research-skills-codex.git", ref: "16696ba231c1a4063d5abf40349dbf00e5a753b2", subpath: "skills/academic-research-suite" },
    version: "0.1.21+16696ba2",
    artifactDigest: "82573fe8c938a81acb9cd6552c2c58e65c655cd9df74066fcf6058edf9599ece",
    dependencies: [
      { id: "python:requirements-manifest", version: "16696ba2", digest: "5cce0c3aa46b7ebf1493a703ab49208fa9e8a13e6ada0eb2a3ee4905c5418f69" },
      { id: "python-wheel:PyYAML", version: "6.0.3", digest: "2283a07e2c21a2aa78d9c4442724ec1eb15f5e42a723b99cb3d822d48f5f7ad1" },
      { id: "python-wheel:arrow", version: "1.4.0", digest: "749f0769958ebdc79c173ff0b0670d59051a535fa26e8eba02953dc19eb43205" },
      { id: "python-wheel:attrs", version: "26.1.0", digest: "c647aa4a12dfbad9333ca4e71fe62ddc36f4e63b2d260a37a8b83d2f043ac309" },
      { id: "python-wheel:defusedxml", version: "0.7.1", digest: "a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61" },
      { id: "python-wheel:fqdn", version: "1.5.1", digest: "3a179af3761e4df6eb2e026ff9e1a3033d3587bf980a0b1b2e1e5d08d7358014" },
      { id: "python-wheel:idna", version: "3.18", digest: "7f952cbe720b688055e3f87de14f5c3e5fdaa8bc3928985c4077ca689de849a2" },
      { id: "python-wheel:isoduration", version: "20.11.0", digest: "b2904c2a4228c3d44f409c8ae8e2370eb21a26f7ac2ec5446df141dde3452042" },
      { id: "python-wheel:jsonpointer", version: "3.1.1", digest: "8ff8b95779d071ba472cf5bc913028df06031797532f08a7d5b602d8b2a488ca" },
      { id: "python-wheel:jsonschema", version: "4.26.0", digest: "d489f15263b8d200f8387e64b4c3a75f06629559fb73deb8fdfb525f2dab50ce" },
      { id: "python-wheel:jsonschema-specifications", version: "2025.9.1", digest: "98802fee3a11ee76ecaca44429fda8a41bff98b00a0f2838151b113f210cc6fe" },
      { id: "python-wheel:pypdf", version: "6.14.2", digest: "3f07891af76dc002657e04993ab9b4de81de29f9013b9761d0b7968bff12e946" },
      { id: "python-wheel:python-dateutil", version: "2.9.0.post0", digest: "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427" },
      { id: "python-wheel:referencing", version: "0.37.0", digest: "381329a9f99628c9069361716891d34ad94af76e461dcb0335825aecc7692231" },
      { id: "python-wheel:rfc3339-validator", version: "0.1.4", digest: "24f6ec1eda14ef823da9e36ec7113124b39c04d50a4d3d3a3c2859577e7791fa" },
      { id: "python-wheel:rfc3987", version: "1.3.8", digest: "10702b1e51e5658843460b189b185c0366d2cf4cff716f13111b0ea9fd2dce53" },
      { id: "python-wheel:rpds-py", version: "2026.6.3", digest: "f4d78253f6996be4901669ad25319f842f740eccf4d58e3c7f3dd39e6dde1d8f" },
      { id: "python-wheel:ruamel.yaml", version: "0.19.1", digest: "27592957fedf6e0b62f281e96effd28043345e0e66001f97683aa9a40c667c93" },
      { id: "python-wheel:six", version: "1.17.0", digest: "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274" },
      { id: "python-wheel:tzdata", version: "2026.3", digest: "dc096730c87af6cab1b171c9d532be840741ff5d459015e7f6947bd7d7e54931" },
      { id: "python-wheel:uri-template", version: "1.3.0", digest: "a44a133ea12d44a0c0f06d7d42a52d71282e77e2f937d8abd5655b8d56fc1363" },
      { id: "python-wheel:webcolors", version: "25.10.0", digest: "032c727334856fc0b968f63daa252a1ac93d33db2f5267756623c210e57a4f1d" },
    ],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs", "machine-cache"], network: ["public-web", "academic-indexes"], secrets: ["optional-bibliographic-tokens"] },
  },
  {
    skillId: "baoyu-infographic",
    displayName: "Baoyu Infographic",
    source: { type: "local-vendor", repository: "https://github.com/JimLiu/baoyu-skills#baoyu-infographic", ref: "f3b5f2c7228c1e2a5dc2ca1a7807b989d91f11890db185953cb5c51a3097cd92" },
    version: "1.56.1+f3b5f2c7",
    artifactDigest: "f3b5f2c7228c1e2a5dc2ca1a7807b989d91f11890db185953cb5c51a3097cd92",
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["image-generation"], secrets: [] },
  },
  {
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    displayName: "两克伴小小克配图",
    source: { type: "local-vendor", repository: "managed-local://liangkeban-xiaoxiaoke-illustrations", ref: "51d375e6060be6252a7a31349bad274b35f370f6e804f55313ded3d75cd6b843" },
    version: "51d375e6060be6252a7a31349bad274b35f370f6e804f55313ded3d75cd6b843",
    artifactDigest: "51d375e6060be6252a7a31349bad274b35f370f6e804f55313ded3d75cd6b843",
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["image-generation"], secrets: [] },
  },
].map((entry) => {
  const normalized = finalizeRegistryEntry({ executor: "codex", dependencies: [], ...entry });
  return [normalized.skillId, normalized];
})));

// Keep superseded immutable entries in this history when the current catalog is
// upgraded. Tasks persist the full manifest, so an older project can reinstall
// and execute the exact version it originally approved.
const LEGACY_SKILL_REGISTRY_ENTRIES = [
  finalizeRegistryEntry({
    executor: "codex",
    skillId: "keke-social-card-skill",
    displayName: "Keke Social Card Skill",
    source: { type: "git", repository: "https://github.com/kingqiu/keke-social-card-skill.git", ref: "227316de72788a30c0452455ec9d917193fb2a22" },
    version: "227316de72788a30c0452455ec9d917193fb2a22",
    artifactDigest: "7ca103836eb5940de794730304f56cdaaed9a3eb6f233b84bdf39c901fa4faff",
    dependencies: [
      { id: "npm:playwright", version: "1.61.0", digest: "81c3ec5062fcb8a5ac8016ba1b902cd4caaaa69a4c6fe3a2de01e4c9d8757034" },
      { id: "npm:playwright-core", version: "1.61.0", digest: "ee6535ff33c4adaf60f3ccf6ccfdb736fa185102db9f08c3d2775084545e179f" },
    ],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["image-generation"], secrets: [] },
  }),
  finalizeRegistryEntry({
    executor: "codex",
    skillId: "deep-research-skills",
    displayName: "Deep Research Skills",
    source: { type: "git", repository: "https://github.com/Weizhena/Deep-Research-skills.git", ref: "e5479f857f484cde13fe69d2f3ce8de7af193bc7", subpath: "skills/research-codex-zh" },
    entryPath: "research/SKILL.md",
    version: "e5479f857f484cde13fe69d2f3ce8de7af193bc7",
    artifactDigest: "23ad26f94a4647ed0be588e51c9097da606457eb96cd846b5b1a1ca250577795",
    dependencies: [],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: ["public-web"], secrets: [] },
  }),
  finalizeRegistryEntry({
    executor: "codex",
    skillId: "academic-research-suite",
    displayName: "Academic Research Suite",
    source: { type: "git", repository: "https://github.com/Imbad0202/academic-research-skills-codex.git", ref: "16696ba231c1a4063d5abf40349dbf00e5a753b2", subpath: "skills/academic-research-suite" },
    version: "0.1.21+16696ba2",
    artifactDigest: "82573fe8c938a81acb9cd6552c2c58e65c655cd9df74066fcf6058edf9599ece",
    dependencies: [{ id: "python:requirements-manifest", version: "16696ba2", digest: "5cce0c3aa46b7ebf1493a703ab49208fa9e8a13e6ada0eb2a3ee4905c5418f69" }],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs", "machine-cache"], network: ["public-web", "academic-indexes"], secrets: ["optional-bibliographic-tokens"] },
  }),
];
const DEFAULT_SKILL_REGISTRY_HISTORY = createSkillRegistryHistory([...Object.values(DEFAULT_SKILL_REGISTRY), ...LEGACY_SKILL_REGISTRY_ENTRIES]);

function skillRequirement(skillId, manifestDigest = "") {
  const normalizedId = String(skillId || "");
  const entry = manifestDigest
    ? DEFAULT_SKILL_REGISTRY_HISTORY[normalizedId] && DEFAULT_SKILL_REGISTRY_HISTORY[normalizedId][String(manifestDigest)]
    : DEFAULT_SKILL_REGISTRY[normalizedId];
  if (!entry) throw new Error(`Skill is not in the managed registry: ${skillId}`);
  return JSON.parse(JSON.stringify(entry));
}

module.exports = {
  INSTALL_METADATA_FILE,
  PERMISSION_KEYS,
  DEFAULT_SKILL_REGISTRY,
  DEFAULT_SKILL_REGISTRY_HISTORY,
  createSkillRegistryHistory,
  finalizeRegistryEntry,
  hasPermissionExpansion,
  hashSkillDirectory,
  installSkillFromDirectory,
  installedSkillPath,
  normalizePermissions,
  normalizeRegistryEntry,
  permissionExpansion,
  registryManifestDigest,
  resolveRegisteredSkillRequirement,
  skillRuntimePolicy,
  skillRequirement,
  verifyInstalledSkill,
  verifyDeclaredDependencyLock,
};
