# Reading Capture

[简体中文](README.md) | English

Browse saved articles, read Markdown and static HTML, and collect highlights and thoughts in structured Obsidian notes.

Reading Capture includes an article library (知见录), a Markdown reader, an HTML preview, and reading-record views. Basic reading and annotation do not require an AI model, Topic Miner, or an automation service.

> This guide describes the current `personal/topic-miner` branch. Its source manifest declares version `0.4.4`. Development features may not yet be available in a GitHub Release; check the package you install.

## Current reading experience

- **Sticky library toolbar:** the title, search box, creation actions, rescan button, and theme switch remain visible as you scroll through articles.
- **Independent side panels:** collapse filters to the left and article details to the right. Edge arrows reopen them without clearing filters or the selected article.
- **Responsive cards:** one to four columns based on available width. Narrow windows use temporary side drawers.
- **Consistent light and dark themes:** the sun/moon button at the end of the toolbar also updates the reader, reading records, inspiration, creation projects, and plugin dialogs.
- **Remembered preferences:** theme and panel visibility persist locally for each vault. They do not change Obsidian's global theme or authored HTML colors.
- **Typography:** the interface uses system sans-serif fonts, preferring PingFang SC when available. The Markdown reader defaults to sans-serif; its Aa controls offer a serif option, font size, and line spacing.

Outdated redrawn screenshots have been removed from this guide. Future screenshots will use anonymous demo data and be checked for local paths, account details, and private article content before upload.

## Install and update

Download `reading-capture.zip`, when available, from [Releases](https://github.com/kingqiu/reading-capture-plugin/releases). GitHub's `Source code.zip` is not an installable plugin package.

1. Extract the complete `reading-capture` folder into your vault's `.obsidian/plugins/` directory.
2. Ensure `main.js`, `manifest.json`, `styles.css`, and all supporting modules sit directly inside that folder, without an extra nested folder.
3. Enable Reading Capture under **Settings → Community plugins**.

Before updating, back up the entire existing plugin directory. Replace runtime files with the new package, preserve your existing `data.json`, and reload the plugin or restart Obsidian. Reading records and attachments are separate vault files; do not delete them during an update.

See the [cross-device update guide (Chinese)](docs/cross-device-plugin-update.md). For unreleased branch features, build from source using the commands below.

## First use

In Reading Capture settings:

1. Set library scan directories, one vault-relative path per line, such as `Articles` or `Research`. Markdown, PDF, HTML, and HTM are supported.
2. Configure exclusions if needed. Reading-record folders and `.obsidian` are excluded by default.
3. Confirm the reading-note root, which defaults to `Reading Capture/notes`.
4. Run **Reading Capture: 打开知见录** from Obsidian's command palette. Use rescan after adding files.

Select a card to inspect its details. Use its reading button, the best-version action, or a specific version in the details panel to open a file. Existing Markdown preferences remain in effect; HTML-only articles can open directly.

## Markdown and reading records

Select text and use the context menu or a Reading Capture command to highlight it or save a thought, creative idea, or fact to check. You can also record a whole-article thought without selecting text.

Reading records are centralized Markdown files in your vault. The reader sidebar and record view let you browse notes, copy quotes, and return to the source. Substantial source edits can prevent precise relocation without deleting the saved record.

## HTML / HTM preview and annotations

HTML versions open as rendered pages inside Obsidian, preserving their layout rather than displaying source code.

- Same-name Markdown files in the same folder are associated first. Other HTML files may join when all Markdown files in the folder belong to one article group; ambiguous HTML files appear independently.
- Vault-relative CSS, images, and fonts are supported. Original page colors are retained.
- Page scripts, embedded pages, and automatic network-resource loading are disabled. Pages depending on scripts or online assets may be incomplete.
- The compact toolbar and annotation sidebar can be collapsed. Refresh reloads the page and its resources.
- Right-click selected text to highlight it or save a thought, idea, or fact to check.
- Right-click an image to annotate the whole image. Local images, embedded images, responsive images, and static SVG diagrams are supported.

HTML annotations share the centralized reading-note directory while retaining a separate source association from Markdown annotations. Image copies are stored under `attachments/html/` in the reading-note directory and deduplicated by content. The original HTML is not modified.

Highlights, image markers, and navigation are restored on reopening or refreshing. If the source changes and cannot be reliably matched, the annotation is marked unlocated while its excerpt or image copy remains available. Image-region selection, CSS background images, and canvas annotations are not supported. Audio and PDF export for HTML still depend on an available Markdown/PDF version.

HTML features have been verified on macOS desktop Obsidian. Mobile has not been validated.

## PDF export

Select an article in the library and choose **导出 PDF** in its details panel. Export one version at a time; Chinese translations are preferred by default, with an option to select the original.

- Export just the article, or include reading notes for the article group. AI summaries require a separate opt-in.
- Markdown notes can appear after corresponding passages or at the end. Notes from other versions and unlocated notes are retained at the end.
- Native PDFs retain their original pages and append notes.
- Missing images can be retried or explicitly skipped with placeholders.

Conversion is local and uses a system save dialog. This feature has been verified on macOS desktop and is unavailable on mobile. Encrypted, damaged, or signed PDFs require a processable copy.

## Inspiration and creation projects

The inspiration view works independently with manually captured ideas. Local Topic Miner reports can optionally supply additional candidates; Topic Miner is not a prerequisite.

This development branch also includes a creation workspace for planning from an idea or adapting existing articles, notes, and PDFs into WeChat articles or Xiaohongshu posts. It supports stage tracking, sample comparisons, image previews, individual image retries, content review, and publication-package preparation.

Automated generation requires a configured local Skill Runner, relevant skills, and project/output directories. External model or service use depends on those tools; review their data handling before running them. Basic reading and annotations do not need this setup.

## Commands and troubleshooting

Search for `Reading Capture` in the Obsidian command palette to open the library, reader, reading records, inspiration, or creation workspace; capture highlights and thoughts; mark reading complete; rebuild the index; or export diagnostics.

- **Plugin missing or failing to load:** check the package, folder nesting, and supporting files.
- **Old interface after updating:** reload the plugin and confirm you updated the currently open vault.
- **Articles missing:** check vault-relative scan paths and exclusions, then rescan. Moved articles may require an index rebuild.
- **Annotation cannot relocate:** check whether the source path, text, or image changed. Unlocated records are retained.
- **Reporting an issue:** export diagnostics, then review and redact settings, paths, and personal information before sharing. Do not upload private vault screenshots, notes, or `data.json` directly.

## Build from source

With Node.js and npm installed, run:

```sh
npm ci
npm run release:check
```

This runs tests, builds the package, and checks its structure. Installable files are written to `dist/reading-capture/` and the archive to `dist/reading-capture.zip`. A source build includes the modules and version declared by this branch, not extra integrations from another installed build.

## License

[Apache License 2.0](LICENSE).
