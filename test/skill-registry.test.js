const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const registry = require("../plugin/skill-registry");
const skillManager = require("../scripts/skill-manager");

async function testManagedInstallPinsAndVerifiesExactContent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-skill-registry-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Fixture Skill\n\nOnly writes declared outputs.\n");
    const artifactDigest = await registry.hashSkillDirectory(source);
    const entry = registry.normalizeRegistryEntry({
      skillId: "fixture-skill",
      displayName: "Fixture Skill",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://skill", ref: "commit-123" },
      version: "commit-123",
      artifactDigest,
      manifestDigest: "a".repeat(64),
      dependencies: [],
      permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
    });
    const installed = await registry.installSkillFromDirectory(source, runtime, entry, {
      approvedBy: "device-test",
      approvedAt: "2026-07-20T02:00:00.000Z",
    });
    assert.strictEqual(installed.skillId, "fixture-skill");
    assert.strictEqual(installed.artifactDigest, artifactDigest);
    assert.ok(fs.existsSync(path.join(runtime, "fixture-skill", `${artifactDigest}-${entry.manifestDigest}`, "SKILL.md")));
    const verified = await registry.verifyInstalledSkill(runtime, entry);
    assert.strictEqual(verified.status, "ready");

    fs.appendFileSync(path.join(registry.installedSkillPath(runtime, entry), "SKILL.md"), "tampered\n");
    const tampered = await registry.verifyInstalledSkill(runtime, entry);
    assert.strictEqual(tampered.status, "digest_mismatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testPermissionExpansionRequiresNewApproval() {
  const previous = { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] };
  const expanded = { read: ["declared-inputs", "vault"], write: ["declared-outputs"], network: ["github.com"], secrets: [] };
  assert.deepStrictEqual(registry.permissionExpansion(previous, expanded), {
    read: ["vault"],
    write: [],
    network: ["github.com"],
    secrets: [],
  });
  assert.strictEqual(registry.hasPermissionExpansion(previous, expanded), true);
  assert.strictEqual(registry.hasPermissionExpansion(expanded, previous), false);
}

function testUnsafeOptionalSkillFailsClosedUntilNarrowProfileExists() {
  assert.strictEqual(registry.skillRuntimePolicy("writing-styles").enabled, true);
  const policy = registry.skillRuntimePolicy("last30days");
  assert.strictEqual(policy.enabled, false);
  assert.match(policy.reason, /受控路线/u);
}

async function testManagedInstallerRejectsRuntimeDisabledSkill() {
  await assert.rejects(
    () => skillManager.installManagedSkill({
      runtime: path.join(os.tmpdir(), "reading-capture-disabled-install"),
      skillId: "last30days",
      deviceId: "device-a",
    }),
    /disabled by runtime policy/i,
  );
}

function testHistoricalRequirementAllowlistUsesFullImmutableManifest() {
  const previous = registry.finalizeRegistryEntry({
    skillId: "history-fixture",
    displayName: "History Fixture",
    executor: "codex",
    source: { type: "git", repository: "https://example.test/history.git", ref: "commit-v1" },
    version: "v1",
    artifactDigest: "1".repeat(64),
    dependencies: [],
    permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
  });
  const current = registry.finalizeRegistryEntry({
    ...previous,
    source: { ...previous.source, ref: "commit-v2" },
    version: "v2",
    artifactDigest: "2".repeat(64),
  });
  const history = registry.createSkillRegistryHistory([current, previous]);
  assert.strictEqual(registry.resolveRegisteredSkillRequirement(previous, history).version, "v1");
  assert.strictEqual(registry.resolveRegisteredSkillRequirement(current, history).version, "v2");
  assert.throws(() => registry.resolveRegisteredSkillRequirement({ ...previous, artifactDigest: "3".repeat(64) }, history), /not in the managed registry/i);
}

async function testDeclaredDependencyLockRejectsVersionOrIntegrityDrift() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-dependency-lock-"));
  try {
    fs.writeFileSync(path.join(root, "SKILL.md"), "# Dependency fixture\n");
    const integrity = "sha512-fixture-integrity";
    const dependencyDigest = require("crypto").createHash("sha256").update(integrity).digest("hex");
    fs.writeFileSync(path.join(root, "package-lock.json"), `${JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/example": { version: "1.2.3", integrity } },
    }, null, 2)}\n`);
    const entry = registry.finalizeRegistryEntry({
      skillId: "dependency-fixture",
      displayName: "Dependency Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://dependency", ref: "v1" },
      version: "v1",
      artifactDigest: await registry.hashSkillDirectory(root),
      dependencies: [{ id: "npm:example", version: "1.2.3", digest: dependencyDigest }],
      permissions: { read: [], write: [], network: [], secrets: [] },
    });
    assert.strictEqual((await registry.verifyDeclaredDependencyLock(root, entry)).status, "ready");
    const drifted = registry.finalizeRegistryEntry({ ...entry, dependencies: [{ id: "npm:example", version: "1.2.4", digest: dependencyDigest }] });
    await assert.rejects(() => registry.verifyDeclaredDependencyLock(root, drifted), /dependency lock mismatch/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRejectedOrFailedUpgradeKeepsPreviousDigestRunnable() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-skill-upgrade-"));
  try {
    const sourceV1 = path.join(root, "source-v1");
    const sourceV2 = path.join(root, "source-v2");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(sourceV1, { recursive: true });
    fs.mkdirSync(sourceV2, { recursive: true });
    fs.writeFileSync(path.join(sourceV1, "SKILL.md"), "# v1\n");
    fs.writeFileSync(path.join(sourceV2, "SKILL.md"), "# v2\n");
    const v1Digest = await registry.hashSkillDirectory(sourceV1);
    const base = {
      skillId: "upgrade-skill",
      displayName: "Upgrade Skill",
      executor: "codex",
      manifestDigest: "b".repeat(64),
      dependencies: [],
      permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
    };
    const v1 = registry.normalizeRegistryEntry({ ...base, version: "v1", artifactDigest: v1Digest, source: { type: "local-test", repository: "fixture://v1", ref: "v1" } });
    await registry.installSkillFromDirectory(sourceV1, runtime, v1, { approvedBy: "device-test" });
    const invalidV2 = registry.normalizeRegistryEntry({ ...base, version: "v2", artifactDigest: "c".repeat(64), source: { type: "local-test", repository: "fixture://v2", ref: "v2" } });
    await assert.rejects(() => registry.installSkillFromDirectory(sourceV2, runtime, invalidV2, { approvedBy: "device-test" }), /digest/i);
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, v1)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testSameArtifactWithDifferentApprovedManifestCanCoexist() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-skill-manifest-identity-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Same artifact\n");
    const base = {
      skillId: "manifest-identity",
      displayName: "Manifest Identity",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://identity", ref: "same-content" },
      version: "same-content",
      artifactDigest: await registry.hashSkillDirectory(source),
      dependencies: [],
    };
    const restricted = registry.finalizeRegistryEntry({ ...base, permissions: { read: [], write: [], network: [], secrets: [] } });
    const expanded = registry.finalizeRegistryEntry({ ...base, permissions: { read: [], write: [], network: ["public-web"], secrets: [] } });
    await registry.installSkillFromDirectory(source, runtime, restricted, { approvedBy: "device-a" });
    await registry.installSkillFromDirectory(source, runtime, expanded, { approvedBy: "device-a" });
    assert.notStrictEqual(registry.installedSkillPath(runtime, restricted), registry.installedSkillPath(runtime, expanded));
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, restricted)).status, "ready");
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, expanded)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testDependencyProvisionRecordsVerifiedRuntimeState() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-dependency-provision-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Provision fixture\n");
    const integrity = "sha512-provision-fixture";
    const dependencyDigest = require("crypto").createHash("sha256").update(integrity).digest("hex");
    const transitiveIntegrity = "sha512-transitive-fixture";
    const transitiveDigest = require("crypto").createHash("sha256").update(transitiveIntegrity).digest("hex");
    fs.writeFileSync(path.join(source, "package-lock.json"), `${JSON.stringify({ lockfileVersion: 3, packages: {
      "node_modules/example": { version: "1.2.3", integrity },
      "node_modules/transitive": { version: "4.5.6", integrity: transitiveIntegrity },
    } }, null, 2)}\n`);
    const entry = registry.finalizeRegistryEntry({
      skillId: "provision-fixture",
      displayName: "Provision Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://provision", ref: "v1" },
      version: "v1",
      artifactDigest: await registry.hashSkillDirectory(source),
      dependencies: [
        { id: "npm:example", version: "1.2.3", digest: dependencyDigest },
        { id: "npm:transitive", version: "4.5.6", digest: transitiveDigest },
      ],
      permissions: { read: [], write: [], network: [], secrets: [] },
    });
    await registry.installSkillFromDirectory(source, runtime, entry, { approvedBy: "device-a" });
    const calls = [];
    await skillManager.provisionDeclaredDependencies(runtime, entry, async (command, args) => {
      calls.push([command, ...args]);
      return args[0] === "ls" ? { stdout: JSON.stringify({ dependencies: { example: { version: "1.2.3", dependencies: { transitive: { version: "4.5.6" } } } } }) } : { stdout: "" };
    });
    assert.strictEqual(calls[0][1], "ci");
    assert.strictEqual(calls[1][1], "ls");
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, entry)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testPythonWheelProvisionVerifiesDigestBeforeOfflineInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-python-wheel-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Python fixture\n");
    const wheelContent = Buffer.from("fixture-wheel-content");
    const wheelDigest = require("crypto").createHash("sha256").update(wheelContent).digest("hex");
    const entry = registry.finalizeRegistryEntry({
      skillId: "python-wheel-fixture",
      displayName: "Python Wheel Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://python", ref: "v1" },
      version: "v1",
      artifactDigest: await registry.hashSkillDirectory(source),
      dependencies: [{ id: "python-wheel:ExamplePkg", version: "1.2.3", digest: wheelDigest }],
      permissions: { read: [], write: [], network: [], secrets: [] },
    });
    await registry.installSkillFromDirectory(source, runtime, entry, { approvedBy: "device-a" });
    const calls = [];
    await skillManager.provisionDeclaredDependencies(runtime, entry, async (command, args) => {
      calls.push([command, ...args]);
      if (args.includes("download")) {
        const destination = args[args.indexOf("--dest") + 1];
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, "examplepkg-1.2.3-py3-none-any.whl"), wheelContent);
      }
      return { stdout: "" };
    });
    assert.ok(calls.some((call) => call.includes("download")));
    assert.ok(calls.some((call) => call.includes("install") && call.includes("--no-index")));
    assert.ok(fs.existsSync(path.join(registry.installedSkillPath(runtime, entry), ".python")));
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, entry)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testPlaywrightBrowserProvisionVerifiesExecutableDigest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-playwright-browser-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Browser fixture\n");
    const executableContent = Buffer.from("fixture-chromium-executable");
    const executableDigest = require("crypto").createHash("sha256").update(executableContent).digest("hex");
    const entry = registry.finalizeRegistryEntry({
      skillId: "browser-fixture",
      displayName: "Browser Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://browser", ref: "v1" },
      version: "v1",
      artifactDigest: await registry.hashSkillDirectory(source),
      dependencies: [{ id: "playwright-browser:chromium", version: "fixture-revision", digest: executableDigest }],
      permissions: { read: [], write: [], network: [], secrets: [] },
    });
    await registry.installSkillFromDirectory(source, runtime, entry, { approvedBy: "device-a" });
    const installedDirectory = registry.installedSkillPath(runtime, entry);
    const executable = path.join(installedDirectory, ".playwright-browsers", "chromium-fixture", "chrome");
    const calls = [];
    await skillManager.provisionDeclaredDependencies(runtime, entry, async (command, args, options) => {
      calls.push([command, ...args]);
      if (args.includes("install")) {
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, executableContent);
      }
      if (args[0] === "-e") return { stdout: executable };
      return { stdout: "" };
    });
    assert.ok(calls.some((call) => call.includes("install") && call.includes("chromium")));
    assert.strictEqual((await registry.verifyInstalledSkill(runtime, entry)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testPlaywrightBrowserDigestFailureRemovesUntrustedRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-playwright-browser-failure-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Browser failure fixture\n");
    const entry = registry.finalizeRegistryEntry({
      skillId: "browser-failure-fixture",
      displayName: "Browser Failure Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://browser-failure", ref: "v1" },
      version: "v1",
      artifactDigest: await registry.hashSkillDirectory(source),
      dependencies: [{ id: "playwright-browser:chromium", version: "fixture-revision", digest: "f".repeat(64) }],
      permissions: { read: [], write: [], network: [], secrets: [] },
    });
    await registry.installSkillFromDirectory(source, runtime, entry, { approvedBy: "device-a" });
    const installedDirectory = registry.installedSkillPath(runtime, entry);
    const browserRoot = path.join(installedDirectory, ".playwright-browsers");
    const executable = path.join(browserRoot, "chromium-fixture", "chrome");
    await assert.rejects(
      () => skillManager.provisionDeclaredDependencies(runtime, entry, async (_command, args) => {
        if (args.includes("install")) {
          fs.mkdirSync(path.dirname(executable), { recursive: true });
          fs.writeFileSync(executable, "untrusted-browser-binary");
        }
        if (args[0] === "-e") return { stdout: executable };
        return { stdout: "" };
      }),
      /browser digest mismatch/i,
    );
    assert.strictEqual(fs.existsSync(browserRoot), false);
    assert.notStrictEqual((await registry.verifyInstalledSkill(runtime, entry)).status, "ready");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testManagedInstallPinsAndVerifiesExactContent()
  .then(testUnsafeOptionalSkillFailsClosedUntilNarrowProfileExists)
  .then(testManagedInstallerRejectsRuntimeDisabledSkill)
  .then(testPermissionExpansionRequiresNewApproval)
  .then(testHistoricalRequirementAllowlistUsesFullImmutableManifest)
  .then(testDeclaredDependencyLockRejectsVersionOrIntegrityDrift)
  .then(testRejectedOrFailedUpgradeKeepsPreviousDigestRunnable)
  .then(testSameArtifactWithDifferentApprovedManifestCanCoexist)
  .then(testDependencyProvisionRecordsVerifiedRuntimeState)
  .then(testPythonWheelProvisionVerifiesDigestBeforeOfflineInstall)
  .then(testPlaywrightBrowserProvisionVerifiesExecutableDigest)
  .then(testPlaywrightBrowserDigestFailureRemovesUntrustedRuntime)
  .then(() => console.log("skill registry tests passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
