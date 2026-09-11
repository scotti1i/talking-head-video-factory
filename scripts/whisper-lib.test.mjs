import assert from "node:assert/strict";
import test from "node:test";
import { dtwPresetForModel, normalizeWhisperJson } from "./whisper-lib.mjs";

const latin1 = (text) => Buffer.from(text, "utf8").toString("latin1");

test("模型名映射到 DTW 预设", () => {
  assert.equal(dtwPresetForModel("/x/ggml-large-v3-turbo.bin"), "large.v3.turbo");
  assert.equal(dtwPresetForModel("ggml-large-v3.bin"), "large.v3");
  assert.equal(dtwPresetForModel("ggml-base.en.bin"), "base.en");
  assert.equal(dtwPresetForModel("weird.bin"), null);
});

test("无 DTW 时用 token offsets；多字节 token 拼接成词；标记 token 被丢弃", () => {
  const raw = { transcription: [{ offsets: { from: 0, to: 1500 }, text: latin1(" 我觉得 Open AI"), tokens: [
    { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
    // 「得」(E5 BE 97) 被 whisper 拆成两个 token：第一个带 E5，第二个 BE 97 —— 必须拼回一个词
    { text: latin1("我觉") + "\u00e5", offsets: { from: 0, to: 350 }, p: 0.9 },
    { text: "\u00be\u0097", offsets: { from: 350, to: 500 }, p: 0.8 },
    { text: " Open", offsets: { from: 700, to: 1130 }, p: 0.99 },
    { text: " AI", offsets: { from: 1130, to: 1360 }, p: 0.95 }
  ] }] };
  const result = normalizeWhisperJson(raw, { model: "m.bin", language: "zh" });
  assert.equal(result.dtw, null);
  assert.deepEqual(result.words.map((word) => [word.text, word.start, word.end]), [["我觉得", 0, 0.5], ["Open", 0.7, 1.13], ["AI", 1.13, 1.36]]);
  assert.equal(result.words[0].confidence, 0.8);
  assert.equal(result.segments[0].text, "我觉得 Open AI");
});

test("有 DTW 时词起点用 t_dtw、终点用下一 token 的 t_dtw", () => {
  const raw = { transcription: [{ offsets: { from: 0, to: 2000 }, text: " hola mundo", tokens: [
    { text: " hola", offsets: { from: 0, to: 900 }, t_dtw: 120 },
    { text: " mundo", offsets: { from: 900, to: 2000 }, t_dtw: 610 }
  ] }] };
  const result = normalizeWhisperJson(raw, { model: "ggml-large-v3.bin", language: "es", dtwPreset: "large.v3" });
  assert.equal(result.dtw, "large.v3");
  assert.deepEqual(result.words.map((word) => [word.start, word.end]), [[0.12, 0.61], [0.61, 2]]);
});
