const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const runner = require("../scripts/skill-runner");
const skillRegistry = require("../plugin/skill-registry");

async function testRunnerDryRunClaimsAndValidatesTask() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-"));
  try {
    const projectDirectory = path.join(vault, "Reading Capture/creation-projects/project-1");
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/research.md"), "# Research\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/sources.md"), "# Sources\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/diagnosis.md"), "# Diagnosis\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Brief\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/outline.md"), "# Outline\n");
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const taskPath = path.join(queueDirectory, "task-1.json");
    fs.writeFileSync(taskPath, `${JSON.stringify({
      schemaVersion: 1,
      taskId: "task-1",
      kind: "planning.diagnosis-brief-outline",
      executor: "codex",
      skillId: "writing-styles",
      skillProfile: "keke",
      status: "pending",
      attempts: 0,
      projectId: "project-1",
      projectPath: `${projectRelative}/project.md`,
      projectDirectory: projectRelative,
      inputs: ["project.md", "planning/context.md", "planning/research.md", "planning/sources.md"].map((item) => `${projectRelative}/${item}`),
      outputs: ["planning/diagnosis.md", "planning/master-brief.md", "planning/outline.md"].map((item) => `${projectRelative}/${item}`),
    }, null, 2)}\n`);

    const result = await runner.runOnce({
      vault,
      creationRoot: "Reading Capture/creation-projects",
      codex: "codex",
      dryRun: true,
      once: true,
    });
    assert.strictEqual(result.status, "pending");
    assert.strictEqual(result.attempts, 1);
    assert.ok(result.dryRunValidatedAt);
    assert.ok(fs.existsSync(path.join(projectDirectory, "runs/task-1_attempt-1/context-manifest.json")));
    const persisted = JSON.parse(fs.readFileSync(taskPath, "utf8"));
    assert.strictEqual(persisted.status, "pending");
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

function testRunnerRejectsEscapingPaths() {
  assert.throws(() => runner.resolveVaultPath("/tmp/vault", "../outside"), /escapes Vault/);
  const task = {
    schemaVersion: 1,
    taskId: "task-escape",
    kind: "planning.diagnosis-brief-outline",
    executor: "codex",
    skillId: "writing-styles",
    projectDirectory: "Reading Capture/creation-projects/project-1",
    inputs: ["Reading Capture/creation-projects/project-2/context.md"],
    outputs: [],
  };
  assert.throws(() => runner.validateTask(task, "/tmp/vault", "/tmp/vault/Reading Capture/creation-projects"), /outside its project/);
  const nestedTask = makeTask({
    projectDirectory: "Reading Capture/creation-projects/project-1/runs/old_attempt-1/workspace",
    projectPath: "Reading Capture/creation-projects/project-1/runs/old_attempt-1/workspace/project.md",
    inputs: ["Reading Capture/creation-projects/project-1/runs/old_attempt-1/workspace/planning/context.md"],
    outputs: ["Reading Capture/creation-projects/project-1/runs/old_attempt-1/workspace/planning/master-brief.md"],
  });
  assert.throws(() => runner.validateTask(nestedTask, "/tmp/vault", "/tmp/vault/Reading Capture/creation-projects"), /top-level creation project/i);
}

function makeTask(overrides = {}) {
  const projectRelative = "Reading Capture/creation-projects/project-1";
  return {
    schemaVersion: 2,
    taskId: "task-stage",
    kind: "brief.master",
    executor: "codex",
    skillId: "writing-styles",
    skillProfile: "keke",
    status: "pending",
    attempts: 0,
    projectId: "project-1",
    projectDirectory: projectRelative,
    inputs: [`${projectRelative}/planning/context.md`],
    outputs: [`${projectRelative}/planning/master-brief.md`],
    network: { required: false, authorized: false },
    ...overrides,
  };
}

function writeActiveOwner(vault, owner = {}) {
  const ownerPath = path.join(vault, "Reading Capture/creation-projects/_runner/owner.json");
  fs.mkdirSync(path.dirname(ownerPath), { recursive: true });
  fs.writeFileSync(ownerPath, `${JSON.stringify({
    schemaVersion: 1,
    state: "active",
    ownerDeviceId: "device-a",
    ownerDeviceName: "Mac A",
    epoch: 3,
    heartbeatAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...owner,
  }, null, 2)}\n`);
  return ownerPath;
}

function testRunnerSupportsStageTaskRegistry() {
  const vault = "/tmp/vault";
  const creationRoot = "/tmp/vault/Reading Capture/creation-projects";
  const briefTask = makeTask();
  assert.doesNotThrow(() => runner.validateTask(briefTask, vault, creationRoot));

  const researchTask = makeTask({
    kind: "research.evidence",
    skillId: "deep-research-skills",
    inputs: ["Reading Capture/creation-projects/project-1/planning/research-request.md"],
    outputs: [
      "Reading Capture/creation-projects/project-1/research/evidence.md",
      "Reading Capture/creation-projects/project-1/research/sources.md",
    ],
    network: { required: true, authorized: true, authorizedAt: "2026-07-19T12:00:00.000Z" },
  });
  assert.doesNotThrow(() => runner.validateTask(researchTask, vault, creationRoot));
  assert.throws(
    () => runner.validateTask({ ...researchTask, network: { required: true, authorized: false } }, vault, creationRoot),
    /network authorization/i,
  );
  assert.throws(
    () => runner.validateTask({ ...briefTask, skillId: "deep-research-skills" }, vault, creationRoot),
    /not allowed/i,
  );
}

function testRunnerBuildsStageSpecificPrompts() {
  const projectDirectory = "/tmp/vault/Reading Capture/creation-projects/project-1";
  const absolute = (relative) => ({ relative, absolute: path.join("/tmp/vault", relative) });
  const researchTask = makeTask({
    kind: "research.evidence",
    skillId: "deep-research-skills",
    inputs: ["Reading Capture/creation-projects/project-1/planning/research-request.md"].map(absolute),
    outputs: [
      "Reading Capture/creation-projects/project-1/research/evidence.md",
      "Reading Capture/creation-projects/project-1/research/sources.md",
    ].map(absolute),
    network: { required: true, authorized: true },
  });
  const researchPrompt = runner.buildPrompt(researchTask, projectDirectory);
  assert.match(researchPrompt, /\$deep-research-skills/);
  assert.match(researchPrompt, /联网研究/);
  assert.match(researchPrompt, /evidence\.md/);
  assert.doesNotMatch(researchPrompt, /材料诊断、创作简报与首个平台提纲/);

  const briefTask = makeTask({
    inputs: ["Reading Capture/creation-projects/project-1/planning/context.md"].map(absolute),
    outputs: ["Reading Capture/creation-projects/project-1/planning/master-brief.md"].map(absolute),
  });
  const briefPrompt = runner.buildPrompt(briefTask, projectDirectory);
  assert.match(briefPrompt, /\$writing-styles/);
  assert.match(briefPrompt, /创作简报/);
  assert.doesNotMatch(briefPrompt, /联网研究/);

  const qaTask = makeTask({
    kind: "wechat.qa",
    inputs: ["Reading Capture/creation-projects/project-1/deliverables/wechat/wechat-001/drafts/v1.md"].map(absolute),
    outputs: ["Reading Capture/creation-projects/project-1/deliverables/wechat/wechat-001/qa.md"].map(absolute),
  });
  const qaPrompt = runner.buildPrompt(qaTask, projectDirectory);
  assert.match(qaPrompt, /配图尚未生成不得扣分/);
  assert.match(qaPrompt, /视觉验收阶段/);
}

function testRunnerExtractsConservativeQualityScore() {
  assert.strictEqual(runner.extractQualityScore("视觉规则评分：97\n文案评分：95"), 95);
  assert.strictEqual(runner.extractQualityScore("score: 96/100"), 96);
  assert.strictEqual(runner.extractQualityScore("没有分数"), null);
}

async function testRunnerRejectsInvalidStructuredProductionPlans() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-plan-contract-"));
  try {
    const illustrationPath = path.join(root, "illustration-plan.json");
    fs.writeFileSync(illustrationPath, `${JSON.stringify({ schemaVersion: 1, items: [{ label: "missing id and skill", detail: "x".repeat(220) }] }, null, 2)}\n`);
    await assert.rejects(
      () => runner.validateOutputs({ kind: "wechat.plan", outputs: [{ relative: "illustration-plan.json", absolute: illustrationPath }] }, {}),
      /illustration plan item is missing id/u,
    );
    const proposalsPath = path.join(root, "proposals.json");
    fs.writeFileSync(proposalsPath, `${JSON.stringify({ schemaVersion: 1, proposals: [1, 2, 3].map((id) => ({ id: `route-${id}`, name: "route", template: "grid", palette: "green", pageCount: 1, pageCountReason: "reason", tradeoff: "tradeoff", pages: [{ page: 1, role: "cover" }] })) }, null, 2)}\n`);
    await assert.rejects(
      () => runner.validateOutputs({ kind: "xhs.plan", outputs: [{ relative: "proposals.json", absolute: proposalsPath }] }, {}),
      /proposal page is missing content/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testRunnerRedactsVaultHomeEmailAndSecrets() {
  const value = runner.redact(
    "Vault /Users/jimqiu/Vault account jim@example.com token ghp_abcdefghijklmnopqrstuvwxyz",
    "/Users/jimqiu/Vault",
  );
  assert.doesNotMatch(value, /\/Users\/jimqiu/u);
  assert.doesNotMatch(value, /jim@example\.com/u);
  assert.doesNotMatch(value, /ghp_/u);
  assert.match(value, /<vault>/u);
  assert.match(value, /<redacted-email>/u);
  assert.match(value, /<redacted-secret>/u);
}

async function testRunnerPromotesOnlyDeclaredOutputsFromIsolatedWorkspace() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-isolation-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Waiting\n");
    const taskPath = path.join(queueDirectory, "task-isolated.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(makeTask({ taskId: "task-isolated" }), null, 2)}\n`);
    const fakeCodex = path.join(vault, "fake-codex.sh");
    fs.writeFileSync(fakeCodex, [
      "#!/bin/sh",
      "while [ \"$#\" -gt 0 ]; do",
      "  if [ \"$1\" = \"--cd\" ]; then cd \"$2\"; break; fi",
      "  shift",
      "done",
      "mkdir -p planning",
      "printf '# 完整创作简报\\n\\n这是隔离工作区生成的内容。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 > planning/master-brief.md",
      "printf 'unauthorized' > rogue.md",
      "exit 0",
      "",
    ].join("\n"));
    fs.chmodSync(fakeCodex, 0o755);

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, dryRun: false, once: true });

    assert.strictEqual(result.status, "awaiting_approval");
    assert.match(fs.readFileSync(path.join(projectDirectory, "planning/master-brief.md"), "utf8"), /隔离工作区生成/);
    assert.strictEqual(fs.existsSync(path.join(projectDirectory, "rogue.md")), false, "undeclared writes must never reach the real project");
    assert.strictEqual(fs.existsSync(path.join(projectDirectory, "runs/task-isolated_attempt-1/workspace/rogue.md")), true, "undeclared writes remain inspectable in the attempt workspace");
    const receipt = fs.readFileSync(path.join(projectDirectory, "runs/task-isolated_attempt-1/receipt.md"), "utf8");
    assert.match(receipt, /reading-capture-run-receipt/);
    assert.match(receipt, /"status":"awaiting_approval"/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerDoesNotPromoteOutputsAfterTaskBecomesStale() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-stale-promotion-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Existing accepted content\n");
    const taskPath = path.join(queueDirectory, "task-stale-during-run.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(makeTask({ taskId: "task-stale-during-run" }), null, 2)}\n`);
    const fakeCodex = path.join(vault, "fake-codex-stale.js");
    fs.writeFileSync(fakeCodex, [
      "#!/usr/bin/env node",
      "const fs = require('fs');",
      "const path = require('path');",
      "const args = process.argv.slice(2);",
      "const cwd = args[args.indexOf('--cd') + 1];",
      "fs.mkdirSync(path.join(cwd, 'planning'), { recursive: true });",
      "fs.writeFileSync(path.join(cwd, 'planning/master-brief.md'), '# Stale generated content\\n\\n' + 'content '.repeat(40));",
      `const taskPath = ${JSON.stringify(taskPath)};`,
      "const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));",
      "fs.writeFileSync(taskPath, JSON.stringify({ ...task, status: 'stale', staleReason: 'article changed while running' }, null, 2) + '\\n');",
    ].join("\n"));
    fs.chmodSync(fakeCodex, 0o755);

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, dryRun: false, once: true });

    assert.strictEqual(result.status, "stale");
    assert.match(result.error, /未提升/u);
    assert.strictEqual(fs.readFileSync(path.join(projectDirectory, "planning/master-brief.md"), "utf8"), "# Existing accepted content\n");
    assert.match(fs.readFileSync(path.join(projectDirectory, "runs/task-stale-during-run_attempt-1/workspace/planning/master-brief.md"), "utf8"), /Stale generated content/u);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerRejectsInvalidCardImageBeforePromotion() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-invalid-image-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/requests"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/requests/page-01.json"), `${JSON.stringify({ schemaVersion: 1, page: 1, content: "fixture".repeat(40) })}\n`);
    const imageRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/images/xhs-01.png`;
    const resultRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/results/page-01.json`;
    const taskPath = path.join(queueDirectory, "task-invalid-image.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(makeTask({
      taskId: "task-invalid-image",
      kind: "xhs.card-page",
      skillId: "keke-social-card-skill",
      inputs: [`${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/requests/page-01.json`],
      outputs: [imageRelative, resultRelative],
    }), null, 2)}\n`);
    const fakeCodex = path.join(vault, "fake-codex-invalid-image.js");
    fs.writeFileSync(fakeCodex, [
      "#!/usr/bin/env node",
      "const fs = require('fs');",
      "const path = require('path');",
      "const args = process.argv.slice(2);",
      "const cwd = args[args.indexOf('--cd') + 1];",
      "const image = path.join(cwd, 'deliverables/xiaohongshu/xiaohongshu-001/images/xhs-01.png');",
      "const result = path.join(cwd, 'deliverables/xiaohongshu/xiaohongshu-001/results/page-01.json');",
      "fs.mkdirSync(path.dirname(image), { recursive: true });",
      "fs.mkdirSync(path.dirname(result), { recursive: true });",
      "fs.writeFileSync(image, 'not-a-real-png'.repeat(100));",
      "fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, status: 'complete', detail: 'x'.repeat(240) }, null, 2));",
    ].join("\n"));
    fs.chmodSync(fakeCodex, 0o755);

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, dryRun: false, once: true });

    assert.strictEqual(result.status, "waiting_user");
    assert.strictEqual(result.waitingReason, "invalid_output_contract");
    assert.match(result.error, /Image output is invalid/u);
    assert.strictEqual(fs.existsSync(path.join(vault, imageRelative)), false, "invalid image must remain outside the real project");
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testXhsQualityGateAutomaticallyIteratesBeforeHumanReview() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-xhs-quality-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/images"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/plan.md"), "# Plan\n");
    fs.writeFileSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json"), "{}\n");
    for (const name of ["caption.md", "cards-manifest.md", "visual-qa.md"]) {
      fs.writeFileSync(path.join(projectDirectory, `deliverables/xiaohongshu/xiaohongshu-001/${name}`), "# Waiting\n");
    }
    const task = makeTask({
      taskId: "task-xhs-quality",
      kind: "xhs.package",
      skillId: "keke-social-card-skill",
      inputs: [
        `${projectRelative}/project.md`,
        `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`,
        `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json`,
      ],
      outputs: ["caption.md", "cards-manifest.md", "visual-qa.md"].map((name) => `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/${name}`),
      outputDirectories: [`${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/images`],
      qualityThreshold: 95,
      qualityIterations: 1,
    });
    const taskPath = path.join(queueDirectory, "task-xhs-quality.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);
    const fakeCodex = path.join(vault, "fake-xhs-codex.sh");
    fs.writeFileSync(fakeCodex, [
      "#!/bin/sh",
      "while [ \"$#\" -gt 0 ]; do",
      "  if [ \"$1\" = \"--cd\" ]; then cd \"$2\"; break; fi",
      "  shift",
      "done",
      "base='deliverables/xiaohongshu/xiaohongshu-001'",
      "mkdir -p \"$base/images\"",
      "printf '# 发布文案\\n\\n这是完整的小红书发布文案。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 > \"$base/caption.md\"",
      "printf '# 卡片清单\\n\\n逐页卡片、来源锚点与文件清单。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 > \"$base/cards-manifest.md\"",
      "printf '# 视觉质检\\n\\n总分：94/100\\n需要继续修订。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 > \"$base/visual-qa.md\"",
      "exit 0",
      "",
    ].join("\n"));
    fs.chmodSync(fakeCodex, 0o755);

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, dryRun: false, once: true });

    assert.strictEqual(result.status, "pending", "sub-threshold XHS output must iterate before it is shown for approval");
    assert.strictEqual(result.qualityIterations, 2);
    assert.strictEqual(result.qualityScore, 94);
    assert.strictEqual(Object.keys(result.inputHashes || {}).length, 3, "Runner result should preserve the exact input dependency hashes used for the Attempt");
    assert.ok(Object.values(result.inputHashes).every((value) => /^[a-f0-9]{64}$/u.test(value)));
    assert.match(result.error, /自动迭代/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testXhsQualityGateStopsAfterFiveIterations() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-xhs-limit-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/images"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Project\n");
    fs.writeFileSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/plan.md"), "# Plan\n");
    fs.writeFileSync(path.join(projectDirectory, "deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json"), "{}\n");
    for (const name of ["caption.md", "cards-manifest.md", "visual-qa.md"]) fs.writeFileSync(path.join(projectDirectory, `deliverables/xiaohongshu/xiaohongshu-001/${name}`), "# Waiting\n");
    const task = makeTask({
      taskId: "task-xhs-limit",
      kind: "xhs.package",
      skillId: "keke-social-card-skill",
      inputs: [`${projectRelative}/project.md`, `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`, `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/plan-decision.json`],
      outputs: ["caption.md", "cards-manifest.md", "visual-qa.md"].map((name) => `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/${name}`),
      outputDirectories: [`${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/images`],
      qualityThreshold: 95,
      qualityIterations: 5,
    });
    const taskPath = path.join(queueDirectory, "task-xhs-limit.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);
    const fakeCodex = path.join(vault, "fake-xhs-codex.sh");
    fs.writeFileSync(fakeCodex, [
      "#!/bin/sh",
      "while [ \"$#\" -gt 0 ]; do if [ \"$1\" = \"--cd\" ]; then cd \"$2\"; break; fi; shift; done",
      "base='deliverables/xiaohongshu/xiaohongshu-001'",
      "printf '# 发布文案\\n\\n完整文案。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 > \"$base/caption.md\"",
      "printf '# 卡片清单\\n\\n完整清单。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 > \"$base/cards-manifest.md\"",
      "printf '# 视觉质检\\n\\n总分：90/100。%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 > \"$base/visual-qa.md\"",
      "exit 0",
    ].join("\n"));
    fs.chmodSync(fakeCodex, 0o755);

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, dryRun: false, once: true });

    assert.strictEqual(result.status, "waiting_user");
    assert.strictEqual(result.qualityIterations, 5);
    assert.match(result.error, /5/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerFencesTasksByRegisteredDevice() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-owner-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Waiting\n");
    const taskPath = path.join(queueDirectory, "task-owner.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(makeTask({ taskId: "task-owner" }), null, 2)}\n`);
    writeActiveOwner(vault);

    await assert.rejects(
      () => runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: "codex", dryRun: true, once: true, deviceId: "device-b", epoch: 3 }),
      /registered execution device/i,
    );
    assert.strictEqual(JSON.parse(fs.readFileSync(taskPath, "utf8")).status, "pending", "a fenced Runner must not claim the task");

    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: "codex", dryRun: true, once: true, deviceId: "device-a", epoch: 3, now: () => "2026-07-20T01:00:00.000Z" });
    assert.strictEqual(result.ownerDeviceId, "device-a");
    assert.strictEqual(result.fencingEpoch, 3);
    assert.strictEqual(result.leaseExpiresAt, "2026-07-20T01:01:30.000Z");
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerRetriesTransientFailureAtMostThreeAttempts() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-retry-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Waiting\n");
    const taskPath = path.join(queueDirectory, "task-retry.json");
    fs.writeFileSync(taskPath, `${JSON.stringify(makeTask({ taskId: "task-retry" }), null, 2)}\n`);
    writeActiveOwner(vault);
    const fakeCodex = path.join(vault, "fake-codex-failure.sh");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\necho 'temporary provider failure' >&2\nexit 2\n");
    fs.chmodSync(fakeCodex, 0o755);
    const times = [
      "2026-07-20T01:00:00.000Z",
      "2026-07-20T01:00:31.000Z",
      "2026-07-20T01:02:32.000Z",
    ];
    const first = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, deviceId: "device-a", epoch: 3, now: () => times[0] });
    assert.strictEqual(first.status, "pending");
    assert.strictEqual(first.attempts, 1);
    assert.strictEqual(first.nextAttemptAt, "2026-07-20T01:00:30.000Z");
    const second = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, deviceId: "device-a", epoch: 3, now: () => times[1] });
    assert.strictEqual(second.status, "pending");
    assert.strictEqual(second.attempts, 2);
    assert.strictEqual(second.nextAttemptAt, "2026-07-20T01:02:31.000Z");
    const third = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: fakeCodex, deviceId: "device-a", epoch: 3, now: () => times[2] });
    assert.strictEqual(third.status, "failed");
    assert.strictEqual(third.attempts, 3);
    assert.match(third.error, /temporary provider failure/i);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerRecoversOnlyItsOwnExpiredLease() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-lease-"));
  try {
    const projectRelative = "Reading Capture/creation-projects/project-1";
    const projectDirectory = path.join(vault, projectRelative);
    const queueDirectory = path.join(vault, "Reading Capture/creation-projects/_runner/queue");
    fs.mkdirSync(path.join(projectDirectory, "planning"), { recursive: true });
    fs.mkdirSync(queueDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "planning/context.md"), "# Context\n");
    fs.writeFileSync(path.join(projectDirectory, "planning/master-brief.md"), "# Waiting\n");
    writeActiveOwner(vault);
    const ownPath = path.join(queueDirectory, "task-own-lease.json");
    fs.writeFileSync(ownPath, `${JSON.stringify(makeTask({
      taskId: "task-own-lease",
      status: "running",
      attempts: 1,
      ownerDeviceId: "device-a",
      fencingEpoch: 3,
      leaseExpiresAt: "2026-07-20T00:30:00.000Z",
    }), null, 2)}\n`);

    const recovered = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: "codex", dryRun: true, deviceId: "device-a", epoch: 3, now: () => "2026-07-20T01:00:00.000Z" });
    assert.strictEqual(recovered.taskId, "task-own-lease");
    assert.strictEqual(recovered.attempts, 2);
    assert.strictEqual(recovered.recoveredFromExpiredLease, true);
    fs.writeFileSync(ownPath, `${JSON.stringify({ ...recovered, status: "completed" }, null, 2)}\n`);

    const foreignPath = path.join(queueDirectory, "task-foreign-lease.json");
    fs.writeFileSync(foreignPath, `${JSON.stringify(makeTask({
      taskId: "task-foreign-lease",
      status: "running",
      attempts: 1,
      ownerDeviceId: "device-b",
      fencingEpoch: 2,
      leaseExpiresAt: "2026-07-20T00:30:00.000Z",
    }), null, 2)}\n`);
    const result = await runner.runOnce({ vault, creationRoot: "Reading Capture/creation-projects", codex: "codex", dryRun: true, deviceId: "device-a", epoch: 3, now: () => "2026-07-20T01:00:00.000Z" });
    assert.strictEqual(result, null);
    const blocked = JSON.parse(fs.readFileSync(foreignPath, "utf8"));
    assert.strictEqual(blocked.status, "waiting_user");
    assert.strictEqual(blocked.waitingReason, "ownership_conflict");
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

async function testRunnerBlocksMissingOrTamperedManagedSkillBeforeAttempt() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-skill-preflight-"));
  try {
    const requirement = skillRegistry.skillRequirement("writing-styles");
    const missing = await runner.preflightManagedSkill({ skillId: "writing-styles", skillRequirement: requirement }, path.join(root, "runtime"));
    assert.strictEqual(missing.status, "missing_skill");
    assert.strictEqual(missing.requirement.artifactDigest, requirement.artifactDigest);

    const source = path.join(root, "source");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Installed fixture\n");
    const digest = await skillRegistry.hashSkillDirectory(source);
    const fixture = skillRegistry.finalizeRegistryEntry({
      skillId: "fixture-managed",
      displayName: "Fixture Managed",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://managed", ref: "commit-1" },
      version: "commit-1",
      artifactDigest: digest,
      dependencies: [],
      permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
    });
    await skillRegistry.installSkillFromDirectory(source, path.join(root, "runtime"), fixture, { approvedBy: "device-a" });
    const ready = await runner.preflightManagedSkill({ skillId: "fixture-managed", skillRequirement: fixture }, path.join(root, "runtime"), { allowUnregisteredFixture: true });
    assert.strictEqual(ready.status, "ready");
    assert.match(ready.entryFile, /SKILL\.md$/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRunnerRejectsSkillDisabledByRuntimePolicyBeforeInstallCheck() {
  const requirement = skillRegistry.skillRequirement("last30days");
  const result = await runner.preflightManagedSkill({ skillId: "last30days", skillRequirement: requirement }, path.join(os.tmpdir(), "runtime-does-not-matter"));
  assert.strictEqual(result.status, "runtime_disabled");
  assert.match(result.reason, /受控路线/u);
  assert.match(runner.synchronizedSkillPreflight(result).reason, /受控路线/u);
}

async function testRunnerAllowsPinnedHistoricalRegistryVersion() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-history-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Historical version\n");
    const previous = skillRegistry.finalizeRegistryEntry({
      skillId: "history-managed",
      displayName: "History Managed",
      executor: "codex",
      source: { type: "git", repository: "https://example.test/history.git", ref: "commit-v1" },
      version: "v1",
      artifactDigest: await skillRegistry.hashSkillDirectory(source),
      dependencies: [],
      permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
    });
    await skillRegistry.installSkillFromDirectory(source, runtime, previous, { approvedBy: "device-a" });
    const ready = await runner.preflightManagedSkill(
      { skillId: previous.skillId, skillRequirement: previous },
      runtime,
      { registeredRequirements: [previous] },
    );
    assert.strictEqual(ready.status, "ready");
    const rejected = await runner.preflightManagedSkill(
      { skillId: previous.skillId, skillRequirement: { ...previous, manifestDigest: "f".repeat(64) } },
      runtime,
      { registeredRequirements: [previous] },
    );
    assert.strictEqual(rejected.status, "registry_mismatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRunnerDetectsPermissionExpansionAgainstInstalledVersion() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-runner-skill-permission-"));
  try {
    const source = path.join(root, "source");
    const runtime = path.join(root, "runtime");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Previous version\n");
    const digest = await skillRegistry.hashSkillDirectory(source);
    const previous = skillRegistry.finalizeRegistryEntry({
      skillId: "permission-fixture",
      displayName: "Permission Fixture",
      executor: "codex",
      source: { type: "local-test", repository: "fixture://permission", ref: "v1" },
      version: "v1",
      artifactDigest: digest,
      dependencies: [],
      permissions: { read: ["declared-inputs"], write: ["declared-outputs"], network: [], secrets: [] },
    });
    await skillRegistry.installSkillFromDirectory(source, runtime, previous, { approvedBy: "device-a" });
    const expanded = skillRegistry.finalizeRegistryEntry({
      ...previous,
      source: { ...previous.source, ref: "v2" },
      version: "v2",
      artifactDigest: "d".repeat(64),
      permissions: { ...previous.permissions, network: ["public-web"] },
    });
    const result = await runner.preflightManagedSkill({ skillId: expanded.skillId, skillRequirement: expanded }, runtime, { allowUnregisteredFixture: true });
    assert.strictEqual(result.status, "permission_expansion");
    assert.deepStrictEqual(result.expansion.network, ["public-web"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testSynchronizedSkillPreflightExcludesMachineState() {
  const safe = runner.synchronizedSkillPreflight({
    status: "permission_expansion",
    skillId: "fixture",
    directory: "/Users/private/Library/Application Support/Reading Capture/skill-runtime/fixture",
    entryFile: "/Users/private/skill/SKILL.md",
    installed: { approvedBy: "device-private" },
    previous: {
      skillId: "fixture",
      version: "v1",
      artifactDigest: "a".repeat(64),
      manifestDigest: "b".repeat(64),
      permissions: { read: [], write: [], network: [], secrets: [] },
      approvedBy: "device-private",
      installedAt: "2026-07-20T00:00:00.000Z",
    },
    expansion: { read: ["vault"], write: [], network: [], secrets: [] },
  });
  const text = JSON.stringify(safe);
  assert.doesNotMatch(text, /\/Users\/private|device-private|installedAt/u);
  assert.strictEqual(safe.previous.version, "v1");
  assert.deepStrictEqual(safe.expansion.read, ["vault"]);
}

function testSkillExecutionEnvironmentUsesExplicitSecretAllowlist() {
  const requirement = skillRegistry.finalizeRegistryEntry({
    skillId: "environment-fixture",
    displayName: "Environment Fixture",
    executor: "codex",
    source: { type: "git", repository: "https://example.test/environment.git", ref: "commit-1" },
    version: "commit-1",
    artifactDigest: "4".repeat(64),
    dependencies: [],
    permissions: {
      read: ["declared-inputs"],
      write: ["declared-outputs"],
      network: ["public-web"],
      secrets: ["env:ALLOWED_RESEARCH_TOKEN"],
    },
  });
  const actual = runner.buildSkillExecutionEnvironment(requirement, {
    PATH: "/usr/bin:/bin",
    HOME: "/Users/example",
    TMPDIR: "/tmp/example",
    LANG: "en_US.UTF-8",
    ALLOWED_RESEARCH_TOKEN: "allowed-value",
    OPENAI_API_KEY: "must-not-leak",
    GH_TOKEN: "must-not-leak-either",
    UNRELATED_SETTING: "not-needed",
  });
  assert.strictEqual(actual.ALLOWED_RESEARCH_TOKEN, "allowed-value");
  assert.strictEqual(actual.PATH, "/usr/bin:/bin");
  assert.strictEqual(actual.HOME, "/Users/example");
  assert.strictEqual(actual.OPENAI_API_KEY, undefined);
  assert.strictEqual(actual.GH_TOKEN, undefined);
  assert.strictEqual(actual.UNRELATED_SETTING, undefined);
}

function testUndeclaredSecretIsAbsentFromRealSkillProcess() {
  const requirement = skillRegistry.finalizeRegistryEntry({
    skillId: "subprocess-environment-fixture",
    displayName: "Subprocess Environment Fixture",
    executor: "codex",
    source: { type: "git", repository: "https://example.test/environment.git", ref: "commit-1" },
    version: "commit-1",
    artifactDigest: "5".repeat(64),
    dependencies: [],
    permissions: { read: [], write: [], network: [], secrets: ["env:DECLARED_FIXTURE_TOKEN"] },
  });
  const environment = runner.buildSkillExecutionEnvironment(requirement, {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DECLARED_FIXTURE_TOKEN: "declared-value",
    UNDECLARED_FIXTURE_TOKEN: "must-not-cross-process-boundary",
  });
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify({ declared: process.env.DECLARED_FIXTURE_TOKEN, undeclared: process.env.UNDECLARED_FIXTURE_TOKEN || null }))"], {
    env: environment,
    encoding: "utf8",
  });
  assert.strictEqual(child.status, 0, child.stderr);
  assert.deepStrictEqual(JSON.parse(child.stdout), { declared: "declared-value", undeclared: null });
}

function testCodexExecutionArgsApplyTaskNetworkAndIgnoreGlobalConfiguration() {
  const base = runner.buildCodexExecutionArgs({ network: { required: false, authorized: false } }, "/workspace", "/tmp/last.txt", "prompt");
  assert.ok(base.includes("--ignore-user-config"));
  assert.ok(base.includes("--ignore-rules"));
  assert.ok(base.includes("features.web_search=false"));
  assert.ok(base.includes("sandbox_workspace_write.network_access=false"));
  assert.ok(base.includes('shell_environment_policy.inherit="all"'));
  const research = runner.buildCodexExecutionArgs({ network: { required: true, authorized: true } }, "/workspace", "/tmp/last.txt", "prompt");
  assert.ok(research.includes("features.web_search=true"));
  assert.ok(research.includes("sandbox_workspace_write.network_access=true"));
}

function testManagedDependencyRuntimeIsProjectLocal() {
  const requirement = { dependencies: [
    { id: "python-wheel:PyYAML", version: "6.0.3", digest: "a".repeat(64) },
    { id: "playwright-browser:chromium", version: "revision", digest: "b".repeat(64) },
  ] };
  const actual = runner.addManagedRuntimeEnvironment({ PATH: "/usr/bin", PYTHONPATH: "/must/not/inherit" }, "/workspace/.managed-skills/deep", requirement);
  assert.strictEqual(actual.PYTHONPATH, "/workspace/.managed-skills/deep/.python");
  assert.strictEqual(actual.PYTHONNOUSERSITE, "1");
  assert.strictEqual(actual.PYTHONDONTWRITEBYTECODE, "1");
  assert.strictEqual(actual.PLAYWRIGHT_BROWSERS_PATH, "/workspace/.managed-skills/deep/.playwright-browsers");
}

testRunnerDryRunClaimsAndValidatesTask()
  .then(testRunnerRejectsEscapingPaths)
  .then(testRunnerSupportsStageTaskRegistry)
  .then(testRunnerBuildsStageSpecificPrompts)
  .then(testRunnerExtractsConservativeQualityScore)
  .then(testRunnerRejectsInvalidStructuredProductionPlans)
  .then(testRunnerRedactsVaultHomeEmailAndSecrets)
  .then(testRunnerPromotesOnlyDeclaredOutputsFromIsolatedWorkspace)
  .then(testRunnerDoesNotPromoteOutputsAfterTaskBecomesStale)
  .then(testRunnerRejectsInvalidCardImageBeforePromotion)
  .then(testXhsQualityGateAutomaticallyIteratesBeforeHumanReview)
  .then(testXhsQualityGateStopsAfterFiveIterations)
  .then(testRunnerFencesTasksByRegisteredDevice)
  .then(testRunnerRetriesTransientFailureAtMostThreeAttempts)
  .then(testRunnerRecoversOnlyItsOwnExpiredLease)
  .then(testRunnerBlocksMissingOrTamperedManagedSkillBeforeAttempt)
  .then(testRunnerRejectsSkillDisabledByRuntimePolicyBeforeInstallCheck)
  .then(testRunnerAllowsPinnedHistoricalRegistryVersion)
  .then(testRunnerDetectsPermissionExpansionAgainstInstalledVersion)
  .then(testSkillExecutionEnvironmentUsesExplicitSecretAllowlist)
  .then(testUndeclaredSecretIsAbsentFromRealSkillProcess)
  .then(testCodexExecutionArgsApplyTaskNetworkAndIgnoreGlobalConfiguration)
  .then(testManagedDependencyRuntimeIsProjectLocal)
  .then(testSynchronizedSkillPreflightExcludesMachineState)
  .then(() => console.log("skill runner tests passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
