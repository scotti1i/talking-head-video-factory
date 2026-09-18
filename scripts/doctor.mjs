import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandOk, projectRoot } from "./lib.mjs";

// ---------- 平台：Linux / WSL / macOS 各自的坑不同，先打印出来方便远程排障（2026-09-18 Linux 对齐）
const isWsl = process.platform === "linux" && (() => {
  try { return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8")); } catch { return false; }
})();
const platformLabel = isWsl ? "WSL2 (Linux)" : process.platform === "darwin" ? "macOS" : process.platform;
console.log(`PLATFORM ${platformLabel} ${process.arch} node ${process.version}`);
if (isWsl) console.log("INFO WSL: 仓库与素材请放 WSL 家目录（~/），不要放 /mnt/c；成片用 \\wsl$\Ubuntu\home\<用户>\Downloads 取");

const checks = [
  ["node", ["--version"], "Node.js >= 22"],
  ["npm", ["--version"], "npm"],
  ["ffmpeg", ["-version"], "FFmpeg"],
  ["ffprobe", ["-version"], "FFprobe"],
  ["whisper-cli", ["--help"], "whisper.cpp"],
  ["pyftsubset", ["--help"], "fonttools subset"]
];

let failed = false;

for (const [command, args, label] of checks) {
  const result = commandOk(command, args);
  const firstLine = result.output.split("\n")[0] || "";
  if (result.ok) {
    console.log(`OK ${label}: ${firstLine}`);
  } else {
    failed = true;
    console.error(`MISSING ${label}: command "${command}" failed`);
    if (command === "whisper-cli") console.error(isWsl || process.platform === "linux"
      ? "  怎么装: 跑 deploy/windows/Bootstrap-Ubuntu.sh（会编 whisper.cpp 到 ~/.local/bin），或手动 cmake 编 whisper.cpp 的 whisper-cli 后放进 PATH"
      : "  怎么装: brew install whisper-cpp");
    if (command === "ffmpeg" || command === "ffprobe") console.error(process.platform === "darwin" ? "  怎么装: brew install ffmpeg" : "  怎么装: sudo apt install ffmpeg");
    if (command === "pyftsubset") console.error(process.platform === "darwin" ? "  怎么装: pip3 install --user fonttools brotli" : "  怎么装: sudo apt install fonttools python3-fonttools python3-brotli");
  }
}

// ---------- CJK 字体：Linux 没有 PingFang / YaHei，模板字体栈落到 Noto Sans CJK；缺了字幕会变豆腐块（Mac 自带，跳过）
if (process.platform === "darwin") {
  console.log("OK CJK fonts: macOS 自带 PingFang SC");
} else {
  const fc = commandOk("fc-list", [":lang=zh", "family"]);
  const families = fc.ok ? fc.output.split("\n").filter(Boolean) : [];
  if (families.length) {
    console.log(`OK CJK fonts: ${families.length} 个中文字族（如 ${families[0].split(",")[0]}）`);
  } else {
    failed = true;
    console.error(fc.ok ? "MISSING CJK fonts: fc-list :lang=zh 为空" : "MISSING CJK fonts: fc-list 不可用（fontconfig 未装）");
    console.error("  怎么装: sudo apt install fontconfig fonts-noto-cjk && fc-cache -f");
  }
}

const hfPath = path.join(projectRoot(), "node_modules", ".bin", "hyperframes");
const hf = commandOk(hfPath, ["--version"]);
if (hf.ok) {
  console.log(`OK HyperFrames: ${hf.output}`);
} else {
  failed = true;
  console.error(`MISSING HyperFrames: ${hfPath} --version failed`);
}

const model = path.join(os.homedir(), ".cache", "whisper-cpp", "ggml-large-v3-turbo.bin");
if (fs.existsSync(model)) {
  console.log(`OK Whisper model: ${model}`);
} else {
  failed = true;
  console.error(`MISSING Whisper model: ${model}`);
  console.error(`  怎么装: mkdir -p ~/.cache/whisper-cpp && curl -fL --continue-at - -o ${model} https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin（国内可换 https://hf-mirror.com 前缀）`);
}

if (failed) process.exit(1);
