const WORKFLOW_STAGES = Object.freeze([
  Object.freeze({ id: "relations", label: "项目与灵感" }),
  Object.freeze({ id: "diagnosis", label: "素材诊断" }),
  Object.freeze({ id: "research", label: "研究与证据" }),
  Object.freeze({ id: "brief", label: "主简报审核" }),
  Object.freeze({ id: "plan", label: "平台内容方案" }),
  Object.freeze({ id: "draft", label: "内容审核" }),
  Object.freeze({ id: "visual", label: "视觉方案" }),
  Object.freeze({ id: "final", label: "定稿与导出" }),
]);

const WORKFLOW_MODES = new Set(["idea_creation", "article_repurpose"]);
const DELIVERABLE_PLATFORMS = new Set(["wechat", "xiaohongshu"]);
const DELIVERABLE_STAGES = new Set(["plan", "draft", "visual", "final"]);
const STAGE_IDS = new Set(WORKFLOW_STAGES.map((stage) => stage.id));
const STAGE_OVERRIDES = new Set(["failed", "stale"]);

function assertOneOf(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`${label} is invalid: ${value}`);
}

function createDeliverableState() {
  return {
    stage: "plan",
    outlineVersion: null,
    illustrationPlanVersion: null,
    articleVersion: null,
    sourceMode: null,
    sourceVersion: null,
    planVersion: null,
    cardVersion: null,
    captionVersion: null,
    visualQaVersion: null,
    copyQaVersion: null,
    qaVersion: null,
    approvalVersion: null,
    taskState: null,
    staleStages: [],
  };
}

function deliverableAfterStage(stage) {
  const ordered = ["plan", "draft", "visual", "final"];
  const index = ordered.indexOf(stage);
  return index === -1 ? [] : ordered.slice(index + 1);
}

function advanceDeliverable(deliverable, stage, versions = {}) {
  const remainingStale = new Set(deliverableAfterStage(stage));
  return {
    ...deliverable,
    ...versions,
    stage,
    staleStages: (deliverable.staleStages || []).filter((item) => remainingStale.has(item)),
  };
}

function createWorkflowState(options = {}) {
  const workflowMode = options.workflowMode || "idea_creation";
  const activeDeliverable = options.activeDeliverable || "wechat";
  assertOneOf(workflowMode, WORKFLOW_MODES, "workflowMode");
  assertOneOf(activeDeliverable, DELIVERABLE_PLATFORMS, "activeDeliverable");

  return {
    schemaVersion: 2,
    projectId: String(options.projectId || ""),
    title: String(options.title || ""),
    workflowMode,
    currentStage: "relations",
    source: {
      mainFile: null,
      supportingFiles: [],
      readVersion: null,
    },
    research: {
      decision: "undecided",
      taskState: null,
      acceptedResultVersion: null,
    },
    briefMode: null,
    stageOverrides: {},
    deliverables: {
      wechat: activeDeliverable === "wechat" ? createDeliverableState() : null,
      xiaohongshu: activeDeliverable === "xiaohongshu" ? createDeliverableState() : null,
    },
    activeDeliverable,
  };
}

function normalizeWorkflowState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workflow state must be an object");
  if (input.schemaVersion !== 2) throw new Error(`schemaVersion is invalid: ${input.schemaVersion}`);
  assertOneOf(input.workflowMode, WORKFLOW_MODES, "workflowMode");
  assertOneOf(input.activeDeliverable, DELIVERABLE_PLATFORMS, "activeDeliverable");
  assertOneOf(input.currentStage, STAGE_IDS, "currentStage");
  if (!input.deliverables || !input.deliverables[input.activeDeliverable]) throw new Error("active deliverable is missing");
  for (const [stage, status] of Object.entries(input.stageOverrides || {})) {
    assertOneOf(stage, STAGE_IDS, "stage override id");
    assertOneOf(status, STAGE_OVERRIDES, "stage override status");
  }
  return JSON.parse(JSON.stringify(input));
}

function setStageOverride(state, stage, status) {
  assertOneOf(stage, STAGE_IDS, "stage override id");
  if (status != null) assertOneOf(status, STAGE_OVERRIDES, "stage override status");
  const stageOverrides = { ...(state.stageOverrides || {}) };
  if (status == null) delete stageOverrides[stage];
  else stageOverrides[stage] = status;
  return {
    ...state,
    stageOverrides,
  };
}

function enterDiagnosis(state) {
  if (!state || state.workflowMode !== "idea_creation") throw new Error("diagnosis requires idea_creation mode");
  if (state.currentStage !== "relations") throw new Error("diagnosis requires the relations stage");
  return {
    ...state,
    currentStage: "diagnosis",
  };
}

function chooseResearchDecision(state, decision) {
  const fromDiagnosis = state && state.currentStage === "diagnosis";
  const changingFromResearch = state && state.currentStage === "research" && state.research && state.research.decision === "research" && decision === "skip";
  if (!state || state.workflowMode !== "idea_creation" || (!fromDiagnosis && !changingFromResearch)) {
    throw new Error("research decision requires the diagnosis stage");
  }
  if (decision !== "research" && decision !== "skip") throw new Error(`research decision is invalid: ${decision}`);
  const skipped = decision === "skip";
  return {
    ...state,
    currentStage: skipped ? "brief" : "research",
    briefMode: skipped ? "restricted" : state.briefMode,
    research: {
      ...state.research,
      decision: skipped ? "skipped" : "research",
    },
  };
}

function authorizeResearch(state, config = {}) {
  if (!state || state.currentStage !== "research" || state.research.decision !== "research") throw new Error("research authorization requires the research stage");
  const skills = Array.isArray(config.skills) ? config.skills.map(String).filter(Boolean) : [];
  if (!skills.length) throw new Error("at least one research skill is required");
  return {
    ...state,
    research: {
      ...state.research,
      taskState: "queued",
      skills,
    },
  };
}

function acceptResearchResult(state, version) {
  if (!state || state.currentStage !== "research") throw new Error("research result requires the research stage");
  if (!String(version || "").trim()) throw new Error("research result version is required");
  return {
    ...state,
    currentStage: "brief",
    briefMode: "evidence_backed",
    research: {
      ...state.research,
      taskState: "accepted",
      acceptedResultVersion: String(version),
    },
  };
}

function reopenResearch(state) {
  if (!state || state.workflowMode !== "idea_creation") throw new Error("research recovery requires idea_creation mode");
  if (!["brief", "plan", "draft", "visual", "final"].includes(state.currentStage)) throw new Error("research recovery requires downstream work to exist");
  return {
    ...state,
    currentStage: "research",
    briefMode: null,
    research: {
      ...state.research,
      decision: "research",
      taskState: null,
      acceptedResultVersion: null,
    },
    stageOverrides: {
      ...(state.stageOverrides || {}),
      brief: "stale",
      plan: "stale",
      draft: "stale",
    },
  };
}

function restoreContentReviewAfterResearchReturn(state, researchVersion) {
  if (!state || state.workflowMode !== "idea_creation" || state.currentStage !== "research") {
    throw new Error("content review recovery requires the research stage");
  }
  const platform = state.activeDeliverable;
  if (!state.deliverables[platform]) throw new Error("active deliverable is missing");
  const stageOverrides = { ...(state.stageOverrides || {}) };
  for (const stage of ["brief", "plan", "draft"]) delete stageOverrides[stage];
  return {
    ...state,
    currentStage: "draft",
    briefMode: "evidence_backed",
    research: {
      ...state.research,
      decision: "research",
      taskState: "accepted",
      acceptedResultVersion: String(researchVersion || state.research && state.research.acceptedResultVersion || "restored"),
    },
    stageOverrides,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...state.deliverables[platform],
        stage: "draft",
        taskState: "qa_review",
        staleStages: ["visual", "final"],
      },
    },
  };
}

function approveMasterBrief(state, version) {
  if (!state || state.currentStage !== "brief") throw new Error("master brief approval requires the brief stage");
  if (!String(version || "").trim()) throw new Error("master brief version is required");
  return {
    ...state,
    currentStage: "plan",
    masterBriefVersion: String(version),
  };
}

function approvePlatformPlan(state, platform, versions = {}) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (!state || state.currentStage !== "plan" || !state.deliverables[platform]) throw new Error("platform plan approval requires an active deliverable plan");
  return {
    ...state,
    currentStage: "draft",
    activeDeliverable: platform,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...advanceDeliverable(state.deliverables[platform], "draft", versions),
      },
    },
  };
}

function approveContent(state, platform, versions = {}) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (!state || state.currentStage !== "draft" || !state.deliverables[platform]) throw new Error("content approval requires the draft stage");
  return {
    ...state,
    currentStage: "visual",
    activeDeliverable: platform,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...advanceDeliverable(state.deliverables[platform], "visual", versions),
      },
    },
  };
}

function approveVisuals(state, platform, versions = {}) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (!state || state.currentStage !== "visual" || !state.deliverables[platform]) throw new Error("visual approval requires the visual stage");
  return {
    ...state,
    currentStage: "final",
    activeDeliverable: platform,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...advanceDeliverable(state.deliverables[platform], "final", versions),
      },
    },
  };
}

function selectRepurposeSource(state, source = {}) {
  if (!state || state.workflowMode !== "article_repurpose") throw new Error("source selection requires article_repurpose mode");
  if (!String(source.path || "").trim()) throw new Error("source path is required");
  return {
    ...state,
    currentStage: "plan",
    source: {
      ...state.source,
      mainFile: String(source.path),
      projectCopy: source.projectCopy == null ? null : String(source.projectCopy),
      readVersion: source.readVersion == null ? null : String(source.readVersion),
    },
  };
}

function startRepurposeWorkflow(state, platform) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  const deliverables = state.deliverables[platform]
    ? state.deliverables
    : { ...state.deliverables, [platform]: createDeliverableState() };
  return {
    ...state,
    workflowMode: "article_repurpose",
    currentStage: "relations",
    source: { mainFile: null, supportingFiles: [], readVersion: null, projectCopy: null },
    research: { decision: "undecided", taskState: null, acceptedResultVersion: null },
    briefMode: null,
    deliverables,
    activeDeliverable: platform,
  };
}

function addDeliverable(state, platform) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (state.deliverables[platform]) return state;
  return {
    ...state,
    deliverables: {
      ...state.deliverables,
      [platform]: createDeliverableState(),
    },
  };
}

function activateDeliverable(state, platform) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (!state.deliverables[platform]) throw new Error(`deliverable does not exist: ${platform}`);
  return {
    ...state,
    activeDeliverable: platform,
    currentStage: state.deliverables[platform].stage,
  };
}

function updateDeliverableStage(state, platform, stage) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  assertOneOf(stage, DELIVERABLE_STAGES, "deliverable stage");
  if (!state.deliverables[platform]) throw new Error(`deliverable does not exist: ${platform}`);
  return {
    ...state,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...state.deliverables[platform],
        stage,
      },
    },
  };
}

function recordDeliverableVersions(state, platform, versions = {}) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  if (!state.deliverables[platform]) throw new Error(`deliverable does not exist: ${platform}`);
  return {
    ...state,
    deliverables: {
      ...state.deliverables,
      [platform]: {
        ...state.deliverables[platform],
        ...versions,
      },
    },
  };
}

function invalidateDeliverableFrom(state, platform, stage) {
  assertOneOf(platform, DELIVERABLE_PLATFORMS, "platform");
  assertOneOf(stage, DELIVERABLE_STAGES, "deliverable stage");
  if (!state.deliverables[platform]) throw new Error(`deliverable does not exist: ${platform}`);
  const invalidated = {
    ...state.deliverables[platform],
    stage,
    staleStages: deliverableAfterStage(stage),
  };
  return {
    ...state,
    ...(state.activeDeliverable === platform ? { currentStage: stage } : {}),
    deliverables: {
      ...state.deliverables,
      [platform]: invalidated,
    },
  };
}

function deriveStageStates(state) {
  const result = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage.id, "blocked"]));
  result.relations = state.currentStage === "relations" ? "current" : "complete";

  if (state.workflowMode === "article_repurpose") {
    result.diagnosis = "skipped";
    result.research = "skipped";
    result.brief = "skipped";
    const currentIndex = WORKFLOW_STAGES.findIndex((stage) => stage.id === state.currentStage);
    for (let index = 4; index < WORKFLOW_STAGES.length; index += 1) {
      const id = WORKFLOW_STAGES[index].id;
      if (index < currentIndex) result[id] = "complete";
      else if (index === currentIndex) result[id] = "current";
    }
    for (const stage of state.deliverables[state.activeDeliverable].staleStages || []) result[stage] = "stale";
    for (const [stage, status] of Object.entries(state.stageOverrides || {})) result[stage] = status;
    return result;
  }

  const currentIndex = WORKFLOW_STAGES.findIndex((stage) => stage.id === state.currentStage);
  for (let index = 1; index < WORKFLOW_STAGES.length; index += 1) {
    const id = WORKFLOW_STAGES[index].id;
    if (index < currentIndex) result[id] = "complete";
    else if (index === currentIndex) result[id] = "current";
  }
  if (state.research && state.research.decision === "skipped") result.research = "skipped";
  for (const stage of state.deliverables[state.activeDeliverable].staleStages || []) result[stage] = "stale";
  for (const [stage, status] of Object.entries(state.stageOverrides || {})) result[stage] = status;
  return result;
}

module.exports = {
  WORKFLOW_STAGES,
  activateDeliverable,
  addDeliverable,
  acceptResearchResult,
  approveContent,
  approveMasterBrief,
  approvePlatformPlan,
  approveVisuals,
  authorizeResearch,
  chooseResearchDecision,
  createWorkflowState,
  deriveStageStates,
  enterDiagnosis,
  invalidateDeliverableFrom,
  normalizeWorkflowState,
  recordDeliverableVersions,
  reopenResearch,
  restoreContentReviewAfterResearchReturn,
  selectRepurposeSource,
  startRepurposeWorkflow,
  setStageOverride,
  updateDeliverableStage,
};
