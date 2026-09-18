import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";

const EVIDENCE_VISUAL_ROLES = new Set(["evidence", "explanation", "atmosphere"]);
export const EVIDENCE_CAPABILITIES = new Set([
  "approved-opening-claim",
  "real-source-asset",
  "source-provenance",
  "highlight-target",
  "approved-term",
  "plain-language-definition",
  "verified-data",
  "unit",
  "comparable-before-after-assets",
  "comparison-basis",
  "named-entities",
  "verified-relationship",
  "ordered-steps",
  "causal-or-sequential-basis",
  "ordered-items",
  "verbatim-or-approved-claim",
  "adjacent-shot-motion",
  "approved-cta",
  "semantic-model",
  "semantic-fit",
  "visual-style-approval",
  "face-safe-layout",
  "asset-rights"
]);

const RESOLVER_PREFIX = {
  "agent-research": "research:",
  "tool-analysis": "analysis:",
  user: "user:"
};

export function buildVisualContext(jobDir) {
  const project = readJson(path.join(jobDir, "project.json"));
  const editorialPlan = readJson(path.join(jobDir, "data", "editorial-plan.json"));
  const captions = readJsonArray(path.join(jobDir, "data", "captions.json"));
  const context = {
    schemaVersion: 1,
    job: path.basename(jobDir),
    createdAt: new Date().toISOString(),
    policy: {
      transcriptIsContextNotVisualTruth: true,
      unresolvedFallback: "face",
      fabricatedEvidence: "forbidden"
    },
    automatic: {
      title: project.title || path.basename(jobDir),
      profile: project.profile || "clean-talkinghead",
      format: resolveFormat(project),
      sourceVideo: project.sourceVideo || "assets/aroll.mp4",
      writtenScript: resolveWrittenScript(jobDir, project),
      transcriptIndex: optionalFile(jobDir, "data/transcripts/index.json"),
      sourceInventory: optionalFile(jobDir, "data/source-inventory.json"),
      faceAnalysis: optionalFile(jobDir, "data/face-analysis.json"),
      assets: scanAssets(jobDir)
    },
    storyBeats: editorialPlan.storyBeats.map((beat) => ({
      id: beat.id,
      role: beat.role,
      claim: beat.claim,
      purpose: beat.purpose,
      visualRole: beat.visualRole,
      visualReason: beat.visualReason || null,
      captionRefs: captions.filter((caption) => caption.storyBeatId === beat.id).map((caption) => caption.id).filter(Boolean)
    })),
    analysis: [],
    research: [],
    userInputs: [],
    gaps: buildGaps(editorialPlan.storyBeats, project, jobDir)
  };
  return context;
}

export function validateVisualContext(context) {
  const errors = [];
  if (context?.schemaVersion !== 1) errors.push("visual-context.json schemaVersion 必须为 1");
  if (!Array.isArray(context?.storyBeats) || !context.storyBeats.length) errors.push("storyBeats 不能为空");
  for (const field of ["analysis", "research", "userInputs", "gaps"]) {
    if (!Array.isArray(context?.[field])) errors.push(`${field} 必须是数组`);
  }
  const evidenceById = new Map();
  addEvidence(evidenceById, "automatic:project", "automatic", []);
  addEvidence(evidenceById, "automatic:transcript", "automatic", ["verbatim-or-approved-claim"]);
  addEvidence(evidenceById, "automatic:captions", "automatic", ["approved-opening-claim", "verbatim-or-approved-claim", "approved-cta"]);
  if (context?.automatic?.faceAnalysis) addEvidence(evidenceById, "automatic:face-analysis", "automatic", ["face-safe-layout"]);
  for (const asset of context?.automatic?.assets || []) {
    const reviewed = asset?.rights && asset.rights !== "unknown" && asset?.provenance && asset.provenance !== "local-unreviewed";
    addEvidence(evidenceById, `asset:${asset.id}`, "asset", reviewed ? ["real-source-asset", "source-provenance", "asset-rights"] : []);
  }
  for (const item of context?.research || []) {
    if (!item?.id) errors.push("research 条目缺少 id");
    if (item?.status !== "verified") errors.push(`research:${item?.id || "?"} 未 verified`);
    if (!Array.isArray(item?.sources) || !item.sources.length) errors.push(`research:${item?.id || "?"} 缺少 sources`);
    const supports = validateSupports(item?.supports, `research:${item?.id || "?"}`, "research", errors);
    if (item?.id) addEvidence(evidenceById, `research:${item.id}`, "research", supports, errors);
  }
  for (const item of context?.userInputs || []) {
    if (!item?.id) errors.push("userInputs 条目缺少 id");
    if (item?.status !== "approved") errors.push(`user:${item?.id || "?"} 未 approved`);
    const supports = validateSupports(item?.supports, `user:${item?.id || "?"}`, "user", errors);
    if (item?.id) addEvidence(evidenceById, `user:${item.id}`, "user", supports, errors);
  }
  for (const item of context?.analysis || []) {
    const label = `analysis:${item?.id || "?"}`;
    if (!item?.id) errors.push("analysis 条目缺少 id");
    if (item?.status !== "verified") errors.push(`${label} 未 verified`);
    if (!Array.isArray(item?.basis) || !item.basis.length) errors.push(`${label} 缺少 basis`);
    else for (const ref of item.basis) if (!evidenceById.has(ref)) errors.push(`${label}.basis 无效: ${ref}`);
    const supports = validateSupports(item?.supports, label, "analysis", errors);
    if (item?.id) addEvidence(evidenceById, `analysis:${item.id}`, "analysis", supports, errors);
  }
  const gapIds = new Set();
  for (const gap of context?.gaps || []) {
    if (!gap?.id) errors.push("gaps 条目缺少 id");
    else if (gapIds.has(gap.id)) errors.push(`gaps id 重复: ${gap.id}`);
    else gapIds.add(gap.id);
    if (!["agent-research", "user", "tool-analysis"].includes(gap?.resolver)) errors.push(`gap:${gap?.id || "?"}.resolver 无效`);
    if (!["unresolved", "resolved", "waived"].includes(gap?.status)) errors.push(`gap:${gap?.id || "?"}.status 无效`);
    const required = validateSupports(gap?.requires, `gap:${gap?.id || "?"}.requires`, "gap", errors);
    if (gap?.status === "resolved") {
      const evidence = evidenceById.get(gap.evidenceRef);
      if (!evidence) errors.push(`gap:${gap.id}.evidenceRef 无效: ${gap.evidenceRef || "_"}`);
      const prefix = RESOLVER_PREFIX[gap.resolver];
      if (prefix && !String(gap.evidenceRef || "").startsWith(prefix)) {
        errors.push(`gap:${gap.id} 的 resolver=${gap.resolver} 只能由 ${prefix} 证据解决`);
      }
      for (const capability of required) {
        if (evidence && !evidence.supports.has(capability)) errors.push(`gap:${gap.id} 的证据 ${gap.evidenceRef} 不支持 ${capability}`);
      }
    }
    if (gap?.status === "waived") {
      if (!String(gap.waiverReason || "").trim()) errors.push(`gap:${gap.id}.waiverReason 不能为空`);
      if (!String(gap.waiverRef || "").startsWith("user:") || !evidenceById.has(gap.waiverRef)) {
        errors.push(`gap:${gap.id}.waiverRef 必须引用已批准 user 证据`);
      }
    }
    if (gap?.fallback !== "face") errors.push(`gap:${gap?.id || "?"}.fallback 必须是 face`);
  }
  return { ok: errors.length === 0, errors, evidenceIds: new Set(evidenceById.keys()), evidenceById };
}

function buildGaps(storyBeats, project, jobDir) {
  const gaps = [];
  if (!fs.existsSync(path.join(jobDir, "data", "face-analysis.json"))) {
    gaps.push(gap("global-face-analysis", null, "实测人物与人脸安全区", "tool-analysis", ["split", "pip"], ["face-safe-layout"]));
  }
  for (const beat of storyBeats) {
    if (!EVIDENCE_VISUAL_ROLES.has(beat.visualRole)) continue;
    if (beat.visualRole === "evidence") {
      gaps.push(gap(`${beat.id}-evidence`, beat.id, "真实证据、来源与可用素材", "agent-research", ["recipe", "broll"], ["source-provenance"]));
    } else if (beat.visualRole === "explanation") {
      gaps.push(gap(`${beat.id}-model`, beat.id, "从完整表达中核对概念、关系、步骤或数据模型", "tool-analysis", ["recipe"], ["semantic-model"]));
    } else {
      gaps.push(gap(`${beat.id}-metaphor`, beat.id, "与本段语义一致且不误导的氛围素材", "agent-research", ["recipe", "broll"], ["semantic-fit"]));
    }
  }
  if (!project.visual?.referenceApproved) {
    gaps.push(gap("global-visual-reference", null, "用户确认的视觉对标与允许的皮肤", "user", ["recipe"], ["visual-style-approval"]));
  }
  return gaps;
}

function gap(id, storyBeatId, need, resolver, blockingFor, requires) {
  return { id, storyBeatId, need, resolver, status: "unresolved", evidenceRef: null, requires, blockingFor, fallback: "face" };
}

function addEvidence(index, ref, kind, supports, errors = []) {
  if (index.has(ref)) {
    errors.push(`证据 id 重复: ${ref}`);
    return;
  }
  index.set(ref, {ref, kind, supports: new Set(supports)});
}

function validateSupports(value, label, kind, errors) {
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${label}.supports 必须是非空数组`);
    return [];
  }
  const supports = [...new Set(value.map(String))];
  for (const capability of supports) {
    if (!EVIDENCE_CAPABILITIES.has(capability)) errors.push(`${label}.supports 未知能力: ${capability}`);
    if (kind === "analysis" && ["real-source-asset", "source-provenance", "verified-data", "unit", "visual-style-approval", "asset-rights"].includes(capability)) {
      errors.push(`${label} 的工具分析不能宣称 ${capability}`);
    }
    if (kind === "research" && ["real-source-asset", "face-safe-layout", "visual-style-approval", "asset-rights"].includes(capability)) {
      errors.push(`${label} 的外部研究不能宣称 ${capability}`);
    }
  }
  return supports;
}

function resolveWrittenScript(jobDir, project) {
  const relative = project.editorial?.writtenScript?.path;
  if (!relative) return null;
  const file = path.join(jobDir, relative);
  return fs.existsSync(file) ? { path: relative, policy: project.editorial.writtenScript.policy || "reference" } : null;
}

function optionalFile(jobDir, relative) {
  return fs.existsSync(path.join(jobDir, relative)) ? relative : null;
}

function scanAssets(jobDir) {
  const roots = ["assets", "references"];
  const files = roots.flatMap((relative) => walkFiles(path.join(jobDir, relative), jobDir));
  return files.map((relative, index) => {
    const file = path.join(jobDir, relative);
    const stat = fs.statSync(file);
    return {
      id: `local-${String(index + 1).padStart(3, "0")}`,
      path: relative,
      type: mediaType(file),
      bytes: stat.size,
      provenance: "local-unreviewed",
      rights: "unknown"
    };
  });
}

function walkFiles(dir, base) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(file, base) : [path.relative(base, file).split(path.sep).join(path.posix.sep)];
  });
}

function mediaType(file) {
  const ext = path.extname(file).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".mkv"].includes(ext)) return "video";
  if ([".png", ".jpg", ".jpeg", ".webp", ".avif"].includes(ext)) return "image";
  if ([".wav", ".mp3", ".m4a", ".aac"].includes(ext)) return "audio";
  if ([".md", ".txt", ".json", ".pdf", ".docx"].includes(ext)) return "document";
  return "other";
}

function resolveFormat(project) {
  const width = Number(project.width || 1080);
  const height = Number(project.height || 1920);
  return width >= height ? "landscape" : "portrait";
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const output = path.join(jobDir, "data", "visual-context.json");
  if (fs.existsSync(output) && !args.force) throw new Error(`${output} 已存在；为保护人工研究结果，只有明确 --force 才能重建`);
  const context = buildVisualContext(jobDir);
  const validated = validateVisualContext(context);
  if (!validated.ok) throw new Error(`视觉上下文生成失败:\n- ${validated.errors.join("\n- ")}`);
  writeJson(output, context);
  console.log(`视觉上下文已生成: ${output}`);
  console.log(`自动素材 ${context.automatic.assets.length} 个 · 待解决缺口 ${context.gaps.length} 个`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
