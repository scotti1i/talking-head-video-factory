import fs from "node:fs";
import path from "node:path";
import { parseArgs, projectRoot, readJson, resolveJob, run } from "./lib.mjs";
import { assertHumanApproval } from "./governance-lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const variantsDir = path.join(jobDir, "variants");

if (!fs.existsSync(variantsDir)) {
  console.error(`Missing variants directory: ${variantsDir}`);
  process.exit(1);
}

// spec §2.3：交付前切点批准必须是人签的；每个 variant 的最终批准由 deliver.mjs 再查一次
assertHumanApproval(path.join(jobDir, "qa", "cuts", "approval.json"), "切点批准", "deliver:variants");

const variants = fs.readdirSync(variantsDir).filter((name) => {
  if (args.variant && name !== args.variant) return false;
  return fs.existsSync(path.join(variantsDir, name, "project.json"));
});

for (const id of variants) {
  const dir = path.join(variantsDir, id);
  const config = readJson(path.join(dir, "project.json"));
  const output = path.join("renders", config.outputName || `${id}-60fps.mp4`);
  // 传绝对路径：jobs 根目录可在仓库外（FACTORY_JOBS_ROOT）
  run("node", [
    path.join(projectRoot(), "scripts", "deliver.mjs"),
    "--job",
    dir,
    "--video",
    output
  ]);
}
