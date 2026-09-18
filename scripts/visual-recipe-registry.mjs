import fs from "node:fs";
import path from "node:path";

import { projectRoot, readJson } from "./lib.mjs";

export const VISUAL_JOBS = [
  "hook",
  "evidence",
  "definition",
  "data",
  "comparison",
  "relationship",
  "process",
  "sequence",
  "emphasis",
  "transition",
  "cta"
];

const CATEGORY_JOBS = {
  opening: ["hook", "emphasis"],
  typography: ["definition", "emphasis"],
  "ui-entrance": ["evidence", "sequence"],
  camera: ["evidence", "transition"],
  data: ["data", "comparison", "relationship"],
  interaction: ["process", "evidence"],
  transition: ["transition"],
  rhythm: ["sequence", "emphasis"],
  effects: ["emphasis"],
  outro: ["cta"]
};

const KEYWORD_JOBS = [
  ["对比|前后|before.after|versus|slider", "comparison"],
  ["关系|汇聚|节点|拓扑|环图|diagram|map|merge|converge|hub", "relationship"],
  ["流程|步骤|生成|级联|串联|路径|process|step|cascade|timeline", "process"],
  ["证据|截图|页面|文档|研究|卡片|界面|evidence|page|document|research|ui", "evidence"],
  ["数据|图表|指标|数字|计数|chart|data|metric|counter|gauge|odometer", "data"],
  ["定义|概念|解释|名词|definition|explanation", "definition"],
  ["开场|片头|品牌|opening|intro|hero", "hook"],
  ["收尾|结尾|品牌落版|outro|logo", "cta"],
  ["转场|换页|承接|transition|wipe|cut", "transition"],
  ["列表|依次|逐条|堆叠|序列|list|stack|sequence|carousel", "sequence"]
];

const JOB_REQUIREMENTS = {
  hook: ["approved-opening-claim"],
  evidence: ["real-source-asset", "source-provenance", "highlight-target"],
  definition: ["approved-term", "plain-language-definition"],
  data: ["verified-data", "unit", "source-provenance"],
  comparison: ["comparable-before-after-assets", "comparison-basis"],
  relationship: ["named-entities", "verified-relationship"],
  process: ["ordered-steps", "causal-or-sequential-basis"],
  sequence: ["ordered-items"],
  emphasis: ["verbatim-or-approved-claim"],
  transition: ["adjacent-shot-motion"],
  cta: ["approved-cta"]
};

export function buildShotcraftRegistry(sourceRoot) {
  const libraryPath = path.join(sourceRoot, "gallery", "api", "library.json");
  if (!fs.existsSync(libraryPath)) throw new Error(`缺少 Shotcraft library.json: ${libraryPath}`);
  const library = readJson(libraryPath);
  const recipes = library.cards.map((card) => buildRecipe(sourceRoot, card));
  const registry = {
    schemaVersion: 1,
    id: "video-shotcraft",
    label: "Video Shotcraft",
    source: {
      url: "https://github.com/Vincentwei1021/video-shotcraft",
      revision: library.revision,
      generatedAt: library.generatedAt,
      license: "Apache-2.0"
    },
    policy: {
      renderer: "remotion",
      sourceFidelity: "direct-port",
      defaultFormat: "landscape",
      productionRule: "catalogued recipes are discoverable; only production-approved recipes may render"
    },
    categories: library.categories,
    recipes: recipes.sort((a, b) => a.id.localeCompare(b.id, "en"))
  };
  const errors = validateRecipeRegistry(registry);
  if (errors.length) throw new Error(`Shotcraft 注册表生成失败:\n- ${errors.join("\n- ")}`);
  return registry;
}

export function validateRecipeRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Array.isArray(registry?.recipes) || !registry.recipes.length) {
    errors.push("recipes 必须是非空数组");
    return errors;
  }
  const ids = new Set();
  for (const [index, recipe] of registry.recipes.entries()) {
    const label = `recipes[${index}]`;
    if (!String(recipe?.id || "").startsWith("shotcraft/")) errors.push(`${label}.id 无效`);
    else if (ids.has(recipe.id)) errors.push(`${label}.id 重复: ${recipe.id}`);
    else ids.add(recipe.id);
    for (const field of ["summary", "use", "duration", "energy", "category", "sourceRecipe"]) {
      if (!String(recipe?.[field] || "").trim()) errors.push(`${label}.${field} 不能为空`);
    }
    if (!Array.isArray(recipe.visualJobs) || !recipe.visualJobs.length) errors.push(`${label}.visualJobs 不能为空`);
    else for (const job of recipe.visualJobs) if (!VISUAL_JOBS.includes(job)) errors.push(`${label}.visualJobs 无效: ${job}`);
    if (!Array.isArray(recipe.variants) || !recipe.variants.length) errors.push(`${label}.variants 不能为空`);
    for (const [variantIndex, variant] of (recipe.variants || []).entries()) {
      if (!String(variant?.id || "").trim()) errors.push(`${label}.variants[${variantIndex}].id 不能为空`);
      if (!Array.isArray(variant?.sourceCandidates) || !variant.sourceCandidates.length) {
        errors.push(`${label}.variants[${variantIndex}] 缺少 TSX sourceCandidates`);
      }
    }
  }
  return errors;
}

export function loadRecipeRegistry({ root = projectRoot() } = {}) {
  const file = path.join(root, "visual-recipes", "shotcraft-registry.json");
  if (!fs.existsSync(file)) throw new Error(`缺少视觉配方注册表: ${file}；先运行 npm run visual:recipes:sync`);
  const registry = readJson(file);
  const errors = validateRecipeRegistry(registry);
  if (errors.length) throw new Error(`视觉配方注册表无效:\n- ${errors.join("\n- ")}`);
  return registry;
}

export function searchRecipeRegistry(registry, query, { limit = 8, productionIds = null } = {}) {
  const terms = queryTerms(query);
  const candidates = registry.recipes
    .filter((recipe) => !productionIds || productionIds.has(recipe.id))
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, terms) }))
    .filter((item) => !terms.length || item.score > 0)
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id, "en"));
  return candidates.slice(0, Math.max(1, Number(limit) || 8)).map((item) => item.recipe);
}

export function compactRecipeLine(recipe) {
  const variants = recipe.variants.map((item) => item.id).join(",");
  return `${recipe.id} | job=${recipe.visualJobs.join(",")} | ${recipe.duration} | ${recipe.energy} | variants=${variants} | ${recipe.use}`;
}

function buildRecipe(sourceRoot, card) {
  const demoDir = resolveDemoDir(sourceRoot, card);
  const allCandidates = fs.existsSync(demoDir)
    ? fs.readdirSync(demoDir)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => path.relative(sourceRoot, path.join(demoDir, file)).split(path.sep).join(path.posix.sep))
      .sort()
    : [];
  const searchable = [card.name, card.summary, card.use, card.intention, ...(card.tags || [])].join(" ");
  const visualJobs = inferVisualJobs(card.category, searchable);
  const requirements = [...new Set(visualJobs.flatMap((job) => JOB_REQUIREMENTS[job] || []))];
  const requirementsByJob = Object.fromEntries(visualJobs.map((job) => [job, JOB_REQUIREMENTS[job] || []]));
  const variants = card.styles.map((style) => ({
    id: style.key,
    label: style.label,
    description: style.description,
    sourceCandidates: rankSourceCandidates(style.key, allCandidates)
  }));
  return {
    id: `shotcraft/${card.name}`,
    familyId: card.name,
    summary: card.summary,
    use: card.use,
    intention: card.intention,
    duration: card.duration,
    energy: card.energy,
    category: card.category,
    tags: card.tags || [],
    visualJobs,
    requirements,
    requirementsByJob,
    variants,
    sourceRecipe: card.source,
    sourceRecipeUrl: card.sourceUrl,
    referencePoster: `gallery/media/poster/${card.name}.jpg`,
    formatSupport: { landscape: "verified", portrait: "unverified" },
    renderer: "remotion",
    sourceFidelity: "direct-port",
    license: "Apache-2.0"
  };
}

function resolveDemoDir(sourceRoot, card) {
  const expected = path.join(sourceRoot, "demos", card.category, card.name);
  if (fs.existsSync(expected)) return expected;
  const demosRoot = path.join(sourceRoot, "demos");
  const matches = fs.readdirSync(demosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(demosRoot, entry.name, card.name))
    .filter((dir) => fs.existsSync(dir));
  if (matches.length !== 1) return expected;
  return matches[0];
}

function inferVisualJobs(category, text) {
  const jobs = new Set(CATEGORY_JOBS[category] || []);
  for (const [pattern, job] of KEYWORD_JOBS) if (new RegExp(pattern, "i").test(text)) jobs.add(job);
  return [...jobs].filter((job) => VISUAL_JOBS.includes(job));
}

function rankSourceCandidates(styleKey, candidates) {
  if (!candidates.length) return [];
  const target = normalizeKey(styleKey);
  return [...candidates].sort((a, b) => candidateScore(b, target) - candidateScore(a, target) || a.localeCompare(b));
}

function candidateScore(file, target) {
  const key = normalizeKey(path.basename(file, ".tsx"));
  if (key === target) return 100;
  if (key.startsWith(target) || target.startsWith(key)) return 80;
  const targetParts = new Set(splitKey(target));
  const parts = splitKey(key);
  return parts.reduce((score, part) => score + (targetParts.has(part) ? 8 : 0), 0);
}

function splitKey(value) {
  return String(value).match(/[a-z]+|\d+|[\u3400-\u9fff]/gi) || [];
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/v\d+$/i, "").replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function queryTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[\s,，、/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreRecipe(recipe, terms) {
  if (!terms.length) return 1;
  const id = recipe.id.toLowerCase();
  const jobs = recipe.visualJobs.join(" ").toLowerCase();
  const tags = recipe.tags.join(" ").toLowerCase();
  const prose = `${recipe.summary} ${recipe.use} ${recipe.intention}`.toLowerCase();
  return terms.reduce((score, term) => {
    if (id.includes(term)) score += 12;
    if (jobs.includes(term)) score += 10;
    if (tags.includes(term)) score += 7;
    if (prose.includes(term)) score += 4;
    return score;
  }, 0);
}
