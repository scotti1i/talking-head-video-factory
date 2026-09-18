import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./color-management.mjs";
import { parseSilenceLog, selectCutReviewWindow } from "./cut-boundary-policy.mjs";
import { buildListeningReviewTemplate } from "./cut-listening-review.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, run, videoDuration, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const projectPath = path.join(jobDir, "project.json");
const project = fs.existsSync(projectPath) ? readJson(projectPath) : {};
const edlPath = path.resolve(jobDir, args.edl || "data/rough-cut-edl.json");
const videoPath = path.resolve(jobDir, args.video || project.sourceVideo || "assets/aroll.mp4");
const outputDir = path.resolve(jobDir, args.output || "qa/cuts");
const transcriptPath = args.transcript ? path.resolve(jobDir, args.transcript) : null;
const windowSeconds = Number(args.window || 3);

if (!fs.existsSync(videoPath)) throw new Error(`粗剪视频不存在: ${videoPath}`);
const segments = readJsonArray(edlPath);
if (segments.length < 2) throw new Error("至少需要两个 EDL 段才能检查切点");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const duration = videoDuration(videoPath);
const silences = detectSilences(videoPath);
let cursor = 0;
const cuts = segments.slice(0, -1).map((segment, index) => {
  cursor += Number(segment.sourceEnd) - Number(segment.sourceStart);
  const stem = `cut-${String(index + 1).padStart(3, "0")}-${Math.round(cursor * 1000)}ms`;
  const output = path.join(outputDir, `${stem}.jpg`);
  const reviewClip = path.join(outputDir, `review-${stem}.mp4`);
  const reviewWindow = selectCutReviewWindow({ cutTime: cursor, duration, silences });
  run("python3", [
    path.join(import.meta.dirname, "timeline-view.py"),
    videoPath,
    "--center", String(cursor),
    "--window", String(windowSeconds),
    "--output", output,
    ...(transcriptPath ? ["--transcript", transcriptPath] : [])
  ]);
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(reviewWindow.start),
    "-t", String(reviewWindow.duration),
    "-i", videoPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-vf", "scale=960:960:force_original_aspect_ratio=decrease,setsar=1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    reviewClip
  ]);
  return {
    index: index + 1,
    time: round(cursor),
    image: path.relative(jobDir, output),
    reviewClip: path.relative(jobDir, reviewClip),
    reviewClipHash: sha256File(reviewClip),
    reviewWindow
  };
});

const report = {
  schemaVersion: 2,
  status: "review_required",
  generatedAt: new Date().toISOString(),
  edl: path.relative(jobDir, edlPath),
  edlHash: sha256File(edlPath),
  video: path.relative(jobDir, videoPath),
  videoHash: sha256File(videoPath),
  duration: round(duration),
  cuts,
  reviewRules: [
    "先从头到尾带声音播放完整粗剪，确认逻辑、句意和整体气口",
    "逐个播放 review-cut MP4，检查切前切后完整语境、词头词尾和呼吸",
    "逐张检查嘴型或动作是否跳变，检查波形是否截断音节",
    "审听记录必须绑定当前粗剪和每个 review clip 的 SHA-256"
  ]
};
writeJson(path.join(outputDir, "report.json"), report);
writeJson(path.join(outputDir, "listening-review.json"), buildListeningReviewTemplate(report));
fs.writeFileSync(path.join(outputDir, "report.md"), renderMarkdown(report));
console.log(`切点证据已生成: ${cuts.length} 张电影条 + ${cuts.length} 条带声音审听片`);
console.log("必须先完整播放粗剪并逐条审听，再填写 listening-review.json；单个布尔参数不能批准");

function detectSilences(file) {
  const result = run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file, "-vn",
    "-af", "silencedetect=n=-38dB:d=0.12",
    "-f", "null", "-"
  ], { capture: true });
  return parseSilenceLog(result.stderr || "");
}

function renderMarkdown(report) {
  return `# Cut QA\n\n- Status: **${report.status}**\n- Video: \`${report.video}\`\n- Cuts: ${report.cuts.length}\n\n先完整播放粗剪，再逐条播放以下带声音审听片；图片只作辅助证据。\n\n${report.cuts.map((cut) => `- ${cut.index}. ${cut.time.toFixed(3)}s — \`${cut.reviewClip}\` · \`${cut.image}\``).join("\n")}\n`;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
