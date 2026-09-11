import assert from "node:assert/strict";
import test from "node:test";

import { buildArollBeautyFilter, loadArollBeautyRegistry, resolveArollBeautyPreset } from "./aroll-beauty-preset.mjs";

test("默认 A-roll 美颜预设是非生成式、身份保持的确定性滤镜链", () => {
  const registry = loadArollBeautyRegistry();
  const preset = resolveArollBeautyPreset(undefined, registry);
  const filter = buildArollBeautyFilter(preset);
  assert.equal(preset.id, "factory-neutral-skin-v1");
  assert.equal(preset.policy.nonGenerative, true);
  assert.equal(preset.policy.identityPreserving, true);
  assert.match(filter, /^colorbalance=/);
  assert.match(filter, /,eq=/);
  assert.match(filter, /,bilateral=/);
  assert.match(filter, /,unsharp=/);
  assert.doesNotMatch(filter, /random|download|http/i);
  assert.equal(filter, buildArollBeautyFilter(preset));
});

test("未知 A-roll 美颜预设失败关闭", () => {
  assert.throws(() => resolveArollBeautyPreset("unknown"), /未知 A-roll 美颜预设/);
});
