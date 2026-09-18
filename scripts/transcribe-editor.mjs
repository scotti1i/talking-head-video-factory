import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, resolveJob, run, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const sourceDir = path.resolve(jobDir, args.sourceDir || "assets/originals");
const transcriptDir = path.resolve(jobDir, args.outputDir || "data/transcripts");
const model = path.resolve(args.model || path.join(os.homedir(), ".cache", "whisper-cpp", "ggml-large-v3-turbo.bin"));
const language = String(args.language || "zh");
const force = Boolean(args.force);
const noGpu = Boolean(args["no-gpu"]);
const threads = Number(args.threads || 0);

if (threads && (!Number.isInteger(threads) || threads < 1)) {
  throw new Error(`--threads 必须是正整数，收到: ${args.threads}`);
}

if (!fs.existsSync(model)) throw new Error(`Whisper 模型不存在: ${model}`);
if (!fs.existsSync(sourceDir)) throw new Error(`素材目录不存在: ${sourceDir}`);

const sources = fs
  .readdirSync(sourceDir)
  .filter((name) => /\.(mp4|mov|m4v)$/i.test(name))
  .sort()
  .map((name) => path.join(sourceDir, name));

if (!sources.length) throw new Error(`素材目录里没有视频: ${sourceDir}`);

fs.mkdirSync(transcriptDir, { recursive: true });
const index = [];

for (const source of sources) {
  const hash = await sha256(source);
  const stem = safeStem(path.basename(source, path.extname(source)));
  const transcriptPath = path.join(transcriptDir, `${stem}-${hash.slice(0, 12)}.json`);
  const cached = !force && fs.existsSync(transcriptPath);
  if (!cached) transcribe(source, transcriptPath, stem);
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
  index.push({
    source: path.relative(jobDir, source).split(path.sep).join("/"),
    hash,
    transcript: path.relative(jobDir, transcriptPath).split(path.sep).join("/"),
    cached,
    segments: transcript.segments.length,
    words: transcript.words.length
  });
  console.log(`${cached ? "缓存" : "转录"}: ${path.basename(source)} · ${transcript.words.length} token`);
}

writeJson(path.join(transcriptDir, "index.json"), { generatedAt: new Date().toISOString(), model, language, sources: index });
writePacked(index, path.join(jobDir, "data", "takes-packed.md"));
console.log(`编辑转录完成 → ${path.join(jobDir, "data", "takes-packed.md")}`);

function transcribe(source, transcriptPath, stem) {
  const tmpDir = path.join(jobDir, "tmp", "editor-transcribe");
  fs.mkdirSync(tmpDir, { recursive: true });
  const wav = path.join(tmpDir, `${stem}.wav`);
  const outBase = path.join(tmpDir, `${stem}-full`);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vn", "-ac", "1", "-ar", "16000", wav]);
  run("whisper-cli", [
    ...(noGpu ? ["-ng"] : []),
    ...(threads ? ["-t", String(threads)] : []),
    "-m", model, "-l", language, "-ojf", "-of", outBase, "-np", wav
  ]);
  const raw = JSON.parse(fs.readFileSync(`${outBase}.json`, "latin1"));
  const segments = (raw.transcription || []).map(normalizeSegment).filter((item) => item.end > item.start && item.text);
  const words = segments.flatMap((segment) => segment.words);
  writeJson(transcriptPath, {
    version: 1,
    source: path.relative(jobDir, source).split(path.sep).join("/"),
    model: path.basename(model),
    language,
    createdAt: new Date().toISOString(),
    segments: segments.map(({ words: _words, ...segment }) => segment),
    words
  });
  fs.rmSync(wav, { force: true });
  fs.rmSync(`${outBase}.json`, { force: true });
}

function normalizeSegment(segment, segmentIndex) {
  const start = Number(segment.offsets?.from || 0) / 1000;
  const end = Number(segment.offsets?.to || 0) / 1000;
  return {
    id: `seg-${String(segmentIndex + 1).padStart(4, "0")}`,
    start: round(start),
    end: round(end),
    text: decodeBytes(segment.text),
    words: normalizeTokens(segment.tokens || [], segmentIndex)
  };
}

function normalizeTokens(tokens, segmentIndex) {
  const result = [];
  let pending = [];
  for (const token of tokens) {
    const raw = String(token.text || "");
    if (/^\[.*\]$/.test(raw)) continue;
    pending.push(token);
    const text = decodeBytes(pending.map((item) => item.text).join(""));
    if (text.includes("�")) continue;
    const clean = text.trim();
    if (clean) {
      const first = pending[0];
      const last = pending.at(-1);
      result.push({
        id: `w-${String(segmentIndex + 1).padStart(4, "0")}-${String(result.length + 1).padStart(3, "0")}`,
        start: round(Number(first.offsets?.from || 0) / 1000),
        end: round(Number(last.offsets?.to || 0) / 1000),
        text: clean,
        confidence: round(Math.min(...pending.map((item) => Number(item.p ?? 1))))
      });
    }
    pending = [];
  }
  return result;
}

function writePacked(index, output) {
  const sections = index.map((item) => {
    const transcript = JSON.parse(fs.readFileSync(path.join(jobDir, item.transcript), "utf8"));
    const lines = transcript.segments.map((segment) =>
      `- [${clock(segment.start)}–${clock(segment.end)}] ${segment.text}`
    );
    return `## ${path.basename(item.source)}\n\n${lines.join("\n")}`;
  });
  fs.writeFileSync(output, `# 编辑转录\n\n${sections.join("\n\n")}\n`);
}

function decodeBytes(value) {
  return Buffer.from(String(value || ""), "latin1").toString("utf8").replace(/\s+/g, " ").trim();
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function safeStem(value) {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, "-").replace(/^-+|-+$/g, "") || "source";
}

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
