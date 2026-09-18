import fs from "node:fs";
import path from "node:path";

import { escapeHtml, fmtTime, readJsonArray, videoDuration } from "../lib.mjs";
import {
  needsFlashOverlay,
  normalizeTransitionPreset,
  renderTransitionPresetCss,
  renderTransitionPresetTimeline
} from "./transition-presets.mjs";

const FORMATS = ["portrait", "landscape"];
const FITS = ["contain", "cover"];
const KINDS = ["demo-stage", "proof-footage"];
const PIP_PLACEMENTS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const EPSILON = 0.01;

export function createPrimaryClips(options = {}) {
  const context = normalizeOptions(options);
  const rawItems = loadItems(context.jobDir, options.items);
  const normalized = rawItems.map((item, index) => normalizeItem(item, index));
  validateIds(normalized);
  validatePrimaryOverlaps(normalized);

  const selected = selectTimelineItems(normalized, context);
  validateBrollOverlaps(selected, options.broll || []);
  validateMedia(selected, context);

  return buildBundle(selected, context);
}

function normalizeOptions(options) {
  if (!options.jobDir) throw new Error("primary-clips: 缺 jobDir");
  const jobDir = path.resolve(String(options.jobDir || ""));
  const duration = positiveNumber(options.duration, "duration");
  const width = positiveNumber(options.width, "width");
  const height = positiveNumber(options.height, "height");
  const format = String(options.format || "");
  if (!FORMATS.includes(format)) throw new Error(`primary-clips: format 只能是 ${FORMATS.join("/")}`);
  if (typeof options.durationProbe !== "undefined" && typeof options.durationProbe !== "function") {
    throw new Error("primary-clips: durationProbe 必须是函数");
  }
  return {
    jobDir,
    duration,
    width,
    height,
    format,
    sourceVideo: String(options.sourceVideo || ""),
    truncateTimeline: Boolean(options.truncateTimeline),
    durationProbe: options.durationProbe || videoDuration
  };
}

function loadItems(jobDir, provided) {
  if (provided != null) {
    if (!Array.isArray(provided)) throw new Error("primary-clips: items 必须是数组");
    return provided;
  }
  return readJsonArray(path.join(jobDir, "data", "primary-clips.json"));
}

function normalizeItem(item, index) {
  const label = `primary-clips[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label}: 必须是对象`);
  const id = String(item.id || "");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`${label}: id 只能使用小写字母、数字、_、-`);
  const kind = String(item.kind || "");
  if (!KINDS.includes(kind)) throw new Error(`${label}(${id}): kind 只能是 ${KINDS.join("/")}`);
  if (!item.src || typeof item.src !== "string") throw new Error(`${label}(${id}): 缺 src`);
  if (!item.intent || !item.reason) throw new Error(`${label}(${id}): 缺 intent/reason`);

  const start = nonNegativeNumber(item.start, `${label}(${id}).start`);
  const end = positiveNumber(item.end, `${label}(${id}).end`);
  if (end <= start) throw new Error(`${label}(${id}): 需要 end > start`);
  const sourceStart = nonNegativeNumber(item.sourceStart ?? 0, `${label}(${id}).sourceStart`);
  const fit = item.fit == null ? (kind === "proof-footage" ? "cover" : "contain") : String(item.fit);
  if (!FITS.includes(fit)) throw new Error(`${label}(${id}): fit 只能是 ${FITS.join("/")}`);
  if (item.speakerPip != null && typeof item.speakerPip !== "boolean") {
    throw new Error(`${label}(${id}): speakerPip 必须是 boolean`);
  }
  if (item.includeAudio != null && typeof item.includeAudio !== "boolean") {
    throw new Error(`${label}(${id}): includeAudio 必须是 boolean`);
  }
  const pipPlacement = String(item.pipPlacement || "bottom-right");
  if (!PIP_PLACEMENTS.includes(pipPlacement)) {
    throw new Error(`${label}(${id}): pipPlacement 只能是 ${PIP_PLACEMENTS.join("/")}`);
  }
  return {
    ...item,
    id,
    kind,
    start,
    end,
    sourceStart,
    fit,
    focus: normalizeFocus(item.focus, label, id),
    formats: normalizeFormats(item.formats, label, id),
    speakerPip: Boolean(item.speakerPip),
    includeAudio: Boolean(item.includeAudio),
    pipPlacement,
    transition: normalizeTransitionPreset(item.transition, {
      label: `${label}(${id})`,
      clipDuration: end - start
    })
  };
}

function normalizeFocus(value, label, id) {
  if (value == null) return { x: 0.5, y: 0.5 };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}(${id}): focus 必须是 {x,y}`);
  }
  const x = finiteNumber(value.x, `${label}(${id}).focus.x`);
  const y = finiteNumber(value.y, `${label}(${id}).focus.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error(`${label}(${id}): focus x/y 必须在 0..1`);
  return { x, y };
}

function normalizeFormats(value, label, id) {
  if (value == null) return [...FORMATS];
  if (!Array.isArray(value) || !value.length) throw new Error(`${label}(${id}): formats 必须是非空数组`);
  if (new Set(value).size !== value.length) throw new Error(`${label}(${id}): formats 不允许重复`);
  const invalid = value.filter((format) => !FORMATS.includes(format));
  if (invalid.length) throw new Error(`${label}(${id}): formats 包含无效值 ${invalid.join("/")}`);
  return [...value];
}

function validateIds(items) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`primary-clips: id 重复 ${item.id}`);
    ids.add(item.id);
  }
}

function validatePrimaryOverlaps(items) {
  const sorted = [...items].sort(compareItems);
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const a = sorted[left];
      const b = sorted[right];
      if (b.start >= a.end - EPSILON) break;
      if (a.formats.some((format) => b.formats.includes(format))) {
        throw new Error(`primary-clips: ${a.id} 与 ${b.id} 在同一画幅重叠`);
      }
    }
  }
}

function selectTimelineItems(items, context) {
  const selected = items
    .filter((item) => item.formats.includes(context.format))
    .filter((item) => !context.truncateTimeline || item.start < context.duration)
    .map((item) => context.truncateTimeline ? { ...item, end: Math.min(item.end, context.duration) } : item)
    .sort(compareItems);
  for (const item of selected) {
    if (item.start >= context.duration || item.end > context.duration + EPSILON) {
      throw new Error(`primary-clips(${item.id}): 时间超出成片 ${context.duration.toFixed(2)}s`);
    }
  }
  return selected;
}

function validateBrollOverlaps(items, broll) {
  if (!Array.isArray(broll)) throw new Error("primary-clips: broll 必须是数组");
  for (const item of items) {
    for (const entry of broll) {
      const start = Number(entry.start);
      const end = Number(entry.end);
      if (Number.isFinite(start) && Number.isFinite(end) && item.start < end - EPSILON && item.end > start + EPSILON) {
        throw new Error(`primary-clips(${item.id}): 不允许与 B-roll ${entry.id || entry.src || "?"} 重叠`);
      }
    }
  }
}

function validateMedia(items, context) {
  const cache = new Map();
  for (const item of items) {
    const mediaPath = resolveMediaPath(context.jobDir, item.src, `primary-clips(${item.id}).src`);
    const mediaDuration = probeDuration(mediaPath, context.durationProbe, cache);
    if (item.sourceStart + item.end - item.start > mediaDuration + EPSILON) {
      throw new Error(`primary-clips(${item.id}): sourceStart + clip duration 超出源媒体尾部`);
    }
    if (!item.speakerPip) continue;
    if (!context.sourceVideo) throw new Error(`primary-clips(${item.id}): speakerPip 需要 sourceVideo`);
    const pipPath = resolveMediaPath(context.jobDir, context.sourceVideo, "sourceVideo");
    const pipDuration = probeDuration(pipPath, context.durationProbe, cache);
    if (item.end > pipDuration + EPSILON) throw new Error(`primary-clips(${item.id}): speakerPip 超出 A-roll 尾部`);
  }
}

function resolveMediaPath(jobDir, source, label) {
  if (path.isAbsolute(source)) throw new Error(`${label}: 必须是 job 内相对路径`);
  const resolved = path.resolve(jobDir, source);
  if (resolved !== jobDir && !resolved.startsWith(`${jobDir}${path.sep}`)) throw new Error(`${label}: 路径越出 job`);
  if (!fs.existsSync(resolved)) throw new Error(`${label}: 素材不存在 ${source}`);
  return resolved;
}

function probeDuration(file, probe, cache) {
  if (cache.has(file)) return cache.get(file);
  const duration = Number(probe(file));
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`primary-clips: 无法读取媒体时长 ${file}`);
  cache.set(file, duration);
  return duration;
}

function buildBundle(items, context) {
  if (!items.length) return { items: [], html: "", css: "", timelineJs: "", ranges: [], pipRanges: [] };
  return {
    items,
    html: renderHtml(items, context.sourceVideo),
    css: renderCss(context),
    timelineJs: renderTimelineJs(items),
    ranges: items.map(({ start, end }) => ({ start, end })),
    pipRanges: items.filter((item) => item.speakerPip).map(({ start, end }) => ({ start, end }))
  };
}

function renderHtml(items, sourceVideo) {
  return items.flatMap((item, index) => {
    const duration = item.end - item.start;
    const focusX = percent(item.focus.x);
    const focusY = percent(item.focus.y);
    const proofClass = item.kind === "proof-footage" ? " primary-proof-media" : "";
    const media = `<video id="primary-demo-${escapeHtml(item.id)}" class="primary-demo-media${proofClass}" src="${escapeHtml(item.src)}" data-kind="${escapeHtml(item.kind)}" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(duration)}" data-media-start="${fmtTime(item.sourceStart)}" data-track-index="${40 + index * 3}" style="--primary-fit:${item.fit};--primary-focus-x:${focusX};--primary-focus-y:${focusY}" muted playsinline preload="auto"></video>`;
    const rendered = [media];
    if (item.includeAudio) {
      rendered.push(`<audio id="primary-demo-audio-${escapeHtml(item.id)}" src="${escapeHtml(item.src)}" data-kind="recipe-audio" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(duration)}" data-media-start="${fmtTime(item.sourceStart)}" data-track-index="${42 + index * 3}" preload="auto"></audio>`);
    }
    if (needsFlashOverlay(item.transition)) {
      rendered.push(`<div id="primary-transition-flash-${escapeHtml(item.id)}" class="primary-transition-flash clip" data-kind="transition-overlay" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(duration)}" data-track-index="${200 + index}" data-manual-timeline="true" aria-hidden="true"></div>`);
    }
    if (!item.speakerPip) return rendered;
    const pip = `<video id="primary-demo-pip-${escapeHtml(item.id)}" class="primary-demo-pip primary-demo-pip--${escapeHtml(item.pipPlacement)}" src="${escapeHtml(sourceVideo)}" data-kind="speaker-pip" data-start="${fmtTime(item.start)}" data-duration="${fmtTime(duration)}" data-media-start="${fmtTime(item.start)}" data-track-index="${41 + index * 3}" muted playsinline preload="auto"></video>`;
    rendered.push(pip);
    return rendered;
  }).join("\n      ");
}

function renderCss(context) {
  if (context.format === "landscape") return `${landscapeCss(context)}\n      ${renderTransitionPresetCss()}`;
  const sx = context.width / 1080;
  const sy = context.height / 1920;
  return `#main { background: var(--primary-stage-bg, #050608); }
      .primary-demo-media { position: absolute; left: 0; top: ${px(500 * sy)}; width: ${px(context.width)}; height: ${px(810 * sy)}; z-index: 7; object-fit: var(--primary-fit, contain); object-position: var(--primary-focus-x, 50%) var(--primary-focus-y, 50%); background: var(--primary-stage-bg, #050608); outline: ${px(2 * sx)} solid var(--primary-stage-divider, #20252b); }
      .primary-demo-media.primary-proof-media { inset: 0; width: ${px(context.width)}; height: ${px(context.height)}; object-fit: var(--primary-fit, cover); outline: 0; }
      .primary-demo-pip { position: absolute; left: var(--primary-pip-left, ${px(18 * sx)}); top: var(--primary-pip-top, ${px(1200 * sy)}); width: var(--primary-pip-size, ${px(304 * sx)}); height: var(--primary-pip-size, ${px(304 * sx)}); z-index: 8; object-fit: cover; object-position: 50% 42%; border: ${px(4 * sx)} solid var(--primary-pip-border, #f3f0ea); border-radius: 50%; box-shadow: var(--primary-pip-shadow, 0 ${px(18 * sy)} ${px(42 * sx)} rgba(0, 0, 0, .42)); will-change: transform, opacity; }
      #card-host { z-index: 10; }
      .caption-primary { left: ${px(110 * sx)}; right: auto; top: ${px(1435 * sy)}; bottom: auto; width: ${px(860 * sx)}; font-size: ${px(60 * sx)}; line-height: 1.08; white-space: nowrap; }
      .caption-primary-pip { left: ${px(330 * sx)}; top: ${px(1450 * sy)}; width: ${px(570 * sx)}; transform: skewX(-7deg); transform-origin: center; }
      ${renderTransitionPresetCss()}`;
}

function landscapeCss(context) {
  const size = Math.round(Math.min(context.width, context.height) * 0.22);
  return `#main { background: var(--primary-stage-bg, #050608); }
      .primary-demo-media { position: absolute; inset: 0; width: ${px(context.width)}; height: ${px(context.height)}; z-index: 7; object-fit: var(--primary-fit, contain); object-position: var(--primary-focus-x, 50%) var(--primary-focus-y, 50%); background: var(--primary-stage-bg, #050608); }
      .primary-demo-pip { position: absolute; width: ${px(size)}; height: ${px(size)}; z-index: 8; object-fit: cover; object-position: 50% 35%; border: 4px solid var(--primary-pip-border, #f3f0ea); border-radius: 50%; box-shadow: var(--primary-pip-shadow, 0 18px 42px rgba(0, 0, 0, .42)); }
      .primary-demo-pip--top-left { left: 48px; top: 48px; }
      .primary-demo-pip--top-right { right: 48px; top: 48px; }
      .primary-demo-pip--bottom-left { left: 48px; bottom: 48px; }
      .primary-demo-pip--bottom-right { right: 48px; bottom: 48px; }
      #card-host { z-index: 10; }`;
}

function renderTimelineJs(items) {
  return items.map(renderTransitionPresetTimeline).join("\n      ");
}

function compareItems(a, b) {
  return a.start - b.start || a.id.localeCompare(b.id);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}: 必须是有限数字`);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label}: 不能小于 0`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new Error(`${label}: 必须大于 0`);
  return number;
}

function percent(value) {
  return `${Number((value * 100).toFixed(3))}%`;
}

function px(value) {
  return `${Number(value.toFixed(2))}px`;
}
