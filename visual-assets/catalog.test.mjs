import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listVisualLibrary } from "../console/visual-library.mjs";

const EXPECTED_FAMILIES = [
  "beats-v2-face-safe",
  "brandkit-neon-rich-v1",
  "claude-glass-v0",
  "legacy-neon-guides",
  "salesmartly-commercial",
  "shorts-info-overlay-v1",
  "warm-minimal-v0",
  "youtube-horizontal-agent-v2",
  "youtube-horizontal-explainer-v1"
];

test("生产目录包含九套去重视觉家族", () => {
  const library = listVisualLibrary();
  assert.deepEqual(library.families.map((family) => family.id).sort(), EXPECTED_FAMILIES);
  assert.equal(library.counts.families, 9);
  assert.deepEqual(new Set(library.assets.map((asset) => asset.kind)), new Set([
    "theme",
    "component",
    "layout",
    "preset",
    "legacy-composition"
  ]));
  const active = library.families.find((family) => family.id === "beats-v2-face-safe");
  assert.deepEqual(active.formats.map((format) => format.id), ["vertical", "horizontal"]);
});

test("历史家族与全部历史结构都有可看的冻结预览", () => {
  const library = listVisualLibrary();
  const historical = library.families.filter((family) => family.id !== "beats-v2-face-safe");
  for (const family of historical) {
    assert.equal(family.preview.state, "ready", `${family.id} family preview`);
    for (const item of family.items) {
      assert.equal(item.preview.state, "ready", `${family.id}/${item.id}`);
      assert.ok(item.preview.posterUrl || item.preview.loopUrl, `${family.id}/${item.id} media`);
    }
  }
});

test("坏 family、component 和 theme manifest 仍返回为错误资产", (t) => {
  const root = fixtureRoot(t);
  write(root, "visual-assets/families/good.json", JSON.stringify(family("good")));
  write(root, "visual-assets/families/broken.json", "{ nope");
  write(root, "components/broken-component/component.json", "[broken");
  write(root, "themes/registry.json", JSON.stringify({ default: "broken-theme", themes: ["broken-theme"] }));
  write(root, "themes/broken-theme/theme.json", "{ broken");

  const library = listVisualLibrary({ root });
  assert.equal(library.families.length, 2);
  assert.equal(library.families.find((asset) => asset.id === "broken").health.state, "error");
  assert.equal(library.components.find((asset) => asset.id === "broken-component").health.state, "error");
  assert.equal(library.themes.find((asset) => asset.id === "broken-theme").health.state, "error");
  assert.ok(library.errors.some((error) => error.code === "manifest_invalid"));
});

test("预览 manifest 与 jobs beats 使用记录会合并到自动发现组件", (t) => {
  const root = fixtureRoot(t);
  write(root, "visual-assets/families/beats-v2-face-safe.json", JSON.stringify(family("beats-v2-face-safe")));
  write(root, "components/statement/component.json", JSON.stringify({
    schemaVersion: 1,
    id: "statement",
    label: "判断金句",
    kind: "component",
    category: "emphasis",
    description: "突出一句判断。",
    version: "1.0.0",
    lifecycle: "published",
    compatibility: "supported",
    formats: ["portrait", "landscape"],
    requiredFields: ["body", "accent"],
    optionalFields: [],
    tags: ["判断"],
    source: "fixture",
    apply: { mode: "beat", type: "statement" }
  }));
  write(root, "components/statement/render.mjs", "export function render() { return ''; }");
  write(root, "components/statement/style.css", ".beat-statement {}");
  write(root, "components/statement/fixtures.json", "[]");
  write(root, "themes/registry.json", JSON.stringify({ default: "test", themes: ["test"] }));
  write(root, "themes/test/theme.json", JSON.stringify({ id: "test", label: "Test", tokens: {} }));
  write(root, "jobs/demo/project.json", JSON.stringify({ title: "Demo", theme: "test", width: 1920, height: 1080 }));
  write(root, "jobs/demo/data/beats.json", JSON.stringify([{ type: "statement" }, { type: "statement" }]));
  write(root, "out/visual-library/cache/hash/index.html", "<main></main>");
  write(root, "out/visual-library/cache/hash/poster.webp", "poster");
  write(root, "out/visual-library/cache/hash/result.json", "{}");
  write(root, "out/visual-library/cache/last-good/index.html", "<main>last good</main>");
  write(root, "out/visual-library/cache/last-good/poster.webp", "last good poster");
  write(root, "out/visual-library/manifest.json", JSON.stringify({
    cells: {
      "statement/test/landscape": {
        component: "statement",
        theme: "test",
        format: "landscape",
        status: "ready",
        cachePath: "out/visual-library/cache/hash",
        posterPath: "out/visual-library/cache/hash/poster.webp",
        resultPath: "out/visual-library/cache/hash/result.json"
      },
      "statement/test/portrait": {
        component: "statement",
        theme: "test",
        format: "portrait",
        status: "failed",
        cachePath: "out/visual-library/cache/new-hash",
        resultPath: "out/visual-library/cache/new-hash/result.json",
        lastGoodHash: "last-good",
        error: { "message": "snapshot failed" }
      }
    }
  }));

  const component = listVisualLibrary({ root }).components.find((asset) => asset.id === "statement");
  assert.deepEqual(component.formats.map((format) => format.id), ["vertical", "horizontal"]);
  assert.equal(component.preview.state, "ready");
  assert.equal(component.preview.posterUrl, "/files/out/visual-library/cache/hash/poster.webp");
  assert.equal(component.preview.loopUrl, "/files/out/visual-library/cache/hash/index.html");
  assert.equal(component.health.state, "error");
  assert.equal(component.previews.find((preview) => preview.state === "failed").posterUrl, "/files/out/visual-library/cache/last-good/poster.webp");
  assert.equal(component.usage.count, 1);
  assert.equal(component.usage.beatCount, 2);
  assert.equal(component.apply.enabled, true);
});

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-library-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function family(id) {
  return {
    schemaVersion: 1,
    id,
    label: id,
    kind: "preset",
    lifecycle: "published",
    compatibility: "supported",
    formats: ["vertical"],
    items: [{ id: "statement", label: "Statement", kind: "component" }],
    apply: { mode: "preset", payload: { preset: id } }
  };
}
