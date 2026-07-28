# Agent Operating Guide

## Product Positioning

- Reading Capture is a non-technical Obsidian reading and annotation product.
- The plugin must work without Topic Miner, a personal vault layout, or any external AI workflow.
- External idea-mining data is an optional projection, not a core runtime dependency.

## Change Mode Gate

- When the user asks to discuss, analyze, compare, or design first, do not change code.
- Significant UI changes require an approved design proposal or mockup before implementation.
- Treat the approved design as an implementation contract, not loose inspiration.

## Design-To-Code Contract

Before implementation, create a short mapping for:

- page regions and column structure;
- fixed versus scrollable controls;
- primary click targets and secondary actions;
- empty, loading, single-record, multi-record, and error states;
- semantic status colors and their reuse across views;
- each visible field's real data source.

Do not add fields that cannot be derived from existing article, annotation, reading-record, or settings data. Do not add a secondary button when clicking the card already performs the same action.

## UI Principles

- Keep the main library, reader, and reading-record views visually consistent.
- Distinguish status badges, metadata tags, navigation, and command buttons by both appearance and behavior.
- Keep global actions visible when content scrolls.
- Prefer direct manipulation: clicking a record card selects or navigates; explicit buttons are reserved for a different action.
- Remove redundant counts, repeated labels, and explanatory UI copy when context already provides the information.
- Semantic colors must be visibly distinct and use the same meaning across all views.

## Verification

- Run the existing tests and build checks after code changes.
- Load the built plugin in Obsidian and capture the actual view.
- Compare the real screenshot with the approved design region by region.
- Test varied folder structures: one Markdown file, multiple unrelated Markdown files, multi-version articles, PDF plus Markdown, and missing optional data.
- Do not claim the UI is complete based only on a successful build.

## Documentation And Privacy

- README defaults to Chinese and links to English.
- Write installation and configuration guidance for non-technical users.
- Demo screenshots and documentation must not expose real local paths, vault names, API keys, email addresses, or private content.
- Prefer anonymous real screenshots; generated demos must match the current product version.

## Git And Release

- Commit only after the user accepts the implementation and verification result.
- Keep generated demo assets, temporary screenshots, and private local data out of release commits unless explicitly selected.
- Keep package, manifest, and release versions consistent.
