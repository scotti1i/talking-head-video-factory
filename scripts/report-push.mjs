// ============================================================
// report:push —— 把 job 的文本证据推到 client/<host> 分支
// 为什么：客户机器上的 acceptance 报告、审批、反馈要能被我们复核；
// 只推白名单文本，永不推媒体 / assets / renders / tmp。
// 用法：npm run report:push -- --job jobs/<slug> [--no-push]
//      npm run report:push -- --events            推本机未上报的事件文件 → ops/<host>/events/
//      npm run report:push -- --heartbeat <file>  推心跳 JSON → ops/<host>/heartbeat/
//      npm run report:push -- --rejected <dir>    推被拒 PR 的补丁目录 → ops/<host>/rejected/<branch>/
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, parseArgs, projectRoot, resolveJob } from "./lib.mjs";
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

// ============================================================
// 事件 / 心跳 / 被拒补丁：同一条 client 分支，不同子目录
// 为什么：spec v2.0.3 §E/§F——机器出错、每日心跳、PR 被拒的 patch 都要
// 回流到我们能看到的地方；复用 publishToClientBranch，主工作区照旧不动。
// 事件文件推完改名 .pushed.json：留在本机可查，但不会重复上报。
// ============================================================
export const PUSHED_SUFFIX = ".pushed.json";

export function listPendingEvents(configDir = factoryConfigDir()) {
  const dir = path.join(configDir, "events");
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(PUSHED_SUFFIX))
    .sort()
    .map((name) => path.join(dir, name));
}

export function pushEvents({ repoDir = projectRoot(), host = clientHost(), push = true, configDir = factoryConfigDir(), now = new Date() } = {}) {
  const pending = listPendingEvents(configDir);
  if (!pending.length) return { branch: null, pending: 0, committed: false, pushed: false, marked: [], warning: null };
  const result = publishToClientBranch({
    repoDir,
    host,
    push,
    message: `event(${host}): ${pending.length} 条 ${timestampLabel(now)}`,
    stage: (worktree) => {
      const target = path.join(worktree, "ops", host, "events");
      fs.mkdirSync(target, { recursive: true });
      for (const file of pending) fs.copyFileSync(file, path.join(target, path.basename(file)));
      return [path.join("ops", host, "events")];
    }
  });
  // commit 已落到本地 client 分支就算「已上报」：即使这次 push 没通，下次任何 publish 都会把它带上去
  const marked = pending.map((file) => {
    const renamed = file.replace(/\.json$/, PUSHED_SUFFIX);
    fs.renameSync(file, renamed);
    return renamed;
  });
  return { ...result, pending: pending.length, marked };
}

export function pushHeartbeat({ file, repoDir = projectRoot(), host = clientHost(), push = true, now = new Date() }) {
  if (!isFile(file)) throw new Error(`心跳文件不存在: ${file}`);
  const name = path.basename(file);
  return publishToClientBranch({
    repoDir,
    host,
    push,
    message: `heartbeat(${host}): ${name.replace(/\.json$/, "")} ${timestampLabel(now)}`,
    stage: (worktree) => {
      const dest = path.join(worktree, "ops", host, "heartbeat", name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
      return [path.join("ops", host, "heartbeat", name)];
    }
  });
}

export function pushRejected({ dir, branchName = path.basename(dir), repoDir = projectRoot(), host = clientHost(), push = true, now = new Date() }) {
  if (!isDir(dir)) throw new Error(`补丁目录不存在: ${dir}`);
  const files = fs.readdirSync(dir).filter((name) => isFile(path.join(dir, name))).sort();
  const relativeDir = path.join("ops", host, "rejected", branchName);
  return publishToClientBranch({
    repoDir,
    host,
    push,
    message: `rejected(${host}): ${branchName} ${timestampLabel(now)}`,
    stage: (worktree) => {
      const target = path.join(worktree, relativeDir);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      for (const name of files) fs.copyFileSync(path.join(dir, name), path.join(target, name));
      return [relativeDir];
    }
  });
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
  const push = !args["no-push"];
  let result;
  let label;
  if (args.events) {
    result = pushEvents({ push });
    label = `${result.pending} 条事件`;
    if (!result.pending) console.log("report:push · 没有待上报事件");
  } else if (args.heartbeat) {
    result = pushHeartbeat({ file: path.resolve(String(args.heartbeat)), push });
    label = `心跳 ${path.basename(String(args.heartbeat))}`;
  } else if (args.rejected) {
    result = pushRejected({ dir: path.resolve(String(args.rejected)), push });
    label = `被拒补丁 ${path.basename(String(args.rejected))}`;
  } else {
    result = pushJobReport({ jobDir: resolveJob(args.job), push });
    label = `${result.files} 个文本文件`;
  }
  if (result.branch) console.log(`report:push · ${result.branch} · ${label} · ${result.committed ? `commit ${result.sha}` : "无变更"} · ${result.pushed ? "已 push" : "未 push"}`);
  if (result.warning) console.warn(`WARN: ${result.warning}`);
}
