import assert from "node:assert/strict";
import test from "node:test";

import { renderCaptionMarkup } from "./caption-emphasis.mjs";

test("无 emphasis 时只做 HTML 转义", () => {
  assert.equal(renderCaptionMarkup({ t: "Cost < time" }), "Cost &lt; time");
});

test("只高亮第一个完整语义词并保留原始大小写", () => {
  assert.equal(
    renderCaptionMarkup({ t: "It's TIME, not sometimes.", emphasis: "time" }),
    `It&#39;s <span class="caption-emphasis">TIME</span>, not sometimes.`
  );
});

test("支持西语、法语与俄语的完整词组", () => {
  assert.match(renderCaptionMarkup({ t: "El coste real es tiempo.", emphasis: "tiempo" }), /caption-emphasis/);
  assert.match(renderCaptionMarkup({ t: "Le vrai coût, c'est le temps.", emphasis: "temps" }), /caption-emphasis/);
  assert.match(renderCaptionMarkup({ t: "Главная цена — время.", emphasis: "время" }), /caption-emphasis/);
});

test("中文词组按连续语义片段高亮，不要求空格边界", () => {
  assert.equal(
    renderCaptionMarkup({ t: "为什么有这个感触", emphasis: "感触" }),
    `为什么有这个<span class="caption-emphasis">感触</span>`
  );
});

test("拒绝空字段、子词误命中与不存在的词", () => {
  assert.throws(() => renderCaptionMarkup({ t: "Time", emphasis: "" }), /非空字符串/);
  assert.throws(() => renderCaptionMarkup({ t: "sometimes", emphasis: "time" }), /未在字幕中找到/);
  assert.throws(() => renderCaptionMarkup({ t: "It's time.", emphasis: "money" }), /未在字幕中找到/);
});
