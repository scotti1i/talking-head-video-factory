import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, projectRoot, readJson, resolveJob } from "./lib.mjs";

const args = parseArgs();
const root = projectRoot();
const jobDir = resolveJob(args.job);
const edlFile = path.join(jobDir, "data", "raw-edl-youtube-horizontal-v2.json");
const edl = readJson(edlFile);
const duration = edl.at(-1).outEnd;
const overlayFramesDir = args["overlay-frames"]
  ? path.resolve(args["overlay-frames"])
  : null;
const overlayFile = args.overlay
  ? path.resolve(args.overlay)
  : path.join(
      jobDir,
      "variants/youtube-horizontal-v2-overlay/renders/ai-agent-boss-youtube-horizontal-v2-overlay.webm"
    );
const overlayFrameStart = overlayFramesDir ? detectFrameStart(overlayFramesDir) : null;
const outputFile = args.output
  ? path.resolve(args.output)
  : path.join(
      jobDir,
      "variants/youtube-horizontal-v2/renders/ai-agent-boss-youtube-horizontal-v2-60fps.mp4"
    );

if (overlayFramesDir && overlayFrameStart === null) {
  throw new Error(`Missing transparent overlay frames: ${overlayFramesDir}/frame_000000.png or frame_000001.png`);
}
if (!overlayFramesDir && !fs.existsSync(overlayFile)) {
  throw new Error(`Missing transparent overlay render: ${overlayFile}`);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const inputs = [];
for (const segment of edl) {
  const sourceFile = path.join(jobDir, "assets", "raw", segment.source);
  if (!fs.existsSync(sourceFile)) throw new Error(`Missing raw source: ${sourceFile}`);
  inputs.push("-ss", sec(segment.sourceStart), "-t", sec(segment.duration), "-i", sourceFile);
}
if (overlayFramesDir) {
  inputs.push(
    "-framerate",
    "60",
    "-start_number",
    String(overlayFrameStart),
    "-i",
    path.join(overlayFramesDir, "frame_%06d.png")
  );
} else {
  inputs.push("-i", overlayFile);
}

const overlayIndex = edl.length;
const filters = [
  `color=c=0x05120f:s=1920x1080:r=60:d=${sec(duration)}[base]`
];
const videoLabels = [];
const audioLabels = [];

for (const [index, segment] of edl.entries()) {
  const videoLabel = `v${String(index).padStart(2, "0")}`;
  const audioLabel = `a${String(index).padStart(2, "0")}`;
  videoLabels.push(`[${videoLabel}]`);
  audioLabels.push(`[${audioLabel}]`);
  filters.push(
    `[${index}:v:0]fps=60,trim=duration=${sec(segment.duration)},` +
      "scale=560:1000:force_original_aspect_ratio=increase:flags=lanczos," +
      "crop=560:1000:(in_w-560)/2:(in_h-1000)/2,setsar=1,setpts=PTS-STARTPTS" +
      `[${videoLabel}]`
  );
  filters.push(
    `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `atrim=duration=${sec(segment.duration)},asetpts=PTS-STARTPTS[${audioLabel}]`
  );
}

filters.push(`${videoLabels.join("")}concat=n=${edl.length}:v=1:a=0[vface]`);
filters.push(`${audioLabels.join("")}concat=n=${edl.length}:v=0:a=1[aout]`);
filters.push(
  `[${overlayIndex}:v:0]fps=60,format=rgba,trim=duration=${sec(duration)},setpts=PTS-STARTPTS[ov]`
);
filters.push("[base][vface]overlay=56:40:format=auto:eof_action=pass[withface]");
filters.push("[withface][ov]overlay=0:0:format=auto:eof_action=pass[vout]");

const ffmpegArgs = [
  "-hide_banner",
  "-y",
  ...inputs,
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[vout]",
  "-map",
  "[aout]",
  "-t",
  sec(duration),
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-b:v",
  "36M",
  "-maxrate",
  "42M",
  "-bufsize",
  "72M",
  "-bf",
  "0",
  "-x264-params",
  "aq-mode=3:aq-strength=0.8:deblock=1,1:colorprim=bt709:transfer=bt709:colormatrix=bt709",
  "-colorspace:v",
  "bt709",
  "-color_primaries:v",
  "bt709",
  "-color_trc:v",
  "bt709",
  "-color_range",
  "tv",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  outputFile
];

console.log(`Composing raw DJI EDL + transparent HyperFrames overlay`);
console.log(`Duration: ${sec(duration)}s`);
console.log(`Overlay: ${overlayFramesDir ? `${overlayFramesDir}/frame_%06d.png` : overlayFile}`);
console.log(`Output: ${outputFile}`);

const result = spawnSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
if (result.status !== 0) {
  throw new Error(`ffmpeg compose failed with status ${result.status}`);
}

function sec(value) {
  return Number(value).toFixed(6);
}

function detectFrameStart(framesDir) {
  if (fs.existsSync(path.join(framesDir, "frame_000000.png"))) return 0;
  if (fs.existsSync(path.join(framesDir, "frame_000001.png"))) return 1;
  return null;
}
