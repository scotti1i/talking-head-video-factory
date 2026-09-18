import fs from "node:fs";
import path from "node:path";

import { sha256File } from "./color-management.mjs";
import { collectEditorialHashes, hashesMatch } from "./editorial-contract.mjs";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

const REVIEW_METHODS = new Set(["human", "fresh-context-agent", "media-model"]);
const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.join(jobDir, "qa", "editorial");
const reportPath = path.join(qaDir, "report.json");
const reviewer = String(args.reviewer || "").trim();
const method = String(args.method || "").trim();
const notes = String(args.notes || "").trim();

if (!reviewer) throw new Error("必须提供 --reviewer");
if (!REVIEW_METHODS.has(method)) throw new Error("--method 必须是 human/fresh-context-agent/media-model");
if (!notes) throw new Error("必须用 --notes 记录检查过的逻辑、保留项和排除项");
if (!fs.existsSync(reportPath)) throw new Error("缺少内容计划报告；先运行 npm run editorial:check");

const report = readJson(reportPath);
if (report.schemaVersion !== 1 || report.stage !== "plan" || report.status !== "passed" || report.failures?.length) {
  throw new Error("内容计划报告尚未通过");
}
const currentHashes = collectEditorialHashes(jobDir, "plan");
if (!hashesMatch(report.hashes, currentHashes)) {
  throw new Error("内容计划或上游证据已变化；请重新运行 npm run editorial:check");
}

const approval = {
  schemaVersion: 1,
  status: "approved",
  approvedAt: new Date().toISOString(),
  reviewer,
  method,
  notes,
  reportHash: sha256File(reportPath),
  hashes: currentHashes
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`内容计划已批准: ${reviewer} · ${method}`);
