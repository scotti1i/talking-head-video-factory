import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./color-management.mjs";
import { validateListeningReview } from "./cut-listening-review.mjs";
import {
  collectEditorialHashes,
  hashesMatch,
  validateEditorialPlan,
  validateTimelineContract
} from "./editorial-contract.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";
import { validateSemanticTakeMap } from "./semantic-take-map.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const qaDir = path.resolve(jobDir, args.qaDir || "qa/cuts");
const reportPath = path.join(qaDir, "report.json");
const acousticPath = path.join(jobDir, "data", "editor-signals.json");
const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
const semanticMapPath = path.join(jobDir, "data", "semantic-take-map.json");
const editorialPlanPath = path.join(jobDir, "data", "editorial-plan.json");
const editorialReportPath = path.join(jobDir, "qa", "editorial", "report.json");
const editorialApprovalPath = path.join(jobDir, "qa", "editorial", "approval.json");
const listeningReviewPath = path.join(qaDir, "listening-review.json");
const reviewer = String(args.reviewer || "").trim();
if (!reviewer) throw new Error("必须提供 --reviewer；只有完成整片和逐切点带声音审听后才能批准");
if (!fs.existsSync(reportPath)) throw new Error(`缺少切点报告: ${reportPath}`);
if (!fs.existsSync(acousticPath)) throw new Error("缺少编辑声学审计；先运行 npm run transcript:audit");
if (!fs.existsSync(semanticMapPath)) throw new Error("缺少完整表达选段记录 data/semantic-take-map.json");
if (!fs.existsSync(listeningReviewPath)) throw new Error("缺少 qa/cuts/listening-review.json");
if (fs.statSync(acousticPath).mtimeMs < fs.statSync(edlPath).mtimeMs) {
  throw new Error("编辑声学审计早于当前 EDL；请重新运行 npm run transcript:audit");
}

const report = readJson(reportPath);
if (report.schemaVersion !== 2) throw new Error("切点报告版本过旧；请重新运行 npm run qa:cuts");
if (report.edlHash !== sha256File(edlPath)) throw new Error("切点报告不对应当前 EDL；请重新运行 npm run qa:cuts");
const reportVideoPath = path.resolve(jobDir, report.video);
if (!fs.existsSync(reportVideoPath) || report.videoHash !== sha256File(reportVideoPath)) {
  throw new Error("切点报告不对应当前粗剪；请重新运行 npm run qa:cuts");
}
const acoustic = readJson(acousticPath);
if (acoustic.version !== 2) throw new Error("编辑声学审计版本过旧；请重新运行 npm run transcript:audit");
const boundaryWarnings = acoustic.sources.flatMap((source) =>
  source.cutBoundarySignals.filter((item) => item.severity !== "ok")
);
const evidenceErrors = [];
for (const cut of report.cuts) {
  const imagePath = path.resolve(jobDir, cut.image);
  const clipPath = path.resolve(jobDir, cut.reviewClip);
  if (!fs.existsSync(imagePath)) evidenceErrors.push(`切点 ${cut.index} 缺少电影条`);
  if (!fs.existsSync(clipPath)) evidenceErrors.push(`切点 ${cut.index} 缺少带声音审听片`);
  else if (sha256File(clipPath) !== cut.reviewClipHash) evidenceErrors.push(`切点 ${cut.index} 审听片哈希已变化`);
}
if (evidenceErrors.length) throw new Error(evidenceErrors.join("；"));

const listeningReview = readJson(listeningReviewPath);
const listeningValidation = validateListeningReview(listeningReview, report);
if (!listeningValidation.ok) {
  throw new Error(`带声音审听未完成：${listeningValidation.errors.join("；")}`);
}

const edl = readJsonArray(edlPath);
const semanticTakeMap = readJson(semanticMapPath);
const semanticValidation = validateSemanticTakeMap(semanticTakeMap, edl);
if (!semanticValidation.ok) {
  throw new Error(`完整表达选段记录无效：${semanticValidation.errors.join("；")}`);
}
let editorialPlanHash = null;
let editorialApprovalHash = null;
if (fs.existsSync(editorialPlanPath)) {
  const editorialPlan = readJson(editorialPlanPath);
  const planValidation = validateEditorialPlan(editorialPlan, { semanticTakeMap });
  const timelineValidation = validateTimelineContract({ editorialPlan, semanticTakeMap, edl, stage: "edl" });
  const planErrors = [...planValidation.errors, ...timelineValidation.errors];
  if (planErrors.length) throw new Error(`内容结构计划无效：${planErrors.join("；")}`);
  if (!fs.existsSync(editorialReportPath) || !fs.existsSync(editorialApprovalPath)) {
    throw new Error("内容计划尚未独立复核；先运行 editorial:check 和 editorial:approve");
  }
  const editorialReport = readJson(editorialReportPath);
  const editorialApproval = readJson(editorialApprovalPath);
  const currentPlanHashes = collectEditorialHashes(jobDir, "plan");
  const editorialApproved = editorialReport.status === "passed"
    && editorialApproval.schemaVersion === 1
    && editorialApproval.status === "approved"
    && editorialApproval.reportHash === sha256File(editorialReportPath)
    && hashesMatch(editorialReport.hashes, currentPlanHashes)
    && hashesMatch(editorialApproval.hashes, currentPlanHashes);
  if (!editorialApproved) throw new Error("内容计划或上游证据已变化；旧内容批准已失效");
  editorialPlanHash = sha256File(editorialPlanPath);
  editorialApprovalHash = sha256File(editorialApprovalPath);
}

const approval = {
  schemaVersion: 2,
  status: "approved",
  reviewedAt: new Date().toISOString(),
  reviewer,
  cutCount: report.cuts.length,
  reportHash: sha256File(reportPath),
  edlHash: report.edlHash,
  videoHash: report.videoHash,
  listeningReviewHash: sha256File(listeningReviewPath),
  listeningReviewer: listeningReview.reviewer,
  listeningMethod: listeningReview.method,
  semanticTakeMapHash: sha256File(semanticMapPath),
  editorialPlanHash,
  editorialApprovalHash,
  semanticRangesCovered: semanticValidation.coveredCount,
  editorSignalsHash: sha256File(acousticPath),
  acousticReviewed: true,
  acousticBoundaryWarnings: boundaryWarnings.length,
  notes: String(args.notes || "完整粗剪、逐切点带声音审听与画面证据均通过")
};
writeJson(path.join(qaDir, "approval.json"), approval);
console.log(`切点 QA 已批准: ${report.cuts.length} 个 · ${reviewer}`);
