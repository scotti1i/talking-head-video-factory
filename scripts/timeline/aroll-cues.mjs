import fs from "node:fs";
import path from "node:path";

import { escapeHtml, fmtTime, readJsonArray } from "../lib.mjs";

export const AROLL_CUE_TYPES = Object.freeze([
  "punch",
  "flash-punch",
  "whip-cut",
  "rgb-glitch-cut"
]);

const DIRECTIONS = Object.freeze(["left", "right", "up", "down"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const EPSILON = 1e-9;
const TRACK_START = 620;

const LIMITS = Object.freeze({
  punch: Object.freeze({ duration: [0.12, 0.45], scale: [1.02, 1.18] }),
  "flash-punch": Object.freeze({ duration: [0.15, 0.3], scale: [1.04, 1.2] }),
  "whip-cut": Object.freeze({ duration: [0.13, 0.24], scale: [1.08, 1.18] }),
  "rgb-glitch-cut": Object.freeze({ duration: [0.2, 0.4], scale: [1.02, 1.12] })
});

export function createArollCues(options = {}) {
  const jobDir = resolveJobDir(options.jobDir);
  const totalDuration = positiveNumber(options.totalDuration, "aroll-cues: totalDuration");
  const rawItems = options.items == null
    ? readJsonArray(path.join(jobDir, "data", "aroll-cues.json"))
    : options.items;
  if (!Array.isArray(rawItems)) throw new Error("aroll-cues: items 必须是数组");

  const items = rawItems.map(normalizeCue).sort(compareCues);
  validateIds(items);
  validateCueOverlaps(items);
  validateTimelineBounds(items, totalDuration);
  validateBlockedRanges(items, options.blockedRanges || []);

  if (!items.length) return emptyBundle();
  return {
    items,
    html: renderArollCueHtml(items),
    css: renderArollCueCss(),
    timelineJs: renderArollCueTimeline(items),
    ranges: items.map(({ id, start, duration }) => ({ id, start, end: start + duration }))
  };
}

function resolveJobDir(value) {
  if (!value) throw new Error("aroll-cues: 缺 jobDir");
  return path.resolve(String(value));
}

function normalizeCue(cue, index) {
  const label = `aroll-cues[${index}]`;
  if (!cue || typeof cue !== "object" || Array.isArray(cue)) {
    throw new Error(`${label}: 必须是对象`);
  }

  const id = String(cue.id || "");
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${label}.id: 只能使用小写字母、数字、_、-`);
  }
  const type = String(cue.type || "");
  if (!AROLL_CUE_TYPES.includes(type)) {
    throw new Error(`${label}(${id}).type: 只能是 ${AROLL_CUE_TYPES.join("/")}`);
  }

  const start = nonNegativeNumber(cue.start, `${label}(${id}).start`);
  const duration = rangedNumber(
    cue.duration,
    `${label}(${id}).duration`,
    LIMITS[type].duration
  );
  const scale = rangedNumber(
    cue.scale,
    `${label}(${id}).scale`,
    LIMITS[type].scale
  );

  if (type !== "whip-cut") {
    if (cue.direction != null) throw new Error(`${label}(${id}).direction: 只用于 whip-cut`);
    return { id, type, start, duration, scale };
  }

  const direction = String(cue.direction || "");
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`${label}(${id}).direction: 只能是 ${DIRECTIONS.join("/")}`);
  }
  return { id, type, start, duration, direction, scale };
}

function validateIds(items) {
  const ids = new Set();
  for (const cue of items) {
    if (ids.has(cue.id)) throw new Error(`aroll-cues: id 重复 ${cue.id}`);
    ids.add(cue.id);
  }
}

function validateCueOverlaps(items) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (current.start < previous.start + previous.duration - EPSILON) {
      throw new Error(`aroll-cues: ${previous.id} 与 ${current.id} 不允许重叠`);
    }
  }
}

function validateTimelineBounds(items, totalDuration) {
  for (const cue of items) {
    const end = cue.start + cue.duration;
    if (end > totalDuration + EPSILON) {
      throw new Error(`aroll-cues(${cue.id}): 结束时间 ${end.toFixed(3)}s 超出成片 ${totalDuration.toFixed(3)}s`);
    }
  }
}

function validateBlockedRanges(items, rawRanges) {
  if (!Array.isArray(rawRanges)) throw new Error("aroll-cues: blockedRanges 必须是数组");
  const ranges = rawRanges.map((range, index) => normalizeBlockedRange(range, index));
  for (const cue of items) {
    const cueEnd = cue.start + cue.duration;
    for (const range of ranges) {
      if (cue.start < range.end - EPSILON && cueEnd > range.start + EPSILON) {
        throw new Error(`aroll-cues(${cue.id}): 纯 A-roll cue 不允许与 ${range.label} 重叠`);
      }
    }
  }
}

function normalizeBlockedRange(range, index) {
  const label = `blockedRanges[${index}]`;
  if (!range || typeof range !== "object" || Array.isArray(range)) {
    throw new Error(`aroll-cues: ${label} 必须是对象`);
  }
  const start = nonNegativeNumber(range.start, `aroll-cues: ${label}.start`);
  const end = positiveNumber(range.end, `aroll-cues: ${label}.end`);
  if (end <= start) throw new Error(`aroll-cues: ${label} 需要 end > start`);
  return { start, end, label: String(range.label || label) };
}

function renderArollCueHtml(items) {
  return items
    .filter((cue) => cue.type !== "punch")
    .map((cue, index) => {
      const direction = cue.type === "whip-cut" ? ` data-direction="${escapeHtml(cue.direction)}"` : "";
      const overlay = `<div id="aroll-cue-overlay-${escapeHtml(cue.id)}" class="clip aroll-cue-overlay aroll-cue-${escapeHtml(cue.type)}" data-kind="aroll-${escapeHtml(cue.type)}" data-start="${fmtTime(cue.start)}" data-duration="${fmtTime(cue.duration)}" data-track-index="${TRACK_START + index}" data-manual-timeline="true"${direction} aria-hidden="true"></div>`;
      if (cue.type !== "whip-cut") return overlay;
      const filter = `<svg class="aroll-motion-filter" width="0" height="0" aria-hidden="true"><defs><filter id="aroll-cue-filter-${escapeHtml(cue.id)}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur id="aroll-cue-blur-${escapeHtml(cue.id)}" in="SourceGraphic" stdDeviation="0 0" edgeMode="duplicate"></feGaussianBlur></filter></defs></svg>`;
      return `${filter}\n      ${overlay}`;
    })
    .join("\n      ");
}

function renderArollCueCss() {
  return `.aroll-motion-filter { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
      .aroll-cue-overlay { position: absolute; inset: 0; z-index: 4; opacity: 0; visibility: visible; pointer-events: none; will-change: transform, opacity; }
      .aroll-cue-flash-punch { background: #fff; mix-blend-mode: screen; }
      .aroll-cue-whip-cut { z-index: 20; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.10) 28%, rgba(255,255,255,.52) 46%, rgba(255,255,255,.82) 50%, rgba(255,255,255,.52) 54%, rgba(255,255,255,.10) 72%, transparent 100%); filter: blur(10px); mix-blend-mode: screen; }
      .aroll-cue-whip-cut[data-direction="up"], .aroll-cue-whip-cut[data-direction="down"] { background: linear-gradient(0deg, transparent 0%, rgba(255,255,255,.10) 28%, rgba(255,255,255,.52) 46%, rgba(255,255,255,.82) 50%, rgba(255,255,255,.52) 54%, rgba(255,255,255,.10) 72%, transparent 100%); }
      .aroll-cue-rgb-glitch-cut { z-index: 20; background: repeating-linear-gradient(180deg, rgba(0,255,255,.16) 0 3px, transparent 3px 9px, rgba(255,0,110,.14) 9px 12px, transparent 12px 18px); mix-blend-mode: screen; }`;
}

function renderArollCueTimeline(items) {
  return items.map((cue) => {
    if (cue.type === "flash-punch") return flashPunchTimeline(cue);
    if (cue.type === "whip-cut") return whipCutTimeline(cue);
    if (cue.type === "rgb-glitch-cut") return rgbGlitchTimeline(cue);
    return punchTimeline(cue);
  }).join("\n      ");
}

function rgbGlitchTimeline(cue) {
  const selector = `#aroll-cue-overlay-${cue.id}`;
  const phase = cue.duration / 4;
  const t1 = cue.start + phase;
  const t2 = cue.start + phase * 2;
  const t3 = cue.start + phase * 3;
  const end = cue.start + cue.duration;
  return [
    resetVideoWrap(cue.start),
    `tl.set("${selector}", { opacity: 0, xPercent: -2 }, ${fmtTime(cue.start)});`,
    `tl.to(videoWrap, { xPercent: -1.2, scale: ${number(cue.scale)}, filter: "brightness(1.16) contrast(1.2) drop-shadow(9px 0 rgba(255,0,90,.72)) drop-shadow(-9px 0 rgba(0,220,255,.72))", duration: ${fmtTime(phase)}, ease: "none" }, ${fmtTime(cue.start)});`,
    `tl.to("${selector}", { opacity: 0.55, xPercent: 1.5, duration: ${fmtTime(phase)}, ease: "steps(2)" }, ${fmtTime(cue.start)});`,
    `tl.set(videoWrap, { xPercent: 1.1, filter: "brightness(1.08) contrast(1.28) drop-shadow(-7px 0 rgba(255,0,90,.74)) drop-shadow(7px 0 rgba(0,220,255,.74))" }, ${fmtTime(t1)});`,
    `tl.to(videoWrap, { xPercent: -0.55, scale: ${number(Math.max(1.02, cue.scale - 0.02))}, duration: ${fmtTime(phase)}, ease: "none" }, ${fmtTime(t1)});`,
    `tl.to("${selector}", { opacity: 0.3, xPercent: -1, duration: ${fmtTime(phase)}, ease: "steps(2)" }, ${fmtTime(t1)});`,
    `tl.set(videoWrap, { xPercent: 0.7 }, ${fmtTime(t2)});`,
    `tl.to(videoWrap, { xPercent: 0, scale: 1, filter: "brightness(1) contrast(1) drop-shadow(0 0 rgba(255,0,90,0)) drop-shadow(0 0 rgba(0,220,255,0))", duration: ${fmtTime(phase * 2)}, ease: "power3.out" }, ${fmtTime(t2)});`,
    `tl.to("${selector}", { opacity: 0, xPercent: 0, duration: ${fmtTime(phase)}, ease: "steps(2)" }, ${fmtTime(t2)});`,
    `tl.set("${selector}", { opacity: 0, xPercent: 0 }, ${fmtTime(t3)});`,
    resetVideoWrap(end)
  ].join("\n      ");
}

function punchTimeline(cue) {
  const attack = cue.duration * 0.38;
  const peak = cue.start + attack;
  const end = cue.start + cue.duration;
  return [
    resetVideoWrap(cue.start),
    `tl.to(videoWrap, { scale: ${number(cue.scale)}, duration: ${fmtTime(attack)}, ease: "power3.in" }, ${fmtTime(cue.start)});`,
    `tl.to(videoWrap, { scale: 1, duration: ${fmtTime(cue.duration - attack)}, ease: "power3.out" }, ${fmtTime(peak)});`,
    resetVideoWrap(end)
  ].join("\n      ");
}

function flashPunchTimeline(cue) {
  const selector = `#aroll-cue-overlay-${cue.id}`;
  const attack = cue.duration * 0.4;
  const peak = cue.start + attack;
  const end = cue.start + cue.duration;
  return [
    resetVideoWrap(cue.start),
    `tl.set("${selector}", { opacity: 0 }, ${fmtTime(cue.start)});`,
    `tl.to(videoWrap, { scale: ${number(cue.scale)}, duration: ${fmtTime(attack)}, ease: "power3.in" }, ${fmtTime(cue.start)});`,
    `tl.to("${selector}", { opacity: 0.4, duration: ${fmtTime(attack)}, ease: "power2.in" }, ${fmtTime(cue.start)});`,
    `tl.to(videoWrap, { scale: 1, duration: ${fmtTime(cue.duration - attack)}, ease: "power3.out" }, ${fmtTime(peak)});`,
    `tl.to("${selector}", { opacity: 0, duration: ${fmtTime(cue.duration - attack)}, ease: "power2.out" }, ${fmtTime(peak)});`,
    resetVideoWrap(end),
    `tl.set("${selector}", { opacity: 0 }, ${fmtTime(end)});`
  ].join("\n      ");
}

function whipCutTimeline(cue) {
  const selector = `#aroll-cue-overlay-${cue.id}`;
  const filterId = `aroll-cue-filter-${cue.id}`;
  const blurSelector = `#aroll-cue-blur-${cue.id}`;
  const midpoint = cue.start + cue.duration / 2;
  const end = cue.start + cue.duration;
  const half = cue.duration / 2;
  const motion = directionalMotion(cue.direction);
  const deviation = directionalBlur(cue.direction);
  return [
    resetVideoWrap(cue.start),
    `tl.set("${blurSelector}", { attr: { stdDeviation: "0 0" } }, ${fmtTime(cue.start)});`,
    `tl.set(videoWrap, { filter: "url(#${filterId}) brightness(1.02)" }, ${fmtTime(cue.start)});`,
    `tl.set("${selector}", { opacity: 0, xPercent: ${motion.streakFromX}, yPercent: ${motion.streakFromY} }, ${fmtTime(cue.start)});`,
    `tl.to(videoWrap, { xPercent: ${motion.outgoingX}, yPercent: ${motion.outgoingY}, scale: ${number(cue.scale)}, duration: ${fmtTime(half)}, ease: "power2.in" }, ${fmtTime(cue.start)});`,
    `tl.to("${blurSelector}", { attr: { stdDeviation: "${deviation}" }, duration: ${fmtTime(half)}, ease: "power2.in" }, ${fmtTime(cue.start)});`,
    `tl.to("${selector}", { opacity: 0.3, xPercent: 0, yPercent: 0, duration: ${fmtTime(half)}, ease: "power2.in" }, ${fmtTime(cue.start)});`,
    `tl.set(videoWrap, { xPercent: ${motion.incomingX}, yPercent: ${motion.incomingY}, scale: ${number(cue.scale)} }, ${fmtTime(midpoint)});`,
    `tl.to(videoWrap, { xPercent: 0, yPercent: 0, scale: 1, duration: ${fmtTime(half)}, ease: "power2.out" }, ${fmtTime(midpoint)});`,
    `tl.to("${blurSelector}", { attr: { stdDeviation: "0 0" }, duration: ${fmtTime(half)}, ease: "power2.out" }, ${fmtTime(midpoint)});`,
    `tl.to("${selector}", { opacity: 0, xPercent: ${motion.streakToX}, yPercent: ${motion.streakToY}, duration: ${fmtTime(half)}, ease: "power2.out" }, ${fmtTime(midpoint)});`,
    resetVideoWrap(end),
    `tl.set("${blurSelector}", { attr: { stdDeviation: "0 0" } }, ${fmtTime(end)});`,
    `tl.set("${selector}", { opacity: 0, xPercent: 0, yPercent: 0 }, ${fmtTime(end)});`
  ].join("\n      ");
}

function directionalBlur(direction) {
  return direction === "up" || direction === "down" ? "1 24" : "24 1";
}

function directionalMotion(direction) {
  switch (direction) {
    case "right":
      return { outgoingX: 6, outgoingY: 0, incomingX: -6, incomingY: 0, streakFromX: -26, streakFromY: 0, streakToX: 26, streakToY: 0 };
    case "up":
      return { outgoingX: 0, outgoingY: -6, incomingX: 0, incomingY: 6, streakFromX: 0, streakFromY: 26, streakToX: 0, streakToY: -26 };
    case "down":
      return { outgoingX: 0, outgoingY: 6, incomingX: 0, incomingY: -6, streakFromX: 0, streakFromY: -26, streakToX: 0, streakToY: 26 };
    default:
      return { outgoingX: -6, outgoingY: 0, incomingX: 6, incomingY: 0, streakFromX: 26, streakFromY: 0, streakToX: -26, streakToY: 0 };
  }
}

function resetVideoWrap(time) {
  return `tl.set(videoWrap, { xPercent: 0, yPercent: 0, scale: 1, filter: "blur(0px) brightness(1)" }, ${fmtTime(time)});`;
}

function emptyBundle() {
  return { items: [], html: "", css: "", timelineJs: "", ranges: [] };
}

function compareCues(left, right) {
  return left.start - right.start || left.id.localeCompare(right.id);
}

function rangedNumber(value, label, [minimum, maximum]) {
  const parsed = finiteNumber(value, label);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${label}: 必须在 ${minimum}..${maximum}`);
  }
  return parsed;
}

function nonNegativeNumber(value, label) {
  const parsed = finiteNumber(value, label);
  if (parsed < 0) throw new Error(`${label}: 不能小于 0`);
  return parsed;
}

function positiveNumber(value, label) {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new Error(`${label}: 必须大于 0`);
  return parsed;
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}: 必须是有限数字`);
  return parsed;
}

function number(value) {
  return Number(value.toFixed(4));
}
