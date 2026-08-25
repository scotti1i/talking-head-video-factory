import fs from "node:fs";
import path from "node:path";
import {
  ffprobeJson,
  parseArgs,
  readJson,
  resolveJob,
  run,
  sanitizeSlug,
  seconds,
  writeJson
} from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const configPath = path.join(jobDir, "project.json");
const shortsPath = path.join(jobDir, "data", "shorts.json");

if (!fs.existsSync(configPath)) {
  console.error(`Missing project.json: ${configPath}`);
  process.exit(1);
}

if (!fs.existsSync(shortsPath)) {
  console.error(`Missing shorts data: ${shortsPath}`);
  process.exit(1);
}

const config = readJson(configPath);
const shorts = readJson(shortsPath);
if (!Array.isArray(shorts) || !shorts.length) {
  console.error(`${shortsPath} must contain at least one short segment`);
  process.exit(1);
}

const shortsConfig = config.shorts || {};
const sourceVideo = resolveMedia(
  args.source || shortsConfig.sourceVideo || config.shortsSourceVideo || "renders/final-60fps.mp4"
);

if (!fs.existsSync(sourceVideo)) {
  console.error(`Missing Shorts source video: ${sourceVideo}`);
  process.exit(1);
}

const width = Number(shortsConfig.width || 1080);
const height = Number(shortsConfig.height || 1920);
const fps = Number(shortsConfig.fps || 60);
const maxDuration = Number(shortsConfig.maxDuration || 120);
const officialMaxDuration = Number(shortsConfig.officialMaxDuration || 180);
const mode = String(args.mode || shortsConfig.mode || "copy");
const crf = String(shortsConfig.crf || "18");
const preset = String(shortsConfig.preset || "veryfast");
const outputDir = path.join(jobDir, args.output || shortsConfig.outputDir || "shorts");
const qaDir = path.join(jobDir, "qa", "shorts");
const deliveryDir = path.join(jobDir, "delivery", "youtube-shorts");

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(qaDir, { recursive: true });
fs.mkdirSync(deliveryDir, { recursive: true });

const sourceProbe = ffprobeJson(sourceVideo);
const sourceVideoStream = sourceProbe.streams.find((stream) => stream.codec_type === "video");
const sourceDuration = Number(sourceProbe.format?.duration || 0);
const reports = [];

if (!["copy", "encode"].includes(mode)) {
  throw new Error(`Invalid shorts mode "${mode}". Use "copy" or "encode".`);
}

if (mode === "copy") {
  const sourceFailures = [];
  if (sourceVideoStream?.width !== width) sourceFailures.push(`source width ${sourceVideoStream?.width} != ${width}`);
  if (sourceVideoStream?.height !== height) sourceFailures.push(`source height ${sourceVideoStream?.height} != ${height}`);
  if (!sameFps(sourceVideoStream?.avg_frame_rate || sourceVideoStream?.r_frame_rate, fps)) {
    sourceFailures.push(`source fps ${sourceVideoStream?.avg_frame_rate || sourceVideoStream?.r_frame_rate} != ${fps}`);
  }
  if (sourceFailures.length) {
    throw new Error(
      `Shorts stream-copy requires a compliant source; ${sourceFailures.join("; ")}. Use --mode encode only as an explicit fallback.`
    );
  }
}

for (let index = 0; index < shorts.length; index += 1) {
  const item = shorts[index];
  const seq = String(index + 1).padStart(2, "0");
  const id = sanitizeSlug(item.id || `${seq}-${item.title || "short"}`);
  if (!id) throw new Error(`Short #${seq} needs an id or title`);

  const start = seconds(item.start);
  const end = item.end == null ? start + seconds(item.duration) : seconds(item.end);
  const duration = end - start;
  const failures = [];

  if (start < 0) failures.push(`start ${start} must be >= 0`);
  if (duration <= 0) failures.push(`duration ${duration} must be > 0`);
  if (duration > maxDuration) failures.push(`duration ${duration.toFixed(3)}s exceeds configured max ${maxDuration}s`);
  if (duration > officialMaxDuration) {
    failures.push(`duration ${duration.toFixed(3)}s exceeds YouTube Shorts max ${officialMaxDuration}s`);
  }
  if (sourceDuration && end > sourceDuration + 0.1) {
    failures.push(`end ${end.toFixed(3)}s exceeds source duration ${sourceDuration.toFixed(3)}s`);
  }
  if (failures.length) {
    throw new Error(`Invalid short ${id}: ${failures.join("; ")}`);
  }

  const out = path.join(outputDir, `${seq}-${id}-60fps.mp4`);
  if (mode === "copy") {
    run("ffmpeg", [
      "-y",
      "-ss",
      start.toFixed(3),
      "-i",
      sourceVideo,
      "-t",
      duration.toFixed(3),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "+faststart",
      out
    ]);
  } else {
    const vf = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      `fps=${fps}`
    ].join(",");

    run("ffmpeg", [
      "-y",
      "-ss",
      start.toFixed(3),
      "-i",
      sourceVideo,
      "-t",
      duration.toFixed(3),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      out
    ]);
  }

  const report = qaShort({
    id,
    title: item.title || id,
    sourceVideo,
    videoPath: out,
    mode,
    start,
    end,
    expected: { width, height, fps, maxDuration }
  });
  reports.push(report);

  fs.copyFileSync(out, path.join(deliveryDir, path.basename(out)));
}

const reportPath = path.join(qaDir, "report.json");
const reportMdPath = path.join(qaDir, "report.md");
writeJson(reportPath, {
  sourceVideo,
  checkedAt: new Date().toISOString(),
  expected: { width, height, fps, maxDuration, officialMaxDuration, mode },
  shorts: reports
});
fs.writeFileSync(reportMdPath, renderMarkdown(reports));

console.log(`Shorts cut: ${reports.length}`);
console.log(`Output: ${outputDir}`);
console.log(`Delivery: ${deliveryDir}`);
console.log(`QA: ${reportMdPath}`);

function resolveMedia(input) {
  if (path.isAbsolute(input)) return input;
  return path.join(jobDir, input);
}

function qaShort(report) {
  const probe = ffprobeJson(report.videoPath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration || video?.duration || 0);
  const failures = [];

  if (video?.width !== report.expected.width) failures.push(`width ${video?.width} != ${report.expected.width}`);
  if (video?.height !== report.expected.height) failures.push(`height ${video?.height} != ${report.expected.height}`);
  if (!sameFps(video?.avg_frame_rate || video?.r_frame_rate, report.expected.fps)) {
    failures.push(`fps ${video?.avg_frame_rate || video?.r_frame_rate} != ${report.expected.fps}`);
  }
  if (!audio) failures.push("missing audio stream");
  if (duration > report.expected.maxDuration + 0.05) {
    failures.push(`duration ${duration.toFixed(3)}s > ${report.expected.maxDuration}s`);
  }

  const framesDir = path.join(qaDir, report.id);
  fs.mkdirSync(framesDir, { recursive: true });
  for (const time of sampleTimes(duration)) {
    const frame = path.join(framesDir, `frame-${String(Math.round(time * 1000)).padStart(6, "0")}ms.jpg`);
    run("ffmpeg", ["-y", "-ss", String(time), "-i", report.videoPath, "-frames:v", "1", "-q:v", "2", frame], {
      capture: true
    });
  }

  const fullReport = {
    ...report,
    duration,
    streams: probe.streams,
    format: probe.format,
    framesDir,
    failures
  };
  if (failures.length) {
    throw new Error(`QA failed for ${report.id}: ${failures.join("; ")}`);
  }
  return fullReport;
}

function sampleTimes(duration) {
  return [0.5, duration / 2, Math.max(0.5, duration - 0.5)]
    .filter((time) => Number.isFinite(time) && time >= 0 && time < duration)
    .filter((time, index, all) => all.findIndex((other) => Math.abs(other - time) < 0.25) === index);
}

function sameFps(raw, expected) {
  if (!raw) return false;
  const [num, den = "1"] = String(raw).split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return false;
  return Math.abs(num / den - expected) < 0.01;
}

function renderMarkdown(reports) {
  const rows = reports
    .map((report) => {
      const video = report.streams.find((stream) => stream.codec_type === "video");
      return `| ${report.id} | ${report.mode} | ${report.duration.toFixed(2)}s | ${video.width}x${video.height} | ${video.avg_frame_rate || video.r_frame_rate} | ${report.failures.length ? report.failures.join("; ") : "none"} |`;
    })
    .join("\n");

  return `# YouTube Shorts QA

| Short | Mode | Duration | Resolution | FPS | Failures |
|------|------|----------|------------|-----|----------|
${rows}
`;
}
