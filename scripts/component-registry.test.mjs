import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectComponentCatalog, inspectComponentPackages, loadComponentCatalog } from "./component-registry.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

test("生产组件均可加载、支持竖横屏，并包含 trade-proof 组件", async () => {
  const catalog = await inspectComponentCatalog({ root: ROOT });
  assert.deepEqual(catalog.errors, []);
  assert.ok(catalog.components.length >= 14);
  const componentsById = new Map(catalog.components.map((component) => [component.id, component]));
  for (const id of ["micro-overlay", "impact-sticker", "proof-collage", "cta-badge"]) {
    assert.equal(componentsById.has(id), true, `缺少关键组件 ${id}`);
    assert.equal(componentsById.get(id).captionMode, "overlay");
  }
  for (const component of catalog.components) {
    assert.deepEqual(component.formats, ["portrait", "landscape"]);
    assert.ok(component.fixtures.length > 0);
  }
});

test("impact-sticker 覆盖六类语义、八种图标与命中时点合同", async () => {
  const catalog = await loadComponentCatalog({ root: ROOT });
  const component = catalog.find((item) => item.id === "impact-sticker");
  assert.ok(component);
  assert.deepEqual(
    component.fixtures.map((fixture) => fixture.beat.variant),
    ["question", "reject", "pivot", "action", "identity", "cta"]
  );

  for (const fixture of component.fixtures) {
    const html = component.render(fixture.beat);
    assert.match(html, new RegExp(`data-variant="${fixture.beat.variant}"`));
    assert.match(html, /data-impact-motion/);
    assert.match(html, /data-landing-frames="5"/);
  }

  for (const icon of ["package", "shipping", "clock", "source", "track", "lift", "message", "none"]) {
    const beat = { kicker: "SMALL TITLE", title: "MAIN TITLE", variant: "action", icon };
    assert.deepEqual(component.validate(beat), []);
    assert.match(component.render(beat), new RegExp(`data-icon="${icon}"`));
  }

  assert.match(component.validate({ kicker: "K", title: "T", variant: "toast" }).join(";"), /variant/);
  assert.match(
    component.validate({ kicker: "K", title: "T", variant: "pivot", strike: true }).join(";"),
    /strike 只用于 reject/
  );
  assert.match(
    component.validate({ kicker: "K", title: "T", variant: "pivot", hitOffset: -0.1 }).join(";"),
    /hitOffset/
  );
  assert.match(
    component.validate({
      kicker: "K",
      title: "T",
      variant: "pivot",
      start: 2,
      end: 2.4,
      hitOffset: 0.4
    }).join(";"),
    /小于 beat 时长/
  );
});

test("新增组件只需新增组件目录", async (context) => {
  const root = makeRoot(context);
  copyComponent("statement", root, "new-card");
  const catalog = await inspectComponentCatalog({ root });
  assert.deepEqual(catalog.errors, []);
  assert.deepEqual(catalog.components.map((item) => item.id), ["new-card"]);
  const fixture = catalog.components[0].fixtures[0].beat;
  assert.equal(catalog.components[0].render(fixture).includes(fixture.title), true);
});

test("坏组件在生产加载时严格失败", async (context) => {
  const root = makeRoot(context);
  copyComponent("statement", root, "broken-card");
  fs.rmSync(path.join(root, "components", "broken-card", "style.css"));
  const inspected = inspectComponentPackages({ root });
  assert.equal(inspected.components.length, 0);
  assert.match(inspected.errors[0].message, /style\.css/);
  await assert.rejects(loadComponentCatalog({ root }), /组件目录校验失败/);
});

test("App、builder、任务卡和预览生成器不保留组件白名单", () => {
  const files = [
    "console/public/app.js",
    "scripts/build-beats-composition.mjs",
    "console/prompts.mjs",
    "scripts/visual-preview-generate.mjs"
  ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
  assert.doesNotMatch(files, /BEAT_TYPES|currentComponents/);
  assert.match(files, /component-registry\.mjs|FactoryConsole\.setComponentCatalog/);
});

function makeRoot(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-components-"));
  fs.mkdirSync(path.join(root, "components"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", "lib.mjs"), path.join(root, "scripts", "lib.mjs"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function copyComponent(sourceId, root, targetId) {
  const target = path.join(root, "components", targetId);
  fs.cpSync(path.join(ROOT, "components", sourceId), target, { recursive: true });
  const manifestFile = path.join(target, "component.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.id = targetId;
  manifest.label = "测试组件";
  manifest.apply.type = targetId;
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}
