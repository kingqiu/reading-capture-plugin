# Reading Capture

Reading Capture is an Obsidian plugin for immersive article reading, lightweight highlighting, and structured reading-note capture.

It is designed for a Codex/OpenClaw-assisted writing workflow:

- Read saved Markdown articles in a dedicated reader view.
- Highlight passages without modifying the original Markdown file.
- Capture thoughts, writing topics, and fact-check items into a central reading-notes protocol.
- Reopen an article and see saved highlights, hover notes, and a right-side annotation panel.
- Let Codex or other agent tools later summarize notes and transform them into WeChat, Xiaohongshu, or video scripts.

## Current Status

Version: `0.2.1`

This is a personal workflow plugin under active development.

## Features

- Dedicated `Reading Capture Reader` view.
- Paper-like research-magazine reading style.
- Dynamic highlights based on saved reading notes.
- Image annotations: right-click an image in the reader to save a thought and jump back to it later.
- Right-side annotation sidebar.
- Sidebar filters, collapse mode, and unlocated-record hints.
- Hover card for saved thoughts.
- Click sidebar cards to jump back to the highlighted passage.
- Capture selected text with a note.
- Capture a free thought without selecting text.
- Record types:
  - 普通想法
  - 可写选题
  - 事实待核查
- Central reading-note storage under `Learning/reading-notes`.
- Machine-readable `.reading-index.json`.

## Installation

Copy the plugin files into your Obsidian vault:

```text
<vault>/.obsidian/plugins/reading-capture/
├── main.js
├── manifest.json
└── styles.css
```

Then enable `Reading Capture` from Obsidian's Community plugins settings.

## Commands

- `Reading Capture: 打开阅读器视图`
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

The plugin currently has no runtime build step. The source files in `plugin/` are the files copied into the Obsidian plugin directory.
