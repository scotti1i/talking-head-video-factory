import assert from "node:assert/strict";
import test from "node:test";

import {
  TRANSITION_TYPES,
  needsFlashOverlay,
  normalizeTransitionPreset,
  renderTransitionPresetTimeline
} from "./transition-presets.mjs";

test("四档 preset 合同稳定，cut 保持旧结构", () => {
  assert.deepEqual([...TRANSITION_TYPES], ["cut", "focus-dissolve", "whip-blur", "flash"]);
  assert.deepEqual(normalize(), { type: "cut", enter: 0, exit: 0 });
  assert.deepEqual(normalize({ type: "cut", duration: 0.2 }), { type: "cut", enter: 0, exit: 0 });
  assert.equal(needsFlashOverlay({ type: "flash" }), true);
  assert.equal(needsFlashOverlay({ type: "whip-blur" }), false);
});

test("旧 focus-dissolve enter/exit 与新 duration 短写均可用", () => {
  assert.deepEqual(normalize({ type: "focus-dissolve", enter: 0.46, exit: 0.36 }), {
    type: "focus-dissolve",
    enter: 0.46,
    exit: 0.36
  });
  assert.deepEqual(normalize({ type: "focus-dissolve", duration: 0.3, exit: 0 }), {
    type: "focus-dissolve",
    enter: 0.3,
    exit: 0
  });
});

test("whip 默认 0.17 秒并冻结方向，flash 默认无退出闪白", () => {
  assert.deepEqual(normalize({ type: "whip-blur", direction: "right" }), {
    type: "whip-blur",
    enter: 0.17,
    exit: 0.17,
    direction: "right"
  });
  assert.deepEqual(normalize({ type: "flash" }), {
    type: "flash",
    enter: 0.2,
    exit: 0
  });
});

test("所有 timeline 都是绝对时间、无回调的 seek-safe 字符串", () => {
  for (const transition of [
    { type: "cut", enter: 0, exit: 0 },
    { type: "focus-dissolve", enter: 0.3, exit: 0.3 },
    { type: "whip-blur", enter: 0.17, exit: 0.17, direction: "left" },
    { type: "flash", enter: 0.2, exit: 0 }
  ]) {
    const timeline = renderTransitionPresetTimeline({
      id: "proof",
      start: 2,
      end: 6,
      speakerPip: false,
      transition
    });
    assert.match(timeline, /tl\.(set|to)\(/);
    assert.doesNotMatch(timeline, /setTimeout|requestAnimationFrame|onComplete|repeat|Math\.random/);
    assert.doesNotMatch(timeline, /tl\.(call|addPause)\(/);
  }
});

function normalize(value) {
  return normalizeTransitionPreset(value, { label: "clip(proof)", clipDuration: 4 });
}
