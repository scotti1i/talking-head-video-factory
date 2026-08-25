import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { commandOk, parseArgs, projectRoot } from "./lib.mjs";

const args = parseArgs();
const production = Boolean(args.production);
const requireHdr = Boolean(args["require-hdr"]);
const root = projectRoot();
const checks = [];

check("node", nodeMajor() >= 22, `Node ${process.version}`, "需要 Node.js 22+");
for (const [command, commandArgs, label] of [
  ["npm", ["--version"], "npm"],
  ["git", ["--version"], "Git"],
  ["ffmpeg", ["-version"], "FFmpeg"],
  ["ffprobe", ["-version"], "FFprobe"],
  ["whisper-cli", ["--help"], "whisper.cpp"],
  ["pyftsubset", ["--help"], "fonttools"]
]) {
  const result = commandOk(command, commandArgs);
  check(command, result.ok, `${label}: ${firstLine(result.output)}`, `缺少 ${label}`);
}

const ffmpegFilters = commandOk("ffmpeg", ["-hide_banner", "-filters"]);
const hasZscale = /\bzscale\b/.test(ffmpegFilters.output);
const hasTonemap = /\btonemap\b/.test(ffmpegFilters.output);
check("hdr-filters", hasZscale && hasTonemap, `zscale=${hasZscale} tonemap=${hasTonemap}`, "HDR 需要同时包含 zscale 与 tonemap", requireHdr);

const encoders = commandOk("ffmpeg", ["-hide_banner", "-encoders"]);
const hasNvenc = /\bh264_nvenc\b/.test(encoders.output);
check("nvenc", hasNvenc, `h264_nvenc=${hasNvenc}`, "Windows RTX 生产机应提供 h264_nvenc", production);
const nvidia = commandOk("nvidia-smi", ["--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"]);
check("nvidia-runtime", nvidia.ok, firstLine(nvidia.output), "WSL2 内无法访问 NVIDIA GPU", production);
const nvencSmoke = hasNvenc && commandOk("ffmpeg", [
  "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", "color=c=black:s=128x128:r=30:d=0.1",
  "-c:v", "h264_nvenc", "-f", "null", "-"
]);
check("nvenc-smoke", Boolean(nvencSmoke?.ok), nvencSmoke?.ok ? "3-frame encode passed" : "encode unavailable", "NVENC 列表存在但实际编码失败", production);

const inWsl = process.platform === "linux" && /microsoft/i.test(readText("/proc/version"));
check("runtime", !production || inWsl, `platform=${process.platform} wsl=${inWsl}`, "生产部署要求在 WSL2 内运行", production);

const memoryGiB = os.totalmem() / 1024 ** 3;
check("memory", memoryGiB >= 16, `${memoryGiB.toFixed(1)} GiB`, "低于 16GiB 无法稳定渲染");
if (memoryGiB < 32) checks.push({ id: "memory-recommended", level: "warn", ok: true, detail: `${memoryGiB.toFixed(1)} GiB；建议升级到 32GiB` });

const availableGiB = freeDiskGiB(root);
check("disk", availableGiB >= 50, `${availableGiB.toFixed(1)} GiB available`, "渲染前至少需要 50GiB 可用空间");

const model = path.resolve(process.env.WHISPER_MODEL || path.join(os.homedir(), ".cache", "whisper-cpp", "ggml-large-v3-turbo.bin"));
check("whisper-model", fs.existsSync(model), model, "缺少 Whisper 模型");
check("harness-skill", fs.existsSync(path.join(root, ".agents", "skills", "factory-auto-edit", "SKILL.md")), "project skill", "缺少 Harness 项目 Skill");
check("deepseek-key", Boolean(process.env.DEEPSEEK_API_KEY), process.env.DEEPSEEK_API_KEY ? "configured" : "not configured", "生产环境缺少 DEEPSEEK_API_KEY", production);

for (const font of requiredFonts()) {
  check(`font:${font}`, fs.existsSync(path.join(root, "themes", "_shared", "fonts", font)), font, `冻结字体不存在: ${font}`);
}

if (args.json) {
  console.log(JSON.stringify({ production, requireHdr, checks }, null, 2));
} else {
  for (const item of checks) {
    const mark = item.level === "warn" ? "WARN" : item.ok ? "OK" : "FAIL";
    console.log(`${mark} ${item.id}: ${item.detail}`);
    if (!item.ok && item.remedy) console.log(`  ${item.remedy}`);
  }
}

if (checks.some((item) => item.level !== "warn" && !item.ok)) process.exit(1);

function check(id, ok, detail, remedy, required = true) {
  checks.push({ id, ok: required ? Boolean(ok) : true, level: !required && !ok ? "warn" : "required", detail, remedy });
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function firstLine(value) {
  return String(value || "").split("\n")[0] || "unavailable";
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function freeDiskGiB(directory) {
  const stats = fs.statfsSync(directory);
  return Number(stats.bavail) * Number(stats.bsize) / 1024 ** 3;
}

function requiredFonts() {
  const files = new Set();
  const registry = JSON.parse(fs.readFileSync(path.join(root, "template-packs", "registry.json"), "utf8"));
  for (const id of registry.packs) {
    const pack = JSON.parse(fs.readFileSync(path.join(root, "template-packs", id, "pack.json"), "utf8"));
    const theme = JSON.parse(fs.readFileSync(path.join(root, "themes", pack.theme, "theme.json"), "utf8"));
    for (const font of theme.fonts || []) files.add(font.file);
  }
  return [...files].sort();
}
