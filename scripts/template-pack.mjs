import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import { deepMerge, projectRoot, readJson } from "./lib.mjs";

// pack.json 只放脚本真读的字段。剪辑规则文字写进模板包 README「编辑规则（人读）」，
// 不许以 *Policy / requiredWorkflow 这类散文式 JSON 混进来（2026-09-11 审计：客户包里大段规则无脚本读取，等于不执行）。
const PACK_FIELDS = new Set([
  "schemaVersion", "id", "version", "label", "description", "theme", "preview",
  "compatibleProfiles", "compatibleLayouts", "caption", "brollPolicy", "components", "assets"
]);
const BROLL_POLICY_FIELDS = new Set(["maxCoverage"]);

export function loadTemplatePackRegistry(root = projectRoot()) {
  const file = path.join(root, "template-packs", "registry.json");
  const registry = readJson(file);
  if (registry?.schemaVersion !== 1) throw new Error(`${file}: schemaVersion 必须为 1`);
  if (!Array.isArray(registry.packs) || !registry.packs.length) throw new Error(`${file}: packs 必须是非空数组`);
  if (!registry.packs.includes(registry.default)) throw new Error(`${file}: default pack 不在 packs 中`);
  if (new Set(registry.packs).size !== registry.packs.length) throw new Error(`${file}: packs 不得重复`);
  return registry;
}

export function loadTemplatePack(id, root = projectRoot()) {
  const normalized = String(id || "").trim();
  const registry = loadTemplatePackRegistry(root);
  if (!registry.packs.includes(normalized)) {
    throw new Error(`未知模板包: ${normalized}（可用: ${registry.packs.join(", ")}）`);
  }
  const file = path.join(root, "template-packs", normalized, "pack.json");
  const pack = readJson(file);
  validatePack(pack, file, root);
  if (pack.id !== normalized) throw new Error(`${file}: id ${pack.id} 与目录 ${normalized} 不一致`);
  return pack;
}

export function resolveTemplatePack(project, root = projectRoot()) {
  const requested = String(project?.templatePack || "").trim();
  if (!requested) return null;
  const pack = loadTemplatePack(requested, root);
  const profile = String(project?.profile || "").trim();
  if (profile && !pack.compatibleProfiles.includes(profile)) {
    throw new Error(`模板包 ${pack.id} 不支持 profile ${profile}`);
  }
  const layouts = new Set((project?.variants || []).map((variant) => variant.layout).filter(Boolean));
  if (!layouts.size && project?.layout) layouts.add(project.layout);
  const unsupported = [...layouts].filter((layout) => !pack.compatibleLayouts.includes(layout));
  if (unsupported.length) throw new Error(`模板包 ${pack.id} 不支持画幅 ${unsupported.join(", ")}`);
  return pack;
}

export function applyTemplatePack(project, root = projectRoot()) {
  const pack = resolveTemplatePack(project, root);
  if (!pack) return { project, pack: null };
  const defaults = {
    theme: pack.theme,
    caption: pack.caption || {}
  };
  return {
    project: deepMerge(defaults, project),
    pack
  };
}

export function stageTemplatePackAssets({ pack, jobDir, root = projectRoot() }) {
  if (!pack) return [];
  const staged = [];
  for (const relativePath of pack.assets || []) {
    const source = safeAssetPath(path.join(root, "template-packs", pack.id, "assets"), relativePath, "模板资产");
    const target = safeAssetPath(path.join(jobDir, "assets"), relativePath, "job 资产");
    if (!fs.existsSync(source)) throw new Error(`模板资产不存在: ${source}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      if (sha256File(source) !== sha256File(target)) throw new Error(`job 已存在不同内容的模板资产，拒绝覆盖: ${target}`);
    } else {
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    }
    staged.push(path.relative(jobDir, target).replaceAll(path.sep, "/"));
  }
  return staged;
}

function validatePack(pack, file, root) {
  if (pack?.schemaVersion !== 1) throw new Error(`${file}: schemaVersion 必须为 1`);
  rejectUnknownFields(pack, PACK_FIELDS, file, "pack.json");
  rejectUnknownFields(pack.brollPolicy, BROLL_POLICY_FIELDS, file, "brollPolicy");
  if (!/^[a-z][a-z0-9-]*$/.test(pack?.id || "")) throw new Error(`${file}: id 不合法`);
  if (!pack.label || !pack.description || !pack.theme) throw new Error(`${file}: 缺 label/description/theme`);
  if (!Array.isArray(pack.compatibleProfiles) || !pack.compatibleProfiles.length) throw new Error(`${file}: compatibleProfiles 必须非空`);
  if (!Array.isArray(pack.compatibleLayouts) || !pack.compatibleLayouts.length) throw new Error(`${file}: compatibleLayouts 必须非空`);
  const themeFile = path.join(root, "themes", pack.theme, "theme.json");
  if (!fs.existsSync(themeFile)) throw new Error(`${file}: 主题不存在 ${pack.theme}`);
  if (pack.preview != null) {
    const preview = path.resolve(root, pack.preview);
    if (!preview.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(preview)) {
      throw new Error(`${file}: preview 不存在或越界 ${pack.preview}`);
    }
  }
  for (const asset of pack.assets || []) {
    const assetPath = safeAssetPath(path.join(root, "template-packs", pack.id, "assets"), asset, "模板资产");
    if (!fs.existsSync(assetPath)) throw new Error(`${file}: asset 不存在 ${asset}`);
  }
  const coverage = Number(pack.brollPolicy?.maxCoverage);
  if (!(coverage >= 0 && coverage <= 0.25)) throw new Error(`${file}: brollPolicy.maxCoverage 必须在 0–0.25`);
}

function rejectUnknownFields(value, allowed, file, label) {
  if (value == null || typeof value !== "object") return;
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`${file}: ${label} 含脚本不读取的字段 ${unknown.join(", ")}；规则文字请写进模板包 README「编辑规则（人读）」`);
  }
}

function safeAssetPath(base, relativePath, label) {
  const root = path.resolve(base);
  const resolved = path.resolve(root, String(relativePath || ""));
  if (!String(relativePath || "").trim() || path.isAbsolute(String(relativePath)) || !resolved.startsWith(root + path.sep)) {
    throw new Error(`${label} 必须是目录内相对路径: ${relativePath}`);
  }
  return resolved;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
