import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, run } from "./lib.mjs";
import { resolveWorkflowProfile } from "./workflow-profile.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const variantsDir = path.join(jobDir, "variants");

if (!fs.existsSync(variantsDir)) {
  console.error(`Missing variants directory: ${variantsDir}`);
  process.exit(1);
}

const variants = fs.readdirSync(variantsDir).filter((name) => {
  if (args.variant && name !== args.variant) return false;
  return fs.existsSync(path.join(variantsDir, name, "project.json"));
});

for (const id of variants) {
  const dir = path.join(variantsDir, id);
  const config = readJson(path.join(dir, "project.json"));
  const output = path.join("renders", config.outputName || `${id}-60fps.mp4`);
  console.log(`Rendering ${config.variantLabel || id}`);
  run("npm", ["run", "render:final"], { cwd: dir });
  const profile = resolveWorkflowProfile(config);
  if (profile.requiredGates.includes("audioQa")) {
    const normalized = path.join("tmp", `${path.basename(output, path.extname(output))}.audio-normalized.mp4`);
    run("node", [
      path.join(process.cwd(), "scripts", "normalize-audio.mjs"),
      "--job", path.relative(process.cwd(), dir),
      "--input", output,
      "--output", normalized
    ]);
    fs.renameSync(path.join(dir, normalized), path.join(dir, output));
  }
  if (config.render?.sdr !== false) {
    const tagged = path.join("tmp", `${path.basename(output, path.extname(output))}.rec709-tagged.mp4`);
    run("node", [
      path.join(process.cwd(), "scripts", "tag-sdr-rec709.mjs"),
      "--job", path.relative(process.cwd(), dir),
      "--input", output,
      "--output", tagged
    ]);
    fs.renameSync(path.join(dir, tagged), path.join(dir, output));
  }
  run("node", [path.join(process.cwd(), "scripts", "qa-final.mjs"), "--job", path.relative(process.cwd(), dir), "--video", output]);
  if (profile.requiredGates.includes("audioQa")) {
    run("node", [
      path.join(process.cwd(), "scripts", "qa-audio.mjs"),
      "--job", path.relative(process.cwd(), dir),
      "--video", output
    ]);
  }
}
