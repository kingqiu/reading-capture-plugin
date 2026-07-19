# Personal Creation Workflow Design Index

Status: approved V1 design baseline

Branch: `personal/topic-miner`

Last updated: 2026-07-19

## Purpose

This directory is the durable design index for the personal creation workflow that connects Reading Capture, Topic Miner, Creation Projects, Skill Runner, Codex Skills, WeChat production, Xiaohongshu production, and publishing-package export.

The workflow belongs only to the `personal/topic-miner` branch. It must not enter the generic Reading Capture release.

## Source-of-truth order

When documents appear to disagree, use this order:

1. [`interaction-spec.md`](interaction-spec.md) for what the user sees, edits, confirms, and can recover from.
2. [`../personal-topic-miner-creation-workflow-design.md`](../personal-topic-miner-creation-workflow-design.md) for product boundaries, domain model, storage, Runner architecture, Skill contracts, security, and implementation sequence.
3. [`path-validation-matrix.md`](path-validation-matrix.md) for the paths that must work before a development milestone is accepted.
4. The approved HTML prototype for visual intent only. The written rules above win if prototype behavior is incomplete.

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

The prototype is a visual and interaction reference, not executable product logic. It uses temporary browser state and simulated results. The real implementation must persist project truth in the Vault and execute work through durable Tasks.

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

## Development gate

Implementation may begin from this baseline. A milestone is not complete until:

1. its path is demonstrated in the real Obsidian application;
2. generated content is visible and editable before approval;
3. loading, waiting, partial, failure, stale, and recovery states are exercised;
4. project state survives refresh and Obsidian restart;
5. screenshots are compared with the approved interaction hierarchy;
6. the generic Reading Capture build remains free of personal workflow modules.

## Change control

Significant workflow or UI changes require updates to:

1. the relevant design document;
2. the path validation matrix;
3. the visual prototype when the user-facing layout or action hierarchy changes.

Do not treat prototype copy or button labels as implementation details. In this workflow, labels define consequences and are part of the approval contract.
