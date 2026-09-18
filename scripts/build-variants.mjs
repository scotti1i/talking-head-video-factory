import fs from "node:fs";
import path from "node:path";
import {
  deepMerge,
  ensureSymlink,
  parseArgs,
  projectRoot,
  readJson,
  resolveJob,
  run,
  sanitizeSlug,
  writeJson
} from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const root = projectRoot();
const configPath = path.join(jobDir, "project.json");

if (!fs.existsSync(configPath)) {
  console.error(`Missing project.json: ${configPath}`);
  process.exit(1);
}

const baseConfig = readJson(configPath);
const variants = Array.isArray(baseConfig.variants) && baseConfig.variants.length
  ? baseConfig.variants
  : [{ id: "default", label: "Default", width: baseConfig.width, height: baseConfig.height, layout: baseConfig.layout }];

const selected = args.variant
  ? variants.filter((variant) => variant.id === args.variant)
  : variants;

if (!selected.length) {
  console.error(`No matching variant: ${args.variant}`);
  process.exit(1);
}

for (const variant of selected) {
  const id = sanitizeSlug(variant.id || variant.platform || variant.label);
  if (!id) throw new Error("Variant needs an id");
  const variantDir = path.join(jobDir, "variants", id);
  fs.mkdirSync(variantDir, { recursive: true });

  ensureSymlink(path.relative(variantDir, path.join(jobDir, "assets")), path.join(variantDir, "assets"));
  ensureSymlink(path.relative(variantDir, path.join(jobDir, "data")), path.join(variantDir, "data"));
  ensureSymlink(path.relative(variantDir, path.join(jobDir, "cover")), path.join(variantDir, "cover"));

  const merged = deepMerge(baseConfig, variant);
  delete merged.variants;
  merged.slug = `${baseConfig.slug || path.basename(jobDir)}-${id}`;
  merged.variantId = id;
  merged.variantLabel = variant.label || id;
  merged.downloadFolderName = variant.downloadFolderName || `${baseConfig.downloadFolderName || baseConfig.slug || "口播视频"}-${id}`;

  writeJson(path.join(variantDir, "project.json"), merged);
  writeJson(path.join(variantDir, "package.json"), packageForVariant(id, merged));

  const buildArgs = [path.join(root, "scripts", "build-beats-composition.mjs"), "--job", path.relative(root, variantDir)];
  run("node", buildArgs);
  console.log(`Built variant: ${id}`);
}

function packageForVariant(id, config) {
  const render = config.render || {};
  const fps = render.fps || 60;
  const quality = render.quality || "standard";
  const workers = render.workers || 8;
  const bitrate = render.videoBitrate || "24M";
  const sdrFlag = render.sdr === false ? "" : " --sdr";
  const output = `renders/${config.outputName || `${id}-60fps.mp4`}`;
  const cli = "../../../../node_modules/.bin/hyperframes";
  return {
    name: `talking-head-${id}`,
    private: true,
    type: "module",
    scripts: {
      check: "npm run lint && npm run validate && npm run inspect",
      lint: `${cli} lint`,
      validate: `${cli} validate`,
      inspect: `${cli} inspect --samples 20`,
      "render:final": `${cli} render${sdrFlag} --fps ${fps} --quality ${quality} --workers ${workers} --video-bitrate ${bitrate} --output ${output}`
    },
    dependencies: {
      hyperframes: "0.5.6"
    }
  };
}
