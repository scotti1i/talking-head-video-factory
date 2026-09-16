import path from "node:path";
import { parseArgs, resolveJob, writeJson } from "./lib.mjs";
import { approvalActor, assertCutApprovalAllowed, cutApprovalRecord } from "./governance-lib.mjs";

// 用法：npm run qa:cuts:approve -- --job jobs/<slug> --by human --name <人名> [--acousticReviewed true]
// --by 默认 agent；只有用户亲自逐张看完切点图后，才由用户在终端执行 --by human。
// 前置检查与文件形状都在 governance-lib（网页 /approve 走同一套），这里只是终端入口。
const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa/cuts");
const actor = approvalActor(args);
const acousticReviewed = String(args.acousticReviewed || "") === "true";
const { report, boundaryWarnings } = assertCutApprovalAllowed(jobDir, { qaDir, acousticReviewed });

const approval = cutApprovalRecord({
  by: actor.by,
  name: actor.name,
  cutCount: report.cuts.length,
  acousticReviewed,
  acousticBoundaryWarnings: boundaryWarnings.length,
  notes: args.notes || "逐张检查通过"
});
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`切点 QA 已批准: ${report.cuts.length} 个 · ${actor.by}:${actor.name}`);
