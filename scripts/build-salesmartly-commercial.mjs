// ============================================================
// SaleSmartly 商单专用合成器
// 目标: A-roll 保持人说话为主, 但在卖点段落插入真实 SaleSmartly B-roll,
//      并按抖音右侧/底部安全区约束布局。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  escapeHtml,
  fmtTime,
  projectRoot,
  readJson,
  videoDuration,
  writeJson
} from "./lib.mjs";

const root = projectRoot();
const job = path.join(root, "jobs", "salesmartly-20260625-refresh");
const tightEdlPath = path.join(job, "data", "tight-cut-edl.json");
const useTightCut = fs.existsSync(path.join(job, "assets", "aroll-tight.mp4")) && fs.existsSync(tightEdlPath);
const bakedSourceVideo = "assets/aroll-tight-broll-balanced-baked.mp4";
const useBakedBroll = useTightCut && fs.existsSync(path.join(job, bakedSourceVideo));
const sourceVideo = useBakedBroll ? bakedSourceVideo : useTightCut ? "assets/aroll-tight.mp4" : "assets/aroll.mp4";
const duration = videoDuration(path.join(job, sourceVideo));
const sourceDuration = videoDuration(path.join(job, "assets/aroll.mp4"));
const captions = readJson(path.join(job, "data", useTightCut ? "captions-tight.json" : "captions.json"));
const tightEdl = useTightCut ? readJson(tightEdlPath) : null;
const outputName = useTightCut ? "salesmartly-commercial-balanced-final-60fps.mp4" : "salesmartly-commercial-final-60fps.mp4";
const reviewName = useTightCut ? "salesmartly-commercial-balanced-review-30fps.mp4" : "salesmartly-commercial-review-30fps.mp4";
const downloadFolderName = useTightCut ? "2026-07-09-SaleSmartly商单-新流程重剪-balanced" : "2026-07-08-SaleSmartly商单-新流程重剪-commercial";
const coverFile = useTightCut ? "renders/balanced-cover.jpg" : "renders/commercial-cover.jpg";
const qaSampleTimes = useTightCut
  ? [5, 24, 48, 70, 92, 112, 126, 140, 154, 170, 188, 204]
  : [5, 24, 50, 76, 123, 146, 158, 172, 194, 212, 229, 248];

function mapTime(time, mode = "start") {
  if (!tightEdl) return time;
  for (const seg of tightEdl) {
    if (time >= seg.sourceStart && time <= seg.sourceEnd) return seg.outStart + (time - seg.sourceStart);
  }
  const next = tightEdl.find((seg) => seg.sourceStart > time);
  if (mode === "start" && next) return next.outStart;
  const prev = [...tightEdl].reverse().find((seg) => seg.sourceEnd < time);
  if (prev) return prev.outEnd;
  return 0;
}

function remapSpan(item, minDuration = 0.35) {
  const start = mapTime(Number(item.start), "start");
  const end = mapTime(Number(item.end), "end");
  if (end - start < minDuration) return null;
  return { ...item, start: round(start), end: round(end) };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

const baseBeats = [
  { kind: "hook", start: 0.26, end: 21.62, kicker: "开场反常识", title: "TK 不是全部", body: "跨境大盘里, B2B 才是更大的交易场。", stat: "70%" },
  { kind: "duel", start: 21.62, end: 47.72, kicker: "为什么还在教 TK", title: "卖货不赚钱, 才会转去卖课", bad: "继续追平台红利", good: "转向 B2B 询盘" },
  { kind: "statement", start: 47.72, end: 56.1, kicker: "核心判断", title: "跨境电商的终局在私域", body: "不是泛泛讲私域, 是 B2B 询盘、聊天和客户资产。" },
  { kind: "compare", start: 56.1, end: 76.36, kicker: "库存逻辑", title: "卖给 B2C 是卖, 卖给 B2B 也是卖", left: "B2C: 一个一个卖", right: "B2B: 一单一批货" },
  { kind: "chips", start: 76.36, end: 106.98, kicker: "TK 商家的迁移优势", title: "懂流量和内容, 就能转 B2B 获客", chips: ["TK", "Instagram", "经销商", "万件订单"] },
  { kind: "flow", start: 106.98, end: 119.7, kicker: "前端获客", title: "内容把询盘打进来", steps: ["视频种草", "引到 WhatsApp", "开始聊单"] },
  { kind: "product", start: 119.7, end: 146.16, kicker: "混乱现场", title: "多国家、多渠道消息同时进来", body: "客户不只在 WhatsApp, 也会在 Telegram、iMessage、Email。" },
  { kind: "warning", start: 146.16, end: 157.52, kicker: "成交预警", title: "回复慢了, 线索就走了", body: "B2B 不是等客户, 是第一时间接住客户。" },
  { kind: "product", start: 157.52, end: 189.06, kicker: "SaleSmartly 承接", title: "AI 先接住人, 再分给销售", body: "识别语言、自动打招呼、初筛、打标、分配。" },
  { kind: "product", start: 189.06, end: 217.76, kicker: "企业资产", title: "客户资料不能跟销售一起消失", body: "聊天记录、报价、跟进进度, 都要留在公司后台。" },
  { kind: "proof", start: 217.76, end: 225.74, kicker: "B2B 样本", title: "真正做大的出海品牌, 都绕不开渠道", body: "区域买家和渠道网络, 才是长期生意。" },
  { kind: "cta", start: 234.72, end: sourceDuration, kicker: "收束", title: "谁需要, 我就卖给谁", body: "七成大盘都在 B2B, 就该用 SaleSmartly 把询盘接住。" }
];

const baseBroll = [
  {
    id: "ai-rule-peek",
    src: "assets/broll/salesmartly-AIbot-1.mp4",
    start: 161.78,
    end: 166.78,
    mediaStart: 0.0,
    title: "后台设置 AI 自动化",
    label: "第一次产品露出",
    mode: "main"
  },
  {
    id: "ai-greeting-peek",
    src: "assets/broll/salesmartly-AIbot-1.mp4",
    start: 170.98,
    end: 175.68,
    mediaStart: 6.2,
    title: "AI 先用母语接住客户",
    label: "短露出",
    mode: "main"
  },
  {
    id: "lead-tracking-peek",
    src: "assets/broll/salesmartly-AIbot-1.mp4",
    start: 182.30,
    end: 187.38,
    mediaStart: 13.0,
    title: "线索跟进状态留在后台",
    label: "再露出一次",
    mode: "main"
  },
  {
    id: "handoff-peek",
    src: "assets/broll/salesmartly-AIbot-1.mp4",
    start: 212.08,
    end: 215.66,
    mediaStart: 21.0,
    title: "交接不丢客户资产",
    label: "收束前补一眼",
    mode: "main"
  },
  {
    id: "closing-peek",
    src: "assets/broll/salesmartly-embedded-overview.mp4",
    start: 234.72,
    end: 238.84,
    mediaStart: 0.2,
    title: "用 SaleSmartly 接住 B2B 询盘",
    label: "最后一次露出",
    mode: "main"
  }
];

const beats = baseBeats.map((item) => remapSpan(item, 0.8)).filter(Boolean);
const broll = materializeBrollClips(baseBroll.map((item) => remapSpan(item, 1.0)).filter(Boolean));

const brollRanges = broll.map(({ start, end }) => ({ start, end }));
const beatRanges = beats.map(({ start, end }) => ({ start, end }));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function materializeBrollClips(items) {
  const outDir = path.join(job, "assets", "broll-clips");
  ensureDir(outDir);
  return items.map((item) => {
    const dur = Math.max(0.2, item.end - item.start);
    const relOut = `assets/broll-clips/${item.id}.mp4`;
    const absOut = path.join(job, relOut);
    const ready = fs.existsSync(absOut) && videoDuration(absOut) >= dur - 0.08;
    if (!ready) {
      execFileSync("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(item.mediaStart || 0),
        "-i",
        path.join(job, item.src),
        "-t",
        dur.toFixed(3),
        "-an",
        "-c:v",
        "libx264",
        "-r",
        "30",
        "-g",
        "30",
        "-keyint_min",
        "30",
        "-sc_threshold",
        "0",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        absOut
      ], { stdio: "inherit" });
    }
    return {
      ...item,
      src: relOut,
      sourceSrc: item.src,
      sourceMediaStart: item.mediaStart || 0,
      mediaStart: 0
    };
  });
}

function captionStart(item) {
  return Number(item.s ?? item.start);
}

function captionEnd(item) {
  return Number(item.e ?? item.end ?? captionStart(item) + Number(item.duration || 0));
}

function overlaps(start, end, ranges) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function renderCaptions() {
  return captions
    .map((item, index) => {
      const start = captionStart(item);
      const end = captionEnd(item);
      const dur = Math.max(0.1, end - start);
      const text = String(item.t ?? item.text ?? "").trim();
      if (!text) return "";
      const product = overlaps(start, end, brollRanges);
      const overBeat = overlaps(start, end, beatRanges);
      const classes = ["clip", "caption"];
      if (product) classes.push("caption-product");
      else if (overBeat) classes.push("caption-safe");
      return `<div id="caption-${index + 1}" class="${classes.join(" ")}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${1000 + index}">${escapeHtml(text)}</div>`;
    })
    .filter(Boolean)
    .join("\n        ");
}

function renderBeat(beat, index) {
  const id = `beat-${String(index + 1).padStart(2, "0")}`;
  const dur = beat.end - beat.start;
  const base = `id="${id}" class="clip beat beat-${beat.kind}" data-kind="${beat.kind}" data-start="${fmtTime(beat.start)}" data-duration="${fmtTime(dur)}" data-track-index="${100 + index}"`;
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  if (beat.kind === "hook") return `<section ${base}>${head}<p>${escapeHtml(beat.body)}</p><div class="stat">${escapeHtml(beat.stat)}</div></section>`;
  if (beat.kind === "duel") return `<section ${base}>${head}<div class="duel-row"><span>${escapeHtml(beat.bad)}</span><strong>${escapeHtml(beat.good)}</strong></div></section>`;
  if (beat.kind === "compare") return `<section ${base}>${head}<div class="compare-row"><span>${escapeHtml(beat.left)}</span><b>VS</b><strong>${escapeHtml(beat.right)}</strong></div></section>`;
  if (beat.kind === "chips") return `<section ${base}>${head}<div class="chip-row">${beat.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div></section>`;
  if (beat.kind === "flow") return `<section ${base}>${head}<div class="step-row">${beat.steps.map((step, i) => `<span><b>${i + 1}</b>${escapeHtml(step)}</span>`).join("")}</div></section>`;
  return `<section ${base}>${head}<p>${escapeHtml(beat.body || "")}</p></section>`;
}

function renderBroll(item, index) {
  const dur = item.end - item.start;
  if (useBakedBroll) {
    return `<section id="proof-frame-${escapeHtml(item.id)}" class="clip proof proof-frame proof-${escapeHtml(item.mode)}" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(dur)}" data-track-index="${300 + index}">
          <div class="proof-head"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.title)}</b></div>
          <div class="proof-sheen" data-layout-allow-overflow="true"></div>
        </section>`;
  }
  return `<video id="proof-video-${escapeHtml(item.id)}" class="clip proof proof-video proof-${escapeHtml(item.mode)}" src="${escapeHtml(item.src)}" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(dur)}" data-media-start="${fmtTime(item.mediaStart || 0)}" data-track-index="${320 + index}" muted playsinline preload="auto"></video>
        <section id="proof-frame-${escapeHtml(item.id)}" class="clip proof proof-frame proof-${escapeHtml(item.mode)}" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(dur)}" data-track-index="${300 + index}">
          <div class="proof-head"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.title)}</b></div>
          <div class="proof-sheen" data-layout-allow-overflow="true"></div>
        </section>`;
}

function inlineGsap() {
  const gsapPath = path.join(job, "vendor", "gsap.min.js");
  return fs
    .readFileSync(gsapPath, "utf8")
    .replaceAll("Math.random()", "0.5")
    .replaceAll("</script", "<\\/script");
}

function renderHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SaleSmartly 商单重剪 - commercial</title>
    <style>
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter-700-latin.woff2") format("woff2"); font-weight: 700; }
      @font-face { font-family: "LXGWWenKaiTC"; src: url("assets/fonts/LXGWWenKaiTC-400-latin.woff2") format("woff2"); font-weight: 400; }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #07100f; }
      #main { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #07100f; color: #f8fff5; font-family: Inter, LXGWWenKaiTC, "PingFang SC", sans-serif; letter-spacing: 0; }
      #video-wrap { position: absolute; inset: 0; z-index: 1; transform-origin: center 38%; will-change: transform, filter, opacity; }
      #talking-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.03) contrast(1.02); }
      #talking-pip { position: absolute; right: 134px; bottom: 238px; width: 220px; height: 220px; z-index: 8; object-fit: cover; object-position: center 24%; border-radius: 999px; border: 4px solid rgba(248,255,245,0.94); box-shadow: 0 16px 50px rgba(0,0,0,0.46); opacity: 0; visibility: hidden; }
      #talking-audio { display: none; }
      #scrim { position: absolute; inset: 0; z-index: 2; opacity: 0; pointer-events: none; background: linear-gradient(180deg, rgba(4, 12, 11, 0.34), rgba(4, 12, 11, 0.12) 32%, rgba(4, 12, 11, 0.78)); }
      .safe-guide { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: radial-gradient(circle at 50% 26%, rgba(42, 242, 161, 0.08), transparent 35%), linear-gradient(90deg, transparent, transparent 84%, rgba(0,0,0,0.16)); }
      .clip { opacity: 0; visibility: hidden; }
      #card-host { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
      .beat { position: absolute; left: 48px; right: 168px; bottom: 314px; max-height: 310px; padding: 20px 24px; border-radius: 8px; border: 1px solid rgba(216, 255, 225, 0.22); background: linear-gradient(135deg, rgba(8, 24, 22, 0.90), rgba(8, 24, 22, 0.68)); box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28); backdrop-filter: blur(8px); overflow: hidden; }
      .beat::before { content: ""; position: absolute; left: 0; top: 0; right: 0; height: 3px; background: linear-gradient(90deg, #2ef2a2, #ffe27a); }
      .kicker { color: #2ef2a2; font-size: 20px; line-height: 1; margin-bottom: 8px; font-weight: 700; }
      h2 { margin: 0; max-width: 820px; font-size: 38px; line-height: 1.06; font-weight: 700; }
      p { margin: 10px 0 0; max-width: 790px; color: #d8ffe1; font: 400 25px/1.16 LXGWWenKaiTC, "PingFang SC", sans-serif; }
      .stat { position: absolute; right: 20px; bottom: 24px; color: rgba(46, 242, 162, 0.22); font-size: 94px; line-height: 0.8; }
      .duel-row, .compare-row, .chip-row, .step-row { display: flex; gap: 10px; margin-top: 14px; align-items: stretch; flex-wrap: wrap; }
      .duel-row span, .compare-row span, .chip-row span, .step-row span { min-height: 44px; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(216, 255, 225, 0.20); background: rgba(255, 255, 255, 0.08); color: #d8ffe1; font-size: 22px; font-weight: 700; }
      .duel-row span { color: rgba(216, 255, 225, 0.58); text-decoration: line-through; }
      .duel-row strong, .compare-row strong { min-height: 44px; padding: 10px 14px; border-radius: 8px; color: #f8fff5; background: #123d31; border: 1px solid #2ef2a2; font-size: 22px; line-height: 1; display: inline-flex; align-items: center; }
      .compare-row b { display: grid; place-items: center; color: #ffe27a; font-size: 18px; }
      .step-row span { display: inline-flex; align-items: center; gap: 8px; }
      .step-row b { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 999px; background: #2ef2a2; color: #06100e; font-size: 14px; }
      .beat-product, .beat-warning, .beat-proof { top: 104px; bottom: auto; max-height: 190px; }
      .beat-cta { top: 180px; bottom: auto; }
      .proof { position: absolute; left: 0; right: 0; top: 0; height: 1920px; z-index: 4; border-radius: 0; overflow: hidden; transform-origin: center center; }
      .proof-frame { z-index: 5; background: transparent; box-shadow: none; }
      .proof-float { left: 0; right: 0; top: 0; height: 1920px; }
      .proof-head { position: absolute; left: 42px; right: 168px; top: 286px; min-height: 84px; z-index: 2; display: grid; align-content: center; gap: 4px; padding: 14px 18px; border-radius: 8px; background: linear-gradient(180deg, rgba(4, 12, 11, 0.94), rgba(4, 12, 11, 0.78)); color: #fff; box-shadow: 0 14px 44px rgba(0,0,0,0.28); }
      .proof-head span { color: #afffd6; font-size: 18px; font-weight: 700; }
      .proof-head b { font-size: 30px; line-height: 1.05; }
      .proof-video { object-fit: contain; object-position: center center; background: linear-gradient(180deg, #f6fafc, #e9f1f4); }
      .proof-video.proof-float { object-position: center center; }
      .proof-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(120deg, transparent 0%, transparent 43%, rgba(255,255,255,0.18) 50%, transparent 58%, transparent 100%); transform: translateX(-110%); }
      .caption { position: absolute; left: 64px; right: 188px; bottom: 318px; z-index: 6; color: #fffdf2; font-size: 38px; line-height: 1.13; font-weight: 700; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, 0.92), 0 8px 24px rgba(0, 0, 0, 0.78); }
      .caption-safe { bottom: 652px; font-size: 36px; }
      .caption-product { bottom: 480px; left: 64px; right: 188px; font-size: 34px; padding: 10px 14px; border-radius: 8px; background: rgba(3, 10, 9, 0.68); }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="${fmtTime(duration)}">
      <div id="video-wrap">
        <video id="talking-video" src="${escapeHtml(sourceVideo)}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="1" muted playsinline preload="auto"></video>
      </div>
      ${useBakedBroll ? "" : `<video id="talking-pip" src="${escapeHtml(sourceVideo)}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="3" muted playsinline preload="auto"></video>`}
      <audio id="talking-audio" src="${escapeHtml(sourceVideo)}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2" preload="auto"></audio>
      <div id="scrim"></div>
      <div class="safe-guide"></div>
      ${broll.map(renderBroll).join("\n      ")}
      <div id="card-host">
        ${beats.map(renderBeat).join("\n        ")}
        ${renderCaptions()}
      </div>
    </div>
    <script>${inlineGsap()}</script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const useBakedBroll = ${useBakedBroll ? "true" : "false"};
      const videoWrap = document.querySelector("#video-wrap");
      const talkingPip = document.querySelector("#talking-pip");
      const scrim = document.querySelector("#scrim");
      document.querySelectorAll(".clip").forEach((clip) => {
        const start = Number(clip.dataset.start || 0);
        const dur = Number(clip.dataset.duration || 0);
        if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return;
        tl.set(clip, { autoAlpha: 0 }, 0);
        tl.set(clip, { autoAlpha: 1 }, start);
        tl.set(clip, { autoAlpha: 0 }, start + dur);
      });
      document.querySelectorAll(".beat").forEach((card) => {
        const start = Number(card.dataset.start || 0);
        const dur = Number(card.dataset.duration || 0);
        const kind = card.dataset.kind || "statement";
        tl.from(card, { y: kind === "product" ? -24 : 26, scale: 0.985, duration: 0.36, ease: "expo.out" }, start + 0.06);
        tl.to(card.querySelectorAll("h2, p, .duel-row > *, .compare-row > *, .chip-row span, .step-row span, .stat"), { y: 0, opacity: 1, duration: 0.28, stagger: 0.04, ease: "power3.out" }, start + 0.16);
        tl.to(card, { y: kind === "product" ? -12 : 12, duration: 0.22, ease: "power3.in" }, start + Math.max(0.8, dur - 0.28));
      });
      document.querySelectorAll(".proof-frame").forEach((proof) => {
        const start = Number(proof.dataset.start || 0);
        const dur = Number(proof.dataset.duration || 0);
        tl.from(proof, { y: 22, scale: 0.985, duration: 0.36, ease: "expo.out" }, start + 0.08);
        tl.to(proof.querySelector(".proof-sheen"), { x: "115%", duration: 0.9, ease: "power2.out" }, start + 0.24);
        tl.to(proof, { y: -12, scale: 0.995, duration: 0.24, ease: "power3.in" }, start + Math.max(0.8, dur - 0.30));
        tl.to(scrim, { opacity: useBakedBroll ? 0.08 : 0.62, duration: 0.26, ease: "sine.out" }, start);
        tl.to(scrim, { opacity: 0, duration: 0.26, ease: "sine.in" }, start + Math.max(0.8, dur - 0.32));
        if (!useBakedBroll) {
          tl.to(videoWrap, { opacity: 0, duration: 0.22, ease: "sine.out" }, start);
          tl.to(talkingPip, { autoAlpha: 1, scale: 1, duration: 0.28, ease: "expo.out" }, start + 0.08);
          tl.to(talkingPip, { autoAlpha: 0, scale: 0.92, duration: 0.22, ease: "power3.in" }, start + Math.max(0.8, dur - 0.30));
          tl.to(videoWrap, { opacity: 1, duration: 0.28, ease: "power3.inOut" }, start + Math.max(0.9, dur - 0.34));
        }
      });
      document.querySelectorAll(".proof-video").forEach((video) => {
        const start = Number(video.dataset.start || 0);
        const dur = Number(video.dataset.duration || 0);
        tl.from(video, { opacity: 0, duration: 0.22, ease: "sine.out" }, start);
        tl.to(video, { scale: 1.018, duration: dur, ease: "none" }, start);
        tl.to(video, { opacity: 0, duration: 0.20, ease: "sine.in" }, start + Math.max(0.8, dur - 0.24));
      });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

ensureDir(path.join(job, "renders"));
ensureDir(path.join(job, "qa"));
ensureDir(path.join(job, "data"));
writeJson(path.join(job, "data", "commercial-broll-plan.json"), broll);
writeJson(path.join(job, "data", "commercial-beats.json"), beats);
writeJson(path.join(job, "project.json"), {
  ...readJson(path.join(job, "project.json")),
  title: "SaleSmartly 商单重剪 - commercial",
  duration,
  sourceVideo,
  outputName,
  downloadFolderName,
  delivery: {
    includeCover: true,
    coverFile,
    downloadsRoot: path.join(process.env.HOME || "", "Downloads")
  },
  qa: {
    sampleTimes: qaSampleTimes
  }
});
fs.writeFileSync(path.join(job, "package.json"), `${JSON.stringify({
  name: "salesmartly-commercial-refresh",
  private: true,
  type: "module",
  scripts: {
    check: "npx --yes hyperframes@0.5.6 lint && npx --yes hyperframes@0.5.6 validate && npx --yes hyperframes@0.5.6 inspect --samples 24 --timeout 60000",
    "render:review": `npx --yes hyperframes@0.5.6 render --fps 30 --quality draft --workers 4 --video-bitrate 10M --output renders/${reviewName}`,
    "render:final": `npx --yes hyperframes@0.5.6 render --fps 60 --quality standard --workers 8 --video-bitrate 24M --output renders/${outputName}`
  },
  dependencies: {
    hyperframes: "0.5.6"
  }
}, null, 2)}\n`);
fs.writeFileSync(path.join(job, "index.html"), renderHtml());
console.log(`Built ${path.join(job, "index.html")}`);
console.log(`Duration: ${duration.toFixed(3)}s`);
console.log(`Commercial beats: ${beats.length}, B-roll inserts: ${broll.length}, captions: ${captions.length}`);
