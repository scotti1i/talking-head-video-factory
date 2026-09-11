// ============================================================
// 编辑转录：对 assets/originals 下每条原片按内容哈希做一次词级转录缓存（剪辑决策用；字幕不再从这里出，见 captions-from-aroll.mjs）
// 用法：node scripts/transcribe-editor.mjs --job jobs/<slug> [--language es] [--model <path>] [--force]
// ============================================================
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";
import { DEFAULT_MODEL, transcribeMedia } from "./whisper-lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const sourceDir = path.resolve(jobDir, args.sourceDir || "assets/originals");
const transcriptDir = path.resolve(jobDir, args.outputDir || "data/transcripts");
const model = path.resolve(args.model || process.env.FACTORY_WHISPER_MODEL || DEFAULT_MODEL);
const project = fs.existsSync(path.join(jobDir, "project.json")) ? readJson(path.join(jobDir, "project.json")) : {};
const language = String(args.language || project.editorial?.language || "auto");
const force = Boolean(args.force);

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
  if (!cached) {
    const transcript = transcribeMedia({ source, model, language, tmpDir: path.join(jobDir, "tmp", "editor-transcribe") });
    writeJson(transcriptPath, { ...transcript, source: path.relative(jobDir, source).split(path.sep).join("/") });
  }
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
  index.push({
    source: path.relative(jobDir, source).split(path.sep).join("/"),
    hash,
    transcript: path.relative(jobDir, transcriptPath).split(path.sep).join("/"),
    cached,
    segments: transcript.segments.length,
    words: transcript.words.length
  });
  console.log(`${cached ? "缓存" : "转录"}: ${path.basename(source)} · ${transcript.words.length} 词`);
}

writeJson(path.join(transcriptDir, "index.json"), { generatedAt: new Date().toISOString(), model, language, sources: index });
writePacked(index, path.join(jobDir, "data", "takes-packed.md"));
console.log(`编辑转录完成 → ${path.join(jobDir, "data", "takes-packed.md")}`);

function writePacked(entries, output) {
  const sections = entries.map((item) => {
    const transcript = JSON.parse(fs.readFileSync(path.join(jobDir, item.transcript), "utf8"));
    const lines = transcript.segments.map((segment) => `- [${clock(segment.start)}–${clock(segment.end)}] ${segment.text}`);
    return `## ${path.basename(item.source)}\n\n${lines.join("\n")}`;
  });
  fs.writeFileSync(output, `# 编辑转录\n\n${sections.join("\n\n")}\n`);
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
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9一-鿿._-]+/g, "-").replace(/^-+|-+$/g, "") || "source";
}

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
