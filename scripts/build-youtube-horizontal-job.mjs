import fs from "node:fs";
import path from "node:path";
import { escapeHtml, fmtTime, readJson, videoDuration, writeJson } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourceJob = path.join(root, "jobs", "dji-20260704-balanced-face-safe");
const job = path.join(root, "jobs", "dji-20260704-youtube-horizontal");
const arollAsset = "assets/aroll-front-focus.mp4";
const coverName = "youtube-horizontal-cover.png";
const coverSource = path.join(process.env.HOME || "", "Downloads/2026-07-05-AI不是给普通员工提效-抖音成片-前段聚焦Fable5全字幕版/ChatGPT Image Jul 5, 2026, 02_26_00 AM.png");
const duration = videoDuration(path.join(sourceJob, arollAsset));
const captions = readJson(path.join(sourceJob, "data", "captions.json"));

const scenes = [
  {
    type: "hero",
    start: 0,
    end: 15.7,
    kicker: "开场判断",
    title: "AI 不会平均提效",
    subtitle: "它放大的不是努力，而是底层能力差。",
    insight: "老板要问的不是「谁装了工具」, 而是谁能把任务拆成可执行系统。",
    chips: ["提效不是平权", "能力被放大", "普通员工不会自动变强"]
  },
  {
    type: "case",
    start: 15.7,
    end: 28.7,
    kicker: "真实案例",
    title: "工具上桌了，员工还是不用",
    subtitle: "Codex / 自动剪辑 / skills 都不是最后一公里。",
    insight: "工具可用 ≠ 组织可用。真正难的是把工具接进日常工作流。",
    items: ["工具已存在", "员工不愿用", "或者用不好"]
  },
  {
    type: "leverage",
    start: 28.7,
    end: 50.0,
    kicker: "能力杠杆",
    title: "100 分员工和 1 分员工都乘 100",
    subtitle: "结果不是平均升级，而是差距变得更刺眼。",
    insight: "AI 像杠杆：方向对，产出暴涨；方向错，返工也暴涨。",
    bars: [
      { label: "强员工", before: "100", after: "10000", size: 1 },
      { label: "弱员工", before: "1", after: "100", size: 0.36 }
    ]
  },
  {
    type: "flow",
    start: 50.0,
    end: 82.1,
    kicker: "组织代价",
    title: "效率死在交接里",
    subtitle: "个人提效之后，还要解释、捏合、返工、确认。",
    insight: "最好的自动化不是让每个人快一点，而是减少人和人之间的等待。",
    steps: ["个人提效", "解释需求", "返工确认", "组织变慢"],
    alt: "AI 全包交流链路"
  },
  {
    type: "workflow",
    start: 82.1,
    end: 96.6,
    kicker: "判断标准",
    title: "无人监督也能跑，才叫工作流",
    subtitle: "否则只是把手工活换成了 AI 界面。",
    insight: "老板要买的不是一个按钮，而是一条能自己闭环的生产线。",
    checklist: ["输入清楚", "规则显性", "中间态可检查", "输出可验收"]
  },
  {
    type: "matrix",
    start: 96.6,
    end: 116.4,
    kicker: "行业边界",
    title: "UGC 能跑，不代表商单能直出",
    subtitle: "标准化越高，AI 越像流水线；判断越多，AI 越需要导演。",
    insight: "别用 UGC 的成功，去证明 DTC / TVC 商单可以一键出片。",
    rows: [
      ["UGC 口播", "节奏 / 字幕 / 轻包装", "高"],
      ["DTC 视频", "策略 / 卖点 / 素材判断", "中"],
      ["TVC 商单", "品牌 / 情绪 / 审美风险", "低"]
    ]
  },
  {
    type: "myth",
    start: 116.4,
    end: 131.2,
    kicker: "反常识",
    title: "装一个 skill，不会自动长出业务结果",
    subtitle: "HyperFrames、Remotion、Codex 都只是工具层。",
    insight: "真正的差异在工具外面：流程、人员、历史包袱和业务目标。",
    formula: ["工具", "流程", "业务判断", "稳定产出"]
  },
  {
    type: "knowledge",
    start: 131.2,
    end: 146.3,
    kicker: "隐藏资产",
    title: "知识在员工脑子里，就很难自动化",
    subtitle: "经验没有被结构化，Agent 就只能不断问人。",
    insight: "要先把隐性判断变成规则、样例、验收标准，再谈自动化。",
    nodes: ["员工经验", "业务判断", "样例库", "验收标准", "Agent"]
  },
  {
    type: "stack",
    start: 146.3,
    end: 156.3,
    kicker: "Fable 5 时代",
    title: "需求讲清 + Token 给够，Agent 才能跑",
    subtitle: "模型越来越强，瓶颈反而更像老板的表达能力。",
    insight: "Fable 5 不是魔法。它把「描述不清」这个问题暴露得更快。",
    stack: ["Fable 5", "上下文", "执行预算", "验收标准"]
  },
  {
    type: "decision",
    start: 156.3,
    end: 172.9,
    kicker: "老板决策",
    title: "你要提效人，还是重做流程？",
    subtitle: "前者是局部加速，后者才是组织重构。",
    insight: "如果目标是降本增效，先画工作流，再决定买什么工具。",
    branches: ["继续给人装工具", "重做流程系统"]
  },
  {
    type: "cta",
    start: 172.9,
    end: duration,
    kicker: "Scott 出海",
    title: "我讲商业化 Agent，不讲玄学",
    subtitle: "懂业务、懂产品、懂技术，才知道 AI 落地会卡在哪里。",
    insight: "想看更真实的 AI 工作流落地，关注 Scott 出海。",
    chips: ["商业化 Agent", "AI 工作流", "跨境电商", "产品经理视角"]
  }
].map((scene, index) => ({ ...scene, id: `scene-${String(index + 1).padStart(2, "0")}` }));

stageAssets();
writeJson(path.join(job, "data", "scenes.json"), scenes);
writeJson(path.join(job, "data", "captions.json"), captions);
writeJson(path.join(job, "project.json"), {
  title: "AI 不会让普通员工变强：老板该重做工作流",
  slug: "dji-20260704-youtube-horizontal",
  platform: "youtube",
  width: 1920,
  height: 1080,
  duration,
  sourceVideo: arollAsset,
  style: "youtube horizontal dynamic explainer claude glass fable5",
  outputName: "AI不会让普通员工变强-YouTube横屏-Fable5工作流-60fps.mp4",
  downloadFolderName: "2026-07-05-AI不会让普通员工变强-YouTube横屏成片"
});
writePackage();
fs.writeFileSync(path.join(job, "index.html"), renderHtml());
fs.writeFileSync(path.join(job, "README.md"), renderReadme());

function stageAssets() {
  ensureDir(path.join(job, "assets", "fonts"));
  ensureDir(path.join(job, "vendor"));
  ensureDir(path.join(job, "data"));
  ensureDir(path.join(job, "renders"));
  ensureDir(path.join(job, "qa"));
  ensureDir(path.join(job, "cover"));
  copyOrLink(path.join(sourceJob, arollAsset), path.join(job, arollAsset));
  copyOrLink(path.join(sourceJob, "assets", "fonts", "Inter-700-latin.woff2"), path.join(job, "assets", "fonts", "Inter-700-latin.woff2"));
  copyOrLink(path.join(sourceJob, "assets", "fonts", "LXGWWenKaiTC-400-latin.woff2"), path.join(job, "assets", "fonts", "LXGWWenKaiTC-400-latin.woff2"));
  copyOrLink(path.join(sourceJob, "vendor", "gsap.min.js"), path.join(job, "vendor", "gsap.min.js"));
  if (fs.existsSync(coverSource)) {
    copyOrLink(coverSource, path.join(job, "cover", coverName));
  }
}

function writePackage() {
  writeJson(path.join(job, "package.json"), {
    name: "talking-head-job-youtube-horizontal",
    private: true,
    type: "module",
    scripts: {
      check: "npx --yes hyperframes@0.5.6 lint && npx --yes hyperframes@0.5.6 validate && npx --yes hyperframes@0.5.6 inspect --samples 24 --timeout 60000",
      "render:review": "npx --yes hyperframes@0.5.6 render --fps 30 --quality draft --workers 4 --video-bitrate 10M --output renders/review-youtube-horizontal-30fps.mp4",
      "render:final": "npx --yes hyperframes@0.5.6 render --fps 60 --quality standard --workers 4 --video-bitrate 28M --output renders/AI不会让普通员工变强-YouTube横屏-Fable5工作流-60fps.mp4"
    },
    dependencies: {
      hyperframes: "0.5.6"
    }
  });
}

function renderHtml() {
  const gsapSource = fs.readFileSync(path.join(job, "vendor", "gsap.min.js"), "utf8")
    .replaceAll("Math.random()", "0.5")
    .replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI 不会让普通员工变强 - YouTube Horizontal</title>
    <style>
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter-700-latin.woff2") format("woff2"); font-weight: 700; }
      @font-face { font-family: "LXGWWenKaiTC"; src: url("assets/fonts/LXGWWenKaiTC-400-latin.woff2") format("woff2"); font-weight: 400; }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #071012; }
      #main { position: relative; width: 1920px; height: 1080px; overflow: hidden; color: #fff7e8; font-family: Inter, LXGWWenKaiTC, "PingFang SC", sans-serif; letter-spacing: 0; }
      #bg { position: absolute; inset: 0; z-index: 0; background:
        radial-gradient(circle at 76% 26%, rgba(255, 190, 87, 0.22), transparent 34%),
        radial-gradient(circle at 18% 72%, rgba(47, 211, 190, 0.16), transparent 31%),
        linear-gradient(135deg, #071012 0%, #131313 42%, #21130c 100%);
      }
      #bg::before { content: ""; position: absolute; inset: 0; opacity: 0.32; background-image: linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 48px 48px; transform: perspective(900px) rotateX(56deg) translateY(120px); transform-origin: center bottom; }
      #bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 16, 18, 0.08), rgba(7, 16, 18, 0) 42%, rgba(7, 16, 18, 0.46)); }
      #talking-video { position: absolute; right: 0; top: 0; width: 608px; height: 1080px; z-index: 3; object-fit: cover; object-position: center center; filter: saturate(1.04) contrast(1.03); }
      #talking-audio { display: none; }
      #portrait-mat { position: absolute; right: 0; top: 0; width: 670px; height: 1080px; z-index: 2; background: linear-gradient(90deg, rgba(7,16,18,0), rgba(7,16,18,0.28) 9%, rgba(255,193,105,0.08) 100%); border-left: 1px solid rgba(255, 226, 173, 0.18); box-shadow: -36px 0 120px rgba(0, 0, 0, 0.55); }
      #portrait-mat::before { content: "SCOTT AI"; position: absolute; right: 28px; top: 30px; color: rgba(255, 236, 205, 0.56); font-size: 22px; }
      #portrait-mat::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 0%, transparent 68%, rgba(7, 16, 18, 0.58)); }
      #stage { position: absolute; left: 54px; top: 42px; width: 1238px; height: 922px; z-index: 4; }
      #timeline-rail { position: absolute; left: 54px; right: 698px; bottom: 28px; height: 7px; z-index: 7; border-radius: 999px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
      #progress-fill { width: 100%; height: 100%; background: linear-gradient(90deg, #f6b35b, #31d7c4, #d7ff7b); transform-origin: left center; transform: scaleX(0); }
      .clip { opacity: 0; visibility: hidden; }
      .scene { position: absolute; inset: 0; padding: 40px 44px; border-radius: 8px; border: 1px solid rgba(255, 238, 207, 0.16); background: linear-gradient(145deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.036)); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.16); backdrop-filter: blur(18px); overflow: hidden; }
      .scene::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: linear-gradient(#f6b35b, #31d7c4); }
      .kicker { display: inline-flex; min-height: 36px; align-items: center; padding: 0 14px; border-radius: 8px; color: #fffaf0; background: #071012; border: 1px solid rgba(49, 215, 196, 0.48); font-size: 19px; line-height: 1; }
      h1, h2 { margin: 18px 0 0; font-weight: 700; line-height: 0.98; color: #fffaf0; }
      h1 { font-size: 96px; max-width: 850px; }
      h2 { font-size: 70px; max-width: 940px; }
      .subtitle { margin: 18px 0 0; max-width: 920px; color: #d9eee9; font-size: 35px; line-height: 1.18; font-family: LXGWWenKaiTC, "PingFang SC", sans-serif; }
      .insight { position: absolute; left: 44px; right: 44px; bottom: 38px; min-height: 78px; display: flex; align-items: center; padding: 0 24px; border-radius: 8px; background: rgba(3, 10, 12, 0.52); border: 1px solid rgba(49, 215, 196, 0.32); color: #fff5dc; font-size: 27px; line-height: 1.18; font-family: LXGWWenKaiTC, "PingFang SC", sans-serif; }
      .chip-row, .grid-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
      .chip, .pill { display: inline-flex; align-items: center; min-height: 48px; padding: 0 18px; border-radius: 8px; border: 1px solid rgba(255, 236, 205, 0.22); background: rgba(255, 255, 255, 0.09); color: #fff2d6; font-size: 23px; }
      .hero-mark { position: absolute; right: 64px; top: 80px; color: rgba(246, 179, 91, 0.13); font-size: 250px; line-height: 0.78; }
      .case-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 42px; width: 890px; }
      .case-board div, .workflow-card, .branch, .matrix-row, .stack-card { min-height: 120px; border-radius: 8px; background: rgba(4, 16, 18, 0.56); border: 1px solid rgba(255, 236, 205, 0.16); padding: 20px; }
      .case-board b, .workflow-card b, .branch b, .stack-card b { display: block; font-size: 28px; color: #fff9ef; }
      .case-board span, .workflow-card span, .branch span, .stack-card span { display: block; margin-top: 10px; color: #a8dad3; font-family: LXGWWenKaiTC, sans-serif; font-size: 22px; line-height: 1.18; }
      .bar-compare { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; width: 860px; height: 330px; margin-top: 34px; align-items: end; }
      .bar-card { position: relative; height: 100%; padding: 20px; border-radius: 8px; background: rgba(4, 16, 18, 0.52); border: 1px solid rgba(255, 236, 205, 0.16); overflow: hidden; }
      .bar-card .bar { position: absolute; left: 32px; bottom: 28px; width: 86px; height: 230px; transform-origin: bottom center; border-radius: 8px 8px 0 0; background: linear-gradient(#31d7c4, #d7ff7b); }
      .bar-card.second .bar { background: linear-gradient(#f6b35b, #fff2ca); }
      .bar-card .big { position: absolute; right: 28px; top: 54px; color: #fffaf0; font-size: 70px; }
      .bar-card .label { position: absolute; right: 28px; bottom: 40px; color: #a8dad3; font-size: 24px; }
      .flow-line { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 44px; width: 950px; }
      .flow-step { position: relative; min-height: 150px; border-radius: 8px; padding: 20px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 236, 205, 0.18); }
      .flow-step::after { content: "→"; position: absolute; right: -24px; top: 46px; color: #f6b35b; font-size: 36px; }
      .flow-step:last-child::after { display: none; }
      .flow-step b { display: block; font-size: 25px; }
      .flow-step span { display: block; margin-top: 12px; color: #a8dad3; font-family: LXGWWenKaiTC, sans-serif; font-size: 21px; }
      .alt-lane { margin-top: 20px; width: 950px; min-height: 74px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: linear-gradient(90deg, rgba(49,215,196,0.24), rgba(215,255,123,0.12)); color: #e9fff9; font-size: 30px; border: 1px solid rgba(49,215,196,0.34); }
      .workflow-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 42px; width: 960px; }
      .workflow-card .num { color: #f6b35b; font-size: 20px; }
      .matrix { margin-top: 34px; width: 1000px; display: grid; gap: 10px; }
      .matrix-row { display: grid; grid-template-columns: 210px 1fr 120px; align-items: center; min-height: 78px; font-size: 26px; }
      .matrix-row span:nth-child(2) { color: #a8dad3; font-family: LXGWWenKaiTC, sans-serif; font-size: 22px; }
      .matrix-row .score { justify-self: end; color: #d7ff7b; }
      .formula { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 42px; width: 960px; }
      .formula .term { min-height: 126px; display: grid; place-items: center; border-radius: 8px; background: rgba(4,16,18,0.55); border: 1px solid rgba(255,236,205,0.18); font-size: 30px; text-align: center; }
      .formula .term.bad { color: rgba(255, 232, 208, 0.44); text-decoration: line-through; }
      .knowledge-map { position: relative; width: 940px; height: 330px; margin-top: 26px; }
      .k-node { position: absolute; display: grid; place-items: center; width: 180px; min-height: 74px; border-radius: 8px; background: rgba(255,255,255,0.09); border: 1px solid rgba(255,236,205,0.18); color: #fffaf0; font-size: 24px; }
      .k-node.agent { left: 380px; top: 124px; width: 200px; min-height: 90px; background: rgba(49,215,196,0.20); border-color: rgba(49,215,196,0.46); color: #eafffb; }
      .k-0 { left: 0; top: 20px; } .k-1 { right: 0; top: 20px; } .k-2 { left: 0; bottom: 20px; } .k-3 { right: 0; bottom: 20px; }
      .connector { position: absolute; left: 180px; right: 180px; top: 164px; height: 2px; background: rgba(246,179,91,0.55); transform-origin: left center; }
      .stack-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; width: 960px; margin-top: 42px; }
      .stack-card { min-height: 154px; }
      .stack-card:first-child { background: rgba(246,179,91,0.20); border-color: rgba(246,179,91,0.52); }
      .decision-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; width: 980px; margin-top: 44px; }
      .branch { min-height: 210px; }
      .branch.bad { opacity: 0.64; }
      .branch.good { background: linear-gradient(145deg, rgba(49,215,196,0.20), rgba(215,255,123,0.12)); border-color: rgba(49,215,196,0.40); }
      .cta-wall { display: flex; flex-wrap: wrap; gap: 14px; width: 880px; margin-top: 38px; }
      .cta-wall .chip { min-height: 62px; font-size: 28px; }
      .caption { position: absolute; left: 72px; bottom: 54px; width: 1160px; z-index: 8; color: #fffaf0; font-size: 40px; line-height: 1.16; font-weight: 700; text-shadow: 0 3px 0 rgba(0,0,0,0.78), 0 8px 24px rgba(0,0,0,0.66); }
      .caption::before { content: ""; position: absolute; left: -18px; right: -18px; top: -12px; bottom: -12px; z-index: -1; border-radius: 8px; background: rgba(3, 10, 12, 0.38); }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${fmtTime(duration)}" data-width="1920" data-height="1080">
      <div id="bg"></div>
      <video id="talking-video" src="${arollAsset}" data-start="0" data-duration="${fmtTime(duration)}" data-media-start="0" data-track-index="1" muted playsinline preload="auto"></video>
      <audio id="talking-audio" src="${arollAsset}" data-start="0" data-duration="${fmtTime(duration)}" data-media-start="0" data-track-index="2" preload="auto"></audio>
      <div id="portrait-mat"></div>
      <div id="stage">
        ${scenes.map(renderScene).join("\n        ")}
      </div>
      ${renderCaptions()}
      <div id="timeline-rail"><div id="progress-fill"></div></div>
    </div>
    <script>${gsapSource}</script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const duration = ${Number(duration).toFixed(3)};
      const video = document.querySelector("#talking-video");
      const progress = document.querySelector("#progress-fill");
      tl.set(progress, { scaleX: 0 }, 0);
      tl.to(progress, { scaleX: 1, duration, ease: "none" }, 0);
      tl.fromTo(video, { scale: 1, x: 0 }, { scale: 1.018, x: -4, duration, ease: "none" }, 0);
      document.querySelectorAll(".clip").forEach((clip) => {
        const start = Number(clip.dataset.start || 0);
        const dur = Number(clip.dataset.duration || 0);
        if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return;
        tl.set(clip, { autoAlpha: 0 }, 0);
        tl.set(clip, { autoAlpha: 1 }, start);
        tl.set(clip, { autoAlpha: 0 }, start + dur);
      });
      document.querySelectorAll(".scene").forEach((scene) => {
        const start = Number(scene.dataset.start || 0);
        const dur = Number(scene.dataset.duration || 0);
        const end = start + dur;
        tl.from(scene, { y: 26, scale: 0.985, duration: 0.42, ease: "expo.out" }, start + 0.04);
        tl.to(scene, { y: -14, scale: 0.992, duration: 0.28, ease: "power3.in" }, end - 0.32);
        const revealTargets = scene.querySelectorAll(".kicker, h1, h2, .subtitle, .chip, .case-board div, .bar-card, .flow-step, .alt-lane, .workflow-card, .matrix-row, .term, .k-node, .stack-card, .branch, .insight");
        const bars = scene.querySelectorAll(".bar");
        const connectors = scene.querySelectorAll(".connector");
        if (revealTargets.length) tl.from(revealTargets, { y: 18, opacity: 0, duration: 0.34, stagger: 0.045, ease: "power3.out" }, start + 0.12);
        if (bars.length) tl.from(bars, { scaleY: 0.08, duration: 0.7, stagger: 0.12, ease: "power3.out" }, start + 0.42);
        if (connectors.length) tl.from(connectors, { scaleX: 0, duration: 0.76, ease: "power2.out" }, start + 0.48);
      });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}

function renderScene(scene) {
  const dur = scene.end - scene.start;
  const base = `id="${scene.id}" class="clip scene scene-${scene.type}" data-kind="${scene.type}" data-start="${fmtTime(scene.start)}" data-duration="${fmtTime(dur)}" data-track-index="${100 + scenes.indexOf(scene)}" style="--clip-dur:${fmtTime(dur)}s"`;
  const head = `<div class="kicker">${escapeHtml(scene.kicker)}</div>${scene.type === "hero" ? `<h1>${escapeHtml(scene.title)}</h1>` : `<h2>${escapeHtml(scene.title)}</h2>`}<div class="subtitle">${escapeHtml(scene.subtitle)}</div>`;
  const insight = `<div class="insight">${escapeHtml(scene.insight)}</div>`;
  if (scene.type === "hero") {
    return `<section ${base}>${head}<div class="hero-mark">AI</div><div class="chip-row">${scene.chips.map(chip).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "case") {
    return `<section ${base}>${head}<div class="case-board">${scene.items.map((item, i) => `<div><b>${escapeHtml(item)}</b><span>${["工具不是问题", "组织意愿断层", "流程没有接住"][i]}</span></div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "leverage") {
    return `<section ${base}>${head}<div class="bar-compare">${scene.bars.map((bar, i) => `<div class="bar-card ${i ? "second" : ""}"><div class="bar" style="transform:scaleY(${bar.size})"></div><div class="big">${escapeHtml(bar.before)} → ${escapeHtml(bar.after)}</div><div class="label">${escapeHtml(bar.label)}</div></div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "flow") {
    return `<section ${base}>${head}<div class="flow-line">${scene.steps.map((step, i) => `<div class="flow-step"><b>${String(i + 1).padStart(2, "0")}</b><span>${escapeHtml(step)}</span></div>`).join("")}</div><div class="alt-lane">${escapeHtml(scene.alt)}</div>${insight}</section>`;
  }
  if (scene.type === "workflow") {
    return `<section ${base}>${head}<div class="workflow-grid">${scene.checklist.map((item, i) => `<div class="workflow-card"><div class="num">CHECK ${String(i + 1).padStart(2, "0")}</div><b>${escapeHtml(item)}</b><span>能被系统读懂，才可能被系统执行。</span></div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "matrix") {
    return `<section ${base}>${head}<div class="matrix">${scene.rows.map((row) => `<div class="matrix-row"><b>${escapeHtml(row[0])}</b><span>${escapeHtml(row[1])}</span><b class="score">${escapeHtml(row[2])}</b></div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "myth") {
    return `<section ${base}>${head}<div class="formula">${scene.formula.map((item, i) => `<div class="term ${i === 0 ? "bad" : ""}">${escapeHtml(item)}</div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "knowledge") {
    return `<section ${base}>${head}<div class="knowledge-map"><div class="connector"></div>${scene.nodes.slice(0, 4).map((item, i) => `<div class="k-node k-${i}">${escapeHtml(item)}</div>`).join("")}<div class="k-node agent">${escapeHtml(scene.nodes[4])}</div></div>${insight}</section>`;
  }
  if (scene.type === "stack") {
    return `<section ${base}>${head}<div class="stack-grid">${scene.stack.map((item, i) => `<div class="stack-card"><b>${escapeHtml(item)}</b><span>${["模型能力", "任务背景", "可用成本", "结果标准"][i]}</span></div>`).join("")}</div>${insight}</section>`;
  }
  if (scene.type === "decision") {
    return `<section ${base}>${head}<div class="decision-grid"><div class="branch bad"><b>${escapeHtml(scene.branches[0])}</b><span>局部快一点，整体未必更快。</span></div><div class="branch good"><b>${escapeHtml(scene.branches[1])}</b><span>把经验、规则、验收做成系统。</span></div></div>${insight}</section>`;
  }
  return `<section ${base}>${head}<div class="cta-wall">${scene.chips.map(chip).join("")}</div>${insight}</section>`;
}

function renderCaptions() {
  return captions
    .map((item, index) => {
      const start = Number(item.s ?? item.start);
      const end = Number(item.e ?? item.end ?? start + Number(item.duration || 0));
      const dur = Math.max(0.1, end - start);
      const text = String(item.t ?? item.text ?? "").trim();
      if (!text) return "";
      return `<div id="caption-${index + 1}" class="clip caption" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${1000 + index}" style="--clip-dur:${fmtTime(dur)}s">${escapeHtml(text)}</div>`;
    })
    .filter(Boolean)
    .join("\n      ");
}

function chip(text) {
  return `<span class="chip">${escapeHtml(text)}</span>`;
}

function renderReadme() {
  return `# dji-20260704-youtube-horizontal

- Source job: \`${sourceJob}\`
- Source A-roll: \`${path.join(sourceJob, arollAsset)}\`
- Output: \`renders/AI不会让普通员工变强-YouTube横屏-Fable5工作流-60fps.mp4\`
- Cover: \`cover/${coverName}\`
- Schedule target: 2026-07-05 12:00 Asia/Shanghai
`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyOrLink(src, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) return;
  try {
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
}
