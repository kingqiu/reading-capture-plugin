# Reading Capture Plugin Optimization Plan - 2026-07-04

## Context

This plan captures the next plugin-focused optimization work after the 2026-07-03 session.

The current priority is to return focus from the external Topic Miner skill back to the Obsidian plugin itself. The plugin should stay lightweight and useful inside Obsidian, while AI-heavy topic mining remains external.

Important product rule: for significant UI changes, create a design proposal or mockup first and confirm it before implementation.

## Recommended Order

### 1. Redesign the topic pool entry and view

Current state:

- The plugin has an `Open Topic Pool` command.
- The entry is not obvious in the main article library UI.
- The first Topic Pool view is functional but still rough.

Questions to resolve:

- Should Topic Pool be a top-level tab in the main library view?
- Should it appear as a button in the right detail panel?
- Should it remain command-only until the UX is clearer?

Likely direction:

- Start with a small design proposal.
- Avoid making the plugin feel AI-heavy.
- Keep Topic Pool as a lightweight view over captured reading-note topics.

### 2. Improve the right detail panel hierarchy

Current issue:

- The right panel contains many useful things, but the hierarchy is not yet clear enough for daily use.

Potential structure:

- Best reading entry.
- Reading status and annotation summary.
- File versions.
- Writable topic signals.
- Original path, source information, and summary.

Goal:

- Make it obvious what to open, what has been read, and what can become writing material.

### 3. Finalize automatic status badges

Current direction:

- Avoid manual workflow state buttons inside article groups.
- Show only states the plugin can infer automatically.

Possible badges:

- Unread.
- Reading.
- Annotated.
- Pending summary.
- Has topic.
- Has PDF.
- Has Chinese version.
- Used.

Open questions:

- Which badges belong on article cards?
- Which badges belong only in the detail panel?
- Should inferred progress be single-state or multi-badge?

### 4. Improve search

Current search:

- Title.
- Path.
- Snippet.
- Version file names.

Potential additions:

- Annotation content.
- User notes.
- Writable topic text.
- Source author or URL where available.
- Search-result highlighting.

### 5. Improve filters

Current filters:

- Source.
- Status.
- Progress.
- Sort.

Potential additions:

- Clear filters.
- Current filter summary.
- Has writable topic.
- Pending summary.
- Used.

### 6. Polish PDF and Markdown version display

Current state:

- PDFs can open in Obsidian.
- Version path hover and copy behavior exists.

Potential improvements:

- Pair Markdown and PDF versions more clearly.
- Prioritize Chinese and enriched versions.
- Improve labels for original PDF vs Chinese PDF.
- Keep hover path and right-click copy behavior consistent.

### 7. Continue performance and scan improvements

Already done:

- Article library scan cache.
- Snapshot preload for faster initial render.

Potential next steps:

- More visible scan progress.
- Scan error list.
- Better incremental scan behavior.
- Avoid startup friction in Obsidian.

### 8. Improve reading-record linkage

Potential detail-panel additions:

- Last read time.
- Reading-note path.
- Annotation count.
- Writable topic count.
- Open reading note action.

### 9. Consider lightweight Topic Miner integration

Do not embed AI generation in the plugin.

Possible lightweight integration:

- Read `Learning/reading-notes/topic-miner/candidates.jsonl`.
- Surface related candidate topics in Topic Pool or article detail.
- Show feedback labels such as `想写`, `暂存`, `不要`, `已写`.

This needs a design proposal first.

### 10. Improve GitHub manual-install release experience

Potential work:

- Better README screenshots.
- Clearer manual install steps.
- GitHub release checklist.
- Release zip naming and version consistency.

## Suggested First Tasks Tomorrow

1. Create a design proposal for Topic Pool entry and view.
2. Create a design proposal for the right detail panel hierarchy.
3. Decide the automatic status badge rules before changing UI.

## Notes

- Keep the two untracked SVG files uncommitted unless explicitly requested:
  - `docs/ai-content-knowledge-loop-architecture.svg`
  - `docs/human-ai-pkm-loop-architecture.svg`
- Current plugin remote: `https://github.com/kingqiu/reading-capture-plugin.git`
- Latest plugin commit at the time of this note: `1918c24 Add topic pool and progress filters`
