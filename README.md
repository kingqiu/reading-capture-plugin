# Reading Capture

Reading Capture is an Obsidian plugin for immersive article reading, lightweight highlighting, and structured reading-note capture.

It is designed for people who collect long-form reading material in Obsidian and want a separate layer for highlights, notes, writing ideas, and follow-up checks:

- Read saved Markdown articles in a dedicated reader view.
- Highlight passages without modifying the original Markdown file.
- Capture thoughts, writing topics, and fact-check items into a central reading-notes protocol.
- Reopen an article and see saved highlights, hover notes, and a right-side annotation panel.
- Use the structured reading notes yourself, or let your own automation summarize and transform them later.

Version: `0.4.3`

## Features

- Dedicated `Reading Capture Reader` view with a dark immersive reading style.
- `知见录` view for browsing saved article groups across configured source folders.
- Article grouping supports both directory-based article bundles and standalone Markdown files.
- Best-version detection prefers enriched Chinese Markdown, then translations, then original Markdown.
- Article library source folders are configurable from the plugin settings.
- Unified dark interface for both the reader and article library.
- Softer low-glare dark palette and aligned three-column library layout.
- Dynamic highlights based on saved reading notes.
- Image annotations: right-click an image in the reader to save a thought and jump back to it later.
- Right-side annotation sidebar.
- Sidebar filters, collapse mode, and unlocated-record hints.
- Hotkeys work in both Markdown files and the custom reader view.
- Hover card for saved thoughts.
- Click sidebar cards to jump back to the highlighted passage.
- Capture selected text with a note.
- Capture a free thought without selecting text.
- Record types:
  - 普通想法
  - 可写选题
  - 事实待核查
- Central reading-note storage, defaulting to `Reading Capture/notes`.
- Machine-readable `.reading-index.json`.

## Configuration

After enabling the plugin, open the Reading Capture settings:

- `阅读笔记根目录`: where reading notes, the inbox, and the machine-readable index are stored. The default is `Reading Capture/notes`.
- `知见录扫描目录`: article folders to scan. Add one vault-relative folder per line, such as `Articles`, `Reading`, or any folder where you keep saved Markdown/PDF reading material.
- `知见录排除目录`: folders to skip while building the article library. The reading-note root and `.obsidian` are excluded by default.

## Installation

Copy the plugin files into your Obsidian vault:

```text
<vault>/.obsidian/plugins/reading-capture/
├── main.js
├── reading-core.js
├── manifest.json
└── styles.css
```

Then enable `Reading Capture` from Obsidian's Community plugins settings.

You can also build a local install package:

```bash
npm run package
```

This creates `dist/reading-capture/` and, when the local `zip` command is available, `dist/reading-capture.zip`.

## Commands

- `Reading Capture: 打开阅读器视图`
- `Reading Capture: 打开知见录`
- `Reading Capture: 标注选中文本并记录想法`
- `Reading Capture: 快速高亮选中文本`
- `Reading Capture: 记录当前想法`
- `Reading Capture: 加入可写选题`
- `Reading Capture: 加入事实待核查`
- `Reading Capture: 打开当前文件的阅读记录`
- `Reading Capture: 标记当前阅读为已完成`
- `Reading Capture: 重建阅读索引`

## Development

Run checks:

```bash
npm test
```

Build a release package:

```bash
npm run package
```

Run the full release check:

```bash
npm run release:check
```

The plugin currently has no compile step. The source files in `plugin/` are copied into the Obsidian plugin directory or release package.

## Release Notes

- Keep `package.json`, `plugin/manifest.json`, and `versions.json` in sync.
- GitHub release attachments should include the runtime files from `plugin/`: `manifest.json`, `main.js`, `styles.css`, and `reading-core.js`.
- Obsidian's sample plugin documents `versions.json` as `"plugin-version": "minimum-obsidian-version"` and release attachments as `manifest.json`, `main.js`, and `styles.css`; Reading Capture also needs `reading-core.js` because `main.js` imports it.

## License

Apache License 2.0. See [LICENSE](LICENSE).
