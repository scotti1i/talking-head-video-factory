import fs from "node:fs";
import path from "node:path";
import {
  ensureSymlink,
  escapeHtml,
  fmtTime,
  parseArgs,
  projectRoot,
  readJson,
  readJsonArray,
  resolveJob,
  run,
  writeJson
} from "./lib.mjs";

const args = parseArgs();
const root = projectRoot();
const jobDir = resolveJob(args.job);
const sourceOutDir = args.sourceOutDir
  ? path.resolve(args.sourceOutDir)
  : path.join(process.env.HOME || "", "Documents/seedlab-next/out/talking-head-20260607");
const overlayOnly = Boolean(args.overlayOnly || args["overlay-only"]);
const variantId = overlayOnly ? "youtube-horizontal-v2-overlay" : "youtube-horizontal-v2";
const variantDir = path.join(jobDir, "variants", variantId);
const config = readJson(path.join(jobDir, "project.json"));

const rawEdl = buildRawEdl(sourceOutDir);
const duration = rawEdl.at(-1).outEnd;
const captions = readJsonArray(path.join(jobDir, "data", "captions.json"));
const scenes = buildScenes(duration);

fs.mkdirSync(variantDir, { recursive: true });
ensureSymlink(path.relative(variantDir, path.join(jobDir, "assets")), path.join(variantDir, "assets"));
ensureSymlink(path.relative(variantDir, path.join(jobDir, "data")), path.join(variantDir, "data"));
ensureSymlink(path.relative(variantDir, path.join(jobDir, "cover")), path.join(variantDir, "cover"));

writeJson(path.join(jobDir, "data", "raw-edl-youtube-horizontal-v2.json"), rawEdl);
writeJson(path.join(variantDir, "project.json"), {
  slug: `${config.slug}-youtube-horizontal-v2`,
  title: `${config.title}｜YouTube 横屏 v2`,
  variantId,
  variantLabel: overlayOnly ? "YouTube 横屏透明动效层 v2" : "YouTube 横屏完整 v2",
  width: 1920,
  height: 1080,
  layout: "horizontal",
  duration,
  outputName: overlayOnly
    ? "ai-agent-boss-youtube-horizontal-v2-overlay.webm"
    : "ai-agent-boss-youtube-horizontal-v2-60fps.mp4",
  sourcePolicy: "raw DJI MOV EDL, no douyin/full-master transcode as source",
  render: {
    fps: 60,
    quality: "standard",
    workers: 8,
    videoBitrate: "36M"
  },
  qa: {
    sampleTimes: [1, 46.5, 58, 100.5, 150, 224, 300.5, 350, 438.5, duration - 1]
  }
});
writeJson(path.join(variantDir, "package.json"), packageJson());
fs.writeFileSync(path.join(variantDir, "index.html"), renderHtml({ duration, rawEdl, captions, scenes, overlayOnly }));

console.log(`Built ${variantId}`);
console.log(`Duration: ${duration.toFixed(3)}s`);
console.log(`EDL: ${path.join(jobDir, "data", "raw-edl-youtube-horizontal-v2.json")}`);
console.log(`Variant: ${variantDir}`);

function buildRawEdl(outDir) {
  const editPlan = fs.readFileSync(path.join(outDir, "edit-plan-v1.md"), "utf8");
  const firstPass = parseEditPlan(editPlan);
  const v2 = readJson(path.join(outDir, "exports", "v2-trim-plan.json")).remove;
  const v3 = readJson(path.join(outDir, "exports", "v3-semantic-trim-plan.json")).remove.map((item) => [
    item.start,
    item.end
  ]);
  return compactEdl(subtractRanges(subtractRanges(firstPass, v2), v3));
}

function parseEditPlan(markdown) {
  const re = /source: `([^`]+)`[\s\S]*?range: `([^`]+)` -> `([^`]+)`/g;
  const out = [];
  let match;
  let t = 0;
  while ((match = re.exec(markdown))) {
    const sourceStart = parseTimecode(match[2]);
    const sourceEnd = parseTimecode(match[3]);
    const duration = sourceEnd - sourceStart;
    out.push({
      id: `v1_${String(out.length + 1).padStart(2, "0")}`,
      source: match[1],
      sourceStart,
      sourceEnd,
      outStart: t,
      outEnd: t + duration,
      duration
    });
    t += duration;
  }
  if (!out.length) throw new Error("Cannot parse edit-plan-v1.md");
  return out;
}

function parseTimecode(value) {
  const [hours, minutes, seconds] = String(value).split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function subtractRanges(segments, removals) {
  const kept = [];
  for (const segment of segments) {
    let spans = [[segment.outStart, segment.outEnd]];
    for (const range of removals) {
      const start = Number(Array.isArray(range) ? range[0] : range.start);
      const end = Number(Array.isArray(range) ? range[1] : range.end);
      spans = subtractOneRange(spans, start, end);
    }
    for (const [start, end] of spans) {
      const sourceStart = segment.sourceStart + (start - segment.outStart);
      const sourceEnd = segment.sourceStart + (end - segment.outStart);
      if (sourceEnd - sourceStart > 0.001) {
        kept.push({ ...segment, sourceStart, sourceEnd, outStart: start, outEnd: end });
      }
    }
  }
  return relayout(kept);
}

function subtractOneRange(spans, removeStart, removeEnd) {
  const out = [];
  for (const [start, end] of spans) {
    if (removeEnd <= start || removeStart >= end) {
      out.push([start, end]);
      continue;
    }
    if (removeStart > start) out.push([start, Math.max(start, removeStart)]);
    if (removeEnd < end) out.push([Math.min(end, removeEnd), end]);
  }
  return out;
}

function relayout(segments) {
  let t = 0;
  return segments.map((segment, index) => {
    const duration = segment.sourceEnd - segment.sourceStart;
    const out = {
      id: `seg_${String(index + 1).padStart(3, "0")}`,
      source: segment.source,
      sourceStart: round(segment.sourceStart),
      sourceEnd: round(segment.sourceEnd),
      outStart: round(t),
      outEnd: round(t + duration),
      duration: round(duration)
    };
    t += duration;
    return out;
  });
}

function compactEdl(segments) {
  const out = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (
      last &&
      last.source === segment.source &&
      Math.abs(last.sourceEnd - segment.sourceStart) < 0.02 &&
      Math.abs(last.outEnd - segment.outStart) < 0.02
    ) {
      last.sourceEnd = segment.sourceEnd;
      last.outEnd = segment.outEnd;
      last.duration = round(last.sourceEnd - last.sourceStart);
    } else {
      out.push({ ...segment, id: `seg_${String(out.length + 1).padStart(3, "0")}` });
    }
  }
  return relayout(out);
}

function round(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function buildScenes(duration) {
  return [
    {
      id: "hook",
      start: 0,
      end: 45.6,
      kicker: "HOOK",
      title: "你用的 AI，和真正的 AI Agent 不是一回事",
      subtitle: "聊天工具只回答问题，Agent 会把业务流程跑完。",
      type: "compare",
      leftTitle: "普通 AI",
      leftItems: ["问一句", "答一句", "卡在人工复制粘贴"],
      rightTitle: "AI Agent",
      rightItems: ["理解目标", "调用工具", "执行并复盘"]
    },
    {
      id: "qa-limit",
      start: 45.6,
      end: 138.3,
      kicker: "01 / 上限",
      title: "问答 AI 的天花板：它不拥有流程",
      subtitle: "提示词再好，也替代不了业务闭环。",
      type: "workflow",
      steps: ["Prompt", "Answer", "复制到表格", "人工判断", "人工执行"],
      notes: ["只能给建议", "不能自动读业务状态", "不能替你承担结果"]
    },
    {
      id: "breakout",
      start: 138.3,
      end: 218.5,
      kicker: "02 / 爆发点",
      title: "2026 不是突然变聪明，是能力栈凑齐了",
      subtitle: "长上下文、工具调用、代码执行和成本下降，同时过线。",
      type: "stack",
      layers: ["更强模型", "长上下文", "工具调用", "代码执行", "Token 成本下降"],
      result: "从“回答问题”变成“接管任务”"
    },
    {
      id: "players",
      start: 218.5,
      end: 289.9,
      kicker: "03 / 谁先用",
      title: "顶尖玩家先把流程拆给 Agent",
      subtitle: "互联网圈先发生，跨境圈会很快跟上。",
      type: "map",
      lanes: ["工程效率", "内容生产", "投放复盘", "供应链判断"],
      result: "谁先把流程标准化，谁先放大产能"
    },
    {
      id: "cross-border",
      start: 289.9,
      end: 340,
      kicker: "04 / 跨境",
      title: "跨境不是多一个工具，是生产线重排",
      subtitle: "选品、Listing、内容、投放、复盘被连成一个闭环。",
      type: "pipeline",
      steps: ["选品", "Listing", "内容", "投放", "复盘", "再迭代"],
      result: "从单点提效，变成整条链路提速"
    },
    {
      id: "threshold",
      start: 340,
      end: 435.4,
      kicker: "05 / 门槛",
      title: "真正门槛不是会不会用工具",
      subtitle: "门槛是基建能力 + 业务理解。",
      type: "pillars",
      leftTitle: "基建",
      leftItems: ["数据在哪里", "流程怎么触发", "结果如何回写"],
      rightTitle: "业务",
      rightItems: ["老板懂全局", "操盘手懂判断", "团队能被系统化"]
    },
    {
      id: "winner",
      start: 435.4,
      end: duration,
      kicker: "06 / 赢家通吃",
      title: "成本降下来，产能差距会被拉爆",
      subtitle: "差距不是一点效率，而是复利级生产力。",
      type: "flywheel",
      steps: ["成本下降", "产量上升", "反馈更快", "系统更强"],
      result: "最后比拼的是谁更早把业务交给系统"
    }
  ];
}

function renderHtml({ duration, rawEdl, captions, scenes, overlayOnly }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Agent Boss YouTube Horizontal v2</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: ${overlayOnly ? "transparent" : "#06100e"}; }
      #main {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: ${overlayOnly ? "transparent" : "#06100e"};
        color: #f5f7ef;
        font-family: Inter, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
        letter-spacing: 0;
      }
      .backgrid {
        position: absolute;
        inset: 0;
        opacity: 0.36;
        background:
          linear-gradient(rgba(245, 247, 239, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(245, 247, 239, 0.035) 1px, transparent 1px);
        background-size: 44px 44px;
        z-index: 0;
      }
      .speaker-frame {
        position: absolute;
        left: 56px;
        top: 40px;
        width: 560px;
        height: 1000px;
        overflow: hidden;
        border-radius: 10px;
        border: 1px solid rgba(245, 247, 239, 0.18);
        background: ${overlayOnly ? "transparent" : "#0a1714"};
        box-shadow: 28px 0 90px rgba(0, 0, 0, 0.36);
        z-index: 2;
      }
      .raw-clip {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 50%;
      }
      .speaker-vignette {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(6, 16, 14, 0.04), rgba(6, 16, 14, 0) 54%, rgba(6, 16, 14, 0.34));
        z-index: 4;
        pointer-events: none;
      }
      .speaker-tag {
        position: absolute;
        left: 22px;
        bottom: 20px;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 999px;
        background: #020806;
        border: 1px solid rgba(245, 247, 239, 0.24);
        color: #f5f7ef;
        font-size: 18px;
        line-height: 1;
        font-weight: 900;
      }
      .speaker-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #2ef2a2;
        box-shadow: 0 0 24px rgba(46, 242, 162, 0.72);
      }
      .stage-shell {
        position: absolute;
        left: 660px;
        top: 40px;
        right: 56px;
        bottom: 40px;
        z-index: 3;
      }
      .stage-topbar {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 46px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        border-radius: 9px;
        background: #020806;
        border: 1px solid rgba(245, 247, 239, 0.18);
        color: #b7c4b7;
        font-size: 18px;
        font-weight: 900;
      }
      .stage-topbar strong { color: #2ef2a2; font-weight: 900; }
      .visual-scene {
        position: absolute;
        left: 0;
        top: 62px;
        width: 1204px;
        height: 806px;
        overflow: hidden;
        padding: 44px 48px;
        border-radius: 10px;
        border: 1px solid rgba(245, 247, 239, 0.18);
        background:
          linear-gradient(180deg, rgba(11, 29, 25, 0.84), rgba(7, 17, 15, 0.72)),
          #07110f;
        box-shadow: 0 26px 90px rgba(0, 0, 0, 0.30);
      }
      .scene-kicker {
        color: #2ef2a2;
        font-size: 20px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 18px;
      }
      .scene-title {
        max-width: 1060px;
        font-size: 54px;
        line-height: 1.08;
        font-weight: 900;
        margin-bottom: 16px;
      }
      .scene-subtitle {
        max-width: 980px;
        color: #dbe7da;
        font-size: 27px;
        line-height: 1.24;
        font-weight: 800;
        margin-bottom: 36px;
      }
      .compare-grid,
      .pillar-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 28px;
      }
      .panel {
        min-height: 320px;
        padding: 30px;
        border-radius: 10px;
        border: 1px solid rgba(245, 247, 239, 0.14);
        background: rgba(245, 247, 239, 0.06);
      }
      .panel.hot {
        border-color: rgba(46, 242, 162, 0.42);
        background: rgba(46, 242, 162, 0.09);
      }
      .panel-title {
        font-size: 34px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 24px;
      }
      .item-list {
        display: grid;
        gap: 16px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .item-list li {
        position: relative;
        padding-left: 24px;
        color: #f5f7ef;
        font-size: 28px;
        line-height: 1.16;
        font-weight: 850;
      }
      .item-list li::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.46em;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ffcb5c;
      }
      .hot .item-list li::before { background: #2ef2a2; }
      .workflow-row,
      .pipeline-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 18px;
      }
      .pipeline-row {
        gap: 10px;
      }
      .flow-node {
        min-width: 142px;
        min-height: 90px;
        display: grid;
        place-items: center;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid rgba(245, 247, 239, 0.16);
        background: rgba(245, 247, 239, 0.07);
        color: #f5f7ef;
        font-size: 25px;
        line-height: 1.1;
        text-align: center;
        font-weight: 900;
      }
      .flow-node.hot {
        border-color: rgba(46, 242, 162, 0.45);
        background: rgba(46, 242, 162, 0.10);
      }
      .pipeline-row .flow-node {
        min-width: 120px;
        min-height: 84px;
        padding: 12px;
        font-size: 24px;
      }
      .arrow {
        width: 42px;
        height: 2px;
        background: rgba(245, 247, 239, 0.34);
        position: relative;
        flex: 0 0 auto;
      }
      .pipeline-row .arrow {
        width: 28px;
      }
      .arrow::after {
        content: "";
        position: absolute;
        right: -2px;
        top: -5px;
        width: 12px;
        height: 12px;
        border-top: 2px solid rgba(245, 247, 239, 0.44);
        border-right: 2px solid rgba(245, 247, 239, 0.44);
        transform: rotate(45deg);
      }
      .note-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
        margin-top: 42px;
      }
      .note {
        min-height: 96px;
        padding: 20px;
        border-radius: 10px;
        background: rgba(255, 203, 92, 0.10);
        border: 1px solid rgba(255, 203, 92, 0.24);
        color: #fff4d7;
        font-size: 24px;
        line-height: 1.18;
        font-weight: 900;
      }
      .stack-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        max-width: 760px;
      }
      .stack-layer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 66px;
        padding: 0 24px;
        border-radius: 9px;
        border: 1px solid rgba(46, 242, 162, 0.24);
        background: rgba(46, 242, 162, 0.075);
        font-size: 28px;
        font-weight: 900;
      }
      .stack-layer span {
        color: #2ef2a2;
        font-size: 22px;
        font-weight: 900;
      }
      .scene-result {
        position: absolute;
        right: 48px;
        bottom: 40px;
        max-width: 500px;
        padding: 22px 26px;
        border-radius: 10px;
        border: 1px solid rgba(255, 203, 92, 0.38);
        background: rgba(255, 203, 92, 0.12);
        color: #fff4d7;
        font-size: 28px;
        line-height: 1.18;
        font-weight: 900;
      }
      .lane-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 18px;
        margin-top: 18px;
      }
      .lane {
        height: 250px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 22px;
        border-radius: 10px;
        border: 1px solid rgba(245, 247, 239, 0.15);
        background: linear-gradient(180deg, rgba(245, 247, 239, 0.05), rgba(46, 242, 162, 0.09));
        color: #f5f7ef;
        text-align: center;
        font-size: 27px;
        line-height: 1.12;
        font-weight: 900;
      }
      .flywheel {
        position: relative;
        width: 570px;
        height: 370px;
        margin: 10px 0 0 120px;
      }
      .wheel-item {
        position: absolute;
        width: 190px;
        height: 94px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid rgba(46, 242, 162, 0.38);
        background: rgba(46, 242, 162, 0.10);
        color: #f5f7ef;
        font-size: 25px;
        font-weight: 900;
      }
      .wheel-item:nth-child(1) { left: 190px; top: 0; }
      .wheel-item:nth-child(2) { right: 0; top: 138px; }
      .wheel-item:nth-child(3) { left: 190px; bottom: 0; }
      .wheel-item:nth-child(4) { left: 0; top: 138px; }
      .wheel-core {
        position: absolute;
        left: 210px;
        top: 132px;
        width: 150px;
        height: 106px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        color: #f5f7ef;
        border: 1px solid rgba(46, 242, 162, 0.62);
        background: #0b1d19;
        font-size: 28px;
        font-weight: 950;
      }
      .chapter-rail {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 132px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .chapter-chip {
        height: 86px;
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        border-radius: 9px;
        border: 1px solid rgba(245, 247, 239, 0.46);
        background: #020806;
      }
      .chapter-num {
        color: #ffffff;
        font-size: 24px;
        line-height: 1;
        font-weight: 950;
      }
      .chapter-title {
        color: #ffffff;
        font-size: 20px;
        line-height: 1.08;
        font-weight: 900;
      }
      .caption {
        position: absolute;
        left: 690px;
        right: 76px;
        bottom: 56px;
        z-index: 9;
        color: #f7f9f0;
        font-size: 39px;
        line-height: 1.16;
        font-weight: 900;
        text-align: center;
        text-shadow:
          0 3px 0 rgba(0, 0, 0, 0.92),
          0 8px 24px rgba(0, 0, 0, 0.88);
      }
      .soft-mask {
        position: absolute;
        left: 630px;
        right: 0;
        bottom: 0;
        height: 210px;
        z-index: 8;
        background: linear-gradient(180deg, rgba(6, 16, 14, 0), rgba(6, 16, 14, 0.82));
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${fmtTime(duration)}" data-width="1920" data-height="1080">
      <div class="backgrid"></div>
      <div class="speaker-frame">
${overlayOnly ? "" : renderVideoClips(rawEdl)}
        <div class="speaker-vignette"></div>
        <div class="speaker-tag"><span class="speaker-dot"></span><span>SCOTT / AI AGENT</span></div>
      </div>
${overlayOnly ? "" : renderAudioClips(rawEdl)}
      <div class="stage-shell">
        <div class="stage-topbar"><span><strong>AI AGENT</strong> BUSINESS FLOW</span><span>LONG FORM / 09:06</span></div>
${scenes.map(renderScene).join("\n")}
      </div>
      <div class="soft-mask"></div>
${renderCaptions(captions)}
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
${renderTimeline(scenes)}
        window.__timelines["main"] = tl;
      </script>
    </div>
  </body>
</html>
`;
}

function renderVideoClips(rawEdl) {
  return rawEdl
    .map((segment, index) => {
      const src = `assets/raw/${escapeHtml(segment.source)}`;
      return `        <video id="video-${segment.id}" class="raw-clip" data-start="${fmtTime(segment.outStart)}" data-duration="${fmtTime(segment.duration)}" data-media-start="${fmtTime(segment.sourceStart)}" data-track-index="${10 + index}" src="${src}" muted playsinline></video>`;
    })
    .join("\n");
}

function renderAudioClips(rawEdl) {
  return rawEdl
    .map((segment, index) => {
      const src = `assets/raw/${escapeHtml(segment.source)}`;
      return `      <audio id="audio-${segment.id}" data-start="${fmtTime(segment.outStart)}" data-duration="${fmtTime(segment.duration)}" data-media-start="${fmtTime(segment.sourceStart)}" data-track-index="${80 + index}" src="${src}" data-volume="1"></audio>`;
    })
    .join("\n");
}

function renderScene(scene, index) {
  const body = renderSceneBody(scene);
  return `        <section id="scene-${scene.id}" class="visual-scene clip" data-start="${fmtTime(scene.start)}" data-duration="${fmtTime(scene.end - scene.start)}" data-track-index="${240 + index}">
          <div class="scene-kicker">${escapeHtml(scene.kicker)}</div>
          <div class="scene-title">${escapeHtml(scene.title)}</div>
          <div class="scene-subtitle">${escapeHtml(scene.subtitle)}</div>
${body}
        </section>`;
}

function renderSceneBody(scene) {
  if (scene.type === "compare" || scene.type === "pillars") {
    return `          <div class="${scene.type === "compare" ? "compare-grid" : "pillar-grid"}">
            ${renderPanel(scene.leftTitle, scene.leftItems, false)}
            ${renderPanel(scene.rightTitle, scene.rightItems, true)}
          </div>`;
  }
  if (scene.type === "workflow" || scene.type === "pipeline") {
    const rowClass = scene.type === "workflow" ? "workflow-row" : "pipeline-row";
    return `          <div class="${rowClass}">
${scene.steps.map((step, index) => `${index ? '            <div class="arrow"></div>\n' : ""}            <div class="flow-node${index === scene.steps.length - 1 ? " hot" : ""}">${escapeHtml(step)}</div>`).join("\n")}
          </div>
          ${scene.notes ? `<div class="note-grid">${scene.notes.map((note) => `<div class="note">${escapeHtml(note)}</div>`).join("")}</div>` : ""}
          <div class="scene-result">${escapeHtml(scene.result)}</div>`;
  }
  if (scene.type === "stack") {
    return `          <div class="stack-list">
${scene.layers.map((layer, index) => `            <div class="stack-layer"><div>${escapeHtml(layer)}</div><span>${String(index + 1).padStart(2, "0")}</span></div>`).join("\n")}
          </div>
          <div class="scene-result">${escapeHtml(scene.result)}</div>`;
  }
  if (scene.type === "map") {
    return `          <div class="lane-grid">
${scene.lanes.map((lane) => `            <div class="lane">${escapeHtml(lane)}</div>`).join("\n")}
          </div>
          <div class="scene-result">${escapeHtml(scene.result)}</div>`;
  }
  if (scene.type === "flywheel") {
    return `          <div class="flywheel">
${scene.steps.map((step) => `            <div class="wheel-item">${escapeHtml(step)}</div>`).join("\n")}
            <div class="wheel-core">AGENT<br />SYSTEM</div>
          </div>
          <div class="scene-result">${escapeHtml(scene.result)}</div>`;
  }
  return "";
}

function renderPanel(title, items, hot) {
  return `<div class="panel${hot ? " hot" : ""}">
              <div class="panel-title">${escapeHtml(title)}</div>
              <ul class="item-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>`;
}

function renderChapter(chapter) {
  return `          <div class="chapter-chip">
            <div class="chapter-num">${escapeHtml(chapter.num)}</div>
            <div class="chapter-title">${escapeHtml(chapter.title)}</div>
          </div>`;
}

function renderCaptions(captions) {
  return captions
    .map((item, index) => {
      const start = Number(item.s ?? item.start);
      const end = item.e != null || item.end != null ? Number(item.e ?? item.end) : start + Number(item.duration);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
      const text = wrapText(item.t ?? item.text, 25);
      return `      <div id="caption-${String(index + 1).padStart(3, "0")}" class="caption clip" data-start="${fmtTime(start)}" data-duration="${fmtTime(end - start)}" data-track-index="${1000 + index}">${text}</div>`;
    })
    .filter(Boolean)
    .join("\n");
}

function wrapText(text, limit) {
  const chars = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  const lines = [];
  let line = "";
  for (const char of chars) {
    line += char;
    if (Array.from(line).length >= limit) {
      lines.push(line.trim());
      line = "";
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 2).map(escapeHtml).join("<br />");
}

function renderTimeline(scenes) {
  return scenes
    .map((scene) => {
      const id = `#scene-${scene.id}`;
      const duration = scene.end - scene.start;
      const childSelectors = [
        `${id} .scene-kicker`,
        `${id} .scene-title`,
        `${id} .scene-subtitle`,
        `${id} .panel`,
        `${id} .flow-node`,
        `${id} .note`,
        `${id} .stack-layer`,
        `${id} .lane`,
        `${id} .wheel-item`,
        `${id} .scene-result`
      ].join(", ");
      return `        tl.fromTo("${id}", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.48, ease: "power3.out" }, ${scene.start.toFixed(2)});
        tl.fromTo("${childSelectors}", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.055, ease: "power3.out" }, ${(scene.start + 0.12).toFixed(2)});
        tl.to("${id}", { opacity: 0, y: -16, duration: 0.32, ease: "power2.in" }, ${(scene.start + duration - 0.36).toFixed(2)});
        tl.set("${id}", { opacity: 0 }, ${(scene.end - 0.01).toFixed(2)});`;
    })
    .join("\n");
}

function packageJson() {
  const renderCommand = overlayOnly
    ? "npx --yes hyperframes@0.5.6 render --fps 60 --quality high --workers 8 --format webm --output renders/ai-agent-boss-youtube-horizontal-v2-overlay.webm"
    : "npx --yes hyperframes@0.5.6 render --fps 60 --quality high --workers 8 --video-bitrate 36M --output renders/ai-agent-boss-youtube-horizontal-v2-60fps.mp4";
  return {
    name: `talking-head-${variantId}`,
    private: true,
    type: "module",
    scripts: {
      check: "npm run lint && npm run validate && npm run inspect",
      lint: "npx --yes hyperframes@0.5.6 lint",
      validate: "npx --yes hyperframes@0.5.6 validate",
      inspect: "npx --yes hyperframes@0.5.6 inspect --samples 24",
      "render:final": renderCommand
    },
    dependencies: {
      hyperframes: "0.5.6"
    }
  };
}
