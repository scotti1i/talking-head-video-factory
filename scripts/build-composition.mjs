import fs from "node:fs";
import path from "node:path";
import {
  escapeHtml,
  fmtTime,
  parseArgs,
  readJson,
  readJsonArray,
  resolveJob,
  seconds,
  videoDuration
} from "./lib.mjs";
import { isHudOverlay, renderHudCss, renderHudOverlay, renderMotionScript } from "./hud-overlays.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const configPath = path.join(jobDir, "project.json");
const outputHtmlPath = path.join(jobDir, args.output || "index.html");

if (!fs.existsSync(configPath)) {
  console.error(`Missing project.json: ${configPath}`);
  process.exit(1);
}

const config = readJson(configPath);
const sourceVideo = path.join(jobDir, config.sourceVideo || "assets/aroll.mp4");
const roughCutPath = path.join(jobDir, "data", "rough-cut-edl.json");
const sourceVideoOnly = Boolean(args["source-video-only"] || args["single-source"]);
const useOriginals = Boolean(args["use-originals"]);
const roughCutSegments =
  !sourceVideoOnly && fs.existsSync(roughCutPath) ? normalizeRoughCut(readJsonArray(roughCutPath)) : [];

if (!roughCutSegments.length && !fs.existsSync(sourceVideo)) {
  console.error(`Missing source video: ${sourceVideo}`);
  console.error("Put your edited A-roll at the path above before building.");
  process.exit(1);
}

const duration = config.duration ? seconds(config.duration) : roughCutDuration(roughCutSegments) || videoDuration(sourceVideo);
const width = Number(config.width || 1080);
const height = Number(config.height || 1920);
const layout = config.layout || (width > height ? "horizontal" : "vertical");
const captions = readJsonArray(path.join(jobDir, "data", "captions.json"));
const chapters = readJsonArray(path.join(jobDir, "data", "chapters.json"));
const overlays = readJsonArray(path.join(jobDir, "data", "overlays.json"));
const demoClips = readJsonArray(path.join(jobDir, "data", "demo-clips.json"));
const audioCues = readJsonArray(path.join(jobDir, "data", "audio-cues.json"));
const captionConfig = config.caption || {};
const maxChars = Number(captionConfig.maxCharsPerLine || 18);

const hideRanges = [
  ...(captionConfig.hideDuring || []),
  ...overlays
    .filter((overlay) => overlay.hideCaptions !== false)
    .map((overlay) => ({
      start: seconds(overlay.start),
      end: seconds(overlay.start) + seconds(overlay.duration || 5)
    })),
  ...demoClips
    .filter((clip) => clip.hideCaptions !== false)
    .map((clip) => ({
      start: seconds(clip.start),
      end: seconds(clip.start) + seconds(clip.duration || 5)
    }))
];

function overlapsAny(start, end, ranges) {
  return ranges.some((range) => {
    const rangeStart = seconds(range.start);
    const rangeEnd = range.end == null ? rangeStart + seconds(range.duration || 0) : seconds(range.end);
    return start < rangeEnd && end > rangeStart;
  });
}

function wrapText(text, limit) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return escapeHtml(clean.slice(0, Math.max(1, limit * 2)));
}

function captionStart(item) {
  return seconds(item.s ?? item.start);
}

function captionEnd(item) {
  if (item.e != null || item.end != null) return seconds(item.e ?? item.end);
  return captionStart(item) + seconds(item.duration);
}

function renderChapters() {
  return chapters
    .map((chapter, index) => {
      const start = seconds(chapter.start);
      const dur = seconds(chapter.duration || 4.5);
      return `<div id="chapter-${index + 1}" class="clip chapter-chip" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${20 + index}"><div class="chapter-num">${escapeHtml(chapter.num || String(index + 1).padStart(2, "0"))}</div><div class="chapter-copy">${escapeHtml(chapter.title)}</div></div>`;
    })
    .join("\n        ");
}

function renderCaptions() {
  if (captionConfig.enabled === false) return "";
  return captions
    .map((item, index) => {
      const start = captionStart(item);
      const end = captionEnd(item);
      if (overlapsAny(start, end, hideRanges)) return "";
      const dur = Math.max(0.1, end - start);
      return `<div id="caption-${String(index + 1).padStart(3, "0")}" class="clip caption caption-clip" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${1000 + index + 1}">${wrapText(item.t ?? item.text, maxChars)}</div>`;
    })
    .filter(Boolean)
    .join("\n        ");
}

function renderPills(items, className = "guide-pill") {
  return (items || []).map((item) => `<span class="${className}">${escapeHtml(item)}</span>`).join("");
}

function renderVisual(visual = {}) {
  const kind = visual.kind || "flow";
  if (kind === "platform-map") {
    return `<div class="guide-platform-map">
            <div class="guide-pill-row">${renderPills(visual.nodes)}</div>
            <div class="guide-arrow-label">${escapeHtml(visual.connector || "导向")}</div>
            <div class="guide-result">${escapeHtml(visual.result || "")}</div>
          </div>`;
  }
  if (kind === "split") {
    const left = visual.left || {};
    const right = visual.right || {};
    return `<div class="guide-split">
            ${renderSplitSide(left, "left")}
            <div class="guide-vs">VS</div>
            ${renderSplitSide(right, "right")}
          </div>`;
  }
  if (kind === "equation") {
    return `<div class="guide-equation">
            <div class="guide-eq-side"><span>${escapeHtml(visual.leftLabel || "")}</span><strong>${escapeHtml(visual.leftValue || "")}</strong></div>
            <div class="guide-eq-arrow">→</div>
            <div class="guide-eq-side is-hot"><span>${escapeHtml(visual.rightLabel || "")}</span><strong>${escapeHtml(visual.rightValue || "")}</strong></div>
          </div>`;
  }
  if (kind === "funnel") {
    return `<div class="guide-funnel">${(visual.steps || [])
      .map((step, index) => `<div class="funnel-step" style="--step:${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(step)}</div>`)
      .join("")}</div>`;
  }
  if (kind === "asset") {
    return `<div class="guide-asset">
            <div class="asset-sources">${renderPills(visual.sources, "asset-source")}</div>
            <div class="asset-pool">${escapeHtml(visual.pool || "公司客户池")}</div>
            <div class="asset-items">${renderPills(visual.assets, "asset-chip")}</div>
          </div>`;
  }
  if (kind === "hub") {
    return `<div class="guide-hub">
            <div class="hub-center">${escapeHtml(visual.center || "")}</div>
            <div class="hub-nodes">${renderPills(visual.nodes, "hub-node")}</div>
          </div>`;
  }
  return `<div class="guide-flow">${(visual.steps || [])
    .map((step, index) => `<div class="flow-step"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(step)}</div>`)
    .join("")}</div>`;
}

function renderSplitSide(side, variant) {
  const items = Array.isArray(side.items)
    ? `<div class="split-items">${side.items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  return `<div class="split-side is-${variant}">
            <div class="split-label">${escapeHtml(side.label || "")}</div>
            <div class="split-title">${escapeHtml(side.title || "")}</div>
            ${items}
          </div>`;
}

function renderOverlays() {
  return overlays
    .map((overlay, index) => {
      const bullets = Array.isArray(overlay.bullets)
        ? `<ul>${overlay.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      if (isHudOverlay(overlay)) {
        return renderHudOverlay(overlay, index);
      }
      if (overlay.visual) {
        return `<div id="overlay-${escapeHtml(overlay.id || index + 1)}" class="clip logic-guide logic-${escapeHtml(overlay.visual.kind || "flow")}" data-start="${fmtTime(overlay.start)}" data-duration="${fmtTime(overlay.duration || 5)}" data-track-index="${300 + index}">
          <div class="guide-kicker">${escapeHtml(overlay.kicker || "逻辑引导")}</div>
          <div class="guide-title">${escapeHtml(overlay.title || "")}</div>
          ${overlay.body ? `<div class="guide-body">${escapeHtml(overlay.body)}</div>` : ""}
          ${renderVisual(overlay.visual)}
        </div>`;
      }
      return `<div id="overlay-${escapeHtml(overlay.id || index + 1)}" class="clip helper-card" data-start="${fmtTime(overlay.start)}" data-duration="${fmtTime(overlay.duration || 5)}" data-track-index="${300 + index}">
          <div class="helper-kicker">${escapeHtml(overlay.kicker || "理解辅助")}</div>
          <div class="helper-title">${escapeHtml(overlay.title || "")}</div>
          <div class="helper-body">${escapeHtml(overlay.body || "")}</div>
          ${bullets}
        </div>`;
    })
    .join("\n        ");
}

function renderDemoClips() {
  return demoClips
    .map((clip, index) => {
      const start = seconds(clip.start);
      const dur = seconds(clip.duration || 8);
      const asset = clip.asset || clip.source;
      if (!asset) throw new Error(`demo clip ${index + 1} is missing asset/source`);
      const assetPath = path.join(jobDir, asset);
      if (!fs.existsSync(assetPath)) throw new Error(`demo clip ${index + 1} asset not found: ${assetPath}`);
      const id = cssToken(clip.id || String(index + 1));
      const isVideo = isVideoAsset(asset);
      const focus = cssToken(clip.focus || "wide");
      const scale = Number(clip.scale || 1.02);
      const position = clip.position || "50% 50%";
      const trackBase = 440 + index * 4;
      const badges = Array.isArray(clip.badges)
        ? `<div class="demo-badges">${clip.badges.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
        : "";
      const mediaStart =
        isVideo && clip.mediaStart != null ? ` data-media-start="${fmtTime(seconds(clip.mediaStart))}"` : "";
      const demoId = escapeHtml(id);
      const mask = isVideo
        ? `<div id="demo-mask-${demoId}" class="clip demo-mask" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${trackBase + 2}" data-demo-id="${demoId}"></div>`
        : "";
      const videoMedia = isVideo
        ? `<video id="demo-video-${demoId}" class="clip demo-media-video demo-focus-${focus}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}"${mediaStart} data-track-index="${trackBase + 1}" data-demo-id="${demoId}" src="${escapeHtml(asset)}" muted playsinline style="--demo-position:${escapeHtml(position)};"></video>`
        : "";
      const frameMedia = isVideo
        ? `<div class="demo-video-slot"></div>`
        : `<img class="demo-media" src="${escapeHtml(asset)}" alt="" />`;
      return `${mask}
        ${videoMedia}
        <div id="demo-${demoId}" class="clip demo-panel demo-focus-${focus}${isVideo ? " is-video-demo" : ""}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${trackBase}" data-demo-id="${demoId}" style="--demo-scale:${scale}; --demo-position:${escapeHtml(position)};">
          <div class="demo-head">
            <div class="demo-kicker">${escapeHtml(clip.kicker || "软件演示占位")}</div>
            <div class="demo-title">${escapeHtml(clip.title || "")}</div>
          </div>
          <div class="demo-frame">
            ${frameMedia}
            ${badges}
          </div>
          ${clip.body ? `<div class="demo-note">${escapeHtml(clip.body)}</div>` : ""}
        </div>`;
    })
    .join("\n        ");
}

function renderAudioCues() {
  return audioCues
    .map((cue, index) => {
      const asset = cue.asset || cue.source;
      if (!asset) throw new Error(`audio cue ${index + 1} is missing asset/source`);
      const assetPath = path.join(jobDir, asset);
      if (!fs.existsSync(assetPath)) throw new Error(`audio cue ${index + 1} asset not found: ${assetPath}`);
      const start = seconds(cue.start);
      const dur = seconds(cue.duration || 0.4);
      const volume = Number(cue.volume ?? 0.08);
      const id = cssToken(cue.id || String(index + 1));
      return `<audio id="audio-cue-${escapeHtml(id)}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${760 + index}" src="${escapeHtml(asset)}" data-volume="${volume}"></audio>`;
    })
    .join("\n      ");
}

function cssToken(input) {
  return String(input || "default").replace(/[^a-z0-9_-]+/gi, "-");
}

function isVideoAsset(asset) {
  return /\.(mp4|m4v|mov|webm)$/i.test(String(asset || "").split("?")[0]);
}

function normalizeRoughCut(segments) {
  let cursor = 0;
  return segments.map((segment, index) => {
    const source = useOriginals && segment.original ? segment.original : segment.proxy || segment.source;
    if (!source) throw new Error(`rough-cut segment ${index + 1} is missing source/proxy/original`);
    const sourceStart = seconds(segment.sourceStart ?? segment.s ?? 0);
    const duration =
      segment.duration != null ? seconds(segment.duration) : seconds(segment.sourceEnd ?? segment.e) - sourceStart;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`rough-cut segment ${index + 1} has invalid duration`);
    }
    const outStart = cursor;
    cursor = outStart + duration;
    const filePath = path.join(jobDir, source);
    if (!fs.existsSync(filePath)) {
      throw new Error(`rough-cut segment ${index + 1} source not found: ${filePath}`);
    }
    return {
      ...segment,
      id: segment.id || `seg-${String(index + 1).padStart(3, "0")}`,
      source,
      sourceStart,
      duration,
      outStart
    };
  });
}

function roughCutDuration(segments) {
  return segments.reduce((max, segment) => Math.max(max, segment.outStart + segment.duration), 0);
}

function renderRoughCutMedia(segments) {
  const videoClips = segments
    .map((segment, index) => {
      const id = escapeHtml(segment.id);
      const src = escapeHtml(segment.source);
      return `<video id="video-${id}" class="clip aroll raw-clip" data-start="${fmtTime(segment.outStart)}" data-duration="${fmtTime(segment.duration)}" data-media-start="${fmtTime(segment.sourceStart)}" data-track-index="${10 + index}" src="${src}" preload="none" muted playsinline></video>`;
    })
    .join("\n      ");
  const audioClips = segments
    .map((segment, index) => {
      const id = escapeHtml(segment.id);
      const src = escapeHtml(segment.source);
      return `<audio id="audio-${id}" data-start="${fmtTime(segment.outStart)}" data-duration="${fmtTime(segment.duration)}" data-media-start="${fmtTime(segment.sourceStart)}" data-track-index="${200 + index}" src="${src}" preload="none" data-volume="1"></audio>`;
    })
    .join("\n      ");
  return `${videoClips}
      ${audioClips}
      <div id="shade" class="clip shade" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2"></div>`;
}

const sourceSrc = escapeHtml(config.sourceVideo || "assets/aroll.mp4");
const horizontalBgSrc = "assets/horizontal-bg.jpg";
const hasHorizontalBg = layout === "horizontal" && fs.existsSync(path.join(jobDir, horizontalBgSrc));
const horizontalTitleHtml =
  layout === "horizontal"
    ? `<div id="horizontal-title-card" class="clip horizontal-title-card" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="20">
          <div class="title-kicker">技术拆解</div>
          <div class="title-main">${escapeHtml(config.title || "Talking Head Video")}</div>
          <div class="title-points">
            <span>权限</span>
            <span>数据</span>
            <span>API</span>
            <span>工作流</span>
          </div>
        </div>`
    : "";
const mediaHtml =
  roughCutSegments.length
    ? renderRoughCutMedia(roughCutSegments)
    : layout === "horizontal"
    ? `${hasHorizontalBg ? `<img id="aroll-bg-image" class="clip aroll-bg" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="0" src="${horizontalBgSrc}" alt="" />` : ""}
      <video id="aroll-video" class="clip aroll" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="1" src="${sourceSrc}" muted playsinline></video>
      <audio id="aroll-audio" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2" src="${sourceSrc}" data-volume="1"></audio>
      <div id="shade" class="clip shade" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="3"></div>`
    : `<video id="aroll-video" class="clip aroll" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="0" src="${sourceSrc}" muted playsinline></video>
      <audio id="aroll-audio" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="1" src="${sourceSrc}" data-volume="1"></audio>
      <div id="shade" class="clip shade" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2"></div>`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(config.title || "Talking Head Video")}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #07110f; }
      #main {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #07110f;
        font-family: Inter, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
        color: #f5f7ef;
      }
      .aroll {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }
      .aroll-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(36px) saturate(0.9) brightness(0.56);
        transform: scale(1.12);
        opacity: 0.86;
        z-index: 0;
      }
      .shade {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(7, 17, 15, 0.18), rgba(7, 17, 15, 0) 28%, rgba(7, 17, 15, 0.20) 100%),
          radial-gradient(circle at 50% 78%, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.24));
      }
      .overlay-root {
        position: absolute;
        inset: 0;
        z-index: 3;
        pointer-events: none;
      }
      .overlay-root .clip {
        opacity: 0;
        visibility: hidden;
      }
      .chapter-chip {
        position: absolute;
        left: 64px;
        top: 146px;
        width: 540px;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 18px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.22);
        background: rgba(7, 17, 15, 0.28);
        backdrop-filter: blur(4px);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.20);
      }
      .chapter-num {
        color: #2ef2a2;
        font-size: 34px;
        line-height: 1;
        font-weight: 900;
        font-family: Inter, "DIN Alternate", sans-serif;
      }
      .chapter-copy {
        font-size: 28px;
        line-height: 1.12;
        font-weight: 800;
      }
      .caption {
        position: absolute;
        left: 82px;
        right: 150px;
        bottom: 420px;
        z-index: 4;
        padding: 0;
        color: #f7f9f0;
        font-size: 48px;
        line-height: 1.18;
        font-weight: 900;
        text-align: left;
        text-shadow:
          0 3px 0 rgba(0, 0, 0, 0.92),
          0 7px 22px rgba(0, 0, 0, 0.88);
        letter-spacing: 0;
      }
      .helper-card {
        position: absolute;
        left: 64px;
        bottom: 360px;
        width: 432px;
        max-height: 360px;
        overflow: hidden;
        padding: 18px 18px 18px 20px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.22);
        background: rgba(7, 17, 15, 0.94);
        backdrop-filter: blur(4px);
        box-shadow: 0 20px 55px rgba(0, 0, 0, 0.20);
      }
      .helper-kicker {
        color: #2ef2a2;
        font-size: 18px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 10px;
      }
      .helper-title {
        font-size: 30px;
        line-height: 1.08;
        font-weight: 900;
        margin-bottom: 10px;
      }
      .helper-body {
        color: #f5f7ef;
        font-size: 21px;
        line-height: 1.28;
        font-weight: 700;
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(7, 17, 15, 0.92);
      }
      .helper-card ul {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }
      .helper-card li {
        color: #f5f7ef;
        font-size: 20px;
        line-height: 1.18;
        font-weight: 800;
        padding: 4px 8px 4px 18px;
        position: relative;
        border-radius: 6px;
        background: rgba(7, 17, 15, 0.92);
      }
      .helper-card li::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.55em;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ffcb5c;
      }
      .logic-guide {
        position: absolute;
        left: 58px;
        bottom: 250px;
        width: 620px;
        max-height: 392px;
        overflow: hidden;
        padding: 18px 20px 20px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.22);
        background: rgba(7, 17, 15, 0.88);
        backdrop-filter: blur(5px);
        box-shadow: 0 22px 62px rgba(0, 0, 0, 0.24);
      }
      .demo-mask {
        position: absolute;
        inset: 0;
        z-index: 3;
        pointer-events: none;
        background:
          radial-gradient(circle at 50% 50%, rgba(46, 242, 162, 0.12), transparent 38%),
          linear-gradient(180deg, rgba(7, 17, 15, 0.64), rgba(7, 17, 15, 0.50) 50%, rgba(7, 17, 15, 0.68));
        backdrop-filter: blur(3px);
      }
      .demo-panel {
        position: absolute;
        left: 42px;
        right: 42px;
        top: 590px;
        bottom: auto;
        z-index: 6;
        padding: 14px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.24);
        background: rgba(7, 17, 15, 0.62);
        backdrop-filter: blur(7px);
        box-shadow: 0 28px 94px rgba(0, 0, 0, 0.44), 0 0 32px rgba(46, 242, 162, 0.10);
        overflow: hidden;
      }
      .demo-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 10px;
      }
      .demo-kicker {
        flex: 0 0 auto;
        color: #6dffc2;
        font-size: 18px;
        line-height: 1;
        font-weight: 950;
      }
      .demo-title {
        min-width: 0;
        color: #f7f9f0;
        font-size: 32px;
        line-height: 1.04;
        font-weight: 950;
        text-align: right;
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.54);
      }
      .demo-frame {
        position: relative;
        height: 630px;
        border-radius: 7px;
        overflow: hidden;
        background: rgba(245, 247, 239, 0.08);
        border: 1px solid rgba(245, 247, 239, 0.16);
      }
      .demo-frame .demo-media {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: var(--demo-position);
        transform: scale(var(--demo-scale));
        transform-origin: center center;
        filter: saturate(1.04) contrast(1.03);
      }
      .demo-media-video {
        position: absolute;
        left: 56px;
        right: 56px;
        top: 646px;
        bottom: auto;
        width: calc(100% - 112px);
        height: 630px;
        z-index: 7;
        object-fit: contain;
        object-position: var(--demo-position);
        border-radius: 7px;
        border: 1px solid rgba(245, 247, 239, 0.18);
        background: rgba(7, 17, 15, 0.86);
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
        filter: saturate(1.04) contrast(1.03);
        will-change: transform, opacity;
      }
      .demo-panel.is-video-demo .demo-frame {
        background: rgba(245, 247, 239, 0.04);
      }
      .demo-panel.is-video-demo .demo-badges {
        display: none;
      }
      .demo-badges {
        position: absolute;
        left: 14px;
        right: 14px;
        bottom: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .demo-badges span {
        min-height: 34px;
        display: inline-flex;
        align-items: center;
        padding: 0 12px;
        border-radius: 999px;
        color: #07110f;
        background: rgba(46, 242, 162, 0.88);
        border: 1px solid rgba(46, 242, 162, 0.96);
        font-size: 18px;
        line-height: 1;
        font-weight: 950;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
      }
      .demo-note {
        margin-top: 10px;
        color: #f7f9f0;
        font-size: 22px;
        line-height: 1.22;
        font-weight: 850;
      }
      .guide-kicker {
        color: #2ef2a2;
        font-size: 18px;
        line-height: 1;
        font-weight: 950;
        margin-bottom: 8px;
      }
      .guide-title {
        color: #f7f9f0;
        font-size: 30px;
        line-height: 1.08;
        font-weight: 950;
        margin-bottom: 8px;
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.54);
      }
      .guide-body {
        color: #e8eee4;
        font-size: 20px;
        line-height: 1.24;
        font-weight: 750;
        margin-bottom: 14px;
      }
      .guide-platform-map,
      .guide-flow,
      .guide-funnel,
      .guide-asset,
      .guide-hub,
      .guide-equation,
      .guide-split {
        width: 100%;
      }
      .guide-pill-row,
      .asset-sources,
      .asset-items,
      .hub-nodes {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .guide-pill,
      .asset-source,
      .asset-chip,
      .hub-node {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        color: #f7f9f0;
        background: rgba(245, 247, 239, 0.12);
        border: 1px solid rgba(245, 247, 239, 0.22);
        font-size: 18px;
        line-height: 1;
        font-weight: 850;
      }
      .guide-arrow-label {
        position: relative;
        margin: 14px 0;
        padding-left: 74px;
        color: #ffcb5c;
        font-size: 18px;
        line-height: 1;
        font-weight: 950;
      }
      .guide-arrow-label::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        width: 58px;
        height: 2px;
        background: #ffcb5c;
      }
      .guide-arrow-label::after {
        content: "";
        position: absolute;
        left: 52px;
        top: calc(50% - 5px);
        width: 10px;
        height: 10px;
        border-right: 2px solid #ffcb5c;
        border-top: 2px solid #ffcb5c;
        transform: rotate(45deg);
      }
      .guide-result,
      .asset-pool {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 58px;
        padding: 0 18px;
        border-radius: 8px;
        color: #07110f;
        background: rgba(46, 242, 162, 0.88);
        font-size: 26px;
        line-height: 1;
        font-weight: 950;
      }
      .guide-split {
        display: grid;
        grid-template-columns: 1fr 58px 1fr;
        align-items: stretch;
        gap: 10px;
      }
      .split-side {
        min-height: 166px;
        padding: 14px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.18);
        background: rgba(7, 17, 15, 0.82);
      }
      .split-side.is-right {
        border-color: rgba(46, 242, 162, 0.38);
        background: rgba(7, 17, 15, 0.82);
      }
      .split-label {
        color: #f7f9f0;
        font-size: 16px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 8px;
      }
      .split-title {
        color: #f7f9f0;
        font-size: 24px;
        line-height: 1.08;
        font-weight: 950;
        margin-bottom: 10px;
      }
      .split-items {
        display: grid;
        gap: 7px;
      }
      .split-items span {
        color: #e8eee4;
        font-size: 18px;
        line-height: 1.12;
        font-weight: 800;
      }
      .guide-vs {
        align-self: center;
        justify-self: center;
        color: #ffcb5c;
        font-size: 20px;
        line-height: 1;
        font-weight: 950;
      }
      .guide-equation {
        display: grid;
        grid-template-columns: 1fr 42px 1fr;
        align-items: center;
        gap: 10px;
      }
      .guide-eq-side {
        min-height: 114px;
        padding: 14px;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.20);
        background: rgba(7, 17, 15, 0.82);
      }
      .guide-eq-side.is-hot {
        border-color: rgba(46, 242, 162, 0.40);
        background: rgba(7, 17, 15, 0.82);
      }
      .guide-eq-side span {
        display: block;
        color: #f7f9f0;
        font-size: 17px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 10px;
      }
      .guide-eq-side strong {
        display: block;
        color: #f7f9f0;
        font-size: 30px;
        line-height: 1.05;
        font-weight: 950;
      }
      .guide-eq-arrow {
        color: #ffcb5c;
        font-size: 28px;
        line-height: 1;
        font-weight: 950;
        text-align: center;
      }
      .guide-flow {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .flow-step,
      .funnel-step {
        min-height: 78px;
        padding: 12px 10px;
        border-radius: 8px;
        color: #f7f9f0;
        background: rgba(7, 17, 15, 0.82);
        border: 1px solid rgba(245, 247, 239, 0.18);
        font-size: 18px;
        line-height: 1.12;
        font-weight: 850;
      }
      .flow-step span,
      .funnel-step span {
        display: block;
        color: #6dffc2;
        font-size: 15px;
        line-height: 1;
        font-weight: 950;
        margin-bottom: 8px;
      }
      .guide-funnel {
        display: grid;
        gap: 8px;
      }
      .funnel-step {
        min-height: 48px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: calc(var(--step) * 26px);
        width: calc(100% - var(--step) * 52px);
      }
      .funnel-step span {
        margin: 0;
      }
      .guide-asset {
        display: grid;
        gap: 12px;
      }
      .asset-pool {
        justify-content: flex-start;
      }
      .asset-chip {
        color: #07110f;
        background: rgba(255, 203, 92, 0.88);
        border-color: rgba(255, 203, 92, 0.92);
      }
      .guide-hub {
        display: grid;
        grid-template-columns: 150px 1fr;
        align-items: center;
        gap: 14px;
      }
      .hub-center {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        padding: 16px;
        border-radius: 999px;
        color: #07110f;
        background: rgba(46, 242, 162, 0.86);
        font-size: 24px;
        line-height: 1.08;
        font-weight: 950;
        text-align: center;
      }
      .hub-nodes {
        align-content: center;
      }
      .horizontal-title-card {
        display: none;
      }
      ${renderHudCss()}
      #main.layout-horizontal .aroll {
        inset: auto;
        left: 72px;
        top: 0;
        width: 640px;
        height: 1080px;
        object-fit: cover;
        border-right: 1px solid rgba(245, 247, 239, 0.16);
        box-shadow: 28px 0 90px rgba(0, 0, 0, 0.42);
      }
      #main.layout-horizontal .shade {
        background:
          linear-gradient(90deg, rgba(7, 17, 15, 0.04), rgba(7, 17, 15, 0.18) 38%, rgba(7, 17, 15, 0.66) 100%),
          radial-gradient(circle at 32% 76%, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.34));
      }
      #main.layout-horizontal .horizontal-title-card {
        display: block;
        position: absolute;
        left: 790px;
        top: 86px;
        width: 960px;
        z-index: 3;
      }
      #main.layout-horizontal .title-kicker {
        color: #2ef2a2;
        font-size: 30px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 22px;
      }
      #main.layout-horizontal .title-main {
        max-width: 880px;
        color: #f7f9f0;
        font-size: 74px;
        line-height: 1.05;
        font-weight: 950;
        letter-spacing: 0;
        text-shadow: 0 7px 30px rgba(0, 0, 0, 0.62);
      }
      #main.layout-horizontal .title-points {
        display: flex;
        gap: 14px;
        margin-top: 28px;
      }
      #main.layout-horizontal .title-points span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 104px;
        height: 48px;
        padding: 0 20px;
        border-radius: 8px;
        color: #f7f9f0;
        background: rgba(7, 17, 15, 0.78);
        border: 2px solid #2ef2a2;
        font-size: 26px;
        line-height: 1;
        font-weight: 900;
      }
      #main.layout-horizontal .chapter-chip {
        left: 790px;
        top: 500px;
        width: 660px;
        padding: 18px 20px;
      }
      #main.layout-horizontal .chapter-num {
        font-size: 34px;
      }
      #main.layout-horizontal .chapter-copy {
        font-size: 30px;
      }
      #main.layout-horizontal .caption {
        left: 790px;
        right: 110px;
        bottom: 96px;
        font-size: 60px;
        line-height: 1.13;
        max-width: 980px;
      }
      #main.layout-horizontal .helper-card {
        left: auto;
        right: 110px;
        bottom: 320px;
        width: 620px;
        max-height: 420px;
        padding: 22px 24px;
      }
      #main.layout-horizontal .helper-title {
        font-size: 34px;
      }
      #main.layout-horizontal .helper-body {
        font-size: 23px;
      }
      #main.layout-horizontal .helper-card li {
        font-size: 22px;
      }
      #main.layout-horizontal .logic-guide {
        left: auto;
        right: 110px;
        bottom: 280px;
        width: 720px;
        max-height: 430px;
      }
      #main.layout-horizontal .demo-panel {
        left: 790px;
        right: 110px;
        top: auto;
        bottom: 210px;
      }
      #main.layout-horizontal .demo-frame {
        height: 430px;
      }
      #main.layout-horizontal .demo-media-video {
        left: 804px;
        right: 124px;
        top: auto;
        bottom: 260px;
        width: auto;
        height: 430px;
      }
    </style>
  </head>
  <body>
    <div id="main" class="layout-${escapeHtml(layout)}" data-composition-id="main" data-start="0" data-duration="${fmtTime(duration)}" data-width="${width}" data-height="${height}">
      ${mediaHtml}
      ${renderAudioCues()}
      ${horizontalTitleHtml}
      <div class="overlay-root">
        ${renderChapters()}
        ${renderDemoClips()}
        ${renderOverlays()}
        ${renderCaptions()}
      </div>
    </div>
    ${renderMotionScript()}
  </body>
</html>
`;

fs.writeFileSync(outputHtmlPath, html);
fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
fs.mkdirSync(path.join(jobDir, "qa"), { recursive: true });

console.log(`Built ${outputHtmlPath}`);
console.log(`Duration: ${duration.toFixed(3)}s`);
console.log(`Layout: ${layout}, size: ${width}x${height}`);
console.log(`Rough cut segments: ${roughCutSegments.length}`);
console.log(`Captions: ${captions.length}, rendered: ${(html.match(/class="clip caption/g) || []).length}`);
console.log(`Chapters: ${chapters.length}, overlays: ${overlays.length}, demo clips: ${demoClips.length}, audio cues: ${audioCues.length}`);
