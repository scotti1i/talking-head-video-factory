import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

// ============================================================
// 本机私有配置（~/.config/talking-head-factory/env）
// 为什么：客户机器上 jobs 根目录、操作员角色、API key 都不进仓库；
// 命令行没 export 时也要能读到，所以 env 文件是第二事实源。
// FACTORY_CONFIG_DIR 只给测试隔离用。
// ============================================================
export function factoryConfigDir() {
  return process.env.FACTORY_CONFIG_DIR || path.join(os.homedir(), ".config", "talking-head-factory");
}

export function factoryEnvFile() {
  return path.join(factoryConfigDir(), "env");
}

export function readFactoryEnv() {
  const file = factoryEnvFile();
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function factoryEnvValue(key) {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;
  return readFactoryEnv()[key];
}

// 只改一个 key，保留其余行；文件权限 600（同目录可能存 API key）。
export function writeFactoryEnvValue(key, value) {
  const file = factoryEnvFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  const filtered = lines.filter((line) => !line.startsWith(`${key}=`));
  while (filtered.length && filtered.at(-1).trim() === "") filtered.pop();
  filtered.push(`${key}=${value}`);
  fs.writeFileSync(file, `${filtered.join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

// ============================================================
// jobs 根目录
// 为什么：v2 起 jobs 不在仓库内（客户机器只 update 代码），
// FACTORY_JOBS_ROOT 指向外部目录；未设置时保持 <root>/jobs 兼容。
// ============================================================
export function jobsRoot() {
  const configured = factoryEnvValue("FACTORY_JOBS_ROOT");
  if (configured) return path.resolve(configured);
  return path.join(projectRoot(), "jobs");
}

export function resolveJob(jobArg) {
  const root = projectRoot();
  if (!jobArg) return path.join(jobsRoot(), "current");
  const text = String(jobArg);
  if (path.isAbsolute(text)) return text;
  const normalized = text.replaceAll("\\", "/").replace(/\/+$/, "");
  const match = normalized.match(/^jobs\/(.+)$/);
  if (match) return path.join(jobsRoot(), ...match[1].split("/"));
  if (normalized === "jobs") return jobsRoot();
  if (!normalized.includes("/") && !fs.existsSync(path.join(root, normalized))) {
    return path.join(jobsRoot(), normalized);
  }
  return path.join(root, text);
}

// ============================================================
// 硬拒：审片成片 / 渲染产物不得回流当输入
// 为什么：v1 客户机上 Codex 拿 review/R1/video.mp4 再补丁一轮，
// 时间链就断了；改动必须回到 EDL / captions 这些事实源。
// ============================================================
const DERIVED_DIRS = Object.freeze(["review", "renders"]);

export function assertNotDerivedInput(filePath, jobDir, commandName) {
  const target = path.resolve(String(filePath || ""));
  // 规则按 spec §4 直译：路径任一目录段是 review/ 或 renders/ 就拒绝，
  // 不区分是哪个 job——审片件复制到别处改名再喂回来也一样不行。
  const segments = target.split(path.sep).slice(0, -1);
  if (segments.some((segment) => DERIVED_DIRS.includes(segment))) {
    throw derivedInputError(filePath, commandName, jobDir);
  }
  return target;
}

function derivedInputError(filePath, commandName, jobDir) {
  const where = jobDir ? `（job: ${jobDir}）` : "";
  return new Error(
    `${commandName || "命令"} 不得以审片成片或渲染产物作输入: ${filePath}${where}\n` +
    "review/ 与 renders/ 下的文件只是结果，不是事实源；请回到 EDL / captions / project.json 修改后重新生成。"
  );
}

// job 目录里 package.json 调 hyperframes 的路径：job 在仓库内用相对路径，
// 在外部 FACTORY_JOBS_ROOT 时用绝对路径，避免 ../../ 跳错。
export function hyperframesCli(fromDir) {
  const root = projectRoot();
  const cli = path.join(root, "node_modules", ".bin", "hyperframes");
  const resolved = path.resolve(fromDir);
  if (!resolved.startsWith(root + path.sep)) return cli;
  return path.relative(resolved, cli).replaceAll(path.sep, "/");
}

// templates/job/package.json 写死了 ../../node_modules/.bin/hyperframes；
// job 复制到外部根目录后按实际位置重写，脚本本身不变。
export function relinkJobPackage(jobDir) {
  const file = path.join(jobDir, "package.json");
  if (!fs.existsSync(file)) return;
  const pkg = readJson(file);
  const cli = hyperframesCli(jobDir);
  // variants/<id>/package.json 写的是 ../../../../，一并处理
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    pkg.scripts[name] = String(command).replace(/(?:\.\.\/)+node_modules\/\.bin\/hyperframes|\/[^\s]*\/node_modules\/\.bin\/hyperframes/g, cli);
  }
  writeJson(file, pkg);
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

// 只问 PATH 里有没有这个命令，不执行它（commandOk 会真跑一次 --version）
export function commandExists(name) {
  const result = spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "pipe", encoding: "utf8" });
  return result.status === 0;
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
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");
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
