// ============================================================
// report:push —— 把 job 的文本证据推到 client/<host> 分支
// 为什么：客户机器上的 acceptance 报告、审批、反馈要能被我们复核；
// 只推白名单文本，永不推媒体 / assets / renders / tmp。
// 用法：npm run report:push -- --job jobs/<slug> [--no-push]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, resolveJob } from "./lib.mjs";
import { clientHost, publishToClientBranch, timestampLabel } from "./ops-git-lib.mjs";

const ROOT_FILES = Object.freeze(["project.json", "project.md", "README.md"]);
const TEXT_DIRS = Object.freeze({
  data: /\.(json|md|txt|srt|ass)$/i,
  qa: /\.(json|md)$/i,
  review: /\.(json|md)$/i,
  delivery: /\.(json|md)$/i,
  requests: /\.md$/i
});
const VARIANT_TEXT_DIRS = Object.freeze({ qa: /\.(json|md)$/i });

// 返回 job 相对路径列表（正斜杠）；不跟随 symlink，媒体一律不进
export function collectReportFiles(jobDir) {
  const files = [];
  for (const name of ROOT_FILES) {
    if (isFile(path.join(jobDir, name))) files.push(name);
  }
  for (const [dir, pattern] of Object.entries(TEXT_DIRS)) {
    walk(path.join(jobDir, dir), pattern, (file) => files.push(relative(jobDir, file)));
  }
  const variantsDir = path.join(jobDir, "variants");
  if (isDir(variantsDir)) {
    for (const entry of fs.readdirSync(variantsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const variantDir = path.join(variantsDir, entry.name);
      if (isFile(path.join(variantDir, "project.json"))) files.push(relative(jobDir, path.join(variantDir, "project.json")));
      for (const [dir, pattern] of Object.entries(VARIANT_TEXT_DIRS)) {
        walk(path.join(variantDir, dir), pattern, (file) => files.push(relative(jobDir, file)));
      }
    }
  }
  return files.sort();
}

export function stageJobReport({ jobDir, worktree, host, slug }) {
  const files = collectReportFiles(jobDir);
  const target = path.join(worktree, "ops", host, slug);
  fs.rmSync(target, { recursive: true, force: true });
  for (const file of files) {
    const dest = path.join(target, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(jobDir, file), dest);
  }
  return [path.join("ops", host, slug)];
}

export function pushJobReport({ jobDir, repoDir = projectRoot(), host = clientHost(), push = true, now = new Date() }) {
  if (!fs.existsSync(path.join(jobDir, "project.json"))) throw new Error(`不是 job 目录（缺 project.json）: ${jobDir}`);
  const slug = path.basename(jobDir);
  const result = publishToClientBranch({
    repoDir,
    host,
    push,
    message: `ops(${host}): ${slug} ${timestampLabel(now)}`,
    stage: (worktree) => stageJobReport({ jobDir, worktree, host, slug })
  });
  return { ...result, slug, files: collectReportFiles(jobDir).length };
}

function walk(dir, pattern, visit) {
  if (!isDir(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(file, pattern, visit);
    else if (entry.isFile() && pattern.test(entry.name)) visit(file);
  }
}

function isFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function isDir(dir) {
  try {
    return fs.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function relative(jobDir, file) {
  return path.relative(jobDir, file).replaceAll(path.sep, "/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const result = pushJobReport({ jobDir, push: !args["no-push"] });
  console.log(`report:push · ${result.branch} · ${result.files} 个文本文件 · ${result.committed ? `commit ${result.sha}` : "无变更"} · ${result.pushed ? "已 push" : "未 push"}`);
  if (result.warning) console.warn(`WARN: ${result.warning}`);
}
