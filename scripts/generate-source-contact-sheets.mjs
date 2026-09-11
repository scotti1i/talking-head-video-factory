import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const jobIndex = args.indexOf("--job");
if (jobIndex < 0 || !args[jobIndex + 1]) {
  throw new Error("Usage: node scripts/generate-source-contact-sheets.mjs --job jobs/<slug>");
}

const root = process.cwd();
const job = path.resolve(root, args[jobIndex + 1]);
if (!job.startsWith(`${root}${path.sep}`)) throw new Error("job must be inside the project root");
const originals = path.join(job, "assets", "originals");
const output = path.join(job, "qa", "source-contact");
fs.mkdirSync(output, { recursive: true });

const files = fs.readdirSync(originals)
  .filter((name) => /\.(mov|mp4|m4v)$/i.test(name))
  .sort((a, b) => a.localeCompare(b));

for (const name of files) {
  const input = path.join(originals, name);
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input
  ], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(probe.stderr || `ffprobe failed: ${name}`);
  const duration = Number.parseFloat(probe.stdout.trim());
  const sampleRate = 5 / Math.max(duration, 0.1);
  const target = path.join(output, `${path.parse(name).name}-contact.jpg`);
  const render = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input,
    "-vf", `fps=${sampleRate},scale=216:-1,tile=5x1`,
    "-frames:v", "1", target
  ], { encoding: "utf8" });
  if (render.status !== 0) throw new Error(render.stderr || `ffmpeg failed: ${name}`);
  console.log(`${name} -> ${path.relative(root, target)}`);
}
