import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./color-management.mjs";
import { collectEditorialHashes, hashesMatch } from "./editorial-contract.mjs";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa");
const reportPath = path.join(qaDir, "report.json");
const reviewer = String(args.reviewer || "").trim();
if (!reviewer) throw new Error("必须提供 --reviewer；先查看全部最终 QA 抽帧");
if (!fs.existsSync(reportPath)) throw new Error(`缺少最终 QA 报告: ${reportPath}`);

const report = readJson(reportPath);
if (report.schemaVersion !== 2) throw new Error("最终 QA 报告版本过旧；请重新运行最终 QA");
if (report.failures?.length) throw new Error(`规格 QA 仍有失败项: ${report.failures.join("; ")}`);
const videoPath = path.resolve(report.videoPath);
if (!fs.existsSync(videoPath) || report.videoHash !== sha256File(videoPath)) {
  throw new Error("最终 QA 报告不对应当前 MP4；请重新运行最终 QA");
}
const editorialHashes = collectEditorialHashes(jobDir, "visual");
if (!hashesMatch(report.editorialHashes, editorialHashes)) {
  throw new Error("字幕、视觉数据或内容计划已变化；请重新构建成片并运行最终 QA");
}
const project = readJson(path.join(jobDir, "project.json"));
let visualReportHash = null;
if (Number(project.editorial?.contractVersion || 0) >= 1) {
  const rootJobDir = path.basename(path.dirname(jobDir)) === "variants"
    ? path.dirname(path.dirname(jobDir))
    : jobDir;
  const visualReportPath = path.join(rootJobDir, "qa", "visual", "report.json");
  if (!fs.existsSync(visualReportPath)) throw new Error("缺少视觉引用报告；先运行 npm run visual:check");
  const visualReport = readJson(visualReportPath);
  if (visualReport.status !== "passed" || !hashesMatch(visualReport.hashes, editorialHashes)) {
    throw new Error("视觉引用报告已失效；请重新运行 npm run visual:check");
  }
  visualReportHash = sha256File(visualReportPath);
}
const frameDir = report.framesDir || path.join(qaDir, "final-frames");
const frames = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((name) => /\.(jpe?g|png)$/i.test(name)) : [];
if (!frames.length) throw new Error("没有最终 MP4 抽帧，不能批准");
for (const frame of report.frameHashes || []) {
  if (!fs.existsSync(frame.path) || sha256File(frame.path) !== frame.sha256) {
    throw new Error(`最终 QA 抽帧已变化或缺失: ${frame.path}`);
  }
}

const fullPlayback = String(args.fullPlayback || "false") === "true";
const approval = {
  schemaVersion: 2,
  status: fullPlayback ? "publish_ready" : "frames_approved_playback_pending",
  reviewedAt: new Date().toISOString(),
  reviewer,
  frameCount: frames.length,
  fullPlayback,
  reportHash: sha256File(reportPath),
  videoHash: report.videoHash,
  editorialHashes,
  visualReportHash,
  notes: String(args.notes || "已检查全部最终 MP4 抽帧")
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`最终 QA: ${approval.status} · ${frames.length} 帧 · ${reviewer}`);
