import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";
import { approvalActor } from "./governance-lib.mjs";

// 用法：npm run qa:cuts:approve -- --job jobs/<slug> --by human --name <人名> [--acousticReviewed true]
// --by 默认 agent；只有用户亲自逐张看完切点图后，才由用户在终端执行 --by human。
const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa/cuts");
const reportPath = path.join(qaDir, "report.json");
const acousticPath = path.join(jobDir, "data", "editor-signals.json");
const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
const actor = approvalActor(args);
const reviewer = actor.name;
if (!fs.existsSync(reportPath)) throw new Error(`缺少切点报告: ${reportPath}`);
if (!fs.existsSync(acousticPath)) throw new Error("缺少编辑声学审计；先运行 npm run transcript:audit");
if (fs.statSync(acousticPath).mtimeMs < fs.statSync(edlPath).mtimeMs) {
  throw new Error("编辑声学审计早于当前 EDL；请重新运行 npm run transcript:audit");
}

const report = readJson(reportPath);
const acoustic = readJson(acousticPath);
const boundaryWarnings = acoustic.sources.flatMap((source) =>
  source.cutBoundarySignals.filter((item) => item.severity !== "ok")
);
const acousticReviewed = String(args.acousticReviewed || "") === "true";
if (boundaryWarnings.length && !acousticReviewed) {
  throw new Error(`有 ${boundaryWarnings.length} 个无可靠气口的切点；听审后使用 --acousticReviewed true 明确确认`);
}
const missing = report.cuts.filter((cut) => !fs.existsSync(path.join(jobDir, cut.image)));
if (missing.length) throw new Error(`缺少 ${missing.length} 张切点图，不能批准`);

const approval = {
  status: "approved",
  by: actor.by,
  name: actor.name,
  reviewedAt: new Date().toISOString(),
  reviewer,
  cutCount: report.cuts.length,
  acousticReviewed,
  acousticBoundaryWarnings: boundaryWarnings.length,
  notes: String(args.notes || "逐张检查通过")
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`切点 QA 已批准: ${report.cuts.length} 个 · ${actor.by}:${actor.name}`);
