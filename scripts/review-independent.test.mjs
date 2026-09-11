import assert from "node:assert/strict";
import test from "node:test";
import { cutTimesFromEdl, parseVerdict, pickStillTimes } from "./review-independent.mjs";

test("切点时间按倍速换算", () => {
  const edl = [{ sourceStart: 0, sourceEnd: 2.2 }, { sourceStart: 5, sourceEnd: 6.1 }, { sourceStart: 9, sourceEnd: 10 }];
  assert.deepEqual(cutTimesFromEdl(edl, 1.1), [2, 3]);
  assert.deepEqual(cutTimesFromEdl(edl, 1), [2.2, 3.3]);
});

test("静帧取点覆盖切点前后、字幕入点、开头结尾，并限制张数", () => {
  const times = pickStillTimes({ duration: 30, captions: [{ s: 1 }, { s: 4.5 }], cutTimes: [10, 20], max: 36 });
  assert.ok(times.includes(9.95) && times.includes(10.05));
  assert.ok(times.includes(1.15));
  assert.ok(times.includes(0.05));
  assert.ok(times.every((t) => t >= 0 && t < 30));
  const many = pickStillTimes({ duration: 300, captions: Array.from({ length: 200 }, (_, i) => ({ s: i })), cutTimes: [100, 200], max: 36 });
  assert.equal(many.length, 36);
  // 切点帧对与结尾三帧永远保留，抽稀只砍字幕入点
  for (const t of [99.95, 100.05, 199.95, 200.05, 297.5, 298.8, 299.8]) assert.ok(many.includes(t), `缺 ${t}`);
});

test("裁决：10 条全 ✓ 才 pass；任一 ✗ 或不足 10 条即 fail", () => {
  const ok = parseVerdict(`前言 {"verdict":"pass","items":${JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ n: i + 1, ok: true, evidence: "x" })))},"notes":"好"} 后语`);
  assert.equal(ok.verdict, "pass");
  const bad = parseVerdict(JSON.stringify({ verdict: "pass", items: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, ok: i !== 3, evidence: "x" })) }));
  assert.equal(bad.verdict, "fail");
  assert.equal(bad.failed[0].n, 4);
  const short = parseVerdict(JSON.stringify({ verdict: "pass", items: [{ n: 1, ok: true }] }));
  assert.equal(short.verdict, "fail");
  assert.throws(() => parseVerdict("no json here"), /不是 JSON/);
});
