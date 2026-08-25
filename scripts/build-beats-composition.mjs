// ============================================================
// 通用 beats 竖横屏合成器
// 数据驱动版的 balanced-face-safe 验收风格:
//   data/beats.json(拍子) + data/captions.json(字幕) + themes/<id>(主题)
//   → index.html(HyperFrames composition,底部安全区包装,不挡脸,全字幕)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import {
  escapeHtml,
  fmtTime,
  parseArgs,
  projectRoot,
  readJson,
  readJsonArray,
  resolveJob,
  run,
  videoDuration
} from "./lib.mjs";
import {
  COMPONENT_FORMATS,
  catalogById,
  loadComponentCatalog,
  renderComponentStyles
} from "./component-registry.mjs";
import { loadAudioCues, renderAudioCues } from "./audio-cues.mjs";
import { loadMusicBed, renderMusicBed } from "./music-bed.mjs";
import { renderCaptionMarkup } from "./caption-emphasis.mjs";
import { normalizeCaptionHideRanges } from "./caption-visibility.mjs";
import { deterministicFontStack } from "./font-stack.mjs";
import { compileIntro } from "./intros/index.mjs";
import { createArollCues } from "./timeline/aroll-cues.mjs";
import { createCameraCues } from "./timeline/camera-cues.mjs";
import { createPrimaryClips } from "./timeline/primary-clips.mjs";
import { applyTemplatePack } from "./template-pack.mjs";

const args = parseArgs();
const root = projectRoot();
const jobDir = resolveJob(args.job);
const configPath = path.join(jobDir, "project.json");
if (!fs.existsSync(configPath)) {
  console.error(`缺少 project.json: ${configPath}`);
  process.exit(1);
}
const { project: config } = applyTemplatePack(readJson(configPath), root);
const theme = loadTheme(args.theme || config.theme);
const width = Number(config.width || 1080);
const height = Number(config.height || 1920);
const format = resolveFormat(config, width, height);
const layoutMode = String(config.layout || "").toLowerCase();
const sourcePreserve = layoutMode === "source-preserve";
const sourceFill = layoutMode === "source-fill";
const sourceOverlay = sourcePreserve || sourceFill;
const sourceVideo = config.sourceVideo || "assets/aroll.mp4";
const sourcePath = path.join(jobDir, sourceVideo);
if (!fs.existsSync(sourcePath)) {
  console.error(`缺少母版 A-roll: ${sourcePath}`);
  console.error("先跑粗剪渲染(npm run roughcut:render)或把成品 A-roll 放到该路径。");
  process.exit(1);
}
const sourceDuration = Number(config.duration) > 0 ? Number(config.duration) : videoDuration(sourcePath);
const requestedDuration = args.duration == null ? null : Number(args.duration);
if (requestedDuration != null && !(requestedDuration > 0)) {
  throw new Error("--duration 必须是大于 0 的秒数");
}
const duration = requestedDuration == null ? sourceDuration : Math.min(requestedDuration, sourceDuration);
validateSeekability(sourcePath, duration);
const components = await loadComponentCatalog({ root });
const componentIndex = catalogById(components);
const allBeats = validateBeats(
  readJsonArray(path.join(jobDir, "data", "beats.json")),
  componentIndex,
  format
);
const allCaptions = readJsonArray(path.join(jobDir, "data", "captions.json"));
const rawBroll = readJsonArray(path.join(jobDir, "data", "broll.json"));
const truncateTimeline = Boolean(config.truncateTimeline || requestedDuration != null);
const beats = truncateTimeline ? trimBeats(allBeats, duration) : allBeats;
const timelineCaptions = truncateTimeline ? trimCaptions(allCaptions, duration) : allCaptions;
const captions = config.caption?.singleLine
  ? splitCaptionsToSingleLines(timelineCaptions, Number(config.caption.maxCharsPerLine) || 14)
  : timelineCaptions;
const broll = validateBroll(truncateTimeline ? trimBroll(rawBroll, duration) : rawBroll, duration);
const audioCues = loadAudioCues({ jobDir, totalDuration: duration });
const musicBed = loadMusicBed({ jobDir, totalDuration: duration });
const primary = createPrimaryClips({
  jobDir,
  duration,
  truncateTimeline,
  format,
  width,
  height,
  sourceVideo,
  broll
});
const compiledIntro = compileIntro(config.intro, {
  jobDir,
  width,
  height,
  totalDuration: duration,
  theme,
  configTitle: config.title,
  sourceVideo
});
const intro = compiledIntro?.data || null;
if (intro?.mode === "gallery" && beats.some((beat) => beat.start < intro.duration)) {
  throw new Error(`gallery intro 与 ${intro.duration.toFixed(2)}s 前的 beat 重叠`);
}
const arollBlockedRanges = [
  ...broll.map((item) => ({
    start: Number(item.start),
    end: Number(item.end),
    label: `B-roll ${item.id || item.src || "?"}`
  })),
  ...primary.items.map((item) => ({
    start: item.start,
    end: item.end,
    label: `primary clip ${item.id}`
  })),
  ...(intro ? [{ start: 0, end: intro.duration, label: `${intro.mode} intro` }] : [])
];
const arollCues = createArollCues({
  jobDir,
  totalDuration: duration,
  blockedRanges: arollBlockedRanges
});
const cameraCues = createCameraCues({
  jobDir,
  totalDuration: duration,
  blockedRanges: arollBlockedRanges
});
const outputHtmlPath = path.join(jobDir, args.output || "index.html");
const captionHideRanges = normalizeCaptionHideRanges(config.caption?.hideDuring, {
  totalDuration: duration
});
const cardRanges = [
  ...beats
    .filter((beat) => componentIndex.get(beat.type).captionMode !== "overlay")
    .map((beat) => ({ start: beat.start, end: beat.end })),
  ...captionHideRanges
];

function loadTheme(requested) {
  const registry = readJson(path.join(root, "themes", "registry.json"));
  const id = requested || registry.default;
  if (!registry.themes.includes(id)) {
    console.error(`未注册的主题: ${id}(可用: ${registry.themes.join(", ")})`);
    process.exit(1);
  }
  const dir = path.join(root, "themes", id);
  const data = readJson(path.join(dir, "theme.json"));
  const overridesPath = path.join(dir, "overrides.css");
  data.overridesCss = fs.existsSync(overridesPath) ? fs.readFileSync(overridesPath, "utf8") : "";
  data.dir = dir;
  return data;
}

function validateBeats(items, byId, targetFormat) {
  if (!items.length) return [];
  const errors = [];
  items.forEach((beat, index) => {
    const label = `beats[${index}](${beat.type || "?"} @${beat.start ?? "?"})`;
    const component = byId.get(beat.type);
    const formats = beatFormats(beat, label, errors);
    if (!component) errors.push(`${label}: 未注册 type，可用 ${[...byId.keys()].join("/")}`);
    if (!(Number(beat.end) > Number(beat.start))) errors.push(`${label}: 需要 end > start`);
    if (!beat.kicker) errors.push(`${label}: 缺 kicker`);
    if (!beat.title) errors.push(`${label}: 缺 title`);
    for (const field of component?.requiredFields || []) {
      if (beat[field] == null) errors.push(`${label}: 缺 ${field}`);
    }
    if (component) {
      const componentErrors = component.validate(beat);
      if (!Array.isArray(componentErrors)) errors.push(`${label}: validate 必须返回错误数组`);
      else for (const error of componentErrors) errors.push(`${label}: ${error}`);
    }
    const unsupported = formats.filter((item) => component && !component.formats.includes(item));
    if (unsupported.length) {
      errors.push(`${label}: 组件 ${beat.type} 不支持 ${unsupported.join("/")} 画幅`);
    }
  });
  if (errors.length) {
    console.error("beats.json 校验失败:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const sorted = items
    .filter((beat) => (beat.formats || COMPONENT_FORMATS).includes(targetFormat))
    .sort((a, b) => a.start - b.start);
  sorted.forEach((beat, index) => {
    const next = sorted[index + 1];
    if (next && next.start < beat.end - 0.01) {
      console.warn(`警告: 拍子时间重叠 ${beat.title} ↔ ${next.title}`);
    }
  });
  return sorted;
}

function beatFormats(beat, label, errors) {
  if (beat.formats == null) return COMPONENT_FORMATS;
  if (!Array.isArray(beat.formats) || !beat.formats.length) {
    errors.push(`${label}: formats 必须是非空数组`);
    return [];
  }
  const invalid = beat.formats.filter((item) => !COMPONENT_FORMATS.includes(item));
  if (invalid.length) errors.push(`${label}: formats 包含无效值 ${invalid.join("/")}`);
  if (new Set(beat.formats).size !== beat.formats.length) errors.push(`${label}: formats 不允许重复`);
  return beat.formats;
}

function resolveFormat(project, canvasWidth, canvasHeight) {
  const layout = String(project.layout || "").toLowerCase();
  return layout === "horizontal" || canvasWidth > canvasHeight ? "landscape" : "portrait";
}

function trimBeats(items, totalDuration) {
  return items
    .filter((item) => Number(item.start) < totalDuration)
    .map((item) => ({ ...item, end: Math.min(Number(item.end), totalDuration) }))
    .filter((item) => item.end > Number(item.start));
}

function trimCaptions(items, totalDuration) {
  return items
    .filter((item) => captionStart(item) < totalDuration)
    .map((item) => ({ ...item, e: Math.min(captionEnd(item), totalDuration) }))
    .filter((item) => Number(item.e) > captionStart(item));
}

function trimBroll(items, totalDuration) {
  return items
    .filter((item) => Number(item.start) < totalDuration)
    .map((item) => ({ ...item, end: Math.min(Number(item.end), totalDuration) }))
    .filter((item) => Number(item.end) > Number(item.start));
}

function validateBroll(items, totalDuration) {
  const errors = [];
  const sorted = [...items].sort((a, b) => Number(a.start) - Number(b.start));
  let total = 0;
  sorted.forEach((item, index) => {
    const label = `broll[${index}](${item.id || item.src || "?"})`;
    const start = Number(item.start);
    const end = Number(item.end);
    const itemDuration = end - start;
    if (!item.src) errors.push(`${label}: 缺 src`);
    if (!item.intent) errors.push(`${label}: 缺 intent(这段画面帮助观众理解什么)`);
    if (!item.reason) errors.push(`${label}: 缺 reason(为什么此刻需要 B-roll)`);
    if (!(end > start)) errors.push(`${label}: 需要 end > start`);
    if (start < 3 && !item.allowHook) errors.push(`${label}: 前 3 秒默认禁止 B-roll；必要时显式 allowHook`);
    if (itemDuration > 10) errors.push(`${label}: 单段不能超过 10 秒`);
    const mode = item.mode || "fullscreen-pip";
    const floating = mode === "floating-frame";
    if (!["fullscreen-pip", "fullscreen", "floating-frame"].includes(mode)) {
      errors.push(`${label}: mode 只能是 fullscreen-pip/fullscreen/floating-frame`);
    }
    if (floating) {
      if (!/\.(png|jpe?g|webp|avif)$/i.test(String(item.src || ""))) {
        errors.push(`${label}: floating-frame 只允许静态图片`);
      }
      if (!["left", "right"].includes(item.placement)) errors.push(`${label}: placement 只能是 left/right`);
      if ((item.transition || "morph") !== "morph") errors.push(`${label}: floating-frame transition 只能是 morph`);
      if (item.motion != null && !["float", "pop-bounce"].includes(item.motion)) {
        errors.push(`${label}: motion 只能是 float/pop-bounce`);
      }
      if (item.coverEnter != null && typeof item.coverEnter !== "boolean") errors.push(`${label}: coverEnter 必须是 boolean`);
      if (item.coverExit != null && typeof item.coverExit !== "boolean") errors.push(`${label}: coverExit 必须是 boolean`);
    } else {
      if (!["fade", "cut"].includes(item.transition || "fade")) {
        errors.push(`${label}: transition 只能是 fade/cut`);
      }
      if (!["rounded", "circle"].includes(item.pipShape || "rounded")) {
        errors.push(`${label}: pipShape 只能是 rounded/circle`);
      }
    }
    const mediaPath = item.src ? path.join(jobDir, item.src) : "";
    if (item.src && !fs.existsSync(mediaPath)) errors.push(`${label}: 素材不存在 ${item.src}`);
    total += Math.max(0, itemDuration);
    const next = sorted[index + 1];
    if (next && Number(next.start) < end - 0.01) errors.push(`${label}: 不允许 B-roll 重叠`);
  });
  if (totalDuration > 0 && total / totalDuration > 0.25) {
    errors.push(`B-roll 总占比 ${(total / totalDuration * 100).toFixed(1)}% 超过 25%`);
  }
  if (errors.length) throw new Error(`broll.json 校验失败:\n- ${errors.join("\n- ")}`);
  return sorted;
}

function validateSeekability(file, totalDuration) {
  if (totalDuration <= 2) return;
  const result = run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-skip_frame", "nokey",
    "-show_frames",
    "-show_entries", "frame=pts_time",
    "-of", "csv=p=0",
    file
  ], { capture: true });
  const times = result.stdout
    .split(/\r?\n/)
    .map((line) => Number.parseFloat(line))
    .filter(Number.isFinite);
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  if (times.length) gaps.push(totalDuration - times.at(-1));
  const maxGap = gaps.length ? Math.max(...gaps) : totalDuration;
  if (maxGap > 2.05) {
    throw new Error(`A-roll 最大关键帧间隔 ${maxGap.toFixed(2)}s，HyperFrames seek 会黑帧。请先用 roughcut:render 生成 1 秒 GOP 的干净母版。`);
  }
}

function stageAssets() {
  const sharedFonts = path.join(root, "themes", "_shared", "fonts");
  for (const font of theme.fonts || []) {
    copyOrLink(path.join(sharedFonts, font.file), path.join(jobDir, "assets", "fonts", font.file));
  }
  copyOrLink(
    path.join(root, "themes", "_shared", "vendor", "gsap.min.js"),
    path.join(jobDir, "vendor", "gsap.min.js")
  );
  stageCjkSubset();
}

function stageCjkSubset() {
  const source = "/System/Library/Fonts/Hiragino Sans GB.ttc";
  if (!fs.existsSync(source)) throw new Error(`缺少确定性中文字体源: ${source}`);
  const textFile = path.join(jobDir, "tmp", "factory-cjk-chars.txt");
  const output = path.join(jobDir, "assets", "fonts", "FactoryCJK.woff2");
  const text = JSON.stringify({ title: config.title, beats, captions, broll, intro });
  fs.mkdirSync(path.dirname(textFile), { recursive: true });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(textFile, text);
  run("pyftsubset", [
    source,
    "--font-number=0",
    `--text-file=${textFile}`,
    "--flavor=woff2",
    `--output-file=${output}`,
    "--layout-features=*",
    "--no-hinting"
  ], { capture: true });
}

function copyOrLink(src, dest) {
  if (fs.existsSync(dest)) return;
  if (!fs.existsSync(src)) {
    console.error(`缺少共享资产: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
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

function splitCaptionsToSingleLines(items, maxChars) {
  const limit = Math.max(6, Math.floor(maxChars));
  return items.flatMap((item) => {
    const text = String(item.t ?? item.text ?? "").replace(/\s+/g, " ").trim();
    const parts = splitCaptionText(text, limit);
    if (parts.length <= 1) return [{ ...item, t: text }];

    const start = captionStart(item);
    const end = captionEnd(item);
    const weights = parts.map((part) => Math.max(1, captionDisplayWidth(part)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let consumedWeight = 0;
    return parts.map((part, index) => {
      const partStart = start + ((end - start) * consumedWeight) / totalWeight;
      consumedWeight += weights[index];
      const partEnd = index === parts.length - 1
        ? end
        : start + ((end - start) * consumedWeight) / totalWeight;
      return { ...item, s: partStart, e: partEnd, t: part };
    });
  });
}

function splitCaptionText(text, limit) {
  if (!text || captionDisplayWidth(text) <= limit) return text ? [text] : [];
  const clauses = text.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/gu) || [text];
  const parts = [];
  let pending = "";

  clauses.forEach((clause) => {
    const candidate = `${pending}${clause}`;
    if (captionDisplayWidth(candidate) <= limit) {
      pending = candidate;
      return;
    }
    if (pending) parts.push(pending.trim());
    const chunks = splitCaptionClause(clause.trim(), limit);
    parts.push(...chunks.slice(0, -1));
    pending = chunks.at(-1) || "";
  });
  if (pending) parts.push(pending);
  return parts.filter(Boolean);
}

function splitCaptionClause(text, limit) {
  const units = text.match(/[A-Za-z0-9]+(?:[._/+&#'-][A-Za-z0-9]+)*|\s+|./gu) || [];
  const totalWidth = captionDisplayWidth(text);
  const chunkCount = Math.max(1, Math.ceil(totalWidth / limit));
  const chunks = [];
  let pending = "";
  let consumedWidth = 0;
  units.forEach((unit) => {
    const candidate = `${pending}${unit}`;
    const isClosingPunctuation = /^[，。！？；：,.!?;:、）】》]/u.test(unit);
    const chunksLeft = chunkCount - chunks.length;
    const targetWidth = (totalWidth - consumedWidth) / chunksLeft;
    const pendingWidth = captionDisplayWidth(pending);
    const candidateWidth = captionDisplayWidth(candidate);
    const beforeDelta = Math.abs(targetWidth - pendingWidth);
    const afterDelta = Math.abs(targetWidth - candidateWidth);
    const shouldBreak = pending && chunksLeft > 1 && !isClosingPunctuation
      && (candidateWidth > limit || (candidateWidth > targetWidth && beforeDelta <= afterDelta));
    if (shouldBreak) {
      chunks.push(pending.trim());
      consumedWidth += pendingWidth;
      pending = unit.trimStart();
      return;
    }
    pending = candidate;
  });
  if (pending.trim()) chunks.push(pending.trim());
  return chunks;
}

function captionDisplayWidth(text) {
  return Array.from(text).reduce((width, char) => {
    if (/\s/u.test(char)) return width + 0.35;
    if (/[A-Za-z0-9]/u.test(char)) return width + 0.56;
    if (/[^\p{L}\p{N}]/u.test(char) && char.codePointAt(0) < 128) return width + 0.45;
    return width + 1;
  }, 0);
}

function renderCaptions() {
  if (config.caption && config.caption.enabled === false) return "";
  return captions
    .map((item, index) => {
      const start = captionStart(item);
      const end = captionEnd(item);
      if (overlaps(start, end, captionHideRanges)) return "";
      const dur = Math.max(0.1, end - start);
      const text = renderCaptionMarkup(item);
      if (!text) return "";
      const classes = ["clip", "caption"];
      if (overlaps(start, end, cardRanges)) classes.push("caption-over-card");
      if (overlaps(start, end, primary.ranges)) classes.push("caption-primary");
      if (overlaps(start, end, primary.pipRanges)) classes.push("caption-primary-pip");
      return `<div id="caption-${index + 1}" class="${classes.join(" ")}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${1000 + index}">${text}</div>`;
    })
    .filter(Boolean)
    .join("");
}

function renderBeat(beat, index) {
  const id = `beat-${String(index + 1).padStart(2, "0")}`;
  const dur = beat.end - beat.start;
  const base = `id="${id}" class="clip beat beat-${beat.type}" data-kind="${beat.type}" data-start="${fmtTime(beat.start)}" data-duration="${fmtTime(dur)}" data-track-index="${100 + index}"`;
  const content = componentIndex.get(beat.type).render(beat);
  if (typeof content !== "string" || !content.trim()) throw new Error(`组件 ${beat.type} 未渲染出 HTML`);
  return `<section ${base}>${content}</section>`;
}

function renderBroll(item, index) {
  const start = Number(item.start);
  const dur = Number(item.end) - start;
  const mode = item.mode || "fullscreen-pip";
  const id = `broll-${String(index + 1).padStart(2, "0")}`;
  const allowOverflow = item.transition === "cut" || mode === "floating-frame" ? " data-layout-allow-overflow" : "";
  if (mode === "floating-frame") {
    const attrs = `id="${id}" class="clip broll broll-floating-frame" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${20 + index}" data-mode="floating-frame" data-placement="${escapeHtml(item.placement)}" data-transition="morph" data-motion="${escapeHtml(item.motion || "float")}" data-cover-enter="${Boolean(item.coverEnter)}" data-cover-exit="${Boolean(item.coverExit)}"${allowOverflow}`;
    return `<figure ${attrs} aria-hidden="true"><div class="broll-floating-media" style="background-image:url(&quot;${escapeHtml(item.src)}&quot;)"></div></figure>`;
  }
  const mediaAttrs = `id="${id}" class="clip broll broll-${mode}" src="${escapeHtml(item.src)}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${20 + index}" data-mode="${mode}" data-pip-shape="${escapeHtml(item.pipShape || "rounded")}" data-transition="${escapeHtml(item.transition || "fade")}"${allowOverflow}`;
  const media = /\.(png|jpe?g|webp|avif)$/i.test(item.src)
    ? `<img ${mediaAttrs} />`
    : `<video ${mediaAttrs} muted playsinline preload="auto"></video>`;
  return media;
}

function fontFaces() {
  const themed = (theme.fonts || [])
    .map(
      (font) =>
        `@font-face { font-family: "${font.family}"; src: url("assets/fonts/${font.file}") format("woff2"); font-weight: ${font.weight}; }`
    )
    .join("\n      ");
  return `@font-face { font-family: "FactoryCJK"; src: url("assets/fonts/FactoryCJK.woff2") format("woff2"); font-weight: 100 900; }\n      ${themed}`;
}

function themeCss() {
  const t = theme.tokens;
  const fontHead = deterministicFontStack(t.fontHead);
  const fontBody = deterministicFontStack(t.fontBody);
  const componentCss = renderComponentStyles(components, { ...t, fontBody });
  return `* { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: ${t.pageBg}; }
      #main { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${t.pageBg}; color: ${t.text}; font-family: ${fontHead}; letter-spacing: 0; }
      #camera-wrap { position: absolute; inset: 0; z-index: 3; overflow: hidden; transform-origin: center center; will-change: transform; }
      #video-wrap { position: absolute; inset: 0; overflow: hidden; transform-origin: center center; will-change: transform, filter, opacity; }
      #talking-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.02) contrast(1.02); }
      #pip-ring { position: absolute; top: ${Math.round(height * 0.115)}px; right: ${Math.round(width * 0.046)}px; z-index: 3; width: ${Math.round(width * 0.296)}px; height: ${Math.round(width * 0.296)}px; border: ${Math.max(4, Math.round(width * 0.0055))}px solid ${t.accent}; border-radius: 50%; opacity: 0; visibility: hidden; pointer-events: none; box-shadow: 0 18px 54px rgba(0, 0, 0, 0.46); }
      #talking-audio { display: none; }
      #broll-host { position: absolute; inset: 0; z-index: 2; overflow: hidden; }
      #broll-transition-backdrop { position: absolute; inset: 0; z-index: 5; opacity: 0; visibility: hidden; pointer-events: none; background: ${t.pageBg}; }
      #broll-overlay-host { position: absolute; inset: 0; z-index: 6; overflow: hidden; pointer-events: none; }
      .broll { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: ${t.pageBg}; }
      #scrim { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0; background: ${t.scrim}; }
      .vignette { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: ${t.vignette}; }
      .clip { opacity: 0; visibility: hidden; }
      ${arollCues.css}
      #card-host { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
      .beat { position: absolute; left: 46px; right: 46px; bottom: 54px; max-height: 360px; padding: 20px 24px; border-radius: ${t.radius}; border: 1px solid ${t.cardBorder}; background: ${t.cardBg}; box-shadow: ${t.cardShadow}; backdrop-filter: blur(${t.cardBlur}); overflow: hidden; }
      .beat::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: ${t.cardTopline}; }
      .kicker { color: ${t.kicker}; font-size: 20px; line-height: 1; font-weight: 700; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.36); }
      h2 { margin: 0; max-width: 960px; font-size: 38px; line-height: 1.06; font-weight: 700; }
      p { margin: 10px 0 0; max-width: 900px; color: ${t.textBody}; font-family: ${fontBody}; font-size: 25px; line-height: 1.16; }
      ${componentCss}
      .caption { position: absolute; left: 64px; right: 64px; bottom: 148px; z-index: 5; color: ${t.captionText}; font-size: 40px; line-height: 1.12; font-weight: 700; text-align: center; text-shadow: ${t.captionShadow}; }
      .caption-emphasis { color: ${t.kicker}; background: transparent; font-style: normal; }
      .caption-over-card { bottom: 430px; font-size: 38px; }
      ${primary.css}
      ${compiledIntro?.cssText || ""}
      ${layoutCss()}
      ${captionPlacementCss()}`;
}

function captionPlacementCss() {
  const placement = String(config.caption?.placement || "").trim();
  if (!placement) return "";
  if (placement !== "douyin-fixed") {
    throw new Error(`caption.placement 不支持 ${placement}`);
  }
  if (format !== "portrait") {
    throw new Error("caption.placement=douyin-fixed 只支持竖屏画幅");
  }
  return `.caption, .caption-over-card {
      left: 64px;
      right: 188px;
      bottom: 430px;
      color: #fff;
      font-size: 46px;
      line-height: 1.1;
      font-weight: 700;
      -webkit-text-stroke: 1.4px rgba(0, 0, 0, 0.92);
      paint-order: stroke fill;
      text-shadow: 0 2px 5px rgba(0, 0, 0, 0.72);
      white-space: nowrap;
    }`;
}

function layoutCss() {
  if (sourceOverlay) {
    return `#main { background: ${theme.tokens.text}; }
      #video-wrap { inset: 0; overflow: hidden; background: ${theme.tokens.text}; }
      #talking-video { object-fit: ${sourceFill ? "cover" : "contain"}; object-position: 50% 50%; filter: saturate(1.01) contrast(1.01); }
      .vignette { display: none; }
      #card-host { z-index: 8; }
      .beat { left: 66px; right: auto; top: 72px; bottom: auto; width: 540px; max-height: 280px; padding: 18px 22px; border: 0; border-radius: 12px; background: rgba(13, 20, 28, 0.88); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34); }
      .beat::before { height: 2px; background: ${theme.tokens.accent}; }
      .beat .kicker { color: #85d4ce; font-size: 17px; margin-bottom: 7px; }
      .beat h2 { color: #f7f7f4; font-size: 34px; line-height: 1.08; }
      .beat p { color: rgba(247, 247, 244, 0.82); font-size: 21px; line-height: 1.18; }
      .beat .hero-number { right: 18px; bottom: 16px; font-size: 66px; }
      .caption, .caption-over-card { left: calc(50% - 60px); right: auto; bottom: 52px; width: 720px; max-width: calc(100% - 160px); transform: translateX(-50%); font-size: 43px; line-height: 1.14; text-align: center; white-space: nowrap; }
      .cta-row span { font-size: 19px; }
      .beat-cta { top: auto; bottom: 104px; width: 650px; }`;
  }
  if ((config.layout || "").toLowerCase() !== "horizontal" && width <= height) return "";
  return `#main { background: ${theme.tokens.pageBg}; }
      #video-wrap { top: 0; right: 0; bottom: 0; left: 56%; overflow: hidden; }
      #talking-video { object-position: 50% 42%; }
      .vignette { background: linear-gradient(90deg, ${theme.tokens.pageBg} 0%, ${theme.tokens.pageBg} 48%, transparent 72%); }
      .beat { left: 72px; right: 50%; bottom: auto; top: 50%; max-height: 620px; transform: translateY(-50%); padding: 30px 34px; }
      .beat h2 { font-size: 48px; }
      .beat p { font-size: 28px; }
      .caption { left: 57%; right: 3%; bottom: 80px; font-size: 34px; }
      .caption-over-card { bottom: 80px; font-size: 34px; }`;
}

function renderGsapScript() {
  return '<script src="vendor/gsap.min.js"></script>';
}

function writeMotionSpec() {
  const motionPath = path.join(jobDir, "index.motion.json");
  if (!compiledIntro) {
    fs.rmSync(motionPath, { force: true });
    return;
  }
  fs.writeFileSync(motionPath, `${JSON.stringify(compiledIntro.motionSpec, null, 2)}\n`);
}

function renderHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <link rel="preload" href="assets/fonts/FactoryCJK.woff2" as="font" type="font/woff2" crossorigin />
    ${compiledIntro?.headHtml || ""}
    <title>${escapeHtml(config.title || "口播成片")} - ${escapeHtml(theme.label)}</title>
    <style>
      ${fontFaces()}
      ${themeCss()}
      ${sourceOverlay ? "" : theme.overridesCss}
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-width="${width}" data-height="${height}" data-start="0" data-duration="${fmtTime(duration)}">
      <div id="camera-wrap">
        <div id="video-wrap" data-layout-allow-overflow>
          <video id="talking-video" src="${escapeHtml(sourceVideo)}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="1" muted playsinline preload="auto"></video>
        </div>
      </div>
      <audio id="talking-audio" src="${escapeHtml(sourceVideo)}" data-start="0" data-duration="${fmtTime(duration)}" data-track-index="2" preload="auto"></audio>
      ${renderMusicBed(musicBed)}
      ${renderAudioCues(audioCues)}
      ${primary.html}
      ${arollCues.html}
      <div id="broll-host">
        ${broll.filter((item) => item.mode !== "floating-frame").map(renderBroll).join("\n        ")}
      </div>
      <div id="broll-transition-backdrop" aria-hidden="true"></div>
      <div id="broll-overlay-host">
        ${broll.filter((item) => item.mode === "floating-frame").map(renderBroll).join("\n        ")}
      </div>
      <div id="pip-ring" aria-hidden="true"></div>
      <div id="scrim"></div>
      <div class="vignette"></div>
      ${compiledIntro?.bodyHtml || ""}
      <div id="card-host">
        ${beats.map(renderBeat).join("\n        ")}
        ${renderCaptions()}
      </div>
    </div>
    ${renderGsapScript()}
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const cameraWrap = document.querySelector("#camera-wrap");
      const videoWrap = document.querySelector("#video-wrap");
      const pipRing = document.querySelector("#pip-ring");
      const scrim = document.querySelector("#scrim");
      const brollBackdrop = document.querySelector("#broll-transition-backdrop");
      tl.set(pipRing, { autoAlpha: 0 }, 0);
      tl.set(brollBackdrop, { autoAlpha: 0 }, 0);
      ${compiledIntro?.timelineJs || ""}
      ${primary.timelineJs}
      ${cameraCues.timelineJs}
      ${arollCues.timelineJs}
      document.querySelectorAll(".clip").forEach((clip) => {
        if (clip.dataset.manualTimeline === "true") return;
        const start = Number(clip.dataset.start || 0);
        const dur = Number(clip.dataset.duration || 0);
        if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return;
        tl.set(clip, { autoAlpha: 0 }, 0);
        tl.set(clip, { autoAlpha: 1 }, start);
        tl.set(clip, { autoAlpha: 0 }, start + dur);
      });
      const impactMotionFps = ${Number(config.render?.fps || 30)};
      function impactMotionPreset(variant, icon) {
        if (variant === "question") {
          return { x: 0, y: -54, scale: 1.18, rotation: -1.2, titleX: 0, titleY: -18, titleScale: 1.08, exitX: 0, exitY: -24, ease: "expo.out" };
        }
        if (variant === "reject") {
          const direction = icon === "shipping" ? 1 : -1;
          return { x: direction * 260, y: 0, scale: 1.04, rotation: direction * 3, titleX: direction * 54, titleY: 0, titleScale: 1.04, exitX: direction * -90, exitY: 0, ease: "power4.out" };
        }
        if (variant === "pivot") {
          return { x: 0, y: 0, scale: 1.42, rotation: 0, titleX: 0, titleY: 0, titleScale: 1.32, exitX: 0, exitY: -12, exitScale: 1.10, ease: "power4.out" };
        }
        if (variant === "identity") {
          return { x: -180, y: -16, scale: 1.06, rotation: -1.2, titleX: -42, titleY: 0, titleScale: 1.03, exitX: 52, exitY: -8, ease: "expo.out" };
        }
        if (variant === "cta") {
          return { x: 0, y: 120, scale: 1.08, rotation: 0, titleX: 0, titleY: 28, titleScale: 1.08, exitX: 0, exitY: 34, ease: "power4.out" };
        }
        if (icon === "lift") {
          return { x: 0, y: 78, scale: 1.10, rotation: 0, titleX: 0, titleY: 34, titleScale: 1.06, exitX: 0, exitY: -42, ease: "power4.out" };
        }
        const direction = icon === "track" ? 1 : -1;
        return { x: direction * 230, y: 0, scale: 1.05, rotation: direction * 2.4, titleX: direction * 54, titleY: 0, titleScale: 1.04, exitX: direction * -78, exitY: 0, ease: "power4.out" };
      }
      function animateImpactSticker(card, start, dur) {
        const sticker = card.querySelector(".impact-sticker");
        const surface = card.querySelector("[data-impact-motion]");
        if (!sticker || !surface) return;
        const variant = sticker.dataset.variant || "action";
        const icon = sticker.dataset.icon || "none";
        const preset = impactMotionPreset(variant, icon);
        const hitOffset = Math.max(0, Number(sticker.dataset.hitOffset || 0));
        const landingFrames = Math.min(6, Math.max(4, Number(sticker.dataset.landingFrames || 5)));
        const landingDuration = landingFrames / impactMotionFps;
        const hit = Math.min(start + dur - 0.08, start + hitOffset);
        const enterAt = Math.max(start, hit - landingDuration);
        const enterDuration = Math.max(0.08, hit - enterAt);
        const exitDuration = Math.min(0.12, Math.max(0.08, dur * 0.16));
        const exitAt = start + dur - exitDuration;
        const title = card.querySelector(".impact-sticker-title");
        const kicker = card.querySelector(".impact-sticker-kicker");
        const mark = card.querySelector(".impact-sticker-mark");
        const strike = card.querySelector("[data-impact-strike]");

        tl.set(surface, {
          opacity: 0,
          x: preset.x,
          y: preset.y,
          scale: preset.scale,
          rotation: preset.rotation,
          transformOrigin: "50% 50%"
        }, start);
        tl.to(surface, {
          opacity: 1,
          x: 0,
          y: 0,
          scale: variant === "pivot" ? 1.06 : 1.025,
          rotation: 0,
          duration: enterDuration,
          ease: preset.ease
        }, enterAt);
        tl.to(surface, {
          scale: 1,
          duration: 2 / impactMotionFps,
          ease: "power2.out"
        }, hit);

        if (title) {
          tl.set(title, {
            opacity: 0,
            x: preset.titleX,
            y: preset.titleY,
            scale: preset.titleScale,
            transformOrigin: "50% 50%"
          }, start);
          tl.to(title, {
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: enterDuration,
            ease: "power4.out"
          }, enterAt);
        }
        if (kicker) {
          tl.set(kicker, { opacity: 0, y: -12 }, start);
          tl.to(kicker, { opacity: 1, y: 0, duration: Math.max(0.08, enterDuration * 0.72), ease: "power3.out" }, enterAt);
        }
        if (mark) {
          tl.set(mark, { opacity: 0, scale: 0.62, rotation: -12, transformOrigin: "50% 50%" }, start);
          tl.to(mark, { opacity: 1, scale: 1, rotation: 0, duration: enterDuration, ease: "back.out(1.7)" }, enterAt);
        }
        if (strike) {
          const strikeDuration = 0.10;
          const strikeAt = Math.min(hit + 0.03, start + dur - strikeDuration);
          tl.set(strike, { opacity: 0, scaleX: 0, transformOrigin: "0% 50%" }, start);
          tl.to(strike, { opacity: 1, scaleX: 1, duration: strikeDuration, ease: "power4.out" }, strikeAt);
        }
        tl.to(surface, {
          opacity: 0,
          x: preset.exitX,
          y: preset.exitY,
          scale: preset.exitScale || 0.97,
          duration: exitDuration,
          ease: "power3.in"
        }, exitAt);
      }
      document.querySelectorAll(".beat").forEach((card) => {
        const start = Number(card.dataset.start || 0);
        const dur = Number(card.dataset.duration || 0);
        if (card.dataset.kind === "topline-label") {
          const label = card.querySelector(".topline-label");
          tl.fromTo(label,
            { opacity: 0, y: -8 },
            { opacity: 1, y: 0, duration: Math.min(0.16, dur / 3), ease: "power3.out", immediateRender: false }, start);
          return;
        }
        if (card.dataset.kind === "impact-sticker") {
          animateImpactSticker(card, start, dur);
          return;
        }
        if (card.dataset.kind === "result-grid") {
          const fade = Math.min(0.2, dur / 3);
          tl.fromTo(card,
            { opacity: 0, scale: 0.992 },
            { opacity: 1, scale: 1, duration: fade, ease: "power2.out", immediateRender: false }, start);
          tl.to(card, { opacity: 0, scale: 0.996, duration: fade, ease: "power2.in" }, start + Math.max(fade, dur - fade));
          return;
        }
        if (${sourceOverlay}) {
          tl.fromTo(card, { x: -34, opacity: 0 }, { x: 0, opacity: 1, duration: 0.46, ease: "expo.out" }, start);
          tl.to(card, { x: 18, opacity: 0, duration: 0.22, ease: "power3.in" }, start + Math.max(0.8, dur - 0.24));
          tl.fromTo(card.querySelectorAll("h2, p, [data-beat-item]"), { x: -12, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, stagger: 0.035, ease: "power3.out" }, start + 0.10);
        } else {
          tl.from(card, { y: 28, scale: 0.985, duration: 0.36, ease: "expo.out" }, start + 0.08);
          tl.to(card, { y: 16, duration: 0.22, ease: "power3.in" }, start + Math.max(0.8, dur - 0.28));
          tl.from(card.querySelectorAll("h2, p, [data-beat-item]"), { y: 12, opacity: 0, duration: 0.26, stagger: 0.035, ease: "power3.out" }, start + 0.16);
          tl.to(scrim, { opacity: 0.28, duration: 0.24, ease: "sine.out" }, start);
          tl.to(scrim, { opacity: 0, duration: 0.24, ease: "sine.in" }, start + Math.max(0.8, dur - 0.30));
        }
      });
      document.querySelectorAll(".broll").forEach((item, itemIndex, allBroll) => {
        const start = Number(item.dataset.start || 0);
        const dur = Number(item.dataset.duration || 0);
        const end = start + dur;
        if (item.dataset.mode === "floating-frame") {
          const media = item.querySelector(".broll-floating-media");
          const rect = item.getBoundingClientRect();
          const direction = item.dataset.placement === "left" ? -1 : 1;
          const tilt = direction * -1.25;
          const coverX = ${width} / 2 - (rect.left + rect.width / 2);
          const coverY = ${height} / 2 - (rect.top + rect.height / 2);
          const coverScale = Math.min(${width} / rect.width, ${height} / rect.height) * 0.88;
          const coverEnter = item.dataset.coverEnter === "true";
          const coverExit = item.dataset.coverExit === "true";
          const popBounce = item.dataset.motion === "pop-bounce";
          const enterDur = coverEnter ? 0.72 : (popBounce ? 0.15 : 0.64);
          const exitDur = coverExit ? 0.44 : (popBounce ? 0.16 : 0.38);
          const holdStart = start + enterDur;
          const holdEnd = end - exitDur;
          if (coverEnter) {
            tl.set(brollBackdrop, { autoAlpha: 1 }, start);
            tl.fromTo(item,
              { x: coverX, y: coverY, scale: coverScale, rotation: 0, opacity: 1 },
              { x: 0, y: 0, scale: 1, rotation: tilt, opacity: 1, duration: enterDur, ease: "expo.inOut", immediateRender: false }, start);
            tl.to(brollBackdrop, { autoAlpha: 0, duration: 0.42, ease: "sine.inOut" }, start + 0.18);
          } else {
            if (popBounce) {
              const overshootAt = start + 0.10;
              tl.fromTo(item,
                { x: direction * 30, y: 16, scale: 0.72, rotation: direction * 4.2, opacity: 0 },
                { x: direction * -3, y: -2, scale: 1.07, rotation: tilt - direction * 0.45, opacity: 1, duration: 0.10, ease: "power4.out", immediateRender: false }, start);
              tl.to(item,
                { x: 0, y: 0, scale: 1, rotation: tilt, opacity: 1, duration: enterDur - 0.10, ease: "power2.inOut" }, overshootAt);
            } else {
              tl.fromTo(item,
                { x: direction * 46, y: 22, scale: 0.94, rotation: direction * 2.8, opacity: 0 },
                { x: 0, y: 0, scale: 1, rotation: tilt, opacity: 1, duration: enterDur, ease: "power4.out", immediateRender: false }, start);
            }
          }
          tl.fromTo(media, { scale: 1.015 }, { scale: 1.075, duration: dur, ease: "sine.inOut", immediateRender: false }, start);
          if (holdEnd > holdStart + 0.05) {
            tl.to(item, { x: direction * 6, y: -10, rotation: tilt + direction * 0.35, duration: holdEnd - holdStart, ease: "sine.inOut" }, holdStart);
          }
          if (coverExit) {
            const coverStart = end - 0.44;
            const nextItem = allBroll[itemIndex + 1];
            const nextContinuesBackdrop = nextItem
              && Math.abs(Number(nextItem.dataset.start || 0) - end) < 0.02
              && nextItem.dataset.coverEnter === "true";
            tl.to(brollBackdrop, { autoAlpha: 1, duration: 0.24, ease: "sine.inOut" }, coverStart);
            tl.to(item, { x: coverX, y: coverY, scale: coverScale, rotation: 0, duration: 0.34, ease: "power3.inOut" }, coverStart);
            if (!nextContinuesBackdrop) {
              tl.to(brollBackdrop, { autoAlpha: 0, duration: 0.24, ease: "sine.inOut" }, end);
            }
          } else {
            const exitX = popBounce ? direction * 24 : direction * 34;
            const exitY = popBounce ? -12 : -18;
            const exitScale = popBounce ? 0.86 : 0.97;
            tl.to(item, { x: exitX, y: exitY, scale: exitScale, opacity: 0, duration: exitDur, ease: "power3.in" }, end - exitDur);
          }
          return;
        }
        if (item.dataset.mode === "fullscreen") {
          if (item.tagName === "IMG") {
            if (item.dataset.transition === "cut") {
              tl.fromTo(item, { scale: 1.018 }, { scale: 0.992, duration: dur, ease: "none" }, start);
            } else {
              const fade = Math.min(0.18, dur / 3);
              tl.fromTo(item, { scale: 1.025, opacity: 0 }, { scale: 1, opacity: 1, duration: fade, ease: "power2.out" }, start);
              tl.to(item, { scale: 0.992, opacity: 0, duration: fade, ease: "power2.in" }, Math.max(start, end - fade));
            }
          }
          tl.set(videoWrap, { opacity: 0 }, start);
          tl.set(videoWrap, { opacity: 1 }, end);
          return;
        }
        const horizontal = ${width} > ${height};
        const circle = item.dataset.pipShape === "circle" && !horizontal;
        if (circle) {
          tl.set(videoWrap, { clipPath: "circle(100% at 50% 50%)" }, start);
          tl.to(videoWrap, {
            scale: 0.35,
            x: ${width} * 0.306,
            y: -${height} * 0.274,
            clipPath: "circle(${Math.round(width * 0.423)}px at 50% 42%)",
            borderRadius: 0,
            boxShadow: "none",
            filter: "drop-shadow(0 18px 28px rgba(0,0,0,.42))",
            duration: 0.28,
            ease: "power3.out"
          }, start);
          tl.to(pipRing, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, start + 0.06);
          tl.to(pipRing, { autoAlpha: 0, duration: 0.18, ease: "power2.in" }, Math.max(start, end - 0.24));
          tl.to(videoWrap, {
            scale: 1,
            x: 0,
            y: 0,
            clipPath: "circle(100% at 50% 50%)",
            filter: "none",
            duration: 0.28,
            ease: "power3.inOut"
          }, Math.max(start, end - 0.28));
          tl.set(videoWrap, { clipPath: "none" }, end);
          return;
        }
        tl.to(videoWrap, {
          scale: horizontal ? 1 : 0.27,
          x: horizontal ? 0 : ${width} * 0.32,
          y: horizontal ? 0 : -${height} * 0.34,
          borderRadius: 42,
          boxShadow: "0 18px 60px rgba(0,0,0,.42)",
          duration: 0.28,
          ease: "power3.out"
        }, start);
        tl.to(videoWrap, { scale: 1, x: 0, y: 0, borderRadius: 0, boxShadow: "none", duration: 0.28, ease: "power3.inOut" }, Math.max(start, end - 0.28));
      });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

stageAssets();
fs.writeFileSync(outputHtmlPath, renderHtml().replace(/[ \t]+$/gm, ""));
writeMotionSpec();
fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
fs.mkdirSync(path.join(jobDir, "qa"), { recursive: true });

const late = beats.filter((beat) => beat.end > duration + 0.5);
if (late.length) console.warn(`警告: ${late.length} 个拍子超出视频时长 ${duration.toFixed(2)}s`);
console.log(`Built ${outputHtmlPath}`);
console.log(`主题: ${theme.id}(${theme.label})`);
console.log(`时长: ${duration.toFixed(3)}s, 画布: ${width}x${height}(${format})`);
console.log(`拍子: ${beats.length}, 字幕: ${captions.length}`);
console.log(`B-roll: ${broll.length}`);
console.log(`Primary clips: ${primary.items.length}`);
console.log(`Audio cues: ${audioCues.length}`);
console.log(`A-roll cues: ${arollCues.items.length}`);
console.log(`Camera cues: ${cameraCues.items.length}`);
