import fs from "node:fs";
import path from "node:path";

import { sha256File } from "./color-management.mjs";

export const EDITORIAL_PLAN_PATH = "data/editorial-plan.json";

const STORY_ROLES = new Set([
  "hook",
  "context",
  "question",
  "claim",
  "evidence",
  "explanation",
  "example",
  "counterpoint",
  "payoff",
  "cta"
]);
const VISUAL_ROLES = new Set(["face", "evidence", "explanation", "atmosphere", "none"]);
const SOURCE_POLICIES = new Set(["preserve-order", "allow-semantic-reorder"]);
const CREATOR_METHODS = new Set(["agent", "human", "hybrid"]);

const HASH_PATHS = {
  project: "project.json",
  editorialPlan: EDITORIAL_PLAN_PATH,
  semanticTakeMap: "data/semantic-take-map.json",
  edl: "data/rough-cut-edl.json",
  captions: "data/captions.json",
  visualContext: "data/visual-context.json",
  visualPlan: "data/visual-plan.json",
  recipeRenders: "data/recipe-renders.json",
  beats: "data/beats.json",
  broll: "data/broll.json",
  primaryClips: "data/primary-clips.json"
};

export function validateEditorialPlan(value, { semanticTakeMap } = {}) {
  const errors = [];
  if (!isObject(value)) {
    return { ok: false, errors: ["内容结构计划必须是 JSON 对象"], storyBeatCount: 0 };
  }
  if (value.schemaVersion !== 1) errors.push("editorial-plan.json schemaVersion 必须为 1");
  requireText(value.audienceProblem, "audienceProblem", errors);
  requireText(value.thesis, "thesis", errors);
  requireText(value.narrativeStrategy, "narrativeStrategy", errors);
  if (!SOURCE_POLICIES.has(value.sourcePolicy)) {
    errors.push("sourcePolicy 必须是 preserve-order 或 allow-semantic-reorder");
  }
  if (!isObject(value.createdBy)) errors.push("createdBy 必须记录规划者和方法");
  else {
    requireText(value.createdBy.name, "createdBy.name", errors);
    if (!CREATOR_METHODS.has(value.createdBy.method)) {
      errors.push("createdBy.method 必须是 agent/human/hybrid");
    }
    if (value.createdBy.method !== "human") {
      requireText(value.createdBy.model, "createdBy.model", errors);
      if (value.createdBy.skill !== "talkinghead-edit") {
        errors.push("Agent 规划必须记录 createdBy.skill=talkinghead-edit");
      }
    }
  }

  const storyBeats = Array.isArray(value.storyBeats) ? value.storyBeats : [];
  if (!storyBeats.length) errors.push("storyBeats 不能为空");
  const storyIds = new Set();
  const keepIds = new Set(
    Array.isArray(semanticTakeMap?.ranges)
      ? semanticTakeMap.ranges.filter((item) => item?.decision === "keep").map((item) => item.id)
      : []
  );
  for (const [index, beat] of storyBeats.entries()) {
    const label = `storyBeats[${index}]`;
    const id = String(beat?.id || "").trim();
    if (!id) errors.push(`${label} 缺少 id`);
    else if (storyIds.has(id)) errors.push(`${label} id 重复: ${id}`);
    else storyIds.add(id);
    if (!STORY_ROLES.has(beat?.role)) errors.push(`${label}.role 无效`);
    requireText(beat?.claim, `${label}.claim`, errors);
    requireText(beat?.purpose, `${label}.purpose`, errors);
    if (!VISUAL_ROLES.has(beat?.visualRole)) errors.push(`${label}.visualRole 无效`);
    if (beat?.visualRole !== "face" && beat?.visualRole !== "none") {
      requireText(beat?.visualReason, `${label}.visualReason`, errors);
    }
    const takeIds = Array.isArray(beat?.takeIds) ? beat.takeIds : [];
    if (!takeIds.length) errors.push(`${label}.takeIds 不能为空`);
    if (new Set(takeIds).size !== takeIds.length) errors.push(`${label}.takeIds 不允许重复`);
    if (semanticTakeMap) {
      for (const takeId of takeIds) {
        if (!keepIds.has(takeId)) errors.push(`${label}.takeIds 引用了不存在的 keep 段: ${takeId}`);
      }
    }
  }

  if (!Array.isArray(value.exclusions)) errors.push("exclusions 必须是数组，可以为空");
  else {
    value.exclusions.forEach((item, index) => {
      requireText(item?.claim, `exclusions[${index}].claim`, errors);
      requireText(item?.reason, `exclusions[${index}].reason`, errors);
    });
  }

  return { ok: errors.length === 0, errors, storyBeatCount: storyBeats.length };
}

export function validateTimelineContract({
  editorialPlan,
  semanticTakeMap,
  edl,
  captions,
  beats,
  broll,
  primaryClips,
  stage = "visual"
}) {
  const errors = [];
  const storyBeats = Array.isArray(editorialPlan?.storyBeats) ? editorialPlan.storyBeats : [];
  const storyById = new Map(storyBeats.map((item, index) => [item.id, { ...item, order: index }]));
  const takes = Array.isArray(semanticTakeMap?.ranges)
    ? semanticTakeMap.ranges.filter((item) => item?.decision === "keep")
    : [];
  const takeById = new Map(takes.map((item) => [item.id, item]));
  const segments = Array.isArray(edl) ? edl : [];
  if (!segments.length) errors.push("rough-cut-edl.json 不能为空");
  const segmentIds = new Set();
  const timelineRanges = [];
  let cursor = 0;
  let previousOrder = -1;

  for (const [index, segment] of segments.entries()) {
    const label = `EDL[${index}]`;
    const id = String(segment?.id || "").trim();
    const storyBeatId = String(segment?.storyBeatId || "").trim();
    const takeId = String(segment?.takeId || "").trim();
    if (!id) errors.push(`${label} 缺少 id`);
    else if (segmentIds.has(id)) errors.push(`${label} id 重复: ${id}`);
    else segmentIds.add(id);
    if (!storyBeatId) errors.push(`${label} 缺少 storyBeatId`);
    if (!takeId) errors.push(`${label} 缺少 takeId`);
    requireText(segment?.reason, `${label}.reason`, errors);
    requireText(segment?.source, `${label}.source`, errors);
    const sourceStart = Number(segment?.sourceStart);
    const sourceEnd = Number(segment?.sourceEnd);
    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceStart < 0 || sourceEnd <= sourceStart) {
      errors.push(`${label} 的 sourceStart/sourceEnd 无效`);
      continue;
    }
    const story = storyById.get(storyBeatId);
    if (!story) errors.push(`${label} 引用了不存在的 storyBeatId: ${storyBeatId || "_"}`);
    else {
      if (story.order < previousOrder) errors.push(`${label} 的段落顺序倒退到 ${storyBeatId}`);
      previousOrder = Math.max(previousOrder, story.order);
      if (!story.takeIds?.includes(takeId)) errors.push(`${label} 的 takeId 不属于 ${storyBeatId}`);
    }
    const take = takeById.get(takeId);
    if (!take) errors.push(`${label} 引用了不存在的 keep take: ${takeId || "_"}`);
    else if (take.source !== segment.source
      || Number(take.sourceStart) > sourceStart + 0.05
      || Number(take.sourceEnd) < sourceEnd - 0.05) {
      errors.push(`${label} 未被 takeId=${takeId} 的完整表达区间覆盖`);
    }
    const outputStart = cursor;
    const outputEnd = cursor + sourceEnd - sourceStart;
    timelineRanges.push({ id, storyBeatId, outputStart, outputEnd });
    cursor = outputEnd;
  }

  if (stage === "edl") return finish(errors, timelineRanges);

  validateCaptions(captions, timelineRanges, segmentIds, errors);
  validateVisualItems("beats", beats, timelineRanges, errors);
  validateVisualItems("broll", broll, timelineRanges, errors);
  validateVisualItems("primaryClips", primaryClips, timelineRanges, errors);
  return finish(errors, timelineRanges);
}

export function collectEditorialHashes(jobDir, stage = "visual") {
  const names = stage === "plan"
    ? ["project", "editorialPlan", "semanticTakeMap", "edl"]
    : Object.keys(HASH_PATHS);
  return Object.fromEntries(names.map((name) => {
    const file = path.join(jobDir, HASH_PATHS[name]);
    return [name, fs.existsSync(file) ? sha256File(file) : null];
  }));
}

export function hashesMatch(expected, actual) {
  if (!isObject(expected) || !isObject(actual)) return false;
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return keys.every((key) => expected[key] === actual[key]);
}

function validateCaptions(items, ranges, segmentIds, errors) {
  if (!Array.isArray(items) || !items.length) {
    errors.push("captions.json 不能为空");
    return;
  }
  for (const [index, item] of items.entries()) {
    const label = `captions[${index}]`;
    const storyBeatId = String(item?.storyBeatId || "").trim();
    const edlSegmentId = String(item?.edlSegmentId || "").trim();
    if (!storyBeatId) errors.push(`${label} 缺少 storyBeatId`);
    if (!segmentIds.has(edlSegmentId)) errors.push(`${label} edlSegmentId 无效: ${edlSegmentId || "_"}`);
    const linked = ranges.find((range) => range.id === edlSegmentId);
    if (linked && linked.storyBeatId !== storyBeatId) errors.push(`${label} 与 EDL 的 storyBeatId 不一致`);
    if (linked && !overlaps(Number(item?.s), Number(item?.e), linked.outputStart, linked.outputEnd)) {
      errors.push(`${label} 时间不在 ${edlSegmentId} 的输出区间内`);
    }
  }
}

function validateVisualItems(name, items, ranges, errors) {
  if (items == null) return;
  if (!Array.isArray(items)) {
    errors.push(`${name}.json 必须是数组`);
    return;
  }
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const label = `${name}[${index}]`;
    const id = String(item?.id || "").trim();
    const storyBeatId = String(item?.storyBeatId || "").trim();
    if (!id) errors.push(`${label} 缺少 id`);
    else if (ids.has(id)) errors.push(`${label} id 重复: ${id}`);
    else ids.add(id);
    if (!storyBeatId) errors.push(`${label} 缺少 storyBeatId`);
    requireText(item?.intent, `${label}.intent`, errors);
    requireText(item?.reason, `${label}.reason`, errors);
    const start = Number(item?.start);
    const end = Number(item?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      errors.push(`${label} 的 start/end 无效`);
      continue;
    }
    const storyRanges = ranges.filter((range) => range.storyBeatId === storyBeatId);
    if (!storyRanges.length) errors.push(`${label} 引用了没有 EDL 内容的 storyBeatId: ${storyBeatId || "_"}`);
    else if (!storyRanges.some((range) => overlaps(start, end, range.outputStart, range.outputEnd))) {
      errors.push(`${label} 时间没有覆盖 ${storyBeatId} 的口播区间`);
    }
  }
}

function overlaps(startA, endA, startB, endB) {
  return Number.isFinite(startA) && Number.isFinite(endA) && endA > startB + 0.001 && startA < endB - 0.001;
}

function finish(errors, timelineRanges) {
  return {
    ok: errors.length === 0,
    errors,
    timelineRanges,
    linkedSegmentCount: timelineRanges.length
  };
}

function requireText(value, label, errors) {
  if (!String(value || "").trim()) errors.push(`${label} 不能为空`);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
