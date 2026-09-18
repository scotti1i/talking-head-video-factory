import assert from "node:assert/strict";
import test from "node:test";

import {
  createSingleWordClips,
  createTimedCaptionWords,
  normalizeCaptionWords,
  renderPhraseCaptionWords,
  resolveCaptionPreset
} from "./dynamic-captions.mjs";

const registry = {
  captionPresets: {
    static: { label: "Static" },
    "phrase-highlight": { activeColor: "#21F35B" },
    "single-word-pop": { activeColor: "#12DDEB" }
  }
};

test("字幕模式只能来自主题注册表", () => {
  assert.equal(resolveCaptionPreset(registry).mode, "static");
  assert.equal(resolveCaptionPreset(registry, "phrase-highlight").activeColor, "#21F35B");
  assert.throws(() => resolveCaptionPreset(registry, "handmade"), /不支持 handmade/);
});

test("中文单字 ASR 会合成可读词组并保留真实总时码", () => {
  const rawWords = [
    { text: "前", start: 0.12, end: 0.18 },
    { text: "两", start: 0.21, end: 0.38 },
    { text: "天", start: 0.38, end: 0.57 },
    { text: "的", start: 0.57, end: 0.76 },
    { text: "全", start: 0.76, end: 0.95 },
    { text: "网", start: 0.95, end: 1.1 },
    { text: "AI", start: 1.14, end: 1.32 },
    { text: "team", start: 1.32, end: 1.51 }
  ];
  const words = createTimedCaptionWords(rawWords, "前两天的全网AI team");
  assert.equal(words.map((word) => word.t).join(""), "前两天的全网AI team");
  assert.equal(words[0].t, "前两天的");
  assert.equal(words[1].t, "全网");
  assert.equal(words[0].s, 0.12);
  assert.equal(words.at(-1).e, 1.51);
  assert.ok(words.length < Array.from("前两天的全网AIteam").length);
});

test("逐词合同拒绝错字、越界和倒退时码", () => {
  const valid = {
    s: 1,
    e: 2,
    t: "完整字幕",
    words: [
      { t: "完整", s: 1, e: 1.5 },
      { t: "字幕", s: 1.5, e: 2 }
    ]
  };
  assert.equal(normalizeCaptionWords(valid).length, 2);
  assert.throws(() => normalizeCaptionWords({ ...valid, t: "错误字幕" }), /文字不一致/);
  assert.throws(() => normalizeCaptionWords({ ...valid, words: [{ t: "完整字幕", s: 0.9, e: 2 }] }), /超出所属 cue/);
  assert.throws(() => normalizeCaptionWords({ ...valid, words: [
    { t: "完整", s: 1.5, e: 1.8 },
    { t: "字幕", s: 1.2, e: 2 }
  ] }), /时间顺序倒退/);
});

test("phrase renderer 输出逐词绝对时码并限制 emoji", () => {
  const item = {
    s: 1,
    e: 2,
    t: "完整字幕",
    emoji: "🔥",
    words: [
      { t: "完整", s: 1, e: 1.5 },
      { t: "字幕", s: 1.5, e: 2 }
    ]
  };
  const html = renderPhraseCaptionWords(item);
  assert.match(html, /caption-emoji[^>]*>🔥/);
  assert.match(html, /data-word-start="1\.000"/);
  assert.equal((html.match(/class="caption-word"/g) || []).length, 2);
  assert.throws(() => renderPhraseCaptionWords({ ...item, emoji: "这不是一个 emoji" }), /简短 emoji/);
});

test("single-word 模式沿用 emphasis 选择注册强调色", () => {
  const clips = createSingleWordClips({
    s: 0,
    e: 1,
    t: "THE QUICK FOX",
    emphasis: "FOX",
    words: [
      { t: "THE", s: 0, e: 0.2 },
      { t: " QUICK", s: 0.2, e: 0.6 },
      { t: " FOX", s: 0.6, e: 1 }
    ]
  });
  assert.equal(clips.length, 3);
  assert.equal(clips[0].e, 0.2);
  assert.equal(clips[1].e, 0.6);
  assert.equal(clips[2].highlighted, true);
});
