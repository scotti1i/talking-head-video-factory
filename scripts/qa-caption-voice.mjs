import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

const EPSILON = 1e-9;

export function validateCaptionVoice({ captions, beats, contract }) {
  const errors = [];
  const tolerance = finiteNonNegative(contract?.tolerance, "caption-voice.tolerance", errors, 0.04);
  const regions = normalizeRegions(contract?.regions, errors);
  const normalizedCaptions = normalizeIntervals(captions, "captions", errors);
  const normalizedBeats = normalizeIntervals(beats, "beats", errors, { textKey: "type" });

  validateOrderedNonOverlapping(regions, "caption-voice.regions", errors);
  validateOrderedNonOverlapping(normalizedCaptions, "captions", errors);

  const captionRegions = regions.filter((region) => region.coverage === "captions");
  const overlayRegions = regions.filter((region) => region.coverage === "text-overlay");

  for (const [index, caption] of normalizedCaptions.entries()) {
    const region = captionRegions.find((candidate) => contains(candidate, caption, tolerance));
    if (!region) {
      errors.push(`captions[${index}] ${range(caption)} 超出已批准的人声字幕区`);
    }
  }

  for (const [index, region] of captionRegions.entries()) {
    const clips = normalizedCaptions.filter((caption) => overlaps(caption, region, tolerance));
    if (!clips.length) {
      errors.push(`caption-voice.regions[${index}] ${range(region)} 没有字幕覆盖`);
      continue;
    }
    if (clips[0].start > region.start + tolerance) {
      errors.push(`人声区 ${range(region)} 起声后 ${(clips[0].start - region.start).toFixed(3)}s 才出现字幕`);
    }
    for (let clipIndex = 1; clipIndex < clips.length; clipIndex += 1) {
      const gap = clips[clipIndex].start - clips[clipIndex - 1].end;
      if (gap > tolerance) {
        errors.push(`人声区 ${range(region)} 的字幕中断 ${gap.toFixed(3)}s`);
      }
    }
    const last = clips.at(-1);
    if (last.end < region.end - tolerance) {
      errors.push(`人声区 ${range(region)} 尾音前 ${(region.end - last.end).toFixed(3)}s 已无字幕`);
    }
    const expectedTokens = tokenize(region.expectedText);
    const actualText = clips.map((clip) => clip.text).join(" ");
    const actualTokens = tokenize(actualText);
    if (!sameTokens(expectedTokens, actualTokens)) {
      errors.push(`人声区 ${range(region)} 字幕逐词不完整：期望「${region.expectedText}」，实际「${actualText}」${tokenDifference(expectedTokens, actualTokens)}`);
    }
  }

  for (const [index, region] of overlayRegions.entries()) {
    const candidate = normalizedBeats.find((beat) => {
      const typeMatches = !region.beatType || beat.text === region.beatType;
      return typeMatches && contains(beat, region, tolerance);
    });
    if (!candidate) {
      errors.push(`等价屏幕文字区 ${range(region)} 缺少覆盖它的 ${region.beatType || "beat"}`);
    }
    if (normalizedCaptions.some((caption) => overlaps(caption, region, 0))) {
      errors.push(`等价屏幕文字区 ${range(region)} 不应再叠加常规字幕`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      tolerance,
      approvedVoiceRegions: regions.length,
      captionVoiceRegions: captionRegions.length,
      textOverlayRegions: overlayRegions.length,
      captions: normalizedCaptions.length
    }
  };
}

function normalizeRegions(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("caption-voice.regions 必须是数组");
    return [];
  }
  return value.map((region, index) => {
    const normalized = normalizeInterval(region, `caption-voice.regions[${index}]`, errors);
    const coverage = String(region?.coverage || "");
    if (!['captions', 'text-overlay'].includes(coverage)) {
      errors.push(`caption-voice.regions[${index}].coverage 只能是 captions/text-overlay`);
    }
    const expectedText = typeof region?.expectedText === "string" ? region.expectedText.trim() : "";
    if (coverage === "captions" && !expectedText) {
      errors.push(`caption-voice.regions[${index}].expectedText 必须记录该声区实际口播全文`);
    }
    return { ...normalized, coverage, beatType: region?.beatType ? String(region.beatType) : "", expectedText };
  });
}

function normalizeIntervals(value, label, errors, options = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} 必须是数组`);
    return [];
  }
  return value.map((item, index) => {
    const normalized = normalizeInterval(item, `${label}[${index}]`, errors, { startKey: options.startKey, endKey: options.endKey });
    return { ...normalized, text: String(item?.[options.textKey || "t"] || "") };
  });
}

function normalizeInterval(value, label, errors, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} 必须是对象`);
    return { start: 0, end: 0 };
  }
  const startKey = options.startKey || (Object.hasOwn(value, "s") ? "s" : "start");
  const endKey = options.endKey || (Object.hasOwn(value, "e") ? "e" : "end");
  const start = Number(value[startKey]);
  const end = Number(value[endKey]);
  if (!Number.isFinite(start) || start < 0) errors.push(`${label}.${startKey} 必须是非负数`);
  if (!Number.isFinite(end) || end <= start) errors.push(`${label}.${endKey} 必须大于 start`);
  return { start, end };
}

function validateOrderedNonOverlapping(items, label, errors) {
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].start < items[index - 1].start - EPSILON) {
      errors.push(`${label} 必须按时间升序`);
    }
    if (items[index].start < items[index - 1].end - EPSILON) {
      errors.push(`${label}[${index - 1}] 与 ${label}[${index}] 不得重叠`);
    }
  }
}

function finiteNonNegative(value, label, errors, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${label} 必须是非负数`);
    return fallback;
  }
  return number;
}

function contains(container, item, tolerance) {
  return item.start >= container.start - tolerance && item.end <= container.end + tolerance;
}

function overlaps(left, right, tolerance) {
  return left.start < right.end + tolerance && left.end > right.start - tolerance;
}

function range(item) {
  return `${item.start.toFixed(3)}–${item.end.toFixed(3)}s`;
}

function tokenize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .match(/[\p{L}\p{N}]+/gu) || [];
}

function sameTokens(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function tokenDifference(expected, actual) {
  const missing = expected.filter((token, index) => actual[index] !== token);
  const extra = actual.filter((token, index) => expected[index] !== token);
  const parts = [];
  if (missing.length) parts.push(`缺失/错位：${missing.join(" ")}`);
  if (extra.length) parts.push(`多余/错位：${extra.join(" ")}`);
  return parts.length ? `（${parts.join("；")}）` : "";
}

function main() {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const captions = readJson(path.join(jobDir, "data", "captions.json"));
  const beats = readJson(path.join(jobDir, "data", "beats.json"));
  const contract = readJson(path.join(jobDir, "data", "caption-voice.json"));
  const result = validateCaptionVoice({ captions, beats, contract });
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    ...result
  };
  writeJson(path.join(jobDir, "qa", "caption-voice-report.json"), report);
  if (!result.ok) {
    for (const error of result.errors) console.error(`FAIL ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK caption voice QA: ${result.summary.captions} captions · ${result.summary.approvedVoiceRegions} approved voice regions`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
