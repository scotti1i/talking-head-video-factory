import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, resolveJob, run } from "./lib.mjs";
import { prepareInkPressWorkspace, verifyInkPressWorkspace } from "./shotcraft-direct-port.mjs";

export function renderVisualRecipes(jobDir, { concurrency = 4 } = {}) {
  const root = projectRoot();
  const manifest = readJson(path.join(jobDir, "data", "recipe-renders.json"));
  let inkPressWorkspace = null;
  for (const render of manifest.renders) {
    if (!["upstream-original", "direct-port"].includes(render.adaptation?.mode)) {
      throw new Error(`${render.id}: adaptation.mode=${render.adaptation?.mode || "_"} 尚无已登记适配器`);
    }
    if (render.source.familyId !== "shotcraft/ink-press") {
      throw new Error(`${render.id}: 尚无 ${render.source.familyId} 的直接移植运行时`);
    }
    inkPressWorkspace ||= prepareInkPressWorkspace({ root });
    ensureRuntimeDependencies(inkPressWorkspace.workRoot);
    const output = path.join(jobDir, render.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const renderArgs = render.adaptation.mode === "direct-port"
      ? directPortArgs(render, output, inkPressWorkspace.workRoot, concurrency)
      : originalArgs(render, output, concurrency);
    run("npx", renderArgs, { cwd: inkPressWorkspace.workRoot });
    normalizeSeekableRecipe(output, render.source.fps || 30);
    const verified = verifyInkPressWorkspace({ root });
    if (!verified.ok) throw new Error(`${render.id}: 渲染后源码漂移:\n- ${verified.failures.join("\n- ")}`);
  }
  return manifest.renders.map((item) => path.join(jobDir, item.output));
}

function normalizeSeekableRecipe(output, fps) {
  const keyframeInterval = Math.max(1, Math.round(Number(fps) || 30));
  const parsed = path.parse(output);
  const normalized = path.join(parsed.dir, `${parsed.name}.seekable${parsed.ext}`);
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", output,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "15",
    "-g", String(keyframeInterval),
    "-keyint_min", String(keyframeInterval),
    "-sc_threshold", "0",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    normalized
  ]);
  fs.renameSync(normalized, output);
  const probe = run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-skip_frame", "nokey",
    "-show_frames",
    "-show_entries", "frame=pts_time",
    "-of", "csv=p=0",
    output
  ], { capture: true });
  const keyframes = probe.stdout.split(/\r?\n/).map(Number.parseFloat).filter(Number.isFinite);
  const gaps = keyframes.slice(1).map((time, index) => time - keyframes[index]);
  if (gaps.length && Math.max(...gaps) > 1.05) {
    throw new Error(`${output}: 配方媒体关键帧间隔超过 1.05 秒，拒绝进入并行最终渲染`);
  }
}

function originalArgs(render, output, concurrency) {
  const frames = `${render.source.frames[0]}-${render.source.frames[1]}`;
  return [
    "remotion", "render", render.source.entry, render.source.composition, output,
    `--frames=${frames}`,
    `--concurrency=${Number(concurrency) || 4}`
  ];
}

function directPortArgs(render, output, workRoot, concurrency) {
  const compositionByRecipe = {
    "shotcraft/paper-title-card": "FactoryPaperTitle",
    "shotcraft/list-stack-press": "FactoryListStack",
    "shotcraft/row-embed": "FactoryRowEmbed"
  };
  const composition = compositionByRecipe[render.recipeId];
  if (!composition) {
    throw new Error(`${render.id}: direct-port 暂未登记 ${render.recipeId} 的参数接口`);
  }
  const propsPath = path.join(workRoot, "out", `${safeName(render.id)}.props.json`);
  fs.mkdirSync(path.dirname(propsPath), { recursive: true });
  fs.writeFileSync(propsPath, `${JSON.stringify(render.adaptation.props, null, 2)}\n`);
  return [
    "remotion", "render", "src/factory-index.ts", composition, output,
    `--props=${propsPath}`,
    `--concurrency=${Number(concurrency) || 4}`
  ];
}

function ensureRuntimeDependencies(workRoot) {
  const executable = path.join(workRoot, "node_modules", ".bin", "remotion");
  if (fs.existsSync(executable)) return;
  run("npm", ["ci", "--ignore-scripts"], { cwd: workRoot });
}

function safeName(value) {
  const result = String(value || "shot").replace(/[^a-z0-9_-]+/gi, "-");
  if (!result) throw new Error("配方镜头 id 无法生成安全文件名");
  return result;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const outputs = renderVisualRecipes(resolveJob(args.job), { concurrency: args.concurrency || 4 });
  console.log(`已渲染 ${outputs.length} 个 Shotcraft 原生镜头`);
  for (const output of outputs) console.log(`- ${output}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
