import assert from "node:assert/strict";
import test from "node:test";
import { firstVoicedAfter, lastVoicedBefore, snapWords, voiceRegions, voicedThreshold } from "./audio-envelope.mjs";

// 合成包络：10ms 帧，[0.5,1.0) 与 [1.3,1.8) 有声（-20dB），其余底噪 -60dB
function envelope() {
  const rms = new Float32Array(300).fill(-60);
  for (let f = 50; f < 100; f += 1) rms[f] = -20;
  for (let f = 130; f < 180; f += 1) rms[f] = -20;
  return { rms, frameSeconds: 0.01, duration: 3, noiseFloor: -60, speechLevel: -20 };
}

test("阈值落在底噪与语音之间；有声帧查找正确", () => {
  const env = envelope();
  const threshold = voicedThreshold(env);
  assert.ok(threshold > -60 && threshold < -20);
  assert.equal(lastVoicedBefore(env, 0.5, 1.2), 0.99);
  assert.equal(firstVoicedAfter(env, 0.2, 0.9), 0.5);
  assert.equal(lastVoicedBefore(env, 1.05, 1.25), null);
});

test("词尾拖进静音时收到最后有声帧 + 80ms；入点提到起声", () => {
  const env = envelope();
  const words = [{ id: "a", start: 0.55, end: 1.28, text: "hola" }, { id: "b", start: 1.35, end: 2.6, text: "mundo" }];
  const snapped = snapWords(words, env);
  assert.equal(snapped[0].start, 0.48);
  assert.equal(snapped[0].end, 1.07);
  assert.equal(snapped[1].end, 1.87);
  assert.ok(snapped.every((word) => word.end > word.start));
});

test("语音区按间隔合并", () => {
  const words = [{ start: 0, end: 0.4 }, { start: 0.6, end: 1 }, { start: 2, end: 2.5 }];
  const regions = voiceRegions(words, { gap: 0.5 });
  assert.deepEqual(regions.map((region) => [region.start, region.end, region.words.length]), [[0, 1, 2], [2, 2.5, 1]]);
});
