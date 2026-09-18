import assert from "node:assert/strict";
import test from "node:test";

import { buildListeningReviewTemplate, validateListeningReview } from "./cut-listening-review.mjs";

const report = {
  video: "assets/aroll.mp4",
  videoHash: "rough-hash",
  cuts: [{ index: 1, reviewClip: "qa/cuts/review-cut-001.mp4", reviewClipHash: "clip-hash" }]
};

test("新生成的空白审听模板不能直接批准", () => {
  const review = buildListeningReviewTemplate(report);
  assert.equal(validateListeningReview(review, report).ok, false);
});

test("证据文件哈希变化后旧审听结论失效", () => {
  const review = passedReview();
  review.clips[0].sha256 = "old-hash";
  const result = validateListeningReview(review, report);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /哈希/);
});

test("完整粗剪、逐切点和整体顺序均有审听记录时通过", () => {
  assert.deepEqual(validateListeningReview(passedReview(), report), { ok: true, errors: [] });
});

function passedReview() {
  return {
    schemaVersion: 1,
    status: "passed",
    reviewer: "Scott",
    method: "human",
    roughCut: {
      path: report.video,
      sha256: report.videoHash,
      verdict: "pass",
      notes: "从头到尾听完，表达完整，无吞字"
    },
    clips: [{
      index: 1,
      path: report.cuts[0].reviewClip,
      sha256: report.cuts[0].reviewClipHash,
      verdict: "pass",
      notes: "切前切后语义连续，词头词尾完整"
    }],
    sequenceVerdict: "pass",
    notes: ""
  };
}
