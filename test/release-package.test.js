const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const runtimeFiles = ["main.js", "manifest.json", "styles.css", "reading-core.js", "creation-workflow.js", "skill-registry.js", "skill-runner.js", "skill-manager.js"];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function testReleaseMetadata() {
  const manifest = readJson("plugin/manifest.json");
  const packageJson = readJson("package.json");
  const versions = readJson("versions.json");

  assert.strictEqual(packageJson.version, manifest.version);
  assert.strictEqual(versions[manifest.version], manifest.minAppVersion);
  assert.strictEqual(packageJson.scripts.package, "node scripts/package-plugin.js");
  assert.strictEqual(packageJson.scripts["release:check"], "npm test && npm run package && node test/release-package.test.js");
}

function testPackageScriptDeclaresRuntimeFiles() {
  const script = fs.readFileSync(path.join(root, "scripts/package-plugin.js"), "utf8");

  for (const fileName of runtimeFiles) {
    assert.match(script, new RegExp(JSON.stringify(fileName).slice(1, -1)));
  }
}

function testPackagedRuntimeFilesExist() {
  const packageDir = path.join(root, "dist/reading-capture");
  assert.ok(fs.existsSync(packageDir), "dist/reading-capture should exist after packaging");

  for (const fileName of runtimeFiles) {
    const filePath = path.join(packageDir, fileName);
    assert.ok(fs.existsSync(filePath), `dist package should include ${fileName}`);
    assert.ok(fs.statSync(filePath).size > 0, `${fileName} should not be empty`);
  }

  const manifest = readJson("plugin/manifest.json");
  const packagedManifest = JSON.parse(fs.readFileSync(path.join(packageDir, "manifest.json"), "utf8"));
  assert.strictEqual(packagedManifest.id, manifest.id);
  assert.strictEqual(packagedManifest.version, manifest.version);
}

function testZipUsesExpectedFolderStructure() {
  const zipPath = path.join(root, "dist/reading-capture.zip");
  assert.ok(fs.existsSync(zipPath), "dist/reading-capture.zip should exist after packaging");
  assert.ok(fs.statSync(zipPath).size > 0, "release zip should not be empty");

  let entries;
  try {
    entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (error) {
    throw new Error("Could not inspect release zip. Make sure the unzip command is available.");
  }

  assert.ok(entries.length > 0, "release zip should contain files");
  for (const entry of entries) {
    assert.match(entry, /^reading-capture\//, `zip entry should live under reading-capture/: ${entry}`);
    assert.doesNotMatch(entry, /^reading-capture\/reading-capture\//, "zip should not contain a nested reading-capture folder");
    assert.doesNotMatch(entry, /^dist\//, "zip should not include the dist folder itself");
  }
  for (const fileName of runtimeFiles) {
    assert.ok(entries.includes(`reading-capture/${fileName}`), `zip should include reading-capture/${fileName}`);
  }
}

function testPackagedMainIsBundled() {
  const packagedMainPath = path.join(root, "dist/reading-capture/main.js");
  if (!fs.existsSync(packagedMainPath)) return;
  const packagedMain = fs.readFileSync(packagedMainPath, "utf8");

  assert.doesNotMatch(packagedMain, /require\(["']\.\/reading-core["']\)/);
  assert.doesNotMatch(packagedMain, /require\(["']\.\/creation-workflow["']\)/);
  assert.doesNotMatch(packagedMain, /require\(["']\.\/skill-registry["']\)/);
  assert.match(packagedMain, /const core = \(\(\) =>/);
  assert.match(packagedMain, /const creationWorkflow = \(\(\) =>/);
  assert.match(packagedMain, /const skillRegistry = \(\(\) =>/);
}

function testLibraryFiltersCanScroll() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const rule = styles.match(/\.reading-capture-library-filters\s*\{(?<body>[^}]+)\}/);
  assert.ok(rule, "library filters should have a dedicated CSS rule");
  assert.match(rule.groups.body, /max-height:\s*calc\(100vh - \d+px\)/);
  assert.match(rule.groups.body, /overflow-y:\s*auto/);
}

function testReaderToolbarIsIntegratedWithWorkspace() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const rule = styles.match(/\.reading-capture-reader-toolbar\s*\{(?<body>[^}]+)\}/);
  assert.ok(rule, "reader toolbar should have a dedicated CSS rule");
  assert.match(rule.groups.body, /background:\s*transparent/);
  assert.match(rule.groups.body, /border:\s*0/);
  assert.match(rule.groups.body, /position:\s*static/);
  assert.match(rule.groups.body, /width:\s*100%/);
}

function testReaderUsesFixedWorkspaceWithIndependentScrollAreas() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const readerRule = styles.match(/\.reading-capture-reader\s*\{(?<body>[^}]+)\}/);
  assert.ok(readerRule, "reader should have a dedicated layout rule");
  assert.match(readerRule.groups.body, /display:\s*flex/);
  assert.match(readerRule.groups.body, /flex-direction:\s*column/);
  assert.match(readerRule.groups.body, /overflow:\s*hidden/);

  const workspaceRule = styles.match(/\.reading-capture-reader-workspace\s*\{(?<body>[^}]+)\}/);
  assert.ok(workspaceRule, "reader workspace should have a dedicated layout rule");
  assert.match(workspaceRule.groups.body, /flex:\s*1 1 auto/);
  assert.match(workspaceRule.groups.body, /min-height:\s*0/);
  assert.match(workspaceRule.groups.body, /overflow:\s*hidden/);

  const bodyRule = styles.match(/\.reading-capture-reader \.reading-capture-reader-body\.markdown-preview-view\s*\{(?<body>[^}]+)\}/);
  assert.ok(bodyRule, "reader body should be independently scrollable");
  assert.match(bodyRule.groups.body, /height:\s*100%/);
  assert.match(bodyRule.groups.body, /overflow-y:\s*auto/);

  const sidebarRule = styles.match(/\.reading-capture-reader-sidebar\s*\{(?<body>[^}]+)\}/);
  assert.ok(sidebarRule, "reader sidebar should be independently scrollable");
  assert.match(sidebarRule.groups.body, /height:\s*100%/);
  assert.match(sidebarRule.groups.body, /max-height:\s*none/);
  assert.match(sidebarRule.groups.body, /overflow-y:\s*auto/);
}

function testReaderMatchesApprovedTwoPaneDesignStructure() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");

  assert.match(main, /reading-capture-reader-workspace/);
  assert.match(main, /reading-capture-reader-main/);
  assert.match(main, /reading-capture-reader-footer/);

  const workspaceRule = styles.match(/\.reading-capture-reader-workspace\s*\{(?<body>[^}]+)\}/);
  assert.ok(workspaceRule, "reader workspace should define the approved two-pane layout");
  assert.match(workspaceRule.groups.body, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(320px,\s*360px\)/);
  assert.match(workspaceRule.groups.body, /overflow:\s*hidden/);

  const mainRule = styles.match(/\.reading-capture-reader-main\s*\{(?<body>[^}]+)\}/);
  assert.ok(mainRule, "reader main pane should be a fixed column");
  assert.match(mainRule.groups.body, /display:\s*flex/);
  assert.match(mainRule.groups.body, /flex-direction:\s*column/);
  assert.match(mainRule.groups.body, /min-height:\s*0/);

  const articleRule = styles.match(/\.reading-capture-reader-article-panel\s*\{(?<body>[^}]+)\}/);
  assert.ok(articleRule, "reader article panel should have a dedicated rule");
  assert.match(articleRule.groups.body, /border:\s*0/);
  assert.match(articleRule.groups.body, /background:\s*transparent/);

  const footerRule = styles.match(/\.reading-capture-reader-footer\s*\{(?<body>[^}]+)\}/);
  assert.ok(footerRule, "reader should have a fixed bottom progress bar");
  assert.match(footerRule.groups.body, /flex:\s*0 0 auto/);
}

function testReaderAnnotationTypesUseSharedPalette() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");

  assert.match(main, /reading-capture-sidebar-card \$\{typeClass\}/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-thought/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-topic/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-fact/);
  assert.match(styles, /\.reading-capture-sidebar-card\.is-image/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-blue\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-mint\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-amber\)/);
  assert.match(styles, /--rc-annotation:\s*var\(--rc-slate\)/);
  assert.match(styles, /border-left:\s*2px solid var\(--rc-annotation-border\)/);
}

function testTopicPoolUsesOneClearSelectionState() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const cardRule = styles.match(/\.reading-capture-topic-card\s*\{(?<body>[^}]+)\}/);
  const manualRule = styles.match(/\.reading-capture-topic-card\.is-manual\s*\{(?<body>[^}]+)\}/);
  const selectedRule = styles.match(/\.reading-capture-topic-card\.is-selected\s*\{(?<body>[^}]+)\}/);

  assert.ok(cardRule && manualRule && selectedRule, "topic cards should define default, manual, and selected styles");
  assert.match(cardRule.groups.body, /border-left:\s*3px solid rgba\(82, 128, 255, 0\.85\)/);
  assert.match(manualRule.groups.body, /border-left-color:\s*rgba\(82, 128, 255, 0\.85\)/);
  assert.match(selectedRule.groups.body, /border-color:\s*rgba\(83, 196, 111, 0\.8\)/);
  assert.match(selectedRule.groups.body, /border-left-color:\s*var\(--rc-mint\)/);
  assert.doesNotMatch(selectedRule.groups.body, /background:/);
}

function testCreationProjectUsesCompactProjectSwitcher() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");
  const rootRules = [...styles.matchAll(/\.reading-capture-creation-projects\s*\{(?<body>[^}]+)\}/g)];
  const rootRule = rootRules.find((rule) => /--rc-creation-green:/.test(rule.groups.body));
  const shellRule = styles.match(/\.reading-capture-creation-shell\s*\{(?<body>[^}]+)\}/);
  const workspaceRule = styles.match(/\.reading-capture-creation-workspace\s*\{(?<body>[^}]+)\}/);
  const listRule = styles.match(/\.reading-capture-creation-list\s*\{(?<body>[^}]+)\}/);
  const pickerRule = styles.match(/\.reading-capture-creation-picker\s*\{(?<body>[^}]+)\}/);
  const optionsRule = styles.match(/\.reading-capture-creation-options\s*\{(?<body>[^}]+)\}/);
  const detailRules = [...styles.matchAll(/\.reading-capture-creation-detail\s*\{(?<body>[^}]+)\}/g)];
  const detailRule = detailRules.find((rule) => /height:\s*100%/.test(rule.groups.body));
  const cardRule = styles.match(/\.reading-capture-creation-card\s*\{(?<body>[^}]+)\}/);
  const selectedRule = styles.match(/\.reading-capture-creation-card\.is-selected\s*\{(?<body>[^}]+)\}/);

  assert.ok(rootRule && shellRule && workspaceRule && listRule && pickerRule && optionsRule && detailRule && cardRule && selectedRule, "creation project view should define its searchable switcher and card states");
  assert.match(rootRule.groups.body, /overflow:\s*hidden/);
  assert.match(shellRule.groups.body, /display:\s*flex/);
  assert.match(shellRule.groups.body, /height:\s*100%/);
  assert.match(shellRule.groups.body, /min-height:\s*0/);
  assert.match(workspaceRule.groups.body, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(workspaceRule.groups.body, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(workspaceRule.groups.body, /overflow:\s*visible/);
  assert.match(listRule.groups.body, /grid-template-columns:\s*176px minmax\(0,\s*1fr\)/);
  assert.match(listRule.groups.body, /position:\s*relative/);
  assert.match(pickerRule.groups.body, /position:\s*absolute/);
  assert.match(optionsRule.groups.body, /max-height:\s*330px/);
  assert.match(optionsRule.groups.body, /overflow-y:\s*auto/);
  assert.match(detailRule.groups.body, /height:\s*100%/);
  assert.match(detailRule.groups.body, /overflow-y:\s*auto/);
  assert.match(cardRule.groups.body, /border-left:\s*3px solid rgba\(var\(--rc-blue-rgb\),\s*0\.72\)/);
  assert.match(selectedRule.groups.body, /border-left-color:\s*var\(--rc-creation-green\)/);
  assert.match(main, /reading-capture-creation-list-head/);
  assert.match(main, /reading-capture-creation-current/);
  assert.match(main, /搜索项目标题/);
  assert.match(main, /is-filtered-out/);
  assert.match(main, /reading-capture-creation-card-meta/);
  assert.match(main, /reading-capture-creation-context/);
  assert.match(main, /reading-capture-creation-actions/);
}

function testCreationWorkbenchMatchesApprovedCoreGeometry() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const workspace = styles.match(/\.reading-capture-creation-stage-workspace\s*\{(?<body>[^}]+)\}/);
  const navigation = styles.match(/\.reading-capture-creation-stage-nav\s*\{(?<body>[^}]+)\}/);
  const canvas = styles.match(/\.reading-capture-creation-canvas\s*\{(?<body>[^}]+)\}/);
  const hero = styles.match(/\.reading-capture-creation-hero\s*\{(?<body>[^}]+)\}/);
  const screen = styles.match(/\.reading-capture-creation-screen\s*\{(?<body>[^}]+)\}/);
  const entries = styles.match(/\.reading-capture-creation-entry-choice\s*\{(?<body>[^}]+)\}/);
  const pickerOptions = styles.match(/\.reading-capture-creation-project-options\s*\{(?<body>[^}]+)\}/);

  assert.ok(workspace && navigation && canvas && hero && screen && entries && pickerOptions, "approved workbench geometry should have dedicated rules");
  assert.match(workspace.groups.body, /grid-template-columns:\s*224px minmax\(0,\s*1fr\)/);
  assert.match(navigation.groups.body, /overflow:\s*auto/);
  assert.match(canvas.groups.body, /overflow:\s*auto/);
  assert.match(hero.groups.body, /padding:\s*10px 16px/);
  assert.match(hero.groups.body, /min-height:\s*72px/);
  assert.match(screen.groups.body, /padding:\s*22px 28px 28px/);
  assert.match(entries.groups.body, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(pickerOptions.groups.body, /max-height:\s*330px/);
  assert.match(pickerOptions.groups.body, /overflow-y:\s*auto/);
}

function testCreationWorkbenchKeepsTopChromeCompactAndStagesSeparated() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const shell = styles.match(/\.reading-capture-creation-workbench \.reading-capture-creation-shell\s*\{(?<body>[^}]+)\}/);
  const projectSwitch = styles.match(/\.reading-capture-creation-project-switch\s*\{(?<body>[^}]+)\}/);
  const currentProject = styles.match(/\.reading-capture-creation-current-project\s*\{(?<body>[^}]+)\}/);
  const stage = styles.match(/\.reading-capture-creation-stage\s*\{(?<body>[^}]+)\}/);

  assert.ok(shell && projectSwitch && currentProject && stage, "workbench compact layout rules should be present");
  assert.match(shell.groups.body, /gap:\s*10px/);
  assert.match(projectSwitch.groups.body, /padding:\s*8px 12px/);
  assert.match(currentProject.groups.body, /padding:\s*6px 10px/);
  assert.match(stage.groups.body, /margin-block:\s*12px/);

  const checkbox = styles.match(/\.reading-capture-creation-workbench input\[type="checkbox"\]\s*\{(?<body>[^}]+)\}/);
  assert.ok(checkbox, "workbench checkboxes should have a dedicated compact control rule");
  assert.match(checkbox.groups.body, /width:\s*18px/);
  assert.match(checkbox.groups.body, /height:\s*18px/);
}

function testCreationPublicationReviewUsesWorkbenchModalSkin() {
  const styles = fs.readFileSync(path.join(root, "plugin/styles.css"), "utf8");
  const shell = styles.match(/\.reading-capture-modal-shell\.reading-capture-publication-review-shell\s*\{(?<body>[^}]+)\}/);
  const modal = [...styles.matchAll(/\.reading-capture-publication-review-modal\s*\{(?<body>[^}]+)\}/g)].find((rule) => /padding:\s*24px/.test(rule.groups.body));
  const controls = styles.match(/\.reading-capture-publication-review-modal input,\s*\.reading-capture-publication-review-modal select,\s*\.reading-capture-publication-review-modal textarea\s*\{(?<body>[^}]+)\}/);
  const cta = styles.match(/\.reading-capture-publication-review-modal button\.mod-cta\s*\{(?<body>[^}]+)\}/);

  assert.ok(shell && modal && controls && cta, "publication review modal should have dedicated visual rules");
  assert.match(shell.groups.body, /--rc-workbench-green:\s*#62c96f/);
  assert.match(shell.groups.body, /background:\s*#0b120d/);
  assert.match(modal.groups.body, /padding:\s*24px/);
  assert.match(controls.groups.body, /background:\s*#09100b/);
  assert.match(controls.groups.body, /border-radius:\s*7px/);
  assert.match(cta.groups.body, /background:\s*var\(--rc-workbench-green\)/);
}

function testDiagnosticReportCommandExists() {
  const main = fs.readFileSync(path.join(root, "plugin/main.js"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

  assert.match(main, /DIAGNOSTIC_LOG_PATH\s*=\s*"Reading Capture\/diagnostics\/diagnostic-log\.md"/);
  assert.match(main, /DIAGNOSTIC_REPORT_PATH\s*=\s*"Reading Capture\/diagnostics\/diagnostic-report\.md"/);
  assert.match(main, /id:\s*"export-diagnostic-report"/);
  assert.match(main, /name:\s*"导出诊断日志"/);
  assert.match(main, /plugin-load-complete/);
  assert.match(main, /window-error/);
  assert.match(readme, /Reading Capture: 导出诊断日志/);
  assert.match(readme, /Reading Capture\/diagnostics\/diagnostic-report\.md/);
}

function testGenericMainBranchRemainsFreeOfPersonalWorkflowRuntime() {
  let genericMain;
  let genericPackageScript;
  try {
    genericMain = execFileSync("git", ["show", "main:plugin/main.js"], { cwd: root, encoding: "utf8" });
    genericPackageScript = execFileSync("git", ["show", "main:scripts/package-plugin.js"], { cwd: root, encoding: "utf8" });
  } catch (error) {
    throw new Error("Cannot verify generic isolation because the local main branch is unavailable");
  }
  for (const forbidden of [
    "CREATION_PROJECT_VIEW_TYPE",
    "ReadingCaptureCreationProjectView",
    "creation-projects",
    "skill-runner.js",
    "keke-social-card-skill",
    "liangkeban-xiaoxiaoke-illustrations",
  ]) {
    assert.ok(!genericMain.includes(forbidden), `generic main branch must not contain personal runtime marker: ${forbidden}`);
  }
  assert.doesNotMatch(genericPackageScript, /creation-workflow\.js|skill-runner\.js|skill-manager\.js|skill-registry\.js/, "generic package runtime list must not ship the personal workflow, Runner, or managed Skill runtime");
}

function testApprovedCreationPrototypeBaselineIsFrozen() {
  const baselineRoot = path.join(root, "docs/personal-creation-workflow/baseline");
  const manifestPath = path.join(baselineRoot, "baseline-manifest.json");
  assert.ok(fs.existsSync(manifestPath), "approved prototype baseline needs a versioned manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepStrictEqual(manifest.viewport, { width: 1105, height: 768 });
  assert.strictEqual(Object.keys(manifest.files).length, 10);
  for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
    const filePath = path.join(baselineRoot, fileName);
    assert.ok(fs.existsSync(filePath), `missing frozen baseline file: ${fileName}`);
    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    assert.strictEqual(actualHash, expectedHash, `approved baseline changed without updating its fingerprint: ${fileName}`);
  }
}

testReleaseMetadata();
testPackageScriptDeclaresRuntimeFiles();
testPackagedRuntimeFilesExist();
testZipUsesExpectedFolderStructure();
testPackagedMainIsBundled();
testLibraryFiltersCanScroll();
testReaderToolbarIsIntegratedWithWorkspace();
testReaderUsesFixedWorkspaceWithIndependentScrollAreas();
testReaderMatchesApprovedTwoPaneDesignStructure();
testReaderAnnotationTypesUseSharedPalette();
testTopicPoolUsesOneClearSelectionState();
testCreationWorkbenchMatchesApprovedCoreGeometry();
testCreationWorkbenchKeepsTopChromeCompactAndStagesSeparated();
testCreationPublicationReviewUsesWorkbenchModalSkin();
testDiagnosticReportCommandExists();
testGenericMainBranchRemainsFreeOfPersonalWorkflowRuntime();
testApprovedCreationPrototypeBaselineIsFrozen();

console.log("release package tests passed");
