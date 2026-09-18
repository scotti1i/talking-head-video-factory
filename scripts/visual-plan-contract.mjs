import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateTimelineContract } from "./editorial-contract.mjs";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";
import { loadRecipeRegistry } from "./visual-recipe-registry.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";
import { validateVisualContext } from "./visual-context.mjs";

const MODES = new Set(["face", "recipe", "broll"]);
const PLACEMENTS = new Set(["fullscreen", "split-left", "split-right", "pip", "background", "transition"]);
const SPEAKER_MODES = new Set(["full", "split", "pip", "hidden"]);

export function validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production }) {
  const errors = [];
  const contextResult = validateVisualContext(context);
  errors.push(...contextResult.errors.map((error) => `visual-context: ${error}`));
  if (plan?.schemaVersion !== 1) errors.push("visual-plan.json schemaVersion 必须为 1");
  if (plan?.registry?.id !== registry.id) errors.push(`registry.id 必须是 ${registry.id}`);
  if (plan?.registry?.revision !== registry.source.revision) errors.push("registry.revision 与当前武器库不一致");
  if (!Array.isArray(plan?.shots)) errors.push("shots 必须是数组");
  const timeline = validateTimelineContract({ editorialPlan, semanticTakeMap, edl, stage: "edl" });
  errors.push(...timeline.errors.map((error) => `EDL: ${error}`));
  const storyIds = new Set(editorialPlan.storyBeats.map((item) => item.id));
  const recipeById = new Map(registry.recipes.map((item) => [item.id, item]));
  const productionById = new Map(production.families.flatMap((family) =>
    family.recipeIds.map((id) => [id, {family, recipe: family.implementation?.recipes?.[id]}])
  ));
  const assetIds = new Set((context.automatic?.assets || []).map((asset) => asset.id));
  const assetById = new Map((context.automatic?.assets || []).map((asset) => [asset.id, asset]));
  const unresolved = context.gaps.filter((gap) => gap.status === "unresolved");
  const ids = new Set();

  for (const [index, shot] of (plan.shots || []).entries()) {
    const label = `shots[${index}]`;
    const id = String(shot?.id || "").trim();
    if (!id) errors.push(`${label}.id 不能为空`);
    else if (ids.has(id)) errors.push(`${label}.id 重复: ${id}`);
    else ids.add(id);
    if (!storyIds.has(shot?.storyBeatId)) errors.push(`${label}.storyBeatId 无效: ${shot?.storyBeatId || "_"}`);
    if (!MODES.has(shot?.mode)) errors.push(`${label}.mode 必须是 face/recipe/broll`);
    requireText(shot?.intent, `${label}.intent`, errors);
    requireText(shot?.reason, `${label}.reason`, errors);
    validateTime(shot, label, timeline.timelineRanges, errors);
    if (!PLACEMENTS.has(shot?.placement)) errors.push(`${label}.placement 无效`);
    if (!SPEAKER_MODES.has(shot?.speaker?.mode)) errors.push(`${label}.speaker.mode 无效`);
    if (!Array.isArray(shot?.contextEvidence)) errors.push(`${label}.contextEvidence 必须是数组`);
    else for (const ref of shot.contextEvidence) if (!contextResult.evidenceIds.has(ref)) errors.push(`${label}.contextEvidence 无效: ${ref}`);
    if (!Array.isArray(shot?.assetRefs)) errors.push(`${label}.assetRefs 必须是数组`);
    else for (const ref of shot.assetRefs) if (!assetIds.has(ref)) errors.push(`${label}.assetRefs 无效: ${ref}`);
    if (["pip", "split"].includes(shot?.speaker?.mode)) {
      const hasFaceSafety = [...contextResult.evidenceById.values()].some((evidence) => evidence.supports.has("face-safe-layout"));
      if (!hasFaceSafety) errors.push(`${label}: speaker.mode=${shot.speaker.mode} 缺少实测 face-safe-layout；应先完成人脸分析或回退 full`);
    }
    if (shot.mode === "recipe") validateRecipeShot(shot, label, recipeById, productionById, context.automatic?.format, unresolved, contextResult.evidenceById, errors);
    if (shot.mode === "broll") validateBrollShot(shot, label, assetById, unresolved, errors);
    if (shot.mode === "face" && shot.recipe != null) errors.push(`${label}: face 模式不允许 recipe`);
    if (shot.mode !== "face" && !(Number(shot?.confidence) >= 0 && Number(shot?.confidence) <= 1)) {
      errors.push(`${label}.confidence 必须在 0–1`);
    }
  }
  validateVisualCoverage(plan?.shots || [], timeline.timelineRanges, errors);
  return { ok: errors.length === 0, errors, shotCount: plan?.shots?.length || 0 };
}

export function runVisualPlanQa(jobDir) {
  const plan = readJson(path.join(jobDir, "data", "visual-plan.json"));
  const context = readJson(path.join(jobDir, "data", "visual-context.json"));
  const editorialPlan = readJson(path.join(jobDir, "data", "editorial-plan.json"));
  const semanticTakeMap = readJson(path.join(jobDir, "data", "semantic-take-map.json"));
  const edl = readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json"));
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const result = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  const report = {
    schemaVersion: 1,
    status: result.ok ? "passed" : "failed",
    checkedAt: new Date().toISOString(),
    registryRevision: registry.source.revision,
    shotCount: result.shotCount,
    failures: result.errors
  };
  writeJson(path.join(jobDir, "qa", "visual-plan", "report.json"), report);
  return report;
}

function validateRecipeShot(shot, label, recipeById, productionById, format, unresolved, evidenceById, errors) {
  const recipeId = String(shot?.recipe?.id || "");
  const recipe = recipeById.get(recipeId);
  if (!recipe) {
    errors.push(`${label}.recipe.id 未注册: ${recipeId || "_"}`);
    return;
  }
  const production = productionById.get(recipeId);
  if (!production) errors.push(`${label}.recipe.id 尚未进入生产许可: ${recipeId}`);
  if (format && production && !production.family.formats?.includes(format)) {
    errors.push(`${label}.recipe.id=${recipeId} 未验证 ${format} 画幅；当前只允许 ${(production.family.formats || []).join("/")}`);
  }
  if (shot.placement !== "fullscreen") errors.push(`${label}: 直接移植配方当前只支持 fullscreen placement`);
  if (!["pip", "hidden"].includes(shot.speaker?.mode)) errors.push(`${label}: fullscreen 配方的 speaker.mode 只能是 pip/hidden`);
  if (!recipe.visualJobs.includes(shot.visualJob)) errors.push(`${label}.visualJob=${shot.visualJob || "_"} 不属于 ${recipeId} 的能力范围`);
  const variant = recipe.variants.find((item) => item.id === shot.recipe.variant);
  if (!variant) errors.push(`${label}.recipe.variant 无效: ${shot.recipe.variant || "_"}`);
  validateAdaptation(shot, label, errors);
  const coverage = shot.requirementCoverage || {};
  for (const requirement of recipe.requirementsByJob?.[shot.visualJob] || []) {
    const ref = coverage[requirement];
    if (!ref) errors.push(`${label}.requirementCoverage 缺少 ${requirement}`);
    else if (!evidenceById.has(ref)) errors.push(`${label}.requirementCoverage.${requirement} 无效: ${ref}`);
    else if (!evidenceById.get(ref).supports.has(requirement)) {
      errors.push(`${label}.requirementCoverage.${requirement}: ${ref} 不具备该证据能力`);
    }
    if (ref && !shot.contextEvidence.includes(ref)) errors.push(`${label}.contextEvidence 必须包含 requirementCoverage 使用的 ${ref}`);
  }
  const blocking = unresolved.filter((gap) => (gap.storyBeatId == null || gap.storyBeatId === shot.storyBeatId) && gap.blockingFor.includes("recipe"));
  for (const gap of blocking) errors.push(`${label} 被未解决上下文缺口阻塞: ${gap.id}(${gap.need})；应研究/询问或回退 face`);
}

function validateAdaptation(shot, label, errors) {
  const adaptation = shot?.recipe?.adaptation || { mode: "upstream-original" };
  if (!["upstream-original", "direct-port"].includes(adaptation.mode)) {
    errors.push(`${label}.recipe.adaptation.mode 只能是 upstream-original/direct-port`);
    return;
  }
  if (adaptation.mode === "upstream-original") {
    errors.push(`${label}: upstream-original 只允许基准预览，生产视觉计划必须使用 direct-port 传入真实内容`);
    return;
  }
  const props = adaptation.props;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    errors.push(`${label}.recipe.adaptation.props 必须是对象`);
    return;
  }
  if (shot.recipe.id === "shotcraft/list-stack-press") {
    validateListStackProps(props, label, errors);
    return;
  }
  if (shot.recipe.id === "shotcraft/row-embed") {
    validateRowEmbedProps(props, label, errors);
    return;
  }
  if (shot.recipe.id !== "shotcraft/paper-title-card") {
    errors.push(`${label}: ${shot.recipe.id} 尚未登记直接移植参数接口`);
    return;
  }
  const allowedKeys = new Set(["words", "sub", "subDigits", "fontFamily"]);
  for (const key of Object.keys(props)) {
    if (!allowedKeys.has(key)) errors.push(`${label}.recipe.adaptation.props.${key} 未获授权；直接移植不允许视觉样式参数`);
  }
  if (!Array.isArray(props.words) || !props.words.length) {
    errors.push(`${label}.recipe.adaptation.props.words 不能为空`);
  } else {
    let accents = 0;
    for (const [index, word] of props.words.entries()) {
      requireText(word?.text, `${label}.recipe.adaptation.props.words[${index}].text`, errors);
      if (word?.accent === true) accents += 1;
      for (const key of Object.keys(word || {})) {
        if (!["text", "accent"].includes(key)) errors.push(`${label}.recipe.adaptation.props.words[${index}].${key} 未获授权`);
      }
    }
    if (accents > 1) errors.push(`${label}: PaperTitleCard 只允许一个原生强调词`);
  }
  if (props.fontFamily != null && props.fontFamily !== "Songti SC, STSong, serif") {
    errors.push(`${label}.recipe.adaptation.props.fontFamily 必须使用已登记中文宋体栈`);
  }
}

function validateBrollShot(shot, label, assetById, unresolved, errors) {
  if (shot.recipe != null) errors.push(`${label}: broll 模式不允许 recipe`);
  if (!Array.isArray(shot.assetRefs) || shot.assetRefs.length !== 1) {
    errors.push(`${label}: broll 必须且只能引用一个 assetRefs 素材`);
    return;
  }
  const asset = assetById.get(shot.assetRefs[0]);
  if (!asset) return;
  if (!['image', 'video'].includes(asset.type)) errors.push(`${label}: broll 素材必须是 image/video`);
  if (!String(asset.path || '').trim()) errors.push(`${label}: broll 素材缺少本地 path`);
  if (!asset.rights || asset.rights === 'unknown') errors.push(`${label}: broll 素材版权状态未知`);

  const duration = Number(shot.end) - Number(shot.start);
  if (Number(shot.start) < 3) errors.push(`${label}: 前 3 秒默认禁止 B-roll；应保留人物或使用已批准的开场配方`);
  if (duration > 10.001) errors.push(`${label}: B-roll 单段不能超过 10 秒`);

  const isImage = asset.type === 'image';
  const speakerMode = shot.speaker?.mode;
  const placement = shot.placement;
  const supported = (
    placement === 'fullscreen' && ['pip', 'hidden'].includes(speakerMode)
  ) || (
    isImage && ['split-left', 'split-right'].includes(placement) && speakerMode === 'full'
  );
  if (!supported) {
    errors.push(`${label}: broll 只支持 fullscreen+speaker(pip/hidden)，或静态图 split-left/right+speaker(full)`);
  }
  const transition = shot.transition?.type;
  if (transition != null) {
    const allowed = placement === 'fullscreen' ? ['fade', 'cut'] : ['morph'];
    if (!allowed.includes(transition)) errors.push(`${label}.transition.type 只能是 ${allowed.join('/')}`);
  }
  const blocking = unresolved.filter((gap) => (gap.storyBeatId == null || gap.storyBeatId === shot.storyBeatId) && gap.blockingFor.includes('broll'));
  for (const gap of blocking) errors.push(`${label} 被未解决上下文缺口阻塞: ${gap.id}(${gap.need})；应研究/询问或回退 face`);
}

function validateVisualCoverage(shots, timelineRanges, errors) {
  const mediaShots = shots
    .filter((shot) => shot?.mode === 'recipe' || shot?.mode === 'broll')
    .map((shot) => ({ id: shot.id || '?', mode: shot.mode, start: Number(shot.start), end: Number(shot.end) }))
    .filter((shot) => Number.isFinite(shot.start) && Number.isFinite(shot.end))
    .sort((a, b) => a.start - b.start);
  for (let index = 0; index < mediaShots.length - 1; index += 1) {
    const current = mediaShots[index];
    const next = mediaShots[index + 1];
    if (next.start < current.end - 0.01) errors.push(`视觉主轨重叠: ${current.id} 与 ${next.id}`);
  }
  const duration = Math.max(0, ...timelineRanges.map((range) => Number(range.outputEnd) || 0));
  const brollDuration = mediaShots
    .filter((shot) => shot.mode === 'broll')
    .reduce((sum, shot) => sum + Math.max(0, shot.end - shot.start), 0);
  if (duration > 0 && brollDuration / duration > 0.25 + 0.0001) {
    errors.push(`B-roll 总占比 ${(brollDuration / duration * 100).toFixed(1)}% 超过 25%`);
  }
}

function validateListStackProps(props, label, errors) {
  validateKeys(props, new Set(["title", "kicker", "counterLabel", "items", "fontFamily"]), `${label}.recipe.adaptation.props`, errors);
  requireText(props.title, `${label}.recipe.adaptation.props.title`, errors);
  if (props.kicker != null) requireText(props.kicker, `${label}.recipe.adaptation.props.kicker`, errors);
  if (props.counterLabel != null) requireText(props.counterLabel, `${label}.recipe.adaptation.props.counterLabel`, errors);
  validateFont(props, label, errors);
  if (!Array.isArray(props.items) || props.items.length < 3 || props.items.length > 5) {
    errors.push(`${label}.recipe.adaptation.props.items 必须有 3–5 项；少于 3 项不能支撑上游五段跟随镜头`);
    return;
  }
  props.items.forEach((item, index) => {
    const itemLabel = `${label}.recipe.adaptation.props.items[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${itemLabel} 必须是对象`);
      return;
    }
    validateKeys(item, new Set(["title", "meta"]), itemLabel, errors);
    requireText(item.title, `${itemLabel}.title`, errors);
    if (item.meta != null) requireText(item.meta, `${itemLabel}.meta`, errors);
  });
}

function validateRowEmbedProps(props, label, errors) {
  validateKeys(props, new Set(["title", "kicker", "rows", "fontFamily"]), `${label}.recipe.adaptation.props`, errors);
  requireText(props.title, `${label}.recipe.adaptation.props.title`, errors);
  if (props.kicker != null) requireText(props.kicker, `${label}.recipe.adaptation.props.kicker`, errors);
  validateFont(props, label, errors);
  if (!Array.isArray(props.rows) || props.rows.length < 2 || props.rows.length > 5) {
    errors.push(`${label}.recipe.adaptation.props.rows 必须有 2–5 行`);
    return;
  }
  props.rows.forEach((row, index) => {
    const rowLabel = `${label}.recipe.adaptation.props.rows[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${rowLabel} 必须是对象`);
      return;
    }
    validateKeys(row, new Set(["label", "value"]), rowLabel, errors);
    requireText(row.label, `${rowLabel}.label`, errors);
    if (row.value != null) requireText(row.value, `${rowLabel}.value`, errors);
  });
}

function validateFont(props, label, errors) {
  if (props.fontFamily != null && props.fontFamily !== "Songti SC, STSong, serif") {
    errors.push(`${label}.recipe.adaptation.props.fontFamily 必须使用已登记中文宋体栈`);
  }
}

function validateKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) errors.push(`${label}.${key} 未获授权；直接移植不允许视觉样式参数`);
  }
}

function validateTime(shot, label, ranges, errors) {
  const start = Number(shot?.start);
  const end = Number(shot?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    errors.push(`${label}.start/end 无效`);
    return;
  }
  const matching = ranges.filter((range) => range.storyBeatId === shot.storyBeatId);
  if (!matching.some((range) => start < range.outputEnd - 0.001 && end > range.outputStart + 0.001)) {
    errors.push(`${label} 时间没有覆盖 storyBeatId=${shot.storyBeatId} 的输出区间`);
  }
}

function requireText(value, label, errors) {
  if (!String(value || "").trim()) errors.push(`${label} 不能为空`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = runVisualPlanQa(resolveJob(args.job));
  if (report.status !== "passed") {
    console.error(`视觉计划门禁失败:\n- ${report.failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`视觉计划门禁通过: ${report.shotCount} 镜头 · registry ${report.registryRevision}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
