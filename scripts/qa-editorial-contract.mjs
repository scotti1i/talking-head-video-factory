import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  collectEditorialHashes,
  validateEditorialPlan,
  validateTimelineContract
} from "./editorial-contract.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";
import { validateSemanticTakeMap } from "./semantic-take-map.mjs";

export function runEditorialContractQa(jobDir, { stage = "plan" } = {}) {
  if (!['plan', 'visual'].includes(stage)) throw new Error("--stage 只能是 plan 或 visual");
  const editorialPlan = readJson(path.join(jobDir, "data", "editorial-plan.json"));
  const semanticTakeMap = readJson(path.join(jobDir, "data", "semantic-take-map.json"));
  const edl = readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json"));
  const plan = validateEditorialPlan(editorialPlan, { semanticTakeMap });
  const semantic = validateSemanticTakeMap(semanticTakeMap, edl);
  const timeline = validateTimelineContract({
    editorialPlan,
    semanticTakeMap,
    edl,
    captions: stage === "visual" ? readOptionalArray(jobDir, "data/captions.json") : undefined,
    beats: stage === "visual" ? readOptionalArray(jobDir, "data/beats.json") : undefined,
    broll: stage === "visual" ? readOptionalArray(jobDir, "data/broll.json") : undefined,
    primaryClips: stage === "visual" ? readOptionalArray(jobDir, "data/primary-clips.json") : undefined,
    stage: stage === "plan" ? "edl" : "visual"
  });
  const failures = [...plan.errors, ...semantic.errors, ...timeline.errors];
  const report = {
    schemaVersion: 1,
    stage,
    status: failures.length ? "failed" : "passed",
    checkedAt: new Date().toISOString(),
    hashes: collectEditorialHashes(jobDir, stage),
    counts: {
      storyBeats: plan.storyBeatCount,
      edlSegments: timeline.linkedSegmentCount,
      semanticRangesCovered: semantic.coveredCount
    },
    failures
  };
  const outputDir = path.join(jobDir, "qa", stage === "plan" ? "editorial" : "visual");
  writeJson(path.join(outputDir, "report.json"), report);
  fs.writeFileSync(path.join(outputDir, "report.md"), renderMarkdown(report));
  return report;
}

function readOptionalArray(jobDir, relative) {
  const file = path.join(jobDir, relative);
  return fs.existsSync(file) ? readJsonArray(file) : [];
}

function renderMarkdown(report) {
  return `# ${report.stage === "plan" ? "Editorial" : "Visual"} Contract QA

- Status: **${report.status}**
- Checked: ${report.checkedAt}
- Story beats: ${report.counts.storyBeats}
- EDL segments: ${report.counts.edlSegments}
- Complete ranges covered: ${report.counts.semanticRangesCovered}
- Failures: ${report.failures.length ? report.failures.join("；") : "none"}
`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const stage = String(args.stage || "plan");
  const report = runEditorialContractQa(jobDir, { stage });
  const label = stage === "plan" ? "内容计划" : "视觉引用";
  if (report.failures.length) {
    console.error(`${label}门禁失败:\n- ${report.failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${label}门禁通过: ${report.counts.storyBeats} 个结构段 · ${report.counts.edlSegments} 个 EDL 段`);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
