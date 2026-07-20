const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const outDir = path.join(__dirname, "..", "output", "xhs-skill-agent-options", "output", "images");
fs.mkdirSync(outDir, { recursive: true });

const W = 1080;
const H = 1440;
const brand = "「两克伴」出品";

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lines(text, max) {
  const out = [];
  let buf = "";
  for (const ch of text) {
    const wide = /[\u4e00-\u9fff]/.test(ch) ? 2 : 1;
    const len = [...buf].reduce((n, c) => n + (/[\u4e00-\u9fff]/.test(c) ? 2 : 1), 0);
    if (len + wide > max && buf) {
      out.push(buf);
      buf = ch;
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function textBlock(text, x, y, opts = {}) {
  const {
    size = 36,
    fill = "#111",
    weight = 700,
    max = 24,
    lh = Math.round(size * 1.35),
    family = "Arial, 'Noto Sans SC', 'PingFang SC', sans-serif",
    anchor = "start",
  } = opts;
  return lines(text, max)
    .map((line, i) => `<text x="${x}" y="${y + i * lh}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="${family}" text-anchor="${anchor}">${esc(line)}</text>`)
    .join("\n");
}

function chip(text, x, y, color, bg, stroke = color) {
  const width = Math.max(92, [...text].length * 24 + 34);
  return `
  <rect x="${x}" y="${y}" width="${width}" height="44" rx="10" fill="${bg}" stroke="${stroke}" stroke-width="2"/>
  <text x="${x + 17}" y="${y + 29}" fill="${color}" font-size="22" font-weight="800" font-family="Arial, 'Noto Sans SC', 'PingFang SC', sans-serif">${esc(text)}</text>`;
}

function footer(theme = "dark") {
  const fill = theme === "dark" ? "#7d8b84" : "#69716d";
  return `
  <line x1="80" y1="1328" x2="1000" y2="1328" stroke="${theme === "dark" ? "#24352d" : "#d8dcd7"}" stroke-width="2"/>
  <text x="82" y="1378" fill="${fill}" font-size="20" font-weight="700" font-family="'Courier New', monospace">${brand}</text>
  <text x="738" y="1378" fill="${fill}" font-size="20" font-weight="700" font-family="'Courier New', monospace">READING CAPTURE / SKILL</text>`;
}

function svgA(kind) {
  const cover = kind === "cover";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f7f7f2"/>
  <pattern id="gridA" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#e1e4df" stroke-width="1"/></pattern>
  <rect width="${W}" height="${H}" fill="url(#gridA)" opacity=".8"/>
  <rect x="0" y="0" width="18" height="${H}" fill="#0940c7"/>
  <text x="80" y="98" fill="#5f6a65" font-size="20" font-weight="800" letter-spacing="3" font-family="'Courier New', monospace">SKILL SYSTEM / MULTI AGENT</text>
  <line x1="80" y1="128" x2="1000" y2="128" stroke="#cfd4ce" stroke-width="2"/>
  ${
    cover
      ? `
  ${textBlock("多个 Agent", 80, 235, { size: 72, weight: 900, max: 12, fill: "#111" })}
  ${textBlock("怎么共用 Skill", 80, 325, { size: 72, weight: 900, max: 14, fill: "#0940c7" })}
  ${textBlock("真正要管理的不是工具，是你的能力资产。", 84, 480, { size: 32, weight: 800, max: 28, fill: "#67716b", lh: 48 })}
  <rect x="80" y="600" width="920" height="520" fill="#0a0d0b"/>
  <text x="116" y="662" fill="#fff" font-size="28" font-weight="800" font-family="'Courier New', monospace">ONE SKILL LIBRARY</text>
  <rect x="116" y="720" width="236" height="112" fill="#f7f7f2" stroke="#d7d9d2"/>
  <rect x="420" y="720" width="236" height="112" fill="#f7f7f2" stroke="#d7d9d2"/>
  <rect x="724" y="720" width="236" height="112" fill="#f7f7f2" stroke="#d7d9d2"/>
  <text x="154" y="788" fill="#111" font-size="32" font-weight="900" font-family="Arial, 'Noto Sans SC'">Codex</text>
  <text x="456" y="788" fill="#111" font-size="32" font-weight="900" font-family="Arial, 'Noto Sans SC'">Claude</text>
  <text x="762" y="788" fill="#111" font-size="32" font-weight="900" font-family="Arial, 'Noto Sans SC'">Agent</text>
  <path d="M234 850 L234 932 H842 V850" fill="none" stroke="#0940c7" stroke-width="8"/>
  <rect x="214" y="924" width="648" height="112" fill="#0940c7"/>
  <text x="302" y="994" fill="#fff" font-size="34" font-weight="900" font-family="Arial, 'Noto Sans SC'">统一 Skill 能力库</text>
  `
      : `
  ${textBlock("技巧 3", 80, 218, { size: 52, weight: 900, max: 8, fill: "#0940c7" })}
  ${textBlock("不要写一个万能 Skill", 80, 302, { size: 56, weight: 900, max: 18, fill: "#111" })}
  ${textBlock("先把能力拆小，再用工作流组装。", 84, 425, { size: 31, weight: 800, max: 26, fill: "#67716b", lh: 46 })}
  <rect x="80" y="540" width="920" height="122" fill="#111"/>
  <text x="122" y="615" fill="#fff" font-size="34" font-weight="900" font-family="Arial, 'Noto Sans SC'">研究一家公司，不需要一个万能 Skill</text>
  <g font-family="Arial, 'Noto Sans SC', sans-serif" font-weight="900" font-size="28">
    <rect x="80" y="740" width="250" height="120" fill="#fff" stroke="#cdd2cc" stroke-width="2"/>
    <text x="116" y="812" fill="#111">资料收集</text>
    <rect x="416" y="740" width="250" height="120" fill="#fff" stroke="#cdd2cc" stroke-width="2"/>
    <text x="452" y="812" fill="#111">信息清洗</text>
    <rect x="750" y="740" width="250" height="120" fill="#fff" stroke="#cdd2cc" stroke-width="2"/>
    <text x="786" y="812" fill="#111">商业判断</text>
    <path d="M334 800 H402" stroke="#0940c7" stroke-width="6"/>
    <path d="M666 800 H736" stroke="#0940c7" stroke-width="6"/>
    <rect x="246" y="950" width="250" height="120" fill="#fff" stroke="#cdd2cc" stroke-width="2"/>
    <text x="282" y="1022" fill="#111">竞品对比</text>
    <rect x="584" y="950" width="250" height="120" fill="#0940c7"/>
    <text x="620" y="1022" fill="#fff">研究报告</text>
    <path d="M498 1010 H570" stroke="#0940c7" stroke-width="6"/>
  </g>`
  }
  ${footer("light")}
</svg>`;
}

function svgB(kind) {
  const cover = kind === "cover";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#07120d"/>
  <radialGradient id="glowB" cx="50%" cy="10%" r="80%"><stop offset="0%" stop-color="#123426"/><stop offset="70%" stop-color="#07120d"/></radialGradient>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <pattern id="dotsB" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#244335" opacity=".7"/></pattern>
  <rect width="${W}" height="${H}" fill="url(#dotsB)" opacity=".35"/>
  <text x="76" y="98" fill="#84a192" font-size="22" font-weight="800" letter-spacing="2" font-family="'Courier New', monospace">READING CAPTURE / WORKBENCH</text>
  ${
    cover
      ? `
  ${textBlock("多个 Agent", 76, 215, { size: 70, weight: 900, max: 14, fill: "#f3f1e8" })}
  ${textBlock("怎么共用 Skill", 76, 308, { size: 70, weight: 900, max: 15, fill: "#f3f1e8" })}
  <rect x="76" y="405" width="700" height="118" rx="0" fill="#0d0f0d" stroke="#2a3f33" stroke-width="2"/>
  <text x="112" y="474" fill="#f3f1e8" font-size="34" font-weight="900" font-family="Arial, 'Noto Sans SC'">别让能力散落在每个工具里</text>
  <rect x="76" y="612" width="928" height="500" rx="20" fill="#0b1711" stroke="#263c30" stroke-width="2"/>
  <rect x="110" y="658" width="252" height="342" rx="16" fill="#111c16" stroke="#2d4939"/>
  <rect x="414" y="658" width="252" height="342" rx="16" fill="#111c16" stroke="#2d4939"/>
  <rect x="718" y="658" width="252" height="342" rx="16" fill="#111c16" stroke="#2d4939"/>
  ${chip("Codex", 136, 704, "#78a7ff", "#10203a", "#2f68d8")}
  ${chip("Claude", 440, 704, "#55c878", "#102d1c", "#2f9e54")}
  ${chip("Agent", 744, 704, "#ffb54a", "#33220b", "#d98b22")}
  <text x="142" y="816" fill="#dbe6dc" font-size="28" font-weight="800" font-family="Arial, 'Noto Sans SC'">入口</text>
  <text x="446" y="816" fill="#dbe6dc" font-size="28" font-weight="800" font-family="Arial, 'Noto Sans SC'">入口</text>
  <text x="750" y="816" fill="#dbe6dc" font-size="28" font-weight="800" font-family="Arial, 'Noto Sans SC'">入口</text>
  <path d="M236 1000 V1078 H842 V1000" fill="none" stroke="#55c878" stroke-width="7"/>
  <rect x="246" y="1052" width="588" height="96" rx="14" fill="#55c878"/>
  <text x="356" y="1114" fill="#07120d" font-size="33" font-weight="900" font-family="Arial, 'Noto Sans SC'">统一 Skill Library</text>`
      : `
  ${textBlock("关键页", 76, 206, { size: 34, weight: 900, max: 8, fill: "#55c878" })}
  ${textBlock("小 Skill 是零件", 76, 286, { size: 58, weight: 900, max: 24, fill: "#f3f1e8" })}
  ${textBlock("工作流 Skill 是装配线", 76, 370, { size: 58, weight: 900, max: 26, fill: "#f3f1e8" })}
  <rect x="76" y="500" width="928" height="608" rx="20" fill="#0b1711" stroke="#263c30" stroke-width="2"/>
  <text x="112" y="562" fill="#84a192" font-size="22" font-weight="900" font-family="'Courier New', monospace">COMPANY RESEARCH WORKFLOW</text>
  <g font-family="Arial, 'Noto Sans SC', sans-serif" font-weight="900">
    <rect x="120" y="630" width="356" height="82" rx="12" fill="#10203a" stroke="#3d70e6"/>
    <text x="152" y="682" fill="#dce7ff" font-size="28">01 资料收集</text>
    <rect x="604" y="630" width="356" height="82" rx="12" fill="#102d1c" stroke="#3ca65c"/>
    <text x="636" y="682" fill="#dcffe5" font-size="28">02 信息清洗</text>
    <rect x="120" y="790" width="356" height="82" rx="12" fill="#33220b" stroke="#ffb54a"/>
    <text x="152" y="842" fill="#ffe4b2" font-size="28">03 商业判断</text>
    <rect x="604" y="790" width="356" height="82" rx="12" fill="#111c16" stroke="#405d4a"/>
    <text x="636" y="842" fill="#e4ece5" font-size="28">04 竞品对比</text>
    <rect x="240" y="956" width="600" height="92" rx="14" fill="#55c878"/>
    <text x="392" y="1016" fill="#07120d" font-size="31">05 生成研究报告</text>
    <path d="M476 670 H590" stroke="#78a7ff" stroke-width="5"/>
    <path d="M780 714 V776" stroke="#78a7ff" stroke-width="5"/>
    <path d="M604 830 H490" stroke="#78a7ff" stroke-width="5"/>
    <path d="M300 872 V940 H540" stroke="#78a7ff" stroke-width="5"/>
  </g>`
  }
  ${footer("dark")}
</svg>`;
}

function svgC(kind) {
  const cover = kind === "cover";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fbfaf4"/>
  <pattern id="gridC" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" fill="none" stroke="#e5e1d8" stroke-width="1"/></pattern>
  <rect width="${W}" height="${H}" fill="url(#gridC)" opacity=".75"/>
  <rect x="0" y="0" width="18" height="${H}" fill="#0a47c4"/>
  <text x="80" y="96" fill="#6b766f" font-size="20" font-weight="800" letter-spacing="3" font-family="'Courier New', monospace">FIELD NOTES / AI SKILLS</text>
  ${
    cover
      ? `
  ${textBlock("多个 Agent", 80, 220, { size: 74, weight: 900, max: 12, fill: "#101313" })}
  ${textBlock("怎么共用 Skill", 80, 315, { size: 74, weight: 900, max: 14, fill: "#0a47c4" })}
  <rect x="80" y="445" width="820" height="112" fill="#101313"/>
  <text x="116" y="514" fill="#fff" font-size="34" font-weight="900" font-family="Arial, 'Noto Sans SC'">别把 Skill 到处复制</text>
  <rect x="80" y="640" width="292" height="250" fill="#fff" stroke="#d7d3ca" stroke-width="2"/>
  <rect x="394" y="640" width="292" height="250" fill="#fff" stroke="#d7d3ca" stroke-width="2"/>
  <rect x="708" y="640" width="292" height="250" fill="#fff" stroke="#d7d3ca" stroke-width="2"/>
  <text x="116" y="705" fill="#0a47c4" font-size="26" font-weight="900" font-family="'Courier New', monospace">01</text>
  <text x="116" y="778" fill="#101313" font-size="33" font-weight="900" font-family="Arial, 'Noto Sans SC'">一份源头</text>
  <text x="116" y="835" fill="#66716a" font-size="24" font-weight="800" font-family="Arial, 'Noto Sans SC'">统一维护</text>
  <text x="430" y="705" fill="#0a47c4" font-size="26" font-weight="900" font-family="'Courier New', monospace">02</text>
  <text x="430" y="778" fill="#101313" font-size="33" font-weight="900" font-family="Arial, 'Noto Sans SC'">多个入口</text>
  <text x="430" y="835" fill="#66716a" font-size="24" font-weight="800" font-family="Arial, 'Noto Sans SC'">工具只调用</text>
  <text x="744" y="705" fill="#0a47c4" font-size="26" font-weight="900" font-family="'Courier New', monospace">03</text>
  <text x="744" y="778" fill="#101313" font-size="33" font-weight="900" font-family="Arial, 'Noto Sans SC'">原子组装</text>
  <text x="744" y="835" fill="#66716a" font-size="24" font-weight="800" font-family="Arial, 'Noto Sans SC'">小能力复用</text>
  <rect x="80" y="1000" width="920" height="92" fill="#0a47c4"/>
  <text x="118" y="1058" fill="#fff" font-size="30" font-weight="900" font-family="Arial, 'Noto Sans SC'">工具会变，能力库应该留下来。</text>`
      : `
  ${textBlock("第三个技巧", 80, 210, { size: 36, weight: 900, max: 12, fill: "#0a47c4" })}
  ${textBlock("先做小零件", 80, 305, { size: 64, weight: 900, max: 12, fill: "#101313" })}
  ${textBlock("再做装配线", 80, 388, { size: 64, weight: 900, max: 12, fill: "#101313" })}
  <rect x="80" y="500" width="920" height="520" fill="#fff" stroke="#d7d3ca" stroke-width="2"/>
  <text x="120" y="570" fill="#6b766f" font-size="24" font-weight="900" font-family="'Courier New', monospace">EXAMPLE / COMPANY RESEARCH</text>
  <g font-family="Arial, 'Noto Sans SC', sans-serif">
    <circle cx="150" cy="660" r="10" fill="#0a47c4"/><text x="182" y="672" fill="#101313" font-size="30" font-weight="900">资料收集 Skill</text>
    <circle cx="150" cy="750" r="10" fill="#0a47c4"/><text x="182" y="762" fill="#101313" font-size="30" font-weight="900">信息清洗 Skill</text>
    <circle cx="150" cy="840" r="10" fill="#0a47c4"/><text x="182" y="852" fill="#101313" font-size="30" font-weight="900">商业判断 Skill</text>
    <circle cx="150" cy="930" r="10" fill="#0a47c4"/><text x="182" y="942" fill="#101313" font-size="30" font-weight="900">竞品对比 Skill</text>
    <rect x="590" y="666" width="320" height="220" fill="#101313"/>
    <text x="628" y="740" fill="#fff" font-size="32" font-weight="900">工作流 Skill</text>
    <text x="628" y="800" fill="#cbd4cc" font-size="24" font-weight="800">负责组装顺序</text>
  </g>
  <rect x="80" y="1110" width="920" height="92" fill="#101313"/>
  <text x="118" y="1168" fill="#fff" font-size="29" font-weight="900" font-family="Arial, 'Noto Sans SC'">一个小 Skill 做稳，很多任务都能复用。</text>`
  }
  ${footer("light")}
</svg>`;
}

const jobs = [
  ["01-a-swiss-cover", svgA("cover")],
  ["02-a-swiss-key", svgA("key")],
  ["03-b-workbench-cover", svgB("cover")],
  ["04-b-workbench-key", svgB("key")],
  ["05-c-notes-cover", svgC("cover")],
  ["06-c-notes-key", svgC("key")],
];

for (const [name, svg] of jobs) {
  const svgPath = path.join(outDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(svgPath, svg);
  execFileSync("/opt/homebrew/bin/rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
}

console.log(outDir);
