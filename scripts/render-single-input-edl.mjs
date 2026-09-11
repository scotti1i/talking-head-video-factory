import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJsonArray, resolveJob, run } from "./lib.mjs";
import { assertNotDerivedInput, filterComplexFileArgs, frameCapFilter } from "./ffmpeg-filter.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const inputPath = path.resolve(jobDir, args.input || "data/rough-cut-edl.json");
const outputPath = path.resolve(jobDir, args.output || "assets/aroll-single-source.mp4");
const sourceKey = args.sourceKey || "original";
const fps = Number(args.fps || 60);
const videoBitrate = String(args["video-bitrate"] || "24M");
const preset = args.preset || "veryfast";

const segments = readJsonArray(inputPath);
if (!segments.length) throw new Error(`No segments in ${inputPath}`);

const source = segments[0][sourceKey] || segments[0].source;
if (!source) throw new Error(`First segment is missing ${sourceKey}/source`);
if (segments.some((segment) => (segment[sourceKey] || segment.source) !== source)) {
  throw new Error("single-input renderer requires all EDL segments to use the same source");
}

const sourcePath = path.resolve(jobDir, source);
if (!fs.existsSync(sourcePath)) throw new Error(`Missing media: ${sourcePath}`);
assertNotDerivedInput(sourcePath, jobDir, "render-single-input-edl");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.join(jobDir, "tmp"), { recursive: true });

const filters = [];
const labels = [];
segments.forEach((segment, index) => {
  const start = Number(segment.sourceStart).toFixed(3);
  const end = Number(segment.sourceEnd).toFixed(3);
  const duration = Number(segment.sourceEnd) - Number(segment.sourceStart);
  // 视频段封顶到整帧，不得长于音频段（见 render-rough-cut-edl.mjs 同处说明）
  filters.push(
    `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=${fps}${frameCapFilter(duration, fps)},format=yuv420p[v${index}]`
  );
  filters.push(
    `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`
  );
  labels.push(`[v${index}][a${index}]`);
});
filters.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[concatv][outa]`);
filters.push(`[concatv]fps=${fps},setpts=N/(${fps}*TB)[outv]`);

const filterPath = path.join(jobDir, "tmp", `${path.parse(outputPath).name}.ffmpeg`);
fs.writeFileSync(filterPath, filters.join(";\n"));

run("ffmpeg", [
  "-hide_banner",
  "-y",
  "-i",
  sourcePath,
  ...filterComplexFileArgs(filterPath),
  "-map",
  "[outv]",
  "-map",
  "[outa]",
  "-c:v",
  "libx264",
  "-preset",
  preset,
  "-b:v",
  videoBitrate,
  "-maxrate",
  videoBitrate,
  "-bufsize",
  `${Number.parseInt(videoBitrate, 10) * 2 || 48}M`,
  "-g",
  String(Math.round(fps)),
  "-keyint_min",
  String(Math.round(fps)),
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
  outputPath
]);

console.log(`Rendered ${outputPath}`);
