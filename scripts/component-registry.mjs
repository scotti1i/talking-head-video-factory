import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./lib.mjs";

export const COMPONENT_FORMATS = ["portrait", "landscape"];

const PACKAGE_FILES = ["component.json", "render.mjs", "style.css", "fixtures.json"];
const LIFECYCLES = ["draft", "published", "archived"];
const COMPATIBILITIES = ["supported", "preview-only", "unsupported"];
const CAPTION_MODES = ["card", "overlay"];
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function inspectComponentPackages({ root = projectRoot() } = {}) {
  const baseDir = path.join(root, "components");
  if (!fs.existsSync(baseDir)) {
    return { components: [], errors: [catalogError("components", baseDir, "组件目录不存在")] };
  }
  const components = [];
  const errors = [];
  for (const entry of componentDirectories(baseDir)) {
    const result = inspectPackage(path.join(baseDir, entry.name), entry.name);
    if (result.error) errors.push(result.error);
    if (result.component) components.push(result.component);
  }
  const duplicateIds = duplicateValues(components.map((item) => item.id));
  for (const id of duplicateIds) errors.push(catalogError(id, baseDir, `组件 id 重复: ${id}`));
  components.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en"));
  return { components, errors };
}

export async function inspectComponentCatalog(options = {}) {
  const inspected = inspectComponentPackages(options);
  const components = [];
  const errors = [...inspected.errors];
  for (const component of inspected.components) {
    try {
      components.push(await loadRuntime(component));
    } catch (error) {
      errors.push(catalogError(component.id, component.dir, error.message));
    }
  }
  return { components, errors };
}

export async function loadComponentCatalog(options = {}) {
  const catalog = await inspectComponentCatalog(options);
  if (catalog.errors.length) throw new Error(formatCatalogErrors(catalog.errors));
  if (!catalog.components.length) throw new Error("组件目录为空，至少需要一个有效组件");
  return catalog.components;
}

export function loadComponentPromptCatalog(options = {}) {
  const catalog = inspectComponentPackages(options);
  if (catalog.errors.length) throw new Error(formatCatalogErrors(catalog.errors));
  const available = catalog.components.filter(
    (component) => component.lifecycle === "published" && component.compatibility === "supported"
  );
  if (!available.length) throw new Error("没有已发布且可生产的组件，无法生成排拍任务卡");
  return available.map(({ styleCss, fixtures, files, dir, ...manifest }) => manifest);
}

export function catalogById(components) {
  return new Map(components.map((component) => [component.id, component]));
}

export function renderComponentStyles(components, tokens) {
  return components
    .map((component) => replaceStyleTokens(component.styleCss, tokens, component.id))
    .join("\n      ");
}

export function promptCatalogLines(components) {
  return components.map((component) => {
    const formats = component.formats.map(formatLabel).join("/");
    return `- ${component.id}: ${component.promptHint}（${component.label}；${component.description}；${formats}）`;
  });
}

function componentDirectories(baseDir) {
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function inspectPackage(dir, directoryId) {
  try {
    requirePackageFiles(dir);
    const manifest = readJson(path.join(dir, "component.json"));
    validateManifest(manifest, directoryId);
    const fixtures = readJson(path.join(dir, "fixtures.json"));
    validateFixtures(fixtures, manifest);
    const styleCss = fs.readFileSync(path.join(dir, "style.css"), "utf8").trim();
    if (!styleCss) throw new Error("style.css 不能为空");
    return {
      component: {
        ...manifest,
        dir,
        fixtures,
        styleCss,
        files: Object.fromEntries(PACKAGE_FILES.map((file) => [fileKey(file), path.join(dir, file)]))
      }
    };
  } catch (error) {
    return { error: catalogError(directoryId, dir, error.message) };
  }
}

async function loadRuntime(component) {
  const moduleUrl = pathToFileURL(component.files.render).href;
  const runtime = await import(moduleUrl);
  if (typeof runtime.render !== "function") throw new Error("render.mjs 必须导出 render(beat)");
  if (runtime.validate != null && typeof runtime.validate !== "function") {
    throw new Error("render.mjs 的 validate 必须是函数");
  }
  const validate = runtime.validate || (() => []);
  verifyRuntimeFixtures(component, runtime.render, validate);
  return { ...component, render: runtime.render, validate };
}

function verifyRuntimeFixtures(component, render, validate) {
  for (const fixture of component.fixtures) {
    const errors = validate(fixture.beat);
    if (!Array.isArray(errors)) throw new Error("validate(beat) 必须返回错误数组");
    if (errors.length) throw new Error(`fixture ${fixture.id} 校验失败: ${errors.join("; ")}`);
    const html = render(fixture.beat);
    if (typeof html !== "string" || !html.trim()) {
      throw new Error(`fixture ${fixture.id} 未渲染出 HTML`);
    }
  }
}

function requirePackageFiles(dir) {
  const missing = PACKAGE_FILES.filter((file) => !fs.existsSync(path.join(dir, file)));
  if (missing.length) throw new Error(`缺少组件文件: ${missing.join(", ")}`);
}

function validateManifest(manifest, directoryId) {
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") throw new Error("component.json 必须是对象");
  if (manifest.schemaVersion !== 1) throw new Error("schemaVersion 必须是 1");
  if (!ID_PATTERN.test(manifest.id || "")) throw new Error("id 必须是小写 kebab-case");
  if (manifest.id !== directoryId) throw new Error(`id ${manifest.id} 必须与目录名 ${directoryId} 一致`);
  requireTextFields(manifest, ["label", "category", "description", "version", "source", "promptHint"]);
  if (!Number.isInteger(manifest.order) || manifest.order < 0) throw new Error("order 必须是非负整数");
  if (manifest.kind !== "component") throw new Error("kind 必须是 component");
  if (!LIFECYCLES.includes(manifest.lifecycle)) throw new Error(`lifecycle 必须是 ${LIFECYCLES.join("/")}`);
  if (!COMPATIBILITIES.includes(manifest.compatibility)) {
    throw new Error(`compatibility 必须是 ${COMPATIBILITIES.join("/")}`);
  }
  if (manifest.captionMode != null && !CAPTION_MODES.includes(manifest.captionMode)) {
    throw new Error(`captionMode 必须是 ${CAPTION_MODES.join("/")}`);
  }
  validateStringArray(manifest.formats, "formats", COMPONENT_FORMATS, true);
  validateStringArray(manifest.requiredFields, "requiredFields");
  validateStringArray(manifest.optionalFields, "optionalFields");
  validateStringArray(manifest.tags, "tags");
  const overlappingFields = manifest.requiredFields.filter((field) => manifest.optionalFields.includes(field));
  if (overlappingFields.length) throw new Error(`字段不能同时为必填和可选: ${overlappingFields.join(", ")}`);
  validateApply(manifest.apply, manifest.id);
  validatePreview(manifest.preview);
}

function validateApply(apply, id) {
  if (!apply || typeof apply !== "object" || Array.isArray(apply)) throw new Error("apply 必须是对象");
  if (apply.mode !== "beat") throw new Error("apply.mode 必须是 beat");
  if (apply.type !== id) throw new Error(`apply.type 必须等于组件 id ${id}`);
}

function validatePreview(preview) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) throw new Error("preview 必须是对象");
  if (!(Number(preview.duration) > 0)) throw new Error("preview.duration 必须大于 0");
  if (!String(preview.defaultFixture || "").trim()) throw new Error("preview.defaultFixture 不能为空");
}

function validateFixtures(fixtures, manifest) {
  if (!Array.isArray(fixtures) || !fixtures.length) throw new Error("fixtures.json 必须是非空数组");
  const ids = [];
  fixtures.forEach((fixture, index) => {
    if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) throw new Error(`fixtures[${index}] 必须是对象`);
    requireTextFields(fixture, ["id", "label"]);
    if (!fixture.beat || typeof fixture.beat !== "object" || Array.isArray(fixture.beat)) {
      throw new Error(`fixtures[${index}].beat 必须是对象`);
    }
    validateFixtureAssets(fixture.assets, index);
    ids.push(fixture.id);
    for (const field of ["kicker", "title", ...manifest.requiredFields]) {
      if (fixture.beat[field] == null) throw new Error(`fixtures[${index}].beat 缺 ${field}`);
    }
  });
  const duplicates = duplicateValues(ids);
  if (duplicates.length) throw new Error(`fixture id 重复: ${duplicates.join(", ")}`);
  if (!ids.includes(manifest.preview.defaultFixture)) {
    throw new Error(`默认 fixture 不存在: ${manifest.preview.defaultFixture}`);
  }
}

function validateFixtureAssets(assets, fixtureIndex) {
  if (assets == null) return;
  if (!Array.isArray(assets)) throw new Error(`fixtures[${fixtureIndex}].assets 必须是数组`);
  const targets = [];
  assets.forEach((asset, assetIndex) => {
    const label = `fixtures[${fixtureIndex}].assets[${assetIndex}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      throw new Error(`${label} 必须是对象`);
    }
    requireTextFields(asset, ["source", "target"]);
    if (path.isAbsolute(asset.source) || path.normalize(asset.source).startsWith(`..${path.sep}`)) {
      throw new Error(`${label}.source 必须是仓库内相对路径`);
    }
    const normalizedTarget = path.normalize(asset.target);
    if (path.isAbsolute(asset.target) || normalizedTarget.startsWith(`..${path.sep}`)) {
      throw new Error(`${label}.target 必须是 job 内相对路径`);
    }
    if (normalizedTarget !== "assets" && !normalizedTarget.startsWith(`assets${path.sep}`)) {
      throw new Error(`${label}.target 必须位于 assets/`);
    }
    targets.push(normalizedTarget);
  });
  const duplicates = duplicateValues(targets);
  if (duplicates.length) throw new Error(`fixture assets target 重复: ${duplicates.join(", ")}`);
}

function requireTextFields(value, fields) {
  for (const field of fields) {
    if (!String(value[field] || "").trim()) throw new Error(`${field} 不能为空`);
  }
}

function validateStringArray(value, field, allowed = null, requireNonEmpty = false) {
  if (!Array.isArray(value) || (requireNonEmpty && !value.length)) throw new Error(`${field} 必须是${requireNonEmpty ? "非空" : ""}数组`);
  if (value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${field} 只能包含非空字符串`);
  if (new Set(value).size !== value.length) throw new Error(`${field} 不允许重复`);
  const invalid = allowed ? value.filter((item) => !allowed.includes(item)) : [];
  if (invalid.length) throw new Error(`${field} 包含无效值: ${invalid.join(", ")}`);
}

function replaceStyleTokens(css, tokens, id) {
  const rendered = css.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, key) => {
    const value = tokens[key];
    if (value == null || value === "") throw new Error(`组件 ${id} 的 style.css 引用了未知主题 token: ${key}`);
    return String(value);
  });
  if (/\{\{[^}]+\}\}/.test(rendered)) throw new Error(`组件 ${id} 的 style.css 包含无效 token 占位符`);
  return rendered;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${path.basename(file)} 不是合法 JSON: ${error.message}`);
  }
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function fileKey(file) {
  return file.replace(/\.[^.]+$/, "").replace("component", "manifest");
}

function formatLabel(format) {
  return format === "portrait" ? "竖屏" : "横屏";
}

function catalogError(id, dir, message) {
  return { id, dir, message: String(message) };
}

function formatCatalogErrors(errors) {
  return `组件目录校验失败:\n${errors.map((error) => `- ${error.id}: ${error.message}`).join("\n")}`;
}
