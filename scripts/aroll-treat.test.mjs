import assert from "node:assert/strict";
import test from "node:test";
import { buildTreatFilters, expectedMasterDuration, loadTreatRegistry, resolveTreatPreset } from "./aroll-treat.mjs";

test("注册表合法，factory-acquisition 默认 social-fast-v1（1.1 倍速）", () => {
  const registry = loadTreatRegistry();
  assert.ok(registry.presets["social-fast-v1"]);
  assert.equal(resolveTreatPreset({ profile: "factory-acquisition" }, undefined, registry).id, "social-fast-v1");
  assert.equal(resolveTreatPreset({ profile: "factory-acquisition" }, undefined, registry).playbackRate, 1.1);
  assert.equal(resolveTreatPreset({}, undefined, registry).id, registry.default);
  assert.equal(resolveTreatPreset({ aroll: { treat: "passthrough" } }, undefined, registry).id, "passthrough");
  assert.throws(() => resolveTreatPreset({}, "nope", registry), /未知 A-roll 处理预设/);
});

test("倍速滤镜：视频 setpts+fps，音频 atempo 插在对白链与限幅之间；直通返回 null", () => {
  const registry = loadTreatRegistry();
  const social = buildTreatFilters(resolveTreatPreset({}, "social-fast-v1", registry), { fps: 60 });
  assert.match(social.video, /^setpts=PTS\/1\.1,.*fps=60,format=yuv420p$/);
  assert.match(social.audio, /acompressor[^,]*,atempo=1\.1,alimiter[^,]*,aresample=48000$/);
  const natural = buildTreatFilters(resolveTreatPreset({}, "natural-v1", registry), { fps: 30 });
  assert.doesNotMatch(natural.video, /setpts/);
  assert.doesNotMatch(natural.audio, /atempo/);
  assert.equal(buildTreatFilters(resolveTreatPreset({}, "passthrough", registry), { fps: 30 }), null);
});

test("工作母版预期时长 = EDL 累加 / 倍率", () => {
  const edl = [{ sourceStart: 1, sourceEnd: 3.2 }, { sourceStart: 10, sourceEnd: 12.3 }];
  assert.equal(Math.round(expectedMasterDuration(edl, 1.1) * 1000) / 1000, 4.091);
  assert.equal(Math.round(expectedMasterDuration(edl, 1) * 1000) / 1000, 4.5);
});
