import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, resolveJob, writeJson } from "./lib.mjs";

export const ROUTER_RECIPES = Object.freeze({
  "speaker-question": {
    visualJobs: ["hook"],
    variants: ["hero-with-shared-object"]
  },
  "diagram-cascade-build": {
    visualJobs: ["sequence"],
    variants: ["horizontal-path"]
  },
  "shared-focus-morph": {
    visualJobs: ["emphasis"],
    variants: ["remove-last-touch"]
  },
  "dual-path-relation": {
    visualJobs: ["relationship"],
    variants: ["upper-lower"]
  },
  "bezier-source-converge-merge": {
    visualJobs: ["relationship"],
    variants: ["four-to-one"]
  },
  "shared-element-concept-split": {
    visualJobs: ["definition", "comparison"],
    variants: ["order-to-two-questions"]
  },
  "speaker-reset": {
    visualJobs: ["emphasis", "transition"],
    variants: ["face"]
  }
});

export function selectSceneRecipe(beat) {
  const semantics = beat?.semantics || {};
  if (beat.visualJob === "hook" && semantics.form === "question" && semantics.sharedObject) {
    return route("speaker-question", "hero-with-shared-object");
  }
  if (beat.visualJob === "sequence" && Array.isArray(semantics.orderedItems) && semantics.orderedItems.length >= 3) {
    return route("diagram-cascade-build", "horizontal-path");
  }
  if (beat.visualJob === "emphasis" && semantics.focusObject && semantics.removeObject) {
    return route("shared-focus-morph", "remove-last-touch");
  }
  if (beat.visualJob === "relationship" && semantics.mode === "parallel-paths" && semantics.branchCount >= 2) {
    return route("dual-path-relation", "upper-lower");
  }
  if (beat.visualJob === "relationship" && semantics.mode === "many-to-one" && semantics.sourceCount >= 3 && semantics.sink) {
    return route("bezier-source-converge-merge", "four-to-one");
  }
  if (["definition", "comparison"].includes(beat.visualJob) && Array.isArray(semantics.conceptPairs) && semantics.conceptPairs.length === 2 && semantics.sharedObject) {
    return route("shared-element-concept-split", "order-to-two-questions");
  }
  if (["emphasis", "transition"].includes(beat.visualJob) && semantics.faceEnough === true) {
    return route("speaker-reset", "face");
  }
  throw new Error(`${beat?.id || "未命名 beat"}: 没有足够语义信号选择视觉配方；应回退人物，不允许猜关系图`);
}

export function buildVisualRoute(input) {
  const inputErrors = validateInput(input);
  if (inputErrors.length) throw new Error(`视觉路由输入无效:\n- ${inputErrors.join("\n- ")}`);
  const scenes = input.beats.map((beat) => ({
    id: beat.id,
    startFrame: beat.startFrame,
    endFrame: beat.endFrame,
    visualJob: beat.visualJob,
    intent: beat.intent,
    reason: beat.reason,
    contextEvidence: beat.contextEvidence,
    speaker: beat.speaker,
    continuityObjects: beat.continuityObjects || [],
    decisionSignals: Object.keys(beat.semantics || {}).sort(),
    ...selectSceneRecipe(beat)
  }));
  const routePlan = {
    schemaVersion: 1,
    router: "semantic-intent-to-approved-scene-v1",
    status: "candidate-review",
    fps: input.fps,
    durationInFrames: input.durationInFrames,
    source: input.source,
    scenes
  };
  const routeErrors = validateVisualRoute(routePlan);
  if (routeErrors.length) throw new Error(`视觉路由输出无效:\n- ${routeErrors.join("\n- ")}`);
  return routePlan;
}

export function validateVisualRoute(routePlan) {
  const errors = [];
  if (routePlan?.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (routePlan?.router !== "semantic-intent-to-approved-scene-v1") errors.push("router 标识无效");
  if (!Number.isInteger(routePlan?.fps) || routePlan.fps <= 0) errors.push("fps 必须是正整数");
  if (!Number.isInteger(routePlan?.durationInFrames) || routePlan.durationInFrames <= 0) errors.push("durationInFrames 必须是正整数");
  if (!Array.isArray(routePlan?.scenes) || !routePlan.scenes.length) {
    errors.push("scenes 不能为空");
    return errors;
  }
  const ids = new Set();
  let cursor = 0;
  let sawSharedOrder = false;
  for (const [index, scene] of routePlan.scenes.entries()) {
    const label = `scenes[${index}]`;
    if (!scene.id || ids.has(scene.id)) errors.push(`${label}.id 为空或重复`);
    ids.add(scene.id);
    if (scene.startFrame !== cursor) errors.push(`${label} 必须从 ${cursor} 开始，不能重叠或留空`);
    if (!Number.isInteger(scene.endFrame) || scene.endFrame <= scene.startFrame) errors.push(`${label}.endFrame 无效`);
    cursor = scene.endFrame;
    if (!String(scene.intent || "").trim()) errors.push(`${label}.intent 不能为空`);
    if (!String(scene.reason || "").trim()) errors.push(`${label}.reason 不能为空`);
    if (!Array.isArray(scene.contextEvidence) || !scene.contextEvidence.length) errors.push(`${label}.contextEvidence 不能为空`);
    const recipe = ROUTER_RECIPES[scene.recipe];
    if (!recipe) errors.push(`${label}.recipe 未获路由许可: ${scene.recipe || "_"}`);
    else {
      if (!recipe.visualJobs.includes(scene.visualJob)) errors.push(`${label}.visualJob 与 recipe 不匹配`);
      if (!recipe.variants.includes(scene.variant)) errors.push(`${label}.variant 与 recipe 不匹配`);
    }
    if (!scene.speaker || !["hero", "dock", "focus", "orb"].includes(scene.speaker.mode)) errors.push(`${label}.speaker.mode 无效`);
    if (!Array.isArray(scene.continuityObjects)) errors.push(`${label}.continuityObjects 必须是数组`);
    if (scene.continuityObjects?.includes("order")) sawSharedOrder = true;
  }
  if (cursor !== routePlan.durationInFrames) errors.push(`时间轴只覆盖到 ${cursor}，应覆盖 ${routePlan.durationInFrames}`);
  if (!sawSharedOrder) errors.push("缺少贯穿场景的 order 共享对象");
  return errors;
}

export function visualRouteModuleSource(routePlan) {
  return `// 由 scripts/visual-scene-router.mjs 从 job 语义输入确定性生成。\nexport const VISUAL_ROUTE = ${JSON.stringify(routePlan, null, 2)} as const;\n`;
}

function route(recipe, variant) {
  return { recipe, variant };
}

function validateInput(input) {
  const errors = [];
  if (input?.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Number.isInteger(input?.fps) || input.fps <= 0) errors.push("fps 必须是正整数");
  if (!Number.isInteger(input?.durationInFrames) || input.durationInFrames <= 0) errors.push("durationInFrames 必须是正整数");
  if (!Array.isArray(input?.beats) || !input.beats.length) errors.push("beats 不能为空");
  return errors;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const inputFile = path.join(jobDir, "data", "visual-route-input.json");
  const outputFile = path.join(jobDir, "data", "visual-route.json");
  const routePlan = buildVisualRoute(readJson(inputFile));
  writeJson(outputFile, routePlan);
  if (args.module) {
    const moduleFile = path.resolve(projectRoot(), String(args.module));
    fs.mkdirSync(path.dirname(moduleFile), {recursive: true});
    fs.writeFileSync(moduleFile, visualRouteModuleSource(routePlan));
  }
  console.log(`视觉路由已生成: ${outputFile}`);
  console.log(routePlan.scenes.map((scene) => `${scene.id}: ${scene.visualJob} -> ${scene.recipe}/${scene.variant}`).join("\n"));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
