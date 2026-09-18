import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";
import { createTimedCaptionWords } from "./dynamic-captions.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const edlPath = path.resolve(jobDir, args.edl || "data/rough-cut-edl.json");
const indexPath = path.resolve(jobDir, args.index || "data/transcripts/index.json");
const outputPath = path.resolve(jobDir, args.output || "data/captions.json");
const configPath = path.join(jobDir, "project.json");
const config = fs.existsSync(configPath) ? readJson(configPath) : {};
const maxChars = Number(args.maxChars || config.caption?.maxCharsPerLine || 18);
// 长教程字幕按完整语义和自然气口切分。2.8 秒硬切会把“内部的工作原理”
// 之类的短语从词中间劈开；纪录片字幕允许一句话多停留一会儿。
const maxDuration = Number(args.maxDuration || 5.2);
const hardChars = Number(args.hardChars || maxChars + 6);

const edl = readJsonArray(edlPath);
const index = readJson(indexPath);
if (!edl.length) throw new Error(`EDL 为空: ${edlPath}`);
if (!Array.isArray(index.sources) || !index.sources.length) throw new Error(`转录索引为空: ${indexPath}`);
if (Number(config.editorial?.contractVersion || 0) >= 1) {
  const missingLinks = edl.flatMap((segment, index) => [
    ...(!String(segment?.id || "").trim() ? [`EDL[${index}].id`] : []),
    ...(!String(segment?.storyBeatId || "").trim() ? [`EDL[${index}].storyBeatId`] : []),
    ...(!String(segment?.takeId || "").trim() ? [`EDL[${index}].takeId`] : [])
  ]);
  if (missingLinks.length) throw new Error(`规划器合同引用缺失: ${missingLinks.join(", ")}`);
}

const mappedWords = [];
let outputCursor = 0;
for (const [segmentIndex, segment] of edl.entries()) {
  const source = String(segment.source || "");
  const match = findTranscript(index.sources, source);
  if (!match) throw new Error(`EDL 第 ${segmentIndex + 1} 段找不到转录缓存: ${source}`);
  const transcript = readJson(path.join(jobDir, match.transcript));
  const transcriptSignals = buildTranscriptBoundarySignals(transcript);
  const sourceStart = Number(segment.sourceStart);
  const sourceEnd = Number(segment.sourceEnd);
  if (!(sourceEnd > sourceStart)) throw new Error(`EDL 第 ${segmentIndex + 1} 段时间非法`);

  const words = transcript.words
    .filter((word) => Number(word.end) > sourceStart && Number(word.start) < sourceEnd)
    .map((word) => {
      const start = outputCursor + Math.max(0, Number(word.start) - sourceStart);
      const rawEnd = outputCursor + Math.min(sourceEnd - sourceStart, Number(word.end) - sourceStart);
      return {
        text: word.text,
        start,
        // whisper.cpp 偶尔给汉字返回零时长；丢掉它会直接造成字幕缺字。
        end: Math.max(rawEnd, start + 0.001),
        // Whisper 的 segment 边界比单纯按字符数更接近自然语义边界。
        // 保留这个信号，避免把“举个 / 例子”“目标就是让 / 你满意”拆开。
        segmentEnd: transcriptSignals.endWordIds.has(word.id),
        segmentStartText: transcriptSignals.startTextByWordId.get(word.id) || "",
        storyBeatId: segment.storyBeatId,
        edlSegmentId: segment.id
      };
    })
    .filter((word) => word.end > word.start);
  if (words.length) words[0].cutBefore = mappedWords.length > 0;
  mappedWords.push(...words);
  outputCursor += sourceEnd - sourceStart;
}

const captions = groupWords(mappedWords).map((item, index) => ({
  id: `caption-${String(index + 1).padStart(3, "0")}`,
  ...item
}));
if (!captions.length) throw new Error("EDL 范围内没有可用词级 token，不能生成字幕");
writeJson(outputPath, captions);
console.log(`字幕由词级缓存重映射完成: ${captions.length} 条 → ${outputPath}`);

function findTranscript(sources, requested) {
  const normalized = requested.replaceAll("\\", "/");
  return sources.find((item) => item.source === normalized)
    || sources.find((item) => path.basename(item.source) === path.basename(normalized));
}

function groupWords(words) {
  const result = [];
  let group = [];
  for (const [index, word] of words.entries()) {
    if (word.cutBefore && group.length) flush();
    if (group.length) {
      const currentText = joinTokens(group.map((item) => item.text));
      const currentDuration = group.at(-1).end - group[0].start;
      const incomingClause = isClauseStarter(word.segmentStartText);
      const longPause = Number(word.start) - Number(group.at(-1).end) >= 1.25;
      const readable = currentText.length >= 11 || currentDuration >= 1.9;
      if (readable && !hasDanglingEnding(currentText) && (incomingClause || longPause)) flush();
    }
    group.push(word);
    const text = joinTokens(group.map((item) => item.text));
    const duration = group.at(-1).end - group[0].start;
    const next = words[index + 1];
    const sentenceEnd = /[。！？!?；;]$/.test(text);
    const continuesAsciiToken = next
      && /[A-Za-z0-9]$/.test(String(word.text || "").trim())
      && /^[A-Za-z0-9]/.test(String(next.text || "").trim());
    const dangling = hasDanglingEnding(text);
    const enoughToRead = text.length >= Math.max(9, Math.floor(maxChars * 0.52)) || duration >= 2.35;
    const semanticBoundary = Boolean(word.segmentEnd) && enoughToRead;
    // maxChars / maxDuration 是软上限。只有到 Whisper 的自然段尾才切，
    // 宁可偶尔多一行，也不为了凑字数破坏一句话。
    const longAtSemanticBoundary = Boolean(word.segmentEnd)
      && (text.length >= hardChars || duration >= maxDuration);
    if (!continuesAsciiToken && !dangling
      && (sentenceEnd || semanticBoundary || longAtSemanticBoundary)) flush();
  }
  flush();
  return normalizeShortCaptions(result);

  function flush() {
    if (!group.length) return;
    const text = joinTokens(group.map((item) => item.text)).trim();
    if (text) {
      result.push({
        s: round(group[0].start),
        e: round(group.at(-1).end),
        t: text,
        storyBeatId: group[0].storyBeatId,
        edlSegmentId: group[0].edlSegmentId,
        words: createTimedCaptionWords(group, text)
      });
    }
    group = [];
  }
}

function isClauseStarter(text) {
  return /^(那|那么|然后|但是|不过|而且|并且|因为|所以|比如|例如|另外|包括|其实|如果|假如|同时|或者|接下来|首先|其次)/.test(String(text || "").trim());
}

function normalizeShortCaptions(captions) {
  const normalized = captions.map((item) => ({ ...item }));
  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index];
    if (item.e - item.s >= 0.5) continue;
    const previous = normalized[index - 1];
    const next = normalized[index + 1];
    if (previous
      && previous.storyBeatId === item.storyBeatId
      && previous.edlSegmentId === item.edlSegmentId
      && item.s - previous.e <= 0.5
      && `${previous.t}${item.t}`.length <= 42) {
      previous.t = `${previous.t}${item.t}`;
      previous.e = item.e;
      previous.words = [...(previous.words || []), ...(item.words || [])];
      normalized.splice(index, 1);
      index -= 1;
      continue;
    }
    if (next
      && next.storyBeatId === item.storyBeatId
      && next.edlSegmentId === item.edlSegmentId
      && next.s - item.e <= 0.5
      && `${item.t}${next.t}`.length <= 42) {
      next.t = `${item.t}${next.t}`;
      next.s = item.s;
      next.words = [...(item.words || []), ...(next.words || [])];
      normalized.splice(index, 1);
      index -= 1;
      continue;
    }
    item.e = round(item.s + 0.5);
  }
  return normalized;
}

function buildTranscriptBoundarySignals(transcript) {
  const words = Array.isArray(transcript.words) ? transcript.words : [];
  const segments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const endWordIds = new Set();
  const startTextByWordId = new Map();
  const wordsBySegment = new Map();
  for (const word of words) {
    const match = String(word.id || "").match(/^w-(\d+)-/);
    if (!match) continue;
    const items = wordsBySegment.get(match[1]) || [];
    items.push(word);
    wordsBySegment.set(match[1], items);
  }
  let cursor = 0;
  for (const segment of segments) {
    const segmentId = String(segment.id || "").match(/^seg-(\d+)$/)?.[1];
    const ownedWords = segmentId ? wordsBySegment.get(segmentId) : null;
    if (ownedWords?.length) {
      startTextByWordId.set(ownedWords[0].id, String(segment.text || "").trim());
      endWordIds.add(ownedWords.at(-1).id);
      continue;
    }
    const start = Number(segment.start);
    const end = Number(segment.end);
    while (cursor < words.length && Number(words[cursor].end) < start - 0.16) cursor += 1;
    let firstIndex = -1;
    let lastIndex = -1;
    let firstDelta = Infinity;
    let lastDelta = Infinity;
    for (let index = cursor; index < words.length; index += 1) {
      const word = words[index];
      if (Number(word.start) > end + 0.16) break;
      if (Number(word.end) >= start - 0.16) {
        const startDelta = Math.abs(Number(word.start) - start);
        const endDelta = Math.abs(Number(word.end) - end);
        if (Number(word.start) >= start - 0.05 && startDelta < firstDelta) {
          firstDelta = startDelta;
          firstIndex = index;
        }
        if (Number(word.end) <= end + 0.08 && endDelta < lastDelta) {
          lastDelta = endDelta;
          lastIndex = index;
        }
      }
    }
    if (firstIndex >= 0) {
      startTextByWordId.set(words[firstIndex].id, String(segment.text || "").trim());
      endWordIds.add(words[lastIndex].id);
    }
  }
  return { endWordIds, startTextByWordId };
}

function hasDanglingEnding(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  return /(举个|比如|例如|所以|所以说|然后|然后呢|但是|不过|而且|并且|因为|如果|假如|虽然|只要|除非|为了|通过|关于|对于|来自|再强|的话|我们|你们|他们|大家|一个|这个|那个|这些|那些|目标就是|就是让|需要让|可以让|能够让|应该让|以及|或者|还是|同时|从|在|把|被|让|跟|和|与|或|是|有|会|能|要|给|向|为|的|地|得)$/.test(compact);
}

function joinTokens(tokens) {
  const joined = tokens.reduce((text, token) => {
    const value = String(token || "").trim();
    if (!value) return text;
    // whisper.cpp 的词级结果会把中文拆成单字，也会把 Harness / ChatGPT
    // 拆成 h + arness、Chat + G + P + T。这里先无空格重组，再校准术语。
    return `${text}${value}`;
  }, "");
  return normalizeCaptionText(joined);
}

function normalizeCaptionText(text) {
  return text
    .replace(/chairgpt|xgpt/gi, "ChatGPT")
    .replace(/chategpt/gi, "ChatGPT")
    .replace(/chatgpt/gi, "ChatGPT")
    .replace(/claude\s*codex/gi, "Claude Code")
    .replace(/claudecodex/gi, "Claude Code")
    .replace(/cloudcode|claudecode/gi, "Claude Code")
    .replace(/cloud/gi, "Claude")
    .replace(/deepseek/gi, "DeepSeek")
    .replace(/youtube/gi, "YouTube")
    .replace(/codex/gi, "Codex")
    .replace(/harness/gi, "Harness")
    .replace(/superprompt/gi, "Super Prompt")
    .replace(/skills?/gi, "Skill")
    .replace(/gemnet|gem9/gi, "Gemini")
    .replace(/quara/gi, "Quora")
    .replace(/fastmos/gi, "FastMoss")
    .replace(/colordata/gi, "Kalodata")
    .replace(/cdance/gi, "Seedance")
    .replace(/飞数|废书/g, "飞书")
    .replace(/ictai/gi, "SCT AI")
    .replace(/async/gi, "ASIN")
    .replace(/hyperframes?/gi, "HyperFrames")
    .replace(/google春子/gi, "Google Trends")
    .replace(/readed/gi, "Reddit")
    .replace(/Ready(?=的)/g, "Reddit")
    .replace(/hermes/gi, "Harness")
    .replace(/contextwindow|contestwindow/gi, "Context Window")
    .replace(/dock文档/gi, "Doc 文档")
    .replace(/pbt/gi, "PPT")
    .replace(/aiword/gi, "AI味")
    .replace(/script\s*writer/gi, "Script Writer")
    .replace(/agent的md/gi, "AGENTS.md")
    .replace(/购模式/g, "Goal 模式")
    .replace(/^购就/g, "Goal 就")
    .replace(/罗写/g, "裸写")
    .replace(/掉用/g, "调用")
    .replace(/scot(?!t)/gi, "Scott")
    .replace(/蒸留/g, "蒸馏")
    .replace(/铲除结果/g, "产出结果");
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
