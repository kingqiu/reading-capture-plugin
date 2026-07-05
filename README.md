# Reading Capture

[简体中文](README.zh-CN.md) | English

Reading Capture is an Obsidian plugin for people who save articles, read deeply, and turn reading into notes, creative ideas, and follow-up tasks.

It gives you a focused reading space inside Obsidian, a library view for browsing saved articles, and a separate reading record for highlights, thoughts, creative ideas, and fact-check items.

Version: `0.4.3`

## What You Can Do

- Browse saved articles in the `知见录` article library.
- Open Markdown articles in a cleaner reading view.
- Open PDFs from the same article group when they are available.
- Highlight passages and save your thoughts without turning the original article into a messy note.
- Save three kinds of reading records:
  - general thoughts
  - creative ideas
  - facts or claims to check later
- View all records for an article in a dedicated reading-record page.
- Jump from a saved record back to the original article position when the plugin can locate it.
- Copy article paths, quotes, and thoughts when you need to reuse them.

## Screenshots

The screenshots below are layout-matched anonymous demo images. They show the current product flow without exposing any real vault content.

### Article Library

Browse saved articles, reading status, file versions, highlights, and creative ideas in one place.

![Article library preview](docs/assets/screenshots/library.svg)

### Reader And Capture

Read in a quieter view and save highlights, thoughts, creative ideas, and fact-check items.

![Reader preview](docs/assets/screenshots/reader.svg)

### Reading Records

Review all saved records for one article, copy useful material, or jump back to the original article.

![Reading record preview](docs/assets/screenshots/record.svg)

### Install And Settings

For manual installation, the plugin folder should directly contain `main.js`, `manifest.json`, `styles.css`, and `reading-core.js`.

![Install and settings preview](docs/assets/screenshots/settings.svg)

## Installation

This plugin is currently meant for manual installation from GitHub. It is not yet published in the official Obsidian community plugin directory.

1. Download `reading-capture.zip` from the latest GitHub Release.
2. Unzip it.
3. Put the unzipped `reading-capture` folder into your Obsidian vault:

```text
Your Vault/
└── .obsidian/
    └── plugins/
        └── reading-capture/
            ├── main.js
            ├── reading-core.js
            ├── manifest.json
            └── styles.css
```

4. Open Obsidian.
5. Go to `Settings` -> `Community plugins`.
6. Make sure community plugins are enabled.
7. Find and enable `Reading Capture`.

If Obsidian was already open while you copied the files, reload Obsidian or disable and re-enable the plugin.

## Updating

To update a manual installation:

1. Download the newest `reading-capture.zip`.
2. Unzip it.
3. Replace the old plugin files in:

```text
Your Vault/.obsidian/plugins/reading-capture/
```

4. Restart Obsidian, or disable and re-enable the plugin.

Your reading records are stored in your vault as Markdown files. Replacing the plugin files should not delete your reading records.

## Manual Install Troubleshooting

### Reading Capture does not appear in Obsidian

Check the folder location first. The final folder should be:

```text
Your Vault/.obsidian/plugins/reading-capture/
```

Inside that folder, you should directly see `main.js`, `manifest.json`, `styles.css`, and `reading-core.js`.

If you see this instead, the folder is nested one level too deep:

```text
reading-capture/
└── reading-capture/
    ├── main.js
    ├── manifest.json
    └── styles.css
```

Move the inner `reading-capture` folder into `.obsidian/plugins/`.

### The GitHub source code zip does not work

Download `reading-capture.zip` from the GitHub Release page. Do not use GitHub's `Source code.zip` for normal installation. The source archive is meant for development and is not the ready-to-install plugin package.

### The old interface still appears after updating

Restart Obsidian, or disable and re-enable Reading Capture from `Settings` -> `Community plugins`.

## First-Time Setup

After enabling the plugin, open `Settings` -> `Reading Capture`.

The most important setting is `知见录扫描目录`. Add the folders where you keep saved articles.

Examples:

```text
Articles
Reading
Saved Articles
Research Notes
```

Use paths relative to your Obsidian vault. For example, if an article is here:

```text
Your Vault/Saved Articles/example/article.md
```

then you can add:

```text
Saved Articles
```

After setting the scan folders, run `Reading Capture: 打开知见录` from the Obsidian command palette.

## Main Settings

### 阅读笔记根目录

This is where Reading Capture saves your reading records.

Default:

```text
Reading Capture/notes
```

You usually do not need to change this unless you want the records to live in a different folder.

### 知见录扫描目录

These are the folders that the article library scans.

Add one folder per line. The plugin will look for Markdown and PDF files inside these folders.

### 知见录排除目录

These folders are ignored while scanning.

The plugin already skips the reading-record folder and Obsidian's own `.obsidian` folder. You can add more folders if you have archives, drafts, or temporary files that should not appear in the article library.

## Daily Use

### Open the Article Library

Run:

```text
Reading Capture: 打开知见录
```

The library shows your article groups, their reading status, available files, and saved reading signals.

### Open an Article

In `知见录`, click `阅读` or `打开最佳版本`.

When several versions exist, Reading Capture tries to choose the most useful Markdown version first. If there is only one Markdown file, it can still open that file as a single article.

### Save a Highlight or Thought

In the reader view:

1. Select a passage.
2. Right-click, or use the Reading Capture command.
3. Choose the record type and write your thought.

You can also save a thought without selecting text by using `记录当前想法`.

### Save a Creative Idea

Use `加入创作灵感` when a passage or thought might become a future article, research question, or creative work.

### Save a Fact-Check Item

Use `加入事实待核查` when something sounds important but needs verification later.

### View Reading Records

Click `阅读记录` from the article detail panel or from the reader sidebar.

The reading-record page lets you:

- browse records by type
- read the original quote and your thought side by side
- switch between the designed record view and the original Markdown
- jump back to the original article position when possible
- copy quotes, thoughts, or the article path

## Useful Commands

Open Obsidian's command palette and search for `Reading Capture`.

Common commands:

- `Reading Capture: 打开知见录`
- `Reading Capture: 打开创作灵感`
- `Reading Capture: 打开阅读器视图`
- `Reading Capture: 标注选中文本并记录想法`
- `Reading Capture: 快速高亮选中文本`
- `Reading Capture: 记录当前想法`
- `Reading Capture: 加入创作灵感`
- `Reading Capture: 加入事实待核查`
- `Reading Capture: 打开当前文件的阅读记录`
- `Reading Capture: 标记当前阅读为已完成`
- `Reading Capture: 重建阅读索引`

## Notes and Limitations

- Reading Capture works inside your Obsidian vault.
- The plugin does not send your notes or articles to an online service.
- AI topic mining is not built into this plugin and is not required. `创作灵感` only uses ideas you save manually while reading. If you use external AI workflows later, they can read the structured Markdown records.
- Jumping back to the exact original position works best when the quoted text still exists in the article.
- If you move article files after capturing records, you may need to rebuild the index or update paths.

## License

Apache License 2.0. See [LICENSE](LICENSE).
