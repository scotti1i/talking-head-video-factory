import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256File } from "./color-management.mjs";
import { collectEditorialHashes } from "./editorial-contract.mjs";
import { runEditorialContractQa } from "./qa-editorial-contract.mjs";
import { evaluateWorkflowStatus } from "./workflow-status.mjs";

test("普通口播不强制 beats，也不同时要求根 composition 和 variant", () => {
  const job = fixture({ profile: "clean-talkinghead" });
  const status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "beats").required, false);
  assert.equal(status.checks.find((item) => item.id === "variantBuild").detail, "1/1 份");
  assert.equal(status.checks.some((item) => item.name === "主合成"), false);
});

test("普通口播的 EDL 必须被完整表达选段记录覆盖", () => {
  const job = fixture({ profile: "clean-talkinghead", completeTakeMap: false });
  const status = evaluateWorkflowStatus(job);
  const check = status.checks.find((item) => item.id === "semanticTakeMap");
  assert.equal(check.required, true);
  assert.equal(check.ok, false);
});

test("内容计划批准在上游文件变化后自动失效", () => {
  const job = fixture({ profile: "clean-talkinghead" });
  let status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "editorialApproval").ok, true);
  const planPath = path.join(job, "data", "editorial-plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  plan.thesis = "changed";
  fs.writeFileSync(planPath, JSON.stringify(plan));
  status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "editorialApproval").ok, false);
});

test("工厂外贸 profile 独立要求书面脚本、BGM 和音频 QA", () => {
  const job = fixture({ profile: "factory-acquisition", includeScript: false, includeMusic: false });
  const status = evaluateWorkflowStatus(job);
  for (const id of ["writtenScript", "musicBed", "audioQa"]) {
    const check = status.checks.find((item) => item.id === id);
    assert.equal(check.required, true);
    assert.equal(check.ok, false);
  }
});

test("平台 policy 叠加到 target，但不改变内容 profile", () => {
  const job = fixture({ profile: "screen-demo", policies: ["douyin-compliance"] });
  const status = evaluateWorkflowStatus(job);
  assert.equal(status.profile.id, "screen-demo");
  assert.deepEqual(status.targets[0].policies, ["douyin-compliance"]);
});

function fixture({ profile, includeScript = true, includeMusic = true, policies = [], completeTakeMap = true }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-status-"));
  const job = path.join(root, "job");
  const files = {
    "assets/originals/take.mp4": "raw",
    "assets/aroll.mp4": "aroll",
    "data/source-inventory.json": "{}",
    "data/transcripts/index.json": "{}",
    "data/takes-packed.md": "take",
    "data/editor-signals.json": JSON.stringify({
      version: 2,
      policy: { cutBoundaryPolicy: "inside-real-silence-v2" },
      sources: []
    }),
    "data/rough-cut-edl.json": JSON.stringify([{
      id: "edl-001",
      storyBeatId: "story-001",
      takeId: "answer",
      source: "take.mp4",
      sourceStart: 0,
      sourceEnd: 1,
      reason: "完整句"
    }]),
    "data/semantic-take-map.json": JSON.stringify({
      schemaVersion: 1,
      reviewComplete: completeTakeMap,
      recordingPattern: "一次完整拍摄",
      ranges: [{
        id: "answer",
        source: "take.mp4",
        sourceStart: 0,
        sourceEnd: 1,
        decision: "keep",
        completeness: "complete",
        claim: "完整回答",
        reason: "表达完整"
      }]
    }),
    "data/editorial-plan.json": JSON.stringify({
      schemaVersion: 1,
      audienceProblem: "问题",
      thesis: "结论",
      narrativeStrategy: "按原顺序说明",
      sourcePolicy: "preserve-order",
      createdBy: { name: "planner", method: "agent", model: "fixture-model", skill: "talkinghead-edit" },
      storyBeats: [{
        id: "story-001",
        role: "claim",
        claim: "完整回答",
        purpose: "回答问题",
        takeIds: ["answer"],
        visualRole: "face"
      }],
      exclusions: []
    }),
    "data/captions.json": JSON.stringify([{ id: "caption-001", storyBeatId: "story-001", edlSegmentId: "edl-001", s: 0, e: 1, t: "hello" }]),
    "data/beats.json": "[]",
    "data/broll.json": "[]",
    "data/primary-clips.json": "[]",
    "qa/cuts/report.json": JSON.stringify({
      schemaVersion: 2,
      edlHash: "edl",
      videoHash: "video",
      cuts: [{ image: "qa/cuts/cut-001.jpg", reviewClip: "qa/cuts/review-cut-001.mp4", reviewClipHash: "clip" }]
    }),
    "qa/cuts/approval.json": JSON.stringify({ schemaVersion: 2, status: "approved" }),
    "variants/douyin-vertical/index.html": "<main></main>",
    "variants/douyin-vertical/qa/report.json": JSON.stringify({ failures: [] }),
    "variants/douyin-vertical/qa/approval.json": JSON.stringify({ status: "publish_ready", fullPlayback: true })
  };
  if (includeScript) files["assets/originals/script.txt"] = "script";
  if (includeMusic) {
    files["assets/bgm/bed.m4a"] = "music";
    files["data/music-bed.json"] = JSON.stringify({ id: "bed", asset: "assets/bgm/bed.m4a", volume: 0.1 });
  }
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(job, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.writeFileSync(path.join(job, "project.json"), JSON.stringify({
    title: "fixture",
    profile,
    policies,
    editorial: { contractVersion: 1, writtenScript: { path: "assets/originals/script.txt", policy: "preserve" } },
    sourceVideo: "assets/aroll.mp4",
    variants: [{ id: "douyin-vertical", platform: "douyin", layout: "vertical" }]
  }));
  const report = runEditorialContractQa(job, { stage: "plan" });
  const reportPath = path.join(job, "qa", "editorial", "report.json");
  const hashes = collectEditorialHashes(job, "plan");
  fs.writeFileSync(path.join(job, "qa", "editorial", "approval.json"), JSON.stringify({
    schemaVersion: 1,
    status: "approved",
    reviewer: "reviewer",
    method: "fresh-context-agent",
    reportHash: sha256File(reportPath),
    hashes: report.hashes || hashes
  }));
  runEditorialContractQa(job, { stage: "visual" });
  return job;
}
