import fs from "node:fs";
import path from "node:path";
import { escapeHtml, fmtTime, readJson, videoDuration, writeJson } from "./lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourceJob = path.join(root, "jobs", "dji-20260704-douyin");
const job = path.join(root, "jobs", "dji-20260704-balanced-face-safe");
const arollAsset = "assets/aroll-front-focus.mp4";
const oldEdl = readJson(path.join(sourceJob, "data", "rough-cut-edl.json"));
const newEdl = readJson(path.join(job, "data", "rough-cut-edl-front-focus.json"));
const duration = videoDuration(path.join(job, arollAsset));

const sourceBeats = [
  { type: "statement", start: 0.0, end: 5.2, kicker: "开场判断", title: "AI 不会平均提效", body: "它放大的不是努力，是人的底层能力差。", accent: "绝对不可能" },
  { type: "panel", start: 16.2, end: 25.8, kicker: "现场案例", title: "老板装了工作流，员工仍然不用", items: ["Codex", "AI 视频剪辑", "skills 一装即用"], body: "工具已经在桌上，问题不在工具。", video: "soft" },
  { type: "chips", start: 29.0, end: 38.0, kicker: "我的制作链路", title: "Claude + Codex 已经能做成片", chips: ["没开剪映", "特效自动生成", "口播包装", "字幕节奏"], body: "所以我说它能用，但不是谁都能用好。" },
  { type: "hero", start: 38.0, end: 45.4, kicker: "不是个例", title: "这不是个例", number: "01", body: "从公司 AI 转型开始，苗头就已经出现。" },
  { type: "split", start: 57.9, end: 70.1, kicker: "核心比喻", title: "100 分乘 100，1 分也乘 100", left: { label: "强员工", title: "100 × 100", lines: ["速度变快", "边界变大", "更愿意独立完成"] }, right: { label: "弱员工", title: "1 × 100", lines: ["仍然要解释", "仍然要返工", "差距被放大"] } },
  { type: "duel", start: 70.1, end: 82.2, kicker: "组织后果", title: "强者不想再跟弱者协作", bad: "沟通成本", good: "一把梭哈做完", body: "不是态度问题，是时间账算不过来。" },
  { type: "pipeline", start: 93.0, end: 109.3, kicker: "真正卡点", title: "效率死在交接里", steps: ["个人提效", "解释需求", "返工确认", "整体变慢"], body: "把每个人都提效，不等于组织提效。" },
  { type: "statement", start: 114.4, end: 123.2, kicker: "判断标准", title: "无人监督也能跑，才叫工作流", body: "否则 AI 只是把手工活换了一个界面。", accent: "自己运行" },
  { type: "split", start: 129.5, end: 148.5, kicker: "行业边界", title: "UGC 能跑，不代表商单能直出", left: { label: "可标准化", title: "UGC / 口播", lines: ["节奏", "字幕", "轻包装"] }, right: { label: "仍需判断", title: "DTC / TVC", lines: ["策略", "品牌", "商单目标"] } },
  { type: "trio", start: 151.0, end: 161.2, kicker: "别信神话", title: "装一个工具，不会自动长出业务结果", columns: ["工具", "流程", "业务判断"], body: "AI 不是开关，它要接进公司的真实流程。" },
  { type: "diagram", start: 161.2, end: 178.8, kicker: "为什么不能套模板", title: "每家公司都不一样", nodes: ["业务流程", "人员组成", "历史包袱", "目标约束"], body: "同一个 Agent，到不同公司就是不同系统。" },
  { type: "panel", start: 181.0, end: 193.0, kicker: "知识资产", title: "知识在员工脑子里，就很难自动化", items: ["经验不可见", "判断不可复用", "交付不可稳定"], body: "老板要先把知识从人脑里抽出来。" },
  { type: "chips", start: 193.0, end: 213.0, kicker: "Claude Code 时代", title: "需求讲清 + Token 给够，Agent 才能跑", chips: ["Fable 5", "上下文", "执行预算", "需求描述"], body: "真正的门槛，是你能不能把需求说清楚。" },
  { type: "cta", start: 213.0, end: 230.9, kicker: "给老板的提醒", title: "先想清楚：你要提效人，还是重做流程？", body: "工具不是答案，工作流才是答案。", primary: "重做流程", secondary: "不要只装工具" },
  { type: "cta", start: 231.1, end: 255.5, kicker: "关注 Scott 出海", title: "我讲商业化 Agent，不讲玄学", body: "懂业务、懂产品、懂技术，想听真实落地就关注。", primary: "关注", secondary: "评论区留言" }
];

const beats = sourceBeats.map(remapBeat).filter(Boolean);
const cardRanges = beats.map((beat) => ({ start: beat.start, end: beat.end }));
const chapters = beats.map((beat, index) => ({
  start: beat.start,
  duration: round(beat.end - beat.start),
  num: String(index + 1).padStart(2, "0"),
  title: beat.title
}));
const overlays = beats.map((beat, index) => ({
  id: `beat-${String(index + 1).padStart(2, "0")}`,
  type: beat.type,
  start: beat.start,
  duration: round(beat.end - beat.start),
  kicker: beat.kicker,
  title: beat.title,
  placement: "bottom-face-safe"
}));
const captions = readJson(path.join(sourceJob, "data", "captions.json"))
  .map(remapCaption)
  .filter(Boolean)
  .map(fixCaptionTerms);

function remapBeat(beat) {
  const start = oldOutToNew(beat.start, "start");
  const end = oldOutToNew(beat.end, "end");
  if (end - start < 0.8) return null;
  return { ...beat, start: round(start), end: round(end) };
}

function remapCaption(item) {
  const start = oldOutToNew(captionStart(item), "start");
  const end = oldOutToNew(captionEnd(item), "end");
  if (end - start < 0.08) return null;
  return { ...item, s: round(start), e: round(Math.max(end, start + 0.12)) };
}

function fixCaptionTerms(item) {
  const text = String(item.t ?? item.text ?? "");
  if (text.includes("Opus 4")) {
    return { ...item, t: "但是大家看看最近新出的这个 Claude Code 的 Fable 5" };
  }
  if (text.includes("Sonnet 4")) {
    return { ...item, t: "对吧 Fable 5" };
  }
  return item;
}

function oldOutToNew(time, mode) {
  const sourceTime = oldOutToSource(time, mode);
  return sourceToNewOut(sourceTime, mode);
}

function oldOutToSource(time, mode) {
  const segment = oldEdl.find((item) => time >= item.outStart && time <= item.outEnd);
  if (segment) return Number(segment.sourceStart) + (time - Number(segment.outStart));
  const next = oldEdl.find((item) => item.outStart > time);
  if (mode === "start" && next) return Number(next.sourceStart);
  const prev = [...oldEdl].reverse().find((item) => item.outEnd < time);
  if (prev) return Number(prev.sourceEnd);
  return 0;
}

function sourceToNewOut(time, mode) {
  const segment = newEdl.find((item) => time >= item.sourceStart && time <= item.sourceEnd);
  if (segment) return Number(segment.outStart) + (time - Number(segment.sourceStart));
  const next = newEdl.find((item) => item.sourceStart > time);
  if (mode === "start" && next) return Number(next.outStart);
  const prev = [...newEdl].reverse().find((item) => item.sourceEnd < time);
  if (prev) return Number(prev.outEnd);
  return duration;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
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

function overlaps(start, end, ranges) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function captionStart(item) {
  return Number(item.s ?? item.start);
}

function captionEnd(item) {
  return Number(item.e ?? item.end ?? captionStart(item) + Number(item.duration || 0));
}

function renderCaptions() {
  return captions
    .map((item, index) => {
      const start = captionStart(item);
      const end = captionEnd(item);
      const dur = Math.max(0.1, end - start);
      const text = String(item.t ?? item.text ?? "").trim();
      const placement = overlaps(start, end, cardRanges) ? " caption-over-card" : "";
      return `<div id="caption-${index + 1}" class="clip caption${placement}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${1000 + index}" style="--clip-dur:${fmtTime(dur)}s">${escapeHtml(text)}</div>`;
    })
    .filter(Boolean)
    .join("\n        ");
}

function renderBeat(beat, index) {
  const id = `beat-${String(index + 1).padStart(2, "0")}`;
  const dur = beat.end - beat.start;
  const base = `id="${id}" class="clip beat beat-${beat.type}" data-kind="${beat.type}" data-start="${fmtTime(beat.start)}" data-duration="${fmtTime(dur)}" data-track-index="${100 + index}" style="--clip-dur:${fmtTime(dur)}s"`;
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  if (beat.type === "statement") {
    return `<section ${base}>${head}<p>${escapeHtml(beat.body)}</p><strong>${escapeHtml(beat.accent)}</strong></section>`;
  }
  if (beat.type === "hero") {
    return `<section ${base}>${head}<div class="hero-number">${escapeHtml(beat.number)}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "panel") {
    return `<section ${base}>${head}<div class="panel-list">${beat.items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "chips") {
    return `<section ${base}>${head}<div class="chip-grid">${beat.chips.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "split") {
    return `<section ${base}>${head}<div class="split-grid">${renderSplitSide(beat.left, "left")}<div class="vs">VS</div>${renderSplitSide(beat.right, "right")}</div></section>`;
  }
  if (beat.type === "duel") {
    return `<section ${base}>${head}<div class="duel-row"><div class="duel-bad">${escapeHtml(beat.bad)}</div><div class="duel-good">${escapeHtml(beat.good)}</div></div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "pipeline") {
    return `<section ${base}>${head}<div class="pipeline">${beat.steps.map((step, i) => `<div><b>${String(i + 1).padStart(2, "0")}</b><span>${escapeHtml(step)}</span></div>`).join("")}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "trio") {
    return `<section ${base}>${head}<div class="trio">${beat.columns.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "diagram") {
    return `<section ${base}>${head}<div class="diagram"><div class="center">Agent</div>${beat.nodes.map((item, i) => `<span class="node node-${i}">${escapeHtml(item)}</span>`).join("")}</div><p>${escapeHtml(beat.body)}</p></section>`;
  }
  if (beat.type === "cta") {
    return `<section ${base}>${head}<p>${escapeHtml(beat.body)}</p><div class="cta-row"><span>${escapeHtml(beat.primary)}</span><span>${escapeHtml(beat.secondary)}</span></div></section>`;
  }
  return "";
}

function renderSplitSide(side, name) {
  return `<div class="split-side ${name}"><small>${escapeHtml(side.label)}</small><b>${escapeHtml(side.title)}</b>${side.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`;
}

function renderMotionLayer(beat, index) {
  const dur = beat.end - beat.start;
  const start = fmtTime(beat.start);
  const durationText = fmtTime(dur);
  const mediaStart = fmtTime(beat.start);
  const id = `motion-${String(index + 1).padStart(2, "0")}`;
  return `<video id="${id}" class="clip motion-video motion-${beat.type}" src="${arollAsset}" data-start="${start}" data-duration="${durationText}" data-media-start="${mediaStart}" data-track-index="${20 + index}" muted playsinline preload="auto" style="--clip-dur:${durationText}s"></video>
      <div id="${id}-scrim" class="clip beat-scrim scrim-${beat.type}" data-start="${start}" data-duration="${durationText}" data-track-index="${60 + index}" style="--clip-dur:${durationText}s"></div>`;
}

function renderHtml() {
  const beatMarkup = beats.map(renderBeat).join("\n        ");
  const gsapPath = path.join(job, "vendor", "gsap.min.js");
  const gsapSource = fs.existsSync(gsapPath)
    ? fs.readFileSync(gsapPath, "utf8").replaceAll("Math.random()", "0.5").replaceAll("</script", "<\\/script")
    : "";
  const gsapScript = gsapSource
    ? `<script>${gsapSource}</script>`
    : `<script src="vendor/gsap.min.js"></script>`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI 不是给普通员工提效的工具 - Claude Glass</title>
    <style>
      @font-face { font-family: "LXGWWenKaiTC"; src: url("assets/fonts/LXGWWenKaiTC-400-latin.woff2") format("woff2"); font-weight: 400; }
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter-700-latin.woff2") format("woff2"); font-weight: 700; }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #211712; }
      #main { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #211712; color: #fff6e8; font-family: Inter, LXGWWenKaiTC, "PingFang SC", sans-serif; letter-spacing: 0; }
      #video-wrap { position: absolute; inset: 0; z-index: 1; transform-origin: center center; will-change: transform, filter; }
      #talking-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.02) contrast(1.02); }
      #talking-audio { display: none; }
      #scrim { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0; background: linear-gradient(180deg, rgba(28, 17, 10, 0.68), rgba(28, 17, 10, 0.18) 38%, rgba(16, 11, 8, 0.74)); }
      .warm-vignette { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: radial-gradient(circle at 50% 30%, rgba(255, 200, 132, 0.10), transparent 38%), linear-gradient(180deg, rgba(255, 242, 218, 0.02), rgba(0, 0, 0, 0.25)); }
      .clip { opacity: 0; visibility: hidden; }
      #card-host { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
      .beat { position: absolute; left: 54px; right: 54px; bottom: 285px; min-height: 330px; padding: 30px 32px; border-radius: 8px; border: 1px solid rgba(255, 236, 205, 0.28); background: linear-gradient(135deg, rgba(84, 52, 31, 0.72), rgba(34, 22, 16, 0.50)); box-shadow: 0 26px 90px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.16); backdrop-filter: blur(14px); overflow: hidden; }
      .beat::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, #f4b36d, #fff0cf, #b98350); }
      .kicker { color: #ffe0b2; font-size: 24px; line-height: 1; font-weight: 700; margin-bottom: 14px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.36); }
      h2 { margin: 0; max-width: 880px; font-size: 58px; line-height: 1.04; font-weight: 700; }
      p { margin: 18px 0 0; max-width: 780px; color: #ffe9c7; font-family: LXGWWenKaiTC, "PingFang SC", sans-serif; font-size: 32px; line-height: 1.25; }
      .beat strong { display: inline-flex; align-items: center; min-height: 66px; margin-top: 24px; padding: 0 22px; border-radius: 8px; color: #fff6e8; background: #5f351c; border: 1px solid #f6c07f; font-size: 38px; line-height: 1; }
      .beat-statement { top: 300px; bottom: auto; min-height: 520px; }
      .beat-hero { top: 245px; bottom: auto; min-height: 590px; }
      .hero-number { position: absolute; right: 28px; bottom: 58px; color: rgba(255, 234, 196, 0.16); font-size: 238px; line-height: 0.8; font-weight: 700; }
      .panel-list, .chip-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
      .panel-list span, .chip-grid span, .cta-row span { display: inline-flex; align-items: center; min-height: 52px; padding: 0 18px; border-radius: 8px; border: 1px solid rgba(255, 236, 205, 0.24); background: rgba(255, 244, 226, 0.13); color: #fff3df; font-size: 27px; font-weight: 700; }
      .beat-panel { left: 44px; right: 376px; top: 260px; bottom: auto; min-height: 470px; }
      .beat-chips { top: 270px; bottom: auto; }
      .split-grid { display: grid; grid-template-columns: 1fr 72px 1fr; gap: 14px; align-items: stretch; margin-top: 24px; }
      .split-side { min-height: 226px; padding: 22px; border-radius: 8px; border: 1px solid rgba(255, 236, 205, 0.22); background: rgba(35, 22, 15, 0.48); display: grid; align-content: start; gap: 10px; }
      .split-side small { color: #f0b173; font-size: 22px; font-weight: 700; }
      .split-side b { color: #fff6e8; font-size: 40px; line-height: 1; }
      .split-side span { color: #ffe9c7; font-size: 25px; font-family: LXGWWenKaiTC, sans-serif; }
      .right { border-color: rgba(246, 192, 127, 0.48); background: rgba(95, 57, 30, 0.38); }
      .vs { align-self: center; justify-self: center; color: #f6c07f; font-size: 26px; font-weight: 700; }
      .duel-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 26px; }
      .duel-row div { min-height: 120px; padding: 24px; border-radius: 8px; font-size: 38px; line-height: 1.05; font-weight: 700; }
      .duel-bad { color: rgba(255, 232, 208, 0.48); border: 1px solid rgba(255, 232, 208, 0.16); background: rgba(38, 24, 17, 0.46); text-decoration: line-through; }
      .duel-good { color: #fff6e8; background: #5f351c; border: 1px solid #f6c07f; }
      .pipeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 26px; }
      .pipeline div, .trio span { min-height: 120px; border-radius: 8px; padding: 16px; background: rgba(255, 244, 226, 0.12); border: 1px solid rgba(255, 236, 205, 0.22); }
      .pipeline b { display: block; color: #f6c07f; font-size: 20px; margin-bottom: 12px; }
      .pipeline span, .trio span { display: block; color: #fff6e8; font-size: 26px; line-height: 1.12; font-weight: 700; }
      .trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 26px; }
      .diagram { position: relative; height: 250px; margin-top: 24px; }
      .center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; place-items: center; width: 180px; height: 96px; border-radius: 8px; color: #fff6e8; background: #5f351c; border: 1px solid #f6c07f; font-size: 34px; font-weight: 700; }
      .node { position: absolute; display: grid; place-items: center; width: 210px; min-height: 66px; border-radius: 8px; border: 1px solid rgba(255, 236, 205, 0.24); background: rgba(255, 244, 226, 0.13); font-size: 24px; font-weight: 700; }
      .node-0 { left: 38px; top: 22px; } .node-1 { right: 38px; top: 22px; } .node-2 { left: 38px; bottom: 22px; } .node-3 { right: 38px; bottom: 22px; }
      .cta-row { display: flex; gap: 12px; margin-top: 26px; }
      .cta-row span:first-child { color: #fff6e8; background: #5f351c; border-color: #f6c07f; }
	      .caption { position: absolute; left: 78px; right: 136px; bottom: 410px; z-index: 5; color: #fff8ef; font-size: 46px; line-height: 1.16; font-weight: 700; text-shadow: 0 3px 0 rgba(35, 19, 8, 0.92), 0 8px 24px rgba(0, 0, 0, 0.75); }
	      /* 修正版：卡片只进底部安全区，不再挡脸。 */
	      #scrim { background: linear-gradient(180deg, rgba(28, 17, 10, 0), rgba(28, 17, 10, 0) 58%, rgba(18, 11, 7, 0.76)); }
	      .warm-vignette { background: linear-gradient(180deg, rgba(255, 242, 218, 0.01), rgba(0, 0, 0, 0.18)); }
	      .beat,
	      .beat-statement,
	      .beat-hero,
	      .beat-panel,
	      .beat-chips {
	        left: 46px;
	        right: 46px;
	        top: auto;
	        bottom: 54px;
	        min-height: 0;
	        max-height: 360px;
	        padding: 20px 24px;
	        border-radius: 8px;
	        background: linear-gradient(135deg, rgba(74, 45, 27, 0.72), rgba(24, 15, 10, 0.58));
	        backdrop-filter: blur(10px);
	      }
	      .kicker { font-size: 20px; margin-bottom: 8px; }
	      h2 { max-width: 960px; font-size: 38px; line-height: 1.06; }
	      p { margin-top: 10px; max-width: 900px; font-size: 25px; line-height: 1.16; }
	      .beat strong { min-height: 44px; margin-top: 12px; padding: 0 16px; font-size: 27px; }
	      .hero-number { right: 24px; bottom: 20px; font-size: 92px; opacity: 0.35; }
	      .panel-list, .chip-grid { gap: 9px; margin-top: 12px; }
	      .panel-list span, .chip-grid span, .cta-row span { min-height: 40px; padding: 0 13px; font-size: 21px; }
	      .split-grid { grid-template-columns: 1fr 48px 1fr; gap: 10px; margin-top: 12px; }
	      .split-side { min-height: 116px; padding: 13px; gap: 5px; }
	      .split-side small { font-size: 17px; }
	      .split-side b { font-size: 27px; }
	      .split-side span { font-size: 19px; }
	      .vs { font-size: 20px; }
	      .duel-row { gap: 10px; margin-top: 12px; }
	      .duel-row div { min-height: 76px; padding: 14px; font-size: 27px; }
	      .pipeline { gap: 8px; margin-top: 12px; }
	      .pipeline div, .trio span { min-height: 78px; padding: 10px; }
	      .pipeline b { font-size: 16px; margin-bottom: 7px; }
	      .pipeline span, .trio span { font-size: 20px; line-height: 1.08; }
	      .trio { gap: 8px; margin-top: 12px; }
	      .diagram { height: 140px; margin-top: 12px; }
	      .center { width: 116px; height: 60px; font-size: 23px; }
	      .node { width: 168px; min-height: 44px; font-size: 18px; }
	      .node-0 { left: 28px; top: 8px; } .node-1 { right: 28px; top: 8px; } .node-2 { left: 28px; bottom: 8px; } .node-3 { right: 28px; bottom: 8px; }
	      .cta-row { gap: 10px; margin-top: 14px; }
	      .caption { left: 64px; right: 64px; bottom: 148px; font-size: 40px; line-height: 1.12; text-align: center; }
	      .caption-over-card { bottom: 430px; font-size: 38px; }
	    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="${fmtTime(duration)}">
      <div id="video-wrap">
        <video id="talking-video" src="${arollAsset}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="1" muted playsinline preload="auto"></video>
      </div>
      <audio id="talking-audio" src="${arollAsset}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2" preload="auto"></audio>
      <div id="scrim"></div>
      <div class="warm-vignette"></div>
      <div id="card-host">
        ${beatMarkup}
        ${renderCaptions()}
      </div>
    </div>
    ${gsapScript}
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const videoWrap = document.querySelector("#video-wrap");
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
	        tl.from(card, { y: 28, scale: 0.985, duration: 0.36, ease: "expo.out" }, start + 0.08);
	        tl.to(card, { y: 16, duration: 0.22, ease: "power3.in" }, start + Math.max(0.8, dur - 0.28));
	        tl.from(card.querySelectorAll("h2, p, strong, .panel-list span, .chip-grid span, .split-side, .duel-row div, .pipeline div, .trio span, .node, .cta-row span"), { y: 12, opacity: 0, duration: 0.26, stagger: 0.035, ease: "power3.out" }, start + 0.16);
	        tl.to(scrim, { opacity: 0.28, duration: 0.24, ease: "sine.out" }, start);
	        tl.to(scrim, { opacity: 0, duration: 0.24, ease: "sine.in" }, start + Math.max(0.8, dur - 0.30));
	        tl.to(videoWrap, { scale: 1.006, duration: 0.36, ease: "sine.out" }, start);
	        tl.to(videoWrap, { scale: 1, duration: 0.30, ease: "sine.inOut" }, start + Math.max(0.9, dur - 0.34));
      });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}

ensureDir(job);
ensureDir(path.join(job, "assets", "fonts"));
ensureDir(path.join(job, "data"));
ensureDir(path.join(job, "vendor"));
ensureDir(path.join(job, "renders"));
ensureDir(path.join(job, "qa"));
copyOrLink(path.join(sourceJob, "assets", "aroll.mp4"), path.join(job, "assets", "aroll.mp4"));
for (const font of ["LXGWWenKaiTC-400-latin.woff2", "Inter-700-latin.woff2"]) {
  copyOrLink(
    path.join(process.env.HOME || "", ".agents/skills/talking-head-recut/assets/fonts", font),
    path.join(job, "assets", "fonts", font)
  );
}
writeJson(path.join(job, "data", "beats.json"), beats);
writeJson(path.join(job, "data", "chapters.json"), chapters);
writeJson(path.join(job, "data", "overlays.json"), overlays);
writeJson(path.join(job, "data", "captions.json"), captions);
writeJson(path.join(job, "project.json"), {
  title: "AI 不是给普通员工提效的工具",
  slug: "dji-20260704-balanced-face-safe",
  platform: "douyin",
  width: 1080,
  height: 1920,
  duration,
  sourceVideo: arollAsset,
  style: "talkinghead-edit claude warm glass balanced face safe full captions front focus fable5",
  outputName: "final-balanced-face-safe-front-focus-fable5-full-captions-60fps.mp4",
  downloadFolderName: "2026-07-05-AI不是给普通员工提效-抖音成片-前段聚焦Fable5全字幕版"
});
fs.writeFileSync(path.join(job, "package.json"), `${JSON.stringify({
  name: "talking-head-job-balanced-face-safe",
  private: true,
  type: "module",
  scripts: {
    check: "npx --yes hyperframes@0.5.6 lint && npx --yes hyperframes@0.5.6 validate && npx --yes hyperframes@0.5.6 inspect --samples 20 --timeout 60000",
    "render:review": "npx --yes hyperframes@0.5.6 render --fps 30 --quality draft --workers 4 --video-bitrate 8M --output renders/review-balanced-face-safe-30fps.mp4",
    "render:final": "npx --yes hyperframes@0.5.6 render --fps 60 --quality standard --workers 4 --video-bitrate 24M --output renders/final-balanced-face-safe-front-focus-fable5-full-captions-60fps.mp4"
  },
  dependencies: {
    hyperframes: "0.5.6"
  }
}, null, 2)}\n`);
fs.writeFileSync(path.join(job, "index.html"), renderHtml());
