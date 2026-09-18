import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSafeVisualPlan } from "./visual-plan-init.mjs";

test("任何新 job 都从覆盖真实 EDL 的全人物安全计划开始", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "visual-plan-init-"));
  write(job, "data/editorial-plan.json", {
    schemaVersion: 1,
    audienceProblem: "观众不理解概念",
    thesis: "解释概念",
    narrativeStrategy: "先说清",
    sourcePolicy: "preserve-order",
    createdBy: { name: "fixture", method: "human" },
    storyBeats: [{
      id: "story-001",
      role: "explanation",
      claim: "概念定义",
      purpose: "解释",
      takeIds: ["take-001"],
      visualRole: "explanation",
      visualReason: "可能需要定义卡"
    }],
    exclusions: []
  });
  write(job, "data/semantic-take-map.json", {
    schemaVersion: 1,
    ranges: [{ id: "take-001", decision: "keep", source: "assets/originals/a.mp4", sourceStart: 10, sourceEnd: 16 }]
  });
  write(job, "data/rough-cut-edl.json", [{
    id: "edl-001",
    storyBeatId: "story-001",
    takeId: "take-001",
    source: "assets/originals/a.mp4",
    sourceStart: 10,
    sourceEnd: 16,
    reason: "完整表达"
  }]);
  write(job, "data/visual-context.json", {
    schemaVersion: 1,
    automatic: { assets: [] },
    storyBeats: [{ id: "story-001" }],
    analysis: [],
    research: [],
    userInputs: [],
    gaps: [{
      id: "story-001-model",
      storyBeatId: "story-001",
      need: "定义依据",
      resolver: "agent-research",
      status: "unresolved",
      evidenceRef: null,
      requires: ["plain-language-definition"],
      blockingFor: ["recipe"],
      fallback: "face"
    }]
  });

  const plan = buildSafeVisualPlan(job);
  assert.equal(plan.registry.id, "video-shotcraft");
  assert.deepEqual(plan.shots, [{
    id: "face-edl-001",
    storyBeatId: "story-001",
    start: 0,
    end: 6,
    mode: "face",
    visualJob: "emphasis",
    intent: "保持说话人作为默认主画面",
    reason: "先建立安全基线；只有上下文与生产武器同时满足时才增加视觉镜头",
    placement: "fullscreen",
    speaker: { mode: "full" },
    contextEvidence: ["automatic:captions"],
    assetRefs: []
  }]);
});

function write(job, relative, value) {
  const file = path.join(job, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
