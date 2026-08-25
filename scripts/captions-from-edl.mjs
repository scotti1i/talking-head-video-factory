import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, readJsonArray, resolveJob, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const edlPath = path.resolve(jobDir, args.edl || "data/rough-cut-edl.json");
const indexPath = path.resolve(jobDir, args.index || "data/transcripts/index.json");
const outputPath = path.resolve(jobDir, args.output || "data/captions.json");
const configPath = path.join(jobDir, "project.json");
const config = fs.existsSync(configPath) ? readJson(configPath) : {};
const maxChars = Number(args.maxChars || config.caption?.maxCharsPerLine || 18);
const maxDuration = Number(args.maxDuration || 2.8);

const edl = readJsonArray(edlPath);
const index = readJson(indexPath);
if (!edl.length) throw new Error(`EDL 为空: ${edlPath}`);
if (!Array.isArray(index.sources) || !index.sources.length) throw new Error(`转录索引为空: ${indexPath}`);

const mappedWords = [];
let outputCursor = 0;
for (const [segmentIndex, segment] of edl.entries()) {
  const source = String(segment.source || "");
  const match = findTranscript(index.sources, source);
  if (!match) throw new Error(`EDL 第 ${segmentIndex + 1} 段找不到转录缓存: ${source}`);
  const transcript = readJson(path.join(jobDir, match.transcript));
  const sourceStart = Number(segment.sourceStart);
  const sourceEnd = Number(segment.sourceEnd);
  if (!(sourceEnd > sourceStart)) throw new Error(`EDL 第 ${segmentIndex + 1} 段时间非法`);

  const words = transcript.words
    .filter((word) => Number(word.end) > sourceStart && Number(word.start) < sourceEnd)
    .map((word) => ({
      text: word.text,
      start: outputCursor + Math.max(0, Number(word.start) - sourceStart),
      end: outputCursor + Math.min(sourceEnd - sourceStart, Number(word.end) - sourceStart)
    }))
    .filter((word) => word.end > word.start);
  mappedWords.push(...words);
  outputCursor += sourceEnd - sourceStart;
}

const captions = groupWords(mappedWords);
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
  for (const word of words) {
    group.push(word);
    const text = joinTokens(group.map((item) => item.text));
    const duration = group.at(-1).end - group[0].start;
    const punctuation = /[。！？!?；;，,]$/.test(text);
    if ((text.length >= maxChars && punctuation) || text.length >= maxChars + 4 || duration >= maxDuration) flush();
  }
  flush();
  return result;

  function flush() {
    if (!group.length) return;
    const text = joinTokens(group.map((item) => item.text)).trim();
    if (text) {
      result.push({
        s: round(group[0].start),
        e: round(group.at(-1).end),
        t: text
      });
    }
    group = [];
  }
}

function joinTokens(tokens) {
  return tokens.reduce((text, token) => {
    const value = String(token || "").trim();
    if (!value) return text;
    const needsSpace = /[\p{L}\p{N}]$/u.test(text) && /^[\p{L}\p{N}]/u.test(value);
    return `${text}${needsSpace ? " " : ""}${value}`;
  }, "");
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
