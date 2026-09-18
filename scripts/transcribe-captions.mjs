// ============================================================
// 本地 whisper 转录 → data/captions.json 初稿
// 段级时间戳(词级会切碎中文),中文标点二次切分到手机可读长度。
// 术语校准仍走 Claude 任务卡,这里只产初稿。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const config = readJson(path.join(jobDir, "project.json"));
const sourceVideo = path.join(jobDir, config.sourceVideo || "assets/aroll.mp4");
const model = args.model || path.join(os.homedir(), ".cache", "whisper-cpp", "ggml-large-v3-turbo.bin");
const maxChars = Number(args.maxChars || 20);

if (!fs.existsSync(sourceVideo)) fail(`缺少母版 A-roll: ${sourceVideo}`);
if (!fs.existsSync(model)) fail(`缺少 whisper 模型: ${model}(用 --model 指定)`);

const tmpDir = path.join(jobDir, "tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const wav = path.join(tmpDir, "transcribe-16k.wav");
const outBase = path.join(tmpDir, "transcript");

console.log("① 提取 16k mono 音频…");
run("ffmpeg", ["-y", "-loglevel", "error", "-i", sourceVideo, "-vn", "-ac", "1", "-ar", "16000", wav]);

console.log(`② whisper 转录(${path.basename(model)},全程本地)…`);
run("whisper-cli", ["-m", model, "-l", "zh", "-oj", "-of", outBase, "-np", wav]);

const raw = JSON.parse(fs.readFileSync(`${outBase}.json`, "latin1"));
const segments = (raw.transcription || [])
  .map((seg) => ({
    start: (seg.offsets?.from ?? 0) / 1000,
    end: (seg.offsets?.to ?? 0) / 1000,
    text: decodeText(seg.text)
  }))
  .filter((seg) => seg.text && seg.end > seg.start);

if (!segments.length) fail("转录结果为空");

const captions = segments.flatMap(splitSegment).map((seg) => ({
  s: round(seg.start),
  e: round(seg.end),
  t: seg.text
}));

const outFile = path.join(jobDir, "data", "captions.json");
backup(outFile);
writeJson(outFile, captions);
fs.rmSync(wav, { force: true });

console.log(`③ 完成:${captions.length} 条字幕初稿 → ${outFile}`);
console.log("下一步:用控制台的「Claude 字幕任务卡」做通篇术语校准(核心词不许被 ASR 覆盖)。");

// whisper-cli 的 JSON 是字节流写出的 UTF-8;用 latin1 读入后按字节还原
function decodeText(text) {
  return Buffer.from(String(text || ""), "latin1").toString("utf8").replace(/\s+/g, " ").trim();
}

function splitSegment(seg) {
  const text = seg.text.replace(/[,。!?;、]+$/g, "");
  if (text.length <= maxChars) return [{ ...seg, text }];
  const parts = [];
  let buffer = "";
  for (const char of text) {
    buffer += char;
    const isBreak = /[,。!?;、,.!?]/.test(char);
    if ((isBreak && buffer.length >= 6) || buffer.length >= maxChars) {
      parts.push(buffer.replace(/[,。!?;、,.!?]+$/g, "").trim());
      buffer = "";
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());
  const total = parts.reduce((sum, part) => sum + part.length, 0) || 1;
  const duration = seg.end - seg.start;
  let cursor = seg.start;
  return parts
    .filter(Boolean)
    .map((part) => {
      const span = (part.length / total) * duration;
      const item = { start: cursor, end: cursor + span, text: part };
      cursor += span;
      return item;
    });
}

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) fail(`${cmd} 失败(退出码 ${result.status})`);
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const dir = path.join(path.dirname(file), ".history");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(file, path.join(dir, `${path.basename(file)}.${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}`));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
