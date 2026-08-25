import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandOk, projectRoot } from "./lib.mjs";

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
}

if (failed) process.exit(1);
