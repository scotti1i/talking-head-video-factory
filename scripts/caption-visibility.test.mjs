import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCaptionHideRanges } from "./caption-visibility.mjs";

test("缺省为空，合法区间按绝对时间排序", () => {
  assert.deepEqual(normalizeCaptionHideRanges(null, { totalDuration: 20 }), []);
  assert.deepEqual(normalizeCaptionHideRanges([
    { start: 13.458, end: 15.733 },
    { start: 0, end: 7.298 }
  ], { totalDuration: 20 }), [
    { start: 0, end: 7.298 },
    { start: 13.458, end: 15.733 }
  ]);
});

test("严格要求数值 start/end、正区间且不超出成片", () => {
  const cases = [
    ["bad", /必须是数组/],
    [[null], /必须是 \{start,end\}/],
    [[{ start: "0", end: 1 }], /start: 必须是有限数字/],
    [[{ start: 0, end: "1" }], /end: 必须是有限数字/],
    [[{ start: -0.1, end: 1 }], /start: 不能小于 0/],
    [[{ start: 2, end: 2 }], /需要 end > start/],
    [[{ start: 9, end: 10.1 }], /超出成片 10\.000s/]
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => normalizeCaptionHideRanges(value, { totalDuration: 10 }), pattern);
  }
});

test("相邻区间允许，重叠区间拒绝", () => {
  assert.deepEqual(normalizeCaptionHideRanges([
    { start: 0, end: 2 },
    { start: 2, end: 3 }
  ], { totalDuration: 10 }), [
    { start: 0, end: 2 },
    { start: 2, end: 3 }
  ]);
  assert.throws(
    () => normalizeCaptionHideRanges([
      { start: 0, end: 2.1 },
      { start: 2, end: 3 }
    ], { totalDuration: 10 }),
    /不允许重叠/
  );
});
