// ============================================================
// migrate —— 把旧仓库的 jobs/ 挪到 FACTORY_JOBS_ROOT，标记 legacy
// 为什么：v2 起代码与 job 分离（客户机器只 update 代码）；旧 job 的
// 字幕不是从成片转录来的、审批没有人签，必须在 project.json 里写明，
// 下游门禁才知道这些是 v1 产物。data/ 一个字节都不改；幂等可重跑。
// 用法：npm run migrate -- [--from <旧仓库路径>] [--to <jobs-root>] [--dry-run] [--move]
//   默认 --from 本仓库、--to FACTORY_JOBS_ROOT（未设则 ~/factory-jobs）
//   默认复制保留旧目录（Gate 0 已备份）；--move 复制成功后删旧目录
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryEnvValue, parseArgs, projectRoot, readJson, relinkJobPackage, writeFactoryEnvValue, writeJson } from "./lib.mjs";
import { findApprovalFiles, readApproval } from "./governance-lib.mjs";

export const REASON_CAPTIONS_V1 = "captions not derived from final A-roll transcript (v1 pipeline)";
export const REASON_NO_HUMAN_APPROVAL = "no human approval on record";
export const REASON_NO_AROLL_CONTRACT = "no project.json.aroll contract (v1 pipeline)";
const SKIP_SLUGS = Object.freeze(["smoke", "current"]);
const TEXT_DIRS = Object.freeze(["data", "qa", "review", "delivery"]);

export function defaultJobsTarget() {
  return factoryEnvValue("FACTORY_JOBS_ROOT") || path.join(os.homedir(), "factory-jobs");
}

// --from 可以给仓库根，也可以直接给 jobs 目录
export function resolveSourceJobs(from) {
  const base = path.resolve(from);
  if (fs.existsSync(path.join(base, "jobs")) && fs.statSync(path.join(base, "jobs")).isDirectory()) return path.join(base, "jobs");
  return base;
}

export function legacyReasons(jobDir) {
  const reasons = [];
  const project = safeJson(path.join(jobDir, "project.json"));
  if (!project.ok) return [`JSON 解析失败: project.json（${project.error}）`];
  if (!project.data.aroll || typeof project.data.aroll !== "object") reasons.push(REASON_NO_AROLL_CONTRACT);
  if (fs.existsSync(path.join(jobDir, "data", "captions.json")) && !fs.existsSync(path.join(jobDir, "data", "aroll-transcript.json"))) {
    reasons.push(REASON_CAPTIONS_V1);
  }
  const approvals = findApprovalFiles(jobDir).map((file) => {
    try {
      return readApproval(file);
    } catch {
      return null;
    }
  });
  if (!approvals.some((approval) => approval?.by === "human")) reasons.push(REASON_NO_HUMAN_APPROVAL);
  for (const error of jsonErrors(jobDir)) reasons.push(`JSON 解析失败: ${error.path}（${error.error}）`);
  return reasons;
}

export function jsonErrors(jobDir) {
  const errors = [];
  const visit = (file) => {
    const result = safeJson(file);
    if (!result.ok) errors.push({ path: path.relative(jobDir, file).replaceAll(path.sep, "/"), error: result.error });
  };
  for (const dir of TEXT_DIRS) walkJson(path.join(jobDir, dir), visit);
  const variantsDir = path.join(jobDir, "variants");
  if (isDir(variantsDir)) {
    for (const entry of fs.readdirSync(variantsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const variantProject = path.join(variantsDir, entry.name, "project.json");
      if (fs.existsSync(variantProject)) visit(variantProject);
      walkJson(path.join(variantsDir, entry.name, "qa"), visit);
    }
  }
  return errors;
}

function stripLegacy(project) {
  const copy = { ...project };
  delete copy.legacy;
  return copy;
}

export function planMigration({ fromJobs, to }) {
  const source = path.resolve(fromJobs);
  const target = path.resolve(to);
  if (source === target) throw new Error(`源与目标相同: ${source}；请指定 --to 或设置 FACTORY_JOBS_ROOT`);
  if (!isDir(source)) throw new Error(`源 jobs 目录不存在: ${source}`);
  const entries = [];
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const src = path.join(source, entry.name);
    if (!fs.existsSync(path.join(src, "project.json"))) continue;
    const dest = path.join(target, entry.name);
    const record = { slug: entry.name, src, dest, action: "copy", reasons: [] };
    if (SKIP_SLUGS.includes(entry.name)) {
      record.action = "skip-generated";
      entries.push(record);
      continue;
    }
    record.reasons = legacyReasons(src);
    if (fs.existsSync(dest)) {
      const srcProject = safeJson(path.join(src, "project.json"));
      const destProject = safeJson(path.join(dest, "project.json"));
      const identical = srcProject.ok && destProject.ok
        && JSON.stringify(stripLegacy(srcProject.data)) === JSON.stringify(stripLegacy(destProject.data));
      record.action = identical ? "skip-identical" : "conflict";
    }
    entries.push(record);
  }
  return { source, target, entries };
}

export function applyMigration(plan, { move = false, now = new Date() } = {}) {
  fs.mkdirSync(plan.target, { recursive: true });
  for (const record of plan.entries) {
    if (record.action !== "copy") continue;
    try {
      if (move) {
        moveDir(record.src, record.dest);
      } else {
        fs.cpSync(record.src, record.dest, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
      }
      const projectFile = path.join(record.dest, "project.json");
      const project = readJson(projectFile);
      project.legacy = { migratedAt: now.toISOString(), from: record.src, reasons: record.reasons };
      writeJson(projectFile, project);
      relinkJobPackage(record.dest);
      const variantsDir = path.join(record.dest, "variants");
      if (isDir(variantsDir)) {
        for (const entry of fs.readdirSync(variantsDir, { withFileTypes: true })) {
          if (entry.isDirectory()) relinkJobPackage(path.join(variantsDir, entry.name));
        }
      }
      record.action = move ? "moved" : "copied";
    } catch (error) {
      record.action = "error";
      record.error = error.message;
    }
  }
  return plan;
}

function moveDir(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    if (!fs.existsSync(path.join(dest, "project.json"))) throw new Error("跨盘复制后目标缺 project.json，保留源目录");
    fs.rmSync(src, { recursive: true, force: true });
  }
}

export function renderTable(plan) {
  const rows = plan.entries.map((record) => [record.slug, record.action, String(record.reasons.length), record.error || record.reasons.join("; ") || "—"]);
  const header = ["job", "动作", "原因数", "原因 / 错误"];
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => row[index].length)));
  const line = (row) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  return [line(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)].join("\n");
}

function walkJson(dir, visit) {
  if (!isDir(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walkJson(file, visit);
    else if (entry.isFile() && /\.json$/i.test(entry.name)) visit(file);
  }
}

function safeJson(file) {
  try {
    return { ok: true, data: readJson(file) };
  } catch (error) {
    return { ok: false, error: String(error.message).split("\n")[0] };
  }
}

function isDir(dir) {
  try {
    return fs.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const fromJobs = resolveSourceJobs(args.from ? String(args.from) : projectRoot());
  const to = path.resolve(String(args.to || defaultJobsTarget()));
  const dryRun = Boolean(args["dry-run"]);
  const plan = planMigration({ fromJobs, to });
  console.log(`migrate: ${plan.source} -> ${plan.target}${dryRun ? "（dry-run，不写入）" : args.move ? "（移动）" : "（复制，保留源目录）"}`);
  if (!dryRun) applyMigration(plan, { move: Boolean(args.move) });
  console.log(renderTable(plan));
  const counts = plan.entries.reduce((sum, record) => ({ ...sum, [record.action]: (sum[record.action] || 0) + 1 }), {});
  console.log(`\n汇总: ${Object.entries(counts).map(([action, count]) => `${action}=${count}`).join(" · ") || "没有 job"}`);
  if (!dryRun) {
    const configured = factoryEnvValue("FACTORY_JOBS_ROOT");
    if (!configured) {
      const file = writeFactoryEnvValue("FACTORY_JOBS_ROOT", plan.target);
      console.log(`已写入 FACTORY_JOBS_ROOT=${plan.target} → ${file}`);
    } else if (path.resolve(configured) !== plan.target) {
      console.warn(`WARN: FACTORY_JOBS_ROOT=${configured} 与本次目标 ${plan.target} 不一致，请手动确认 ~/.config/talking-head-factory/env`);
    }
  }
  const failed = plan.entries.filter((record) => record.action === "conflict" || record.action === "error");
  if (failed.length) {
    console.error(`\n${failed.length} 个 job 需要人工处理（conflict / error），见上表。`);
    process.exit(2);
  }
}
