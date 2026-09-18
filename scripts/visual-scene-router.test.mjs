import assert from "node:assert/strict";
import test from "node:test";

import { buildVisualRoute, selectSceneRecipe, validateVisualRoute, visualRouteModuleSource } from "./visual-scene-router.mjs";

const beat = (overrides) => ({
  id: "beat",
  startFrame: 0,
  endFrame: 30,
  visualJob: "hook",
  intent: "提出问题",
  reason: "问题需要建立对象",
  contextEvidence: ["transcript:0-30"],
  speaker: {mode: "hero"},
  continuityObjects: ["order"],
  semantics: {form: "question", sharedObject: "order"},
  ...overrides
});

test("按语义信号选择关系图，而不是看见多个名词就猜", () => {
  assert.deepEqual(selectSceneRecipe(beat({
    visualJob: "relationship",
    semantics: {mode: "parallel-paths", branchCount: 2, sharedObject: "order"}
  })), {recipe: "dual-path-relation", variant: "upper-lower"});
  assert.deepEqual(selectSceneRecipe(beat({
    visualJob: "relationship",
    semantics: {mode: "many-to-one", sourceCount: 4, sink: "order"}
  })), {recipe: "bezier-source-converge-merge", variant: "four-to-one"});
  assert.throws(() => selectSceneRecipe(beat({
    visualJob: "relationship",
    semantics: {entities: ["广告", "订单"]}
  })), /回退人物/);
});

test("完整路由必须逐帧覆盖并保留共享订单对象", () => {
  const input = {
    schemaVersion: 1,
    fps: 30,
    durationInFrames: 60,
    source: {media: "assets/aroll.mp4", startFrame: 0, endFrame: 60},
    beats: [
      beat({endFrame: 30}),
      beat({
        id: "definition",
        startFrame: 30,
        endFrame: 60,
        visualJob: "definition",
        intent: "拆开概念",
        reason: "两个问题需要并列",
        speaker: {mode: "dock"},
        semantics: {sharedObject: "order", conceptPairs: ["归因", "增量"]}
      })
    ]
  };
  const output = buildVisualRoute(input);
  assert.equal(validateVisualRoute(output).length, 0);
  assert.deepEqual(output.scenes.map((scene) => scene.recipe), ["speaker-question", "shared-element-concept-split"]);
  assert.match(visualRouteModuleSource(output), /export const VISUAL_ROUTE/);
  assert.equal(visualRouteModuleSource(output), visualRouteModuleSource(output));
});

test("路由拒绝时间轴空洞", () => {
  const errors = validateVisualRoute({
    schemaVersion: 1,
    router: "semantic-intent-to-approved-scene-v1",
    fps: 30,
    durationInFrames: 40,
    scenes: [{
      id: "gap",
      startFrame: 4,
      endFrame: 40,
      visualJob: "hook",
      intent: "x",
      reason: "x",
      contextEvidence: ["x"],
      speaker: {mode: "hero"},
      continuityObjects: ["order"],
      recipe: "speaker-question",
      variant: "hero-with-shared-object"
    }]
  });
  assert.equal(errors.some((error) => error.includes("不能重叠或留空")), true);
});
