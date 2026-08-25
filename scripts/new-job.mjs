import fs from "node:fs";
import path from "node:path";
import { copyDir, parseArgs, projectRoot, readJson, sanitizeSlug, writeJson } from "./lib.mjs";
import { loadWorkflowRegistry, profileIds } from "./workflow-profile.mjs";
import { loadFineCutRegistry, resolveFineCutPreset } from "./fine-cut-policy.mjs";
import { applyTemplatePack, loadTemplatePackRegistry, resolveTemplatePack, stageTemplatePackAssets } from "./template-pack.mjs";

const args = parseArgs();
const slug = sanitizeSlug(args._[0] || args.slug);

if (!slug) {
  console.error("Usage: npm run new -- <slug>");
  process.exit(1);
}

const root = projectRoot();
const registry = loadWorkflowRegistry(root);
const templateDir = path.join(root, "templates", "job");
const jobDir = path.join(root, "jobs", slug);

if (fs.existsSync(jobDir)) {
  console.error(`Job already exists: ${jobDir}`);
  process.exit(1);
}

// 先验证所有用户输入，再创建目录。参数错误不能留下半成品 job。
const templateConfigPath = path.join(templateDir, "project.json");
let config = readJson(templateConfigPath);
config.slug = slug;
config.title = args.title || slug;
config.profile = String(args.profile || config.profile || registry.default);
if (!profileIds(registry).includes(config.profile)) {
  console.error(`Unknown profile: ${config.profile}. Available: ${profileIds(registry).join(", ")}`);
  process.exit(1);
}
config.policies = parseList(args.policies);
const unknownPolicies = config.policies.filter((id) => !registry.policies?.[id]);
if (unknownPolicies.length) {
  console.error(`Unknown policies: ${unknownPolicies.join(", ")}`);
  process.exit(1);
}
config.variants = selectTargets(config.variants, parseList(args.targets || "douyin"));
config.editorial = {
  ...(config.editorial || {}),
  fineCutPreset: String(args["fine-cut"] || config.editorial?.fineCutPreset || loadFineCutRegistry(root).default)
};
resolveFineCutPreset(config, loadFineCutRegistry(root));
const requestedTemplatePack = args["template-pack"]
  || (config.profile === "factory-acquisition" ? loadTemplatePackRegistry(root).default : "");
if (requestedTemplatePack) {
  config.templatePack = String(requestedTemplatePack);
  config = applyTemplatePack(config, root).project;
}
const selectedPlatforms = new Set(config.variants.map((item) => item.platform).filter(Boolean));
config.platform = selectedPlatforms.size === 1 ? [...selectedPlatforms][0] : "multi";
config.downloadFolderName = args.folder || defaultDownloadFolder(slug, config.variants);

copyDir(templateDir, jobDir);
stageTemplatePackAssets({ pack: resolveTemplatePack(config, root), jobDir, root });
const configPath = path.join(jobDir, "project.json");
writeJson(configPath, config);

console.log(`Created job: ${jobDir}`);
console.log(`Profile: ${config.profile}`);
console.log(`Fine cut: ${config.editorial.fineCutPreset}`);
if (config.templatePack) console.log(`Template pack: ${config.templatePack}`);
console.log(`Targets: ${config.variants.map((item) => `${item.id}/${item.platform}`).join(", ")}`);
console.log("Next:");
console.log(`  1. Put untouched recordings in ${path.join(jobDir, "assets", "originals")}`);
console.log(`  2. Run npm run inventory -- --job jobs/${slug}`);
console.log(`  3. Run npm run transcribe:editor -- --job jobs/${slug}`);
console.log(`  4. Review EDL/captions/beats, then run npm run build:beats -- --job jobs/${slug}`);

function parseList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function selectTargets(variants, requested) {
  const aliases = {
    douyin: "douyin-vertical",
    "douyin-vertical": "douyin-vertical",
    youtube: "youtube-horizontal",
    "youtube-horizontal": "youtube-horizontal"
  };
  const ids = requested.map((item) => aliases[item] || item);
  const available = new Map((variants || []).map((item) => [item.id, item]));
  const unknown = ids.filter((id) => !available.has(id));
  if (unknown.length) {
    console.error(`Unknown targets: ${unknown.join(", ")}. Available: ${[...available.keys()].join(", ")}`);
    process.exit(1);
  }
  return ids.map((id) => available.get(id));
}

function defaultDownloadFolder(slugValue, variants) {
  const date = new Date().toISOString().slice(0, 10);
  const platforms = new Set((variants || []).map((item) => item.platform));
  const suffix = platforms.size > 1
    ? "多平台成片"
    : platforms.has("youtube")
      ? "YouTube成片"
      : "抖音成片";
  return `${date}-${slugValue}-${suffix}`;
}
