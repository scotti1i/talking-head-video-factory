import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { parseArgs, readJson, resolveJob } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const configPath = path.join(jobDir, args.config || "data/public-layout.json");
const config = readJson(configPath);
const input = path.resolve(jobDir, config.input || "assets/aroll.mp4");
const output = path.resolve(jobDir, config.output || "assets/aroll-public.mp4");
const mode = String(config.mode || "rail");
const railAsset = path.resolve(jobDir, config.railAsset || "data/privacy-rail.png");
const contentWidth = Number(config.contentWidth);
const railWidth = Number(config.railWidth);
const height = Number(config.height || 1080);

if (!new Set(["rail", "crop-fill"]).has(mode)) {
  throw new Error(`公开版 mode 只支持 rail / crop-fill，当前为 ${mode}`);
}
if (mode === "rail" && contentWidth + railWidth !== 1920) {
  throw new Error(`公开版画布必须为 1920px，当前为 ${contentWidth + railWidth}px`);
}
if (!fs.existsSync(input)) throw new Error(`找不到粗剪母版: ${input}`);

const safe = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[char]));

let inputArgs = ["-y", "-hide_banner", "-i", input];
let filterComplex;

if (mode === "rail") {
  const left = Math.max(28, Math.round(railWidth * 0.12));
  const right = railWidth - left;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${railWidth}" height="${height}">
  <rect width="100%" height="100%" fill="#111315"/>
  <rect x="0" y="0" width="8" height="100%" fill="#F4C542"/>
  <text x="${left}" y="94" fill="#F4C542" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2">${safe(config.eyebrow || "FREE CLASS")}</text>
  <text x="${left}" y="150" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="38" font-weight="800" letter-spacing="1">${safe(config.series || "SCT AI")}</text>
  <line x1="${left}" y1="190" x2="${right}" y2="190" stroke="#3A3F45" stroke-width="2"/>
  <text x="${left}" y="520" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="29" font-weight="700" letter-spacing="1">${safe(config.week || "WEEK 01")}</text>
  <text x="${left}" y="568" fill="#AEB4BC" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="600" letter-spacing="1">${safe(config.episode || "PART 1")}</text>
  <circle cx="${left + 6}" cy="980" r="6" fill="#F4C542"/>
  <text x="${left + 22}" y="987" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="600">SCTCAMP.COM</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(railAsset);
  inputArgs.push("-loop", "1", "-framerate", "30", "-i", railAsset);
  filterComplex = `[0:v]crop=${contentWidth}:${height}:0:0,setpts=PTS-STARTPTS[content];[content][1:v]hstack=inputs=2:shortest=1,format=yuv420p[v]`;
} else {
  const crop = config.crop || {};
  const cropWidth = Number(crop.width);
  const cropHeight = Number(crop.height);
  const cropX = Number(crop.x || 0);
  const cropY = Number(crop.y || 0);
  if (!(cropWidth > 0 && cropHeight > 0)) {
    throw new Error("crop-fill 必须声明 crop.width / crop.height");
  }
  const main = `[0:v]crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=1920:1080:flags=lanczos,setsar=1[main]`;
  if (config.pip?.enabled) {
    const pip = config.pip;
    const source = pip.source || {};
    const pipWidth = Number(pip.width || 320);
    const pipHeight = Number(pip.height || 180);
    const border = Number(pip.border || 3);
    const x = String(pip.x || "main_w-overlay_w-42");
    const y = String(pip.y || "42");
    const face = `[0:v]crop=${Number(source.width)}:${Number(source.height)}:${Number(source.x)}:${Number(source.y)},scale=${pipWidth}:${pipHeight}:flags=lanczos,pad=iw+${border * 2}:ih+${border * 2}:${border}:${border}:color=white[face]`;
    filterComplex = `${main};${face};[main][face]overlay=${x}:${y}:format=auto,format=yuv420p[v]`;
  } else {
    filterComplex = `${main};[main]format=yuv420p[v]`;
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true });
const tmp = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.tmp.mp4`);
const ffmpegArgs = [
  ...inputArgs,
  "-filter_complex", filterComplex,
  "-map", "[v]", "-map", "0:a?", "-r", "30",
  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
  "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
  "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
  "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
  "-c:a", "copy", "-movflags", "+faststart", "-shortest", tmp
];
const run = spawnSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
if (run.status !== 0) {
  fs.rmSync(tmp, { force: true });
  throw new Error(`公开隐私版生成失败，ffmpeg exit ${run.status}`);
}
fs.renameSync(tmp, output);
console.log(`公开隐私版已生成: ${output}`);
