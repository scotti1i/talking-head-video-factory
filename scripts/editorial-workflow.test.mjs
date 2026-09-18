import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runEditorialContractQa } from "./qa-editorial-contract.mjs";
import { evaluateWorkflowStatus } from "./workflow-status.mjs";

const approveScript = path.join(import.meta.dirname, "approve-editorial-plan.mjs");

test("新合同按内容计划批准和视觉引用两阶段运行，并分别失效", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-workflow-"));
  const files = {
    "project.json": {
      title: "新合同 fixture",
      profile: "clean-talkinghead",
      sourceVideo: "assets/aroll.mp4",
      editorial: { contractVersion: 1, editingMode: "semantic-edl" }
    },
    "assets/originals/take.mp4": "raw",
    "assets/aroll.mp4": "aroll",
    "data/editorial-plan.json": {
      schemaVersion: 1,
      audienceProblem: "观众的问题",
      thesis: "明确结论",
      narrativeStrategy: "先问题后结论",
      sourcePolicy: "preserve-order",
      createdBy: { name: "planner", method: "agent", model: "fixture-model", skill: "talkinghead-edit" },
      storyBeats: [{ id: "story-001", role: "claim", claim: "完整结论", purpose: "回答问题", takeIds: ["take-001"], visualRole: "face" }],
      exclusions: []
    },
    "data/semantic-take-map.json": {
      schemaVersion: 1,
      reviewComplete: true,
      recordingPattern: "一次完整表达",
      ranges: [{ id: "take-001", source: "assets/originals/take.mp4", sourceStart: 0, sourceEnd: 2, decision: "keep", completeness: "complete", claim: "完整结论", reason: "起落句完整" }]
    },
    "data/rough-cut-edl.json": [{ id: "edl-001", storyBeatId: "story-001", takeId: "take-001", source: "assets/originals/take.mp4", sourceStart: 0, sourceEnd: 2, reason: "保留完整结论" }],
    "data/captions.json": [{ id: "caption-001", storyBeatId: "story-001", edlSegmentId: "edl-001", s: 0, e: 1.9, t: "完整结论" }],
    "data/beats.json": [],
    "data/broll.json": [],
    "data/primary-clips.json": []
  };
  for (const [relative, value] of Object.entries(files)) write(job, relative, value);

  assert.equal(runEditorialContractQa(job, { stage: "plan" }).status, "passed");
  const approval = spawnSync(process.execPath, [
    approveScript,
    "--job", job,
    "--reviewer", "reviewer",
    "--method", "fresh-context-agent",
    "--notes", "核对受众问题、结论、顺序和完整表达"
  ], { encoding: "utf8" });
  assert.equal(approval.status, 0, approval.stderr);
  assert.equal(runEditorialContractQa(job, { stage: "visual" }).status, "passed");

  let status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "editorialPlan").ok, true);
  assert.equal(status.checks.find((item) => item.id === "editorialApproval").ok, true);
  assert.equal(status.checks.find((item) => item.id === "visualContract").ok, true);

  write(job, "data/captions.json", [{ id: "caption-001", s: 0, e: 1.9, t: "失去引用" }]);
  status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "editorialApproval").ok, true);
  assert.equal(status.checks.find((item) => item.id === "visualContract").ok, false);
});

function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}
