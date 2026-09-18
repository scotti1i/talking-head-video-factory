import assert from "node:assert/strict";
import test from "node:test";

import {
  audioEdgeFadeSeconds,
  classifyCutBoundary,
  selectCutReviewWindow
} from "./cut-boundary-policy.mjs";

test("只有位于静音内部并留足边距的切点才自动通过", () => {
  const silences = [{ start: 10, end: 10.2, duration: 0.2 }];
  assert.equal(classifyCutBoundary({ time: 10.1, silences }).severity, "ok");
  assert.equal(classifyCutBoundary({ time: 10.195, silences }).severity, "review");
});

test("距离静音边缘 0.25 秒不再误判为安全气口", () => {
  const result = classifyCutBoundary({
    time: 10.45,
    silences: [{ start: 10, end: 10.2, duration: 0.2 }],
    words: [{ start: 10.44, end: 10.8 }]
  });
  assert.equal(result.insidePause, false);
  assert.notEqual(result.severity, "ok");
});

test("审听窗口优先从切点两侧自然停顿开始和结束", () => {
  const window = selectCutReviewWindow({
    cutTime: 10,
    duration: 30,
    silences: [
      { start: 5.8, end: 6.1 },
      { start: 13.2, end: 13.5 }
    ]
  });
  assert.deepEqual(window, {
    start: 5.8,
    end: 13.5,
    duration: 7.7,
    cutOffset: 4.2,
    warnings: []
  });
});

test("EDL 音频边缘只做 5ms 防爆音，不再吞掉词头", () => {
  assert.equal(audioEdgeFadeSeconds(3), 0.005);
  assert.equal(audioEdgeFadeSeconds(0.008), 0.002);
});
