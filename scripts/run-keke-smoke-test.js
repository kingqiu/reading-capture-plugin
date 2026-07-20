#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const runner = require("./skill-runner");
const skillRegistry = require("../plugin/skill-registry");

async function main() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-keke-smoke-"));
  const creationRoot = "Reading Capture/creation-projects";
  const projectRelative = `${creationRoot}/keke-smoke`;
  const projectDirectory = path.join(vault, projectRelative);
  const requestRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/requests/page-01.json`;
  const planRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/plan.md`;
  const imageRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/images/xhs-01.png`;
  const resultRelative = `${projectRelative}/deliverables/xiaohongshu/xiaohongshu-001/results/page-01.json`;
  const queueDirectory = path.join(vault, creationRoot, "_runner", "queue");
  fs.mkdirSync(path.dirname(path.join(vault, requestRelative)), { recursive: true });
  fs.mkdirSync(queueDirectory, { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Reading Capture Keke smoke test\n\nSynthetic, non-sensitive validation project.\n");
  fs.writeFileSync(path.join(vault, planRelative), "# 小红书卡片方案\n\nSwiss System，暖白底，IKB 蓝强调，1080×1440，封面只表达一个判断。\n");
  fs.writeFileSync(path.join(vault, requestRelative), `${JSON.stringify({
    schemaVersion: 1,
    groupId: "keke-smoke-group",
    proposalId: "swiss-ikb",
    template: { visualSystem: "Swiss System", ratio: "3:4" },
    palette: { theme: "ikb", primary: "Klein Blue", surface: "warm white", accent: "graphite" },
    page: 1,
    id: "page-01",
    fileName: "xhs-01.png",
    role: "封面",
    content: "AI Agent 上线前，先把失败变成可重复观察的证据",
    sourceAnchor: "Synthetic smoke-test statement",
    visualEvidence: "A single editorial headline with a small evidence-chain motif",
  }, null, 2)}\n`);
  const now = new Date().toISOString();
  fs.mkdirSync(path.join(vault, creationRoot, "_runner"), { recursive: true });
  fs.writeFileSync(path.join(vault, creationRoot, "_runner", "owner.json"), `${JSON.stringify({
    schemaVersion: 1,
    state: "active",
    ownerDeviceId: "smoke-device",
    ownerDeviceName: "Smoke Test",
    epoch: 1,
    heartbeatAt: now,
    updatedAt: now,
  }, null, 2)}\n`);
  const requirement = skillRegistry.skillRequirement("keke-social-card-skill");
  const taskPath = path.join(queueDirectory, "task-keke-smoke.json");
  fs.writeFileSync(taskPath, `${JSON.stringify({
    schemaVersion: 2,
    taskId: "task-keke-smoke",
    kind: "xhs.card-page",
    executor: "codex",
    skillId: "keke-social-card-skill",
    skillRequirement: requirement,
    status: "pending",
    attempts: 0,
    projectId: "keke-smoke",
    projectPath: `${projectRelative}/project.md`,
    projectDirectory: projectRelative,
    groupId: "keke-smoke-group",
    childKey: "page-01",
    childLabel: "第 1 页 · 封面",
    requiredChildCount: 1,
    inputs: [`${projectRelative}/project.md`, planRelative, requestRelative],
    outputs: [imageRelative, resultRelative],
    outputDirectories: [],
    network: { required: false, authorized: false },
    createdAt: now,
    updatedAt: now,
  }, null, 2)}\n`);

  const result = await runner.runOnce({
    vault,
    creationRoot,
    codex: "codex",
    once: true,
    deviceId: "smoke-device",
    epoch: 1,
    skillRuntime: path.join(os.homedir(), "Library", "Application Support", "Reading Capture", "skill-runtime"),
  });
  process.stdout.write(`${JSON.stringify({
    vault,
    status: result && result.status,
    waitingReason: result && result.waitingReason,
    error: result && result.error,
    imagePath: path.join(vault, imageRelative),
    resultPath: path.join(vault, resultRelative),
    taskPath,
  }, null, 2)}\n`);
  if (!result || result.status !== "awaiting_approval") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
