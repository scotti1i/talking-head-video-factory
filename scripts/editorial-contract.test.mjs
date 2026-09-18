import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectEditorialHashes,
  hashesMatch,
  validateEditorialPlan,
  validateTimelineContract
} from "./editorial-contract.mjs";

const semanticTakeMap = {
  schemaVersion: 1,
  reviewComplete: true,
  recordingPattern: "两段各保留一次完整表达",
  ranges: [
    completeTake("take-001", 0, 4),
    completeTake("take-002", 5, 9)
  ]
};

const editorialPlan = {
  schemaVersion: 1,
  audienceProblem: "观众不理解规则差异",
  thesis: "先区分平台，再给行动结论",
  narrativeStrategy: "误解、证据、结论",
  sourcePolicy: "preserve-order",
  createdBy: { name: "Codex", method: "agent", model: "fixture-model", skill: "talkinghead-edit" },
  storyBeats: [
    {
      id: "story-001",
      role: "hook",
      claim: "常见说法并不通用",
      purpose: "纠正错误前提",
      takeIds: ["take-001"],
      visualRole: "face"
    },
    {
      id: "story-002",
      role: "evidence",
      claim: "不同平台规则对象不同",
      purpose: "提供真实规则证据",
      takeIds: ["take-002"],
      visualRole: "evidence",
      visualReason: "规则截图比复述更可信"
    }
  ],
  exclusions: []
};

const edl = [
  { id: "edl-001", storyBeatId: "story-001", takeId: "take-001", source: "take.mp4", sourceStart: 0, sourceEnd: 4, reason: "完整误解与纠正" },
  { id: "edl-002", storyBeatId: "story-002", takeId: "take-002", source: "take.mp4", sourceStart: 5, sourceEnd: 9, reason: "完整证据与落句" }
];

test("规划器合同把结构段、完整 take、EDL、字幕和视觉连成一条链", () => {
  assert.equal(validateEditorialPlan(editorialPlan, { semanticTakeMap }).ok, true);
  const result = validateTimelineContract({
    editorialPlan,
    semanticTakeMap,
    edl,
    captions: [
      { id: "caption-001", storyBeatId: "story-001", edlSegmentId: "edl-001", s: 0, e: 3.8, t: "常见说法并不通用" },
      { id: "caption-002", storyBeatId: "story-002", edlSegmentId: "edl-002", s: 4, e: 7.8, t: "不同平台规则对象不同" }
    ],
    beats: [{ id: "beat-001", storyBeatId: "story-002", start: 4.2, end: 6, intent: "展示规则差异", reason: "人物复述不足以证明原文" }],
    broll: [],
    primaryClips: [],
    stage: "visual"
  });
  assert.equal(result.ok, true, result.errors.join("；"));
});

test("EDL 不能引用结构段未声明的 take，也不能倒退叙事顺序", () => {
  const broken = [
    { ...edl[1] },
    { ...edl[0], takeId: "take-002" }
  ];
  const result = validateTimelineContract({ editorialPlan, semanticTakeMap, edl: broken, stage: "edl" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /顺序倒退/.test(error)));
  assert.ok(result.errors.some((error) => /不属于/.test(error)));
});

test("视觉项目必须引用结构段并说明意图和理由", () => {
  const result = validateTimelineContract({
    editorialPlan,
    semanticTakeMap,
    edl,
    captions: [{ storyBeatId: "story-001", edlSegmentId: "edl-001", s: 0, e: 3, t: "字幕" }],
    beats: [{ id: "beat-001", start: 1, end: 2 }],
    broll: [],
    primaryClips: [],
    stage: "visual"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /storyBeatId/.test(error)));
  assert.ok(result.errors.some((error) => /intent/.test(error)));
  assert.ok(result.errors.some((error) => /reason/.test(error)));
});

test("批准使用的输入哈希会在上游文件变化后失效", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-hashes-"));
  const files = {
    "project.json": "{}",
    "data/editorial-plan.json": JSON.stringify(editorialPlan),
    "data/semantic-take-map.json": JSON.stringify(semanticTakeMap),
    "data/rough-cut-edl.json": JSON.stringify(edl),
    "data/captions.json": "[]",
    "data/beats.json": "[]",
    "data/broll.json": "[]"
  };
  for (const [relative, content] of Object.entries(files)) write(job, relative, content);
  const approved = collectEditorialHashes(job, "visual");
  assert.equal(hashesMatch(approved, collectEditorialHashes(job, "visual")), true);
  write(job, "data/captions.json", JSON.stringify([{ t: "changed" }]));
  assert.equal(hashesMatch(approved, collectEditorialHashes(job, "visual")), false);
});

function completeTake(id, sourceStart, sourceEnd) {
  return {
    id,
    source: "take.mp4",
    sourceStart,
    sourceEnd,
    decision: "keep",
    completeness: "complete",
    claim: id,
    reason: "表达完整"
  };
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
