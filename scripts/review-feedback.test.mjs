import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertReviewInitAllowed, createReviewRevision, renderFeedbackMarkdown, validateReviewFeedback } from "./review-feedback-lib.mjs";

test("审片版本冻结视频与内容真相，反馈按时间码验证", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "project.json"), "{}\n");
  fs.writeFileSync(path.join(jobDir, "data", "rough-cut-edl.json"), "[]\n");
  fs.writeFileSync(path.join(jobDir, "renders", "review.mp4"), "video");

  const created = createReviewRevision({
    jobDir,
    revision: "r0",
    video: "renders/review.mp4",
    duration: 38.13,
    now: new Date("2026-08-25T00:00:00.000Z"),
    enforce: false
  });
  assert.equal(created.manifest.revision, "R0");
  assert.equal(created.manifest.truth.length, 2);
  assert.equal(created.manifest.video.path, "review/R0/video.mp4");
  assert.equal(fs.readFileSync(path.join(jobDir, created.manifest.video.path), "utf8"), "video");
  fs.writeFileSync(path.join(jobDir, "renders", "review.mp4"), "new render");
  assert.equal(fs.readFileSync(path.join(jobDir, created.manifest.video.path), "utf8"), "video");
  assert.throws(() => createReviewRevision({ jobDir, revision: "R0", video: "renders/review.mp4", duration: 38.13, enforce: false }), /已存在/);

  const feedbackPath = path.join(jobDir, "review", "R0", "feedback.json");
  const feedback = JSON.parse(fs.readFileSync(feedbackPath, "utf8"));
  feedback.items.push({
    id: "breath-at-hook",
    start: 3.2,
    end: 4.1,
    category: "fine-cut",
    instruction: "前面多留 0.15 秒",
    scope: "project",
    status: "open"
  });
  fs.writeFileSync(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`);
  assert.deepEqual(validateReviewFeedback({ jobDir, revision: "R0" }), {
    revision: "R0",
    duration: 38.13,
    count: 1,
    open: 1,
    resolved: 0
  });
  assert.match(renderFeedbackMarkdown({ jobDir, revision: "R0" }), /00:03\.200–00:04\.100/);
  fs.writeFileSync(path.join(jobDir, created.manifest.video.path), "tampered");
  assert.throws(() => validateReviewFeedback({ jobDir, revision: "R0" }), /哈希漂移/);
});

test("反馈越界、非法范围与伪完成状态会失败", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-bad-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "renders", "review.mp4"), "video");
  createReviewRevision({ jobDir, revision: "R0", video: "renders/review.mp4", duration: 10, enforce: false });
  const feedbackPath = path.join(jobDir, "review", "R0", "feedback.json");
  const feedback = JSON.parse(fs.readFileSync(feedbackPath, "utf8"));
  feedback.items.push({
    id: "bad-item",
    start: 9,
    end: 12,
    category: "fine-cut",
    instruction: "再紧一点",
    scope: "everything",
    status: "resolved"
  });
  fs.writeFileSync(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`);
  assert.throws(() => validateReviewFeedback({ jobDir, revision: "R0" }), /时间越界/);
});

test("review init 拒绝 Agent 盖章的切点批准与未登记的 high 信号", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-review-gate-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "qa", "cuts"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "renders", "review.mp4"), "video");
  const approval = path.join(jobDir, "qa", "cuts", "approval.json");

  assert.throws(() => createReviewRevision({ jobDir, revision: "R0", video: "renders/review.mp4", duration: 10 }), /缺少「切点批准」/);
  assert.equal(fs.existsSync(path.join(jobDir, "review", "R0")), false);

  fs.writeFileSync(approval, JSON.stringify({ status: "approved", by: "agent", name: "codex" }));
  assert.throws(() => assertReviewInitAllowed(jobDir), /by=agent/);

  fs.writeFileSync(approval, JSON.stringify({ status: "approved", by: "human", name: "张三" }));
  fs.writeFileSync(path.join(jobDir, "data", "editor-signals.json"), JSON.stringify({
    sources: [{
      source: "assets/originals/take.mp4",
      disfluencySignals: [{ type: "adjacent_repeat", severity: "high", start: 1, end: 2, reason: "重复" }],
      cutBoundarySignals: []
    }]
  }));
  assert.throws(() => assertReviewInitAllowed(jobDir), /severity=high/);

  fs.writeFileSync(path.join(jobDir, "data", "resolved-signals.json"), JSON.stringify([{ id: "take.mp4#adjacent_repeat@1", reason: "强调语气，保留" }]));
  const created = createReviewRevision({ jobDir, revision: "R0", video: "renders/review.mp4", duration: 10 });
  assert.equal(created.manifest.revision, "R0");
});
