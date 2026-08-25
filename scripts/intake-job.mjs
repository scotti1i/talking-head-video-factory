import fs from "node:fs";
import path from "node:path";

import { parseArgs, projectRoot, readJson, run, sanitizeSlug, writeJson } from "./lib.mjs";
import { executeIntakeCopy, planIntake } from "./intake-lib.mjs";

const args = parseArgs();
const slug = sanitizeSlug(args.slug || args._[0]);
if (!slug) throw new Error("Usage: npm run intake -- --slug <slug> --source <folder> [--script <file>] [--language es]");
const root = projectRoot();
const plan = planIntake({ sourceDir: args.source, scriptPath: args.script });
console.log(`Intake plan: ${plan.originals.length} originals · ${plan.broll.length} broll · ${plan.references.length} references · 1 script`);
if (args["dry-run"]) process.exit(0);

const jobDir = path.join(root, "jobs", slug);
let created = false;
try {
  run("node", [
    path.join(root, "scripts", "new-job.mjs"),
    slug,
    "--profile", "factory-acquisition",
    "--targets", String(args.targets || "douyin"),
    "--fine-cut", String(args["fine-cut"] || "standard"),
    "--template-pack", String(args["template-pack"] || "factory-proof")
  ]);
  created = true;
  const manifest = executeIntakeCopy({ plan, jobDir });
  writeJson(path.join(jobDir, "data", "intake-manifest.json"), {
    ...manifest,
    entries: manifest.entries.map((entry) => ({
      ...entry,
      target: path.relative(jobDir, entry.target).replaceAll(path.sep, "/")
    }))
  });
  const configPath = path.join(jobDir, "project.json");
  const config = readJson(configPath);
  config.editorial = {
    ...(config.editorial || {}),
    language: String(args.language || "auto"),
    editingMode: "script-preserving-edl",
    writtenScript: {
      path: manifest.writtenScript,
      policy: "preserve-complete-script"
    }
  };
  if (config.variants?.some((variant) => variant.layout === "vertical")) {
    config.outputName = "final-30fps.mp4";
    for (const variant of config.variants) {
      variant.outputName = `${variant.id}-30fps.mp4`;
      variant.render = { ...(variant.render || {}), fps: 30, workers: 4, gpu: true, browserGpu: true };
    }
    const vertical = config.variants.find((variant) => variant.layout === "vertical");
    if (vertical && config.shorts) {
      config.shorts.sourceVideo = `variants/${vertical.id}/renders/${vertical.outputName}`;
      config.shorts.fps = 30;
    }
  }
  writeJson(configPath, config);
  fs.writeFileSync(path.join(jobDir, "project.md"), projectBrief(slug));
  console.log(`Imported read-only source copy into: ${jobDir}`);
  console.log(`Next: npm run inventory -- --job jobs/${slug}`);
} catch (error) {
  if (created && fs.existsSync(jobDir)) fs.rmSync(jobDir, { recursive: true, force: true });
  throw error;
}

function projectBrief(title) {
  return `# ${title}\n\n## 这条视频只解决什么问题\n\n根据确定文稿向海外买家完成一次可信的工厂询单表达。\n\n## 必须保留\n\n- 书面文稿中的全部独有信息。\n- 最清晰、最自然的完整表达与真实工厂证据。\n\n## 必须删除\n\n- 明确口误、失败重拍、重复表达和无信息等待。\n- 截断单词、辅音、自然手势或让口播变成机关枪节奏的切点。\n\n## 包装边界\n\n- A-roll 是主画面；模板包只负责字幕、卡片、B-roll、转场和音频。\n- 不重排句子，不改写观点，不删除原稿独有内容。\n\n## 交付\n\n- R0 审片 MP4、时间码反馈、修订版本、最终成片与 QA。\n`;
}
