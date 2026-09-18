import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, resolveJob, run } from "./lib.mjs";

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
  run("node", [
    path.join(process.cwd(), "scripts", "deliver.mjs"),
    "--job",
    path.relative(process.cwd(), dir),
    "--video",
    output
  ]);
}
