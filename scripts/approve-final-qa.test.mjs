import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256File } from "./color-management.mjs";
import { collectEditorialHashes } from "./editorial-contract.mjs";

const approveScript = path.join(import.meta.dirname, "approve-final-qa.mjs");

test("最终批准绑定 MP4、抽帧和当前内容/视觉输入", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "approve-final-qa-"));
  const video = write(job, "renders/final.mp4", "video");
  const frame = write(job, "qa/final-frames/frame-000500ms.jpg", "frame");
  for (const relative of [
    "project.json",
    "data/editorial-plan.json",
    "data/semantic-take-map.json",
    "data/rough-cut-edl.json",
    "data/captions.json",
    "data/beats.json",
    "data/broll.json"
  ]) write(job, relative, "{}");
  const report = {
    schemaVersion: 2,
    status: "review_required",
    videoPath: video,
    videoHash: sha256File(video),
    framesDir: path.dirname(frame),
    frameHashes: [{ path: frame, sha256: sha256File(frame) }],
    editorialHashes: collectEditorialHashes(job, "visual"),
    failures: []
  };
  write(job, "qa/report.json", `${JSON.stringify(report)}\n`);

  const passed = approve(job);
  assert.equal(passed.status, 0, passed.stderr);
  const approval = JSON.parse(fs.readFileSync(path.join(job, "qa", "approval.json"), "utf8"));
  assert.equal(approval.schemaVersion, 2);
  assert.equal(approval.videoHash, report.videoHash);

  write(job, "data/captions.json", "{\"changed\":true}");
  const stale = approve(job);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /已变化/);
});

function approve(job) {
  return spawnSync(process.execPath, [
    approveScript,
    "--job", job,
    "--reviewer", "Scott",
    "--fullPlayback", "false",
    "--notes", "检查全部抽帧"
  ], { encoding: "utf8" });
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
