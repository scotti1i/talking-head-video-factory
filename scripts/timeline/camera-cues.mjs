import path from "node:path";

import { fmtTime, readJsonArray } from "../lib.mjs";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const EPSILON = 1e-9;
const EASES = Object.freeze([
  "power2.inOut",
  "power3.out",
  "power4.out",
  "expo.out"
]);

export function createCameraCues(options = {}) {
  const jobDir = resolveJobDir(options.jobDir);
  const totalDuration = positiveNumber(options.totalDuration, "camera-cues: totalDuration");
  const rawItems = options.items == null
    ? readJsonArray(path.join(jobDir, "data", "camera-cues.json"))
    : options.items;
  if (!Array.isArray(rawItems)) throw new Error("camera-cues: items 必须是数组");

  const items = rawItems.map(normalizeCue).sort(compareCues);
  validateIds(items);
  validateCueOverlaps(items);
  validateTimelineBounds(items, totalDuration);
  validateBlockedRanges(items, options.blockedRanges || []);

  return {
    items,
    timelineJs: renderCameraTimeline(items),
    ranges: items.map(({ id, start, duration }) => ({ id, start, end: start + duration }))
  };
}

function resolveJobDir(value) {
  if (!value) throw new Error("camera-cues: 缺 jobDir");
  return path.resolve(String(value));
}

function normalizeCue(cue, index) {
  const label = `camera-cues[${index}]`;
  if (!cue || typeof cue !== "object" || Array.isArray(cue)) {
    throw new Error(`${label}: 必须是对象`);
  }

  const id = String(cue.id || "");
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${label}.id: 只能使用小写字母、数字、_、-`);
  }

  const normalized = {
    id,
    start: nonNegativeNumber(cue.start, `${label}(${id}).start`),
    duration: rangedNumber(cue.duration, `${label}(${id}).duration`, [0.1, 0.35]),
    scale: rangedNumber(cue.scale, `${label}(${id}).scale`, [1, 1.18]),
    xPercent: rangedNumber(cue.xPercent ?? 0, `${label}(${id}).xPercent`, [-6, 6]),
    yPercent: rangedNumber(cue.yPercent ?? 0, `${label}(${id}).yPercent`, [-6, 6]),
    ease: String(cue.ease || "power4.out")
  };
  if (!EASES.includes(normalized.ease)) {
    throw new Error(`${label}(${id}).ease: 只能是 ${EASES.join("/")}`);
  }

  const hasFrom = cue.fromScale != null || cue.fromXPercent != null || cue.fromYPercent != null;
  if (!hasFrom) return normalized;
  return {
    ...normalized,
    fromScale: rangedNumber(cue.fromScale ?? 1, `${label}(${id}).fromScale`, [1, 1.18]),
    fromXPercent: rangedNumber(cue.fromXPercent ?? 0, `${label}(${id}).fromXPercent`, [-6, 6]),
    fromYPercent: rangedNumber(cue.fromYPercent ?? 0, `${label}(${id}).fromYPercent`, [-6, 6])
  };
}

function validateIds(items) {
  const ids = new Set();
  for (const cue of items) {
    if (ids.has(cue.id)) throw new Error(`camera-cues: id 重复 ${cue.id}`);
    ids.add(cue.id);
  }
}

function validateCueOverlaps(items) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (current.start < previous.start + previous.duration - EPSILON) {
      throw new Error(`camera-cues: ${previous.id} 与 ${current.id} 不允许重叠`);
    }
  }
}

function validateTimelineBounds(items, totalDuration) {
  for (const cue of items) {
    const end = cue.start + cue.duration;
    if (end > totalDuration + EPSILON) {
      throw new Error(`camera-cues(${cue.id}): 结束时间 ${end.toFixed(3)}s 超出成片 ${totalDuration.toFixed(3)}s`);
    }
  }
}

function validateBlockedRanges(items, rawRanges) {
  if (!Array.isArray(rawRanges)) throw new Error("camera-cues: blockedRanges 必须是数组");
  const ranges = rawRanges.map((range, index) => normalizeBlockedRange(range, index));
  for (const cue of items) {
    const cueEnd = cue.start + cue.duration;
    for (const range of ranges) {
      if (cue.start < range.end - EPSILON && cueEnd > range.start + EPSILON) {
        throw new Error(`camera-cues(${cue.id}): 镜头状态不允许与 ${range.label} 重叠`);
      }
    }
  }
}

function normalizeBlockedRange(range, index) {
  const label = `blockedRanges[${index}]`;
  if (!range || typeof range !== "object" || Array.isArray(range)) {
    throw new Error(`camera-cues: ${label} 必须是对象`);
  }
  const start = nonNegativeNumber(range.start, `camera-cues: ${label}.start`);
  const end = positiveNumber(range.end, `camera-cues: ${label}.end`);
  if (end <= start) throw new Error(`camera-cues: ${label} 需要 end > start`);
  return { start, end, label: String(range.label || label) };
}

function renderCameraTimeline(items) {
  const lines = [
    "tl.set(cameraWrap, { xPercent: 0, yPercent: 0, scale: 1 }, 0);"
  ];
  for (const cue of items) {
    if (cue.fromScale != null) {
      lines.push(
        `tl.set(cameraWrap, { xPercent: ${number(cue.fromXPercent)}, yPercent: ${number(cue.fromYPercent)}, scale: ${number(cue.fromScale)} }, ${fmtTime(cue.start)});`
      );
    }
    lines.push(
      `tl.to(cameraWrap, { xPercent: ${number(cue.xPercent)}, yPercent: ${number(cue.yPercent)}, scale: ${number(cue.scale)}, duration: ${fmtTime(cue.duration)}, ease: "${cue.ease}" }, ${fmtTime(cue.start)});`
    );
  }
  return lines.join("\n      ");
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
