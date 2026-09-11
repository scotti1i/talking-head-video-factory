import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, readJsonArray, resolveJob, run, videoDuration, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const projectPath = path.join(jobDir, "project.json");
const project = fs.existsSync(projectPath) ? readJson(projectPath) : {};
const playbackRate = Number(project.aroll?.playbackRate || 1);
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

let cursor = 0;
const cuts = segments.slice(0, -1).map((segment, index) => {
  cursor += (Number(segment.sourceEnd) - Number(segment.sourceStart)) / playbackRate;  // 工作母版可能已倍速（project.aroll）
  const output = path.join(outputDir, `cut-${String(index + 1).padStart(3, "0")}-${Math.round(cursor * 1000)}ms.jpg`);
  run("python3", [
    path.join(import.meta.dirname, "timeline-view.py"),
    videoPath,
    "--center", String(cursor),
    "--window", String(windowSeconds),
    "--output", output,
    ...(transcriptPath ? ["--transcript", transcriptPath] : [])
  ]);
  return { index: index + 1, time: round(cursor), image: path.relative(jobDir, output) };
});

const report = {
  status: "review_required",
  generatedAt: new Date().toISOString(),
  video: path.relative(jobDir, videoPath),
  duration: round(videoDuration(videoPath)),
  cuts,
  reviewRules: ["逐张检查嘴型或动作是否跳变", "检查波形切点是否截断音节", "检查是否残留重复语义或过紧停顿"]
};
writeJson(path.join(outputDir, "report.json"), report);
fs.writeFileSync(path.join(outputDir, "report.md"), renderMarkdown(report));
console.log(`切点证据已生成: ${cuts.length} 张`);
console.log(`必须人工或 Agent 逐张查看，再运行 approve-cut-qa.mjs`);

function renderMarkdown(report) {
  return `# Cut QA\n\n- Status: **${report.status}**\n- Video: \`${report.video}\`\n- Cuts: ${report.cuts.length}\n\n${report.cuts.map((cut) => `- ${cut.index}. ${cut.time.toFixed(3)}s — \`${cut.image}\``).join("\n")}\n`;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
