#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseArgs, readJson, readJsonArray, resolveJob, videoDuration } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const config = readJson(path.join(jobDir, "project.json"));
const sourceRel = String(args.source || config.sourceVideo || "assets/aroll.mp4");
const outputRel = String(args.output || "assets/visual-master.mp4");
const sourcePath = path.resolve(jobDir, sourceRel);
const outputPath = path.resolve(jobDir, outputRel);
const jobRoot = `${path.resolve(jobDir)}${path.sep}`;

if (!sourcePath.startsWith(jobRoot) || !outputPath.startsWith(jobRoot)) {
  throw new Error("source/output 必须位于 job 内");
}
if (!fs.existsSync(sourcePath)) throw new Error(`A-roll 不存在: ${sourceRel}`);

const totalDuration = videoDuration(sourcePath);
const width = Number(config.width || 1080);
const height = Number(config.height || 1920);
const fps = Number(args.fps || 30);
if (!(width > 0 && height > 0 && fps > 0)) throw new Error("width/height/fps 必须为正数");

const clips = readJsonArray(path.join(jobDir, "data", "primary-clips.json"))
  .filter((item) => !Array.isArray(item.formats) || item.formats.includes(width <= height ? "portrait" : "landscape"))
  .sort((a, b) => Number(a.start) - Number(b.start));

if (!clips.length) throw new Error("primary-clips.json 没有当前画幅可烘焙的片段");

let cursor = 0;
for (const [index, clip] of clips.entries()) {
  const start = Number(clip.start);
  const end = Number(clip.end);
  const sourceStart = Number(clip.sourceStart || 0);
  if (clip.kind !== "proof-footage") throw new Error(`primary-clips[${index}] 只支持 proof-footage 烘焙`);
  if (clip.speakerPip === true) throw new Error(`primary-clips[${index}] 启用了 speakerPip，不能烘焙为单轨`);
  if (!(start >= cursor - 0.001 && end > start && end <= totalDuration + 0.01)) {
    throw new Error(`primary-clips[${index}] 时间非法或重叠`);
  }
  if (!(sourceStart >= 0)) throw new Error(`primary-clips[${index}].sourceStart 非法`);
  const mediaPath = path.resolve(jobDir, String(clip.src || ""));
  if (!mediaPath.startsWith(jobRoot) || !fs.existsSync(mediaPath)) {
    throw new Error(`primary-clips[${index}] 素材不存在或越界`);
  }
  if (sourceStart + end - start > videoDuration(mediaPath) + 0.01) {
    throw new Error(`primary-clips[${index}] 源素材时长不足`);
  }
  cursor = end;
}

const segments = [];
cursor = 0;
for (const [index, clip] of clips.entries()) {
  const start = Number(clip.start);
  const end = Number(clip.end);
  if (start > cursor + 0.001) segments.push({ type: "aroll", start: cursor, end: start });
  segments.push({
    type: "proof",
    input: index + 1,
    start: Number(clip.sourceStart || 0),
    end: Number(clip.sourceStart || 0) + end - start
  });
  cursor = end;
}
if (cursor < totalDuration - 0.001) segments.push({ type: "aroll", start: cursor, end: totalDuration });

const inputArgs = ["-i", sourcePath];
for (const clip of clips) inputArgs.push("-i", path.resolve(jobDir, clip.src));

const filters = [];
const labels = [];
for (const [index, segment] of segments.entries()) {
  const input = segment.type === "aroll" ? 0 : segment.input;
  const label = `v${index}`;
  filters.push(
    `[${input}:v]trim=start=${fmt(segment.start)}:end=${fmt(segment.end)},setpts=PTS-STARTPTS,`
    + `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,`
    + `crop=${width}:${height},setsar=1,format=yuv420p[${label}]`
  );
  labels.push(`[${label}]`);
}
filters.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=0[visual]`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const parsed = path.parse(outputPath);
const tempPath = path.join(parsed.dir, `.${parsed.name}.${process.pid}.tmp${parsed.ext}`);
const ffmpegArgs = [
  "-hide_banner", "-loglevel", "error", "-y",
  ...inputArgs,
  "-filter_complex", filters.join(";"),
  "-map", "[visual]", "-map", "0:a:0",
  "-t", fmt(totalDuration),
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
  "-g", String(fps), "-keyint_min", String(fps), "-sc_threshold", "0",
  "-pix_fmt", "yuv420p", "-color_range", "tv",
  "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-movflags", "+faststart", tempPath
];

const result = spawnSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
if (result.status !== 0) {
  fs.rmSync(tempPath, { force: true });
  throw new Error(`ffmpeg 烘焙失败，退出码 ${result.status}`);
}

const actualDuration = videoDuration(tempPath);
if (Math.abs(actualDuration - totalDuration) > 0.05) {
  fs.rmSync(tempPath, { force: true });
  throw new Error(`视觉母版时长不一致: ${actualDuration.toFixed(3)} != ${totalDuration.toFixed(3)}`);
}
fs.renameSync(tempPath, outputPath);
console.log(`Baked ${clips.length} proof clips → ${outputPath}`);
console.log(`Duration ${actualDuration.toFixed(3)}s · ${width}x${height} · ${fps}fps`);

function fmt(value) {
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
