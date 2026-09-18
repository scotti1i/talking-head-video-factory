import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeliveryRec709VideoStream, normalizeColorMode, prepareSdrRec709Source, sha256File, videoColorProfile } from "./color-management.mjs";
import { audioEdgeFadeSeconds } from "./cut-boundary-policy.mjs";
import {
  collectEditorialHashes,
  hashesMatch,
  validateEditorialPlan,
  validateTimelineContract
} from "./editorial-contract.mjs";
import { atomicWriteJson, displayVideoGeometry, ffprobeJson, frameRateValue, parseArgs, readJson, readJsonArray, resolveJob, run } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const inputPath = path.resolve(jobDir, args.input || "data/rough-cut-edl.json");
const outputPath = path.resolve(jobDir, args.output || "assets/aroll.mp4");
const sourceKey = args.sourceKey || "source";
const crf = String(args.crf || 20);
const preset = args.preset || "veryfast";
const fps = Number(args.fps || 30);
const videoBitrate = args["video-bitrate"];
const colorMode = normalizeColorMode(args["color-mode"] || "auto-sdr");

const rawSegments = readJsonArray(inputPath);
if (!rawSegments.length) throw new Error(`No segments in ${inputPath}`);
assertEditorialContract(rawSegments);
const segments = rawSegments.map((segment, index) => validateSegment(segment, index));

const preparedSources = new Map();
for (const [index, segment] of segments.entries()) {
  const { source } = segment;
  if (preparedSources.has(source)) continue;
  const sourcePath = path.join(jobDir, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing media: ${sourcePath}`);
  const prepared = colorMode === "auto-sdr"
    ? prepareSdrRec709Source({ jobDir, sourcePath })
    : inspectLegacySource(sourcePath);
  preparedSources.set(source, prepared);
}

const firstSourceKey = segments[0]?.source || "";
const firstSource = preparedSources.get(firstSourceKey)?.outputPath;
if (!firstSource || !fs.existsSync(firstSource)) throw new Error(`Missing first source: ${firstSource}`);
const firstVideo = ffprobeJson(firstSource).streams.find((stream) => stream.codec_type === "video");
const firstDisplay = displayVideoGeometry(firstVideo);
const targetWidth = Number(args.width || firstDisplay.width);
const targetHeight = Number(args.height || firstDisplay.height);
if (!(targetWidth > 0 && targetHeight > 0)) throw new Error("Cannot determine rough-cut canvas size");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.join(jobDir, "tmp"), { recursive: true });

const inputs = [];
const filters = [];
const labels = [];

segments.forEach((segment, index) => {
  const { source, start, end, duration } = segment;
  const sourcePath = preparedSources.get(source)?.outputPath;
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing media: ${sourcePath}`);

  inputs.push("-i", sourcePath);
  const fade = audioEdgeFadeSeconds(duration);
  const fadeOut = Math.max(0, duration - fade);
  filters.push(
    `[${index}:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps},format=yuv420p[v${index}]`
  );
  filters.push(
    `[${index}:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=${fade.toFixed(3)},afade=t=out:st=${fadeOut.toFixed(3)}:d=${fade.toFixed(3)}[a${index}]`
  );
  labels.push(`[v${index}][a${index}]`);
});

filters.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[concatv][outa]`);
filters.push(`[concatv]fps=${fps},setpts=N/(${fps}*TB)[outv]`);

const nonce = `${process.pid}.${crypto.randomUUID()}`;
const filterPath = path.join(jobDir, "tmp", `${path.parse(outputPath).name}.${nonce}.ffmpeg`);
fs.writeFileSync(filterPath, filters.join(";\n"));
const outputExt = path.extname(outputPath) || ".mp4";
const outputStem = path.basename(outputPath, outputExt);
const temporaryOutput = path.join(path.dirname(outputPath), `.${outputStem}.${nonce}.tmp${outputExt}`);
const expectedDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);

try {
  run("ffmpeg", [
    "-hide_banner",
    "-y",
    ...inputs,
    "-/filter_complex", // ffmpeg ≥7.1 的「选项读文件」写法；旧 -filter_complex_script 在 9.0 被删（2026-09-07 本机升到 9.0.1）
    filterPath,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    ...(videoBitrate ? ["-b:v", String(videoBitrate), "-maxrate", String(videoBitrate), "-bufsize", String(Number.parseInt(videoBitrate, 10) * 2 || 48) + "M"] : ["-crf", crf]),
    "-g",
    String(Math.round(fps)),
    "-keyint_min",
    String(Math.round(fps)),
    "-sc_threshold",
    "0",
    "-pix_fmt",
    "yuv420p",
    ...(colorMode === "auto-sdr" ? [
      "-color_range", "tv",
      "-colorspace", "bt709",
      "-color_trc", "bt709",
      "-color_primaries", "bt709"
    ] : []),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    temporaryOutput
  ]);

  const outputProbe = assertRoughCutOutput({
    file: temporaryOutput,
    width: targetWidth,
    height: targetHeight,
    fps,
    expectedDuration,
    segmentCount: segments.length,
    expectSdr: colorMode === "auto-sdr"
  });
  fs.renameSync(temporaryOutput, outputPath);
  const outputHash = sha256File(outputPath);
  atomicWriteJson(path.join(jobDir, "data", "color-managed-sources.json"), {
    generatedAt: new Date().toISOString(),
    mode: colorMode,
    edl: {
      path: path.relative(jobDir, inputPath),
      hash: sha256File(inputPath)
    },
    output: {
      path: path.relative(jobDir, outputPath),
      hash: outputHash,
      expectedDuration,
      actualDuration: Number(outputProbe.format?.duration || expectedDuration),
      width: targetWidth,
      height: targetHeight,
      fps
    },
    items: [...preparedSources.entries()].map(([source, item]) => ({
      source,
      prepared: path.relative(jobDir, item.outputPath),
      converted: item.converted,
      cached: item.cached,
      sourceHash: item.sourceHash || null,
      outputHash: item.outputHash || null,
      provenance: item.provenancePath ? path.relative(jobDir, item.provenancePath) : null,
      tool: item.tool || null,
      preset: item.preset || null,
      policyVersion: item.policyVersion || null,
      sourceProfile: item.sourceProfile,
      outputProfile: item.outputProfile
    }))
  });
} finally {
  fs.rmSync(temporaryOutput, { force: true });
  fs.rmSync(filterPath, { force: true });
}

console.log(`Rendered ${outputPath} · ${targetWidth}x${targetHeight} · source rotation ${firstDisplay.rotation}° · color ${colorMode}`);

function assertEditorialContract(edl) {
  const projectPath = path.join(jobDir, "project.json");
  const project = fs.existsSync(projectPath) ? readJson(projectPath) : {};
  if (Number(project.editorial?.contractVersion || 0) < 1) return;
  const editorialPlan = readJson(path.join(jobDir, "data", "editorial-plan.json"));
  const semanticTakeMap = readJson(path.join(jobDir, "data", "semantic-take-map.json"));
  const plan = validateEditorialPlan(editorialPlan, { semanticTakeMap });
  const timeline = validateTimelineContract({ editorialPlan, semanticTakeMap, edl, stage: "edl" });
  const errors = [...plan.errors, ...timeline.errors];
  if (errors.length) throw new Error(`内容计划/EDL 合同失败:\n- ${errors.join("\n- ")}`);
  const reportPath = path.join(jobDir, "qa", "editorial", "report.json");
  const approvalPath = path.join(jobDir, "qa", "editorial", "approval.json");
  if (!fs.existsSync(reportPath) || !fs.existsSync(approvalPath)) {
    throw new Error("内容计划尚未独立批准；先运行 editorial:check 和 editorial:approve");
  }
  const report = readJson(reportPath);
  const approval = readJson(approvalPath);
  const currentHashes = collectEditorialHashes(jobDir, "plan");
  const approved = report.status === "passed"
    && approval.schemaVersion === 1
    && approval.status === "approved"
    && approval.reportHash === sha256File(reportPath)
    && hashesMatch(report.hashes, currentHashes)
    && hashesMatch(approval.hashes, currentHashes);
  if (!approved) throw new Error("内容计划或上游证据已变化；旧内容批准已失效");
}

function validateSegment(segment, index) {
  const source = segment?.[sourceKey] || segment?.source;
  if (!source) throw new Error(`Segment ${index + 1} is missing ${sourceKey}/source`);
  const start = Number(segment.sourceStart);
  const end = Number(segment.sourceEnd);
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0) {
    throw new Error(`Segment ${index + 1} has invalid range: ${segment.sourceStart} → ${segment.sourceEnd}`);
  }
  return { source, start, end, duration };
}

function assertRoughCutOutput({ file, width, height, fps, expectedDuration, segmentCount, expectSdr }) {
  const probe = ffprobeJson(file);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error(`粗剪输出缺少视频或音频流: ${file}`);
  const display = displayVideoGeometry(video);
  if (display.width !== width || display.height !== height) {
    throw new Error(`粗剪输出显示画幅 ${display.width}x${display.height} != ${width}x${height}`);
  }
  if (normalizedRotation(display.rotation) !== 0) throw new Error(`粗剪输出仍含旋转: ${display.rotation}°`);
  if (video.sample_aspect_ratio && video.sample_aspect_ratio !== "1:1") {
    throw new Error(`粗剪输出 SAR ${video.sample_aspect_ratio} != 1:1`);
  }
  const actualFps = frameRateValue(video.avg_frame_rate || video.r_frame_rate);
  if (!Number.isFinite(actualFps) || Math.abs(actualFps - fps) > 0.001) {
    throw new Error(`粗剪输出 fps ${video.avg_frame_rate || video.r_frame_rate} != ${fps}`);
  }
  const actualDuration = Number(video.duration || probe.format?.duration);
  // FFmpeg rounds every trimmed section to the output frame grid before concat.
  // With a multi-cut EDL, the accumulated difference can legitimately exceed
  // two frames even though no source material was lost.
  const durationTolerance = Math.max(0.05, (Number(segmentCount || 1) + 1) / fps);
  if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - expectedDuration) > durationTolerance) {
    throw new Error(`粗剪输出时长 ${actualDuration}s 与 EDL ${expectedDuration.toFixed(3)}s 不一致`);
  }
  if (String(audio.sample_rate || "") !== "48000") throw new Error(`粗剪输出音频采样率 ${audio.sample_rate || "unknown"} != 48000`);
  if (expectSdr && !isDeliveryRec709VideoStream(video)) throw new Error(`粗剪输出不是 yuv420p/tv/BT.709 SDR: ${file}`);
  return probe;
}

function normalizedRotation(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function inspectLegacySource(sourcePath) {
  const probe = ffprobeJson(sourcePath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error(`Cannot read video stream: ${sourcePath}`);
  const profile = videoColorProfile(video);
  return {
    sourcePath,
    outputPath: sourcePath,
    converted: false,
    cached: false,
    sourceProfile: profile,
    outputProfile: profile
  };
}
