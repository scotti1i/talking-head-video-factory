import fs from "node:fs";
import path from "node:path";

import { sha256File } from "./color-management.mjs";
import {
  collectEditorialHashes,
  hashesMatch,
  validateEditorialPlan,
  validateTimelineContract
} from "./editorial-contract.mjs";
import { readJson, readJsonArray } from "./lib.mjs";
import { validateSemanticTakeMap } from "./semantic-take-map.mjs";
import { validateVisualContext } from "./visual-context.mjs";
import { validateVisualPlan } from "./visual-plan-contract.mjs";
import { loadRecipeRegistry } from "./visual-recipe-registry.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";
import { validateRecipeQaApproval } from "./visual-recipe-qa.mjs";
import { resolveWorkflowProfile } from "./workflow-profile.mjs";

const MEDIA_RE = /\.(mp4|mov|m4v|mkv|webm)$/i;

export function evaluateWorkflowStatus(jobDir) {
  const projectFile = path.join(jobDir, "project.json");
  if (!fs.existsSync(projectFile)) throw new Error(`缺少 project.json: ${projectFile}`);
  const project = readJson(projectFile);
  const profile = resolveWorkflowProfile(project);
  const targets = resolveTargets(jobDir, project);
  const gates = buildGates(jobDir, project, targets);
  const required = new Set([
    ...profile.requiredGates,
    ...(Number(project.visual?.operatingSystemVersion || 0) >= 1
      ? ["visualContext", "visualPlan", "visualRecipeQa", "visualCompile"]
      : [])
  ]);
  const checks = Object.values(gates).map((gate) => ({
    ...gate,
    required: required.has(gate.id)
  }));
  const unknownRequired = [...required].filter((id) => !gates[id]);
  if (unknownRequired.length) throw new Error(`profile ${profile.id} 引用了未知 gate: ${unknownRequired.join(", ")}`);
  const ready = checks.every((item) => !item.required || item.ok);
  return {
    job: jobDir,
    title: project.title || path.basename(jobDir),
    profile: {
      id: profile.id,
      label: profile.label,
      inferred: profile.inferred,
      editingMode: profile.editingMode
    },
    policies: profile.policies,
    targets,
    ready,
    checks
  };
}

function buildGates(jobDir, project, targets) {
  const sourceVideo = project.sourceVideo || "assets/aroll.mp4";
  const scriptPath = project.editorial?.writtenScript?.path;
  const sourceCount = fileCount(path.join(jobDir, "assets", "originals"), MEDIA_RE);
  const strictEditorial = Number(project.editorial?.contractVersion || 0) >= 1;
  return indexById([
    gate("source", "原片", sourceCount > 0, `${sourceCount} 条`),
    fileGate(jobDir, "writtenScript", "书面脚本", scriptPath, scriptPath ? scriptPath : "未声明"),
    fileGate(jobDir, "inventory", "素材清单", "data/source-inventory.json"),
    fileGate(jobDir, "transcript", "词级转录索引", "data/transcripts/index.json"),
    fileGate(jobDir, "editorTranscript", "编辑转录", "data/takes-packed.md"),
    editorSignalsGate(jobDir),
    semanticTakeMapGate(jobDir),
    editorialPlanGate(jobDir),
    editorialApprovalGate(jobDir),
    arrayGate(jobDir, "edl", "语义 EDL", "data/rough-cut-edl.json", (items) => validateEdl(items, strictEditorial)),
    fileGate(jobDir, "aroll", "工作母版 A-roll", sourceVideo),
    cutEvidenceGate(jobDir),
    cutApprovalGate(jobDir),
    arrayGate(jobDir, "captions", "最终字幕", "data/captions.json"),
    optionalArrayGate(jobDir, "beats", "解释卡片", "data/beats.json"),
    optionalArrayGate(jobDir, "broll", "B-roll", "data/broll.json"),
    optionalArrayGate(jobDir, "primaryClips", "主展示轨", "data/primary-clips.json"),
    visualContextGate(jobDir),
    visualPlanGate(jobDir),
    visualRecipeQaGate(jobDir),
    visualCompileGate(jobDir),
    visualContractGate(jobDir),
    musicBedGate(jobDir),
    optionalArrayGate(jobDir, "audioCues", "短音效", "data/audio-cues.json"),
    targetGate("variantBuild", "目标构建", targets, (target) => fs.existsSync(path.join(target.dir, "index.html"))),
    targetGate("finalQa", "最终规格 QA", targets, finalQaPassed),
    targetGate("finalApproval", "最终画面批准", targets, (target) => finalApprovalPassed(target, jobDir, strictEditorial)),
    targetGate("audioQa", "最终音频 QA", targets, (target) => reportPassed(path.join(target.dir, "qa", "audio-report.json"))),
    targetGate("fullPlayback", "最终完整播放", targets, (target) => playbackPassed(path.join(target.dir, "qa", "approval.json")))
  ]);
}

function visualRecipeQaGate(jobDir) {
  const planPath = path.join(jobDir, "data", "visual-plan.json");
  if (!fs.existsSync(planPath)) return gate("visualRecipeQa", "配方视觉审查", false, "data/visual-plan.json");
  try {
    const recipeCount = (readJson(planPath).shots || []).filter((item) => item.mode === "recipe").length;
    if (!recipeCount) return gate("visualRecipeQa", "配方视觉审查", true, "无需配方审查");
    const result = validateRecipeQaApproval(jobDir);
    return gate("visualRecipeQa", "配方视觉审查", result.ok, result.detail || result.errors[0]);
  } catch (error) {
    return gate("visualRecipeQa", "配方视觉审查", false, error.message);
  }
}

function visualContextGate(jobDir) {
  const file = path.join(jobDir, "data", "visual-context.json");
  if (!fs.existsSync(file)) return gate("visualContext", "视觉上下文", false, "data/visual-context.json");
  try {
    const result = validateVisualContext(readJson(file));
    const unresolved = readJson(file).gaps.filter((item) => item.status === "unresolved").length;
    return gate("visualContext", "视觉上下文", result.ok, result.ok ? `${unresolved} 个显式缺口` : result.errors[0]);
  } catch (error) {
    return gate("visualContext", "视觉上下文", false, error.message);
  }
}

function visualPlanGate(jobDir) {
  const required = [
    "data/visual-plan.json",
    "data/visual-context.json",
    "data/editorial-plan.json",
    "data/semantic-take-map.json",
    "data/rough-cut-edl.json"
  ];
  const missing = required.filter((relative) => !fs.existsSync(path.join(jobDir, relative)));
  if (missing.length) return gate("visualPlan", "视觉计划", false, missing[0]);
  try {
    const result = validateVisualPlan(readJson(path.join(jobDir, "data", "visual-plan.json")), {
      context: readJson(path.join(jobDir, "data", "visual-context.json")),
      editorialPlan: readJson(path.join(jobDir, "data", "editorial-plan.json")),
      semanticTakeMap: readJson(path.join(jobDir, "data", "semantic-take-map.json")),
      edl: readJsonArray(path.join(jobDir, "data", "rough-cut-edl.json")),
      registry: loadRecipeRegistry(),
      production: loadProductionCatalog()
    });
    return gate("visualPlan", "视觉计划", result.ok, result.ok ? `${result.shotCount} 个镜头` : result.errors[0]);
  } catch (error) {
    return gate("visualPlan", "视觉计划", false, error.message);
  }
}

function visualCompileGate(jobDir) {
  const planPath = path.join(jobDir, "data", "visual-plan.json");
  if (!fs.existsSync(planPath)) return gate("visualCompile", "视觉计划编译", false, "data/visual-plan.json");
  try {
    const plannedShots = readJson(planPath).shots;
    const recipeShots = plannedShots.filter((item) => item.mode === "recipe");
    const brollShots = plannedShots.filter((item) => item.mode === "broll");
    if (!recipeShots.length && !brollShots.length) return gate("visualCompile", "视觉计划编译", true, "无需视觉媒体编译");
    const compiledPath = path.join(jobDir, "data", "visual-plan-compiled.json");
    const primaryPath = path.join(jobDir, "data", "primary-clips.json");
    const brollPath = path.join(jobDir, "data", "broll.json");
    if (!fs.existsSync(compiledPath) || (recipeShots.length && !fs.existsSync(primaryPath)) || (brollShots.length && !fs.existsSync(brollPath))) {
      return gate("visualCompile", "视觉计划编译", false, "缺少 visual-plan-compiled.json 或对应执行轨");
    }
    const compiled = readJson(compiledPath);
    const primary = readJsonArray(primaryPath);
    const broll = readJsonArray(brollPath);
    const primaryById = new Map(primary.map((item) => [item.id, item]));
    const brollById = new Map(broll.map((item) => [item.id, item]));
    const recipeFailures = recipeShots.filter((shot) => {
      const item = primaryById.get(shot.id);
      if (!item || item.recipeId !== shot.recipe.id) return true;
      const file = path.join(jobDir, item.src || "");
      return !fs.existsSync(file) || item.sourceHash !== sha256File(file);
    });
    const brollFailures = brollShots.filter((shot) => {
      const item = brollById.get(shot.id);
      if (!item || item.assetId !== shot.assetRefs?.[0]) return true;
      const file = path.join(jobDir, item.src || "");
      return !fs.existsSync(file) || item.sourceHash !== sha256File(file);
    });
    const ok = recipeFailures.length === 0
      && brollFailures.length === 0
      && (compiled.primaryClipIds || []).length === recipeShots.length
      && (compiled.brollIds || []).length === brollShots.length;
    const detail = ok
      ? `${recipeShots.length} 个原生配方 · ${brollShots.length} 个 B-roll`
      : `${recipeFailures.length + brollFailures.length} 个视觉媒体未编译或已变化`;
    return gate("visualCompile", "视觉计划编译", ok, detail);
  } catch (error) {
    return gate("visualCompile", "视觉计划编译", false, error.message);
  }
}

function resolveTargets(jobDir, project) {
  const variants = Array.isArray(project.variants) ? project.variants : [];
  if (!variants.length) {
    return [{
      id: "main",
      label: project.title || "主成片",
      platform: project.platform || "unspecified",
      layout: project.layout || "unspecified",
      policies: Array.isArray(project.policies) ? project.policies : [],
      dir: jobDir,
      outputName: project.outputName || "final-60fps.mp4"
    }];
  }
  return variants.map((variant) => ({
    id: variant.id,
    label: variant.label || variant.id,
    platform: variant.platform || "unspecified",
    layout: variant.layout || "unspecified",
    policies: [...new Set([
      ...(Array.isArray(project.policies) ? project.policies : []),
      ...(Array.isArray(variant.policies) ? variant.policies : [])
    ])],
    dir: path.join(jobDir, "variants", variant.id),
    outputName: variant.outputName || `${variant.id}-60fps.mp4`
  }));
}

function musicBedGate(jobDir) {
  const relative = "data/music-bed.json";
  const file = path.join(jobDir, relative);
  if (!fs.existsSync(file)) return gate("musicBed", "连续 BGM", false, relative);
  try {
    const value = readJson(file);
    const asset = typeof value?.asset === "string" ? path.join(jobDir, value.asset) : null;
    const ok = Boolean(value?.id && asset && fs.existsSync(asset) && Number(value?.volume) >= 0 && Number(value?.volume) <= 1);
    return gate("musicBed", "连续 BGM", ok, ok ? value.asset : "合同或素材无效");
  } catch (error) {
    return gate("musicBed", "连续 BGM", false, error.message);
  }
}

function fileGate(jobDir, id, name, relative, detail = relative) {
  const ok = typeof relative === "string" && relative.length > 0 && fs.existsSync(path.join(jobDir, relative));
  return gate(id, name, ok, detail);
}

function arrayGate(jobDir, id, name, relative, validate = () => true) {
  const file = path.join(jobDir, relative);
  try {
    const items = readJsonArray(file);
    const ok = items.length > 0 && validate(items);
    return gate(id, name, ok, `${items.length} 条`);
  } catch (error) {
    return gate(id, name, false, error.message);
  }
}

function optionalArrayGate(jobDir, id, name, relative) {
  return { ...arrayGate(jobDir, id, name, relative), optional: true };
}

function editorialPlanGate(jobDir) {
  const planPath = path.join(jobDir, "data", "editorial-plan.json");
  const semanticPath = path.join(jobDir, "data", "semantic-take-map.json");
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  if (!fs.existsSync(planPath)) return gate("editorialPlan", "内容结构计划", false, "data/editorial-plan.json");
  try {
    const editorialPlan = readJson(planPath);
    const semanticTakeMap = readJson(semanticPath);
    const edl = readJsonArray(edlPath);
    const plan = validateEditorialPlan(editorialPlan, { semanticTakeMap });
    const timeline = validateTimelineContract({ editorialPlan, semanticTakeMap, edl, stage: "edl" });
    const errors = [...plan.errors, ...timeline.errors];
    return gate(
      "editorialPlan",
      "内容结构计划",
      errors.length === 0,
      errors.length ? errors[0] : `${plan.storyBeatCount} 个结构段 · ${timeline.linkedSegmentCount} 个 EDL 段`
    );
  } catch (error) {
    return gate("editorialPlan", "内容结构计划", false, error.message);
  }
}

function editorialApprovalGate(jobDir) {
  const reportPath = path.join(jobDir, "qa", "editorial", "report.json");
  const approvalPath = path.join(jobDir, "qa", "editorial", "approval.json");
  if (!fs.existsSync(reportPath) || !fs.existsSync(approvalPath)) {
    return gate("editorialApproval", "内容计划复核", false, "qa/editorial/report.json + approval.json");
  }
  try {
    const report = readJson(reportPath);
    const approval = readJson(approvalPath);
    const hashes = collectEditorialHashes(jobDir, "plan");
    const ok = report.schemaVersion === 1
      && report.stage === "plan"
      && report.status === "passed"
      && approval.schemaVersion === 1
      && approval.status === "approved"
      && approval.reportHash === sha256File(reportPath)
      && hashesMatch(report.hashes, hashes)
      && hashesMatch(approval.hashes, hashes);
    return gate("editorialApproval", "内容计划复核", ok, ok ? `${approval.reviewer} · ${approval.method}` : "计划或上游证据变化，旧批准已失效");
  } catch (error) {
    return gate("editorialApproval", "内容计划复核", false, error.message);
  }
}

function visualContractGate(jobDir) {
  const reportPath = path.join(jobDir, "qa", "visual", "report.json");
  if (!fs.existsSync(reportPath)) return gate("visualContract", "视觉语义引用", false, "qa/visual/report.json");
  try {
    const report = readJson(reportPath);
    const hashes = collectEditorialHashes(jobDir, "visual");
    const ok = report.schemaVersion === 1
      && report.stage === "visual"
      && report.status === "passed"
      && !report.failures?.length
      && hashesMatch(report.hashes, hashes);
    return gate("visualContract", "视觉语义引用", ok, ok ? `${report.counts.storyBeats} 个结构段` : "字幕/视觉数据变化，需重跑 visual:check");
  } catch (error) {
    return gate("visualContract", "视觉语义引用", false, error.message);
  }
}

function cutApprovalGate(jobDir) {
  const approvalPath = path.join(jobDir, "qa", "cuts", "approval.json");
  const reportPath = path.join(jobDir, "qa", "cuts", "report.json");
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  const semanticPath = path.join(jobDir, "data", "semantic-take-map.json");
  const planPath = path.join(jobDir, "data", "editorial-plan.json");
  const editorialApprovalPath = path.join(jobDir, "qa", "editorial", "approval.json");
  const signalsPath = path.join(jobDir, "data", "editor-signals.json");
  const listeningPath = path.join(jobDir, "qa", "cuts", "listening-review.json");
  if (![approvalPath, reportPath, edlPath, semanticPath, signalsPath, listeningPath].every(fs.existsSync)) {
    return gate("cutApproval", "切点批准", false, "切点批准或当前证据缺失");
  }
  try {
    const approval = readJson(approvalPath);
    const report = readJson(reportPath);
    const videoPath = path.resolve(jobDir, report.video || "");
    const ok = approval.schemaVersion === 2
      && approval.status === "approved"
      && approval.reportHash === sha256File(reportPath)
      && approval.edlHash === sha256File(edlPath)
      && approval.semanticTakeMapHash === sha256File(semanticPath)
      && approval.editorSignalsHash === sha256File(signalsPath)
      && approval.listeningReviewHash === sha256File(listeningPath)
      && (!fs.existsSync(planPath) || approval.editorialPlanHash === sha256File(planPath))
      && (!fs.existsSync(planPath) || (
        fs.existsSync(editorialApprovalPath)
        && approval.editorialApprovalHash === sha256File(editorialApprovalPath)
      ))
      && fs.existsSync(videoPath)
      && approval.videoHash === sha256File(videoPath);
    return gate("cutApproval", "切点批准", ok, ok ? approval.reviewer : "EDL、计划、粗剪或听审证据变化，旧批准已失效");
  } catch (error) {
    return gate("cutApproval", "切点批准", false, error.message);
  }
}

function cutEvidenceGate(jobDir) {
  const relative = "qa/cuts/report.json";
  const file = path.join(jobDir, relative);
  if (!fs.existsSync(file)) return gate("cutEvidence", "切点证据", false, relative);
  try {
    const report = readJson(file);
    const validCuts = Array.isArray(report.cuts) && report.cuts.every((cut) =>
      typeof cut?.image === "string"
      && typeof cut?.reviewClip === "string"
      && typeof cut?.reviewClipHash === "string"
    );
    const ok = report.schemaVersion === 2
      && typeof report.edlHash === "string"
      && typeof report.videoHash === "string"
      && validCuts;
    return gate("cutEvidence", "切点证据", ok, ok ? `${report.cuts.length} 个带声音切点片` : "旧版证据缺少带声音审听片");
  } catch (error) {
    return gate("cutEvidence", "切点证据", false, error.message);
  }
}

function editorSignalsGate(jobDir) {
  const relative = "data/editor-signals.json";
  const file = path.join(jobDir, relative);
  if (!fs.existsSync(file)) return gate("editorSignals", "编辑声学审计", false, relative);
  try {
    const report = readJson(file);
    const ok = report.version === 2
      && report.policy?.cutBoundaryPolicy === "inside-real-silence-v2"
      && Array.isArray(report.sources);
    return gate("editorSignals", "编辑声学审计", ok, ok ? "真实静音区边界策略 v2" : "旧版 0.3s 邻近静音策略已失效");
  } catch (error) {
    return gate("editorSignals", "编辑声学审计", false, error.message);
  }
}

function semanticTakeMapGate(jobDir) {
  const relative = "data/semantic-take-map.json";
  const file = path.join(jobDir, relative);
  const edlFile = path.join(jobDir, "data", "rough-cut-edl.json");
  if (!fs.existsSync(file)) return gate("semanticTakeMap", "完整表达选段", false, relative);
  try {
    const value = readJson(file);
    const edl = readJsonArray(edlFile);
    const result = validateSemanticTakeMap(value, edl);
    return gate(
      "semanticTakeMap",
      "完整表达选段",
      result.ok,
      result.ok ? `${result.coveredCount}/${edl.length} 段完整覆盖` : result.errors[0]
    );
  } catch (error) {
    return gate("semanticTakeMap", "完整表达选段", false, error.message);
  }
}

function targetGate(id, name, targets, predicate) {
  const passed = targets.filter(predicate);
  return gate(id, name, targets.length > 0 && passed.length === targets.length, `${passed.length}/${targets.length} 份`);
}

function finalQaPassed(target) {
  const reportPath = path.join(target.dir, "qa", "report.json");
  const videoPath = path.join(target.dir, "renders", target.outputName);
  if (!fs.existsSync(reportPath) || !fs.existsSync(videoPath)) return false;
  try {
    const report = readJson(reportPath);
    return report.schemaVersion === 2
      && !report.failures?.length
      && report.videoHash === sha256File(videoPath)
      && hashesMatch(report.editorialHashes, collectEditorialHashes(target.dir, "visual"));
  } catch {
    return false;
  }
}

function finalApprovalPassed(target, rootJobDir, strictEditorial) {
  const reportPath = path.join(target.dir, "qa", "report.json");
  const approvalPath = path.join(target.dir, "qa", "approval.json");
  const videoPath = path.join(target.dir, "renders", target.outputName);
  if (![reportPath, approvalPath, videoPath].every(fs.existsSync)) return false;
  try {
    const approval = readJson(approvalPath);
    const visualReportPath = path.join(rootJobDir, "qa", "visual", "report.json");
    const visualReportValid = !strictEditorial || (
      fs.existsSync(visualReportPath)
      && approval.visualReportHash === sha256File(visualReportPath)
    );
    return approval.schemaVersion === 2
      && ["frames_approved_playback_pending", "publish_ready"].includes(approval.status)
      && approval.reportHash === sha256File(reportPath)
      && approval.videoHash === sha256File(videoPath)
      && hashesMatch(approval.editorialHashes, collectEditorialHashes(target.dir, "visual"))
      && visualReportValid;
  } catch {
    return false;
  }
}

function reportPassed(file) {
  if (!fs.existsSync(file)) return false;
  try {
    const report = readJson(file);
    if (report.status === "failed") return false;
    return !Array.isArray(report.failures) || report.failures.length === 0;
  } catch {
    return false;
  }
}

function playbackPassed(file) {
  if (!fs.existsSync(file)) return false;
  try {
    const approval = readJson(file);
    return approval.fullPlayback === true || approval.status === "publish_ready";
  } catch {
    return false;
  }
}

function validateEdl(items, strict = false) {
  return items.every((item) => typeof item?.reason === "string"
    && item.reason.trim()
    && (!strict || (
      typeof item?.id === "string" && item.id.trim()
      && typeof item?.storyBeatId === "string" && item.storyBeatId.trim()
      && typeof item?.takeId === "string" && item.takeId.trim()
    )));
}

function fileCount(dir, pattern) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((name) => pattern.test(name)).length;
}

function gate(id, name, ok, detail) {
  return { id, name, ok: Boolean(ok), detail };
}

function indexById(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
