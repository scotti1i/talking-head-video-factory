import assert from "node:assert/strict";
import test from "node:test";

import { buildSteps } from "./runner.mjs";

test("Console 字幕动作复用缓存，不调用旧重复 Whisper", () => {
  const steps = buildSteps("demo", "transcribe");
  const command = steps.flatMap((item) => [item.cmd, ...item.args]).join(" ");
  assert.match(command, /captions:build/);
  assert.doesNotMatch(command, /transcribe-captions/);
});

test("抖音执行链走 variant 主链和统一音频 QA", () => {
  const steps = buildSteps("demo", "chain", { targets: ["douyin"] });
  const command = steps.map((item) => item.args.join(" ")).join("\n");
  assert.match(command, /build:variants/);
  assert.match(command, /render:variants/);
  assert.match(command, /deliver:variants/);
  assert.doesNotMatch(command, /build:beats/);
});

test("旧 cuts 动作只能显式走 legacy alias", () => {
  const steps = buildSteps("demo", "apply-cuts");
  assert.equal(steps[0].args.includes("legacy:roughcut:apply"), true);
});

test("单独 QA 只检查既有成片，不会隐式重渲染", () => {
  const steps = buildSteps("demo", "qa");
  const command = steps[0].args.join(" ");
  assert.match(command, /qa:variants/);
  assert.doesNotMatch(command, /render:variants/);
});
