import assert from "node:assert/strict";
import test from "node:test";
import { alignToScript, cleanLineText, groupIntoLines, normalizeToken } from "./captions-from-aroll.mjs";

const word = (text, start, end, extra = {}) => ({ id: `${text}-${start}`, text, start, end, ...extra });

test("词面归一：去重音、去标点、小写", () => {
  assert.equal(normalizeToken("Más,"), "mas");
  assert.equal(normalizeToken("made-in-china.com"), "madeinchinacom");
});

test("文稿对齐：ASR 错词换成文稿原文，ASR 漏词并入相邻词，多听的词保留", () => {
  const asr = [word("no", 0, 0.2), word("compra", 0.2, 0.6), word("todo", 0.6, 0.8), word("pelo", 0.8, 1.0), word("alibabá", 1.0, 1.5), word("eh", 1.5, 1.6), word("ainda", 1.7, 2.0), word("produtos", 2.1, 2.6)];
  const script = "Não compra tudo pelo Alibaba! Ainda os produtos ali";
  const result = alignToScript(asr, script);
  assert.equal(result.skipped, false);
  const texts = result.words.map((item) => item.text);
  assert.equal(texts[0], "Não");
  assert.equal(texts[2], "tudo");
  assert.equal(texts[4], "Alibaba!");
  assert.equal(texts[5], "eh");
  assert.ok(texts.some((text) => /Ainda|produtos/.test(text)));
  assert.deepEqual(result.missed.sort(), ["ali", "os"].sort());
  const joined = texts.join(" ");
  assert.match(joined, /Ainda os produtos ali|os produtos/);
});

test("CJK 不做词面替换", () => {
  const result = alignToScript([word("我觉得", 0, 0.5)], "我觉得这次");
  assert.equal(result.skipped, true);
  assert.equal(result.words[0].text, "我觉得");
});

test("分行：按字宽、时长、气口和句末标点断，行尾逗号句号去掉、问号感叹号保留", () => {
  const words = [word("Não", 0, 0.2), word("compra", 0.2, 0.6), word("tudo", 0.6, 0.8), word("pelo", 0.8, 1.0), word("Alibaba!", 1.0, 1.5), word("Ainda", 2.3, 2.6), word("os", 2.6, 2.7), word("produtos", 2.7, 3.2), word("ali,", 3.2, 3.5)];
  const lines = groupIntoLines(words, { maxChars: 18, maxDuration: 2.8 });
  // maxChars 按原始字符数（客户合同 18 = 西葡语 3–4 个词），孤行 "ali" 并回上一行
  assert.deepEqual(lines.map((line) => line.t), ["Não compra tudo", "pelo Alibaba!", "Ainda os produtos ali"]);
  assert.equal(lines[0].s, 0);
  assert.equal(lines[1].e, 1.5);
  assert.equal(lines[2].s, 2.3);
});

test("分行：超过字宽就断；域名里的点不算句末", () => {
  const words = [word("Brinquedos", 0, 0.8), word("cntoys.cn", 0.9, 1.6), word("Eletrônicos", 1.7, 2.4), word("huaqiu.com", 2.5, 3.2)];
  const lines = groupIntoLines(words, { maxChars: 12, maxDuration: 2.8 });
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((line) => /\.(cn|com)$|^[A-Za-zôê]+$/.test(line.t) || line.t.includes(" ")));
  assert.equal(cleanLineText("made-in-china.com"), "made-in-china.com");
  assert.equal(cleanLineText("Salva esse vídeo!"), "Salva esse vídeo!");
  assert.equal(cleanLineText("compram seus produtos."), "compram seus produtos");
});
