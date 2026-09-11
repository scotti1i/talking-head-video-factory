// ============================================================
// 字幕单源：对工作母版 assets/aroll.mp4（已倍速 / 处理）只转录一次，字幕、人声区、词表全从这一份出。
//   替代 captions-from-edl.mjs 的「原片时码 → EDL 累加 → 成片」映射（任何改音轨长度的步骤都让映射失效；
//   2026-09-11 审计：客户葡语片 5 轮全片重校不收敛、太阳能片 3 轮漏词）。
// 步骤：合同校验（project.aroll.edlHash）→ 转录缓存（按 masterHash）→ 能量谷吸附词边界 → 文稿词面校正
//   → 分行 → data/captions.json + data/caption-voice.json + data/words-timeline.json + data/captions-provenance.json
// 用法：node scripts/captions-from-aroll.mjs --job jobs/<slug> [--max-chars 18] [--max-duration 2.8] [--force]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./color-management.mjs";
import { atomicWriteJson, parseArgs, readJson, resolveJob } from "./lib.mjs";
import { assertArollContract } from "./aroll-treat.mjs";
import { DEFAULT_MODEL, transcribeMedia } from "./whisper-lib.mjs";
import { readEnvelope, snapWords, voiceRegions } from "./audio-envelope.mjs";

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

// ---- 文稿对齐：ASR 词序列 ↔ 文稿词序列（拉丁语系按词，CJK 不做词面替换）----
export function normalizeToken(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length; const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

// 返回 asrWords 的副本：匹配到文稿的词换成文稿原文；文稿里 ASR 漏掉的词并入前一个匹配词。
export function alignToScript(asrWords, scriptText, { minSimilarity = 0.66 } = {}) {
  const scriptTokens = String(scriptText || "").split(/\s+/).filter(Boolean);
  if (!scriptTokens.length || asrWords.some((word) => CJK.test(word.text))) {
    return { words: asrWords.map((word) => ({ ...word })), matched: 0, missed: [], extra: asrWords.length ? 0 : 0, skipped: true };
  }
  const a = asrWords.map((word) => normalizeToken(word.text));
  const b = scriptTokens.map(normalizeToken);
  const m = a.length; const n = b.length;
  // Needleman–Wunsch：匹配得分 = 相似度，gap 罚 0.4
  const score = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));
  const move = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1)); // 1 diag, 2 up(asr gap), 3 left(script gap)
  const GAP = -0.4;
  for (let i = 1; i <= m; i += 1) { score[i][0] = i * GAP; move[i][0] = 2; }
  for (let j = 1; j <= n; j += 1) { score[0][j] = j * GAP; move[0][j] = 3; }
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const sim = similarity(a[i - 1], b[j - 1]);
      const diag = score[i - 1][j - 1] + (sim >= minSimilarity ? sim : -0.8);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      if (diag >= up && diag >= left) { score[i][j] = diag; move[i][j] = 1; }
      else if (up >= left) { score[i][j] = up; move[i][j] = 2; }
      else { score[i][j] = left; move[i][j] = 3; }
    }
  }
  const out = asrWords.map((word) => ({ ...word }));
  const missed = [];
  let matched = 0;
  let i = m; let j = n;
  let leftmostMatch = -1;
  let pendingMissed = []; // 回溯是从右往左，攒到的是「右侧」漏词，遇到左侧匹配词就挂到它后面
  while (i > 0 || j > 0) {
    const step = move[i][j];
    if (step === 1) {
      const sim = similarity(a[i - 1], b[j - 1]);
      if (sim >= minSimilarity) {
        out[i - 1].text = scriptTokens[j - 1];
        out[i - 1].script = true;
        matched += 1;
        leftmostMatch = i - 1;
        if (pendingMissed.length) {
          const tokens = pendingMissed.reverse();
          out[i - 1].text = `${out[i - 1].text} ${tokens.join(" ")}`;
          out[i - 1].attached = tokens;
          pendingMissed = [];
        }
      }
      i -= 1; j -= 1;
    } else if (step === 2) {
      i -= 1;
    } else {
      pendingMissed.push(scriptTokens[j - 1]);
      missed.push(scriptTokens[j - 1]);
      j -= 1;
    }
  }
  if (pendingMissed.length && leftmostMatch >= 0) {
    const tokens = pendingMissed.reverse();
    out[leftmostMatch].text = `${tokens.join(" ")} ${out[leftmostMatch].text}`;
    out[leftmostMatch].attached = [...tokens, ...(out[leftmostMatch].attached || [])];
  }
  return { words: out, matched, missed, extra: m - matched, skipped: false };
}

// 行末标点：保留 ? ! ，去掉 , . ; : 与破折号（客户 2026-08-28 R1 要求）；域名内部的点不动
export function cleanLineText(text) {
  return String(text).replace(/[,\.;:，。；：—–-]+$/u, "").replace(/\s+/g, " ").trim();
}

export function groupIntoLines(words, { maxChars = 18, maxDuration = 2.8, gapBreak = 0.6 } = {}) {
  const lines = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const text = cleanLineText(joinWords(group));
    if (text) lines.push({ s: group[0].start, e: group.at(-1).end, t: text, wordIds: group.map((item) => item.id), words: group.length });
    group = [];
  };
  for (const [index, word] of words.entries()) {
    const prev = words[index - 1];
    const current = joinWords(group);
    if (group.length && prev && word.start - prev.end >= gapBreak) flush();
    // whisper 段边界：CJK 没有词间空格，段就是最自然的短语单位 → 硬断（孤行由下面并回）；拉丁语系只在行已过半时断
    else if (group.length && prev?.segmentEnd && (CJK.test(prev.text) || current.length >= maxChars * 0.5)) flush();
    const candidate = joinWords([...group, word]);
    const duration = word.end - (group[0]?.start ?? word.start);
    if (group.length && (candidate.length > maxChars || duration > maxDuration)) flush();
    group.push(word);
    if (/[?!？！]$/.test(word.text) || (/[.。]$/.test(word.text) && !/\.[a-z]{2,}$/i.test(word.text))) flush();
  }
  flush();
  // 孤行（≤3 字或单词）并回上一行：宽度允许且间隔 <0.4s
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const prev = lines[index - 1];
    const orphan = line.words === 1 || line.t.length <= 3;
    if (orphan && line.s - prev.e < 0.4 && `${prev.t} ${line.t}`.length <= maxChars + 4 && !/[?!？！]$/.test(prev.t)) {
      prev.t = cleanLineText(`${prev.t}${CJK.test(prev.t.at(-1)) && CJK.test(line.t[0]) ? "" : " "}${line.t}`);
      prev.e = line.e;
      prev.wordIds.push(...line.wordIds);
      prev.words += line.words;
      lines.splice(index, 1);
      index -= 1;
    }
  }
  // 太短的行向后延到下一行起点（不越过 0.35s）
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (line.e - line.s < 0.45) line.e = round(Math.min(line.s + 0.45, next ? next.s : line.e + 0.35));
    if (next && line.e > next.s) line.e = next.s;
    line.s = round(line.s); line.e = round(line.e);
    delete line.words;
  }
  return lines;
}

// 拼词：有 sp 标志用 sp（whisper 前导空格 / 文稿词），没有就按字符类型推断（CJK 之间不加空格）
export function joinWords(words) {
  let text = "";
  let lastToken = "";
  for (const word of words) {
    const value = String(word.text || "").trim();
    if (!value) continue;
    if (!text) { text = value; lastToken = value; continue; }
    const heuristic = /[\p{L}\p{N}?!.,]$/u.test(text) && /^[\p{L}\p{N}¿¡]/u.test(value) && !(CJK.test(text.at(-1)) && CJK.test(value[0]));
    // 单个拉丁字母 / 数字连着出现（whisper 把 GPT6 拆成 G P T 6）不加空格
    const singleLatinRun = /^[A-Za-z0-9]$/.test(value) && /^[A-Za-z0-9]$/.test(lastToken);
    const space = !singleLatinRun && (word.sp == null ? heuristic : (word.sp || (word.script && !CJK.test(value[0]))) && !(CJK.test(text.at(-1)) && CJK.test(value[0])));
    text += `${space ? " " : ""}${value}`;
    lastToken = value;
  }
  return text;
}

function joinTokens(tokens) {
  return joinWords(tokens.map((token) => ({ text: token })));
}

function carryEmphasis(lines, previous) {
  if (!Array.isArray(previous)) return lines;
  const terms = previous.flatMap((item) => (item.emphasis == null ? [] : Array.isArray(item.emphasis) ? item.emphasis : [item.emphasis]));
  if (!terms.length) return lines;
  return lines.map((line) => {
    const hits = terms.filter((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(line.t));
    return hits.length ? { ...line, emphasis: hits.length === 1 ? hits[0] : hits } : line;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVoiceContract(words, lines, previousContract, tolerance) {
  const overlays = (previousContract?.regions || []).filter((region) => region.coverage === "text-overlay");
  const regions = voiceRegions(words, { gap: 0.5 }).map((region) => {
    const overlay = overlays.find((item) => overlapRatio(item, region) >= 0.8);
    if (overlay) return { start: round(region.start), end: round(region.end), coverage: "text-overlay", beatType: overlay.beatType, reason: overlay.reason };
    return { start: round(region.start), end: round(region.end), coverage: "captions", expectedText: joinTokens(region.words.map((item) => item.text)) };
  });
  const overlayRanges = regions.filter((region) => region.coverage === "text-overlay");
  const captions = lines.filter((line) => !overlayRanges.some((region) => overlapRatio(region, { start: line.s, end: line.e }) > 0.5));
  return { contract: { schemaVersion: 1, tolerance, source: "aroll-transcript", regions }, captions };
}

function overlapRatio(a, b) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  const length = Math.max(0, end - start);
  return length / Math.max(1e-6, b.end - b.start);
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function main() {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const projectPath = path.join(jobDir, "project.json");
  const project = fs.existsSync(projectPath) ? readJson(projectPath) : {};
  const contract = assertArollContract(jobDir, project, "captions:build");
  const language = String(args.language || project.editorial?.language || "auto");
  const maxChars = Number(args["max-chars"] || project.caption?.maxCharsPerLine || 18);
  const maxDuration = Number(args["max-duration"] || 2.8);
  const model = path.resolve(args.model || process.env.FACTORY_WHISPER_MODEL || DEFAULT_MODEL);

  // 1. 转录缓存（按工作母版 hash）
  const transcriptPath = path.join(jobDir, "data", "aroll-transcript.json");
  let transcript = fs.existsSync(transcriptPath) ? readJson(transcriptPath) : null;
  if (args.force || !transcript || transcript.masterHash !== contract.masterHash) {
    console.log(`转录工作母版 ${contract.master}（${language}）…`);
    transcript = { ...transcribeMedia({ source: contract.masterPath, model, language, tmpDir: path.join(jobDir, "tmp", "aroll-transcribe") }), master: contract.master, masterHash: contract.masterHash };
    atomicWriteJson(transcriptPath, transcript);
  } else {
    console.log(`转录命中缓存 data/aroll-transcript.json（${transcript.words.length} 词）`);
  }
  if (!transcript.words.length) throw new Error("工作母版转录为空，不能生成字幕");

  // 2. 词边界吸附到能量谷
  const envelope = readEnvelope(contract.masterPath);
  const segmentEnds = new Set(transcript.segments.map((segment) => segment.end));
  const rawWords = transcript.words.map((word) => ({ ...word, segmentEnd: segmentEnds.has(word.end) }));
  const snapped = snapWords(rawWords, envelope);

  // 3. 文稿词面校正
  const scriptRelative = project.editorial?.writtenScript?.path;
  const scriptPath = scriptRelative ? path.join(jobDir, scriptRelative) : null;
  const scriptText = scriptPath && fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf8") : "";
  const aligned = alignToScript(snapped, scriptText);

  // 4. 分行 + 保留旧 emphasis
  const captionsPath = path.join(jobDir, "data", "captions.json");
  const previousCaptions = fs.existsSync(captionsPath) ? readJson(captionsPath) : null;
  const lines = carryEmphasis(groupIntoLines(aligned.words, { maxChars, maxDuration }), previousCaptions);

  // 5. 人声区合同（保留旧 text-overlay 区）
  const voicePath = path.join(jobDir, "data", "caption-voice.json");
  const previousVoice = fs.existsSync(voicePath) ? readJson(voicePath) : null;
  const { contract: voice, captions } = buildVoiceContract(aligned.words, lines, previousVoice, Number(previousVoice?.tolerance ?? 0.04));

  const cleanCaptions = captions.map(({ wordIds: _ids, ...line }) => line);
  atomicWriteJson(captionsPath, cleanCaptions);
  atomicWriteJson(voicePath, voice);
  atomicWriteJson(path.join(jobDir, "data", "words-timeline.json"), { source: "aroll-transcript", masterHash: contract.masterHash, words: aligned.words });
  atomicWriteJson(path.join(jobDir, "data", "captions-provenance.json"), {
    source: "aroll-transcript",
    master: contract.master,
    masterHash: contract.masterHash,
    edlHash: contract.edlHash,
    captionsHash: sha256File(captionsPath),
    model: transcript.model,
    dtw: transcript.dtw,
    language,
    script: scriptRelative || null,
    scriptAlignment: aligned.skipped ? "skipped(CJK 或无文稿)" : { matched: aligned.matched, missed: aligned.missed, extraAsrWords: aligned.extra },
    generatedAt: new Date().toISOString()
  });
  console.log(`字幕 ${cleanCaptions.length} 条 · 人声区 ${voice.regions.length} · 文稿匹配 ${aligned.skipped ? "跳过" : `${aligned.matched}/${aligned.words.length}，文稿漏词 ${aligned.missed.length}`} → data/captions.json`);
  if (!aligned.skipped && aligned.missed.length) console.log(`  文稿里 ASR 没听到的词已并入相邻字幕：${aligned.missed.join(" / ")}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
