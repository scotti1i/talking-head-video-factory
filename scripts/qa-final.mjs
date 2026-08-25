import fs from "node:fs";
import path from "node:path";
import { displayVideoGeometry, ffprobeJson, frameRateValue, parseArgs, projectRoot, readJson, resolveJob, run, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const config = readJson(path.join(jobDir, "project.json"));
const videoPath = resolveVideoPath(args.video || path.join("renders", "final-60fps.mp4"));

if (!fs.existsSync(videoPath)) {
  console.error(`Missing final video: ${videoPath}`);
  process.exit(1);
}

function resolveVideoPath(input) {
  if (path.isAbsolute(input)) return input;
  const rootCandidate = path.join(projectRoot(), input);
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  return path.join(jobDir, input);
}

const probe = ffprobeJson(videoPath);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
if (!video) throw new Error(`Missing video stream: ${videoPath}`);
const expectedWidth = Number(config.width || 1080);
const expectedHeight = Number(config.height || 1920);
const configuredFps = String(config.render?.fps || 60);
const requestedFps = String(args.fps || configuredFps);
const expectedFps = requestedFps.includes("/") ? requestedFps : `${requestedFps}/1`;
const expectedFpsValue = frameRateValue(expectedFps);
const expectSdr = config.render?.sdr !== false;

const failures = [];
const display = displayVideoGeometry(video);
if (display.width !== expectedWidth) failures.push(`display width ${display.width} != ${expectedWidth}`);
if (display.height !== expectedHeight) failures.push(`display height ${display.height} != ${expectedHeight}`);
if (normalizedRotation(display.rotation) !== 0) failures.push(`rotation ${display.rotation}° was not baked into pixels`);
if (video.sample_aspect_ratio && video.sample_aspect_ratio !== "1:1") failures.push(`sample aspect ratio ${video.sample_aspect_ratio} != 1:1`);
const actualFpsValues = [video.avg_frame_rate, video.r_frame_rate].map(frameRateValue).filter(Number.isFinite);
if (!Number.isFinite(expectedFpsValue) || !actualFpsValues.some((value) => Math.abs(value - expectedFpsValue) <= 0.001)) {
  failures.push(`fps ${video.avg_frame_rate} / ${video.r_frame_rate} != ${expectedFps}`);
}
if (!audio) failures.push("missing audio stream");
if (audio && String(audio.sample_rate || "") !== "48000") failures.push(`audio sample rate ${audio.sample_rate || "unknown"} != 48000`);
const videoStart = Number(video.start_time ?? probe.format?.start_time);
const audioStart = Number(audio?.start_time ?? probe.format?.start_time);
const frameDuration = Number.isFinite(expectedFpsValue) && expectedFpsValue > 0 ? 1 / expectedFpsValue : 0.04;
if (Number.isFinite(videoStart) && Math.abs(videoStart) > frameDuration) failures.push(`video start ${videoStart}s is not near zero`);
if (Number.isFinite(videoStart) && Number.isFinite(audioStart) && Math.abs(videoStart - audioStart) > frameDuration) {
  failures.push(`A/V start offset ${Math.abs(videoStart - audioStart).toFixed(4)}s > one frame`);
}
if (expectSdr) {
  if (video.pix_fmt !== "yuv420p") failures.push(`pixel format ${video.pix_fmt || "unknown"} != yuv420p`);
  if (video.color_range !== "tv") failures.push(`color range ${video.color_range || "unknown"} != tv`);
  if (video.color_space !== "bt709") failures.push(`color space ${video.color_space || "unknown"} != bt709`);
  if (video.color_transfer !== "bt709") failures.push(`color transfer ${video.color_transfer || "unknown"} != bt709`);
  if (video.color_primaries !== "bt709") failures.push(`color primaries ${video.color_primaries || "unknown"} != bt709`);
  const hdrSideData = (video.side_data_list || []).find((item) => /dovi|mastering display|content light|hdr10\+/i.test(String(item?.side_data_type || "")));
  if (hdrSideData) failures.push(`unexpected HDR side data: ${hdrSideData.side_data_type}`);
}

const qaDir = path.join(jobDir, "qa", "final-frames");
fs.mkdirSync(qaDir, { recursive: true });
for (const name of fs.readdirSync(qaDir)) {
  if (/^frame-\d+ms\.jpg$/.test(name)) fs.unlinkSync(path.join(qaDir, name));
}

const chapterTimes = readTimes(path.join(jobDir, "data", "chapters.json"), "start").map((time) => time + 0.5);
const overlayTimes = readTimes(path.join(jobDir, "data", "overlays.json"), "start").map((time) => time + 0.5);
const beatTimes = readTimes(path.join(jobDir, "data", "beats.json"), "start").map((time) => time + 0.5);
const configured = Array.isArray(config.qa?.sampleTimes) ? config.qa.sampleTimes : [];
const duration = Number(video.duration || probe.format.duration || 0);
const sampleTimes = uniqueTimes([0.5, ...configured, ...chapterTimes, ...overlayTimes, ...beatTimes, Math.max(0.5, duration - 1)], duration);

for (const time of sampleTimes) {
  const out = path.join(qaDir, `frame-${String(Math.round(time * 1000)).padStart(6, "0")}ms.jpg`);
  run("ffmpeg", ["-y", "-ss", String(time), "-i", videoPath, "-frames:v", "1", "-q:v", "2", out], { capture: true });
}

const report = {
  status: "review_required",
  videoPath,
  checkedAt: new Date().toISOString(),
  streams: probe.streams,
  format: probe.format,
  sampleTimes,
  framesDir: qaDir,
  failures
};

writeJson(path.join(jobDir, "qa", "report.json"), report);
fs.writeFileSync(path.join(jobDir, "qa", "report.md"), renderMarkdown(report));

if (failures.length) {
  console.error(`QA failed: ${failures.join("; ")}`);
  process.exit(1);
}

console.log("规格 QA 通过；最终画面仍需逐帧检查和完整播放确认");
console.log(`Frames: ${qaDir}`);
console.log(`Report: ${path.join(jobDir, "qa", "report.md")}`);

function readTimes(file, key) {
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(data) ? data.map((item) => Number(item[key])).filter(Number.isFinite) : [];
}

function uniqueTimes(times, maxDuration) {
  const out = [];
  for (const raw of times) {
    const time = Number(raw);
    if (!Number.isFinite(time)) continue;
    const clamped = Math.max(0, Math.min(time, Math.max(0, maxDuration - 0.1)));
    if (!out.some((existing) => Math.abs(existing - clamped) < 0.25)) out.push(clamped);
  }
  return out.sort((a, b) => a - b);
}

function renderMarkdown(report) {
  const videoStream = report.streams.find((stream) => stream.codec_type === "video");
  const audioStream = report.streams.find((stream) => stream.codec_type === "audio");
  return `# Final QA Report

- Video: \`${report.videoPath}\`
- Checked: ${report.checkedAt}
- Resolution: ${videoStream.width}x${videoStream.height}
- FPS: ${videoStream.avg_frame_rate}
- Color: ${videoStream.pix_fmt || "_"} / ${videoStream.color_range || "_"} / ${videoStream.color_space || "_"} / ${videoStream.color_transfer || "_"} / ${videoStream.color_primaries || "_"}
- Duration: ${report.format.duration}s
- Video bitrate: ${videoStream.bit_rate || "_"}
- Audio: ${audioStream ? `${audioStream.codec_name} / ${audioStream.bit_rate || "_"} bps` : "missing"}
- Frames: \`${report.framesDir}\`
- Failures: ${report.failures.length ? report.failures.join("; ") : "none"}

## Sample Times

${report.sampleTimes.map((time) => `- ${time.toFixed(2)}s`).join("\n")}
`;
}

function normalizedRotation(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}
