// ============================================================
// 音画对齐门禁：每个 EDL 段取原片 0.6s 参考音频（同倍速处理），在工作母版的「EDL 累加 / 倍率」预期位置附近做归一化互相关，
//   任一锚点偏差 > 1 帧、或相关 <0.3 / 峰值不突出（无法匹配）即失败。同时暴露 concat 帧量化累积漂移和倍速 / 母版错位（2026-09-11 审计机制 1 与 3）。
// 为什么旧 QA 抓不到：qa-audio-alignment.py 拿最终混音对「干净 A-roll」，A-roll 本身已经带偏移；caption-voice 拿字幕校验字幕。
// 用法：node scripts/qa-alignment.mjs --job jobs/<slug> [--tolerance-frames 1] → qa/alignment-report.json
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, parseArgs, readJson, readJsonArray, resolveJob } from "./lib.mjs";
import { assertArollContract } from "./aroll-treat.mjs";

const SR = 8000;
const REF_SECONDS = 0.6;
const SEARCH_SECONDS = 0.35;

// 两边都只取 150–3400Hz 语音带：处理链（动态均衡 / 压缩 / 限幅）改的是幅度包络，带限后波形相关度明显更稳
const BAND = "highpass=f=150,lowpass=f=3400";

function pcm(file, start, length, extraAudioFilter) {
  const af = [extraAudioFilter, BAND].filter(Boolean).join(",");
  const args = ["-v", "error", "-ss", String(Math.max(0, start)), "-t", String(length), "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-af", af, "-f", "f32le", "-"];
  const result = spawnSync("ffmpeg", args, { maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`ffmpeg 提取失败 ${file} @${start}: ${result.stderr}`);
  return new Float32Array(result.stdout.buffer, result.stdout.byteOffset, Math.floor(result.stdout.byteLength / 4));
}

// 归一化互相关，返回 { lagSamples, score }
export function bestLag(ref, target) {
  const n = ref.length;
  const maxLag = target.length - n;
  if (maxLag < 0) return { lagSamples: 0, score: 0 };
  let refEnergy = 0;
  for (let i = 0; i < n; i += 1) refEnergy += ref[i] * ref[i];
  const scores = new Float32Array(maxLag + 1);
  let best = { lagSamples: 0, score: -1 };
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let dot = 0; let energy = 0;
    for (let i = 0; i < n; i += 1) {
      const t = target[lag + i];
      dot += ref[i] * t;
      energy += t * t;
    }
    const score = dot / (Math.sqrt(refEnergy * energy) + 1e-9);
    scores[lag] = score;
    if (score > best.score) best = { lagSamples: lag, score };
  }
  // 峰值突出度：峰外 ±40ms 的最大相关（语音基频周期 5–10ms，近邻本来就相关）；真匹配的峰是尖的，噪声匹配是平的
  const guard = Math.round(SR * 0.04);
  let outside = -1;
  for (let lag = 0; lag <= maxLag; lag += 1) {
    if (Math.abs(lag - best.lagSamples) <= guard) continue;
    if (scores[lag] > outside) outside = scores[lag];
  }
  best.prominence = outside > 0 ? best.score / outside : Infinity;
  return best;
}

export function anchorsFromEdl(segments, rate) {
  let cursor = 0;
  return segments.map((segment, index) => {
    const duration = Number(segment.sourceEnd) - Number(segment.sourceStart);
    const refOffset = Math.min(0.2, Math.max(0, duration - REF_SECONDS * rate) / 2);
    const anchor = {
      index,
      source: segment.source || segment.original,
      sourceStart: Number(segment.sourceStart) + refOffset,
      expectedOutput: (cursor + refOffset) / rate,
      usable: duration >= REF_SECONDS * rate + 0.05
    };
    cursor += duration;
    return anchor;
  });
}

function main() {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const project = readJson(path.join(jobDir, "project.json"));
  const contract = assertArollContract(jobDir, project, "qa:alignment");
  const rate = Number(contract.playbackRate || 1);
  const fps = Number(contract.fps || 30);
  const toleranceSeconds = Number(args["tolerance-frames"] || 1) / fps;
  const segments = readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json"));
  const prepared = new Map();
  const colorManaged = path.join(jobDir, "data", "color-managed-sources.json");
  if (fs.existsSync(colorManaged)) {
    for (const item of readJson(colorManaged).items || []) prepared.set(item.source, item.prepared);
  }
  const items = [];
  for (const anchor of anchorsFromEdl(segments, rate)) {
    if (!anchor.usable) { items.push({ ...anchor, skipped: "段太短" }); continue; }
    const sourceRelative = prepared.get(anchor.source) || anchor.source;
    const sourcePath = path.join(jobDir, sourceRelative);
    if (!fs.existsSync(sourcePath)) { items.push({ ...anchor, ok: false, error: `原片不存在 ${sourceRelative}` }); continue; }
    const ref = pcm(sourcePath, anchor.sourceStart, REF_SECONDS * rate, rate !== 1 ? `atempo=${rate}` : null);
    const windowStart = anchor.expectedOutput - SEARCH_SECONDS;
    const target = pcm(contract.masterPath, windowStart, REF_SECONDS + 2 * SEARCH_SECONDS, null);
    const { lagSamples, score, prominence } = bestLag(ref.subarray(0, Math.round(REF_SECONDS * SR)), target);
    const measured = Math.max(0, windowStart) + lagSamples / SR;
    const offset = measured - anchor.expectedOutput;
    const matched = score >= 0.3 && prominence >= 1.25;
    const ok = matched && Math.abs(offset) <= toleranceSeconds;
    items.push({ ...anchor, measuredOutput: round(measured), offsetSeconds: round(offset), offsetFrames: round(offset * fps), score: round(score), prominence: round(prominence), matched, ok });
  }
  const checked = items.filter((item) => !item.skipped);
  const failed = checked.filter((item) => !item.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    master: contract.master,
    masterHash: contract.masterHash,
    playbackRate: rate,
    fps,
    toleranceFrames: Number(args["tolerance-frames"] || 1),
    anchors: items.length,
    checked: checked.length,
    failed: failed.length,
    maxAbsOffsetFrames: round(Math.max(0, ...checked.map((item) => Math.abs(item.offsetFrames || 0)))),
    status: failed.length ? "failed" : "passed",
    items
  };
  fs.mkdirSync(path.join(jobDir, "qa"), { recursive: true });
  atomicWriteJson(path.join(jobDir, "qa", "alignment-report.json"), report);
  console.log(`音画对齐 ${report.status}：${checked.length} 个锚点，最大偏差 ${report.maxAbsOffsetFrames} 帧（容差 ${report.toleranceFrames}）`);
  for (const item of failed) console.log(`  ✗ 段 ${item.index + 1} ${item.source} 偏差 ${item.offsetFrames ?? "?"} 帧 相关 ${item.score ?? "?"} 突出度 ${item.prominence ?? "?"}${item.matched === false ? "（无法匹配）" : ""} ${item.error || ""}`);
  if (failed.length) process.exit(2);
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
