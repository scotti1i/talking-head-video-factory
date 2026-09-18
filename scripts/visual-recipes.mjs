import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, writeJson } from "./lib.mjs";
import {
  buildShotcraftRegistry,
  compactRecipeLine,
  loadRecipeRegistry,
  searchRecipeRegistry
} from "./visual-recipe-registry.mjs";

export function syncShotcraftRegistry({ source, root = projectRoot() }) {
  const registry = buildShotcraftRegistry(source);
  const output = path.join(root, "visual-recipes", "shotcraft-registry.json");
  writeJson(output, registry);
  return { output, registry };
}

export function loadProductionCatalog({ root = projectRoot() } = {}) {
  const file = path.join(root, "visual-recipes", "production.json");
  if (!fs.existsSync(file)) throw new Error(`缺少生产许可目录: ${file}`);
  return readJson(file);
}

function main(argv = process.argv.slice(2)) {
  const [command = "search", ...rest] = argv;
  const args = parseArgs(rest);
  if (command === "sync") {
    const source = path.resolve(String(args.source || (process.env.SHOTCRAFT_SOURCE || (process.env.HOME || "") + "/.codex/skills/video-shotcraft")));
    const { output, registry } = syncShotcraftRegistry({ source });
    console.log(`已同步 ${registry.recipes.length} 张 Shotcraft 配方: ${output}`);
    return;
  }

  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const productionIds = new Set(production.families.flatMap((family) => family.recipeIds));
  if (command === "list") {
    const scope = args.scope === "all" ? null : productionIds;
    for (const recipe of searchRecipeRegistry(registry, "", { limit: args.limit || 999, productionIds: scope })) {
      console.log(compactRecipeLine(recipe));
    }
    return;
  }
  if (command === "show") {
    const id = String(args.id || "");
    const normalized = id.startsWith("shotcraft/") ? id : `shotcraft/${id}`;
    const recipe = registry.recipes.find((item) => item.id === normalized);
    if (!recipe) throw new Error(`未找到配方: ${id}`);
    const productionEntry = findProductionRecipe(production, normalized);
    console.log(JSON.stringify({
      ...recipe,
      production: productionEntry
        ? {
            status: productionIds.has(normalized) ? "production-approved" : "reference-preview",
            availability: productionEntry.availability,
            adaptationMode: productionEntry.adaptationMode || null,
            contentContract: productionEntry.contentContract || null,
            fixedFrames: productionEntry.frames,
            sourceFiles: productionEntry.sourceFiles
          }
        : null
    }, null, 2));
    return;
  }
  if (command !== "search") throw new Error(`未知命令 ${command}；可用 sync/search/list/show`);
  const query = String(args.query || args.q || "").trim();
  if (!query) throw new Error("search 需要 --query");
  const scope = args.scope === "all" ? null : productionIds;
  const recipes = searchRecipeRegistry(registry, query, { limit: args.limit || 8, productionIds: scope });
  if (!recipes.length) {
    console.log("没有匹配的生产配方；上下文不足时回退人物画面，不得凭空造卡。可加 --scope all 查看尚未移植的候选。");
    return;
  }
  for (const recipe of recipes) console.log(compactRecipeLine(recipe));
}

function findProductionRecipe(production, recipeId) {
  for (const family of production.families || []) {
    const recipe = family.implementation?.recipes?.[recipeId];
    if (recipe) return recipe;
  }
  return null;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
