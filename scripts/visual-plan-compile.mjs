import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256File } from "./color-management.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, videoDuration, writeJson } from "./lib.mjs";
import { runVisualPlanQa } from "./visual-plan-contract.mjs";
import { validateRecipeQaApproval } from "./visual-recipe-qa.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";

const GENERATED_BY = "visual-plan-v1";
const EPSILON = 1 / 30 + 0.005;

export function prepareRecipeRenders(jobDir) {
  const qa = runVisualPlanQa(jobDir);
  if (qa.status !== "passed") throw new Error(`视觉计划未通过:\n- ${qa.failures.join("\n- ")}`);
  const plan = readJson(path.join(jobDir, "data", "visual-plan.json"));
  const production = loadProductionCatalog();
  const implementationByRecipe = productionImplementationIndex(production);
  const renders = plan.shots.filter((shot) => shot.mode === "recipe").map((shot) => {
    const implementation = implementationByRecipe.get(shot.recipe.id);
    if (!implementation) throw new Error(`生产目录缺少 ${shot.recipe.id} 的 implementation`);
    const sourceFrames = implementation.recipe.frames;
    const frameCount = sourceFrames[1] - sourceFrames[0] + 1;
    const duration = frameCount / implementation.fps;
    const plannedDuration = Number(shot.end) - Number(shot.start);
    if (Math.abs(plannedDuration - duration) > EPSILON) {
      throw new Error(`${shot.id}: 计划时长 ${plannedDuration.toFixed(3)}s 与原配方 ${duration.toFixed(3)}s 不一致；直接移植阶段禁止拉伸调校节奏`);
    }
    const output = `assets/visual-recipes/${shot.id}.mp4`;
    return {
      id: shot.id,
      storyBeatId: shot.storyBeatId,
      recipeId: shot.recipe.id,
      variant: shot.recipe.variant,
      renderer: "remotion",
      source: {
        familyId: implementation.family.id,
        root: implementation.family.sourceRoot,
        entry: implementation.entry,
        composition: implementation.composition,
        frames: sourceFrames,
        fps: implementation.fps,
        sourceFiles: implementation.recipe.sourceFiles
      },
      output,
      expectedDuration: duration,
      adaptation: shot.recipe.adaptation || { mode: "upstream-original" }
    };
  });
  const manifest = {
    schemaVersion: 1,
    generatedBy: GENERATED_BY,
    registryRevision: qa.registryRevision,
    plan: "data/visual-plan.json",
    renders
  };
  writeJson(path.join(jobDir, "data", "recipe-renders.json"), manifest);
  return manifest;
}

export function finalizeVisualPlan(jobDir, { durationProbe = videoDuration } = {}) {
  const qa = runVisualPlanQa(jobDir);
  if (qa.status !== "passed") throw new Error(`视觉计划未通过:\n- ${qa.failures.join("\n- ")}`);
  const plan = readJson(path.join(jobDir, "data", "visual-plan.json"));
  const context = readJson(path.join(jobDir, "data", "visual-context.json"));
  const manifest = readJson(path.join(jobDir, "data", "recipe-renders.json"));
  if ((manifest.renders || []).length) {
    const recipeQa = validateRecipeQaApproval(jobDir);
    if (!recipeQa.ok) throw new Error(`配方视觉审查未通过:\n- ${recipeQa.errors.join("\n- ")}`);
  }
  const renderById = new Map(manifest.renders.map((item) => [item.id, item]));
  const generated = [];
  for (const shot of plan.shots.filter((item) => item.mode === "recipe")) {
    const render = renderById.get(shot.id);
    if (!render) throw new Error(`recipe-renders.json 缺少 ${shot.id}`);
    const file = path.join(jobDir, render.output);
    if (!fs.existsSync(file)) throw new Error(`${shot.id}: 尚未渲染 ${render.output}`);
    const actualDuration = Number(durationProbe(file));
    if (Math.abs(actualDuration - render.expectedDuration) > EPSILON) {
      throw new Error(`${shot.id}: 渲染时长 ${actualDuration.toFixed(3)}s 与原配方 ${render.expectedDuration.toFixed(3)}s 不一致`);
    }
    generated.push({
      id: shot.id,
      kind: "demo-stage",
      start: Number(shot.start),
      end: Number(shot.end),
      src: render.output,
      sourceStart: 0,
      fit: "cover",
      includeAudio: true,
      speakerPip: shot.speaker.mode === "pip",
      pipPlacement: shot.speaker.placement || "bottom-right",
      transition: shot.transition || { type: "cut" },
      formats: ["landscape"],
      storyBeatId: shot.storyBeatId,
      intent: shot.intent,
      reason: shot.reason,
      generatedBy: GENERATED_BY,
      recipeId: shot.recipe.id,
      variant: shot.recipe.variant,
      sourceHash: sha256File(file)
    });
  }
  const target = path.join(jobDir, "data", "primary-clips.json");
  const existing = fs.existsSync(target) ? readJsonArray(target) : [];
  const preserved = existing.filter((item) => item.generatedBy !== GENERATED_BY);
  writeJson(target, [...preserved, ...generated].sort((a, b) => a.start - b.start));

  const assetById = new Map((context.automatic?.assets || []).map((asset) => [asset.id, asset]));
  const generatedBroll = plan.shots
    .filter((item) => item.mode === "broll")
    .map((shot) => compileBrollShot(jobDir, shot, assetById));
  const brollTarget = path.join(jobDir, "data", "broll.json");
  const existingBroll = fs.existsSync(brollTarget) ? readJsonArray(brollTarget) : [];
  const preservedBroll = existingBroll.filter((item) => item.generatedBy !== GENERATED_BY);
  writeJson(brollTarget, [...preservedBroll, ...generatedBroll].sort((a, b) => a.start - b.start));

  const report = {
    schemaVersion: 1,
    generatedBy: GENERATED_BY,
    compiledAt: new Date().toISOString(),
    plan: "data/visual-plan.json",
    recipeRenders: "data/recipe-renders.json",
    primaryClipIds: generated.map((item) => item.id),
    preservedPrimaryClipIds: preserved.map((item) => item.id),
    brollIds: generatedBroll.map((item) => item.id),
    preservedBrollIds: preservedBroll.map((item) => item.id)
  };
  writeJson(path.join(jobDir, "data", "visual-plan-compiled.json"), report);
  return report;
}

function compileBrollShot(jobDir, shot, assetById) {
  const asset = assetById.get(shot.assetRefs[0]);
  if (!asset) throw new Error(`${shot.id}: 缺少 B-roll 素材 ${shot.assetRefs[0]}`);
  const file = path.join(jobDir, asset.path);
  if (!fs.existsSync(file)) throw new Error(`${shot.id}: B-roll 素材不存在 ${asset.path}`);
  const floating = shot.placement === "split-left" || shot.placement === "split-right";
  const mode = floating
    ? "floating-frame"
    : shot.speaker.mode === "pip" ? "fullscreen-pip" : "fullscreen";
  return {
    id: shot.id,
    storyBeatId: shot.storyBeatId,
    start: Number(shot.start),
    end: Number(shot.end),
    src: asset.path,
    mode,
    ...(floating ? {
      placement: shot.placement === "split-left" ? "left" : "right",
      transition: "morph"
    } : {
      pipShape: shot.speaker.shape || "rounded",
      transition: shot.transition?.type || "fade"
    }),
    intent: shot.intent,
    reason: shot.reason,
    generatedBy: GENERATED_BY,
    assetId: asset.id,
    sourceHash: sha256File(file)
  };
}

function productionImplementationIndex(production) {
  const index = new Map();
  for (const family of production.families) {
    const implementation = family.implementation;
    if (!implementation) continue;
    for (const [recipeId, recipe] of Object.entries(implementation.recipes || {})) {
      index.set(recipeId, {
        family,
        entry: implementation.entry,
        composition: implementation.composition,
        fps: implementation.fps,
        recipe
      });
    }
  }
  return index;
}

function main(argv = process.argv.slice(2)) {
  const [command = "prepare", ...rest] = argv;
  const args = parseArgs(rest);
  const jobDir = resolveJob(args.job);
  if (command === "prepare") {
    const manifest = prepareRecipeRenders(jobDir);
    console.log(`已准备 ${manifest.renders.length} 个原生 Remotion 配方渲染任务`);
    return;
  }
  if (command !== "finalize") throw new Error(`未知命令 ${command}；可用 prepare/finalize`);
  const report = finalizeVisualPlan(jobDir);
  console.log(`视觉计划已编译: ${report.primaryClipIds.length} 个配方镜头 · ${report.brollIds.length} 个 B-roll`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
