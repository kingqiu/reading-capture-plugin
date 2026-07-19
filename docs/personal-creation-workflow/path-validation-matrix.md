# Creation Workflow Path Validation Matrix

Status: V1 pre-development acceptance baseline

Branch: `personal/topic-miner`

Last updated: 2026-07-19

## 1. Purpose

This matrix converts the approved design into paths that can be demonstrated and tested. A successful build is not evidence that a path works. Each implementation milestone must be exercised in the real Obsidian application with real project files and controlled Skill Runner results.

## 2. Evidence required for every path

For each scenario, record:

- starting project and input state;
- every stage transition;
- visible confirmation object and button consequence;
- created Task, Attempt, Artifact, version, and Approval records;
- restart or refresh recovery result;
- failure or stale-state behavior where applicable;
- final Vault-relative output path;
- screenshot of each major checkpoint;
- proof that the generic plugin artifact remains unaffected.

## 3. WeChat paths

### W1 — Inspiration, with online research

```text
Inspiration relations
→ D0–D3 diagnosis
→ Research configuration
→ Transmission review and authorization
→ Runner execution
→ Research-result review
→ Master-brief candidate
→ Brief approval
→ WeChat outline and illustration plan
→ Text draft
→ Optional AI revision and manual proofread
→ Writing Styles QA
→ Text lock
→ Illustration Tasks
→ Integrated article review
→ Publishing snapshot
```

Expected:

- authorization is impossible before transmission acknowledgment;
- Runner completion does not bypass research-result review;
- brief approval targets a named version;
- illustration generation does not begin during outline planning;
- snapshot remains disabled until final human checks pass.

### W2 — Inspiration, without online research

```text
Inspiration relations
→ D2 diagnosis
→ Review no-research effect
→ Skip stage 3
→ Restricted master brief
→ WeChat production
→ Publishing snapshot
```

Expected:

- stage 3 is marked “not executed,” not complete;
- restricted evidence wording remains visible downstream;
- the user still reviews and approves the complete brief;
- export requires a final evidence-boundary acknowledgment.

### W3 — Existing article, note, or PDF to WeChat

```text
Choose existing-content mode
→ Select WeChat target
→ Select and read one main file
→ Skip stages 2–4
→ WeChat outline and illustration plan
→ Text and visual production
→ Publishing snapshot
```

Expected:

- the source picker reads metadata before content;
- stage 5 displays the exact selected title and path;
- no Xiaohongshu workspace appears by default;
- no hidden master brief is created;
- insufficient source material blocks generation and offers recovery.

### W4 — Accept the initial text draft

Expected:

- the user may run QA without creating a meaningless AI revision;
- passing QA still requires human checks;
- text lock identifies the exact draft and QA versions.

### W5 — Multiple AI text revisions

Expected:

- empty feedback keeps generation disabled;
- every revision names base and target versions;
- old versions remain comparable and recoverable;
- checks and QA reset for the new version.

### W6 — Manual text proofread

Expected:

- editing creates a recoverable work draft;
- AI revision and confirmation are disabled while the work draft exists;
- saving creates a user version;
- the new version requires fresh QA and human review.

### W7 — WeChat QA below 95

Expected:

- the failing dimensions and affected text are visible;
- the user may send selected findings to AI revision or edit manually;
- low score cannot lock the text;
- rerun targets the current named version.

### W8 — Illustration partial failure

Expected:

- successful images remain available;
- the failed child Task shows input, Skill, error, and temporary output;
- individual retry creates a new Attempt;
- assembly waits for all required validated outputs.

### W9 — Reopen text after images exist

Expected:

- the user sees which images depend on changed text;
- affected images become stale;
- unaffected images remain valid;
- finalization is blocked until affected outputs are resolved.

## 4. Xiaohongshu paths

### X1 — Native Xiaohongshu from an approved master brief

```text
Approved master brief
→ Create Xiaohongshu Deliverable
→ Read project input
→ Three proposals
→ Select directly or compare samples
→ Review complete page plan
→ Lock visual route
→ Generate card set and publishing copy
→ Dual QA
→ Human acceptance
→ Publishing snapshot
```

### X2 — Existing article, note, or PDF to Xiaohongshu

Expected:

- stage 1 selects and reads the source;
- stage 5 reuses it without another source modal;
- stages 2–4 are marked unused;
- the full source identity remains visible.

### X3 — Finalized WeChat article to Xiaohongshu

Expected:

- the entry remains disabled until a valid finalized WeChat version exists;
- enabling shows the exact source version;
- clicking reuses the WeChat Artifact without a Vault picker;
- the system redesigns the Xiaohongshu angle and does not mechanically summarize the article;
- a changed WeChat source marks the adaptation stale.

### X4 — Direct proposal selection

Expected:

- selection opens the complete page plan;
- full-set generation cannot begin before plan confirmation;
- page count and reason are visible.

### X5 — Three-proposal sample comparison

Expected:

- every proposal uses the same cover task and same key-page content;
- each feedback round changes only requested variables;
- previous samples remain available;
- choosing a sample still leads to full page-plan review.

### X6 — Manual publishing-copy edit

Expected:

- edit creates a work draft;
- old human checks clear;
- confirmation remains disabled until a user version is saved;
- saved copy version requires a fresh read.

### X7 — AI revision of cards and copy

Expected:

- current card and copy versions remain available;
- new versions are separate and individually identified;
- both QA lanes rerun against the new versions;
- human acceptance does not carry across versions.

### X8 — One QA lane below 95

Expected:

- visual and copy scores remain independent;
- only the failed lane iterates unless dependencies require both;
- after five failed automatic rounds, the Task enters `waiting_user` with a blocking reason;
- a low-scoring result cannot appear as complete.

### X9 — Card partial failure

Expected:

- generated pages remain visible;
- failed pages retry individually;
- card order and version remain unambiguous;
- publishing copy cannot finalize against an incomplete card set.

## 5. Cross-platform paths

### C1 — One project with WeChat and Xiaohongshu in different stages

Expected:

- platform switching changes only the workspace and active Deliverable;
- WeChat versions, checks, QA, and Task state do not modify Xiaohongshu;
- each platform restores its last active stage after restart;
- project summary derives from both without blocking independent progress.

### C2 — Export WeChat, then continue Xiaohongshu

Expected:

- WeChat snapshot is immutable;
- the source project remains editable;
- Xiaohongshu work continues without entering the WeChat publishing directory;
- publication status is independent from export status.

### C3 — Export both platforms

Expected:

- each platform requires its own final checks;
- each writes under its configured root;
- both use `YYYYMMDD_主题` naming;
- neither platform’s checkboxes unlock the other platform’s snapshot action.

### C4 — Refresh, restart, and another computer

Expected:

- project mode, source, active Deliverable, stage, versions, QA, Approvals, and Tasks restore from the Vault;
- browser state is not required;
- machine-local Runner and credential status are re-evaluated;
- state/file conflicts produce a recovery view, not silent overwrite.

### C5 — Upstream inspiration or source change

Expected:

- dependency impact is visible before confirmation;
- affected Artifacts become stale;
- running Tasks may finish only into staging;
- unaffected Deliverables remain usable.

## 6. Runner and Skill paths

### R1 — Runner offline

Expected:

- approved Task remains queued;
- UI says “waiting for Runner,” never “running”;
- starting the registered Runner claims the same Task without duplication.

### R2 — Missing Skill

Expected:

- only the affected Task blocks;
- source, pinned version, digest, dependencies, and permissions are visible;
- rejection leaves the project recoverable;
- installation never mutates the user’s interactive global Codex profile.

### R3 — Permission expansion

Expected:

- an update with broader read, write, network, or secret access requires new approval;
- rejecting the update leaves the previous pinned version runnable.

### R4 — Retry exhaustion

Expected:

- at most three automatic Attempts use the defined backoff;
- Attempt history remains append-only;
- terminal failure exposes retry, input change, Skill replacement, or cancellation.

### R5 — Obsidian closes during approved execution

Expected:

- background Runner continues approved work;
- reopening Obsidian reconstructs Task state and logs;
- no manual Codex conversation is required.

## 7. Export and conflict paths

### E1 — Existing target directory

Expected:

- base directory is never overwritten;
- user chooses `_v2`, `_v3`, or cancel;
- manifest version and directory suffix agree.

### E2 — Concurrent export attempt

Expected:

- atomic reservation produces distinct directories;
- both manifests match their Artifact hashes;
- no partial snapshot is exposed as successful.

### E3 — Export write failure

Expected:

- source project and finalized Artifact remain intact;
- temporary output is identified and recoverable or removable;
- retry does not create an ambiguous duplicate snapshot.

## 8. Generic-release isolation

Every milestone also verifies:

- generic bundle contains no Creation Project view;
- generic bundle contains no Topic Miner personal workflow module;
- generic bundle contains no Runner launcher or Skill IDs;
- generic bundle contains no personal directory defaults;
- generic plugin works in a clean Vault without Codex or Runner.

## 9. Current pre-code tabletop result

The approved prototype and written design now cover the successful branches for W1–W6, X1–X7, and C1–C5, plus visible recovery intent for W7–W9, X8–X9, R1–R5, and E1–E3.

These are design results, not implementation evidence. Every row remains pending until exercised against real plugin code and real Vault files.
