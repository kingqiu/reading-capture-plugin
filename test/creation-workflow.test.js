const assert = require("assert");

function loadWorkflowModule() {
  try {
    return require("../plugin/creation-workflow");
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND" && String(error.message).includes("plugin/creation-workflow")) return {};
    throw error;
  }
}

const workflow = loadWorkflowModule();

function testEightStageContract() {
  assert.ok(Array.isArray(workflow.WORKFLOW_STAGES), "workflow module should expose the approved stage contract");
  assert.deepStrictEqual(
    workflow.WORKFLOW_STAGES.map((stage) => stage.id),
    ["relations", "diagnosis", "research", "brief", "plan", "draft", "visual", "final"]
  );
  assert.deepStrictEqual(
    workflow.WORKFLOW_STAGES.map((stage) => stage.label),
    ["项目与灵感", "素材诊断", "研究与证据", "主简报审核", "平台内容方案", "内容审核", "视觉方案", "定稿与导出"]
  );
}

function testIdeaCreationStartsAtRelations() {
  assert.strictEqual(typeof workflow.createWorkflowState, "function", "workflow module should create normalized project state");
  const state = workflow.createWorkflowState({
    projectId: "project-1",
    title: "AI Agent 上线前的五项风险评估",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });

  assert.strictEqual(state.schemaVersion, 2);
  assert.strictEqual(state.currentStage, "relations");
  assert.strictEqual(state.workflowMode, "idea_creation");
  assert.strictEqual(state.deliverables.wechat.stage, "plan");
  assert.strictEqual(state.deliverables.xiaohongshu, null);

  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(stages.relations, "current");
  assert.strictEqual(stages.diagnosis, "blocked");
  assert.strictEqual(stages.research, "blocked");
  assert.strictEqual(stages.brief, "blocked");
  assert.strictEqual(stages.plan, "blocked");
}

function testSavedArticleSelectionSkipsResearchAndBrief() {
  let state = workflow.createWorkflowState({
    projectId: "project-2",
    title: "把文章改编成小红书",
    workflowMode: "article_repurpose",
    activeDeliverable: "xiaohongshu",
  });

  state = workflow.selectRepurposeSource(state, {
    path: "Learning/articles/agent-risk.md",
    readVersion: "sha256:source-v1",
  });

  assert.strictEqual(state.currentStage, "plan");
  assert.strictEqual(state.source.mainFile, "Learning/articles/agent-risk.md");
  assert.strictEqual(state.source.readVersion, "sha256:source-v1");
  assert.strictEqual(state.deliverables.xiaohongshu.stage, "plan");

  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(stages.relations, "complete");
  assert.strictEqual(stages.diagnosis, "skipped");
  assert.strictEqual(stages.research, "skipped");
  assert.strictEqual(stages.brief, "skipped");
  assert.strictEqual(stages.plan, "current");
}

function testIdeaProjectCanSwitchToRepurposeBeforeSourceRead() {
  let state = workflow.createWorkflowState({ projectId: "project-switch", activeDeliverable: "wechat" });
  state = workflow.startRepurposeWorkflow(state, "xiaohongshu");
  assert.strictEqual(state.workflowMode, "article_repurpose");
  assert.strictEqual(state.currentStage, "relations");
  assert.strictEqual(state.activeDeliverable, "xiaohongshu");
  assert.ok(state.deliverables.xiaohongshu);
  state = workflow.selectRepurposeSource(state, {
    path: "Learning/article.md",
    projectCopy: "sources/primary.md",
    readVersion: "mtime:1:size:10",
  });
  assert.strictEqual(state.currentStage, "plan");
  assert.strictEqual(state.source.projectCopy, "sources/primary.md");
}

function testDeliverablesAdvanceIndependently() {
  let state = workflow.createWorkflowState({
    projectId: "project-3",
    title: "同一主题多平台创作",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });

  state = workflow.addDeliverable(state, "xiaohongshu");
  state = workflow.updateDeliverableStage(state, "wechat", "draft");

  assert.strictEqual(state.deliverables.wechat.stage, "draft");
  assert.strictEqual(state.deliverables.xiaohongshu.stage, "plan");
  assert.strictEqual(state.activeDeliverable, "wechat");
  state = workflow.activateDeliverable(state, "xiaohongshu");
  assert.strictEqual(state.activeDeliverable, "xiaohongshu");
  assert.strictEqual(state.currentStage, "plan");
  state = workflow.activateDeliverable(state, "wechat");
  assert.strictEqual(state.currentStage, "draft");
}

function testCandidateVersionsDoNotAdvanceBeforeQa() {
  let state = workflow.createWorkflowState({ projectId: "project-candidate", activeDeliverable: "wechat" });
  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "skip");
  state = workflow.approveMasterBrief(state, "brief-v1");
  state = workflow.approvePlatformPlan(state, "wechat", { outlineVersion: "outline-v1" });
  state = workflow.recordDeliverableVersions(state, "wechat", { articleVersion: "article-v1", taskState: "qa_queued" });
  assert.strictEqual(state.currentStage, "draft");
  assert.strictEqual(state.deliverables.wechat.articleVersion, "article-v1");
  assert.strictEqual(state.deliverables.wechat.taskState, "qa_queued");
}

function testDiagnosisRoutesToResearch() {
  let state = workflow.createWorkflowState({
    projectId: "project-4",
    title: "需要补充证据的主题",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });

  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "research");

  assert.strictEqual(state.currentStage, "research");
  assert.strictEqual(state.research.decision, "research");
  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(stages.relations, "complete");
  assert.strictEqual(stages.diagnosis, "complete");
  assert.strictEqual(stages.research, "current");
  assert.strictEqual(stages.brief, "blocked");
}

function testResearchConfigurationCanChangeDecisionToSkip() {
  let state = workflow.createWorkflowState({ projectId: "project-change", activeDeliverable: "wechat" });
  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "research");
  state = workflow.chooseResearchDecision(state, "skip");
  assert.strictEqual(state.currentStage, "brief");
  assert.strictEqual(state.research.decision, "skipped");
  assert.strictEqual(workflow.deriveStageStates(state).research, "skipped");
}

function testNoResearchEntersRestrictedBrief() {
  let state = workflow.createWorkflowState({
    projectId: "project-5",
    title: "使用现有材料形成受限简报",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });

  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "skip");

  assert.strictEqual(state.currentStage, "brief");
  assert.strictEqual(state.research.decision, "skipped");
  assert.strictEqual(state.briefMode, "restricted");
  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(stages.diagnosis, "complete");
  assert.strictEqual(stages.research, "skipped");
  assert.strictEqual(stages.brief, "current");
}

function testNormalizeRoundTripAndRejectInvalidStage() {
  const original = workflow.createWorkflowState({
    projectId: "project-6",
    title: "可恢复项目",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });
  const restored = workflow.normalizeWorkflowState(JSON.parse(JSON.stringify(original)));
  assert.deepStrictEqual(restored, original);

  assert.throws(
    () => workflow.normalizeWorkflowState({ ...original, currentStage: "unknown" }),
    /currentStage is invalid/
  );
}

function testFailureAndStaleOverridesRemainVisible() {
  let state = workflow.createWorkflowState({
    projectId: "project-7",
    title: "异常恢复项目",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });
  state = workflow.enterDiagnosis(state);
  state = workflow.setStageOverride(state, "diagnosis", "failed");
  state = workflow.setStageOverride(state, "plan", "stale");

  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(stages.diagnosis, "failed");
  assert.strictEqual(stages.plan, "stale");

  state = workflow.setStageOverride(state, "diagnosis", null);
  assert.strictEqual(workflow.deriveStageStates(state).diagnosis, "current");
}

function testWechatResearchPathReachesFinalizationWithVersions() {
  let state = workflow.createWorkflowState({
    projectId: "project-8",
    title: "微信完整路径",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });
  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "research");
  state = workflow.authorizeResearch(state, { skills: ["deep-research-skills", "last30days"] });
  assert.strictEqual(state.currentStage, "research");
  assert.strictEqual(state.research.taskState, "queued");
  state = workflow.acceptResearchResult(state, "research-v1");
  assert.strictEqual(state.currentStage, "brief");
  assert.strictEqual(state.research.acceptedResultVersion, "research-v1");
  state = workflow.approveMasterBrief(state, "brief-v2");
  assert.strictEqual(state.currentStage, "plan");
  state = workflow.approvePlatformPlan(state, "wechat", {
    outlineVersion: "outline-v1",
    illustrationPlanVersion: "illustrations-v1",
  });
  assert.strictEqual(state.currentStage, "draft");
  assert.strictEqual(state.deliverables.wechat.outlineVersion, "outline-v1");
  state = workflow.approveContent(state, "wechat", { articleVersion: "article-v3", qaVersion: "qa-v2" });
  assert.strictEqual(state.currentStage, "visual");
  state = workflow.approveVisuals(state, "wechat", { approvalVersion: "visual-approval-v1" });
  assert.strictEqual(state.currentStage, "final");
  assert.strictEqual(state.deliverables.wechat.stage, "final");
}

function testRepurposeXiaohongshuPathKeepsSkippedStages() {
  let state = workflow.createWorkflowState({
    projectId: "project-9",
    title: "小红书改编路径",
    workflowMode: "article_repurpose",
    activeDeliverable: "xiaohongshu",
  });
  state = workflow.selectRepurposeSource(state, { path: "Learning/article.md", readVersion: "source-v1" });
  state = workflow.approvePlatformPlan(state, "xiaohongshu", { planVersion: "cards-v1", sourceVersion: "source-v1" });
  state = workflow.approveContent(state, "xiaohongshu", {
    cardVersion: "deck-v4",
    captionVersion: "caption-v2",
    visualQaVersion: "visual-qa-96",
    copyQaVersion: "copy-qa-97",
  });
  state = workflow.approveVisuals(state, "xiaohongshu", { approvalVersion: "xhs-final-v1" });
  const stages = workflow.deriveStageStates(state);
  assert.strictEqual(state.currentStage, "final");
  assert.strictEqual(stages.diagnosis, "skipped");
  assert.strictEqual(stages.research, "skipped");
  assert.strictEqual(stages.brief, "skipped");
}

function testFailedQaCanReopenResearchWithoutDiscardingDraftHistory() {
  let state = workflow.createWorkflowState({
    projectId: "project-10",
    title: "质检后补研究",
    workflowMode: "idea_creation",
    activeDeliverable: "wechat",
  });
  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "skip");
  state = workflow.approveMasterBrief(state, "brief-restricted-v1");
  state = workflow.approvePlatformPlan(state, "wechat", { outlineVersion: "outline-v1" });
  state = workflow.recordDeliverableVersions(state, "wechat", { articleVersion: "article-v2", qaVersion: "qa-82" });

  state = workflow.reopenResearch(state);

  assert.strictEqual(state.currentStage, "research");
  assert.strictEqual(state.research.decision, "research");
  assert.strictEqual(state.research.taskState, null);
  assert.strictEqual(state.research.acceptedResultVersion, null);
  assert.strictEqual(state.deliverables.wechat.articleVersion, "article-v2", "published work history should remain available while its downstream plan is marked stale");
  assert.strictEqual(workflow.deriveStageStates(state).draft, "stale");
}

function testDeliverableInvalidationIsPlatformScopedAndClearsAsItRebuilds() {
  let state = workflow.createWorkflowState({ projectId: "project-11", title: "双平台依赖", activeDeliverable: "wechat" });
  state = workflow.enterDiagnosis(state);
  state = workflow.chooseResearchDecision(state, "skip");
  state = workflow.approveMasterBrief(state, "brief-v1");
  state = workflow.approvePlatformPlan(state, "wechat", { outlineVersion: "wechat-plan-v1" });
  state = workflow.approveContent(state, "wechat", { articleVersion: "wechat-article-v1" });
  state = workflow.approveVisuals(state, "wechat", { approvalVersion: "wechat-final-v1" });
  state = workflow.addDeliverable(state, "xiaohongshu");
  state = workflow.activateDeliverable(state, "xiaohongshu");
  state = workflow.approvePlatformPlan(state, "xiaohongshu", { planVersion: "xhs-plan-v1" });
  state = workflow.approveContent(state, "xiaohongshu", { cardVersion: "xhs-cards-v1", captionVersion: "xhs-copy-v1" });
  state = workflow.approveVisuals(state, "xiaohongshu", { approvalVersion: "xhs-final-v1" });

  state = workflow.invalidateDeliverableFrom(state, "xiaohongshu", "plan");
  assert.strictEqual(state.deliverables.wechat.stage, "final", "changing the XHS source must not rewind WeChat");
  assert.strictEqual(state.deliverables.wechat.approvalVersion, "wechat-final-v1");
  assert.strictEqual(state.deliverables.xiaohongshu.stage, "plan");
  assert.deepStrictEqual(state.deliverables.xiaohongshu.staleStages, ["draft", "visual", "final"]);
  assert.strictEqual(workflow.deriveStageStates(state).plan, "current");
  assert.strictEqual(workflow.deriveStageStates(state).draft, "stale");

  state = workflow.approvePlatformPlan(state, "xiaohongshu", { planVersion: "xhs-plan-v2" });
  assert.deepStrictEqual(state.deliverables.xiaohongshu.staleStages, ["visual", "final"]);
  assert.strictEqual(workflow.deriveStageStates(state).draft, "current");
  state = workflow.activateDeliverable(state, "wechat");
  assert.strictEqual(workflow.deriveStageStates(state).final, "current");
}

testEightStageContract();
testIdeaCreationStartsAtRelations();
testSavedArticleSelectionSkipsResearchAndBrief();
testIdeaProjectCanSwitchToRepurposeBeforeSourceRead();
testDeliverablesAdvanceIndependently();
testCandidateVersionsDoNotAdvanceBeforeQa();
testDiagnosisRoutesToResearch();
testResearchConfigurationCanChangeDecisionToSkip();
testNoResearchEntersRestrictedBrief();
testNormalizeRoundTripAndRejectInvalidStage();
testFailureAndStaleOverridesRemainVisible();
testWechatResearchPathReachesFinalizationWithVersions();
testRepurposeXiaohongshuPathKeepsSkippedStages();
testFailedQaCanReopenResearchWithoutDiscardingDraftHistory();
testDeliverableInvalidationIsPlatformScopedAndClearsAsItRebuilds();

console.log("creation workflow tests passed");
