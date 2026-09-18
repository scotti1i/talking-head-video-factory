import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateTimelineContract } from "./editorial-contract.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";
import { validateVisualPlan } from "./visual-plan-contract.mjs";
import { loadRecipeRegistry } from "./visual-recipe-registry.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";

export function buildSafeVisualPlan(jobDir) {
  const editorialPlan = readJson(path.join(jobDir, "data", "editorial-plan.json"));
  const semanticTakeMap = readJson(path.join(jobDir, "data", "semantic-take-map.json"));
  const edl = readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json"));
  const context = readJson(path.join(jobDir, "data", "visual-context.json"));
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const timeline = validateTimelineContract({ editorialPlan, semanticTakeMap, edl, stage: "edl" });
  if (!timeline.ok) throw new Error(`无法初始化视觉计划:\n- ${timeline.errors.join("\n- ")}`);
  const storyById = new Map(editorialPlan.storyBeats.map((beat) => [beat.id, beat]));
  const shots = timeline.timelineRanges.map((range) => {
    const story = storyById.get(range.storyBeatId);
    const wantsVisual = story?.visualRole && !["face", "none"].includes(story.visualRole);
    return {
      id: `face-${range.id}`,
      storyBeatId: range.storyBeatId,
      start: range.outputStart,
      end: range.outputEnd,
      mode: "face",
      visualJob: "emphasis",
      intent: "保持说话人作为默认主画面",
      reason: wantsVisual
        ? "先建立安全基线；只有上下文与生产武器同时满足时才增加视觉镜头"
        : "本段人物表达已经足够，不额外制造信息层",
      placement: "fullscreen",
      speaker: { mode: "full" },
      contextEvidence: ["automatic:captions"],
      assetRefs: []
    };
  });
  const plan = {
    schemaVersion: 1,
    createdBy: { name: "talkinghead-edit", method: "safe-face-baseline" },
    policy: {
      default: "face",
      addVisualOnlyWhen: "verified-context-and-production-weapon",
      unresolvedFallback: "face"
    },
    registry: { id: registry.id, revision: registry.source.revision },
    shots
  };
  const validated = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  if (!validated.ok) throw new Error(`安全视觉计划未通过:\n- ${validated.errors.join("\n- ")}`);
  return plan;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const output = path.join(jobDir, "data", "visual-plan.json");
  if (fs.existsSync(output) && !args.force) {
    throw new Error(`${output} 已存在；为保护人工视觉决策，只有明确 --force 才能重建`);
  }
  const plan = buildSafeVisualPlan(jobDir);
  writeJson(output, plan);
  console.log(`安全视觉计划已生成: ${output}`);
  console.log(`${plan.shots.length} 个 EDL 段全部以人物画面为基线；现在只增加有证据的配方或 B-roll`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
