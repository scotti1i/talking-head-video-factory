// ============================================================
// SaleSmartly B-roll 烘焙母版
// 目标: 把操作场景和右下角人像 PIP 烘进 A-roll, 避免渲染阶段多视频层不稳定。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectRoot, readJson, videoDuration } from "./lib.mjs";

const root = projectRoot();
const job = path.join(root, "jobs", "salesmartly-20260625-refresh");
const source = path.join(job, "assets", "aroll-tight.mp4");
const out = path.join(job, "assets", "aroll-tight-broll-balanced-baked.mp4");
const tmp = path.join(job, "assets", "aroll-tight-broll-balanced-baked.tmp.mp4");
const plan = readJson(path.join(job, "data", "commercial-broll-plan.json"));

if (!fs.existsSync(source)) throw new Error(`Missing source video: ${source}`);
if (!Array.isArray(plan) || plan.length === 0) throw new Error("Missing B-roll plan");

const inputs = ["-i", source];
for (const item of plan) {
  const clip = path.join(job, item.src);
  if (!fs.existsSync(clip)) throw new Error(`Missing B-roll clip: ${clip}`);
  inputs.push("-i", clip);
}

const filters = [
  "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=rgba,split=2[base][pipbase]"
];

let previous = "base";
for (const [index, item] of plan.entries()) {
  const input = index + 1;
  const start = Number(item.start).toFixed(3);
  const end = Number(item.end).toFixed(3);
  filters.push(
    `[${input}:v]setpts=PTS-STARTPTS+${start}/TB,fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x07100f,setsar=1,format=rgba[br${index}]`
  );
  filters.push(
    `[${previous}][br${index}]overlay=0:0:eof_action=pass:enable='between(t,${start},${end})'[v${index}]`
  );
  previous = `v${index}`;
}

const enable = plan
  .map((item) => `between(t,${Number(item.start).toFixed(3)},${Number(item.end).toFixed(3)})`)
  .join("+");

filters.push(
  "[pipbase]crop=1080:1080:0:180,scale=220:220,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte((X-110)*(X-110)+(Y-110)*(Y-110),12100),255,0)'[pip]"
);
filters.push(
  `[${previous}][pip]overlay=726:1462:eof_action=pass:enable='${enable}',format=yuv420p[outv]`
);

if (fs.existsSync(tmp)) fs.rmSync(tmp);

execFileSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  ...inputs,
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[outv]",
  "-map",
  "0:a?",
  "-t",
  videoDuration(source).toFixed(3),
  "-c:v",
  "libx264",
  "-r",
  "30",
  "-g",
  "30",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-preset",
  "veryfast",
  "-crf",
  "18",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  tmp
], { stdio: "inherit" });

fs.renameSync(tmp, out);
console.log(`Baked ${out}`);
