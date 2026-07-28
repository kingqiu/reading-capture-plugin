# Personal Creation Workflow Implementation Plan

Status: implementation substantially complete; acceptance audit active

Branch: `personal/topic-miner`

Last updated: 2026-07-20

## 1. Baseline

The implementation contract is the approved document set in this directory and the personal workflow master design. The visual contract is the current approved `creation-workflow-prototype.html`.

Prototype fingerprint:

```text
SHA-256: 33d7123c649b13b4d542a34f68ca55018193a830a7ae8a091a846066c27d79bd
Size: 202712 bytes
```

The exact reference viewport and baseline screenshots must be recorded before the first UI implementation slice. Until then, domain and persistence work may proceed, but UI fidelity cannot be accepted.

## 2. Existing implementation disposition

The working branch already contains an uncommitted early implementation with:

- creation-project settings;
- new-project and append-inspiration entry;
- Vault directory creation;
- one combined planning Task;
- a basic Skill Runner;
- a compact project switcher and legacy detail view;
- tests for project creation, append idempotency, the legacy approval view, and Runner path containment.

These parts are inputs, not proof that the approved workflow is implemented. Preserve reusable path, Vault, and Runner safety code. Replace the combined brief-and-outline assumption and legacy single-screen workflow with the approved eight-stage model. Do not silently overwrite unrelated working-tree changes.

## 3. Design-to-code map

| Design area | Primary implementation | Test layer | Real data source |
|---|---|---|---|
| Workflow stages and transitions | `plugin/creation-workflow.js` | `test/creation-workflow.test.js` | project state persisted in the Vault |
| Project, inspiration, deliverable and version state | `plugin/creation-workflow.js`, `plugin/main.js` | domain and Vault integration tests | `project.md`, Artifact and Approval records |
| Creation Project view shell | `plugin/main.js`, `plugin/styles.css` | view interaction and screenshot tests | normalized project state |
| Project switcher | `plugin/main.js` | empty, one, five, ten-plus project tests | indexed project files |
| Stages 1–4 | `plugin/main.js`, Runner Tasks | interaction, persistence and recovery tests | inspirations, sources, diagnosis, research and brief Artifacts |
| WeChat stages 5–8 | plugin view and Runner Tasks | route and version tests | outline, illustration plan, article, QA and export Artifacts |
| Xiaohongshu stages 5–8 | plugin view and Runner Tasks | route, proposal and dual-QA tests | source, card plan, images, caption and QA Artifacts |
| Runner execution | `scripts/skill-runner.js` | deterministic Runner contract tests | queue, leases, Attempts and staged outputs |
| Managed Skill registry and installation | `plugin/skill-registry.js`, `scripts/skill-manager.js` | digest, permission expansion, rollback and package tests | pinned allowlist plus machine-local runtime |
| Final export | deterministic plugin service | atomic export and conflict tests | finalized Artifact versions and publishing roots |
| Generic release isolation | package script and release tests | bundle inspection | generic release manifest |

## 4. Stable page regions

The implemented view uses the same persistent regions as the prototype:

1. project header with global actions;
2. current-project selector;
3. independently scrollable eight-stage navigation;
4. active-stage canvas;
5. content review area before collaboration controls;
6. one final gate at the end of the active stage.

The project header and selector remain stable while the stage canvas changes. The stage navigation and canvas scroll independently when content exceeds available height. Primary click targets, secondary actions, states, and field sources follow `interaction-spec.md` and are not redesigned during implementation.

## 5. TDD delivery slices

### Slice 0 — Baseline and harness

Tests first:

- prototype fingerprint validation;
- personal module availability only in the personal build path;
- test harness for normalized project state and view rendering;
- screenshot-test harness with a fixed viewport.

Completion evidence:

- the prototype fingerprint is reproducible;
- existing tests remain green;
- baseline screenshots and viewport are versioned before UI work starts.

### Slice 1 — Domain state and persistence

Tests first:

- all eight stages have stable IDs, labels, order and semantic states;
- idea creation and article repurpose initialize different stage paths;
- WeChat and Xiaohongshu Deliverables progress independently;
- skipped, blocked, stale and failed stages are derived rather than faked as complete;
- state survives serialization and rejects invalid schema values;
- appending an inspiration is idempotent and marks dependent Artifacts stale.

Implementation:

- pure workflow module;
- schema normalization and migration from the early project format;
- Vault read/write adapter in the plugin.

### Slice 2 — Workbench shell and stage 1

Tests first:

- empty, one, five, ten-plus project selector states;
- persistent four-region structure;
- stage navigation state and blocking explanations;
- idea and saved-article entry modes;
- lazy Markdown/PDF source index and one-time source selection;
- primary and related inspiration unlink behavior.

Implementation:

- 1:1 shell, selector and stage-1 view;
- source index metadata loading before file-content loading;
- project and source persistence.

### Slice 3 — Diagnosis, research and master brief

Tests first:

- D0–D3 diagnosis presentation;
- optional local material and research guidance require no empty save;
- research path enters stage 3;
- explicit no-research decision skips stage 3 and enters restricted stage 4;
- stage 3 can change the decision and exit without research;
- generated brief is visible and editable before confirmation;
- manual and AI versions never overwrite one another.

Implementation:

- stages 2–4 UI and Task contracts;
- research authorization and result review;
- restricted-brief evidence warnings and approval gate.

### Slice 4 — Platform content plans

Tests first:

- independent platform Deliverables and active-platform switching;
- no second source picker after saved-article entry;
- WeChat outline and illustration plan share one approval gate;
- Xiaohongshu produces three executable visual proposals;
- direct selection and controlled sample comparison both work;
- WeChat-to-Xiaohongshu is blocked without a finalized WeChat Artifact.

Implementation:

- stage 5 WeChat and Xiaohongshu workspaces;
- natural-language collaboration and version history;
- platform-specific Task creation.

### Slice 5 — Content and visual review

Tests first:

- AI revision, manual work draft and named user version rules;
- Writing Styles QA does not replace human approval;
- WeChat text locks before approved illustration Tasks execute;
- Xiaohongshu visual and copy QA remain independent and default to 95;
- partial image success is retained and failed children retry independently;
- upstream edits mark downstream output stale.

Implementation:

- stages 6 and 7;
- version comparison and rollback;
- QA dashboards and visual acceptance.

### Slice 6 — Finalization, export and Runner operations

Tests first:

- platform-specific final checks;
- immutable `YYYYMMDD_主题[_vN]` snapshots;
- concurrent export conflict handling;
- Runner offline, waiting-user, partial, failed, cancelled and stale states;
- refresh, restart, sleep/wake and coordinated-device-transfer recovery;
- secrets and private paths never enter synchronized files or release output.

Implementation:

- stage 8;
- atomic export service;
- Runner lifecycle controls and recovery UI;
- publication and review records.

Current implementation status (2026-07-20): stage 8, immutable platform snapshots, concurrent suffix reservation, persistent background Runner launch, single-device ownership with fencing epoch, leases, same-owner recovery, bounded retry, cancellation staging, publication review, and Topic Miner feedback projection are implemented and covered by regression tests. Real Obsidian has verified one fenced Runner instance after plugin reload and the compact publication-review modal. Formal acceptance remains open for the explicit gaps listed in `progress-2026-07-20.md` and `path-validation-matrix.md`.

## 6. Red-to-green record

For every slice, the development record must contain:

1. the test name and design rule it represents;
2. the expected failing result before production implementation;
3. the minimal implementation that turns it green;
4. the focused and full regression results;
5. the real Obsidian path exercised;
6. the reference and actual screenshots for UI slices;
7. unresolved differences or deferred paths.

## 7. Commit boundaries

Do not commit implementation until the user accepts the corresponding verified slice. Keep unrelated existing working-tree changes out of slice commits. Each accepted slice should be independently reviewable and reversible.
