import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJsonArray, resolveJob } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const input = path.resolve(jobDir, args.input || "data/captions.json");
const output = path.resolve(jobDir, args.output || "data/captions.zh-CN.srt");
const captions = readJsonArray(input);

if (!captions.length) throw new Error(`字幕为空: ${input}`);
const srt = captions.map((item, index) => {
  const start = Number(item.s ?? item.start);
  const end = Number(item.e ?? item.end);
  if (!(end > start)) throw new Error(`字幕 ${index + 1} 时间非法`);
  const text = String(item.t ?? item.text ?? "").trim();
  if (!text) throw new Error(`字幕 ${index + 1} 文本为空`);
  return `${index + 1}\n${timecode(start)} --> ${timecode(end)}\n${text}`;
}).join("\n\n") + "\n";

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, srt);
console.log(`SRT 已生成: ${captions.length} 条 → ${output}`);

function timecode(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(millis).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
