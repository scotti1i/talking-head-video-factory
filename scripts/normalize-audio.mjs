import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, resolveJob } from "./lib.mjs";

export const DEFAULT_LOUDNORM_TARGETS = Object.freeze({
  integratedLufs: -13,
  loudnessRange: 7,
  // Leave AAC enough codec headroom so the encoded deliverable stays below the -1 dBFS QA ceiling.
  truePeakDbfs: -1.6
});

export function resolvePathInsideJob(jobDir, candidate, { label = "路径", mustExist = false } = {}) {
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${label}不能为空`);
  if (!fs.existsSync(jobDir) || !fs.statSync(jobDir).isDirectory()) {
    throw new Error(`job 目录不存在: ${jobDir}`);
  }

  const lexicalRoot = path.resolve(jobDir);
  const realRoot = fs.realpathSync(lexicalRoot);
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(lexicalRoot, candidate);
  assertContained(lexicalRoot, resolved, label);

  if (mustExist) {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`${label}文件不存在: ${candidate}`);
    }
    assertContained(realRoot, fs.realpathSync(resolved), label);
    return resolved;
  }

  const existing = nearestExistingPath(resolved);
  assertContained(realRoot, fs.realpathSync(existing), label, { allowRoot: true });
  if (fs.existsSync(resolved)) {
    if (!fs.statSync(resolved).isFile()) throw new Error(`${label}必须是文件路径: ${candidate}`);
    assertContained(realRoot, fs.realpathSync(resolved), label);
  }
  return resolved;
}

export function resolveNormalizePaths({ jobDir, input, output }) {
  const inputPath = resolvePathInsideJob(jobDir, input, { label: "输入", mustExist: true });
  const outputPath = resolvePathInsideJob(jobDir, output, { label: "输出" });
  const resolvedInput = fs.realpathSync(inputPath);
  const resolvedOutput = fs.existsSync(outputPath) ? fs.realpathSync(outputPath) : path.resolve(outputPath);
  if (resolvedInput === resolvedOutput) throw new Error("输入和输出必须是不同路径");
  return { inputPath, outputPath };
}

export function parseLoudnormAnalysis(output) {
  const blocks = String(output || "").match(/\{\s*"input_i"[\s\S]*?\}/g) || [];
  for (const block of blocks.reverse()) {
    let data;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }
    const values = {
      inputI: Number(data.input_i),
      inputTp: Number(data.input_tp),
      inputLra: Number(data.input_lra),
      inputThresh: Number(data.input_thresh),
      targetOffset: Number(data.target_offset)
    };
    if (Object.values(values).every(Number.isFinite)) return values;
  }
  throw new Error("无法解析 FFmpeg loudnorm 首遍 JSON；输入可能无有效音轨或为静音");
}

export function buildAnalysisArgs(inputPath, targets = DEFAULT_LOUDNORM_TARGETS) {
  return [
    "-hide_banner",
    "-nostats",
    "-i", inputPath,
    "-map", "0:a:0",
    "-vn",
    "-af", loudnormBase(targets, "print_format=json"),
    "-f", "null",
    "-"
  ];
}

export function buildNormalizeArgs(inputPath, outputPath, measured, targets = DEFAULT_LOUDNORM_TARGETS) {
  const measuredOptions = [
    `measured_I=${measured.inputI}`,
    `measured_LRA=${measured.inputLra}`,
    `measured_TP=${measured.inputTp}`,
    `measured_thresh=${measured.inputThresh}`,
    `offset=${measured.targetOffset}`,
    "linear=true",
    "print_format=summary"
  ].join(":");
  return [
    "-y",
    "-hide_banner",
    "-i", inputPath,
    "-map", "0:v:0?",
    "-map", "0:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-af", loudnormBase(targets, measuredOptions),
    "-movflags", "+faststart",
    outputPath
  ];
}

export function runNormalizeAudio({ jobDir, input, output, spawn = spawnSync }) {
  const { inputPath, outputPath } = resolveNormalizePaths({ jobDir, input, output });
  const analysis = runFfmpeg(buildAnalysisArgs(inputPath), "首遍响度分析", spawn);
  const measured = parseLoudnormAnalysis(`${analysis.stdout || ""}\n${analysis.stderr || ""}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  runFfmpeg(buildNormalizeArgs(inputPath, outputPath, measured), "二遍响度正规化", spawn);
  return { inputPath, outputPath, measured, targets: DEFAULT_LOUDNORM_TARGETS };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.job || !args.input || !args.output) {
    throw new Error("用法: node scripts/normalize-audio.mjs --job <job> --input <job内文件> --output <job内文件>");
  }
  const result = runNormalizeAudio({
    jobDir: resolveJob(args.job),
    input: args.input,
    output: args.output
  });
  console.log(`音频正规化完成: ${result.outputPath}`);
  console.log("目标: I=-13 LUFS, LRA=7 LU, TP=-1.6 dBTP; AAC 192k / 48kHz; 视频 stream copy");
}

function loudnormBase(targets, suffix) {
  return [
    `loudnorm=I=${targets.integratedLufs}`,
    `LRA=${targets.loudnessRange}`,
    `TP=${targets.truePeakDbfs}`,
    suffix
  ].join(":");
}

function runFfmpeg(args, phase, spawn) {
  const result = spawn("ffmpeg", args, { encoding: "utf8", stdio: "pipe" });
  if (result.error) throw new Error(`FFmpeg ${phase}无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "无诊断输出").trim();
    throw new Error(`FFmpeg ${phase}失败(exit ${result.status}):\n${detail}`);
  }
  return result;
}

function assertContained(root, target, label, { allowRoot = false } = {}) {
  const relative = path.relative(root, target);
  if ((!allowRoot && !relative) || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label}必须位于 job 目录内: ${target}`);
  }
}

function nearestExistingPath(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`找不到输出路径的有效父目录: ${target}`);
    current = parent;
  }
  return current;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`音频正规化失败: ${error.message}`);
    process.exitCode = 1;
  }
}
