# Reading Capture Plugin Optimization Plan

Last updated: 2026-07-05

## How To Use This File

When the user asks about future Reading Capture plugin optimization, improvement plans, packaging, release readiness, or "what should we do next", read this file first before answering.

For major UI changes, prepare a design proposal or mockup first and wait for confirmation before changing code.

## Current State

Already completed:

- Main `知见录` article-library view has been redesigned and polished.
- Reader annotation page has been aligned with the main visual style.
- Dedicated reading-record view has been added, replacing direct raw Markdown opening for normal use.
- PDF files can be opened from article groups.
- Article grouping supports both multi-version article folders and standalone Markdown files.
- Article library scan cache and snapshot preload have improved startup experience.
- Manual install package can be generated as `dist/reading-capture.zip`.
- Release checks exist and pass.
- English and Chinese user-facing README files exist.
- README files include anonymous demo screenshots for article library, reader, reading-record, and install/settings.

## Product Experience Optimizations

### 1. Creative Ideas Entry And View

Current state:

- Creative Ideas exists as a command.
- Entry is not obvious in the main UI.
- The view is functional but still rough.

Possible directions:

- Add a clear Creative Ideas entry in `知见录`.
- Surface article-related ideas in the right detail panel.
- Keep Creative Ideas lightweight and avoid making the plugin feel AI-heavy.

Need design first:

- Yes. This changes the main information architecture.

### 2. Right Detail Panel Hierarchy

Current state:

- The right panel is useful but can be clearer.

Possible structure:

- Best reading entry.
- Reading status and annotation summary.
- File versions.
- Creative idea signals.
- Original path, source information, and summary.

Goal:

- Make it obvious what to open, what has been read, and what can become writing material.

Need design first:

- Yes.

### 3. Automatic Status Badge Rules

Current direction:

- Avoid manual workflow-state buttons inside article groups.
- Show only states the plugin can infer automatically.

Possible badges:

- Unread.
- Reading.
- Annotated.
- Pending summary.
- Has creative idea.
- Has PDF.
- Has Chinese version.
- Used.

Open questions:

- Which badges belong on article cards?
- Which badges belong only in the detail panel?
- Should inferred progress be a single state or multiple badges?

### 4. Search Improvements

Current search:

- Title.
- Path.
- Snippet.
- Version file names.

Potential additions:

- Annotation content.
- User notes.
- Creative idea text.
- Fact-check text.
- Source author or URL where available.
- Search-result highlighting.

### 5. Filter Improvements

Current filters:

- Source.
- Status.
- Progress.
- Sort.

Potential additions:

- Clear filters.
- Current filter summary.
- Has creative idea.
- Pending summary.
- Used.
- Has PDF.
- Has Chinese version.

### 6. Markdown And PDF Version Display

Current state:

- PDFs can open in Obsidian.
- Version path hover and copy behavior exists.

Potential improvements:

- Pair Markdown and PDF versions more clearly.
- Prioritize Chinese and enriched versions more visibly.
- Improve labels for original PDF vs Chinese PDF.
- Keep hover path and right-click copy behavior consistent.

### 7. Scan And Performance Experience

Already done:

- Article library scan cache.
- Snapshot preload for faster initial render.

Potential next steps:

- More visible scan progress.
- Scan error list.
- Better incremental scan behavior.
- Last scanned time.
- Avoid startup friction in Obsidian.

### 8. Reading Record View Refinements

Already done:

- Dedicated two-column reading-record view.
- Record view / Markdown toggle.
- Record detail panel.
- Return to original article position when possible.

Potential next steps:

- Make type filters actually clickable.
- Support grouping by type or time.
- Improve empty states.
- Add light card actions such as copy quote, copy thought, return to original.
- Better handling when an original quote cannot be located.

### 9. Settings Page For Non-Technical Users

Current state:

- Settings use mostly Obsidian default controls.

Potential improvements:

- Friendlier explanations for scan folders and reading-note root.
- Configuration check: whether scan folders are set and whether articles are found.
- Warnings when scan folders are empty or invalid.

### 10. Lightweight Topic Miner Integration

Do not embed AI generation directly in the plugin.

Possible lightweight integration:

- Read external Topic Miner output, such as `Learning/reading-notes/topic-miner/candidates.jsonl`.
- Surface related candidate ideas in Creative Ideas or article detail.
- Show feedback labels such as `想写`, `暂存`, `不要`, `已写`.

Need design first:

- Yes. This affects product positioning and should stay lightweight.

## Packaging And Release Optimizations

### 1. Standardize GitHub Release Flow

Recommended release flow:

- Update version number.
- Run release check.
- Generate zip.
- Create GitHub Release.
- Upload `reading-capture.zip`.
- Add clear release notes.

### 2. Version Consistency Check

Keep these files in sync:

- `package.json`
- `plugin/manifest.json`
- `versions.json`

Potential work:

- Add a script that fails if versions are inconsistent.

### 3. Release Package Content Check

Already checked:

- Release package exists.
- Zip can be generated.

Potential additions:

- Ensure package includes `main.js`.
- Ensure package includes `styles.css`.
- Ensure package includes `manifest.json`.
- Ensure package includes `reading-core.js`.
- Ensure zip directory structure is exactly `reading-capture/...`.

### 4. README Screenshots

Current state:

- English and Chinese README files exist.
- Anonymous demo screenshots exist under `docs/assets/screenshots/`.
- README files show the article library, reader, reading-record, and install/settings flows.

Potential additions:

- Replace demo images with real redacted screenshots later if needed.
- Add a dedicated GitHub Release screenshot once the first public release exists.

### 5. Manual Install Experience

Potential additions:

- Tell users to download the release zip, not GitHub source code.
- Explain that the folder name should be `reading-capture`.
- Explain how to fix the common "nested folder" mistake after unzip.
- Add a short troubleshooting section.

### 6. BRAT Support

If the plugin stays outside the official Obsidian community directory for now, consider BRAT support for users who can install from GitHub.

This could reduce manual update friction.

### 7. Future Official Community Release Preparation

Not the current release target, but prepare for it later:

- Stable plugin ID.
- Complete manifest.
- Clear README.
- Stable release package.
- Privacy and network behavior explanation.
- Avoid unnecessary external network requests.

## Suggested Next Work

If optimizing for user adoption and installation success:

1. Improve GitHub release and manual installation experience.
2. Add README screenshots.
3. Add version consistency checks.

If optimizing for daily product experience:

1. Design Creative Ideas entry and view.
2. Redesign the right detail panel hierarchy.
3. Finalize automatic status badge rules.

If optimizing for power-user workflows:

1. Improve search across annotations and notes.
2. Improve reading-record filters and grouping.
3. Add lightweight Topic Miner integration.

## Local Notes

- Keep these untracked SVG files uncommitted unless explicitly requested:
  - `docs/ai-content-knowledge-loop-architecture.svg`
  - `docs/human-ai-pkm-loop-architecture.svg`
- Existing dated plan file:
  - `docs/plugin-optimization-plan-2026-07-04.md`
- Current plugin remote:
  - `https://github.com/kingqiu/reading-capture-plugin.git`
