import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function projectRoot() {
  return path.resolve(new URL("..", import.meta.url).pathname);
}

export function resolveJob(jobArg) {
  const root = projectRoot();
  if (!jobArg) return path.join(root, "jobs", "current");
  return path.isAbsolute(jobArg) ? jobArg : path.join(root, jobArg);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function ensureSymlink(target, linkPath) {
  try {
    fs.lstatSync(linkPath);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, "dir");
}

export function readJsonArray(file) {
  if (!fs.existsSync(file)) return [];
  const data = readJson(file);
  if (!Array.isArray(data)) throw new Error(`${file} must contain a JSON array`);
  return data;
}

export function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${stderr}`);
  }
  return result;
}

export function commandOk(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim()
  };
}

export function ffprobeJson(file) {
  const result = run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,codec_type,codec_name,pix_fmt,width,height,sample_aspect_ratio,display_aspect_ratio,r_frame_rate,avg_frame_rate,start_pts,start_time,time_base,duration,bit_rate,sample_rate,channels,color_range,color_space,color_transfer,color_primaries:stream_tags=rotate:stream_side_data=side_data_type,rotation",
      "-show_entries",
      "format=start_time,duration,size,bit_rate",
      "-of",
      "json",
      file
    ],
    { capture: true }
  );
  return JSON.parse(result.stdout);
}

export function displayVideoGeometry(stream) {
  const width = Number(stream?.width || 0);
  const height = Number(stream?.height || 0);
  const sideDataRotation = Array.isArray(stream?.side_data_list)
    ? stream.side_data_list.find((item) => Number.isFinite(Number(item?.rotation)))?.rotation
    : undefined;
  const rawRotation = Number(sideDataRotation ?? stream?.tags?.rotate ?? 0);
  const rotation = Number.isFinite(rawRotation) ? rawRotation : 0;
  const normalized = ((rotation % 360) + 360) % 360;
  const quarterTurn = Math.abs(normalized - 90) < 0.01 || Math.abs(normalized - 270) < 0.01;
  return {
    width: quarterTurn ? height : width,
    height: quarterTurn ? width : height,
    rotation
  };
}

export function frameRateValue(value) {
  const text = String(value || "").trim();
  if (!text) return Number.NaN;
  const [numeratorText, denominatorText] = text.split("/");
  const numerator = Number(numeratorText);
  const denominator = denominatorText == null ? 1 : Number(denominatorText);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return numerator / denominator;
}

export function videoDuration(file) {
  const probe = ffprobeJson(file);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const raw = Number(video?.duration || probe.format?.duration);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`Cannot read video duration from ${file}`);
  }
  return raw;
}

export function sanitizeSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function seconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid seconds value: ${value}`);
  return n;
}

export function fmtTime(value) {
  return seconds(value).toFixed(2);
}

// ---------- 确定性中文字体源（pyftsubset 子集化用）：FACTORY_CJK_FONT → apt fonts-noto-cjk → macOS Hiragino
// 出处：2026-09-18 Linux 对齐容器 smoke 炸在写死的 /System/Library/Fonts/Hiragino Sans GB.ttc
export const CJK_FONT_CANDIDATES = Object.freeze([
  process.env.FACTORY_CJK_FONT,
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc"
].filter(Boolean));

export function resolveCjkFontSource() {
  const source = CJK_FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error(`缺少确定性中文字体源；设置 FACTORY_CJK_FONT，或安装候选字体（Linux: sudo apt install fonts-noto-cjk）: ${CJK_FONT_CANDIDATES.join(", ")}`);
  }
  return source;
}
