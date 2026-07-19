# Personal Creation Workflow Design Index

Status: approved V1 design baseline

Branch: `personal/topic-miner`

Last updated: 2026-07-19

## Purpose

This directory is the durable design index for the personal creation workflow that connects Reading Capture, Topic Miner, Creation Projects, Skill Runner, Codex Skills, WeChat production, Xiaohongshu production, and publishing-package export.

The workflow belongs only to the `personal/topic-miner` branch. It must not enter the generic Reading Capture release.

## Sources of truth

Authority is divided by concern rather than by a single document order:

1. The approved HTML prototype is the source of truth for the Creation Project view's visual presentation. The implementation must reproduce it 1:1.
2. [`interaction-spec.md`](interaction-spec.md) is the source of truth for what the user sees, edits, confirms, and can recover from.
3. [`../personal-topic-miner-creation-workflow-design.md`](../personal-topic-miner-creation-workflow-design.md) is the source of truth for product boundaries, domain model, storage, Runner architecture, Skill contracts, security, and implementation sequence.
4. [`path-validation-matrix.md`](path-validation-matrix.md) is the source of truth for the paths and evidence required before a development milestone is accepted.

The written rules remain authoritative for behavior, persistence, validation, and recovery that the prototype does not simulate completely. If a written visual rule conflicts with the current approved prototype, development pauses for a design correction instead of choosing one silently.

## Document map

| Document | Responsibility |
|---|---|
| `personal-topic-miner-creation-workflow-design.md` | Product and technical design for projects, Tasks, Artifacts, Approvals, Runner, Skills, storage, export, security, and V1 scope |
| `interaction-spec.md` | Eight-stage information architecture, user actions, review gates, platform branches, editing rules, visual semantics, error states, and navigation behavior |
| `path-validation-matrix.md` | End-to-end scenarios, expected transitions, blocking conditions, and development acceptance evidence |

## Approved prototype

The design was reviewed in an interactive HTML prototype named:

```text
creation-workflow-prototype.html
```

The prototype covers query-controlled variants for:

```text
mode=idea | repurpose
delivery=wechat | xhs
stage=relations | diagnosis | research | brief | plan | draft | visual | final
```

The prototype is the approved visual baseline, not executable product logic. The real Creation Project view must reproduce its layout, dimensions and proportions, spacing, typography, colors, borders, control hierarchy, labels, stage presentation, and visible states 1:1. It uses temporary browser state and simulated results, so the real implementation must additionally persist project truth in the Vault and execute work through durable Tasks. Product data, browser chrome, and temporary prototype-only simulation controls are not visual product requirements.

## Core approved decisions

- Obsidian is the control surface. The user must not reopen Codex to continue a project.
- The Vault is the durable source of project, Task, Artifact, version, Approval, and export state.
- Skill Runner orchestrates existing Skills; it does not reimplement research, writing, or visual generation.
- V1 executes Codex Skills only. Claude Code, Hermes, and OpenClaw are future adapters.
- A project has one primary inspiration and may have multiple related inspirations.
- A project may contain independent WeChat and Xiaohongshu Deliverables at different stages.
- Existing articles may enter a platform workflow without generating a fake master brief.
- Research is chosen from material diagnosis. There is no up-front quick-versus-deep mode.
- Manual edits create recoverable work drafts and then explicit user versions. They never overwrite approved versions.
- AI revisions always create new versions.
- WeChat and Xiaohongshu use independent approval, QA, version, and export state.
- WeChat planning includes both the article outline and the later illustration plan.
- Xiaohongshu supports native creation, saved-article adaptation, and adaptation from a finalized WeChat article.
- Automatic quality thresholds default to 95, but a passing score never replaces human review.
- Publishing export creates an immutable snapshot and leaves the creation project intact.
- Both platform directories use `YYYYMMDD_主题` with `_vN` conflict handling.
- The current approved prototype is reproduced 1:1 for the Creation Project view; it is not a loose style reference.
- Development is test-first using `red → green → refactor`; production behavior is not written before its failing test.

## Development gate

Implementation may begin from this baseline only through test-driven development. For every behavior or state, the developer must first add an automated test that expresses the approved requirement and observe it fail for the expected reason; only then may production code be written. The cycle is `red → green → refactor`, and no implementation-only commit is accepted without its preceding or accompanying tests.

Before the first UI implementation test, the team must freeze the approved prototype revision, reference viewport dimensions, and reference screenshots in version control. Changing any of these baselines requires explicit user approval and an update to this document set.

A milestone is not complete until:

1. its automated tests were written first and the expected red-to-green evidence is retained in the development record;
2. its path is demonstrated in the real Obsidian application;
3. generated content is visible and editable before approval;
4. loading, waiting, partial, failure, stale, and recovery states are exercised;
5. project state survives refresh and Obsidian restart;
6. screenshots at the approved reference viewport are compared with the current approved prototype and show a 1:1 visual reproduction, not merely a similar style;
7. responsive behavior is separately verified at narrower supported widths without weakening desktop 1:1 fidelity;
8. the generic Reading Capture build remains free of personal workflow modules.

## Change control

Significant workflow or UI changes require updates to:

1. the relevant design document;
2. the path validation matrix;
3. the visual prototype when the user-facing layout or action hierarchy changes.

Do not treat prototype copy or button labels as implementation details. In this workflow, labels define consequences and are part of the approval contract.
