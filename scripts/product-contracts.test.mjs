import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadFineCutRegistry, resolveFineCutPreset } from "./fine-cut-policy.mjs";
import { applyTemplatePack, loadTemplatePack, loadTemplatePackRegistry, resolveTemplatePack, stageTemplatePackAssets } from "./template-pack.mjs";

test("精剪预设只改变气口策略，不允许重排或删除独有脚本", () => {
  const registry = loadFineCutRegistry();
  assert.deepEqual(Object.keys(registry.presets), ["natural", "standard", "tight", "social-fast"]);
  assert.equal(resolveFineCutPreset({ editorial: {} }, registry).id, "standard");
  assert.equal(resolveFineCutPreset({ profile: "factory-acquisition", editorial: {} }, registry).id, "social-fast");
  assert.equal(resolveFineCutPreset({ profile: "factory-acquisition", editorial: {} }, registry).maxOpeningSilenceSeconds, 0.08);
  assert.equal(resolveFineCutPreset({ profile: "factory-acquisition", editorial: {} }, registry).maxAdjacentSpeechWindowJumpDb, 4);
  assert.equal(resolveFineCutPreset({ profile: "factory-acquisition", editorial: { fineCutPreset: "tight" } }, registry).id, "tight");
  assert.equal(resolveFineCutPreset({ editorial: { fineCutPreset: "tight" } }, registry).breathSeconds.max, 0.24);
  assert.throws(() => resolveFineCutPreset({ editorial: { fineCutPreset: "viral" } }, registry), /未知精剪预设/);
});

test("模板包是视觉合同，不覆盖显式 job 配置", () => {
  const registry = loadTemplatePackRegistry();
  assert.equal(registry.default, "factory-proof");
  for (const id of registry.packs) assert.equal(loadTemplatePack(id).id, id);
  const pack = loadTemplatePack("factory-clean");
  assert.equal(pack.theme, "warm-minimal");
  const resolved = applyTemplatePack({
    profile: "factory-acquisition",
    templatePack: "factory-clean",
    caption: { maxCharsPerLine: 24 },
    variants: [{ layout: "vertical" }]
  });
  assert.equal(resolved.project.theme, "warm-minimal");
  assert.equal(resolved.project.caption.maxCharsPerLine, 24);
  assert.equal(resolved.project.caption.singleLine, false);
  const commerce = loadTemplatePack("factory-commerce-pop");
  assert.equal(commerce.theme, "commerce-pop");
  assert.equal(commerce.caption.fontSize, 64);
  assert.equal(commerce.brollPolicy.maxCoverage, 0.25);
});

test("pack.json 只允许脚本真读的字段，散文式规则必须失败关闭", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pack-fields-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "themes", "warm-minimal"), { recursive: true });
  fs.writeFileSync(path.join(root, "themes", "warm-minimal", "theme.json"), "{}\n");
  fs.mkdirSync(path.join(root, "template-packs", "prose"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "template-packs", "registry.json"),
    JSON.stringify({ schemaVersion: 1, default: "prose", packs: ["prose"] })
  );
  const base = {
    schemaVersion: 1,
    id: "prose",
    label: "L",
    description: "D",
    theme: "warm-minimal",
    compatibleProfiles: ["factory-acquisition"],
    compatibleLayouts: ["vertical"],
    brollPolicy: { maxCoverage: 0.2 }
  };
  const write = (pack) => fs.writeFileSync(path.join(root, "template-packs", "prose", "pack.json"), JSON.stringify(pack));
  write(base);
  assert.equal(loadTemplatePack("prose", root).id, "prose");
  write({ ...base, captionPolicy: { timing: "lip-sync" } });
  assert.throws(() => loadTemplatePack("prose", root), /captionPolicy/);
  write({ ...base, requiredWorkflow: { profile: "factory-acquisition" } });
  assert.throws(() => loadTemplatePack("prose", root), /requiredWorkflow/);
  write({ ...base, brollPolicy: { maxCoverage: 0.2, continuity: "never-flash-aroll" } });
  assert.throws(() => loadTemplatePack("prose", root), /brollPolicy 含脚本不读取的字段 continuity/);
});

test("模板包对 profile 失败关闭", () => {
  assert.throws(
    () => resolveTemplatePack({ profile: "clean-talkinghead", templatePack: "factory-proof", variants: [{ layout: "vertical" }] }),
    /不支持 profile/
  );
});

test("无内置媒体资产的公共模板不会向 job 注入第三方文件", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pack-assets-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const pack = loadTemplatePack("factory-proof");
  const staged = stageTemplatePackAssets({ pack, jobDir });
  assert.deepEqual(staged, []);
});

test("commerce-pop 只注入模板包声明的通用音效和贴纸", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-commerce-pop-assets-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const pack = loadTemplatePack("factory-commerce-pop");
  const staged = stageTemplatePackAssets({ pack, jobDir });
  assert.deepEqual(staged, [
    "assets/sfx/pop-soft.wav",
    "assets/sfx/final-ding.wav",
    "assets/sfx/click-confirm.wav",
    "assets/sfx/follow-confirm.wav",
    "assets/stickers/web-globe-teaser.svg"
  ]);
  for (const relativePath of staged) {
    const filePath = path.join(jobDir, ...relativePath.split("/"));
    assert.ok(fs.statSync(filePath).size > 0, `${filePath} 应为非空文件`);
  }
});

test("B2B 获客模板只注入原创通用资产，并把字幕排版交给 pack.json 单源", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-b2b-leadgen-assets-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const pack = loadTemplatePack("factory-b2b-leadgen");
  assert.equal(pack.version, "1.0.1");
  assert.equal(pack.theme, "commerce-pop");
  assert.equal(pack.caption.fontSize, 66);
  assert.equal(pack.caption.placement, "tiktok-safe");
  assert.deepEqual(pack.compatibleProfiles, ["factory-acquisition"]);
  assert.ok(pack.components.includes("hook-stack-banner"));
  const resolved = applyTemplatePack({
    profile: "factory-acquisition",
    templatePack: "factory-b2b-leadgen",
    variants: [{ layout: "vertical" }]
  });
  assert.equal(resolved.project.caption.fontSize, 66);
  assert.equal(resolved.project.caption.safeBottom, 550);
  const staged = stageTemplatePackAssets({ pack, jobDir });
  assert.equal(staged.length, 10);
  assert.ok(staged.includes("assets/sfx/card-soft-rise.wav"));
  assert.ok(staged.includes("assets/stickers/contact-mail.svg"));
  for (const relativePath of staged) {
    const filePath = path.join(jobDir, ...relativePath.split("/"));
    assert.ok(fs.statSync(filePath).size > 0, `${filePath} 应为非空文件`);
  }
});
