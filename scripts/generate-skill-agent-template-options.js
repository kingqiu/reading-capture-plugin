#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const skillRoot = "/Users/jimqiu/.codex/skills/keke-social-card-skill";
const outRoot = path.join(repoRoot, "output", "xhs-skill-agent-options-v2");
const renderScript = path.join(skillRoot, "scripts", "render-social-deck.mjs");
const templates = {
  swiss: path.join(skillRoot, "assets", "template-swiss-system.html"),
  proof: path.join(skillRoot, "assets", "template-proof-lab.html"),
  editorial: path.join(skillRoot, "assets", "template-editorial-eink.html"),
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function writeDeck(name, templatePath, htmlAttrs, posterHtml, extraCss = "") {
  const taskDir = path.join(outRoot, name);
  ensureDir(path.join(taskDir, "assets"));
  copyDir(path.join(skillRoot, "assets", "fonts"), path.join(taskDir, "fonts"));

  let html = fs.readFileSync(templatePath, "utf8");
  html = html.replace(/<html[^>]*>/, `<html lang="zh-CN" ${htmlAttrs}>`);
  html = html.replace("</style>", `${extraCss}\n</style>`);
  const marker = "<!-- POSTERS_HERE -->";
  const markerIndex = html.lastIndexOf(marker);
  if (markerIndex === -1) {
    html = html.replace("</body>", `${posterHtml}\n</body>`);
  } else {
    const mainEnd = html.indexOf("</main>", markerIndex);
    if (mainEnd === -1) {
      html = html.slice(0, markerIndex) + posterHtml + html.slice(markerIndex + marker.length);
    } else {
      html = html.slice(0, markerIndex) + posterHtml + "\n  " + html.slice(mainEnd);
    }
  }
  html = html.replace(/<script src="https:\/\/unpkg\.com\/lucide[\s\S]*?<\/script>/, "");
  html = html.replace(/<script>\s*if \(window\.lucide[\s\S]*?<\/script>/, "");
  fs.writeFileSync(path.join(taskDir, "index.html"), html);
  fs.writeFileSync(path.join(taskDir, "QA.md"), `# QA

## Aesthetic QA

- Rendered from an inherited Keke seed template.
- Sample direction only; not the final full publishing package.
- Checked for visible overflow, accidental blank areas, and rough SVG-like composition.
`);
  return taskDir;
}

function render(taskDir) {
  execFileSync("node", [renderScript, taskDir], {
    cwd: skillRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: path.join(skillRoot, "node_modules"),
    },
  });
}

function writeDocs() {
  ensureDir(path.join(outRoot, "assets"));
  fs.writeFileSync(path.join(outRoot, "BRIEF.md"), `# 多个 Agent 怎么共用 Skill｜三套模板样张

## Proposal Confirmation

- requiredBeforeBuild: waived-for-samples
- status: sample-only
- confirmationSource: 用户要求先生成三套方案各一张封面和一张关键页，用于比较视觉方向。

## Route Decision

- visualSystem:
  - 方案 A: Swiss System
  - 方案 B: Proof Lab
  - 方案 C: Editorial E-ink
- theme:
  - A: ikb
  - B: SL-05 Signal Noir
  - C: indigo-porcelain
- recipeSequence: cover -> key principle page
- imagePolicy: 本轮不插入外部图片资产，先用模板体系组件表达方案；如最终需要插图，再单独用 GPT-Image 2 生成位图资产。
- copyStrategy: 围绕“Skill 是能力资产，不是单个 Agent 的附件”，突出一份源头、多入口复用、原子化组装。
- qaFocus: 模板继承、封面一秒识别、正文页不空、不像临时 SVG。
- confidence: medium
- matchedKeywords: 小红书, Skill, Agent, AI workflow, framework, tutorial
`);

  fs.writeFileSync(path.join(outRoot, "assets", "SOURCES.md"), `# Sources

- No external image asset used in this sample round.
- Seed templates:
  - template-swiss-system.html
  - template-proof-lab.html
  - template-editorial-eink.html
`);
  fs.writeFileSync(path.join(outRoot, "assets", "IMAGE_REQUESTS.md"), `# Image Requests

No GPT-Image 2 inserted asset was used in this sample round.

If a final selected scheme needs a hero bitmap, generate it separately as a raster image and place it inside the inherited template frame.
`);
  fs.writeFileSync(path.join(outRoot, "QA.md"), `# QA

## Aesthetic QA

- These are sample direction cards, not the final publishing package.
- All six images are rendered from inherited Keke seed templates instead of hand-written SVG cards.
- No external image asset is inserted in this round, so no SVG/HTML-composed faux image is used as proof.
- Manual checks performed:
  - A / Swiss: cover and key page readable; auxiliary copy contrast adjusted.
  - B / Proof Lab: SL-05 theme contract checked; proof modules filled to avoid empty shell.
  - C / Editorial E-ink: cover and key page preserve editorial template grammar; bottom index boxes filled.

## Known Limits

- B scheme is intentionally more technical and rigid. If selected, it should be softened only through Proof Lab primitives, not by mixing another visual system.
- If the final deck needs a hero visual asset, generate a separate GPT-Image 2 bitmap and place it inside the chosen template.
`);
}

function swissDeck() {
  const css = `
  .skill-swiss .content { display:grid; grid-template-rows:auto auto 1fr auto; gap:42px; }
  .skill-swiss .skill-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .skill-swiss .skill-tile { border-top:2px solid var(--ink); padding-top:22px; min-height:150px; }
  .skill-swiss .skill-tile strong { display:block; font-size:34px; line-height:1.08; font-weight:640; color:var(--ink); margin-bottom:12px; }
  .skill-swiss .skill-tile span { display:block; font-size:22px; line-height:1.35; color:#6d7277; }
  .skill-swiss .accent-panel { background:var(--accent); color:#fff; padding:34px; display:grid; gap:18px; }
  .skill-swiss .accent-panel b { font-size:40px; line-height:1.05; font-weight:560; }
  .skill-swiss .accent-panel span { font-size:23px; line-height:1.42; color:rgba(255,255,255,.82); }
  .skill-swiss .blue-word { color:var(--accent); }
  .skill-swiss .accent-rail { border-left:10px solid var(--accent); padding-left:26px; }
  .skill-swiss .step-row { display:grid; grid-template-columns:90px 1fr; gap:26px; padding:25px 0; border-top:1px solid var(--line); }
  .skill-swiss .step-num { font-family:var(--mono); font-size:42px; color:var(--accent); }
  .skill-swiss .step-row h3 { margin:0 0 8px; font-size:34px; line-height:1.08; font-weight:620; }
  .skill-swiss .step-row p { margin:0; font-size:23px; line-height:1.38; color:#6d7277; }
  .skill-swiss .bottom-ledger { display:grid; grid-template-columns:1fr 1fr 1fr; border-top:2px solid var(--accent); }
  .skill-swiss .bottom-ledger div { padding:20px 18px; border-right:1px solid var(--line); font-size:22px; line-height:1.25; background:color-mix(in srgb, var(--accent) 7%, transparent); }
  .skill-swiss .bottom-ledger div:last-child { border-right:0; }
  `;

  return writeDeck("a-swiss-system", templates.swiss, 'data-accent="ikb"', `
    <section class="poster xhs skill-swiss" id="a-cover" data-name="a-cover">
      <div class="content">
        <div class="chrome-min"><span>AGENT SKILL GUIDE · 01</span><span class="brand-signature"></span></div>
        <div>
          <p class="t-cat">一份源头 · 多个入口 · 原子组装</p>
          <h1 class="h-xl">多个 <span class="blue-word">Agent</span><br>怎么共用 <span class="blue-word">Skill</span></h1>
        </div>
        <div class="skill-grid">
          <div class="skill-tile"><strong>一份源头</strong><span>Skill 只维护一份，减少复制、过期和版本混乱。</span></div>
          <div class="skill-tile"><strong>多个入口</strong><span>Codex、Claude、Gemini 都只是调用入口，不是仓库。</span></div>
          <div class="accent-panel"><b>能力资产<br>不是工具附件</b><span>真正沉淀的是可复用的判断、流程和约束。</span></div>
          <div class="skill-tile"><strong>原子组装</strong><span>小 Skill 负责单点能力，工作流 Skill 负责串联任务。</span></div>
        </div>
        <div class="bottom-ledger">
          <div><b>01</b><br>少复制</div>
          <div><b>02</b><br>好维护</div>
          <div><b>03</b><br>可组装</div>
        </div>
      </div>
    </section>
    <section class="poster xhs skill-swiss" id="a-key" data-name="a-key">
      <div class="content">
        <div class="chrome-min"><span>ATOMIC SKILLS · 02</span><span class="brand-signature"></span></div>
        <div>
          <p class="t-cat">关键原则 · 不要写一个万能 Skill</p>
          <h1 class="h-statement">先拆小，<br><span class="blue-word">再组装。</span></h1>
          <p class="lead accent-rail">比如研究一家公司，不要把所有逻辑塞进一个 Skill。把每一步拆成稳定的小能力，再由工作流 Skill 调度。</p>
        </div>
        <div>
          <div class="step-row"><div class="step-num">01</div><div><h3>资料收集 Skill</h3><p>只负责找来源、记录出处、判断是否可信。</p></div></div>
          <div class="step-row"><div class="step-num">02</div><div><h3>信息清洗 Skill</h3><p>只负责去重、归类、抽取事实和关键数字。</p></div></div>
          <div class="step-row"><div class="step-num">03</div><div><h3>商业判断 Skill</h3><p>只负责形成判断框架，不混入写作包装。</p></div></div>
          <div class="step-row"><div class="step-num">04</div><div><h3>研究报告 Skill</h3><p>最后再把前面的结果组装成可阅读输出。</p></div></div>
        </div>
        <div class="accent-panel"><b>复杂任务不是靠巨型 Prompt 完成。</b><span>它更像一条生产线：每个 Skill 做一件事，组合起来才稳定。</span></div>
      </div>
    </section>
  `, css);
}

function proofDeck() {
  const css = `
  .skill-proof .pl-page { grid-template-rows:auto 1fr auto; }
  .skill-proof .proof-board { display:grid; grid-template-rows:auto 1fr auto; gap:22px; min-height:0; }
  .skill-proof .terminal { background:var(--dark); color:var(--proof-on-dark); border:1px solid var(--line); padding:30px; display:grid; gap:18px; }
  .skill-proof .terminal-row { display:grid; grid-template-columns:180px 1fr; gap:18px; align-items:start; padding:18px 0; border-top:1px solid color-mix(in srgb, var(--accent) 32%, transparent); }
  .skill-proof .terminal-row:first-child { border-top:0; }
  .skill-proof .terminal-row b { color:var(--accent); font-family:var(--sl-mono); font-size:22px; }
  .skill-proof .terminal-row span { font-size:28px; line-height:1.22; font-weight:620; }
  .skill-proof .agent-map { display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; }
  .skill-proof .agent-card { background:var(--surface); border:1px solid var(--line); padding:24px; min-height:330px; display:grid; grid-template-rows:auto auto 1fr; gap:16px; }
  .skill-proof .agent-card b { font-size:30px; line-height:1.05; color:var(--fg); }
  .skill-proof .agent-card span { font-size:22px; line-height:1.32; color:var(--muted); }
  .skill-proof .agent-card em { align-self:end; font-style:normal; font-family:var(--sl-mono); font-size:17px; color:var(--accent); border-top:1px solid var(--line); padding-top:14px; }
  .skill-proof .line-note { border-left:8px solid var(--accent); padding-left:24px; font-size:28px; line-height:1.32; font-weight:580; color:var(--fg); }
  .skill-proof .process { display:grid; grid-template-columns:1fr; gap:16px; align-content:start; }
  .skill-proof .process-item { display:grid; grid-template-columns:86px 1fr; gap:18px; background:var(--surface); border:1px solid var(--line); padding:22px; min-height:150px; }
  .skill-proof .process-item b { font-size:34px; color:var(--accent); font-family:var(--sl-num); }
  .skill-proof .process-item h3 { margin:0 0 7px; font-size:31px; line-height:1.08; }
  .skill-proof .process-item p { margin:0; font-size:22px; line-height:1.32; color:var(--muted); }
  `;
  return writeDeck("b-proof-lab", templates.proof, 'data-theme="SL-05 Signal Noir"', `
    <section class="poster skill-proof" id="b-cover" data-name="b-cover">
      <div class="pl-page">
        <div class="pl-head">
          <div class="sl-label">方案 B · PROOF LAB / WORKBENCH</div>
          <h1 class="pl-title">多个 Agent<br>怎么共用 Skill</h1>
          <p class="pl-subtitle">别把 Skill 复制给每个 Agent，把它们都接到同一个能力库。</p>
        </div>
        <div class="proof-board">
          <div class="terminal">
            <div class="terminal-row"><b>CODEX</b><span>读取同一套 Skill 指令</span></div>
            <div class="terminal-row"><b>CLAUDE</b><span>调用同一份能力资产</span></div>
            <div class="terminal-row"><b>GEMINI</b><span>只作为另一个执行入口</span></div>
          </div>
          <div class="agent-map">
            <div class="agent-card"><b>ONE SOURCE</b><span>只维护一个 Skill 源目录，更新一次，所有入口都能继承。</span><em>避免版本漂移</em></div>
            <div class="agent-card"><b>SYNC</b><span>通过软链接、安装脚本或配置路径，让不同 Agent 指向同一份。</span><em>入口可以不同</em></div>
            <div class="agent-card"><b>COMPOSE</b><span>小 Skill 不追求全能，靠工作流 Skill 把它们串成复杂任务。</span><em>能力可以组合</em></div>
          </div>
        </div>
        <div class="pl-takeaway"><span class="brand-signature"></span><span>能力复用，不是工具堆叠</span></div>
      </div>
    </section>
    <section class="poster skill-proof" id="b-key" data-name="b-key">
      <div class="pl-page">
        <div class="pl-head">
          <div class="sl-label">KEY PAGE / ATOMIC DESIGN</div>
          <h1 class="pl-title">小 Skill 是零件，<br>工作流 Skill 是装配线</h1>
          <p class="pl-subtitle">以“研究一家公司”为例，把复杂任务拆成可替换的能力模块。</p>
        </div>
        <div class="process">
          <div class="process-item"><b>01</b><div><h3>收集资料</h3><p>抓取官网、访谈、新闻、财报，不急着下判断。</p></div></div>
          <div class="process-item"><b>02</b><div><h3>清洗事实</h3><p>去重、归类、保留出处，把信息变成可用材料。</p></div></div>
          <div class="process-item"><b>03</b><div><h3>形成判断</h3><p>用固定问题检查增长、风险、护城河和反例。</p></div></div>
          <div class="process-item"><b>04</b><div><h3>输出报告</h3><p>最后再组装成报告，而不是一开始就让 AI 写结论。</p></div></div>
        </div>
        <div class="line-note">这样做的好处是：换 Agent 不会丢能力，换模型也不会重写整套流程。</div>
        <div class="pl-takeaway"><span class="brand-signature"></span><span>可维护，才可长期使用</span></div>
      </div>
    </section>
  `, css);
}

function editorialDeck() {
  const css = `
  .skill-editorial .content { display:grid; grid-template-rows:auto auto 1fr auto; gap:36px; }
  .skill-editorial .note-panel { border:1px solid var(--line); background:rgba(255,255,255,.45); padding:34px; display:grid; gap:22px; }
  .skill-editorial .note-panel h3 { margin:0; font-family:var(--serif); font-size:42px; line-height:1.1; }
  .skill-editorial .note-panel p { margin:0; font-size:26px; line-height:1.5; color:var(--muted); }
  .skill-editorial .ledger { display:grid; grid-template-columns:120px 1fr; gap:22px; padding:24px 0; border-top:1px solid var(--line); }
  .skill-editorial .ledger b { font-family:var(--mono); color:var(--accent); font-size:24px; }
  .skill-editorial .ledger h3 { margin:0 0 8px; font-family:var(--serif); font-size:34px; line-height:1.08; }
  .skill-editorial .ledger p { margin:0; font-size:23px; line-height:1.42; color:var(--muted); }
  .skill-editorial .quote-box { border-left:6px solid var(--accent); padding:24px 0 24px 26px; font-family:var(--serif); font-size:38px; line-height:1.28; color:var(--ink); }
  .skill-editorial .mini-index { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .skill-editorial .mini-index div { border:1px solid var(--line); padding:18px; min-height:118px; }
  .skill-editorial .mini-index b { display:block; color:var(--accent); font-size:18px; font-family:var(--mono); margin-bottom:8px; }
  .skill-editorial .mini-index span { font-size:24px; line-height:1.2; font-weight:620; }
  `;
  return writeDeck("c-editorial-eink", templates.editorial, 'data-theme="indigo-porcelain"', `
    <section class="poster xhs skill-editorial" id="c-cover" data-name="c-cover">
      <canvas class="mag-bg" data-bg="ink-flow"></canvas>
      <div class="grain"></div>
      <div class="content">
        <div class="issue-row"><span>READING NOTE</span><span class="dot"></span><span>AGENT SKILLS</span></div>
        <div>
          <p class="kicker">方案 C · Editorial E-ink</p>
          <h1 class="h-display">多个 Agent<br>怎么共用 Skill</h1>
          <p class="h-sub">不是多装几遍，而是把能力放回同一个长期记忆里。</p>
        </div>
        <div class="note-panel">
          <h3>Skill 更像“工作方法”，不是某个工具的附件。</h3>
          <p>当你开始同时使用 Codex、Claude、Gemini，真正要避免的不是工具太多，而是同一套能力被复制成很多个不同版本。</p>
          <div class="mini-index">
          <div><b>01</b><span>一份源头<br>少复制</span></div>
          <div><b>02</b><span>多个入口<br>共用能力</span></div>
          <div><b>03</b><span>原子组装<br>做复杂事</span></div>
          </div>
        </div>
        <div class="brand-signature corner-bl"></div>
      </div>
    </section>
    <section class="poster xhs skill-editorial" id="c-key" data-name="c-key">
      <canvas class="mag-bg" data-bg="ink-flow"></canvas>
      <div class="grain"></div>
      <div class="content">
        <div class="issue-row"><span>FIELD GUIDE</span><span class="dot"></span><span>SKILL COMPOSITION</span></div>
        <div>
          <p class="kicker">关键页 · 原子化之后再组装</p>
          <h1 class="h-xl">一个复杂任务，<br>不要交给一个巨型 Skill。</h1>
        </div>
        <div>
          <div class="ledger"><b>STEP 01</b><div><h3>先拆成稳定动作</h3><p>资料收集、事实清洗、商业判断、报告输出，各自只负责一类能力。</p></div></div>
          <div class="ledger"><b>STEP 02</b><div><h3>再用工作流串起来</h3><p>工作流 Skill 不直接替代小 Skill，而是规定调用顺序、输入输出和质量检查。</p></div></div>
          <div class="ledger"><b>STEP 03</b><div><h3>最后让不同 Agent 复用</h3><p>换工具时，变的是执行入口；不变的是那套已经验证过的方法。</p></div></div>
        </div>
        <div class="quote-box">把 Skill 当成长期能力资产，而不是一次性的提示词。</div>
        <div class="brand-signature corner-bl"></div>
      </div>
    </section>
  `, css);
}

fs.rmSync(outRoot, { recursive: true, force: true });
ensureDir(outRoot);
writeDocs();
const dirs = [swissDeck(), proofDeck(), editorialDeck()];
for (const dir of dirs) render(dir);
console.log(`Generated: ${outRoot}`);
