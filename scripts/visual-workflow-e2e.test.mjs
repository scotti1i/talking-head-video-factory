import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildVisualContext, validateVisualContext } from "./visual-context.mjs";
import { buildSafeVisualPlan } from "./visual-plan-init.mjs";
import { prepareRecipeRenders, finalizeVisualPlan } from "./visual-plan-compile.mjs";
import { approveRecipeQa, buildRecipeQaReport } from "./visual-recipe-qa.mjs";
import { validateVisualPlan } from "./visual-plan-contract.mjs";
import { loadRecipeRegistry } from "./visual-recipe-registry.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";

test("新 job 从人物基线、带类型上下文到直接移植执行轨完整闭环", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "visual-workflow-e2e-"));
  write(job, "project.json", {
    title: "三步流程",
    width: 1920,
    height: 1080,
    visual: {referenceApproved: true}
  });
  write(job, "data/editorial-plan.json", {
    schemaVersion: 1,
    audienceProblem: "观众不知道三步顺序",
    thesis: "先做一，再做二，最后做三",
    narrativeStrategy: "按原始顺序解释",
    sourcePolicy: "preserve-order",
    createdBy: {name: "fixture", method: "human"},
    storyBeats: [{
      id: "story-001",
      role: "explanation",
      claim: "依次完成一、二、三",
      purpose: "建立顺序",
      takeIds: ["take-001"],
      visualRole: "explanation",
      visualReason: "三项依次出现比人物复述更清楚"
    }],
    exclusions: []
  });
  write(job, "data/semantic-take-map.json", {
    schemaVersion: 1,
    ranges: [{id: "take-001", decision: "keep", source: "assets/originals/a.mp4", sourceStart: 0, sourceEnd: 6}]
  });
  write(job, "data/rough-cut-edl.json", [{
    id: "edl-001",
    storyBeatId: "story-001",
    takeId: "take-001",
    source: "assets/originals/a.mp4",
    sourceStart: 0,
    sourceEnd: 6,
    reason: "完整表达"
  }]);
  write(job, "data/captions.json", [{id: "caption-001", storyBeatId: "story-001", text: "先做一，再做二，最后做三"}]);
  write(job, "data/face-analysis.json", {status: "measured"});

  const context = buildVisualContext(job);
  assert.equal(context.gaps.length, 1);
  assert.equal(context.gaps[0].resolver, "tool-analysis");
  assert.deepEqual(context.gaps[0].requires, ["semantic-model"]);
  write(job, "data/visual-context.json", context);

  const baseline = buildSafeVisualPlan(job);
  assert.equal(baseline.shots[0].mode, "face");
  write(job, "data/visual-plan.json", baseline);

  context.analysis.push({
    id: "three-step-structure",
    status: "verified",
    finding: "完整表达明确给出一、二、三的先后顺序。",
    basis: ["automatic:captions"],
    supports: ["semantic-model", "ordered-items"]
  });
  Object.assign(context.gaps[0], {
    status: "resolved",
    evidenceRef: "analysis:three-step-structure"
  });
  assert.equal(validateVisualContext(context).ok, true);
  write(job, "data/visual-context.json", context);

  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const plan = {
    schemaVersion: 1,
    createdBy: {name: "fixture", method: "typed-context"},
    registry: {id: registry.id, revision: registry.source.revision},
    shots: [{
      id: "three-step-stack",
      storyBeatId: "story-001",
      start: 1,
      end: 4.5,
      mode: "recipe",
      visualJob: "sequence",
      intent: "让三步顺序一次可见",
      reason: "原话包含明确顺序，直接移植列表压弹镜头",
      placement: "fullscreen",
      speaker: {mode: "pip", placement: "bottom-right"},
      recipe: {
        id: "shotcraft/list-stack-press",
        variant: "list-stack-press",
        adaptation: {mode: "direct-port", props: {title: "三步流程", items: [{title: "第一步"}, {title: "第二步"}, {title: "第三步"}]}}
      },
      contextEvidence: ["analysis:three-step-structure", "automatic:face-analysis"],
      assetRefs: [],
      requirementCoverage: {"ordered-items": "analysis:three-step-structure"},
      confidence: 0.95
    }]
  };
  const validated = validateVisualPlan(plan, {
    context,
    editorialPlan: read(job, "data/editorial-plan.json"),
    semanticTakeMap: read(job, "data/semantic-take-map.json"),
    edl: read(job, "data/rough-cut-edl.json"),
    registry,
    production
  });
  assert.deepEqual(validated.errors, []);
  write(job, "data/visual-plan.json", plan);

  const manifest = prepareRecipeRenders(job);
  assert.equal(manifest.renders.length, 1);
  assert.equal(manifest.renders[0].adaptation.mode, "direct-port");
  const fakeRender = path.join(job, manifest.renders[0].output);
  fs.mkdirSync(path.dirname(fakeRender), {recursive: true});
  fs.writeFileSync(fakeRender, "deterministic-render-placeholder");
  buildRecipeQaReport(job, {
    durationProbe: () => 3.5,
    stripGenerator: writeQaImage,
    overviewGenerator: writeQaImage
  });
  approveRecipeQa(job, {reviewer: "fixture", method: "four-phase-filmstrip", notes: "四阶段内容和构图通过。"});
  const compiled = finalizeVisualPlan(job, {durationProbe: () => 3.5});
  assert.deepEqual(compiled.primaryClipIds, ["three-step-stack"]);
  const primary = read(job, "data/primary-clips.json");
  assert.equal(primary[0].recipeId, "shotcraft/list-stack-press");
  assert.equal(primary[0].speakerPip, true);
});

function writeQaImage(_input, output) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, "qa-image");
}

function write(job, relative, value) {
  const file = path.join(job, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function read(job, relative) {
  return JSON.parse(fs.readFileSync(path.join(job, relative), "utf8"));
}
