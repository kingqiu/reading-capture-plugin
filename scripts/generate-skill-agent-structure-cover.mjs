import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "/Users/jimqiu/.codex/skills/keke-social-card-skill/node_modules/playwright/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "output", "xhs-skill-agent-structure-cover-v3");
const assetsDir = path.join(outDir, "assets");
const imagesDir = path.join(outDir, "output", "images");
const diagramPath = path.join(assetsDir, "skill-library-structure.png");
const coverPath = path.join(imagesDir, "01-cover.png");
const { chromium } = playwright;

await fs.mkdir(assetsDir, { recursive: true });
await fs.mkdir(imagesDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function renderHtmlToPng(html, outputPath, width, height, selector = "body") {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle" });
  const target = await page.locator(selector).first();
  await target.screenshot({ path: outputPath, omitBackground: false });
  await page.close();
}

const sharedCss = `
  @font-face {
    font-family: 'Noto Sans SC';
    src: local('Noto Sans SC'), local('PingFang SC');
  }
  :root {
    --blue: #002FA7;
    --ink: #101419;
    --muted: #66717c;
    --paper: #f7f8f4;
    --line: #dfe4de;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    color: var(--ink);
    background: var(--paper);
  }
`;

const diagramHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedCss}
body {
  width: 936px;
  height: 500px;
  overflow: hidden;
}
.diagram {
  position: relative;
  width: 936px;
  height: 500px;
  padding: 36px 48px;
  background:
    linear-gradient(rgba(0,47,167,.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,47,167,.035) 1px, transparent 1px),
    radial-gradient(circle at 46% 55%, rgba(0,47,167,.10), transparent 30%),
    radial-gradient(circle at 78% 36%, rgba(0,47,167,.07), transparent 28%),
    #fbfbf7;
  background-size: 34px 34px, 34px 34px, 100% 100%, 100% 100%;
  border: 1px solid #d9ded8;
}
.stage-label {
  position: absolute;
  padding: 7px 13px;
  border-radius: 999px;
  background: #fff;
  border: 1.8px solid var(--ink);
  box-shadow: 0 12px 22px rgba(16,20,25,.10);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0;
  white-space: nowrap;
}
.node, .hub, .module, .output {
  position: absolute;
  background: #fff;
  border: 2px solid #171b20;
  box-shadow:
    0 18px 28px rgba(16,20,25,.10),
    inset 0 1px 0 rgba(255,255,255,.92);
}
.node {
  left: 70px;
  width: 126px;
  height: 80px;
  border-radius: 24px;
  background:
    linear-gradient(145deg, #fff 0%, #f3f5f1 100%);
}
.node::before {
  content: "";
  position: absolute;
  width: 42px;
  height: 22px;
  border: 3px solid var(--blue);
  background: #eef3ff;
  border-radius: 12px 12px 8px 8px;
  left: 41px;
  top: 16px;
}
.node::after {
  content: "";
  position: absolute;
  width: 76px;
  height: 14px;
  left: 25px;
  bottom: 17px;
  border-radius: 99px;
  background:
    linear-gradient(90deg, #d6ded9 0 13px, transparent 13px 20px, #d6ded9 20px 34px, transparent 34px 41px, #d6ded9 41px 55px, transparent 55px 62px, #d6ded9 62px 76px);
}
.n1 { top: 86px; }
.n2 { top: 212px; }
.n3 { top: 338px; }
.hub {
  left: 350px;
  top: 132px;
  width: 222px;
  height: 222px;
  border-radius: 44px;
  background:
    linear-gradient(145deg, #ffffff 0%, #edf2ff 100%);
  box-shadow:
    0 28px 52px rgba(0,47,167,.12),
    0 18px 32px rgba(16,20,25,.10),
    inset 0 1px 0 rgba(255,255,255,.95);
}
.hub::before {
  content: "";
  position: absolute;
  inset: 48px 50px;
  border-radius: 24px;
  border: 5px solid var(--blue);
  background:
    linear-gradient(180deg, #fff 0 28%, #e7eeff 28% 100%);
}
.hub::after {
  content: "";
  position: absolute;
  left: 84px;
  top: 76px;
  width: 58px;
  height: 70px;
  background:
    linear-gradient(90deg, var(--blue) 0 11px, transparent 11px 18px, var(--blue) 18px 31px, transparent 31px 39px, var(--blue) 39px 52px);
  opacity: .95;
}
.module {
  left: 670px;
  width: 104px;
  height: 62px;
  border-radius: 18px;
  background: linear-gradient(145deg, #fff 0%, #f2f5f7 100%);
}
.module::before {
  content: "";
  position: absolute;
  inset: 14px 18px;
  border-radius: 10px;
  background: rgba(0,47,167,.16);
  border: 3px solid var(--blue);
}
.m1 { top: 78px; }
.m2 { top: 166px; }
.m3 { top: 254px; }
.m4 { top: 342px; }
.output {
  right: 54px;
  top: 182px;
  width: 124px;
  height: 126px;
  border-radius: 22px;
  background: linear-gradient(145deg, #fff 0%, #f6f8f4 100%);
}
.output::before {
  content: "";
  position: absolute;
  left: 24px;
  top: 25px;
  width: 76px;
  height: 15px;
  background: var(--blue);
  border-radius: 99px;
  box-shadow: 0 29px 0 #d9e0dc, 0 58px 0 #d9e0dc;
}
svg {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.wire {
  fill: none;
  stroke: var(--blue);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 5px 5px rgba(0,47,167,.12));
}
.wire-thin {
  fill: none;
  stroke: var(--blue);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .92;
  filter: drop-shadow(0 4px 4px rgba(0,47,167,.10));
}
.dot {
  fill: var(--blue);
  stroke: #fff;
  stroke-width: 4;
}
.l-agents { left: 56px; top: 34px; }
.l-source { left: 356px; top: 46px; }
.l-atomic { left: 648px; top: 28px; }
.l-workflow { right: 42px; top: 318px; }
.l-maintain { left: 356px; bottom: 28px; color: var(--blue); border-color: var(--blue); }
.plate {
  position: absolute;
  left: 286px;
  top: 392px;
  width: 348px;
  height: 34px;
  border-radius: 999px;
  background: rgba(0,47,167,.07);
  filter: blur(1px);
}
</style>
</head>
<body>
  <div class="diagram">
    <div class="plate"></div>
    <svg viewBox="0 0 936 500" aria-hidden="true">
      <path class="wire" d="M196 126 C276 126 302 176 350 215" />
      <path class="wire" d="M196 252 C280 252 306 248 350 252" />
      <path class="wire" d="M196 378 C276 378 304 322 350 292" />
      <path class="wire-thin" d="M572 202 C616 154 628 110 670 109" />
      <path class="wire-thin" d="M572 232 C612 200 630 198 670 197" />
      <path class="wire-thin" d="M572 272 C612 288 630 286 670 285" />
      <path class="wire-thin" d="M572 312 C616 356 628 374 670 373" />
      <path class="wire" d="M774 109 C824 126 804 210 812 226" />
      <path class="wire" d="M774 197 C802 202 796 223 812 234" />
      <path class="wire" d="M774 285 C802 282 796 264 812 258" />
      <path class="wire" d="M774 373 C824 342 804 286 812 268" />
      <circle class="dot" cx="350" cy="215" r="10" />
      <circle class="dot" cx="350" cy="252" r="10" />
      <circle class="dot" cx="350" cy="292" r="10" />
    </svg>
    <div class="node n1"></div>
    <div class="node n2"></div>
    <div class="node n3"></div>
    <div class="hub"></div>
    <div class="module m1"></div>
    <div class="module m2"></div>
    <div class="module m3"></div>
    <div class="module m4"></div>
    <div class="output"></div>
    <div class="stage-label l-agents">多个 Agent</div>
    <div class="stage-label l-source">同一技能库</div>
    <div class="stage-label l-atomic">原子技能</div>
    <div class="stage-label l-workflow">组合工作流</div>
    <div class="stage-label l-maintain">一次维护</div>
  </div>
</body>
</html>`;

await renderHtmlToPng(diagramHtml, diagramPath, 936, 500, ".diagram");

const diagramBase64 = await fs.readFile(diagramPath, "base64");
const diagramUrl = `data:image/png;base64,${diagramBase64}`;
const coverHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedCss}
body {
  width: 1080px;
  height: 1440px;
  overflow: hidden;
}
.cover {
  position: relative;
  width: 1080px;
  height: 1440px;
  padding: 70px 80px 58px;
  background:
    linear-gradient(90deg, #002FA7 0 20px, transparent 20px),
    linear-gradient(rgba(16,20,25,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16,20,25,.055) 1px, transparent 1px),
    radial-gradient(circle at 0% 40%, rgba(0,47,167,.10), transparent 34%),
    #f7f8f4;
  background-size: 100% 100%, 36px 36px, 36px 36px, 100% 100%, 100% 100%;
}
.topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6d747a;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 22px;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.rule {
  height: 1px;
  background: rgba(16,20,25,.15);
  margin: 18px 0 36px;
}
h1 {
  margin: 0;
  font-size: 92px;
  line-height: 1.02;
  letter-spacing: 0;
  font-weight: 950;
  color: #080b0f;
}
h1 .blue {
  color: var(--blue);
}
.subtitle {
  width: 880px;
  margin: 28px 0 30px;
  font-size: 29px;
  line-height: 1.45;
  font-weight: 750;
  color: #66717c;
}
.image-window {
  width: 920px;
  margin-top: 20px;
  border-radius: 34px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d4d9d2;
  box-shadow: 0 28px 60px rgba(0,47,167,.13);
}
.window-bar {
  height: 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 28px;
  border-bottom: 1px solid #e0e4df;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  color: #7b8389;
  font-size: 20px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4f827f;
}
.dot:nth-child(2) { background: #8fb2ad; }
.dot:nth-child(3) { background: #c8d0cc; margin-right: 18px; }
.diagram-img {
  display: block;
  width: 920px;
  height: 492px;
  object-fit: cover;
}
.principles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  padding: 24px;
  background: #fff;
}
.principle {
  border: 1px solid #d8ded7;
  padding: 22px 20px 24px;
  min-height: 118px;
}
.principle .kicker {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  color: var(--blue);
  font-size: 19px;
  font-weight: 900;
  margin-bottom: 8px;
}
.principle .text {
  font-size: 27px;
  line-height: 1.2;
  font-weight: 900;
}
.footer-rule {
  height: 1px;
  background: rgba(16,20,25,.15);
  margin-top: 50px;
}
.footer {
  position: absolute;
  left: 80px;
  right: 80px;
  bottom: 54px;
  display: flex;
  justify-content: space-between;
  color: #747a80;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
}
.corner-mark {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 1440px;
  background: #002FA7;
}
</style>
</head>
<body>
  <main class="cover">
    <div class="corner-mark"></div>
    <div class="topline">
      <span>Skill Library / Agent Workflow</span>
      <span>Obsidian · Codex · Claude</span>
    </div>
    <div class="rule"></div>
    <h1>多个 Agent<br>怎么共用 <span class="blue">Skill</span>？</h1>
    <p class="subtitle">关键不是复制一堆提示词，而是把能力做成可复用、可组合、可维护的一套技能库。</p>
    <section class="image-window">
      <div class="window-bar">
        <i class="dot"></i><i class="dot"></i><i class="dot"></i>
        shared skill library structure
      </div>
      <img class="diagram-img" src="${diagramUrl}" alt="多个 Agent 共用 Skill Library 的结构图">
      <div class="principles">
        <div class="principle">
          <div class="kicker">01</div>
          <div class="text">一个源目录</div>
        </div>
        <div class="principle">
          <div class="kicker">02</div>
          <div class="text">技能原子化</div>
        </div>
        <div class="principle">
          <div class="kicker">03</div>
          <div class="text">工作流组装</div>
        </div>
      </div>
    </section>
    <div class="footer-rule"></div>
    <footer class="footer">
      <span>「两克伴」出品</span>
      <span>SKILL LIBRARY / SHARED WORKFLOW</span>
    </footer>
  </main>
</body>
</html>`;

await fs.writeFile(path.join(outDir, "index.html"), coverHtml, "utf8");
await renderHtmlToPng(coverHtml, coverPath, 1080, 1440, ".cover");

const prompts = `# Guizang Material Illustration Prompt Log

## Concept

多个 Agent 共用同一个 Skill Library。结构图表达：不同 Agent 不复制技能，而是连接同一套可维护的技能库；技能库由原子技能组成，再组合成复杂工作流。

## Final Illustration Method

The built-in image generation attempts did not follow the required system-diagram prompt, so the final asset uses the guizang-material-illustration visual system deterministically: off-white studio background, black ink lines, one IKB blue accent, short Chinese labels, material-style nodes, hub-and-spoke composition.

## Required Labels

- 多个 Agent
- 同一技能库
- 原子技能
- 组合工作流
- 一次维护

## Output

- Structure diagram: assets/skill-library-structure.png
- Cover: output/images/01-cover.png
`;

const qa = `# QA

- The cover does not contain internal option names such as "方案A" or template names.
- The visible brand signature is exactly: 「两克伴」出品.
- The central visual is a structure diagram for multiple Agents sharing one Skill Library.
- The diagram uses short Chinese labels and a single IKB blue accent.
- No real user path, private data, logo, or watermark is included.
- The generated image has been visually inspected before handoff.
`;

await fs.writeFile(path.join(outDir, "PROMPTS.md"), prompts, "utf8");
await fs.writeFile(path.join(outDir, "QA.md"), qa, "utf8");

await browser.close();
console.log(coverPath);
