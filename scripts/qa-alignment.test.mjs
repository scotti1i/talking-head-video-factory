import assert from "node:assert/strict";
import test from "node:test";
import { anchorsFromEdl, bestLag } from "./qa-alignment.mjs";

test("归一化互相关找到真实位移", () => {
  const n = 4800;
  const ref = new Float32Array(n);
  for (let i = 0; i < n; i += 1) ref[i] = Math.sin(i * 0.05) * Math.sin(i * 0.0007) + (i % 97 === 0 ? 0.5 : 0);
  const target = new Float32Array(n + 2000);
  const shift = 1234;
  for (let i = 0; i < n; i += 1) target[shift + i] = ref[i] * 0.6;
  const { lagSamples, score } = bestLag(ref, target);
  assert.equal(lagSamples, shift);
  assert.ok(score > 0.95);
});

test("锚点：预期输出位置 = 累加 / 倍率 + 参考偏移；短段跳过", () => {
  const edl = [{ source: "a.mov", sourceStart: 10, sourceEnd: 12 }, { source: "a.mov", sourceStart: 20, sourceEnd: 20.3 }, { source: "b.mov", sourceStart: 5, sourceEnd: 8 }];
  const anchors = anchorsFromEdl(edl, 1.1);
  assert.equal(anchors[0].usable, true);
  assert.equal(anchors[0].sourceStart, 10.2);
  assert.equal(Math.round(anchors[0].expectedOutput * 1000) / 1000, Math.round((0.2 / 1.1) * 1000) / 1000);
  assert.equal(anchors[1].usable, false);
  assert.equal(anchors[2].source, "b.mov");
  assert.equal(Math.round(anchors[2].expectedOutput * 1000) / 1000, Math.round(((2 + 0.3 + 0.2) / 1.1) * 1000) / 1000);
});
