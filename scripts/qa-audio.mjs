import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, resolveJob, writeJson } from "./lib.mjs";
import { resolvePathInsideJob } from "./normalize-audio.mjs";

export const DEFAULT_AUDIO_GATES = Object.freeze({
  minLufs: -14,
  maxLufs: -12,
  maxTruePeakDbfs: -1
});

export function parseEbur128Summary(output) {
  const text = String(output || "");
  const summaryAt = text.lastIndexOf("Summary:");
  if (summaryAt < 0) throw new Error("无法解析 FFmpeg ebur128：缺少 Summary");
  const summary = text.slice(summaryAt);
  const integrated = summary.match(/Integrated loudness:\s*[\s\S]*?\bI:\s*([+-]?(?:\d+(?:\.\d+)?|inf))\s*LUFS/i);
  const truePeak = summary.match(/True peak:\s*[\s\S]*?\bPeak:\s*([+-]?(?:\d+(?:\.\d+)?|inf))\s*dBFS/i);
  const metrics = {
    integratedLufs: Number(integrated?.[1]),
    truePeakDbfs: Number(truePeak?.[1])
  };
  if (!Object.values(metrics).every(Number.isFinite)) {
    throw new Error("无法解析 FFmpeg ebur128 的 Integrated loudness / True peak；输入可能无有效音轨或为静音");
  }
  return metrics;
}

export function resolveAudioGates(args = {}) {
  const gates = {
    minLufs: numericArg(args["min-lufs"], DEFAULT_AUDIO_GATES.minLufs, "--min-lufs"),
    maxLufs: numericArg(args["max-lufs"], DEFAULT_AUDIO_GATES.maxLufs, "--max-lufs"),
    maxTruePeakDbfs: numericArg(
      args["max-true-peak"],
      DEFAULT_AUDIO_GATES.maxTruePeakDbfs,
      "--max-true-peak"
    )
  };
  if (gates.minLufs > gates.maxLufs) throw new Error("--min-lufs 不能大于 --max-lufs");
  return gates;
}

export function evaluateAudioMetrics(metrics, gates = DEFAULT_AUDIO_GATES) {
  const failures = [];
  if (metrics.integratedLufs < gates.minLufs) {
    failures.push(`integrated loudness ${metrics.integratedLufs.toFixed(2)} LUFS < ${gates.minLufs.toFixed(2)} LUFS`);
  }
  if (metrics.integratedLufs > gates.maxLufs) {
    failures.push(`integrated loudness ${metrics.integratedLufs.toFixed(2)} LUFS > ${gates.maxLufs.toFixed(2)} LUFS`);
  }
  if (metrics.truePeakDbfs > gates.maxTruePeakDbfs) {
    failures.push(`true peak ${metrics.truePeakDbfs.toFixed(2)} dBFS > ${gates.maxTruePeakDbfs.toFixed(2)} dBFS`);
  }
  return { passed: failures.length === 0, failures };
}

export function renderAudioReportMarkdown(report) {
  return `# Audio QA Report

- Status: **${report.status}**
- Video: \`${report.video}\`
- Checked: ${report.checkedAt}
- Integrated loudness: ${report.metrics.integratedLufs.toFixed(2)} LUFS
- True peak: ${report.metrics.truePeakDbfs.toFixed(2)} dBFS
- Gate: ${report.thresholds.minLufs.toFixed(2)}..${report.thresholds.maxLufs.toFixed(2)} LUFS
- True peak ceiling: ${report.thresholds.maxTruePeakDbfs.toFixed(2)} dBFS
- Failures: ${report.failures.length ? report.failures.join("; ") : "none"}
`;
}

export function runAudioQa({ jobDir, video, gates = DEFAULT_AUDIO_GATES, spawn = spawnSync, now = new Date() }) {
  const videoPath = resolvePathInsideJob(jobDir, video, { label: "视频", mustExist: true });
  const result = spawn("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", videoPath,
    "-map", "0:a:0",
    "-vn",
    "-af", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { encoding: "utf8", stdio: "pipe" });
  if (result.error) throw new Error(`FFmpeg 音频 QA 无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "无诊断输出").trim();
    throw new Error(`FFmpeg 音频 QA 失败(exit ${result.status}):\n${detail}`);
  }

  const metrics = parseEbur128Summary(`${result.stdout || ""}\n${result.stderr || ""}`);
  const verdict = evaluateAudioMetrics(metrics, gates);
  const report = {
    status: verdict.passed ? "passed" : "failed",
    video: path.relative(jobDir, videoPath),
    checkedAt: now.toISOString(),
    metrics,
    thresholds: gates,
    failures: verdict.failures
  };
  const qaDir = path.join(jobDir, "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  writeJson(path.join(qaDir, "audio-report.json"), report);
  fs.writeFileSync(path.join(qaDir, "audio-report.md"), renderAudioReportMarkdown(report));
  return report;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.job || !args.video) {
    throw new Error("用法: node scripts/qa-audio.mjs --job <job> --video <job内视频> [--min-lufs -14 --max-lufs -12 --max-true-peak -1]");
  }
  const gates = resolveAudioGates(args);
  const jobDir = resolveJob(args.job);
  const report = runAudioQa({ jobDir, video: args.video, gates });
  console.log(`Audio QA: ${report.status}`);
  console.log(`Report: ${path.join(jobDir, "qa", "audio-report.md")}`);
  if (report.status !== "passed") process.exitCode = 1;
}

function numericArg(value, fallback, name) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} 必须是有限数字`);
  return parsed;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`Audio QA 失败: ${error.message}`);
    process.exitCode = 1;
  }
}
