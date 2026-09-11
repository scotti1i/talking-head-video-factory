// ============================================================
// A-roll 处理：剪辑母版 assets/aroll-cut.mp4 → 工作母版 assets/aroll.mp4
//   倍速（setpts + atempo，保音高）/ 对白链 / 限幅 全部来自 aroll-treat/registry.json 的预设，job 不写滤镜。
//   产出后把合同写进 project.json.aroll = { playbackRate, treat, master, edlHash, cutHash, masterHash, duration }
//   下游（captions:build / qa:alignment / build）只认这份合同：edlHash 与 data/rough-cut-edl.json 不符即拒绝。
// 为什么：2026-09-11 审计——1.1 倍速在仓库之外由 Codex 逐片手写 ffmpeg，字幕靠手工传 --playback-rate 才对得上，
//   EDL 与 project.json 都不记倍率，真源可以静默错位。
// 用法：node scripts/aroll-treat.mjs --job jobs/<slug> [--preset social-fast-v1] [--input assets/aroll-cut.mp4] [--output assets/aroll.mp4]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./color-management.mjs";
import { atomicWriteJson, ffprobeJson, frameRateValue, parseArgs, projectRoot, readJson, resolveJob, run } from "./lib.mjs";
import { resolveVideoEncoder, videoEncoderArgs } from "./video-encoder.mjs";
import { assertNotDerivedInput } from "./ffmpeg-filter.mjs";

export function loadTreatRegistry(root = projectRoot()) {
  const file = path.join(root, "aroll-treat", "registry.json");
  const registry = readJson(file);
  if (registry?.schemaVersion !== 1) throw new Error(`${file}: schemaVersion 必须为 1`);
  if (!registry.presets?.[registry.default]) throw new Error(`${file}: default preset 不存在`);
  for (const [id, preset] of Object.entries(registry.presets)) {
    const rate = Number(preset.playbackRate);
    if (!(rate >= 0.5 && rate <= 2)) throw new Error(`${file}: ${id}.playbackRate 必须在 0.5..2`);
    for (const key of ["video", "audioPre", "audioPost"]) {
      if (!Array.isArray(preset[key]) || preset[key].some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error(`${file}: ${id}.${key} 必须是滤镜字符串数组`);
      }
    }
  }
  return registry;
}

export function resolveTreatPreset(project, requested, registry = loadTreatRegistry()) {
  const id = String(requested || project?.aroll?.treat || registry.profileDefaults?.[String(project?.profile || "")] || registry.default).trim();
  const preset = registry.presets[id];
  if (!preset) throw new Error(`未知 A-roll 处理预设: ${id}（可用: ${Object.keys(registry.presets).join(", ")}）`);
  return { id, ...preset, playbackRate: Number(preset.playbackRate) };
}

// 生成滤镜图；rate=1 且无滤镜 → 返回 null（直通封装）
export function buildTreatFilters(preset, { fps }) {
  const rate = preset.playbackRate;
  const video = [...(rate !== 1 ? [`setpts=PTS/${rate}`] : []), ...preset.video, ...(rate !== 1 ? [`fps=${fps}`] : []), "format=yuv420p"];
  const audio = [...preset.audioPre, ...(rate !== 1 ? [`atempo=${rate}`] : []), ...preset.audioPost, "aresample=48000"];
  const passthrough = rate === 1 && preset.video.length === 0 && preset.audioPre.length === 0 && preset.audioPost.length === 0;
  return passthrough ? null : { video: video.join(","), audio: audio.join(",") };
}

export function expectedMasterDuration(edlSegments, rate) {
  const total = edlSegments.reduce((sum, segment) => sum + (Number(segment.sourceEnd) - Number(segment.sourceStart)), 0);
  return total / rate;
}

function main() {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const projectPath = path.join(jobDir, "project.json");
  const project = fs.existsSync(projectPath) ? readJson(projectPath) : {};
  const preset = resolveTreatPreset(project, args.preset);
  const inputPath = path.resolve(jobDir, args.input || "assets/aroll-cut.mp4");
  const outputPath = path.resolve(jobDir, args.output || project.sourceVideo || "assets/aroll.mp4");
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  if (!fs.existsSync(inputPath)) throw new Error(`缺剪辑母版 ${path.relative(jobDir, inputPath)}：先 npm run roughcut:render -- --job ${args.job}`);
  if (!fs.existsSync(edlPath)) throw new Error(`缺 data/rough-cut-edl.json`);
  assertNotDerivedInput(inputPath, jobDir, "aroll:treat");
  if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error("输入与输出不能是同一文件（剪辑母版 aroll-cut.mp4 必须保留）");

  const edl = readJson(edlPath);
  const probe = ffprobeJson(inputPath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error(`剪辑母版缺视频或音频流: ${inputPath}`);
  const fps = frameRateValue(video.avg_frame_rate || video.r_frame_rate);
  const inputDuration = Number(probe.format?.duration);
  const expected = expectedMasterDuration(edl, preset.playbackRate);
  const filters = buildTreatFilters(preset, { fps });
  const videoEncoder = resolveVideoEncoder({ requested: args["video-encoder"] || process.env.FACTORY_VIDEO_ENCODER || "auto" });
  const temporary = path.join(path.dirname(outputPath), `.${path.basename(outputPath, ".mp4")}.${process.pid}.tmp.mp4`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    const encode = filters
      ? ["-vf", filters.video, "-af", filters.audio, ...videoEncoderArgs({ mode: videoEncoder, preset: args.preset_speed || "medium", crf: String(args.crf || 18), videoBitrate: args["video-bitrate"], fps }),
        "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
      : ["-c", "copy"];
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, ...encode, "-movflags", "+faststart", "-map_metadata", "-1", temporary]);
    const outProbe = ffprobeJson(temporary);
    const outAudio = outProbe.streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(outAudio?.duration || outProbe.format?.duration);
    if (!Number.isFinite(duration) || Math.abs(duration - expected) > 0.05) {
      throw new Error(`工作母版时长 ${duration.toFixed(3)}s ≠ EDL 累加 / ${preset.playbackRate} = ${expected.toFixed(3)}s（>50ms）`);
    }
    fs.renameSync(temporary, outputPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }

  const contract = {
    playbackRate: preset.playbackRate,
    treat: preset.id,
    master: path.relative(jobDir, outputPath).split(path.sep).join("/"),
    cut: path.relative(jobDir, inputPath).split(path.sep).join("/"),
    edlHash: sha256File(edlPath),
    cutHash: sha256File(inputPath),
    masterHash: sha256File(outputPath),
    duration: Math.round(Number(ffprobeJson(outputPath).format.duration) * 1000) / 1000,
    fps,
    treatedAt: new Date().toISOString()
  };
  const nextProject = { ...project, aroll: contract };
  if (!nextProject.sourceVideo) nextProject.sourceVideo = contract.master;
  atomicWriteJson(projectPath, nextProject);
  atomicWriteJson(path.join(jobDir, "data", "aroll-master.json"), {
    ...contract,
    inputDuration: Math.round(inputDuration * 1000) / 1000,
    filters: filters || { video: "copy", audio: "copy" },
    videoEncoder
  });
  console.log(`A-roll 处理完成：${preset.id} · ${preset.playbackRate}x · ${contract.duration}s → ${contract.master}`);
}

// 合同校验：给下游用。edlHash 不符 = 母版过期。
export function assertArollContract(jobDir, project, commandName) {
  const contract = project?.aroll;
  if (!contract?.master || !contract?.edlHash) {
    throw new Error(`${commandName}: project.json 缺 aroll 合同，先 npm run aroll:treat`);
  }
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  if (!fs.existsSync(edlPath)) throw new Error(`${commandName}: 缺 data/rough-cut-edl.json`);
  if (sha256File(edlPath) !== contract.edlHash) {
    throw new Error(`${commandName}: EDL 已改动但工作母版未重做（edlHash 不符），先 npm run roughcut:render 再 npm run aroll:treat`);
  }
  const masterPath = path.join(jobDir, contract.master);
  if (!fs.existsSync(masterPath)) throw new Error(`${commandName}: 工作母版不存在 ${contract.master}`);
  if (contract.masterHash && sha256File(masterPath) !== contract.masterHash) {
    throw new Error(`${commandName}: 工作母版被改动过（masterHash 不符），不得手工替换 ${contract.master}`);
  }
  return { ...contract, masterPath };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
