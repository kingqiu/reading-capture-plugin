#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function relativeToVault(vault, absolutePath) {
  const relative = path.relative(vault, absolutePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../")) throw new Error(`Path is outside Vault: ${absolutePath}`);
  return relative;
}

function fixtureRoot() {
  return path.join(os.tmpdir(), "reading-capture-real-vault-workflow-fixture");
}

function retireTask(taskPath) {
  if (!fs.existsSync(taskPath)) return;
  const retired = path.join(fixtureRoot(), "retired", `${Date.now()}-${path.basename(taskPath)}`);
  fs.mkdirSync(path.dirname(retired), { recursive: true });
  fs.renameSync(taskPath, retired);
}

function restore(manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error("No active real-Vault fixture to restore");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.copyFileSync(manifest.workflowBackup, manifest.workflowPath);
  for (const taskPath of manifest.taskPaths || []) retireTask(taskPath);
  const archived = path.join(fixtureRoot(), `restored-${Date.now()}.json`);
  fs.renameSync(manifestPath, archived);
  process.stdout.write(`${JSON.stringify({ restored: true, workflowPath: manifest.workflowPath, archived }, null, 2)}\n`);
}

function taskRecord(base, spec) {
  const now = new Date().toISOString();
  const outputHashes = Object.fromEntries((spec.outputs || []).map((output) => [output, crypto.createHash("sha256").update(`${spec.childKey}:${output}`).digest("hex")]));
  return {
    schemaVersion: 2,
    taskId: spec.taskId,
    projectId: base.projectId,
    projectPath: base.projectPath,
    projectDirectory: base.projectDirectory,
    kind: spec.kind,
    skillId: spec.skillId,
    status: spec.status,
    groupId: spec.groupId,
    childKey: spec.childKey,
    childLabel: spec.childLabel,
    dependencyAnchor: spec.dependencyAnchor || "",
    requiredChildCount: base.requiredChildCount,
    inputs: [`${base.projectDirectory}/project.md`],
    outputs: spec.outputs,
    outputDirectories: [],
    outputHashes: ["completed", "awaiting_approval", "stale"].includes(spec.status) ? outputHashes : {},
    network: { required: false, authorized: false },
    attempts: spec.status === "failed" ? 2 : 1,
    error: spec.error || null,
    createdAt: now,
    updatedAt: now,
  };
}

function applyFixture(vault, projectDirectory, mode, manifestPath) {
  if (!vault || !projectDirectory || !["wechat", "xhs"].includes(mode)) throw new Error("Usage: --vault <path> --project-dir <path> --mode wechat|xhs");
  const workflowPath = path.join(projectDirectory, "workflow-state.json");
  const projectPath = path.join(projectDirectory, "project.md");
  if (!fs.existsSync(workflowPath) || !fs.existsSync(projectPath)) throw new Error("The selected project is missing project.md or workflow-state.json");
  fs.mkdirSync(fixtureRoot(), { recursive: true });
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.workflowPath !== workflowPath) throw new Error("Another project already has an active real-Vault fixture");
    for (const taskPath of manifest.taskPaths || []) retireTask(taskPath);
  } else {
    const workflowBackup = path.join(fixtureRoot(), `workflow-state-${Date.now()}.json`);
    fs.copyFileSync(workflowPath, workflowBackup);
    manifest = { workflowPath, workflowBackup, taskPaths: [] };
  }

  const state = JSON.parse(fs.readFileSync(manifest.workflowBackup, "utf8"));
  const projectDirectoryRelative = relativeToVault(vault, projectDirectory);
  const projectPathRelative = relativeToVault(vault, projectPath);
  const queueDirectory = path.join(vault, "Reading Capture", "creation-projects", "_runner", "queue");
  const projectId = String(state.projectId || "real-ui-fixture");
  const groupId = `real-ui-${mode}-${Date.now()}`;
  const specs = [];

  if (mode === "wechat") {
    state.activeDeliverable = "wechat";
    state.currentStage = "visual";
    state.deliverables.wechat = { ...(state.deliverables.wechat || {}), stage: "visual", taskState: "visual_partial", visualGroupId: groupId, approvalVersion: null };
    const names = ["01-five-governance-gates.png", "02-response-to-action.png", "03-acceptance-evidence-chain.png"];
    const statuses = ["completed", "failed", "stale"];
    const labels = ["总览图 · 五道治理门", "流程图 · 响应到行动", "证据链 · 验收路径"];
    for (let index = 0; index < names.length; index += 1) {
      specs.push({
        kind: "wechat.visual-item",
        skillId: index === 1 ? "baoyu-infographic" : "liangkeban-xiaoxiaoke-illustrations",
        status: statuses[index],
        groupId,
        childKey: `visual-${index + 1}`,
        childLabel: labels[index],
        dependencyAnchor: index === 2 ? "## 验收证据" : "## 五道风险闸门",
        outputs: [`${projectDirectoryRelative}/deliverables/wechat/wechat-001/visuals/${names[index]}`],
        error: statuses[index] === "failed" ? "受控故障：第 2 张图生成失败，已成功图片必须保留" : statuses[index] === "stale" ? "正文锚点已修改；仅此图片需要重新生成" : null,
      });
    }
  } else {
    state.activeDeliverable = "xiaohongshu";
    state.currentStage = "draft";
    state.deliverables.xiaohongshu = { ...(state.deliverables.xiaohongshu || {}), stage: "draft", taskState: "card_children_partial", cardGroupId: groupId, cardVersion: null, visualQaVersion: null, copyQaVersion: null, approvalVersion: null };
    const names = ["01-xhs-01-cover.png", "02-xhs-02-boundary.png", "03-xhs-03-tool-boundary.png"];
    const statuses = ["completed", "failed", "completed"];
    const labels = ["第 1 页 · 封面", "第 2 页 · 边界定义", "第 3 页 · 工具权限"];
    for (let index = 0; index < names.length; index += 1) {
      specs.push({
        kind: "xhs.card-page",
        skillId: "keke-social-card-skill",
        status: statuses[index],
        groupId,
        childKey: `page-${String(index + 1).padStart(2, "0")}`,
        childLabel: labels[index],
        dependencyAnchor: `小红书第 ${index + 1} 页`,
        outputs: [`${projectDirectoryRelative}/deliverables/xiaohongshu/xiaohongshu-001/images/output/images/${names[index]}`],
        error: statuses[index] === "failed" ? "受控故障：第 2 页渲染失败；第 1、3 页必须保留" : null,
      });
    }
  }

  const base = { projectId, projectPath: projectPathRelative, projectDirectory: projectDirectoryRelative, requiredChildCount: specs.length };
  const taskPaths = [];
  for (let index = 0; index < specs.length; index += 1) {
    const spec = { ...specs[index], taskId: `task_real_ui_${mode}_${index + 1}_${Date.now()}` };
    const taskPath = path.join(queueDirectory, `__qa_${spec.taskId}.json`);
    writeJsonAtomic(taskPath, taskRecord(base, spec));
    taskPaths.push(taskPath);
  }
  writeJsonAtomic(workflowPath, state);
  manifest = { ...manifest, mode, taskPaths, updatedAt: new Date().toISOString() };
  writeJsonAtomic(manifestPath, manifest);
  process.stdout.write(`${JSON.stringify({ applied: true, mode, workflowPath, taskPaths }, null, 2)}\n`);
}

const manifestPath = path.join(fixtureRoot(), "active.json");
if (process.argv.includes("--restore")) restore(manifestPath);
else applyFixture(path.resolve(arg("vault")), path.resolve(arg("project-dir")), arg("mode"), manifestPath);
