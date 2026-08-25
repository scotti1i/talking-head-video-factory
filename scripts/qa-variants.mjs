import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, resolveJob, run } from "./lib.mjs";
import { resolveWorkflowProfile } from "./workflow-profile.mjs";

export function runVariantQa(jobDir, { variant } = {}) {
  const root = projectRoot();
  const variantsDir = path.join(jobDir, "variants");
  if (!fs.existsSync(variantsDir)) throw new Error(`Missing variants directory: ${variantsDir}`);

  const variants = fs.readdirSync(variantsDir).filter((name) => {
    if (variant && name !== variant) return false;
    return fs.existsSync(path.join(variantsDir, name, "project.json"));
  });
  if (!variants.length) throw new Error(`No built variant matched: ${variant || "all"}`);

  for (const id of variants) {
    const dir = path.join(variantsDir, id);
    const config = readJson(path.join(dir, "project.json"));
    const output = path.join("renders", config.outputName || `${id}-60fps.mp4`);
    const relativeJob = path.relative(root, dir);
    const profile = resolveWorkflowProfile(config);

    run("node", [
      path.join(root, "scripts", "qa-final.mjs"),
      "--job", relativeJob,
      "--video", output
    ]);
    if (profile.requiredGates.includes("audioQa")) {
      run("node", [
        path.join(root, "scripts", "qa-audio.mjs"),
        "--job", relativeJob,
        "--video", output
      ]);
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  runVariantQa(jobDir, { variant: args.variant });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`Variant QA failed: ${error.message}`);
    process.exitCode = 1;
  }
}
