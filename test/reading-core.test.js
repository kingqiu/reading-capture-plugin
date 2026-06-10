const assert = require("assert");
const {
  buildSourceMetadata,
  buildReadingNotePath,
  createEmptyIndex,
  upsertIndexEntry,
  buildAnnotationBlock,
  wrapMarkdownHighlight,
  cleanSelectedText,
} = require("../plugin/reading-core");

const fixedNow = "2026-06-10T21:30:00+08:00";

function testBuildReadingNotePath() {
  const source = buildSourceMetadata({
    vaultPath:
      "Learning/web/x_articles/20260421_rywiggs_Creating a Second Brain with Claude Code/article.md",
    title: "Creating a Second Brain with Claude Code",
    stat: { mtime: 1781098200000, size: 12345 },
    now: fixedNow,
  });

  assert.strictEqual(source.source_root, "Learning/web/x_articles");
  assert.strictEqual(source.source_kind, "markdown");
  assert.match(source.source_id, /^[a-f0-9]{8}$/);

  const notePath = buildReadingNotePath({
    source,
    readingRoot: "Learning/reading-notes",
    now: fixedNow,
  });

  assert.match(
    notePath,
    /^Learning\/reading-notes\/2026\/06\/20260610_x_articles_Creating-a-Second-Brain-with-Claude-Code_[a-f0-9]{8}\.md$/
  );
}

function testUpsertIndexEntry() {
  const source = buildSourceMetadata({
    vaultPath: "Learning/research/Anthropic_Dynamic_Workflows_深度调研报告_2026-05-29.md",
    title: "Anthropic Dynamic Workflows 深度调研报告",
    stat: { mtime: 1781098200000, size: 22222 },
    now: fixedNow,
  });
  const notePath = buildReadingNotePath({
    source,
    readingRoot: "Learning/reading-notes",
    now: fixedNow,
  });
  const index = createEmptyIndex(fixedNow);

  upsertIndexEntry(index, {
    source,
    readingNotePath: notePath,
    annotationCount: 2,
    status: "reading",
    codexStatus: "pending_summary",
    captureSource: "obsidian-plugin",
    now: fixedNow,
  });

  const entry = index.sources[source.source_vault_path];
  assert.strictEqual(entry.reading_note_path, notePath);
  assert.strictEqual(entry.annotation_count, 2);
  assert.strictEqual(index.aliases[source.source_id], source.source_vault_path);
}

function testBuildAnnotationBlock() {
  const block = buildAnnotationBlock({
    selectedText: "Agent 的关键不是模型，而是稳定的执行环境。",
    note: "这个角度可以延展成一篇公众号文章。",
    type: "highlight-with-note",
    captureSource: "obsidian-plugin",
    now: fixedNow,
  });

  assert.match(block, /### ann_20260610_213000_[a-f0-9]{4}/);
  assert.match(block, /capture_source: obsidian-plugin/);
  assert.match(block, /type: highlight-with-note/);
  assert.match(block, /> Agent 的关键不是模型，而是稳定的执行环境。/);
  assert.match(block, /我的想法：\n这个角度可以延展成一篇公众号文章。/);
}

function testWrapMarkdownHighlight() {
  assert.strictEqual(wrapMarkdownHighlight("important idea"), "==important idea==");
  assert.strictEqual(wrapMarkdownHighlight("==important idea=="), "==important idea==");
  assert.strictEqual(cleanSelectedText("==important idea=="), "important idea");
  assert.strictEqual(cleanSelectedText("important idea=="), "important idea");
}

function testBuildAnnotationBlockCleansHighlightMarkers() {
  const block = buildAnnotationBlock({
    selectedText: "==important idea==",
    note: "keep this clean",
    type: "highlight-with-note",
    captureSource: "obsidian-plugin",
    now: fixedNow,
  });

  assert.match(block, /> important idea/);
  assert.doesNotMatch(block, /> ==important idea==/);
}

testBuildReadingNotePath();
testUpsertIndexEntry();
testBuildAnnotationBlock();
testWrapMarkdownHighlight();
testBuildAnnotationBlockCleansHighlightMarkers();

console.log("reading-core tests passed");
