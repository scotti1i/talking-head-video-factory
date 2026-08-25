import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, resolveJob } from "./lib.mjs";
import { resolveNormalizePaths } from "./normalize-audio.mjs";

const EXPECTED_TAGS = Object.freeze({
  pix_fmt: "yuv420p",
  color_range: "tv",
  color_space: "bt709",
  color_transfer: "bt709",
  color_primaries: "bt709"
});

export function bitstreamFilterFor(codecName) {
  if (codecName === "h264") {
    return "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1";
  }
  if (codecName === "hevc") {
    return "hevc_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1";
  }
  throw new Error(`不支持无损写入 Rec.709 标签的视频编码: ${codecName || "unknown"}`);
}

export function buildTagArgs(inputPath, outputPath, codecName) {
  return [
    "-y",
    "-hide_banner",
    "-i", inputPath,
    "-map", "0",
    "-c", "copy",
    "-bsf:v", bitstreamFilterFor(codecName),
    "-color_range", "tv",
    "-colorspace", "bt709",
    "-color_trc", "bt709",
    "-color_primaries", "bt709",
    "-movflags", "+faststart",
    outputPath
  ];
}

export function assertRec709Sdr(stream) {
  const failures = Object.entries(EXPECTED_TAGS)
    .filter(([key, expected]) => stream?.[key] !== expected)
    .map(([key, expected]) => `${key}=${stream?.[key] || "unknown"}, expected ${expected}`);
  if (failures.length) throw new Error(`Rec.709 标签校验失败: ${failures.join("; ")}`);
  return true;
}

export function runTagSdrRec709({ jobDir, input, output, spawn = spawnSync }) {
  const { inputPath, outputPath } = resolveNormalizePaths({ jobDir, input, output });
  const before = probeVideoStream(inputPath, spawn);
  if (before.pix_fmt !== "yuv420p") {
    throw new Error(`拒绝只写标签：输入像素格式 ${before.pix_fmt || "unknown"} 不是 yuv420p，需要先做真正的 SDR 转换`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  runProcess("ffmpeg", buildTagArgs(inputPath, outputPath, before.codec_name), "写入 Rec.709 码流标签", spawn);
  const after = probeVideoStream(outputPath, spawn);
  assertRec709Sdr(after);
  return { inputPath, outputPath, codec: before.codec_name, before, after };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.job || !args.input || !args.output) {
    throw new Error("用法: node scripts/tag-sdr-rec709.mjs --job <job> --input <job内文件> --output <job内文件>");
  }
  const result = runTagSdrRec709({
    jobDir: resolveJob(args.job),
    input: args.input,
    output: args.output
  });
  console.log(`Rec.709 标签已写入并复核: ${result.outputPath}`);
  console.log(`视频未重编码: ${result.codec} stream copy / yuv420p / tv / bt709`);
}

function probeVideoStream(file, spawn) {
  const result = runProcess("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,pix_fmt,color_range,color_space,color_transfer,color_primaries",
    "-of", "json",
    file
  ], "读取视频色彩标签", spawn);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    throw new Error("ffprobe 返回了无效 JSON");
  }
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error(`没有视频流: ${file}`);
  return stream;
}

function runProcess(command, args, phase, spawn) {
  const result = spawn(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.error) throw new Error(`${phase}无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "无诊断输出").trim();
    throw new Error(`${phase}失败(exit ${result.status}):\n${detail}`);
  }
  return result;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`Rec.709 标签处理失败: ${error.message}`);
    process.exitCode = 1;
  }
}
