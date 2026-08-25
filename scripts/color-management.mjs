import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { atomicWriteJson, displayVideoGeometry, ffprobeJson, run } from "./lib.mjs";

export const COLOR_MODES = Object.freeze(["auto-sdr", "legacy"]);
export const COLOR_POLICY_VERSION = "rec709-v2";

const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);
const SDR_TRANSFERS = new Set(["bt709", "iec61966-2-1", "smpte170m"]);
const AVCONVERT = "/usr/bin/avconvert";
const AVFOUNDATION_PRESET = "PresetHighestQuality";
const FFMPEG_PRESET = "zscale-tonemap-mobius-crf18";

export function normalizeColorMode(value = "auto-sdr") {
  const mode = String(value || "auto-sdr");
  if (!COLOR_MODES.includes(mode)) {
    throw new Error(`color-mode 只能是 ${COLOR_MODES.join("/")}`);
  }
  return mode;
}

export function videoColorProfile(stream = {}) {
  const geometry = displayVideoGeometry(stream);
  return {
    codec: stream.codec_name || null,
    pixelFormat: stream.pix_fmt || null,
    range: stream.color_range || null,
    space: stream.color_space || null,
    transfer: stream.color_transfer || null,
    primaries: stream.color_primaries || null,
    rotation: geometry.rotation,
    hdrSideData: (stream.side_data_list || [])
      .map((item) => String(item?.side_data_type || ""))
      .filter((type) => /dovi|mastering display|content light|hdr10\+/i.test(type))
  };
}

export function isHdrVideoStream(stream = {}) {
  if (hasHdrSideData(stream)) return true;
  const transfer = String(stream.color_transfer || "").toLowerCase();
  const primaries = String(stream.color_primaries || "").toLowerCase();
  const pixelFormat = String(stream.pix_fmt || "").toLowerCase();
  if (HDR_TRANSFERS.has(transfer)) return true;
  const wideGamutHighBitDepth = primaries === "bt2020" && /(?:10|12|16)(?:le|be)?$/.test(pixelFormat);
  return wideGamutHighBitDepth && transfer && !SDR_TRANSFERS.has(transfer);
}

export function isRec709VideoStream(stream = {}) {
  return stream.color_space === "bt709"
    && stream.color_transfer === "bt709"
    && stream.color_primaries === "bt709";
}

export function isDeliveryRec709VideoStream(stream = {}) {
  return isRec709VideoStream(stream)
    && stream.color_range === "tv"
    && stream.pix_fmt === "yuv420p"
    && !hasHdrSideData(stream);
}

export function classifyVideoColor(stream = {}) {
  if (isHdrVideoStream(stream)) return "hdr";
  if (isRec709VideoStream(stream) && stream.color_range === "tv") return "rec709";
  const fields = [stream.color_space, stream.color_transfer, stream.color_primaries];
  if (fields.every(Boolean)) return "non-rec709";
  return "unknown";
}

export function sdrCachePath({ jobDir, sourcePath, sourceHash, policyVersion = COLOR_POLICY_VERSION }) {
  const stem = path.parse(sourcePath).name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "source";
  return path.join(jobDir, "assets", "derived", "sdr-rec709", `${stem}-${sourceHash.slice(0, 12)}-${policyVersion}.mov`);
}

export function sdrCacheProvenancePath(outputPath) {
  return `${outputPath}.json`;
}

export function prepareSdrRec709Source(options) {
  const {
    jobDir,
    sourcePath,
    probe = ffprobeJson,
    runCommand = run,
    platform = process.platform,
    avconvertPath = AVCONVERT,
    ffmpegPath = "ffmpeg",
    backend = "auto"
  } = options;
  const sourceProbe = probe(sourcePath);
  const sourceVideo = requireVideo(sourceProbe, sourcePath);
  const sourceProfile = videoColorProfile(sourceVideo);
  const classification = classifyVideoColor(sourceVideo);
  if (classification === "rec709") {
    return {
      sourcePath,
      outputPath: sourcePath,
      converted: false,
      cached: false,
      sourceProfile,
      outputProfile: sourceProfile
    };
  }
  if (classification === "unknown") {
    throw new Error(`素材缺少完整色彩标记，auto-sdr 拒绝只改标签: ${sourcePath}；人工确认后可显式使用 --color-mode legacy`);
  }

  const selectedBackend = resolveToneMapBackend({ backend, platform, avconvertPath, ffmpegPath });
  const selectedTool = selectedBackend === "avfoundation" ? avconvertPath : ffmpegPath;
  const selectedPreset = selectedBackend === "avfoundation" ? AVFOUNDATION_PRESET : FFMPEG_PRESET;

  const sourceHash = sha256File(sourcePath);
  const outputPath = sdrCachePath({ jobDir, sourcePath, sourceHash });
  const provenancePath = sdrCacheProvenancePath(outputPath);
  let cached = false;
  let provenance = null;
  if (fs.existsSync(outputPath) && fs.existsSync(provenancePath)) {
    try {
      assertRec709Conversion({ sourceProbe, outputProbe: probe(outputPath), sourcePath, outputPath });
      provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
      assertCacheProvenance({
        provenance,
        sourceHash,
        outputPath,
        expectedBackend: selectedBackend,
        expectedTool: selectedTool,
        expectedPreset: selectedPreset
      });
      cached = true;
    } catch {
      cached = false;
      provenance = null;
    }
  }

  if (!cached) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const nonce = `${process.pid}.${crypto.randomUUID()}`;
    const workingPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${nonce}.${selectedBackend}.mov`);
    const remuxPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${nonce}.remux.mov`);
    try {
      const candidatePath = selectedBackend === "avfoundation"
        ? runAvfoundationToneMap({ runCommand, avconvertPath, ffmpegPath, sourcePath, workingPath, remuxPath })
        : runFfmpegToneMap({ runCommand, ffmpegPath, sourcePath, outputPath: workingPath, classification });
      const candidateProbe = probe(candidatePath);
      const candidateVideo = assertRec709Conversion({ sourceProbe, outputProbe: candidateProbe, sourcePath, outputPath: candidatePath });
      const outputHash = sha256File(candidatePath);
      provenance = {
        sourceHash,
        outputHash,
        policyVersion: COLOR_POLICY_VERSION,
        backend: selectedBackend,
        tool: selectedTool,
        preset: selectedPreset,
        sourceProfile,
        outputProfile: videoColorProfile(candidateVideo)
      };
      fs.renameSync(candidatePath, outputPath);
      atomicWriteJson(provenancePath, provenance);
    } finally {
      fs.rmSync(workingPath, { force: true });
      fs.rmSync(remuxPath, { force: true });
    }
  }

  const outputProbe = probe(outputPath);
  const outputVideo = assertRec709Conversion({ sourceProbe, outputProbe, sourcePath, outputPath });
  if (!provenance) provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  assertCacheProvenance({
    provenance,
    sourceHash,
    outputPath,
    expectedBackend: selectedBackend,
    expectedTool: selectedTool,
    expectedPreset: selectedPreset
  });
  return {
    sourcePath,
    outputPath,
    sourceHash,
    converted: true,
    cached,
    backend: selectedBackend,
    tool: selectedTool,
    preset: selectedPreset,
    policyVersion: COLOR_POLICY_VERSION,
    outputHash: provenance.outputHash,
    provenancePath,
    sourceProfile,
    outputProfile: videoColorProfile(outputVideo)
  };
}

export function resolveToneMapBackend({ backend = "auto", platform = process.platform, avconvertPath = AVCONVERT, ffmpegPath = "ffmpeg" } = {}) {
  const requested = String(backend || "auto").toLowerCase();
  if (!new Set(["auto", "avfoundation", "ffmpeg"]).has(requested)) {
    throw new Error("tone-map backend 只能是 auto/avfoundation/ffmpeg");
  }
  if (requested === "avfoundation") {
    if (platform !== "darwin" || !fs.existsSync(avconvertPath)) throw new Error(`当前环境不能使用 AVFoundation: ${avconvertPath}`);
    return "avfoundation";
  }
  if (requested === "ffmpeg") return "ffmpeg";
  if (platform === "darwin" && fs.existsSync(avconvertPath)) return "avfoundation";
  if (!ffmpegPath) throw new Error("当前环境缺少 FFmpeg tone-map 后端");
  return "ffmpeg";
}

function runAvfoundationToneMap({ runCommand, avconvertPath, ffmpegPath, sourcePath, workingPath, remuxPath }) {
  runCommand(avconvertPath, [
    "--source", sourcePath,
    "--preset", AVFOUNDATION_PRESET,
    "--output", workingPath,
    "--replace",
    "--progress"
  ]);
  runCommand(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", workingPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-map_metadata", "-1",
    "-movflags", "+faststart",
    remuxPath
  ]);
  return remuxPath;
}

function runFfmpegToneMap({ runCommand, ffmpegPath, sourcePath, outputPath, classification }) {
  const filter = classification === "hdr"
    ? "zscale=transfer=linear:npl=100,format=gbrpf32le,tonemap=mobius:desat=0,zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,format=yuv420p"
    : "zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,format=yuv420p";
  runCommand(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourcePath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", filter,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-color_range", "tv",
    "-colorspace", "bt709",
    "-color_trc", "bt709",
    "-color_primaries", "bt709",
    "-c:a", "aac",
    "-b:a", "192k",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-movflags", "+faststart",
    outputPath
  ]);
  return outputPath;
}

export function assertRec709Conversion({ sourceProbe, outputProbe, sourcePath, outputPath }) {
  const sourceVideo = requireVideo(sourceProbe, sourcePath);
  const outputVideo = requireVideo(outputProbe, outputPath);
  if (!isDeliveryRec709VideoStream(outputVideo)) {
    throw new Error(`tone-map 输出不是 yuv420p/tv/BT.709 SDR 或仍含 HDR side data: ${outputPath}`);
  }

  const sourceGeometry = displayVideoGeometry(sourceVideo);
  const outputGeometry = displayVideoGeometry(outputVideo);
  if (sourceGeometry.width !== outputGeometry.width || sourceGeometry.height !== outputGeometry.height) {
    throw new Error(`tone-map 改变显示画幅: ${sourceGeometry.width}x${sourceGeometry.height} → ${outputGeometry.width}x${outputGeometry.height}`);
  }
  if (normalizedRotation(outputGeometry.rotation) !== 0) {
    throw new Error(`tone-map 输出仍含未烘焙旋转: ${outputGeometry.rotation}°`);
  }
  if (outputVideo.sample_aspect_ratio && outputVideo.sample_aspect_ratio !== "1:1") {
    throw new Error(`tone-map 输出 SAR ${outputVideo.sample_aspect_ratio} != 1:1`);
  }

  const sourceDuration = mediaDuration(sourceProbe, sourceVideo);
  const outputDuration = mediaDuration(outputProbe, outputVideo);
  if (Math.abs(sourceDuration - outputDuration) > 0.05) {
    throw new Error(`tone-map 改变时长: ${sourceDuration.toFixed(3)}s → ${outputDuration.toFixed(3)}s`);
  }

  const sourceAudio = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
  const outputAudio = outputProbe.streams.find((stream) => stream.codec_type === "audio");
  if (sourceAudio && !outputAudio) throw new Error(`tone-map 输出缺少音轨: ${outputPath}`);
  const unexpectedStreams = outputProbe.streams.filter((stream) => !["video", "audio"].includes(stream.codec_type));
  if (unexpectedStreams.length) throw new Error(`tone-map 输出仍含额外轨道: ${unexpectedStreams.map((stream) => stream.codec_type).join(", ")}`);

  assertStartPreserved(sourceProbe, sourceVideo, outputProbe, outputVideo, "视频");
  if (sourceAudio && outputAudio) {
    assertStartPreserved(sourceProbe, sourceAudio, outputProbe, outputAudio, "音频");
    const sourceAvOffset = streamStart(sourceProbe, sourceAudio) - streamStart(sourceProbe, sourceVideo);
    const outputAvOffset = streamStart(outputProbe, outputAudio) - streamStart(outputProbe, outputVideo);
    if (Number.isFinite(sourceAvOffset) && Number.isFinite(outputAvOffset) && Math.abs(sourceAvOffset - outputAvOffset) > 0.02) {
      throw new Error(`tone-map 改变音画起点差: ${sourceAvOffset.toFixed(3)}s → ${outputAvOffset.toFixed(3)}s`);
    }
    if (sourceAudio.sample_rate && outputAudio.sample_rate && sourceAudio.sample_rate !== outputAudio.sample_rate) {
      throw new Error(`tone-map 改变音频采样率: ${sourceAudio.sample_rate} → ${outputAudio.sample_rate}`);
    }
  }
  return outputVideo;
}

function assertCacheProvenance({ provenance, sourceHash, outputPath, expectedBackend, expectedTool, expectedPreset }) {
  if (provenance?.sourceHash !== sourceHash) throw new Error("tone-map cache sourceHash 不匹配");
  if (provenance?.policyVersion !== COLOR_POLICY_VERSION) throw new Error("tone-map cache policyVersion 不匹配");
  if (provenance?.backend !== expectedBackend || provenance?.tool !== expectedTool || provenance?.preset !== expectedPreset) {
    throw new Error("tone-map cache backend/preset 不匹配");
  }
  const actualOutputHash = sha256File(outputPath);
  if (provenance?.outputHash !== actualOutputHash) throw new Error("tone-map cache outputHash 不匹配");
}

function assertStartPreserved(sourceProbe, sourceStream, outputProbe, outputStream, label) {
  const sourceStart = streamStart(sourceProbe, sourceStream);
  const outputStart = streamStart(outputProbe, outputStream);
  if (Number.isFinite(sourceStart) && Number.isFinite(outputStart) && Math.abs(sourceStart - outputStart) > 0.02) {
    throw new Error(`tone-map 改变${label}起点: ${sourceStart.toFixed(3)}s → ${outputStart.toFixed(3)}s`);
  }
}

function streamStart(probe, stream) {
  const value = Number(stream?.start_time ?? probe?.format?.start_time);
  return Number.isFinite(value) ? value : Number.NaN;
}

function normalizedRotation(value) {
  const rotation = Number(value || 0);
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 0.01 ? 0 : normalized;
}

function requireVideo(probe, file) {
  const video = probe?.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error(`无法读取视频流: ${file}`);
  return video;
}

function mediaDuration(probe, video) {
  const value = Number(video?.duration || probe?.format?.duration);
  if (!Number.isFinite(value) || value <= 0) throw new Error("无法读取有效视频时长");
  return value;
}

export function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

export function hasHdrSideData(stream) {
  return (stream.side_data_list || []).some((item) => /dovi|mastering display|content light|hdr10\+/i.test(String(item?.side_data_type || "")));
}
