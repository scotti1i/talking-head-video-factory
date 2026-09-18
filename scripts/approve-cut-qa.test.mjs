import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { sha256File } from "./color-management.mjs";
import { buildListeningReviewTemplate } from "./cut-listening-review.mjs";

const approveScript = path.join(import.meta.dirname, "approve-cut-qa.mjs");

test("--acousticReviewed true 不能绕过未完成的带声音审听", () => {
  const fixture = makeFixture();
  const result = approve(fixture.job, ["--acousticReviewed", "true"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /带声音审听未完成/);
  assert.equal(fs.existsSync(path.join(fixture.qaDir, "approval.json")), false);
});

test("哈希匹配的完整审听与完整表达记录可以生成 v2 批准", () => {
  const fixture = makeFixture();
  const review = buildListeningReviewTemplate(fixture.report);
  review.status = "passed";
  review.reviewer = "Scott";
  review.method = "human";
  review.roughCut.verdict = "pass";
  review.roughCut.notes = "完整播放，无吞字或逻辑断裂";
  review.clips[0].verdict = "pass";
  review.clips[0].notes = "切点前后完整，呼吸自然";
  review.sequenceVerdict = "pass";
  writeJson(path.join(fixture.qaDir, "listening-review.json"), review);

  const result = approve(fixture.job);
  assert.equal(result.status, 0, result.stderr);
  const approval = JSON.parse(fs.readFileSync(path.join(fixture.qaDir, "approval.json"), "utf8"));
  assert.equal(approval.schemaVersion, 2);
  assert.equal(approval.status, "approved");
  assert.equal(approval.listeningReviewer, "Scott");
});

function makeFixture() {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "approve-cut-qa-"));
  const qaDir = path.join(job, "qa", "cuts");
  const files = {
    "assets/aroll.mp4": "rough-cut-media",
    "data/rough-cut-edl.json": JSON.stringify([{
      source: "assets/originals/take.mov",
      sourceStart: 0,
      sourceEnd: 2,
      reason: "完整表达"
    }]),
    "data/semantic-take-map.json": JSON.stringify({
      schemaVersion: 1,
      reviewComplete: true,
      recordingPattern: "一次完整拍摄",
      ranges: [{
        id: "complete-take",
        source: "assets/originals/take.mov",
        sourceStart: 0,
        sourceEnd: 2,
        decision: "keep",
        completeness: "complete",
        claim: "完整观点",
        reason: "起句和落句完整"
      }]
    }),
    "data/editor-signals.json": JSON.stringify({
      version: 2,
      sources: [{ cutBoundarySignals: [{ severity: "review" }] }]
    }),
    "qa/cuts/cut-001.jpg": "image",
    "qa/cuts/review-cut-001.mp4": "review-media"
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(job, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const edlPath = path.join(job, "data", "rough-cut-edl.json");
  const videoPath = path.join(job, "assets", "aroll.mp4");
  const reviewClipPath = path.join(qaDir, "review-cut-001.mp4");
  const report = {
    schemaVersion: 2,
    status: "review_required",
    edl: "data/rough-cut-edl.json",
    edlHash: sha256File(edlPath),
    video: "assets/aroll.mp4",
    videoHash: sha256File(videoPath),
    cuts: [{
      index: 1,
      image: "qa/cuts/cut-001.jpg",
      reviewClip: "qa/cuts/review-cut-001.mp4",
      reviewClipHash: sha256File(reviewClipPath)
    }]
  };
  writeJson(path.join(qaDir, "report.json"), report);
  writeJson(path.join(qaDir, "listening-review.json"), buildListeningReviewTemplate(report));
  const future = new Date(Date.now() + 1000);
  fs.utimesSync(path.join(job, "data", "editor-signals.json"), future, future);
  return { job, qaDir, report };
}

function approve(job, extraArgs = []) {
  return spawnSync(process.execPath, [
    approveScript,
    "--job", job,
    "--reviewer", "codex",
    ...extraArgs
  ], { encoding: "utf8" });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
