import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadFineCutRegistry, resolveFineCutPreset } from "./fine-cut-policy.mjs";
import { applyTemplatePack, loadTemplatePack, loadTemplatePackRegistry, resolveTemplatePack, stageTemplatePackAssets } from "./template-pack.mjs";

test("精剪预设只改变气口策略，不允许重排或删除独有脚本", () => {
  const registry = loadFineCutRegistry();
  assert.deepEqual(Object.keys(registry.presets), ["natural", "standard", "tight"]);
  assert.equal(resolveFineCutPreset({ editorial: {} }, registry).id, "standard");
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
