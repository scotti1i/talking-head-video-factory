import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateWorkflowStatus } from "./workflow-status.mjs";

test("普通口播不强制 beats，也不同时要求根 composition 和 variant", () => {
  const job = fixture({ profile: "clean-talkinghead" });
  const status = evaluateWorkflowStatus(job);
  assert.equal(status.checks.find((item) => item.id === "beats").required, false);
  assert.equal(status.checks.find((item) => item.id === "variantBuild").detail, "1/1 份");
  assert.equal(status.checks.some((item) => item.name === "主合成"), false);
});

test("工厂外贸 profile 独立要求书面脚本、BGM、段首段尾和音频 QA", () => {
  const job = fixture({ profile: "factory-acquisition", includeScript: false, includeMusic: false });
  const status = evaluateWorkflowStatus(job);
  for (const id of ["writtenScript", "musicBed", "dialogueQa", "audioQa"]) {
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

test("批量盖章是 profile 无关的治理 gate：两秒内两份 approval 标红，人签留 by", () => {
  const job = fixture({ profile: "clean-talkinghead" });
  const stamped = evaluateWorkflowStatus(job);
  const batch = stamped.checks.find((item) => item.id === "batchStamp");
  assert.equal(batch.required, true);
  assert.equal(batch.ok, false);
  assert.match(batch.detail, /疑似批量盖章/);
  assert.equal(stamped.ready, false);
  assert.match(stamped.checks.find((item) => item.id === "cutApproval").detail, /by: 缺 by/);

  fs.writeFileSync(path.join(job, "qa", "cuts", "approval.json"), JSON.stringify({ status: "approved", by: "human", name: "张三", reviewedAt: "2026-09-05T10:00:00.000Z" }));
  fs.writeFileSync(path.join(job, "variants", "douyin-vertical", "qa", "approval.json"), JSON.stringify({ status: "publish_ready", fullPlayback: true, by: "human", name: "张三", reviewedAt: "2026-09-05T10:40:00.000Z" }));
  const spaced = evaluateWorkflowStatus(job);
  assert.equal(spaced.checks.find((item) => item.id === "batchStamp").ok, true);
  assert.match(spaced.checks.find((item) => item.id === "cutApproval").detail, /by: human/);
  assert.match(spaced.checks.find((item) => item.id === "finalApproval").detail, /by: human/);
  assert.equal(spaced.ready, true);
});

function fixture({ profile, includeScript = true, includeMusic = true, policies = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-status-"));
  const job = path.join(root, "job");
  const files = {
    "assets/originals/take.mp4": "raw",
    "assets/aroll.mp4": "aroll",
    "data/source-inventory.json": "{}",
    "data/transcripts/index.json": "{}",
    "data/takes-packed.md": "take",
    "data/editor-signals.json": "{}",
    "data/rough-cut-edl.json": JSON.stringify([{ source: "take.mp4", sourceStart: 0, sourceEnd: 1, reason: "完整句" }]),
    "data/captions.json": JSON.stringify([{ s: 0, e: 1, t: "hello" }]),
    "qa/cuts/report.json": JSON.stringify({ failures: [] }),
    "qa/cuts/approval.json": JSON.stringify({ status: "approved" }),
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
    editorial: { writtenScript: { path: "assets/originals/script.txt", policy: "preserve" } },
    sourceVideo: "assets/aroll.mp4",
    variants: [{ id: "douyin-vertical", platform: "douyin", layout: "vertical" }]
  }));
  return job;
}
