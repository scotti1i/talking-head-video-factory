import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVisualPlan, prepareRecipeRenders } from "./visual-plan-compile.mjs";
import { approveRecipeQa, buildRecipeQaReport } from "./visual-recipe-qa.mjs";

test("视觉计划同时编译原生配方与核权 B-roll，并保留人工执行轨", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "visual-plan-compile-"));
  write(job, "data/editorial-plan.json", {
    schemaVersion: 1,
    audienceProblem: "不懂概念",
    thesis: "解释概念",
    narrativeStrategy: "先定义",
    sourcePolicy: "preserve-order",
    createdBy: { name: "fixture", method: "human" },
    storyBeats: [{
      id: "story-001",
      role: "explanation",
      claim: "概念定义",
      purpose: "解释",
      takeIds: ["take-001"],
      visualRole: "explanation",
      visualReason: "定义卡"
    }],
    exclusions: []
  });
  write(job, "data/semantic-take-map.json", {
    schemaVersion: 1,
    ranges: [{ id: "take-001", decision: "keep", source: "assets/originals/a.mp4", sourceStart: 0, sourceEnd: 8 }]
  });
  write(job, "data/rough-cut-edl.json", [{
    id: "edl-001",
    storyBeatId: "story-001",
    takeId: "take-001",
    source: "assets/originals/a.mp4",
    sourceStart: 0,
    sourceEnd: 8,
    reason: "完整表达"
  }]);
  write(job, "data/visual-context.json", {
    schemaVersion: 1,
    automatic: { faceAnalysis: "data/face-analysis.json", assets: [{ id: "proof", path: "assets/proof.jpg", type: "image", provenance: "user-provided", rights: "user-owned" }] },
    storyBeats: [{ id: "story-001" }],
    analysis: [],
    research: [{ id: "definition", status: "verified", sources: ["https://example.com"], supports: ["approved-term", "plain-language-definition"] }],
    userInputs: [],
    gaps: []
  });
  write(job, "data/visual-plan.json", {
    schemaVersion: 1,
    registry: { id: "video-shotcraft", revision: "bdd94be16d60fa8f" },
    shots: [{
      id: "visual-001",
      storyBeatId: "story-001",
      start: 1,
      end: 1 + 55 / 30,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "人物口述不足",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: {
        id: "shotcraft/paper-title-card",
        variant: "paper-title-card",
        adaptation: { mode: "direct-port", props: { words: [{ text: "概念" }, { text: "定义", accent: true }] } }
      },
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: {
        "approved-term": "research:definition",
        "plain-language-definition": "research:definition"
      },
      confidence: 0.9
    }, {
      id: "visual-proof",
      storyBeatId: "story-001",
      start: 6.2,
      end: 7.2,
      mode: "broll",
      visualJob: "evidence",
      intent: "展示真实证据图",
      reason: "人物口述无法替代原始画面",
      placement: "split-left",
      speaker: { mode: "full" },
      contextEvidence: ["asset:proof"],
      assetRefs: ["proof"],
      confidence: 0.95,
      transition: { type: "morph" }
    }]
  });
  write(job, "data/primary-clips.json", [{
    id: "manual-proof",
    kind: "proof-footage",
    start: 5,
    end: 6,
    src: "assets/proof.mp4",
    intent: "人工证据",
    reason: "必须保留"
  }]);
  write(job, "data/broll.json", [{
    id: "manual-broll",
    storyBeatId: "story-001",
    start: 4,
    end: 4.5,
    src: "assets/manual.jpg",
    mode: "floating-frame",
    placement: "left",
    transition: "morph",
    intent: "人工画面",
    reason: "必须保留"
  }]);
  fs.mkdirSync(path.join(job, "assets"), { recursive: true });
  fs.writeFileSync(path.join(job, "assets", "proof.jpg"), "proof");
  fs.writeFileSync(path.join(job, "assets", "manual.jpg"), "manual");

  const manifest = prepareRecipeRenders(job);
  assert.equal(manifest.renders.length, 1);
  assert.deepEqual(manifest.renders[0].source.frames, [220, 274]);
  const output = path.join(job, manifest.renders[0].output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "fixture");
  assert.throws(
    () => finalizeVisualPlan(job, { durationProbe: () => 55 / 30 }),
    /配方视觉审查未通过/
  );
  buildRecipeQaReport(job, {
    durationProbe: () => 55 / 30,
    stripGenerator: writeQaImage,
    overviewGenerator: writeQaImage
  });
  approveRecipeQa(job, { reviewer: "fixture", method: "four-phase-filmstrip", notes: "检查入场、动作、稳定和退场。" });
  const report = finalizeVisualPlan(job, { durationProbe: () => 55 / 30 });
  assert.deepEqual(report.primaryClipIds, ["visual-001"]);
  assert.deepEqual(report.preservedPrimaryClipIds, ["manual-proof"]);
  assert.deepEqual(report.brollIds, ["visual-proof"]);
  assert.deepEqual(report.preservedBrollIds, ["manual-broll"]);
  const primary = JSON.parse(fs.readFileSync(path.join(job, "data", "primary-clips.json"), "utf8"));
  assert.equal(primary.some((item) => item.id === "manual-proof"), true);
  assert.equal(primary.find((item) => item.id === "visual-001").recipeId, "shotcraft/paper-title-card");
  const broll = JSON.parse(fs.readFileSync(path.join(job, "data", "broll.json"), "utf8"));
  assert.equal(broll.some((item) => item.id === "manual-broll"), true);
  assert.deepEqual(broll.find((item) => item.id === "visual-proof"), {
    id: "visual-proof",
    storyBeatId: "story-001",
    start: 6.2,
    end: 7.2,
    src: "assets/proof.jpg",
    mode: "floating-frame",
    placement: "left",
    transition: "morph",
    intent: "展示真实证据图",
    reason: "人物口述无法替代原始画面",
    generatedBy: "visual-plan-v1",
    assetId: "proof",
    sourceHash: broll.find((item) => item.id === "visual-proof").sourceHash
  });
});

function writeQaImage(_input, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "qa-image");
}

function write(job, relative, value) {
  const file = path.join(job, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
