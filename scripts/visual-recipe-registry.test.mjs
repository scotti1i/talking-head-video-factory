import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { projectRoot, readJson } from "./lib.mjs";
import {
  buildShotcraftRegistry,
  searchRecipeRegistry,
  validateRecipeRegistry
} from "./visual-recipe-registry.mjs";

const root = projectRoot();
const source = (process.env.SHOTCRAFT_SOURCE || (process.env.HOME || "") + "/.codex/skills/video-shotcraft");
// 上游 video-shotcraft 全库不随仓库分发（SHOTCRAFT_SOURCE 或 ~/.codex/skills/video-shotcraft）；
// 没有它的机器（学员机 / Linux 对齐容器）跳过这三条全库测试，不当失败（2026-09-18）
const hasLibrary = fs.existsSync(path.join(source, "gallery", "api", "library.json"));
const skipReason = hasLibrary ? false : `缺少上游 Shotcraft 全库 ${source}，跳过（设 SHOTCRAFT_SOURCE 指向本地副本可启用）`;

test("Shotcraft 全库生成可验证的能力注册表", { skip: skipReason }, () => {
  const registry = buildShotcraftRegistry(source);
  assert.equal(registry.recipes.length >= 150, true);
  assert.deepEqual(validateRecipeRegistry(registry), []);
  assert.equal(registry.recipes.every((recipe) => recipe.variants.every((variant) => variant.sourceCandidates.length)), true);
});

test("检索会把图表配方排在数据查询前列", { skip: skipReason }, () => {
  const registry = buildShotcraftRegistry(source);
  const results = searchRecipeRegistry(registry, "data 图表 指标", { limit: 12 });
  assert.equal(results.length > 0, true);
  assert.equal(results.some((recipe) => recipe.category === "data"), true);
});

test("生产目录只引用全库存在的配方", { skip: skipReason }, () => {
  const registry = buildShotcraftRegistry(source);
  const ids = new Set(registry.recipes.map((recipe) => recipe.id));
  const production = readJson(path.join(root, "visual-recipes", "production.json"));
  const missing = production.families.flatMap((family) => family.recipeIds).filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test("Planner 可见的生产配方都已有可替换内容的直接移植接口", () => {
  const production = readJson(path.join(root, "visual-recipes", "production.json"));
  for (const family of production.families) {
    for (const id of family.recipeIds) {
      const implementation = family.implementation?.recipes?.[id];
      assert.equal(implementation?.availability, "content-adaptable", id);
      assert.equal(implementation?.adaptationMode, "direct-port", id);
      assert.equal(Boolean(implementation?.contentContract?.required?.length), true, id);
    }
  }
});
