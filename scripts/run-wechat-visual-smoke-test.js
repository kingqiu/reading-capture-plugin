#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const runner = require("./skill-runner");
const skillRegistry = require("../plugin/skill-registry");

async function main() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "reading-capture-wechat-visual-smoke-"));
  const creationRoot = "Reading Capture/creation-projects";
  const projectRelative = `${creationRoot}/wechat-visual-smoke`;
  const projectDirectory = path.join(vault, projectRelative);
  const requestRelative = `${projectRelative}/deliverables/wechat/wechat-001/requests/visual-01.json`;
  const imageRelative = `${projectRelative}/deliverables/wechat/wechat-001/visuals/01-evidence-anchor.png`;
  const resultRelative = `${projectRelative}/deliverables/wechat/wechat-001/results/visual-01.json`;
  const queueDirectory = path.join(vault, creationRoot, "_runner", "queue");
  fs.mkdirSync(path.dirname(path.join(vault, requestRelative)), { recursive: true });
  fs.mkdirSync(queueDirectory, { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, "project.md"), "# Reading Capture WeChat visual smoke test\n\nSynthetic, non-sensitive validation project.\n");
  fs.writeFileSync(path.join(vault, requestRelative), `${JSON.stringify({
    schemaVersion: 1,
    groupId: "wechat-visual-smoke-group",
    id: "visual-01",
    label: "失败证据锚点",
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    fileName: "01-evidence-anchor.png",
    insertionAnchor: "核心判断之后",
    sourceAnchor: "Synthetic smoke-test statement",
    purpose: "把失败、复现路径、证据三个动作压缩成一张正文解释图",
    prompt: "16:9 横版，纯白背景。纯黑不规则小小克用身体压住一张不断飘走的失败记录，另一只手把复现路径固定到酒红刻度上，最终留下可验证证据。大量留白，少量中文标注：失败现场、复现、证据。不要标题，不要 PPT，不要可爱卡通。",
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
  const taskPath = path.join(queueDirectory, "task-wechat-visual-smoke.json");
  fs.writeFileSync(taskPath, `${JSON.stringify({
    schemaVersion: 2,
    taskId: "task-wechat-visual-smoke",
    kind: "wechat.visual-item",
    executor: "codex",
    skillId: "liangkeban-xiaoxiaoke-illustrations",
    skillRequirement: skillRegistry.skillRequirement("liangkeban-xiaoxiaoke-illustrations"),
    status: "pending",
    attempts: 0,
    projectId: "wechat-visual-smoke",
    projectPath: `${projectRelative}/project.md`,
    projectDirectory: projectRelative,
    groupId: "wechat-visual-smoke-group",
    childKey: "visual-01",
    childLabel: "失败证据锚点",
    dependencyAnchor: "核心判断之后",
    requiredChildCount: 1,
    inputs: [`${projectRelative}/project.md`, requestRelative],
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
