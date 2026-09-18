import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { approveRecipeQa, buildRecipeQaReport, validateRecipeQaApproval } from "./visual-recipe-qa.mjs";

test("四阶段审查批准与具体渲染哈希绑定，媒体变化后立即失效", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "visual-recipe-qa-"));
  const media = path.join(job, "assets", "visual-recipes", "shot.mp4");
  write(media, "render-v1");
  writeJson(path.join(job, "data", "recipe-renders.json"), {
    schemaVersion: 1,
    renders: [{
      id: "shot",
      recipeId: "shotcraft/paper-title-card",
      output: "assets/visual-recipes/shot.mp4",
      expectedDuration: 55 / 30
    }]
  });
  const imageWriter = (_input, output) => write(output, "qa-image");
  buildRecipeQaReport(job, {
    durationProbe: () => 55 / 30,
    stripGenerator: imageWriter,
    overviewGenerator: imageWriter
  });
  approveRecipeQa(job, { reviewer: "reviewer", method: "four-phase-filmstrip", notes: "逐阶段检查通过。" });
  assert.equal(validateRecipeQaApproval(job).ok, true);
  fs.writeFileSync(media, "render-v2");
  const stale = validateRecipeQaApproval(job);
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join("\n"), /渲染媒体已变化/);
});

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function writeJson(file, value) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}
