import path from "node:path";
import { parseArgs, resolveJob, writeJson } from "./lib.mjs";
import { approvalActor, assertFinalApprovalAllowed, finalApprovalRecord } from "./governance-lib.mjs";

// 用法：npm run qa:final:approve -- --job jobs/<slug>[/variants/<id>] --by human --name <人名> [--fullPlayback true]
// --by 默认 agent；只有用户亲自看完全部抽帧并完整播放后，才由用户在终端执行 --by human。
// 前置检查与文件形状都在 governance-lib（网页 /approve 走同一套），这里只是终端入口。
const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa");
const actor = approvalActor(args);
const { frames } = assertFinalApprovalAllowed(qaDir);

const fullPlayback = String(args.fullPlayback || "false") === "true";
const approval = finalApprovalRecord({
  by: actor.by,
  name: actor.name,
  frameCount: frames.length,
  fullPlayback,
  notes: args.notes || "已检查全部最终 MP4 抽帧"
});
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`最终 QA: ${approval.status} · ${frames.length} 帧 · ${actor.by}:${actor.name}`);
