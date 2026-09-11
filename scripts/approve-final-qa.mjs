import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";
import { approvalActor } from "./governance-lib.mjs";

// 用法：npm run qa:final:approve -- --job jobs/<slug>[/variants/<id>] --by human --name <人名> [--fullPlayback true]
// --by 默认 agent；只有用户亲自看完全部抽帧并完整播放后，才由用户在终端执行 --by human。
const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa");
const reportPath = path.join(qaDir, "report.json");
const actor = approvalActor(args);
const reviewer = actor.name;
if (!fs.existsSync(reportPath)) throw new Error(`缺少最终 QA 报告: ${reportPath}`);

const report = readJson(reportPath);
if (report.failures?.length) throw new Error(`规格 QA 仍有失败项: ${report.failures.join("; ")}`);
const frameDir = report.framesDir || path.join(qaDir, "final-frames");
const frames = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((name) => /\.(jpe?g|png)$/i.test(name)) : [];
if (!frames.length) throw new Error("没有最终 MP4 抽帧，不能批准");

const fullPlayback = String(args.fullPlayback || "false") === "true";
const approval = {
  status: fullPlayback ? "publish_ready" : "frames_approved_playback_pending",
  by: actor.by,
  name: actor.name,
  reviewedAt: new Date().toISOString(),
  reviewer,
  frameCount: frames.length,
  fullPlayback,
  notes: String(args.notes || "已检查全部最终 MP4 抽帧")
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`最终 QA: ${approval.status} · ${frames.length} 帧 · ${actor.by}:${actor.name}`);
