// ============================================================
// heartbeat —— 每日一次的机器体检 + 自动升级
// 为什么：spec v2.0.3 §E——客户不会主动汇报「机器还活着吗」；我们要
// 在 client/<host> 分支看到每天一份心跳，48h 没有就是机器出事了。
// 顺序：
//   1. 先把上次没上报成功的事件推出去（report:push --events）
//   2. 收集：doctor 摘要（非生产模式，快）、tag 比对、盘位、未上报事件数、
//      当前 tag、每个 job 最近一次 acceptance 结论、是否有命令在跑
//   3. 写 ~/.config/talking-head-factory/heartbeat/<YYYY-MM-DD>.json，
//      report:push --heartbeat 推到 ops/<host>/heartbeat/
//   4. 没有 running.lock 且有更新的 tag → node scripts/factory-update.mjs
//      （失败回滚已在 update 里），结果写回心跳文件再推一次
// 用法：npm run heartbeat [-- --no-push] [--no-update]
// 计划任务：deploy/windows/Run-Heartbeat.sh（由 Install-Scheduled-Task.ps1 每日 03:30 触发）
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, jobsRoot, parseArgs, projectRoot, writeJson } from "./lib.mjs";
import { latestTag, listTags } from "./factory-update.mjs";
import { clientHost, describeHead, git, hasRemote, isFixBranch } from "./ops-git-lib.mjs";
import { listPendingEvents, pushEvents, pushHeartbeat } from "./report-push.mjs";
import { doctorSummary, isRunning, lockFile, readLock, tailLines } from "./run-with-beacon.mjs";

export function heartbeatDir(configDir = factoryConfigDir()) {
  return path.join(configDir, "heartbeat");
}

export function heartbeatFile(configDir = factoryConfigDir(), now = new Date()) {
  return path.join(heartbeatDir(configDir), `${now.toISOString().slice(0, 10)}.json`);
}

export function freeDiskGiB(directory) {
  try {
    const stats = fs.statfsSync(directory);
    return Math.round(Number(stats.bavail) * Number(stats.bsize) / 1024 ** 3 * 10) / 10;
  } catch {
    return null;
  }
}

// 与 factory-update --check 同一判定：fetch tags（失败只用本地），最新稳定 tag ≠ 当前 tag 即有新版
export function checkUpdate(repoDir) {
  let fetched = null;
  if (hasRemote(repoDir)) fetched = git(repoDir, ["fetch", "--tags", "--quiet", "origin"], { allowFail: true }).ok;
  const head = describeHead(repoDir);
  const latest = latestTag(listTags(repoDir));
  return { current: head.tag, branch: head.branch, sha: head.sha, latest, newer: Boolean(latest && latest !== head.tag), fetched };
}

// 每个 job 最近一次 acceptance 结论；没有 qa/acceptance.json 的 job 不列
export function lastAcceptances(root) {
  const out = {};
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "qa", "acceptance.json");
    if (!fs.existsSync(file)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(file, "utf8"));
      out[entry.name] = { overall: report.overall ?? null, ranAt: report.ranAt ?? null, revision: report.revision ?? null };
    } catch (error) {
      out[entry.name] = { overall: null, error: error.message };
    }
  }
  return out;
}

export function defaultRunUpdate(repoDir) {
  const result = spawnSync(process.execPath, [path.join(repoDir, "scripts", "factory-update.mjs")], { cwd: repoDir, encoding: "utf8", stdio: "pipe" });
  return { exitCode: result.status ?? 1, tail: tailLines(`${result.stdout || ""}${result.stderr || ""}`, 20) };
}

export function collectHeartbeat({ root, configDir, jobs, host, now, deps }) {
  const lock = readLock(lockFile(configDir));
  const update = deps.checkUpdate(root);
  return {
    schemaVersion: 1,
    at: now.toISOString(),
    host,
    tag: update.current,
    head: { branch: update.branch, sha: update.sha },
    update: { latest: update.latest, newer: update.newer, fetched: update.fetched },
    running: deps.isRunning(lockFile(configDir)) ? { pid: lock?.pid ?? null, command: lock?.command ?? null, startedAt: lock?.startedAt ?? null } : null,
    diskFreeGiB: deps.freeDiskGiB(root),
    unpushedEvents: listPendingEvents(configDir).length,
    doctor: deps.doctor(root),
    acceptance: lastAcceptances(jobs),
    autoUpdate: null
  };
}

export function runHeartbeat({
  root = projectRoot(),
  configDir = factoryConfigDir(),
  jobs = jobsRoot(),
  host = clientHost(),
  now = new Date(),
  push = true,
  autoUpdate = true,
  deps: overrides = {},
  log = () => {}
} = {}) {
  const deps = {
    doctor: (dir) => doctorSummary(dir),
    checkUpdate,
    freeDiskGiB,
    isRunning,
    runUpdate: defaultRunUpdate,
    pushEvents,
    pushHeartbeat,
    ...overrides
  };
  const notes = [];
  try {
    const events = deps.pushEvents({ repoDir: root, host, push, configDir, now });
    if (events.pending) notes.push(`事件上报 ${events.pending} 条 · ${events.pushed ? "已 push" : events.warning || "未 push"}`);
  } catch (error) {
    notes.push(`事件上报失败：${error.message.split("\n")[0]}`);
  }

  const heartbeat = collectHeartbeat({ root, configDir, jobs, host, now, deps });
  const file = heartbeatFile(configDir, now);
  const publish = () => {
    writeJson(file, heartbeat);
    try {
      const result = deps.pushHeartbeat({ file, repoDir: root, host, push, now });
      return result.pushed ? "已 push" : result.warning || "未 push";
    } catch (error) {
      return `push 失败：${error.message.split("\n")[0]}`;
    }
  };
  notes.push(`心跳 ${path.basename(file)} · ${publish()}`);

  if (!autoUpdate) {
    heartbeat.autoUpdate = { attempted: false, reason: "--no-update" };
  } else if (!heartbeat.update.newer) {
    heartbeat.autoUpdate = { attempted: false, reason: "已是最新" };
  } else if (heartbeat.running) {
    heartbeat.autoUpdate = { attempted: false, reason: `有命令在跑（pid ${heartbeat.running.pid}）` };
  } else if (heartbeat.head.branch && isFixBranch(heartbeat.head.branch)) {
    heartbeat.autoUpdate = { attempted: false, reason: `停在修复分支 ${heartbeat.head.branch}，交给 npm run update 处理 PR 状态` };
  } else {
    log(`有新版 ${heartbeat.update.latest}，开始自动升级`);
    const result = deps.runUpdate(root);
    const after = describeHead(root);
    heartbeat.autoUpdate = {
      attempted: true,
      ok: result.exitCode === 0,
      from: heartbeat.tag,
      to: after.tag,
      target: heartbeat.update.latest,
      exitCode: result.exitCode,
      tail: result.tail,
      at: new Date().toISOString()
    };
    if (result.exitCode === 0) heartbeat.tag = after.tag;
    notes.push(`自动升级 ${heartbeat.autoUpdate.ok ? "成功" : "失败（已回滚）"}：${heartbeat.autoUpdate.from} -> ${after.tag} · ${publish()}`);
  }
  if (!heartbeat.autoUpdate.attempted) writeJson(file, heartbeat);
  return { file, heartbeat, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const result = runHeartbeat({ push: !args["no-push"], autoUpdate: !args["no-update"], log: (message) => console.log(`[heartbeat] ${message}`) });
  const hb = result.heartbeat;
  console.log(`[heartbeat] ${hb.host} · ${hb.tag || `${hb.head.branch || "detached"}@${hb.head.sha}`} · 最新 ${hb.update.latest || "无"} · 盘位 ${hb.diskFreeGiB ?? "?"} GiB · doctor ${hb.doctor ? (hb.doctor.ok ? "OK" : `FAIL ${hb.doctor.failed.length}`) : "跳过"} · 未上报事件 ${hb.unpushedEvents}`);
  for (const note of result.notes) console.log(`[heartbeat] ${note}`);
  console.log(`[heartbeat] 自动升级：${hb.autoUpdate.attempted ? (hb.autoUpdate.ok ? `完成 ${hb.autoUpdate.to}` : `失败，见 ${result.file}`) : hb.autoUpdate.reason}`);
  if (hb.autoUpdate.attempted && !hb.autoUpdate.ok) process.exitCode = 1;
}
