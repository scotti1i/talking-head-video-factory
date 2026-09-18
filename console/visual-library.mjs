// ============================================================
// 视觉资产目录(只读)
// 磁盘 manifest 是事实源；坏资产保留为可诊断条目，不能静默过滤。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const VISUAL_ASSET_KINDS = ["theme", "component", "layout", "preset", "legacy-composition"];
export const VISUAL_LIFECYCLES = ["draft", "published", "archived"];
export const VISUAL_COMPATIBILITY = ["supported", "preview-only", "unsupported"];
export const VISUAL_PREVIEW_STATES = ["ready", "missing", "stale", "rendering", "failed", "unsupported"];

const FORMAT_DEFS = {
  vertical: { id: "vertical", label: "抖音竖屏", width: 1080, height: 1920, aspect: "9:16" },
  horizontal: { id: "horizontal", label: "YouTube 横屏", width: 1920, height: 1080, aspect: "16:9" }
};

const FORMAT_ALIASES = new Map([
  ["vertical", "vertical"],
  ["portrait", "vertical"],
  ["9:16", "vertical"],
  ["douyin", "vertical"],
  ["horizontal", "horizontal"],
  ["landscape", "horizontal"],
  ["16:9", "horizontal"],
  ["youtube", "horizontal"]
]);

export function listVisualLibrary(options = {}) {
  const root = resolveRoot(options);
  const previewIndex = loadPreviewIndex(root);
  const usageIndex = scanJobUsage(root);
  const families = scanFamilies(root);
  const components = scanComponents(root);
  const themes = scanThemes(root);
  const familyComponents = indexFamilyComponents(components);
  const assets = [...families, ...components, ...themes]
    .map((asset) => finishAsset(asset, root, previewIndex, usageIndex, familyComponents))
    .sort(compareAssets);
  const familyIds = new Set(families.map((family) => family.id));
  const finishedFamilies = assets.filter((asset) => familyIds.has(asset.id) && asset.origin === "family");
  const errors = assets.flatMap((asset) => asset.errors.map((error) => ({ assetId: asset.id, ...error })));
  errors.push(...previewIndex.errors, ...usageIndex.errors);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    families: finishedFamilies,
    assets,
    themes: assets.filter((asset) => asset.kind === "theme"),
    components: assets.filter((asset) => asset.kind === "component"),
    filters: buildFilters(assets),
    counts: buildCounts(assets, finishedFamilies),
    errors
  };
}

export function listVisualFamilies(options = {}) {
  return listVisualLibrary(options).families;
}

export function listVisualAssets(options = {}) {
  return listVisualLibrary(options).assets;
}

export function getVisualAsset(id, options = {}) {
  return listVisualLibrary(options).assets.find((asset) => asset.id === id) || null;
}

export function getVisualFamily(id, options = {}) {
  return listVisualLibrary(options).families.find((family) => family.id === id) || null;
}

export function resolveVisualPreview(assetId, query = {}, options = {}) {
  const asset = getVisualAsset(assetId, options);
  if (!asset) return null;
  const selected = selectPreview(asset.previews, query);
  if (selected) return selected;
  if (!query.theme && !query.format && !query.fixture) return asset.preview;
  const requestedFormat = normalizeFormatId(query.format);
  const supported = !requestedFormat || asset.formats.some((format) => format.id === requestedFormat && format.supported);
  return { ...emptyPreview(supported ? asset.compatibility : "unsupported"), assetId };
}

function resolveRoot(options) {
  if (typeof options === "string") return path.resolve(options);
  return path.resolve(options.root || DEFAULT_ROOT);
}

function scanFamilies(root) {
  const dir = path.join(root, "visual-assets", "families");
  return jsonFiles(dir).map((file) => {
    const fallbackId = path.basename(file, ".json");
    const result = readJsonResult(file);
    const asset = normalizeAsset(result.value, {
      root,
      file,
      fallbackId,
      fallbackKind: "legacy-composition",
      origin: "family",
      parseError: result.error
    });
    validateFamilyAsset(asset, result.value);
    return asset;
  });
}

function scanComponents(root) {
  const dir = path.join(root, "components");
  return childDirectories(dir).map((componentDir) => {
    const fallbackId = path.basename(componentDir);
    const file = path.join(componentDir, "component.json");
    const result = readJsonResult(file);
    const manifest = result.value ? {
      ...result.value,
      sources: [
        { path: file, role: "manifest", critical: true },
        { path: path.join(componentDir, "render.mjs"), role: "renderer", critical: true },
        { path: path.join(componentDir, "style.css"), role: "style", critical: true },
        { path: path.join(componentDir, "fixtures.json"), role: "fixtures", critical: true }
      ]
    } : null;
    const asset = normalizeAsset(manifest, {
      root,
      file,
      fallbackId,
      fallbackKind: "component",
      origin: "component",
      parseError: result.error
    });
    asset.familyId ||= "beats-v2-face-safe";
    asset.category = result.value?.category || "uncategorized";
    asset.version = result.value?.version || null;
    asset.order = Number.isFinite(Number(result.value?.order)) ? Number(result.value.order) : null;
    asset.promptHint = cleanText(result.value?.promptHint) || null;
    asset.tags = stringArray(result.value?.tags);
    asset.requiredFields = stringArray(result.value?.requiredFields);
    asset.optionalFields = stringArray(result.value?.optionalFields);
    asset.provenance = cleanText(result.value?.source) || null;
    asset.fixtures = loadFixtures(componentDir, asset);
    asset.defaultFixture = cleanText(result.value?.preview?.defaultFixture) || asset.fixtures[0]?.id || null;
    validateComponentAsset(asset, result.value, fallbackId);
    return asset;
  });
}

function scanThemes(root) {
  const themesDir = path.join(root, "themes");
  const registryFile = path.join(themesDir, "registry.json");
  const registryResult = readJsonResult(registryFile);
  const registered = Array.isArray(registryResult.value?.themes) ? registryResult.value.themes.map(String) : [];
  const dirs = childDirectories(themesDir)
    .map((dir) => path.basename(dir))
    .filter((id) => !id.startsWith("_"));
  const ids = [...new Set([...registered, ...dirs])].sort();

  return ids.map((id) => {
    const file = path.join(themesDir, id, "theme.json");
    const result = readJsonResult(file);
    const manifest = result.value
      ? {
          ...result.value,
          id,
          kind: "theme",
          lifecycle: registered.includes(id) ? "published" : "draft",
          compatibility: "supported",
          formats: ["vertical", "horizontal"],
          familyId: "beats-v2-face-safe",
          source: file,
          apply: { mode: "theme", payload: { theme: id } },
          preview: fs.existsSync(path.join(themesDir, id, "preview.jpg"))
            ? { state: "ready", poster: path.join(themesDir, id, "preview.jpg") }
            : undefined
        }
      : null;
    const asset = normalizeAsset(manifest, {
      root,
      file,
      fallbackId: id,
      fallbackKind: "theme",
      origin: "theme",
      parseError: result.error
    });
    if (registryResult.error) {
      asset.issues.push(issue("theme_registry_invalid", registryResult.error, relativePath(root, registryFile), "error"));
    }
    asset.tokens = result.value?.tokens || null;
    asset.default = registryResult.value?.default === id;
    if (result.value && (!result.value.tokens || typeof result.value.tokens !== "object" || Array.isArray(result.value.tokens))) {
      asset.issues.push(issue("theme_tokens_invalid", "theme.json 缺少 tokens 对象", asset.manifestPath, "error"));
    }
    return asset;
  });
}

function validateFamilyAsset(asset, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  if (!cleanText(raw.label)) asset.issues.push(issue("label_missing", "视觉家族缺少 label", asset.manifestPath, "error"));
  if (!cleanText(raw.description)) asset.issues.push(issue("description_missing", "视觉家族缺少 description", asset.manifestPath, "error"));
  if (!Array.isArray(raw.items)) asset.issues.push(issue("items_invalid", "视觉家族 items 必须是数组", asset.manifestPath, "error"));
  if (!Array.isArray(raw.migrationCandidates)) {
    asset.issues.push(issue("migration_candidates_invalid", "migrationCandidates 必须是数组", asset.manifestPath, "error"));
  }
  if (!raw.lineage || typeof raw.lineage !== "object" || Array.isArray(raw.lineage)) {
    asset.issues.push(issue("lineage_invalid", "lineage 必须是对象", asset.manifestPath, "error"));
  }
}

function validateComponentAsset(asset, raw, directoryId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  if (raw.id !== directoryId) {
    asset.issues.push(issue("component_id_mismatch", `组件 id ${raw.id || "空"} 必须与目录 ${directoryId} 一致`, asset.manifestPath, "error"));
  }
  for (const field of ["label", "category", "description", "version", "source"]) {
    if (!cleanText(raw[field])) asset.issues.push(issue("component_field_missing", `组件缺少 ${field}`, asset.manifestPath, "error"));
  }
  if (!Array.isArray(raw.requiredFields) || !Array.isArray(raw.optionalFields) || !Array.isArray(raw.tags)) {
    asset.issues.push(issue("component_fields_invalid", "requiredFields、optionalFields、tags 必须是数组", asset.manifestPath, "error"));
  }
  if (raw.apply?.mode !== "beat" || raw.apply?.type !== raw.id) {
    asset.issues.push(issue("component_apply_invalid", "apply 必须声明 mode=beat 且 type 等于组件 id", asset.manifestPath, "error"));
  }
}

function normalizeAsset(raw, context) {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const issues = [];
  if (context.parseError) issues.push(issue("manifest_invalid", context.parseError, relativePath(context.root, context.file), "error"));
  if (context.origin !== "theme" && data.schemaVersion !== 1) {
    issues.push(issue("schema_version_invalid", "schemaVersion 必须是 1", relativePath(context.root, context.file), "error"));
  }
  const id = validId(data.id) ? data.id : context.fallbackId;
  if (!validId(data.id)) issues.push(issue("id_invalid", "manifest 缺少合法 id，已使用目录或文件名", relativePath(context.root, context.file), "error"));
  const kind = allowedValue(data.kind, VISUAL_ASSET_KINDS, context.fallbackKind, issues, "kind_invalid");
  const lifecycle = allowedValue(data.lifecycle, VISUAL_LIFECYCLES, "draft", issues, "lifecycle_invalid");
  const compatibility = allowedValue(
    data.compatibility,
    VISUAL_COMPATIBILITY,
    context.parseError ? "unsupported" : "preview-only",
    issues,
    "compatibility_invalid"
  );
  const formats = normalizeFormats(data.formats, issues);
  const sources = normalizeSources(data.sources ?? data.source, context.root, context.file);
  const items = Array.isArray(data.items) ? data.items.map((item, index) => normalizeItem(item, index, id, context.root)) : [];
  const apply = normalizeApply(data.apply);

  return {
    id,
    label: cleanText(data.label || data.name) || `无效资产 · ${context.fallbackId}`,
    description: cleanText(data.description) || "该资产无法完整读取，请查看错误信息。",
    kind,
    familyId: cleanText(data.familyId) || (context.origin === "family" ? id : null),
    origin: context.origin,
    lifecycle,
    compatibility,
    formats,
    sources,
    items,
    migrationCandidates: normalizeMigrationCandidates(data.migrationCandidates),
    lineage: normalizeLineage(data.lineage),
    previewSeed: data.preview || null,
    usageMatch: normalizeUsageMatch(data.usageMatch),
    apply,
    issues,
    manifestPath: relativePath(context.root, context.file),
    rawSchemaVersion: data.schemaVersion ?? null
  };
}

function finishAsset(asset, root, previewIndex, usageIndex, familyComponents) {
  for (const source of asset.sources) {
    if (!source.exists && source.required) {
      asset.issues.push(issue("source_missing", `来源不存在：${source.path}`, source.path, source.critical ? "error" : "warning"));
    }
  }
  const indexedPreviews = previewIndex.byAsset.get(asset.id) || [];
  const seedPreview = normalizePreview(asset.previewSeed, asset.id, root);
  const itemPreviews = asset.items.map((item) => item.preview).filter(Boolean);
  const previews = indexedPreviews.length ? indexedPreviews : seedPreview ? [seedPreview] : itemPreviews;
  const preview = selectPreview(previews, {}) || emptyPreview(asset.compatibility);
  addPreviewIssues(asset, previews.length ? previews : [preview]);
  const usage = usageForAsset(asset, usageIndex.jobs, familyComponents);
  const health = computeHealth(asset.issues);
  const blockingError = asset.issues.some((item) => item.severity === "error" && item.code !== "preview_failed");
  const enabled = asset.lifecycle === "published" && asset.compatibility === "supported" && asset.apply.mode !== "none" && !blockingError;
  const apply = {
    ...asset.apply,
    enabled,
    reason: enabled ? null : applyDisabledReason(asset, blockingError)
  };
  const errors = asset.issues.filter((item) => item.severity === "error");
  const { previewSeed, usageMatch, issues, ...publicAsset } = asset;
  return { ...publicAsset, health, preview, previews, usage, apply, errors };
}

function addPreviewIssues(asset, previews) {
  const failed = previews.filter((item) => item.state === "failed");
  if (failed.length) {
    const first = failed[0];
    asset.issues.push(issue("preview_failed", first.error || `${failed.length} 个预览生成失败`, first.logPath, "error"));
    return;
  }
  const stale = previews.filter((item) => item.state === "stale");
  if (stale.length) {
    asset.issues.push(issue("preview_stale", `${stale.length} 个预览已过期`, null, "warning"));
    return;
  }
  if (previews.some((item) => item.state === "rendering")) {
    asset.issues.push(issue("preview_rendering", "预览正在生成", null, "warning"));
    return;
  }
  if (previews.every((item) => item.state === "missing")) {
    asset.issues.push(issue("preview_missing", "尚未生成真实预览", null, "warning"));
    return;
  }
  const missing = previews.filter((item) => item.state === "missing");
  if (missing.length) {
    asset.issues.push(issue("preview_partial", `${missing.length} 个结构尚无真实预览`, null, "warning"));
  }
}

function loadPreviewIndex(root) {
  const file = path.join(root, "out", "visual-library", "manifest.json");
  if (!fs.existsSync(file)) return { byAsset: new Map(), errors: [] };
  const result = readJsonResult(file);
  if (result.error) {
    return {
      byAsset: new Map(),
      errors: [{ code: "preview_manifest_invalid", message: result.error, path: relativePath(root, file) }]
    };
  }
  const entries = previewEntries(result.value);
  const byAsset = new Map();
  for (const raw of entries) {
    const assetId = cleanText(raw.assetId || raw.componentId || raw.component || raw.familyId || raw.id);
    if (!assetId) continue;
    const preview = normalizePreview(raw, assetId, root);
    if (!preview) continue;
    const list = byAsset.get(assetId) || [];
    list.push(preview);
    byAsset.set(assetId, list);
  }
  return { byAsset, errors: [] };
}

function previewEntries(value) {
  if (Array.isArray(value)) return value;
  if (value?.cells && typeof value.cells === "object" && !Array.isArray(value.cells)) {
    return Object.entries(value.cells).map(([cellKey, item]) => ({ assetId: item?.component, cellKey, ...item }));
  }
  for (const key of ["previews", "items", "assets"]) {
    if (Array.isArray(value?.[key])) return flattenPreviewContainers(value[key]);
    if (value?.[key] && typeof value[key] === "object") {
      return flattenPreviewContainers(Object.entries(value[key]).map(([id, item]) => ({ assetId: id, ...item })));
    }
  }
  return [];
}

function flattenPreviewContainers(entries) {
  return entries.flatMap((entry) => {
    if (!Array.isArray(entry?.previews)) return [entry];
    const assetId = entry.assetId || entry.componentId || entry.familyId || entry.id;
    return entry.previews.map((preview) => ({ assetId, ...preview }));
  });
}

function normalizePreview(raw, assetId, root) {
  if (!raw || typeof raw !== "object") return null;
  const lastGoodDir = raw.lastGoodHash ? path.join("out", "visual-library", "cache", raw.lastGoodHash) : null;
  const posterRef = lastGoodDir && raw.status !== "ready"
    ? path.join(lastGoodDir, "poster.webp")
    : raw.posterUrl || raw.posterPath || raw.poster;
  const cacheIndex = raw.cachePath ? path.join(raw.cachePath, "index.html") : null;
  const loopRef = lastGoodDir && raw.status !== "ready"
    ? path.join(lastGoodDir, "index.html")
    : raw.loopUrl || raw.loopPath || raw.loop || raw.video || raw.htmlUrl || raw.previewUrl || raw.htmlPath || cacheIndex;
  const missingPoster = isMissingLocal(root, posterRef);
  const missingLoop = isMissingLocal(root, loopRef);
  const poster = missingPoster ? null : publicFile(root, posterRef);
  const loop = missingLoop ? null : publicFile(root, loopRef);
  let state = cleanText(raw.state || raw.status);
  if (!VISUAL_PREVIEW_STATES.includes(state)) state = poster || loop ? "ready" : "missing";
  const missingLocal = missingPoster || missingLoop || null;
  if (state === "ready" && !poster && !loop) state = "failed";
  return {
    assetId,
    state,
    theme: cleanText(raw.theme || raw.themeId) || null,
    format: normalizeFormatId(raw.format || raw.formatId || raw.orientation),
    fixture: cleanText(raw.fixture || raw.fixtureId) || null,
    posterUrl: poster,
    loopUrl: loop,
    updatedAt: raw.updatedAt || raw.generatedAt || null,
    error: cleanText(raw.error?.message || raw.error || raw.message) || (state === "failed" && missingLocal ? `预览文件不存在：${missingLocal}` : null),
    logPath: publicFile(root, raw.logPath || raw.logUrl || raw.resultPath)
  };
}

function emptyPreview(compatibility) {
  return {
    assetId: null,
    state: compatibility === "unsupported" ? "unsupported" : "missing",
    theme: null,
    format: null,
    fixture: null,
    posterUrl: null,
    loopUrl: null,
    updatedAt: null,
    error: null,
    logPath: null
  };
}

function selectPreview(previews, query) {
  if (!previews.length) return null;
  const desiredFormat = normalizeFormatId(query.format);
  const candidates = previews.filter((preview) => {
    if (query.theme && preview.theme !== query.theme) return false;
    if (desiredFormat && preview.format !== desiredFormat) return false;
    if (query.fixture && preview.fixture !== query.fixture) return false;
    return true;
  });
  if (!candidates.length) return null;
  const scored = candidates.map((preview) => {
    let score = preview.state === "ready" ? 8 : preview.state === "stale" ? 4 : 0;
    if (query.theme && preview.theme === query.theme) score += 4;
    if (desiredFormat && preview.format === desiredFormat) score += 4;
    if (query.fixture && preview.fixture === query.fixture) score += 2;
    return { preview, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0].preview;
}

function scanJobUsage(root) {
  const jobsDir = path.join(root, "jobs");
  const errors = [];
  const jobs = childDirectories(jobsDir).flatMap((dir) => {
    const configFile = path.join(dir, "project.json");
    if (!fs.existsSync(configFile)) return [];
    const configResult = readJsonResult(configFile);
    if (configResult.error) {
      errors.push({ code: "job_config_invalid", message: configResult.error, path: relativePath(root, configFile) });
      return [];
    }
    const beatsFile = path.join(dir, "data", "beats.json");
    const beatsResult = readJsonResult(beatsFile);
    const beats = Array.isArray(beatsResult.value) ? beatsResult.value : [];
    if (beatsResult.error && fs.existsSync(beatsFile)) {
      errors.push({ code: "job_beats_invalid", message: beatsResult.error, path: relativePath(root, beatsFile) });
    }
    const counts = {};
    for (const beat of beats) {
      const id = cleanText(beat?.type || beat?.kind);
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return [{
      slug: path.basename(dir),
      title: configResult.value.title || path.basename(dir),
      theme: configResult.value.theme || null,
      componentCounts: counts,
      beatCount: beats.length,
      formats: formatsFromProject(configResult.value)
    }];
  });
  return { jobs, errors };
}

function usageForAsset(asset, jobs, familyComponents) {
  const matched = jobs.flatMap((job) => {
    let beatCount = 0;
    if (asset.kind === "component") beatCount = job.componentCounts[asset.id] || 0;
    if (asset.kind === "theme" && job.theme === asset.id) beatCount = job.beatCount;
    if (asset.origin === "family") {
      const componentIds = [...new Set([...asset.usageMatch.componentIds, ...(familyComponents.get(asset.id) || [])])];
      beatCount = componentIds.reduce((sum, id) => sum + (job.componentCounts[id] || 0), 0);
      const explicit = asset.usageMatch.jobSlugs.includes(job.slug) || asset.usageMatch.themeIds.includes(job.theme);
      if (explicit && beatCount === 0) beatCount = job.beatCount || 1;
    }
    return beatCount > 0 ? [{ ...job, beatCount }] : [];
  });
  return {
    count: matched.length,
    beatCount: matched.reduce((sum, job) => sum + job.beatCount, 0),
    jobs: matched
  };
}

function indexFamilyComponents(components) {
  const index = new Map();
  for (const component of components) {
    const ids = index.get(component.familyId) || [];
    ids.push(component.id);
    index.set(component.familyId, ids);
  }
  return index;
}

function normalizeFormats(value, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("formats_missing", "manifest 未声明画幅", null, "error"));
    return [];
  }
  return value.flatMap((item) => {
    const rawId = typeof item === "string" ? item : item?.id || item?.format || item?.orientation;
    const id = normalizeFormatId(rawId);
    if (!id) {
      issues.push(issue("format_invalid", `不支持的画幅：${rawId || "空"}`, null, "error"));
      return [];
    }
    const override = typeof item === "object" ? item : {};
    return [{ ...FORMAT_DEFS[id], ...override, id, supported: override.supported !== false }];
  }).filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

function normalizeFormatId(value) {
  return FORMAT_ALIASES.get(String(value || "").toLowerCase()) || null;
}

function normalizeSources(value, root, manifestFile) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  const sources = entries.map((entry) => {
    const source = typeof entry === "string" ? { path: entry } : entry || {};
    const sourcePath = source.path || source.file || source.url || "";
    const absolute = sourcePath ? (path.isAbsolute(sourcePath) ? sourcePath : path.join(root, sourcePath)) : null;
    return {
      path: sourcePath ? relativePath(root, absolute) : "",
      role: source.role || "source",
      note: source.note || null,
      required: source.required !== false,
      critical: source.critical === true,
      exists: Boolean(absolute && fs.existsSync(absolute))
    };
  });
  const manifestPath = relativePath(root, manifestFile);
  if (!sources.some((source) => source.path === manifestPath)) {
    sources.unshift({ path: manifestPath, role: "manifest", note: null, required: true, critical: false, exists: fs.existsSync(manifestFile) });
  }
  return sources;
}

function normalizeItem(item, index, familyId, root) {
  const data = item && typeof item === "object" ? item : {};
  const kind = VISUAL_ASSET_KINDS.includes(data.kind) ? data.kind : "component";
  const id = cleanText(data.id) || `${familyId}-item-${index + 1}`;
  return {
    id,
    label: cleanText(data.label || data.name) || `未命名结构 ${index + 1}`,
    kind,
    compatibility: VISUAL_COMPATIBILITY.includes(data.compatibility) ? data.compatibility : null,
    description: cleanText(data.description) || null,
    status: cleanText(data.status) || null,
    formats: stringArray(data.formats),
    version: cleanText(data.version) || null,
    provenance: cleanText(data.provenance || data.source) || null,
    preview: normalizePreview(data.preview, `${familyId}::${id}`, root)
  };
}

function normalizeMigrationCandidates(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? { targetId: item, note: null } : {
    targetId: cleanText(item?.targetId || item?.id) || null,
    note: cleanText(item?.note || item?.reason) || null
  });
}

function normalizeLineage(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    parents: stringArray(data.parents || data.parent),
    supersedes: stringArray(data.supersedes),
    supersededBy: stringArray(data.supersededBy)
  };
}

function normalizeUsageMatch(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    componentIds: stringArray(data.componentIds),
    themeIds: stringArray(data.themeIds),
    jobSlugs: stringArray(data.jobSlugs)
  };
}

function normalizeApply(value) {
  const data = value && typeof value === "object" ? value : {};
  const mode = cleanText(data.mode) || "none";
  return { mode, payload: data.payload || (data.type ? { type: data.type } : null) };
}

function loadFixtures(componentDir, asset) {
  const file = path.join(componentDir, "fixtures.json");
  if (!fs.existsSync(file)) return [];
  const result = readJsonResult(file);
  if (result.error || !Array.isArray(result.value)) {
    asset.issues.push(issue("fixtures_invalid", result.error || "fixtures.json 必须是数组", relativePath(path.dirname(path.dirname(componentDir)), file), "error"));
    return [];
  }
  return result.value.map((fixture, index) => ({
    id: cleanText(fixture?.id) || `fixture-${index + 1}`,
    label: cleanText(fixture?.label) || `测试场景 ${index + 1}`,
    beat: fixture?.beat || null
  }));
}

function formatsFromProject(config) {
  const formats = new Set();
  const addDimensions = (width, height, layout) => {
    if (String(layout).toLowerCase() === "horizontal" || Number(width) > Number(height)) formats.add("horizontal");
    else if (Number(width) > 0 && Number(height) > 0) formats.add("vertical");
  };
  addDimensions(config.width, config.height, config.layout);
  for (const variant of Array.isArray(config.variants) ? config.variants : []) {
    addDimensions(variant.width, variant.height, variant.layout);
  }
  return [...formats];
}

function computeHealth(issues) {
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  const state = errors.length ? "error" : warnings.length ? "warning" : "ok";
  const summary = state === "ok" ? "可正常读取" : state === "warning" ? `${warnings.length} 项需要注意` : `${errors.length} 项错误`;
  return { state, summary, issues };
}

function applyDisabledReason(asset, blockingError) {
  if (blockingError) return "资产合同存在错误，修复后才能应用";
  if (asset.lifecycle !== "published") return asset.lifecycle === "archived" ? "历史资产仅供查看" : "草稿尚未发布";
  if (asset.compatibility !== "supported") return asset.compatibility === "preview-only" ? "该资产尚未迁移到统一生产链" : "当前生产链不支持该资产";
  if (asset.apply.mode === "none") return "该资产没有可执行的应用合同";
  return "当前不可应用";
}

function buildFilters(assets) {
  return {
    kinds: filterCounts(assets, (asset) => asset.kind),
    lifecycles: filterCounts(assets, (asset) => asset.lifecycle),
    compatibility: filterCounts(assets, (asset) => asset.compatibility),
    health: filterCounts(assets, (asset) => asset.health.state),
    formats: filterCounts(assets.flatMap((asset) => asset.formats), (format) => format.id)
  };
}

function buildCounts(assets, families) {
  const entries = families.reduce((sum, family) => {
    const nested = new Set(family.items.map((item) => item.id));
    for (const asset of assets) if (asset.familyId === family.id && asset.id !== family.id && asset.kind !== "theme") nested.add(asset.id);
    return sum + Math.max(1, nested.size);
  }, 0);
  return {
    families: families.length,
    assets: assets.length,
    entries,
    themes: assets.filter((asset) => asset.kind === "theme").length,
    components: assets.filter((asset) => asset.kind === "component").length,
    errors: assets.filter((asset) => asset.health.state === "error").length
  };
}

function filterCounts(items, getter) {
  const counts = {};
  for (const item of items) {
    const value = getter(item);
    if (value) counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function allowedValue(value, allowed, fallback, issues, code) {
  if (allowed.includes(value)) return value;
  issues.push(issue(code, `无效值：${value ?? "空"}`, null, "error"));
  return fallback;
}

function issue(code, message, issuePath = null, severity = "warning") {
  return { code, message: cleanText(message) || code, path: issuePath || null, severity };
}

function readJsonResult(file) {
  if (!fs.existsSync(file)) return { value: null, error: `文件不存在：${file}` };
  try {
    return { value: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (error) {
    return { value: null, error: `JSON 无法解析：${error.message}` };
  }
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function childDirectories(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function publicFile(root, value) {
  if (!value || typeof value !== "string") return null;
  if (/^(https?:|data:|blob:)/.test(value) || value.startsWith("/files/")) return value;
  if (value.startsWith("/") && !path.isAbsolute(value)) return value;
  const absolute = path.isAbsolute(value) ? value : path.join(root, value);
  if (!isInside(root, absolute)) return null;
  return `/files/${relativePath(root, absolute)}`;
}

function isMissingLocal(root, value) {
  if (typeof value !== "string" || /^(https?:|data:|blob:)/.test(value) || value.startsWith("/files/")) return false;
  const absolute = path.isAbsolute(value) ? value : path.join(root, value);
  return isInside(root, absolute) && !fs.existsSync(absolute) ? value : false;
}

function relativePath(root, file) {
  if (!file) return null;
  const absolute = path.resolve(file);
  return isInside(root, absolute) ? path.relative(root, absolute).split(path.sep).join("/") : absolute;
}

function isInside(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stringArray(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

function compareAssets(a, b) {
  const originOrder = { family: 0, component: 1, theme: 2 };
  return (originOrder[a.origin] ?? 9) - (originOrder[b.origin] ?? 9)
    || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id, "en");
}
