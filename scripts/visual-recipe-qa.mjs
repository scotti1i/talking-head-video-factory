import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256File } from "./color-management.mjs";
import { parseArgs, readJson, resolveJob, run, videoDuration, writeJson } from "./lib.mjs";

const REPORT = "qa/visual-recipes/report.json";
const APPROVAL = "qa/visual-recipes/approval.json";
const MANIFEST = "data/recipe-renders.json";
const EPSILON = 1 / 30 + 0.005;

export function buildRecipeQaReport(jobDir, {
  durationProbe = videoDuration,
  stripGenerator = generatePhaseStrip,
  overviewGenerator = generateOverview
} = {}) {
  const manifestPath = path.join(jobDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new Error(`缺少 ${MANIFEST}；先运行 visual:prepare`);
  const manifest = readJson(manifestPath);
  const qaDir = path.join(jobDir, "qa", "visual-recipes");
  fs.mkdirSync(qaDir, { recursive: true });
  const renders = (manifest.renders || []).map((render) => {
    const input = path.join(jobDir, render.output);
    if (!fs.existsSync(input)) throw new Error(`${render.id}: 尚未渲染 ${render.output}`);
    const duration = Number(durationProbe(input));
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${render.id}: 无法读取有效时长`);
    if (Math.abs(duration - Number(render.expectedDuration)) > EPSILON) {
      throw new Error(`${render.id}: 实际时长 ${duration.toFixed(3)}s 与原配方 ${Number(render.expectedDuration).toFixed(3)}s 不一致`);
    }
    const sampleTimes = phaseTimes(duration);
    const stripRelative = `qa/visual-recipes/${safeName(render.id)}.jpg`;
    const strip = path.join(jobDir, stripRelative);
    stripGenerator(input, strip, sampleTimes);
    if (!fs.existsSync(strip)) throw new Error(`${render.id}: 四阶段电影条生成失败`);
    return {
      id: render.id,
      recipeId: render.recipeId,
      output: render.output,
      sourceHash: sha256File(input),
      actualDuration: duration,
      expectedDuration: Number(render.expectedDuration),
      phases: ["entry", "action", "settle", "exit"],
      sampleTimes,
      strip: stripRelative,
      stripHash: sha256File(strip)
    };
  });
  const overviewRelative = "qa/visual-recipes/contact-sheet.jpg";
  const overview = path.join(jobDir, overviewRelative);
  if (renders.length) {
    overviewGenerator(renders.map((item) => path.join(jobDir, item.strip)), overview);
    if (!fs.existsSync(overview)) throw new Error("配方总览生成失败");
  }
  const reviewPageRelative = "qa/visual-recipes/review.md";
  const reviewPage = path.join(jobDir, reviewPageRelative);
  writeReviewPage(reviewPage, renders, renders.length ? overviewRelative : null);
  const report = {
    schemaVersion: 1,
    status: renders.length ? "awaiting-review" : "not-required",
    generatedAt: new Date().toISOString(),
    reviewContract: {
      phases: ["entry", "action", "settle", "exit"],
      checks: [
        "上游运动与构图未被适配器改写",
        "替换内容无截断、溢出、错字和上游示例残留",
        "人物小窗与视觉主体不碰撞",
        "入场和退场没有黑帧、跳帧或残影"
      ]
    },
    manifest: MANIFEST,
    manifestHash: sha256File(manifestPath),
    overview: renders.length ? overviewRelative : null,
    overviewHash: renders.length ? sha256File(overview) : null,
    reviewPage: reviewPageRelative,
    reviewPageHash: sha256File(reviewPage),
    renders
  };
  writeJson(path.join(jobDir, REPORT), report);
  return report;
}

export function approveRecipeQa(jobDir, { reviewer, method, notes } = {}) {
  if (!String(reviewer || "").trim()) throw new Error("批准必须记录 --reviewer");
  if (!String(method || "").trim()) throw new Error("批准必须记录 --method");
  if (!String(notes || "").trim()) throw new Error("批准必须记录 --notes，说明实际检查结果");
  const reportPath = path.join(jobDir, REPORT);
  if (!fs.existsSync(reportPath)) throw new Error(`缺少 ${REPORT}；先运行 visual:qa`);
  const report = readJson(reportPath);
  const current = validateRecipeQaReport(jobDir, report);
  if (!current.ok) throw new Error(`视觉配方报告已失效:\n- ${current.errors.join("\n- ")}`);
  const approval = {
    schemaVersion: 1,
    status: "approved",
    reviewer: String(reviewer).trim(),
    method: String(method).trim(),
    notes: String(notes).trim(),
    reviewedAt: new Date().toISOString(),
    report: REPORT,
    reportHash: sha256File(reportPath),
    approvedRenders: report.renders.map((item) => ({ id: item.id, sourceHash: item.sourceHash, stripHash: item.stripHash }))
  };
  writeJson(path.join(jobDir, APPROVAL), approval);
  return approval;
}

export function validateRecipeQaApproval(jobDir) {
  const manifestPath = path.join(jobDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) return { ok: false, errors: [`缺少 ${MANIFEST}`] };
  const manifest = readJson(manifestPath);
  if (!(manifest.renders || []).length) return { ok: true, errors: [], detail: "无需配方视觉审查" };
  const reportPath = path.join(jobDir, REPORT);
  const approvalPath = path.join(jobDir, APPROVAL);
  const errors = [];
  if (!fs.existsSync(reportPath)) return { ok: false, errors: [`缺少 ${REPORT}`] };
  const report = readJson(reportPath);
  errors.push(...validateRecipeQaReport(jobDir, report).errors);
  if (!fs.existsSync(approvalPath)) return { ok: false, errors: [...errors, `缺少 ${APPROVAL}`] };
  const approval = readJson(approvalPath);
  if (approval.status !== "approved") errors.push("配方视觉审查尚未批准");
  if (!approval.reviewer || !approval.method || !approval.notes) errors.push("配方视觉批准缺少 reviewer/method/notes");
  if (approval.reportHash !== sha256File(reportPath)) errors.push("配方视觉批准绑定的报告已变化");
  const approved = new Map((approval.approvedRenders || []).map((item) => [item.id, item]));
  for (const render of report.renders || []) {
    const item = approved.get(render.id);
    if (!item || item.sourceHash !== render.sourceHash || item.stripHash !== render.stripHash) {
      errors.push(`${render.id}: 当前渲染未被这份批准覆盖`);
    }
  }
  if (approved.size !== (report.renders || []).length) errors.push("批准中的渲染集合与当前报告不一致");
  return {
    ok: errors.length === 0,
    errors,
    detail: errors.length ? errors[0] : `${report.renders.length} 个配方镜头已完成四阶段审查`
  };
}

export function validateRecipeQaReport(jobDir, report) {
  const errors = [];
  const manifestPath = path.join(jobDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) return { ok: false, errors: [`缺少 ${MANIFEST}`] };
  if (report.manifestHash !== sha256File(manifestPath)) errors.push("配方清单已变化，视觉报告需要重建");
  const manifest = readJson(manifestPath);
  if ((manifest.renders || []).length && !report.overview) errors.push("配方视觉报告缺少总览电影条");
  if (!report.reviewPage) errors.push("配方视觉报告缺少逐镜头审查页");
  const expected = new Map((manifest.renders || []).map((item) => [item.id, item]));
  for (const item of report.renders || []) {
    const render = expected.get(item.id);
    if (!render) {
      errors.push(`${item.id}: 已不在当前配方清单中`);
      continue;
    }
    const media = path.join(jobDir, render.output);
    const strip = path.join(jobDir, item.strip || "");
    if (!fs.existsSync(media) || item.sourceHash !== sha256File(media)) errors.push(`${item.id}: 渲染媒体已变化`);
    if (!fs.existsSync(strip) || item.stripHash !== sha256File(strip)) errors.push(`${item.id}: 四阶段电影条已变化`);
    expected.delete(item.id);
  }
  for (const id of expected.keys()) errors.push(`${id}: 当前配方缺少视觉报告`);
  if (report.overview) {
    const overview = path.join(jobDir, report.overview);
    if (!fs.existsSync(overview) || report.overviewHash !== sha256File(overview)) errors.push("配方视觉总览已变化");
  }
  if (report.reviewPage) {
    const reviewPage = path.join(jobDir, report.reviewPage);
    if (!fs.existsSync(reviewPage) || report.reviewPageHash !== sha256File(reviewPage)) errors.push("配方视觉审查页已变化");
  }
  return { ok: errors.length === 0, errors };
}

function phaseTimes(duration) {
  return [0.08, 0.35, 0.68, 0.92].map((ratio) => Number(Math.min(Math.max(duration * ratio, 0), Math.max(duration - 0.04, 0)).toFixed(3)));
}

function generatePhaseStrip(input, output, times) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const inputs = times.flatMap((time) => ["-ss", String(time), "-i", input]);
  const scales = times.map((_, index) => `[${index}:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:color=black[v${index}]`);
  const stack = `${times.map((_, index) => `[v${index}]`).join("")}hstack=inputs=${times.length}[out]`;
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", `${scales.join(";")};${stack}`,
    "-map", "[out]", "-frames:v", "1", "-q:v", "2", output
  ]);
}

function generateOverview(strips, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const inputs = strips.flatMap((strip) => ["-i", strip]);
  const labels = strips.map((_, index) => `[${index}:v]`).join("");
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", `${labels}vstack=inputs=${strips.length}[out]`,
    "-map", "[out]", "-frames:v", "1", "-q:v", "2", output
  ]);
}

function writeReviewPage(output, renders, overview) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const base = path.dirname(output);
  const relativeFromPage = (file) => path.relative(base, path.resolve(path.dirname(base), "..", file));
  const lines = [
    "# 配方镜头四阶段审查",
    "",
    "检查顺序固定为：入场 → 动作 → 稳定 → 退场。批准前逐镜头检查内容、构图、人物碰撞和边界帧。",
    ""
  ];
  if (overview) lines.push("## 总览", "", `![全部镜头](${relativeFromPage(overview)})`, "");
  for (const render of renders) {
    lines.push(
      `## ${render.id}`,
      "",
      `- 配方：\`${render.recipeId}\``,
      `- 采样：${render.sampleTimes.map((time, index) => `${render.phases[index]} ${time.toFixed(3)}s`).join(" · ")}`,
      "",
      `![${render.id}](${relativeFromPage(render.strip)})`,
      ""
    );
  }
  fs.writeFileSync(output, `${lines.join("\n")}\n`);
}

function safeName(value) {
  const result = String(value || "shot").replace(/[^a-z0-9_-]+/gi, "-");
  if (!result) throw new Error("配方镜头 id 无法生成安全文件名");
  return result;
}

function main(argv = process.argv.slice(2)) {
  const [command = "build", ...rest] = argv;
  const args = parseArgs(rest);
  const jobDir = resolveJob(args.job);
  if (command === "build") {
    const report = buildRecipeQaReport(jobDir);
    console.log(`已生成 ${report.renders.length} 个配方镜头的四阶段审查电影条`);
    if (report.overview) console.log(`- ${path.join(jobDir, report.overview)}`);
    return;
  }
  if (command === "approve") {
    const approval = approveRecipeQa(jobDir, { reviewer: args.reviewer, method: args.method, notes: args.notes });
    console.log(`视觉配方审查已批准: ${approval.approvedRenders.length} 个镜头 · ${approval.reviewer}`);
    return;
  }
  if (command === "check") {
    const result = validateRecipeQaApproval(jobDir);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    console.log(result.detail);
    return;
  }
  throw new Error(`未知命令 ${command}；可用 build/approve/check`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
