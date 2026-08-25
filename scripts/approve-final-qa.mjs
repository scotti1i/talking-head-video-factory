import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa");
const reportPath = path.join(qaDir, "report.json");
const reviewer = String(args.reviewer || "").trim();
if (!reviewer) throw new Error("必须提供 --reviewer；先查看全部最终 QA 抽帧");
if (!fs.existsSync(reportPath)) throw new Error(`缺少最终 QA 报告: ${reportPath}`);

const report = readJson(reportPath);
if (report.failures?.length) throw new Error(`规格 QA 仍有失败项: ${report.failures.join("; ")}`);
const frameDir = report.framesDir || path.join(qaDir, "final-frames");
const frames = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((name) => /\.(jpe?g|png)$/i.test(name)) : [];
if (!frames.length) throw new Error("没有最终 MP4 抽帧，不能批准");

const fullPlayback = String(args.fullPlayback || "false") === "true";
const approval = {
  status: fullPlayback ? "publish_ready" : "frames_approved_playback_pending",
  reviewedAt: new Date().toISOString(),
  reviewer,
  frameCount: frames.length,
  fullPlayback,
  notes: String(args.notes || "已检查全部最终 MP4 抽帧")
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`最终 QA: ${approval.status} · ${frames.length} 帧 · ${reviewer}`);
