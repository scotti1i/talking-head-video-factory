import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildGeminiRequest, callGemini, cutTimesFromEdl, parseVerdict, pickGeminiModel, pickStillTimes, resolveGeminiModel, selectReviewer } from "./review-independent.mjs";

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

// ---- v2.0.3 spec C：Gemini 后端与审片人自动选择（不碰真实网络）----
test("Gemini 请求体：提示词 + 每块板子一个 inline_data(base64 png)，temperature 0", () => {
  const boards = [{ file: "/x/board-1.png" }, { file: "/x/board-2.png" }];
  const body = buildGeminiRequest({ prompt: "看图打分", boards, readFile: (file) => Buffer.from(path.basename(file)) });
  assert.equal(body.generationConfig.temperature, 0);
  const parts = body.contents[0].parts;
  assert.equal(parts[0].text, "看图打分");
  assert.deepEqual(parts.slice(1).map((part) => part.inline_data.mime_type), ["image/png", "image/png"]);
  assert.equal(Buffer.from(parts[1].inline_data.data, "base64").toString(), "board-1.png");
  assert.equal(Buffer.from(parts[2].inline_data.data, "base64").toString(), "board-2.png");
});

test("模型选择：只要 gemini-*-pro 且支持 generateContent；版本高优先、正式版优先", () => {
  const list = { models: [
    { name: "models/gemini-1.5-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro-preview-05-06", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3-pro", supportedGenerationMethods: ["embedContent"] },
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }
  ] };
  assert.equal(pickGeminiModel(list), "gemini-2.5-pro");
  assert.equal(pickGeminiModel({ models: list.models.filter((m) => m.name !== "models/gemini-2.5-pro") }), "gemini-2.5-pro-preview-05-06");
  assert.throws(() => pickGeminiModel({ models: [] }), /FACTORY_GEMINI_MODEL/);
});

test("resolveGeminiModel：env 优先；否则 ListModels 一次并缓存到文件", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-model-"));
  const cacheFile = path.join(dir, "gemini-model");
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /\/v1beta\/models\?pageSize=1000&key=k1$/);
    return { ok: true, json: async () => ({ models: [{ name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }] }) };
  };
  try {
    assert.equal(await resolveGeminiModel({ apiKey: "k1", env: { FACTORY_GEMINI_MODEL: "gemini-x" }, fetchImpl, cacheFile }), "gemini-x");
    assert.equal(calls, 0);
    assert.equal(await resolveGeminiModel({ apiKey: "k1", env: {}, fetchImpl, cacheFile }), "gemini-2.5-pro");
    assert.equal(fs.readFileSync(cacheFile, "utf8").trim(), "gemini-2.5-pro");
    assert.equal(await resolveGeminiModel({ apiKey: "k1", env: {}, fetchImpl, cacheFile }), "gemini-2.5-pro");
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("callGemini：拼 generateContent URL、取回文本；HTTP 错误带状态码与 body 前 300 字", async () => {
  const boards = [];
  const seen = [];
  const okFetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{\"verdict\":" }, { text: "\"pass\"}" }] } }] }) };
  };
  const text = await callGemini({ apiKey: "k", model: "gemini-2.5-pro", prompt: "p", boards, fetchImpl: okFetch });
  assert.equal(text, '{"verdict":"pass"}');
  assert.match(seen[0].url, /\/models\/gemini-2\.5-pro:generateContent\?key=k$/);
  assert.equal(seen[0].init.method, "POST");
  assert.equal(JSON.parse(seen[0].init.body).contents[0].parts[0].text, "p");
  const badFetch = async () => ({ ok: false, status: 429, text: async () => "x".repeat(1000) });
  await assert.rejects(callGemini({ apiKey: "k", model: "m", prompt: "p", boards, fetchImpl: badFetch }), (error) => error.message.startsWith("Gemini HTTP 429：") && error.message.length === "Gemini HTTP 429：".length + 300);
  await assert.rejects(callGemini({ apiKey: "", model: "m", prompt: "p", boards, fetchImpl: okFetch }), /GEMINI_API_KEY/);
});

test("审片人自动选择矩阵：显式 > FACTORY_REVIEWER > codex 命令 > GEMINI_API_KEY > 报错", () => {
  const has = (yes) => (name) => yes && name === "codex";
  assert.equal(selectReviewer({ explicit: "gemini", env: { FACTORY_REVIEWER: "claude" }, commandExists: has(true) }), "gemini");
  assert.equal(selectReviewer({ env: { FACTORY_REVIEWER: "claude" }, commandExists: has(true) }), "claude");
  assert.equal(selectReviewer({ env: { GEMINI_API_KEY: "k" }, commandExists: has(true) }), "codex");
  assert.equal(selectReviewer({ env: { GEMINI_API_KEY: "k" }, commandExists: has(false) }), "gemini");
  assert.throws(() => selectReviewer({ env: {}, commandExists: has(false) }), /缺审片后端：装 codex 或配置 GEMINI_API_KEY/);
  assert.throws(() => selectReviewer({ explicit: "gpt", env: {}, commandExists: has(true) }), /未知审片人/);
});
