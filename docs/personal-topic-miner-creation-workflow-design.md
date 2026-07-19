# Personal Topic Miner Creation Workflow Design

Status: approved design baseline

Branch: `personal/topic-miner`

Last updated: 2026-07-19

## 1. Purpose

This document defines the personal creation workflow that connects Reading Capture, Topic Miner, Creation Projects, Skill Runner, and platform-specific publishing deliverables.

The intended loop is:

```text
Reading and annotation
→ manual and AI-generated inspirations
→ creation project
→ research, brief, outline, and draft
→ visual production
→ finalized publishing package
→ publication and review
→ feedback to future Topic Miner recommendations
```

The design is an implementation contract for the `personal/topic-miner` branch. It is not part of the generic Reading Capture product roadmap.

### 1.1 Companion design documents

This document is the product and technical architecture baseline. The complete V1 design set also includes:

- [`personal-creation-workflow/README.md`](personal-creation-workflow/README.md) — design index, source-of-truth order, approved decisions, and change control;
- [`personal-creation-workflow/interaction-spec.md`](personal-creation-workflow/interaction-spec.md) — the eight-stage UI, editing, confirmation, platform, version, navigation, failure, and export behavior;
- [`personal-creation-workflow/path-validation-matrix.md`](personal-creation-workflow/path-validation-matrix.md) — end-to-end scenarios and the evidence required before implementation milestones are accepted.

When user-facing behavior is unclear, the interaction specification controls. When execution, storage, security, or Skill behavior is unclear, this document controls. The validation matrix controls what must be demonstrated in the real Obsidian application.

## 2. Product Boundary

### 2.1 Generic Reading Capture

The generic plugin must continue to work independently as a non-technical Obsidian reading and annotation product. It must not require:

- Topic Miner;
- Codex;
- Skill Runner;
- a personal Vault layout;
- any AI provider;
- any background process.

### 2.2 Personal branch

The `personal/topic-miner` branch contains:

- Topic Miner recommendation ingestion;
- creation projects;
- personal Vault-relative directory settings;
- a local Skill Runner;
- Codex Skill orchestration;
- WeChat and Xiaohongshu production workflows;
- final publishing-package export.

These capabilities must remain isolated so they cannot accidentally enter the generic plugin release.

### 2.3 Build and release isolation contract

The personal layer may depend on generic Reading Capture core modules. Generic core modules must never import the personal layer.

The repository must provide separate generic and personal build targets with separate manifests. The generic build must exclude Creation Project and Topic Miner UI, Runner code, Skill IDs, personal path defaults, and personal settings migrations.

CI must unpack the generic release artifact and fail if it contains personal modules, Runner launch configuration, registered Skill IDs, or personal path defaults. The generic release pipeline must use its designated branch and manifest. A release acceptance test must install the generic artifact in a new Vault with no personal configuration, no Codex, and no Runner.

## 3. Design Principles

1. **Obsidian is the control surface.** Starting, reviewing, approving, retrying, and finalizing work happens in Obsidian.
2. **The Vault is the durable business-state source of truth.** Projects, tasks, outputs, approval state, and run history are portable; credentials, installed runtimes, and live processes remain machine-local.
3. **Skill Runner only orchestrates.** Research, writing, and visual logic remain in reusable Skills.
4. **Human checkpoints are explicit.** Briefs, outlines, visual proposals, and final publication export require the approvals defined in this document.
5. **Platform outputs are first-class deliverables.** WeChat and Xiaohongshu are not alternate file formats of one draft.
6. **Generated work never silently overwrites authored work.** New versions are created and existing outputs remain recoverable.
7. **A finalized publishing package is a snapshot.** Export does not remove the source project or its history.
8. **Private machine paths are configuration, not repository data.** Committed documentation and defaults use Vault-relative paths.

## 4. End-to-End Workflow

```text
Creative Idea
→ Create a new project or append to an existing project
→ Assemble source material
→ Diagnose material maturity
→ Research when needed
→ Generate master brief
→ User confirms master brief
→ Generate platform outline or card proposal
→ User confirms platform plan
→ Generate draft or media package
→ User reviews and finalizes
→ Export immutable publishing snapshot
→ Mark published and record review
```

There is no up-front “quick planning” versus “deep research” switch. Research depth is chosen from an evidence-gap diagnosis.

## 5. Domain Model

### 5.1 Inspiration

Existing inspiration feedback states remain:

```text
待定 / 想写 / 暂存 / 不要 / 已写
```

An inspiration may be manual or generated by Topic Miner. It retains its source paths, rationale, feedback, and recommendation metadata. An inspiration may be linked to more than one project.

Linking it to a project changes `待定` to `想写` only after user confirmation. `已写` is never inferred from project creation; it is set when at least one linked deliverable is explicitly marked published, and the user may override it.

### 5.2 Creation Project

A creation project has one primary inspiration, zero or more related inspirations, source material, versioned research and master briefs, one or more platform deliverables, Task and Approval history, publication records, and review notes.

When the user chooses “Start Creation,” the plugin offers a new project or an existing project. Suggestions are allowed, but the user confirms the destination. Appending an inspiration must not replace the primary inspiration. It changes dependency hashes and marks affected approved Artifacts stale; it does not silently reset or regenerate them.

### 5.3 Platform Deliverable

A project may contain multiple WeChat deliverables, native Xiaohongshu deliverables, and Xiaohongshu adaptations of a specific approved WeChat Artifact version.

The user selects the first target platform when starting work and may add others later. Every Deliverable has its own lifecycle:

```text
planned
→ briefing
→ waiting_for_content_plan_approval
→ drafting
→ waiting_for_content_approval
→ producing
→ waiting_for_finalization
→ finalized
→ exported
→ published
→ reviewed
```

Not every platform uses every state. Native Xiaohongshu combines writing and visual production after card-proposal approval. For WeChat, the outline and body-illustration plan are approved together before text generation; text is approved separately before the already-approved image Tasks execute.

### 5.4 Artifact and Approval

Every generated or approved file is an Artifact with a stable ID, version, content hash, dependency hashes, creator, and creation time.

```yaml
artifact_id: artifact-unique-id
artifact_type: master_brief | outline | content_brief | card_proposal | draft | visual_plan | visual_asset | final_package
version: 3
path: vault-relative-path
content_hash: sha256
dependency_hashes: {}
created_by: user | plugin | task-id
created_at: ISO-8601 timestamp
```

Approval targets one immutable Artifact version:

```yaml
approval_id: approval-unique-id
artifact_id: artifact-unique-id
artifact_version: 3
content_hash: sha256
decision: approved | rejected | revoked
decided_by: local-user
decided_at: ISO-8601 timestamp
comment: optional text
```

When an upstream dependency changes, every dependent Artifact is marked `stale`. A stale Artifact can be read and compared but cannot advance, finalize, or export until regenerated or explicitly re-approved against the new dependency set.

### 5.5 Task and Attempt

Every executable operation is a durable Task:

```yaml
task_id: task-unique-id
project_id: project-unique-id
deliverable_id: optional-deliverable-id
task_type: diagnosis | research | brief | outline | content_brief | card_proposal | draft | visual_plan | visual_asset | assembly | qa | export
executor: plugin | codex
skill_id: optional-registered-skill-id
skill_version: optional-pinned-version
status: pending
depends_on: []
input_artifacts: []
expected_outputs: []
idempotency_key: stable-key
created_at: ISO-8601 timestamp
updated_at: ISO-8601 timestamp
```

`plugin` handles deterministic validation, assembly, and export. `codex` requires a registered Skill and pinned version.

A Task is logical work; each execution or retry creates an Attempt:

```yaml
attempt_id: attempt-unique-id
task_id: task-unique-id
attempt_number: 2
executor_device_id: device-id
fencing_epoch: 17
status: running
started_at: ISO-8601 timestamp
finished_at: optional-ISO-8601 timestamp
result_artifacts: []
error_class: optional-retryable-or-terminal-code
```

The idempotency key includes Task type, executor and Skill version, ordered input Artifact hashes, normalized parameters, and intended output slot. A legitimate input revision therefore creates a new key.

### 5.6 Task states

```text
pending
claimed
running
waiting_for_material
waiting_for_research_approval
waiting_for_brief_approval
waiting_for_outline_approval
waiting_for_content_approval
waiting_for_visual_proposal_approval
completed
failed
canceled
```

A waiting Task resumes only when its required Approval record matches the expected Artifact version and hash.

### 5.7 Project summary state

The project summary is derived from Deliverable states and is independent from inspiration feedback:

```text
立项 / 整理素材 / 补充研究 / 形成简报 / 多交付物制作中 /
待发布归档 / 已归档待发布 / 已发布 / 复盘归档
```

It shows the earliest unresolved blocking gate plus Deliverable-state counts. It must not gate an individual Deliverable because Deliverables may progress in parallel.

## 6. Storage Layout

### 6.1 Configured Vault-relative roots

Defaults for the personal branch:

```text
Creation project root: Reading Capture/creation-projects
WeChat publishing root: Work/business/content-accounts/wechat
Xiaohongshu publishing root: Work/business/content-accounts/xiaohongshu
```

The plugin resolves these paths relative to the currently opened Vault. Absolute paths and account identifiers must not be committed to the repository.

### 6.2 Project layout

```text
<creation-root>/<project-directory>/
├── project.md
├── project-lock.yaml
├── artifacts.jsonl
├── approvals.jsonl
├── publication-records.jsonl
├── planning/
│   ├── context.md
│   ├── diagnosis.md
│   ├── research.md
│   ├── sources.md
│   └── master-brief.md
├── deliverables/
│   ├── wechat/
│   │   └── <deliverable-id>/
│   │       ├── outline.md
│   │       ├── drafts/
│   │       ├── final-article.md
│   │       └── visuals/
│   └── xiaohongshu/
│       └── <deliverable-id>/
│           ├── content-brief.md
│           ├── card-proposal.md
│           ├── BRIEF.md
│           ├── images/
│           ├── xiaohongshu-caption.md
│           ├── copy-variants.md
│           ├── sources.md
│           └── QA.md
└── runs/
    └── <run-id>/
        ├── task.yaml
        ├── events.jsonl
        ├── stdout.log
        ├── stderr.log
        └── result.json
```

Project directories use a stable ID plus a readable title so title edits do not break identity.

### 6.3 Shared Runner coordination

Runner coordination files are stored beneath the configured creation root in `_runner`:

```text
<creation-root>/_runner/
├── queue/
├── leases/
├── events/
├── commit-registry/
└── active-executor.json
```

These files synchronize through the Vault. Secrets, process IDs, credentials, and machine-local caches never go there.

## 7. Skill Runner Architecture

### 7.1 Components

The personal workflow contains four logical components:

1. **Obsidian plugin UI** — creates projects and tasks, renders progress, and records approvals.
2. **Background Runner service** — watches the queue and executes approved tasks independently of the Obsidian process.
3. **Codex executor** — invokes a registered Codex Skill in a controlled workspace.
4. **Skill registry** — describes install source, pinned version, dependencies, permissions, input contract, and expected outputs.

V1 targets a macOS background service. It continues already-approved work after Obsidian closes. The plugin provides install, enable, disable, health, retry, and takeover controls.

### 7.2 Active execution device

Multiple computers may open the synced Vault, but V1 permits only one registered execution device at a time. A synchronized filesystem is not a cross-device transaction coordinator, so V1 does not support offline or forced takeover.

- Enabling Skill Runner on the first computer registers its local device ID and ownership epoch.
- A transfer requires both devices online and fully synchronized.
- The new device writes a transfer request. The current Runner stops claiming work, finishes or cancels active Attempts, writes a relinquishment record, stops its service, and acknowledges the request.
- Only after both devices observe the same relinquishment record may the new device increment the epoch and register itself.
- If the current Runner is offline, unreachable, or has unresolved sync conflicts, transfer is disabled. Recovery requires the user to disable or remove the old Runner before registering the new computer; there is no automatic force-takeover path in V1.
- Every claimed Task records the owner device and epoch. A mismatch or divergent equal-epoch owner record pauses execution before a new Attempt starts.
- Default heartbeat is 15 seconds and the local lease TTL is 90 seconds. Lease expiry permits recovery by the same registered device only; it never transfers ownership.
- Results are written to an Attempt staging directory, validated, then atomically renamed into a new versioned Artifact slot on the registered device.
- `idempotency_key`, owner device, epoch, and result hash are registered before the Task becomes completed.

Sync conflict copies never elect an owner. Any ownership conflict blocks claiming and promotion until the records converge through the coordinated transfer procedure.

On restart, wake, or system unlock, a Runner validates its device ownership, epoch, lease, credentials, and staged Attempts before resuming. It never resumes an external side effect solely from an in-memory state.

### 7.3 Local-only state

The following remain on the execution computer:

- device ID;
- Codex authentication;
- provider credentials and browser sessions;
- Skill installation cache;
- process state and local IPC details;
- temporary workspaces;
- secret environment variables.

### 7.4 Failure behavior

- A failed task records its error and preserves partial output in its run directory.
- Retry creates a new run attempt; it does not erase the previous attempt.
- Retryable failures use at most three automatic Attempts with 30-second and 120-second backoff. Authentication, permission, invalid contract, and user-rejected outputs are terminal until user action.
- Cancellation sends a graceful stop, then a forced stop after 15 seconds. Partial files remain in the Attempt staging directory and are never promoted.
- A missing Skill blocks only tasks that require that Skill.
- A disabled or offline Runner leaves tasks pending and visible.
- Invalid output fails contract validation and cannot advance the project gate.
- No task may overwrite an approved artifact without producing a new version.

### 7.5 Codex Skill execution contract

The Runner invokes Codex headlessly in an Attempt workspace with a generated context manifest. The manifest contains only declared input Artifact paths and hashes, normalized Task parameters, approval references, allowed output slots, and contract schemas.

If a Skill requests information not present in its input contract, the Runner converts the request into a durable waiting state visible in Obsidian. It does not open a separate interactive Codex conversation. A successful process exit is insufficient: required files, schema, hashes, source records, and permission compliance must all validate before promotion.

## 8. Skill Installation and Registry

### 8.1 Installation policy

Skills are not silently downloaded from a mutable branch for every generation.

The first-use flow is:

```text
Task requires an unavailable Skill
→ show source, version, dependencies, and permissions
→ user confirms installation once
→ install into the Runner-managed runtime
→ run preflight and contract checks
→ pin installed version
→ execute current and future approved tasks
```

Rules:

- Do not install into or mutate the user’s interactive global Codex profile.
- Pin a release or Git commit; do not track `main` during execution.
- Skill installation permission is separate from project web-research permission.
- Updates are explicit and never occur halfway through a project.
- Record provenance, license, version, install time, dependencies, and validation result.
- Reject a Skill whose declared writes or secrets exceed its registered permission envelope.
- Install only from a registry allowlist. Record repository, immutable commit or release, downloaded artifact digest, and manifest digest.
- Require a second machine-level approval when the same pinned Skill is first installed on another computer; project-level permission may synchronize, credentials may not.
- Audit declared direct and transitive dependencies before installation. Dependency installers receive the same restricted network, process, and filesystem envelope as the parent Skill.
- Inject only named secrets from an allowlist and never expose the complete environment.
- Run installation and execution in separate sandboxes. Installation cannot access project content; execution receives read-only runtime files, declared business inputs, and declared output directories.
- Store exact Skill digests in `project-lock.yaml`. Existing projects continue using locked versions until an explicit upgrade creates a new lockfile version.
- Failed upgrades roll back to the previous installed digest. Old locks remain reinstallable for project reproduction.

### 8.2 V1 executor boundary

V1 executes Codex Skills only.

The registry and task schema reserve an `executor` field so future adapters may support Claude Code, Hermes, or OpenClaw. Those adapters are architectural extension points, not V1 implementation scope.

## 9. Material Diagnosis and Research

### 9.1 Diagnosis

`writing-styles` performs a D0–D3 material-maturity diagnosis before content planning or from-zero writing.

- **D0** — topic only;
- **D1** — topic plus one meaningful anchor;
- **D2** — partial source, scene, or author evidence;
- **D3** — sufficient source, scene, and author anchors.

If material is sufficient, the workflow proceeds to the master brief. If not, the plugin shows the missing evidence and offers research or continuation with existing material. D3 does not waive research for high-risk factual, causal, medical, financial, legal, scientific, or rapidly changing claims.

### 9.2 Research routing

V1 uses three research capabilities:

1. **Deep Research Skills** — default general research engine.
2. **Last30days** — optional recent market and community signal enhancement.
3. **Academic Research Suite** — optional academic and high-evidence enhancement.

Routing is determined by explicit requirements and remains user-editable before web approval:

| Requirement detected in the brief or diagnosis | Route |
|---|---|
| General background, cases, competitors, people, concepts, or multi-source fact checking | Deep Research Skills |
| Current, recent, trend, launch, discussion, community feedback, product activity, or a bounded recent period | Add Last30days |
| Causal or effectiveness claim, scientific evidence, literature review, experiment quality, statistics, medicine, psychology, or education research | Add Academic Research Suite |
| More than one category | Run applicable routes independently, then deduplicate and reconcile sources |

The diagnosis records every selected route and reason. The user may add or remove a route before approving web access. If an optional Skill is unavailable, the Task pauses with the unsupported requirement; it does not silently substitute weaker evidence.

Research requirements:

- project-level web access requires approval;
- every material claim retains a source URL or local source anchor;
- uncertain, conflicting, or missing evidence is stated explicitly;
- research output must separate sourced facts, inference, and proposed narrative;
- research cannot advance to the master brief until output validation passes.

If the user continues without filling an evidence gap, the brief records the unsupported claim, risk level, allowed wording, and prohibited stronger wording. Approval acknowledges that exact risk; it is not treated as evidence completion.

Other research Skills discussed during design are not V1 dependencies. They may later be added to the registry for people search, sensitive local research, decision review, or specialist literature review.

## 10. Writing Workflow

### 10.1 Default style

The default Writing Styles profile for both WeChat and Xiaohongshu is **Keke**.

The default is configurable per platform in plugin settings. A deliverable may override it without changing the saved default.

### 10.2 Shared planning

The project contains one master brief that consolidates:

- primary and related inspirations;
- intended audience;
- core judgment and reader value;
- source material and evidence;
- missing or disputed evidence;
- candidate platform angles;
- boundaries and claims to avoid.

The master brief requires explicit user approval. Platform deliverables derive from it but retain their own structure and approval history.

## 11. WeChat Workflow

```text
Approved master brief
→ WeChat outline and body-illustration plan
→ user confirms both planning Artifacts
→ Keke-style article draft
→ optional AI revision and manual proofread
→ Writing Styles QA and user text lock
→ execute approved cover and inline image tasks
→ assembled final article
→ user confirms the integrated article
→ user finalizes and exports publishing snapshot
```

### 11.1 Skill roles

- `writing-styles` — diagnosis, brief support, outline, and Keke-style draft.
- `wechat-article-visual-pipeline` — produces the visual plan, cover strategy, paired covers, consistency rules, and assembly instructions.
- `liangkeban-xiaoxiaoke-illustrations` — conceptual inline illustrations for actions, judgments, states, loops, and metaphors.
- `baoyu-infographic` — structured visuals for processes, comparisons, hierarchies, data, and frameworks.

### 11.2 Visual routing

Visual routing occurs per shot, not once per article:

```text
Main cover or sharing cover → WeChat Visual Pipeline
Conceptual or metaphorical inline image → Xiaoxiaoke illustrations
Dense structured or data-led inline image → Baoyu Infographic
No meaningful visual contribution → no image
```

An article uses one primary visual system declared in the proposal. Baoyu is used only when the shot contains a process, comparison, hierarchy, quantitative relationship, or framework that would lose meaning as a conceptual illustration. Registry capability checks must confirm that the selected Skill accepts the declared palette and visual constraints.

### 11.3 Visual approval

Before generating assets, the Runner writes a visual proposal containing:

- cover and sharing-cover concept;
- image count and placements;
- the purpose and source anchors of each image;
- selected executor Skill per image;
- aspect ratio;
- shared palette and brand memory;
- Baoyu layout, style, and aspect selections where applicable.

The proposal also has a machine-readable shot list:

```yaml
visual_plan_version: 1
primary_visual_system: xiaoxiaoke | editorial
shots:
  - shot_id: inline-01
    role: conceptual | infographic | cover | sharing_cover
    placement_anchor: article-section-id
    source_artifact_ids: []
    source_hashes: []
    executor_skill_id: registered-skill-id
    executor_skill_version: pinned-version
    aspect_ratio: "16:9"
    palette: []
    depends_on: []
    required_outputs: []
```

One Obsidian approval covers the complete proposal. The Runner, not the coordinator Skill, converts each shot into a child Task under a parent visual-production Task. Successful children are retained; a failed child can be retried independently. Assembly and QA run only when all required children pass contract validation.

If a Skill is unavailable, does not support the requested constraints, or repeatedly fails, the Runner pauses and proposes a revised route. Changing the executor or visual intent creates a new visual-plan Artifact and requires approval. QA verifies dimensions, placement, readable text, source fidelity, palette conformance, missing assets, and Markdown references.

Required visual layout:

```text
visuals/
├── visual-brief.md
├── brand-memory.md
├── covers/
├── inline/
│   ├── xiaoxiaoke/
│   └── infographics/
├── sources.md
└── QA.md
```

## 12. Xiaohongshu Workflow

Xiaohongshu has two distinct input paths that converge on the same package-generation workflow.

### 12.1 Path A: adaptation from a WeChat article

Input is an approved or finalized WeChat article Artifact version from the same project. The adaptation records its Artifact ID, version, and content hash.

The workflow extracts its judgments, examples, evidence, and reader value, then redesigns the Xiaohongshu angle and page narrative. It must not summarize, truncate, or mechanically split the WeChat article.

One WeChat article may produce multiple Xiaohongshu deliverables with different angles, such as a checklist, debate, personal experience, or case breakdown.

If the source WeChat Artifact or required master-brief Artifact changes, the adaptation becomes stale. It may be viewed but cannot finalize or export until regenerated or explicitly re-approved against the new hashes.

### 12.2 Path B: native Xiaohongshu creation

Input is the project’s inspirations, source material, research, and master brief. It does not require a hidden long-form article.

Content structure, page narrative, publishing copy, and visual cards are designed as one system from the beginning.

### 12.3 Common flow

```text
Input path selection
→ Xiaohongshu content brief
→ user confirms content direction
→ Keke Social Card proposal
→ user confirms page and visual proposal
→ generate complete Xiaohongshu package
→ user finalizes and exports publishing snapshot
```

### 12.4 Skill roles

- `writing-styles` — material diagnosis, platform adaptation, and content brief using Keke as the default style.
- `keke-social-card-skill` — page narrative, visual proposal, cards, title, caption, tags, copy variants, source record, and QA.

V1 does not directly mix Xiaoxiaoke or Baoyu Infographic into a Xiaohongshu card set. Keke Social Card owns visual consistency. Cross-Skill card composition may be considered after V1.

### 12.5 Input mode metadata

```yaml
platform: xiaohongshu
input_mode: wechat_adaptation | native
source_deliverable: optional-wechat-deliverable-id
source_artifact_id: optional-wechat-article-artifact-id
source_artifact_version: optional-version
source_artifact_hash: optional-sha256
```

All source fields are required for `wechat_adaptation` and absent for `native`.

## 13. Approval and Automation Policy

The default V1 policy is:

| Action | Default behavior |
|---|---|
| Assemble local project material | automatic |
| Diagnose material maturity | automatic |
| Install a missing Skill | one-time explicit approval |
| Access the web for research | project-level explicit approval |
| Generate or revise research files | automatic after approval |
| Approve master brief | manual |
| Approve WeChat outline and body-illustration plan | manual |
| Approve WeChat article content before visual execution | manual |
| Approve Xiaohongshu content direction | manual |
| Approve visual or card proposal | manual |
| Generate approved draft and assets | automatic |
| Finalize deliverable | manual |
| Export publishing snapshot | manual |

Changing project content while a dependent Task is running marks the result and all downstream Artifacts stale through dependency hashes. The Runner may finish into staging but cannot promote, auto-advance, finalize, or export stale output until it is regenerated or explicitly re-approved.

## 14. Publishing Export

### 14.1 Destination roots

Configured Vault-relative roots:

```text
WeChat: Work/business/content-accounts/wechat
Xiaohongshu: Work/business/content-accounts/xiaohongshu
```

### 14.2 Directory naming

Both platforms use one canonical directory format:

```text
YYYYMMDD_主题
```

The date is the snapshot export date in the Vault-configured timezone, defaulting to `Asia/Shanghai`. The title comes from the approved platform title Artifact, is normalized to Unicode NFC, trims leading and trailing whitespace, replaces path separators and control characters, and is capped at 80 Unicode code points. An empty result falls back to the project ID.

The Runner atomically reserves a sibling directory. If the base target exists, it offers:

- create `YYYYMMDD_主题_v2`, `_v3`, and so on;
- cancel export.

### 14.3 Snapshot semantics

“Move to publishing directory” is implemented as a copy of the finalized package. The source project remains intact for traceability, additional platform work, revisions, and review. A snapshot directory is immutable after successful commit.

Each snapshot includes a manifest:

```yaml
project_id: project-unique-id
deliverable_id: deliverable-unique-id
platform: wechat | xiaohongshu
input_mode: optional-xiaohongshu-input-mode
source_project: vault-relative-project-path
source_deliverable: vault-relative-deliverable-path
finalized_at: ISO-8601 timestamp
exported_at: ISO-8601 timestamp
snapshot_version: 1
directory_name: YYYYMMDD_主题
artifact_hashes: {}
```

For `_v2`, `snapshot_version` is `2` and `directory_name` includes `_v2`. Published time, platform URL, metrics, and review status live in the project’s append-only `publication-records.jsonl`; recording publication never mutates the snapshot.

### 14.4 WeChat snapshot

```text
YYYYMMDD_主题/
├── article.md
├── covers/
├── images/
├── sources.md
├── QA.md
├── publishing-notes.md
└── manifest.yaml
```

### 14.5 Xiaohongshu snapshot

```text
YYYYMMDD_主题/
├── images/
├── BRIEF.md
├── xiaohongshu-caption.md
├── copy-variants.md
├── sources.md
├── QA.md
├── publishing-notes.md
└── manifest.yaml
```

After export, the plugin offers “Open publishing directory” and “Copy publishing path.”

### 14.6 Publication and Topic Miner feedback

Marking a snapshot published appends a Publication Record containing platform, snapshot ID, publication time, optional URL, linked inspirations, and manual review notes. It prompts the user before changing linked inspirations to `已写`.

V1 supports manual review fields for what worked, what failed, reusable angles, audience response, and follow-up ideas. It writes a Vault-local Topic Miner feedback projection with project, inspiration, platform, outcome label, and review summary. Topic Miner may consume this projection during future recommendations. Automatic platform-metric collection is deferred.

Projection paths:

```text
<creation-root>/_topic-miner/feedback.jsonl
<creation-root>/_topic-miner/consumers/topic-miner.json
```

Each append-only feedback record uses this minimum schema:

```yaml
feedback_id: sha256(publication_record_id + inspiration_id + review_revision)
publication_record_id: stable-publication-record-id
project_id: stable-project-id
deliverable_id: stable-deliverable-id
snapshot_id: stable-snapshot-id
inspiration_id: stable-inspiration-id
platform: wechat | xiaohongshu
input_mode: optional-xiaohongshu-input-mode
outcome_label: published | performed_well | performed_poorly | follow_up
review_revision: 1
review_summary: text
reusable_angles: []
follow_up_ideas: []
published_at: ISO-8601 timestamp
created_at: ISO-8601 timestamp
supersedes_feedback_id: optional-prior-feedback-id
```

Projection is idempotent: before appending, the plugin checks `feedback_id`; repeating the same publication or review action produces no duplicate. Editing a review increments `review_revision`, appends a new record, and points to the superseded ID.

Topic Miner deduplicates by `feedback_id` and stores consumed IDs plus the last verified file offset and prefix hash in its consumer file. A changed prefix invalidates the offset and triggers a full ID-based rescan. Consumption state never modifies feedback records.

## 15. Plugin Settings

### 15.1 Synced workflow settings

- Vault-relative creation project root;
- Vault-relative WeChat publishing root;
- Vault-relative Xiaohongshu publishing root;
- default writing style per platform;
- default approval policy;
- project-approved Skill IDs, permissions, and immutable version digests. Secrets and machine installation state are excluded.

### 15.2 Local machine settings

- enable Skill Runner on this device;
- device name and device ID;
- make this device the active executor;
- Runner executable and health state;
- Codex runtime location;
- local credential status;
- cache and temporary workspace location.

The settings UI must explain which values synchronize and which remain local.

## 16. Observability and User Experience

The Obsidian UI must show:

- current project phase;
- current task and executing Skill;
- queued and completed tasks;
- required approval and its exact consequence;
- active execution device;
- last heartbeat;
- installation or credential requirements;
- failure reason and retry action;
- output paths and versions;
- stale-output warnings.

The user must never need to open Codex manually to discover why a project stopped.

## 17. Security and Privacy

- No API key, cookie, browser token, email address, or absolute private path is written into the Vault or repository.
- Each Skill has an explicit read, write, network, and secret-access envelope.
- A Task can read declared business inputs plus the pinned runtime and dependency files mounted read-only. It writes only its Attempt staging and declared Artifact locations.
- Runner logs and error stacks redact Vault roots, home directories, temporary absolute paths, account identifiers, environment values, and secret-shaped strings before synchronization.
- Research output records provenance and retrieval time.
- Skill installation scripts are reviewed through preflight before execution.
- A Skill update cannot silently expand permissions.
- External content is treated as untrusted input and cannot redefine Runner policy.

## 18. V1 Scope

V1 includes:

- create a project from an inspiration;
- append related inspirations;
- add WeChat and Xiaohongshu deliverables;
- native and WeChat-adapted Xiaohongshu paths;
- D0–D3 diagnosis;
- default Deep Research Skills integration;
- optional Last30days and Academic Research Suite integration;
- Keke as the default Writing Styles profile;
- brief, outline, content-direction, and visual approval gates;
- WeChat article and visual pipeline;
- Xiaohongshu complete card package;
- background Codex Skill Runner on the active Mac;
- durable tasks, leases, retries, logs, and versioned artifacts;
- manual finalized-snapshot export using `YYYYMMDD_主题`;
- manual publication records, review notes, and Topic Miner feedback projection.

## 19. Deferred Scope

Not included in V1:

- Claude Code, Hermes, or OpenClaw execution adapters;
- multi-device concurrent execution;
- automatic publishing to WeChat or Xiaohongshu accounts;
- automatic performance-metric collection from platforms;
- direct Xiaoxiaoke or Baoyu composition inside Keke Social Card sets;
- a generic public Skill marketplace;
- full Local Deep Research deployment;
- automatic deletion or merging of historical publishing directories.

## 20. Implementation Sequence

### Phase 1: project and approval foundation

- project schema and directory creation;
- create versus append-to-project flow;
- deliverable schema;
- task, event, approval, and version model;
- project UI and empty/error states.

### Phase 2: Runner foundation

- local background service;
- queue watcher, active executor, leases, and idempotency;
- Runner health and takeover UI;
- Codex executor contract;
- logs, retry, cancellation, and stale-output behavior.

### Phase 3: planning and research

- Writing Styles diagnosis;
- master brief workflow;
- managed Skill installation;
- Deep Research Skills integration;
- optional Last30days and Academic Research Suite routes;
- source and research validation.

### Phase 4: platform deliverables

- WeChat outline, draft, and approval flow;
- WeChat visual plan and routed asset generation;
- native Xiaohongshu flow;
- WeChat-to-Xiaohongshu adaptation flow;
- Keke Social Card proposal and package generation.

### Phase 5: finalization and export

- final review and immutable snapshots;
- canonical directory naming;
- conflict-safe versioning;
- manifest generation;
- publishing status, review notes, and Topic Miner feedback projection.

## 21. Acceptance Criteria

V1 is acceptable when all of the following are demonstrated in the real Obsidian application:

1. A manual or AI inspiration can create a project or be appended to an existing project.
2. Multiple inspirations remain traceable to their original sources.
3. A project can add WeChat and Xiaohongshu deliverables independently.
4. The Runner can continue an approved task after Obsidian closes.
5. Device transfer succeeds only through the online relinquishment handshake; offline takeover and ownership-conflict promotion are blocked.
6. A failed or repeated task cannot silently duplicate or overwrite an approved artifact.
7. Missing research evidence produces a visible decision instead of an invented claim.
8. Brief, outline/content direction, and visual proposal gates pause and resume correctly.
9. WeChat output contains the approved article, cover pair, routed inline images, sources, and QA information.
10. Xiaohongshu native and WeChat-adaptation paths both produce a complete, visually consistent package.
11. Final export creates a `YYYYMMDD_主题` snapshot under the configured platform root without deleting the source project.
12. A second export cannot overwrite an existing snapshot without an explicit user choice.
13. No secret or private absolute path is written into synchronized project files or committed documentation.
14. The generic plugin remains functional without Topic Miner, Runner, Codex, or the personal directory layout.
15. Multiple Deliverables can remain in different lifecycle states without blocking one another or corrupting the project summary.
16. Updating an approved dependency marks all affected Artifacts stale and blocks finalization until regeneration or explicit re-approval.
17. A rejected installation, expanded Skill permission, missing credential, or invalid output contract pauses only the affected Task and exposes a recovery action.
18. Runner crash, restart, sleep/wake, cancellation, three-attempt retry exhaustion, and coordinated device transfer preserve Attempt history and never promote partial output.
19. Concurrent export attempts atomically reserve distinct `YYYYMMDD_主题[_vN]` directories whose manifests match their suffix and hashes.
20. Marking a snapshot published records publication and review data outside the immutable snapshot; repeated projection is idempotent, revised reviews append linked revisions, and Topic Miner resolves records by stable ID.
21. CI proves the generic bundle contains no personal modules, Skill IDs, Runner launch configuration, or personal path defaults.
22. Synced logs and project files pass privacy scans for secrets, emails, account identifiers, and private absolute paths.
23. Skill installation rejects mismatched artifact or manifest digests, and the locked digest can be reinstalled and reproduced on a second approved machine.
24. Sandbox tests prove that a Skill or transitive dependency cannot read undeclared project data, write outside declared locations, access unapproved network destinations, or receive undeclared secrets.
25. A Skill upgrade that expands permissions requires new approval; a failed upgrade leaves the previous locked version runnable.

## 22. Decision Record

The following decisions are approved as of 2026-07-19:

- keep the workflow on `personal/topic-miner` rather than the generic plugin;
- allow multiple related inspirations in one project;
- diagnose research needs instead of asking for quick versus deep mode;
- require brief and platform-plan approval before automatic draft generation;
- support WeChat and Xiaohongshu in V1;
- support both native and WeChat-adapted Xiaohongshu creation;
- use Keke as the default Writing Styles profile;
- use the WeChat visual coordinator with Xiaoxiaoke and Baoyu routing for inline images;
- keep Keke Social Card as the owner of Xiaohongshu visual consistency;
- use Deep Research Skills by default, with Last30days and Academic Research Suite as optional enhancements;
- install Skills on first use with approval and a pinned version;
- run approved work in a background Runner on one active device;
- store durable projects in the synced Vault and secrets locally;
- export final packages as snapshots rather than destructive moves;
- use `YYYYMMDD_主题` for both publishing roots;
- use an eight-stage Creation Project workbench with visible current, complete, skipped, blocked, stale, and failed states;
- support both inspiration creation and direct adaptation from a selected Markdown or PDF source;
- select the first target platform before reading an existing source and reuse that source in stage 5 without a second picker;
- skip research configuration and enter restricted brief review directly when the user explicitly chooses not to research;
- keep the stage-3 no-research action only as a clearly labelled change-of-decision exit;
- require named user versions after manual edits before AI revision, QA, approval, or export;
- keep WeChat outline and body-illustration planning in one stage-5 approval while generating images only after text lock;
- use three executable Xiaohongshu proposals with either direct selection or controlled sample comparison;
- require independent visual and publishing-copy QA for Xiaohongshu, both at a default threshold of 95;
- enable WeChat-to-Xiaohongshu adaptation only after a valid finalized WeChat Artifact exists;
- require platform-specific final checks to unlock each publishing snapshot independently.
