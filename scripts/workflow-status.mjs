import fs from "node:fs";
import path from "node:path";

import { readJson, readJsonArray } from "./lib.mjs";
import { resolveWorkflowProfile } from "./workflow-profile.mjs";

const MEDIA_RE = /\.(mp4|mov|m4v|mkv|webm)$/i;

export function evaluateWorkflowStatus(jobDir) {
  const projectFile = path.join(jobDir, "project.json");
  if (!fs.existsSync(projectFile)) throw new Error(`缺少 project.json: ${projectFile}`);
  const project = readJson(projectFile);
  const profile = resolveWorkflowProfile(project);
  const targets = resolveTargets(jobDir, project);
  const gates = buildGates(jobDir, project, targets);
  const required = new Set(profile.requiredGates);
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
  return indexById([
    gate("source", "原片", sourceCount > 0, `${sourceCount} 条`),
    fileGate(jobDir, "writtenScript", "书面脚本", scriptPath, scriptPath ? scriptPath : "未声明"),
    fileGate(jobDir, "inventory", "素材清单", "data/source-inventory.json"),
    fileGate(jobDir, "transcript", "词级转录索引", "data/transcripts/index.json"),
    fileGate(jobDir, "editorTranscript", "编辑转录", "data/takes-packed.md"),
    fileGate(jobDir, "editorSignals", "编辑声学审计", "data/editor-signals.json"),
    arrayGate(jobDir, "edl", "语义 EDL", "data/rough-cut-edl.json", validateEdl),
    fileGate(jobDir, "aroll", "工作母版 A-roll", sourceVideo),
    fileGate(jobDir, "cutEvidence", "切点证据", "qa/cuts/report.json"),
    approvalGate(jobDir, "cutApproval", "切点批准", "qa/cuts/approval.json"),
    arrayGate(jobDir, "captions", "最终字幕", "data/captions.json"),
    optionalArrayGate(jobDir, "beats", "解释卡片", "data/beats.json"),
    optionalArrayGate(jobDir, "broll", "B-roll", "data/broll.json"),
    optionalArrayGate(jobDir, "primaryClips", "主展示轨", "data/primary-clips.json"),
    musicBedGate(jobDir),
    optionalArrayGate(jobDir, "audioCues", "短音效", "data/audio-cues.json"),
    targetGate("variantBuild", "目标构建", targets, (target) => fs.existsSync(path.join(target.dir, "index.html"))),
    targetGate("finalQa", "最终规格 QA", targets, (target) => reportPassed(path.join(target.dir, "qa", "report.json"))),
    targetGate("finalApproval", "最终画面批准", targets, (target) => fs.existsSync(path.join(target.dir, "qa", "approval.json"))),
    targetGate("audioQa", "最终音频 QA", targets, (target) => reportPassed(path.join(target.dir, "qa", "audio-report.json"))),
    targetGate("fullPlayback", "最终完整播放", targets, (target) => playbackPassed(path.join(target.dir, "qa", "approval.json")))
  ]);
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

function approvalGate(jobDir, id, name, relative) {
  const file = path.join(jobDir, relative);
  if (!fs.existsSync(file)) return gate(id, name, false, relative);
  try {
    const approval = readJson(file);
    const ok = Boolean(approval && typeof approval === "object" && !Array.isArray(approval));
    return gate(id, name, ok, approval.status || approval.approvedAt || relative);
  } catch (error) {
    return gate(id, name, false, error.message);
  }
}

function targetGate(id, name, targets, predicate) {
  const passed = targets.filter(predicate);
  return gate(id, name, targets.length > 0 && passed.length === targets.length, `${passed.length}/${targets.length} 份`);
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

function validateEdl(items) {
  return items.every((item) => typeof item?.reason === "string" && item.reason.trim());
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
