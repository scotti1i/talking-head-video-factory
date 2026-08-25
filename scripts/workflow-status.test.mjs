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
