import fs from "node:fs";
import path from "node:path";
import { parseArgs, resolveJob, run, videoDuration, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const sourceDir = path.resolve(jobDir, args.sourceDir || "assets/originals");
const proxyDir = path.resolve(jobDir, args.proxyDir || "assets/proxies");
const outFile = path.resolve(jobDir, args.out || "data/rough-cut-edl.json");

const threshold = args.threshold || "-35dB";
const minSilence = Number(args.minSilence || 0.42);
const minSpeech = Number(args.minSpeech || 0.75);
const pad = Number(args.pad || 0.08);
const maxGap = Number(args.maxGap || 0.5);
const skipProxy = Boolean(args["skip-proxy"]);
const forceProxy = Boolean(args["force-proxy"]);

const sources = fs
  .readdirSync(sourceDir)
  .filter((name) => /\.(mp4|mov|m4v)$/i.test(name))
  .sort()
  .map((name) => path.join(sourceDir, name));

if (!sources.length) {
  console.error(`No video sources in ${sourceDir}`);
  process.exit(1);
}

fs.mkdirSync(proxyDir, { recursive: true });

let outStart = 0;
const edl = [];

for (const [clipIndex, sourcePath] of sources.entries()) {
  const duration = videoDuration(sourcePath);
  const proxyPath = path.join(proxyDir, `${path.parse(sourcePath).name}.mp4`);
  if (!skipProxy) ensureProxy(sourcePath, proxyPath, { force: forceProxy });

  const spans = detectSpeechSpans(sourcePath, duration);
  for (const [spanIndex, [sourceStart, sourceEnd]] of spans.entries()) {
    const segmentDuration = round(sourceEnd - sourceStart);
    const id = `seg-${String(edl.length + 1).padStart(3, "0")}`;
    edl.push({
      id,
      clip: path.basename(sourcePath),
      source: rel(proxyPath),
      original: rel(sourcePath),
      sourceStart,
      sourceEnd,
      outStart: round(outStart),
      outEnd: round(outStart + segmentDuration),
      duration: segmentDuration,
      reason: spanIndex === 0 ? "audio activity rough cut" : "continued after long silence"
    });
    outStart += segmentDuration;
  }

  console.log(`${path.basename(sourcePath)} -> ${spans.length} segment(s)`);
}

writeJson(outFile, edl);
console.log(`Wrote ${outFile}`);
console.log(`Segments: ${edl.length}`);
console.log(`Duration: ${round(outStart)}s`);

function detectSpeechSpans(file, duration) {
  const result = run(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=n=${threshold}:d=${minSilence}`, "-f", "null", "-"],
    { capture: true }
  );
  const log = `${result.stdout || ""}\n${result.stderr || ""}`;
  const silences = parseSilences(log);
  const raw = speechFromSilences(silences, duration);
  const padded = raw
    .filter(([start, end]) => end - start >= minSpeech)
    .map(([start, end]) => [Math.max(0, start - pad), Math.min(duration, end + pad)]);
  return mergeCloseSpans(padded.length ? padded : [[0, duration]]);
}

function parseSilences(log) {
  const starts = [];
  const silences = [];
  for (const line of log.split("\n")) {
    const start = line.match(/silence_start:\s*([0-9.]+)/);
    if (start) {
      starts.push(Number(start[1]));
      continue;
    }
    const end = line.match(/silence_end:\s*([0-9.]+)/);
    if (end && starts.length) {
      silences.push([starts.pop(), Number(end[1])]);
    }
  }
  return silences.sort((a, b) => a[0] - b[0]);
}

function speechFromSilences(silences, duration) {
  const spans = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) spans.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) spans.push([cursor, duration]);
  return spans;
}

function mergeCloseSpans(spans) {
  const merged = [];
  for (const [start, end] of spans) {
    const last = merged.at(-1);
    if (last && start - last[1] <= maxGap) {
      last[1] = round(Math.max(last[1], end));
    } else {
      merged.push([round(start), round(end)]);
    }
  }
  return merged;
}

function ensureProxy(sourcePath, proxyPath, options = {}) {
  if (!options.force && fs.existsSync(proxyPath) && fs.statSync(proxyPath).size > 0) return;
  console.log(`Proxy: ${path.basename(sourcePath)}`);
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    proxyPath
  ]);
}

function rel(file) {
  return path.relative(jobDir, file).split(path.sep).join("/");
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
