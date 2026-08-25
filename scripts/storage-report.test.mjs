import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildStorageReport, classifyJobPath, cleanupCandidate, compactStorageReport, groupCleanupCandidates } from "./storage-report.mjs";

test("存储分类分开原片、中间件、成片、QA 与交付", () => {
  assert.equal(classifyJobPath("assets/originals/take.mov"), "originals");
  assert.equal(classifyJobPath("assets/aroll.mp4"), "working-media");
  assert.equal(classifyJobPath("variants/douyin/renders/final.mp4"), "renders");
  assert.equal(classifyJobPath("variants/douyin/renders/work-123/captured/frames.rgb48le"), "cache");
  assert.equal(classifyJobPath("variants/douyin/qa/report.json"), "qa");
  assert.equal(classifyJobPath("delivery/youtube/final.mp4"), "delivery");
});

test("只有缓存进入 safe-rebuildable，原片与终版必须保护或人工确认", () => {
  assert.equal(cleanupCandidate("tmp/waveform.json", "cache").class, "safe-rebuildable");
  assert.equal(cleanupCandidate("renders/review-v2.mp4", "renders").class, "review-required");
  assert.equal(cleanupCandidate("qa/audio-report.json", "qa"), null);
  assert.equal(cleanupCandidate("qa/publish-verification.json", "qa"), null);
  assert.equal(cleanupCandidate("assets/originals/take.mov", "originals"), null);
  assert.equal(cleanupCandidate("delivery/final.mp4", "delivery"), null);
});

test("报告按 job 汇总并把硬链接标成不可直接释放", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-report-"));
  const job = path.join(root, "jobs", "demo");
  write(job, "project.json", "{}");
  write(job, "assets/originals/take.mov", "1234567890");
  fs.mkdirSync(path.join(job, "tmp"), { recursive: true });
  fs.linkSync(path.join(job, "assets/originals/take.mov"), path.join(job, "tmp", "linked.mov"));
  write(job, "renders/review-v2.mp4", "review");
  const report = buildStorageReport(root);
  assert.equal(report.jobCount, 1);
  assert.equal(report.jobs[0].logicalBytes > report.jobs[0].uniqueBytes, true);
  assert.equal(report.jobs[0].safeCandidates[0].reclaimableBytes, 0);
  assert.equal(report.jobs[0].reviewCandidates.some((item) => item.relative === "renders/review-v2.mp4"), true);
  assert.equal(report.jobs[0].profile, null);
});

test("safe 清单按可整体清理的工作目录聚合，不逐帧刷屏", () => {
  const groups = groupCleanupCandidates([
    { job: "demo", relative: "variants/a/renders/work-123/frames/1.raw", bytes: 10, reclaimableBytes: 10, reason: "cache" },
    { job: "demo", relative: "variants/a/renders/work-123/frames/2.raw", bytes: 20, reclaimableBytes: 20, reason: "cache" }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].root, "variants/a/renders/work-123");
  assert.equal(groups[0].files, 2);
  assert.equal(groups[0].reclaimableBytes, 30);
});

test("常规 JSON 只保留聚合与最大候选，完整逐文件清单只属于 plan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-compact-"));
  const job = path.join(root, "jobs", "demo");
  write(job, "project.json", JSON.stringify({ profile: "clean-talkinghead", variants: [] }));
  write(job, "tmp/cache.raw", "cache");
  write(job, "renders/review.mp4", "review");
  const compact = compactStorageReport(buildStorageReport(root));
  assert.equal("safeCandidates" in compact.jobs[0], false);
  assert.equal(compact.jobs[0].safeGroups.length, 1);
  assert.equal(compact.jobs[0].largestReviewCandidates.length, 1);
});

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
