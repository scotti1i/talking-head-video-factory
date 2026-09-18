import fs from "node:fs";
import path from "node:path";

import { parseArgs, projectRoot, readJson, readJsonArray, writeJson } from "./lib.mjs";

const args = parseArgs();
const root = projectRoot();
const configPath = path.resolve(root, args.config || "regression/editorial-baselines.json");
const config = readJson(configPath);
const requireMedia = String(args.requireMedia || "false") === "true";
const failures = [];

if (config.schemaVersion !== 1) failures.push("基线 schemaVersion 必须为 1");
if (config.classification !== "usable-legacy-not-approved") {
  failures.push("基线只能标为 usable-legacy-not-approved，不能冒充满意样片");
}
const baselines = Array.isArray(config.baselines) ? config.baselines : [];
if (baselines.length < 5 || baselines.length > 8) failures.push("真实回归基线必须保持 5–8 条");
const ids = new Set();
const results = [];

for (const item of baselines) {
  const itemFailures = [];
  if (!item.id || ids.has(item.id)) itemFailures.push(`id 缺失或重复: ${item.id || "_"}`);
  ids.add(item.id);
  const jobDir = path.resolve(root, item.job || "");
  const projectPath = path.join(jobDir, "project.json");
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  const captionsPath = path.join(jobDir, "data", "captions.json");
  for (const file of [projectPath, edlPath, captionsPath]) {
    if (!fs.existsSync(file)) itemFailures.push(`缺少 ${path.relative(root, file)}`);
  }
  const edl = fs.existsSync(edlPath) ? readJsonArray(edlPath) : [];
  const captions = fs.existsSync(captionsPath) ? readJsonArray(captionsPath) : [];
  const beats = readOptionalArray(jobDir, "data/beats.json");
  const broll = readOptionalArray(jobDir, "data/broll.json");
  const primary = readOptionalArray(jobDir, "data/primary-clips.json");
  const visuals = beats.length + broll.length + primary.length;
  const minimums = item.minimums || {};
  if (edl.length < Number(minimums.edl || 0)) itemFailures.push(`EDL ${edl.length} < ${minimums.edl}`);
  if (captions.length < Number(minimums.captions || 0)) itemFailures.push(`字幕 ${captions.length} < ${minimums.captions}`);
  if (visuals < Number(minimums.visuals || 0)) itemFailures.push(`视觉项 ${visuals} < ${minimums.visuals}`);
  if (!Array.isArray(item.knownGaps) || !item.knownGaps.length) itemFailures.push("必须记录已知缺陷");
  const artifact = path.join(jobDir, item.artifact || "");
  if (requireMedia && !fs.existsSync(artifact)) itemFailures.push(`真实成片不存在: ${path.relative(root, artifact)}`);
  const plannerContractPresent = fs.existsSync(path.join(jobDir, "data", "editorial-plan.json"));
  if (plannerContractPresent) itemFailures.push("基线分类仍是旧合同，但 job 已存在规划器合同；请重新评估分类");
  results.push({
    id: item.id,
    job: item.job,
    artifact: item.artifact,
    artifactPresent: fs.existsSync(artifact),
    counts: { edl: edl.length, captions: captions.length, beats: beats.length, broll: broll.length, primaryClips: primary.length },
    classification: config.classification,
    knownGaps: item.knownGaps,
    failures: itemFailures
  });
  failures.push(...itemFailures.map((failure) => `${item.id}: ${failure}`));
}

const report = {
  schemaVersion: 1,
  status: failures.length ? "failed" : "passed",
  checkedAt: new Date().toISOString(),
  classification: config.classification,
  baselineCount: baselines.length,
  requireMedia,
  results,
  failures
};
const reportDir = path.join(root, "reports", "workflow");
writeJson(path.join(reportDir, "editorial-baselines.json"), report);
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "editorial-baselines.md"), renderMarkdown(report));

if (failures.length) {
  console.error(`回归基线失败:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`回归基线通过: ${baselines.length} 条可用旧样片；满意样片 0 条`);

function readOptionalArray(jobDir, relative) {
  const file = path.join(jobDir, relative);
  return fs.existsSync(file) ? readJsonArray(file) : [];
}

function renderMarkdown(report) {
  return `# 剪辑回归基线

- 状态：${report.status}
- 分类：${report.classification}
- 数量：${report.baselineCount}
- 满意样片：**0**
- 是否强制检查本机成片：${report.requireMedia ? "是" : "否"}

这些视频只代表“曾经产出并能用”，用于防止结构、时长、字幕和素材复杂度回退，不代表审美或剪辑质量金标。

${report.results.map((item) => `## ${item.id}

- Job：\`${item.job}\`
- 成片：\`${item.artifact}\`（${item.artifactPresent ? "本机存在" : "本机缺失"}）
- 数量：EDL ${item.counts.edl} / 字幕 ${item.counts.captions} / 卡片 ${item.counts.beats} / B-roll ${item.counts.broll} / 主展示 ${item.counts.primaryClips}
- 已知缺陷：${item.knownGaps.join("；")}
`).join("\n")}
`;
}
