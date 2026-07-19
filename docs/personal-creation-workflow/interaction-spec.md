# Creation Workflow Interaction Specification

Status: approved V1 interaction baseline

Branch: `personal/topic-miner`

Last updated: 2026-07-19

## 1. Scope

This document specifies the user-facing creation workflow inside Obsidian. It defines what is displayed, what the user may edit, what requires confirmation, how platform branches behave, and how the user recovers when generation or validation fails.

It does not define Skill internals or Runner implementation details. Those are defined in [`../personal-topic-miner-creation-workflow-design.md`](../personal-topic-miner-creation-workflow-design.md).

## 2. Interaction principles

1. Any confirmation, authorization, generation, or export action must show its complete target and consequence in the same view.
2. The user can edit generated content directly or provide natural-language feedback to create a new AI version.
3. AI output never silently overwrites an existing AI or user version.
4. A recoverable work draft is not an approvable version.
5. Primary buttons name the consequence, such as “Confirm outline v2 and generate the WeChat text draft.”
6. Optional inputs never require an empty save action.
7. Two controls with the same result use the same label, hierarchy, and visual style.
8. Status text and action buttons must not look interchangeable.
9. A passing automatic score does not mean the user has approved the result.
10. A skipped stage is displayed as “not used for this path,” never as completed.
11. Upstream changes mark affected downstream work stale. They do not silently regenerate or delete it.
12. WeChat and Xiaohongshu Deliverables advance and recover independently.

## 3. Persistent page structure

The Creation Project view uses four stable regions:

```text
Project header
Current-project selector
Stage navigation | Active stage workspace
```

### 3.1 Project header

Displays:

- view identity: Reading Capture / Creation Workbench;
- page title;
- short behavior promise: generated content is shown, editable, reversible, and only then advanced;
- project record action;
- return-to-inspirations action.

### 3.2 Current-project selector

Displays the selected project title, platform summary, project summary state, Vault sync state, and a “Switch project” action.

The project selector opens a searchable list. It must support one, five, ten, or more projects without expanding the entire page height.

### 3.3 Stage navigation

The left navigation contains eight stages:

1. Project and source
2. Material diagnosis
3. Research and evidence
4. Master brief review
5. Platform content plan
6. Content review
7. Visual production and acceptance
8. Finalization and export

Each stage uses one of these semantic states:

| State | Meaning | Navigation behavior |
|---|---|---|
| current | The stage being worked on | Opens normally |
| complete | Its approved version is still valid | May be reopened |
| skipped | This project path does not use it | Opens an explanation, not a fake result |
| blocked | A prerequisite is missing | Does not navigate; explains the prerequisite |
| stale | An upstream dependency changed | Opens for review but cannot advance or export |
| failed | An executable Task failed | Opens failure and recovery information |

Color is not the only signal. Every state also uses text and, where needed, an icon.

### 3.4 Workspace hierarchy

Every stage follows the same reading order:

1. stage identity and current status;
2. content or evidence being reviewed;
3. optional editing and AI collaboration;
4. version and Task history;
5. one final gate stating the confirmation object and consequence.

The page must not present multiple equal primary buttons with unclear order.

## 4. Workflow modes

### 4.1 From an inspiration

```text
Project and inspiration relations
→ Material diagnosis
→ Optional research
→ Master brief review
→ Platform plan
→ Platform-specific production
→ Finalization and export
```

### 4.2 From an existing article, note, or PDF

```text
Select source and first target platform
→ Read one confirmed main file
→ Platform plan
→ Platform-specific production
→ Finalization and export
```

Stages 2–4 are marked “not used for this path.” The system must not create a hidden master brief merely to satisfy an older workflow.

If the selected source is insufficient, stage 5 blocks production and offers:

- add supporting material;
- replace the main file;
- switch to the full creation path while keeping the selected file as local material.

## 5. Stage 1 — Project and source

### 5.1 Inspiration path

Displays:

- candidate primary inspiration;
- related inspirations;
- source and join history;
- which downstream Artifacts use each inspiration;
- effect of changing a relationship.

User actions:

- view source;
- add a related inspiration;
- detach a related inspiration;
- make a related inspiration primary;
- replace the primary inspiration.

Detaching an inspiration never deletes the inspiration record. The confirmation dialog lists every affected downstream Artifact. Affected confirmed Artifacts become stale.

The stage advances only after the user confirms the primary inspiration and related-inspiration scope.

### 5.2 Existing-content path

The user first chooses the initial target platform:

- WeChat official account;
- Xiaohongshu image post.

The file picker queries metadata first and reads content only after confirmation.

It supports:

- layered folder browsing;
- recent files;
- title and path search with 250–300 ms debounce;
- Markdown and PDF filtering;
- paginated or virtual results, at most 50 per batch;
- one main file;
- multiple optional supporting files.

The picker displays path, type, modification time, reading policy, index state, and content-read state.

Markdown content is read only after confirmation. PDF files are checked for a text layer after selection. OCR requires a separate cost and permission decision.

Confirming the source opens the selected platform workspace in stage 5. It must not ask for the same file again.

## 6. Stage 2 — Material diagnosis

The diagnosis displays D0–D3 maturity, the evidence for every judgment, and missing evidence.

Recommended interpretation:

| Level | Meaning |
|---|---|
| D0 | Only a topic or fragment exists |
| D1 | A direction exists but key reasoning is missing |
| D2 | Theme and framework exist, but evidence is insufficient |
| D3 | Material can support platform planning |

### 6.1 Optional inputs

Two optional areas are available:

1. My supporting material: personal experience, author judgment, factual leads, local-file notes, and optional source path.
2. Research guidance: questions to answer, preferred sources, excluded sources, and time range.

Neither is required. Saving one does not require completing the other.

User-provided factual leads are marked “author provided, not yet verified.” Author judgment may enter the brief only as an attributed viewpoint.

### 6.2 Stage choices

- “Select local material” stays in stage 2 and updates diagnosis.
- “Directly enter research configuration” advances to stage 3. Both visible research-entry buttons use this exact label and primary-button style.
- “Do not perform online research this time” is an exceptional path used only when evidence is insufficient and the user deliberately chooses not to research.

The exceptional path first shows:

- unresolved evidence gaps;
- allowed cautious wording;
- prohibited claims;
- downstream effects;
- the exact material version to which the decision applies.

After acknowledgment, it skips stage 3 and enters stage 4 with a restricted master-brief candidate. Stage 3 is marked “not executed.”

## 7. Stage 3 — Research and evidence

Entering stage 3 does not authorize external transmission.

The screen uses this sequence:

1. select research capabilities;
2. inspect the exact transmission list;
3. choose to authorize research or change the decision;
4. inspect Task execution and review results.

### 7.1 Research routes

V1 may offer:

- Deep Research Skills as the default evidence route;
- Last30days for recent discussion and practice;
- Academic Research Suite when academic or causal evidence is actually needed.

Each route explains why it is selected or not selected.

### 7.2 Authorization

“Authorize and start research” remains disabled until the user views the transmission scope and checks the authorization acknowledgment.

Saving research guidance is not authorization.

### 7.3 Changing the decision

If the user entered research configuration and then decides not to research, the secondary path is labelled “Change decision: do not go online this time.”

After acknowledging the effect, it enters stage 4 directly. Stage 3 is marked skipped, not complete.

### 7.4 Research Task states

```text
waiting for authorization
→ queued
→ running or waiting for Runner
→ partial, failed, or completed
→ result waiting for review
→ accepted
```

The result review displays evidence cards, sources, conflicts, unresolved gaps, and failed child Tasks. Completed child Tasks are retained; only failed children are retried.

Research completion does not automatically create or approve a master brief. The user first accepts the research result, after which the system creates a new master-brief candidate.

## 8. Stage 4 — Master brief review

The full brief is visible and directly editable. It contains at least:

- content positioning;
- core judgment;
- reader value;
- evidence boundary;
- source relationship;
- platform opportunities and claims to avoid.

### 8.1 Default path

When the user accepts the generated version without changes:

```text
Read the complete brief
→ Check “I have read the complete brief”
→ Confirm the named version and enter platform planning
```

No redundant save action is required.

### 8.2 Manual editing

The first edit:

- invalidates the old reading confirmation;
- creates an auto-saved recovery draft;
- disables confirmation and AI revision;
- shows “Finish editing and save as user version vN.”

After the user saves the version, the old version remains available and the new version requires a fresh read and confirmation.

### 8.3 AI revision

The AI-revision button is disabled when feedback is empty or when an unsaved manual work draft exists.

The button names its base and target versions. Generated revisions preserve the old version and require separate review.

### 8.4 Restricted brief

A no-research brief keeps its evidence boundary visible in every downstream stage. Confirming it approves the brief version, not the missing evidence.

## 9. Stage 5 — Platform content plan

WeChat and Xiaohongshu are independent Deliverables shown in a platform switcher. Both may exist in one project.

Switching the workspace changes only the active Deliverable. It does not change the other platform’s version, approval, QA, or Task state.

### 9.1 WeChat planning workspace

The WeChat plan includes two jointly approved objects:

1. article outline;
2. body-illustration plan.

Each outline section includes:

- section title;
- writing purpose or core judgment;
- evidence or delivery requirement;
- necessary subsections.

The user may edit a section directly or discuss the overall outline with the Agent in natural language. Every AI revision creates a new outline version.

Each illustration task records:

- insertion anchor;
- cognitive task;
- visual intent;
- source constraint;
- aspect ratio;
- selected Skill.

Approved V1 routing:

- Liangkeban Xiaoxiaoke for a single judgment, state change, flow metaphor, or explanatory scene;
- Baoyu Infographic for a matrix, comparison, hierarchy, process, or dense structured information.

Stage 5 only plans illustrations. It does not generate them.

The final gate approves a named outline version plus a named illustration-plan version. Its consequence is generation of the text draft only.

### 9.2 Xiaohongshu input sources

Supported inputs:

- an Obsidian saved article, note, report, or PDF;
- the current approved master brief;
- a finalized WeChat article from the same project.

Unavailable inputs are disabled with the unmet prerequisite.

When stage 1 already read a source, stage 5 reuses it. It must not open another source picker unless the user explicitly chooses “Change source.”

### 9.3 Xiaohongshu planning workflow

The workspace shows six phases at the same time:

```text
Read source
→ Three proposals
→ Sample discussion
→ Full-set generation
→ Dual QA
→ Human acceptance and export
```

The Agent first reads and displays the source title, path, read state, and material status.

It then recommends three executable proposals. Each includes:

- visual system;
- template and sub-template;
- theme and palette;
- recommended page count and reason;
- page-by-page content;
- visual evidence;
- suitability and main tradeoff.

Page count follows source structure. It does not default to three to five pages. More than twelve pages or two reader jobs triggers a split option.

The user may:

- select one proposal and inspect the full page plan; or
- generate the same cover and same key content page for two or three proposals, then compare.

Sample comparison controls variables. Each iteration changes only the variables named by the user and preserves the previous samples.

The complete page plan is directly editable and supports natural-language restructuring. Non-cover pages record source anchor, information to preserve, reader sentence, visual evidence, and intentionally removed material.

Only after the user confirms template, palette, and page plan may the system generate the full card set and publishing copy.

## 10. Stage 6 — Content review

Stage 6 renders the workspace for the active Deliverable. It must never display WeChat content when Xiaohongshu is active or vice versa.

### 10.1 WeChat content review

Recommended sequence:

```text
Optional AI revisions
→ Optional manual proofreading
→ Required Writing Styles QA
→ Required human confirmation
```

The user may skip AI revision when the initial draft is satisfactory.

Manual edits create a work draft and then a named user version. AI revision is disabled until the manual draft becomes a named version.

Writing Styles / Keke QA displays at least:

- L0 material and content diagnosis;
- L1 hard rules and citations;
- L2 style and author position;
- L3 content quality and evidence;
- L4 Keke voice and AI traces.

The default threshold is 95. Below threshold, the screen displays concrete issues and offers:

- add selected issues to AI revision feedback;
- locate and edit the affected text manually.

Any text modification invalidates the previous QA result.

The user can lock the text only when the current named version has passed QA and the user has completed the two visible review acknowledgments.

### 10.2 Xiaohongshu content review

The review object is:

```text
Card-set version + publishing-copy version
```

The screen displays:

- all pages and the weakest page;
- visual-rule score and iteration count;
- complete title, body, and tags;
- copy score and iteration count;
- card/copy consistency;
- human visual checks.

Keke Social Card owns card QA. Writing Styles / Keke owns publishing-copy QA. Each threshold defaults to 95.

If either lane remains below 95 after five automatic iterations, automation stops and displays the blocking reason.

Manual copy edits create a recovery draft. The user must save it as publishing-copy version vN before confirmation. Saving clears old checks and requires a fresh read.

Natural-language revision preserves current card and copy versions and generates new candidate versions.

## 11. Stage 7 — Visual production and acceptance

### 11.1 WeChat

After text lock, the system executes the already approved illustration plan. It does not ask the user to design another visual plan.

The screen displays, per image:

- output and insertion location;
- executing Skill;
- source and text accuracy;
- visual result;
- individual retry or data correction;
- surrounding article context.

Task details expose Runner state, partial success, missing Skill, expanded permission, errors, temporary output, and single-task retry.

Changing locked text marks affected images stale. Unaffected images remain valid.

The gate confirms the named text version plus inserted image versions as one integrated article.

### 11.2 Xiaohongshu

The final review compares the already-passing card set and publishing copy as one synchronized package.

It checks page order, weakest page, cover promise, title system, Chinese line breaks, image completeness, footer, brand signature, copy consistency, and final output files.

Changing a core card judgment marks the publishing copy for recheck. Punctuation-only corrections do not force full card regeneration.

## 12. Stage 8 — Finalization and export

The complete publishing package is visible before export.

It displays:

- final article or publishing copy;
- images;
- source records;
- QA records;
- target directory;
- name-conflict behavior;
- current platform and versions.

### 12.1 Human export gate

The snapshot button is disabled until every platform-specific final check is complete.

WeChat checks do not unlock Xiaohongshu export. Xiaohongshu checks do not unlock WeChat export.

### 12.2 Export behavior

Export creates an immutable snapshot. It does not publish automatically, delete the creation project, or overwrite an existing directory.

Both platforms use:

```text
YYYYMMDD_主题
```

If the directory exists, the user chooses `_v2`, `_v3`, and so on, or cancels.

After export, offer “Open publishing directory” and “Copy publishing path.”

## 13. Version and approval rules

1. Every Approval targets an immutable Artifact version and content hash.
2. An AI initial version, AI revision, and user version are distinct.
3. A work draft auto-saves for recovery but cannot be approved.
4. The first modification clears old reading checks, QA, and confirmation.
5. A user version preserves its base version.
6. AI feedback is optional; an empty field never requires saving.
7. AI revision is disabled while a manual work draft exists.
8. Reopening an approved stage records revocation and marks affected downstream work stale.
9. Running downstream Tasks may finish into staging but may not promote stale results.
10. Version comparison and recovery must be available wherever AI or user revisions occur.

## 14. Task and Runner presentation

The UI uses these normalized execution states:

```text
queued
running
waiting_user
partial
failed
completed
stale
cancelled
```

`waiting_user` covers missing installation approval, expanded permission, missing credentials, input conflict, or a required user decision.

Runner offline means “waiting for Runner,” not “running.”

Each failure view displays:

- failed Task and Skill;
- input version summary;
- error class in user language;
- temporary output, if any;
- retained successful children;
- retry, replace Skill, change input, or cancel actions.

## 15. Durable state and resume

Browser session state is not a product-state source. The Vault persists at least:

```yaml
workflowMode: idea_creation | article_repurpose
source:
  mainFile: vault-relative-path
  supportingFiles: []
  readVersion: hash-or-mtime
research:
  taskState: queued | running | waiting_user | partial | failed | completed | accepted
  acceptedResultVersion: null
deliverables:
  wechat:
    stage: plan | draft | visual | final
    outlineVersion: null
    illustrationPlanVersion: null
    articleVersion: null
    qaVersion: null
    approvalVersion: null
    taskState: null
  xiaohongshu:
    stage: plan | draft | visual | final
    sourceVersion: null
    planVersion: null
    cardVersion: null
    captionVersion: null
    visualQaVersion: null
    copyQaVersion: null
    approvalVersion: null
    taskState: null
activeDeliverable: wechat | xiaohongshu
```

Refresh, project switching, Obsidian restart, and opening the synced Vault on another machine restore the same workflow structure.

If state metadata and files disagree, the UI shows a conflict and recovery choices. It never silently overwrites either side.

## 16. Visual semantics

- Green: valid, selected, passed, or ready.
- Blue: candidate, informational selection, or current work where green would imply approval.
- Amber: caution, user decision, evidence limitation, or an exceptional path.
- Red: failure, destructive effect, invalid state, or blocked output.
- Gray: inactive, unavailable, historical, or secondary metadata.

Status indicators use a dot or compact label and are not shaped like primary command buttons.

Selected list records use one complete selected treatment. Adjacent unselected records must not retain a border that looks selected.

Primary buttons are reserved for the next recommended consequence. Secondary actions use neutral buttons. Destructive actions use red only after the target and impact are visible.

## 17. Responsive and accessibility baseline

- No horizontal overflow at common Obsidian desktop widths.
- Project lists scroll independently and do not force both columns to equal viewport height.
- At narrower widths, secondary panels move below the primary document while the final gate remains after the reviewed content.
- Keyboard focus follows visual order.
- All interactive elements have visible focus states.
- Buttons have explicit labels; icon-only actions include accessible names.
- Form labels remain visible when fields contain content.
- Body text maintains at least 4.5:1 contrast.
- Color is never the only status signal.
- Touch targets are at least 44 px where the interface may be used on touch devices.

## 18. Empty, loading, and error states

| Feature | Empty | Loading | Error | Partial | Success |
|---|---|---|---|---|---|
| Project selector | Explain how to create from an inspiration | Show indexed project count | Retry project index | Show available projects | Open selected project |
| Source picker | Show directory/search guidance | Load metadata only | Retry index or open Vault file | Retain loaded results | Show selected path and read policy |
| Source read | No platform proposal | Show one-file read progress | Retry or replace source | Ask for supporting material | Show read summary and source path |
| Research | Explain why research is optional | Show Task and Runner state | Show failed route and retry | Retain successful routes | Open result review |
| AI revision | Disabled until feedback exists | Show base and target version | Keep base version and feedback | Show available candidate output | Open new candidate version |
| Visual generation | Show approved shot plan | Show child Tasks | Retry failed child | Retain completed images | Open visual acceptance |
| Export | Explain unmet gate | Show snapshot reservation | Resolve name or write failure | Preserve source project | Open publishing directory |

## 19. Deferred interaction scope

Not part of V1:

- automatic publishing to platform accounts;
- automatic platform analytics collection;
- concurrent multi-device execution;
- forced takeover of an offline Runner;
- third-party Agent executors;
- Xiaoxiaoke or Baoyu components inside a Keke Social Card set;
- mobile-first creation workflow.

The design should leave adapter and platform-extension seams without displaying unavailable V1 controls as if they worked.
