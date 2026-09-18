import fs from "node:fs";
import path from "node:path";

import { parseArgs, readJsonArray, resolveJob, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const edl = readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json"));
if (!edl.length) throw new Error("旧 job 没有可迁移的 EDL");

const proposalDir = path.join(jobDir, "data", "migration-proposal");
if (fs.existsSync(proposalDir)) {
  throw new Error(`迁移提案已存在，不自动覆盖: ${proposalDir}`);
}
fs.mkdirSync(proposalDir, { recursive: true });

const ranges = [];
const proposedEdl = [];
const storyBeats = [];
let cursor = 0;
for (const [index, segment] of edl.entries()) {
  const number = String(index + 1).padStart(3, "0");
  const takeId = `proposal-take-${number}`;
  const storyBeatId = `story-${number}`;
  const edlId = `edl-${number}`;
  const duration = Number(segment.sourceEnd) - Number(segment.sourceStart);
  ranges.push({
    id: takeId,
    source: segment.source,
    sourceStart: segment.sourceStart,
    sourceEnd: segment.sourceEnd,
    decision: "keep",
    completeness: "review-required",
    claim: String(segment.reason || `旧 EDL 第 ${index + 1} 段`),
    reason: "由旧 EDL 机械生成，必须重新听原片后确认完整表达"
  });
  storyBeats.push({
    id: storyBeatId,
    role: index === 0 ? "hook" : index === edl.length - 1 ? "payoff" : "claim",
    claim: String(segment.reason || `旧 EDL 第 ${index + 1} 段`),
    purpose: "待独立复核其在整条叙事中的作用",
    takeIds: [takeId],
    visualRole: "face"
  });
  proposedEdl.push({ ...segment, id: edlId, storyBeatId, takeId });
  cursor += duration;
}

const proposedSemanticMap = {
  schemaVersion: 1,
  reviewComplete: false,
  recordingPattern: "待听原片后填写；当前仅由旧 EDL 生成迁移提案",
  ranges
};
const proposedPlan = {
  schemaVersion: 1,
  audienceProblem: "待从 project.md 与成片重新确认",
  thesis: "待独立复核",
  narrativeStrategy: "待复核旧 EDL 的逻辑顺序；不能把可用成片自动视为满意样片",
  sourcePolicy: "preserve-order",
  createdBy: { name: "migration-script", method: "agent", model: "deterministic-migration", skill: "talkinghead-edit" },
  storyBeats,
  exclusions: []
};

writeJson(path.join(proposalDir, "semantic-take-map.proposed.json"), proposedSemanticMap);
writeJson(path.join(proposalDir, "editorial-plan.proposed.json"), proposedPlan);
writeJson(path.join(proposalDir, "rough-cut-edl.proposed.json"), proposedEdl);
migrateTimedFile("captions.json", proposedEdl);
migrateTimedFile("beats.json", proposedEdl);
migrateTimedFile("broll.json", proposedEdl);
migrateTimedFile("primary-clips.json", proposedEdl);
fs.writeFileSync(path.join(proposalDir, "README.md"), `# 旧 job 迁移提案

本目录没有任何批准效力，也不会被工厂当作事实源。脚本只补了可机械推导的 id；以下内容必须重新审查：

1. 带声音听原片，把 \`completeness\` 改成 \`complete\`，补重复 take 与替代关系，最后才能把 \`reviewComplete\` 设为 true。
2. 重写 audienceProblem、thesis、narrativeStrategy、每个 story beat 的 claim / purpose。
3. 确认是否允许重排；不得默认沿用旧 EDL 顺序。
4. 为 beats / B-roll / primary clips 补真实 intent / reason；回答不了就删除。
5. 人工确认后再把 proposed 文件增量合入 \`data/\`，重新生成字幕、切点证据和全部批准。

旧 EDL 输出时长：${cursor.toFixed(3)}s。
`);

console.log(`已生成只读迁移提案: ${proposalDir}`);
console.log("未修改当前 EDL、字幕、视觉数据或任何批准文件");

function migrateTimedFile(name, timeline) {
  const source = path.join(jobDir, "data", name);
  if (!fs.existsSync(source)) return;
  const items = readJsonArray(source).map((item, index) => {
    const start = Number(item.s ?? item.start);
    const linked = timelineRangeAt(timeline, start);
    const stem = path.basename(name, ".json").replace(/[^a-z0-9]+/gi, "-");
    return {
      ...item,
      ...(!item.id ? { id: `${stem}-${String(index + 1).padStart(3, "0")}` } : {}),
      ...(linked ? { storyBeatId: linked.storyBeatId } : {}),
      ...(name === "captions.json" && linked ? { edlSegmentId: linked.id } : {})
    };
  });
  writeJson(path.join(proposalDir, name.replace(".json", ".proposed.json")), items);
}

function timelineRangeAt(timeline, time) {
  let outputStart = 0;
  for (const segment of timeline) {
    const outputEnd = outputStart + Number(segment.sourceEnd) - Number(segment.sourceStart);
    if (Number.isFinite(time) && time >= outputStart - 0.01 && time < outputEnd + 0.01) {
      return { ...segment, outputStart, outputEnd };
    }
    outputStart = outputEnd;
  }
  return null;
}
