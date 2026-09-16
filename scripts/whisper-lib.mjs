// ============================================================
// whisper.cpp 调用与词级归一：原片转录（剪辑用）和成片 A-roll 转录（字幕用）共用同一套代码，
//   避免两处各自解析 token 时码出现两套口径。
// 词时码来源优先级：DTW（t_dtw ≥ 0，whisper-cli -dtw）> token offsets。
//   2026-09-11 实测 whisper-cpp 1.9.2 对 large-v3-turbo 的 -dtw 返回 -1，所以时码精修交给
//   audio-envelope.mjs 的能量谷吸附，不依赖 DTW；这里只保证「有 DTW 就用」。
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./lib.mjs";

export const DEFAULT_MODEL = path.join(os.homedir(), ".cache", "whisper-cpp", "ggml-large-v3-turbo.bin");

export function dtwPresetForModel(modelPath) {
  const name = path.basename(String(modelPath || "")).toLowerCase();
  if (name.includes("large-v3-turbo")) return "large.v3.turbo";
  if (name.includes("large-v3")) return "large.v3";
  if (name.includes("large-v2")) return "large.v2";
  if (name.includes("medium")) return name.includes(".en") ? "medium.en" : "medium";
  if (name.includes("small")) return name.includes(".en") ? "small.en" : "small";
  if (name.includes("base")) return name.includes(".en") ? "base.en" : "base";
  if (name.includes("tiny")) return name.includes(".en") ? "tiny.en" : "tiny";
  return null;
}

// 把媒体文件转成 16k 单声道 wav，跑 whisper-cli，返回归一化后的 { segments, words, dtw }
// -dtw 回退（v2.0.3 spec D）：带 -dtw 跑挂了（非零退出 / 没输出 JSON / JSON 解析不了）就去掉 -dtw 重跑一次，
//   结果 dtw: null 并记 dtwFallback（stderr 尾 300 字），转录不因 DTW 这个锦上添花的功能整体失败。
// runner 只给测试注入用，默认就是 lib.run。
export function transcribeMedia({ source, model = DEFAULT_MODEL, language = "auto", tmpDir, dtw = true, extraArgs = [], runner = run }) {
  if (!fs.existsSync(model)) throw new Error(`Whisper 模型不存在: ${model}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stem = `${path.basename(source, path.extname(source))}-${process.pid}`;
  const wav = path.join(tmpDir, `${stem}.wav`);
  const outBase = path.join(tmpDir, `${stem}-whisper`);
  runner("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vn", "-ac", "1", "-ar", "16000", wav]);
  const dtwPreset = dtw ? dtwPresetForModel(model) : null;
  const attempt = (preset) => runWhisperOnce({ runner, model, language, preset, outBase, extraArgs, wav });
  let result = attempt(dtwPreset);
  let dtwFallback = null;
  if (!result.ok && dtwPreset) {
    dtwFallback = result.stderr.slice(-300);
    result = attempt(null);
  }
  fs.rmSync(wav, { force: true });
  if (!result.ok) throw new Error(`whisper-cli 转录失败：${result.stderr.slice(-1500)}`);
  const normalized = normalizeWhisperJson(result.raw, { model, language, dtwPreset: dtwFallback === null ? dtwPreset : null });
  if (dtwFallback !== null) {
    normalized.dtw = null;
    normalized.dtwFallback = dtwFallback;
  }
  return normalized;
}

// 跑一次 whisper-cli 并读回 JSON；任何一环失败都返回 { ok:false, stderr }，由调用方决定是否回退。
function runWhisperOnce({ runner, model, language, preset, outBase, extraArgs, wav }) {
  const jsonFile = `${outBase}.json`;
  fs.rmSync(jsonFile, { force: true });
  const args = ["-m", model, "-l", language, ...(preset ? ["-dtw", preset] : []), "-ojf", "-of", outBase, "-np", ...extraArgs, wav];
  try {
    // stderr 截下来才有回退原因可记；stdout 仍直通终端（-np 下几乎没有输出）
    runner("whisper-cli", args, { stdio: ["ignore", "inherit", "pipe"] });
  } catch (error) {
    return { ok: false, stderr: String(error.message || error) };
  }
  if (!fs.existsSync(jsonFile)) return { ok: false, stderr: `whisper-cli 未输出 ${path.basename(jsonFile)}` };
  try {
    const raw = JSON.parse(fs.readFileSync(jsonFile, "latin1"));
    return { ok: true, raw };
  } catch (error) {
    return { ok: false, stderr: `whisper-cli 输出的 JSON 解析失败：${error.message}` };
  } finally {
    fs.rmSync(jsonFile, { force: true });
  }
}

export function normalizeWhisperJson(raw, { model, language, dtwPreset } = {}) {
  let usedDtw = false;
  const segments = (raw.transcription || []).map((segment, segmentIndex) => {
    const start = Number(segment.offsets?.from || 0) / 1000;
    const end = Number(segment.offsets?.to || 0) / 1000;
    const tokens = segment.tokens || [];
    const { words, dtw } = normalizeTokens(tokens, segmentIndex, end);
    if (dtw) usedDtw = true;
    return {
      id: `seg-${String(segmentIndex + 1).padStart(4, "0")}`,
      start: round(start),
      end: round(end),
      text: decodeBytes(segment.text),
      words
    };
  }).filter((item) => item.end > item.start && item.text);
  const words = segments.flatMap((segment) => segment.words);
  return {
    version: 2,
    model: path.basename(String(model || "")),
    language,
    dtw: usedDtw ? dtwPreset : null,
    createdAt: new Date().toISOString(),
    segments: segments.map(({ words: _words, ...segment }) => segment),
    words
  };
}

// token → 词：多字节 token 拼到能解码为止；时码优先 t_dtw。
function normalizeTokens(tokens, segmentIndex, segmentEnd) {
  const result = [];
  let pending = [];
  let dtw = false;
  const clean = tokens.filter((token) => !/^\[.*\]$/.test(String(token.text || "")));
  for (let index = 0; index < clean.length; index += 1) {
    const token = clean[index];
    pending.push(token);
    const text = decodeBytes(pending.map((item) => item.text).join(""));
    if (text.includes("�")) continue;
    const trimmed = text.trim();
    if (trimmed) {
      const first = pending[0];
      const last = pending.at(-1);
      const next = clean[index + 1];
      const firstDtw = Number(first.t_dtw ?? -1);
      const nextDtw = next ? Number(next.t_dtw ?? -1) : -1;
      let start = Number(first.offsets?.from || 0) / 1000;
      let end = Number(last.offsets?.to || 0) / 1000;
      if (firstDtw >= 0) {
        dtw = true;
        start = firstDtw / 1000;
        end = nextDtw >= 0 ? nextDtw / 1000 : Math.max(start + 0.05, Math.min(end, segmentEnd));
      }
      result.push({
        // whisper token 的前导空格就是真实词边界（" Open"、" AI"）；拼行时靠它决定要不要加空格
        sp: /^\s/.test(String(first.text || "")),
        id: `w-${String(segmentIndex + 1).padStart(4, "0")}-${String(result.length + 1).padStart(3, "0")}`,
        start: round(start),
        end: round(Math.max(end, start + 0.001)),
        text: trimmed,
        confidence: round(Math.min(...pending.map((item) => Number(item.p ?? 1))))
      });
    }
    pending = [];
  }
  return { words: result, dtw };
}

export function decodeBytes(value) {
  return Buffer.from(String(value || ""), "latin1").toString("utf8").replace(/\s+/g, " ").trim();
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
