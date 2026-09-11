import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { sha256File } from "./color-management.mjs";
import { atomicWriteJson, displayVideoGeometry, ffprobeJson, frameRateValue, parseArgs, resolveJob, run } from "./lib.mjs";
import { buildArollBeautyFilter, resolveArollBeautyPreset } from "./aroll-beauty-preset.mjs";
import { resolveVideoEncoder, videoEncoderArgs } from "./video-encoder.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const inputPath = resolveInsideJob(jobDir, args.input || "assets/aroll.mp4", "input");
const outputPath = resolveInsideJob(jobDir, args.output || "assets/aroll-beauty.mp4", "output");
const coverPath = args.cover ? resolveInsideJob(jobDir, args.cover, "cover") : null;
const coverFrames = args["cover-frames"] == null ? 0 : Number(args["cover-frames"]);
if (!fs.existsSync(inputPath)) throw new Error(`缺少 A-roll: ${inputPath}`);
if (coverPath && !fs.existsSync(coverPath)) throw new Error(`缺少封面: ${coverPath}`);
if (inputPath === outputPath) throw new Error("A-roll 美颜输出不得覆盖输入");
if (fs.existsSync(outputPath)) throw new Error(`拒绝覆盖已有输出: ${outputPath}`);
if (!Number.isInteger(coverFrames) || coverFrames < 0 || coverFrames > 12) {
  throw new Error("cover-frames 必须是 0..12 的整数");
}
if (coverFrames > 0 && !coverPath) throw new Error("cover-frames > 0 时必须提供 --cover");

const preset = resolveArollBeautyPreset(args.preset);
const filter = buildArollBeautyFilter(preset);
const probe = ffprobeJson(inputPath);
const video = probe.streams.find((stream) => stream.codec_type === "video");
if (!video) throw new Error(`无法读取 A-roll 视频流: ${inputPath}`);
const geometry = displayVideoGeometry(video);
const fpsText = video.avg_frame_rate || video.r_frame_rate;
const fps = frameRateValue(fpsText);
if (!(fps > 0)) throw new Error(`无法读取 A-roll 帧率: ${fpsText}`);
const duration = Number(video.duration || probe.format?.duration);
if (!(duration > 0)) throw new Error("无法读取 A-roll 时长");
const videoEncoder = resolveVideoEncoder({ requested: args["video-encoder"] || "auto" });
const nonce = `${process.pid}.${crypto.randomUUID()}`;
const extension = path.extname(outputPath) || ".mp4";
const temporaryOutput = path.join(path.dirname(outputPath), `.${path.basename(outputPath, extension)}.${nonce}.tmp${extension}`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const inputs = ["-i", inputPath];
let filterGraph = `[0:v]${filter},format=yuv420p[outv]`;
if (coverPath && coverFrames > 0) {
  inputs.push("-loop", "1", "-framerate", fpsText, "-i", coverPath);
  filterGraph = `[0:v]${filter},format=yuv420p[beauty];[1:v]scale=${geometry.width}:${geometry.height}:force_original_aspect_ratio=increase,crop=${geometry.width}:${geometry.height},setsar=1,format=yuv420p[cover];[beauty][cover]overlay=0:0:enable='lt(n,${coverFrames})',format=yuv420p[outv]`;
}

try {
  run("ffmpeg", [
    "-hide_banner", "-y",
    ...inputs,
    "-filter_complex", filterGraph,
    "-map", "[outv]",
    "-map", "0:a?",
    ...videoEncoderArgs({
      mode: videoEncoder,
      preset: args["cpu-preset"] || "veryfast",
      crf: args.crf || "18",
      videoBitrate: args["video-bitrate"] || "24M",
      fps
    }),
    "-pix_fmt", "yuv420p",
    "-color_range", "tv",
    "-colorspace", "bt709",
    "-color_trc", "bt709",
    "-color_primaries", "bt709",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-t", duration.toFixed(6),
    temporaryOutput
  ]);
  fs.renameSync(temporaryOutput, outputPath);
  atomicWriteJson(path.join(jobDir, "data", "aroll-beauty.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    preset: preset.id,
    input: { path: path.relative(jobDir, inputPath).split(path.sep).join("/"), sha256: sha256File(inputPath) },
    output: { path: path.relative(jobDir, outputPath).split(path.sep).join("/"), sha256: sha256File(outputPath) },
    cover: coverPath ? {
      path: path.relative(jobDir, coverPath).split(path.sep).join("/"),
      sha256: sha256File(coverPath),
      frames: coverFrames
    } : null,
    video: { width: geometry.width, height: geometry.height, fps: fpsText, duration, encoder: videoEncoder },
    filter,
    policy: preset.policy
  });
  console.log(`A-roll beauty rendered: ${outputPath}`);
  console.log(`Preset: ${preset.id} · ${geometry.width}x${geometry.height} · ${fpsText} · ${videoEncoder}`);
} finally {
  fs.rmSync(temporaryOutput, { force: true });
}

function resolveInsideJob(base, relative, label) {
  if (!relative || path.isAbsolute(String(relative))) throw new Error(`${label} 必须是 job 内相对路径`);
  const resolved = path.resolve(base, String(relative));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${label} 路径越出 job`);
  return resolved;
}
