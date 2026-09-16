// ============================================================
// run-with-beacon —— 管线命令的统一外壳：留日志、持锁、失败上报
// 为什么：spec v2.0.3 §E——客户零代码，出错时人只会说「出问题了」；
// 我们必须在事故发生那一刻就拿到命令、退出码、末 80 行和 doctor 摘要，
// 而不是事后让 Codex 复述。做法：
//   1. 子进程 stdout/stderr 原样透传，同时 tee 到
//      ~/.config/talking-head-factory/logs/<script>-<ts>.log（保留最近 20 个）
//   2. 运行期间持 running.lock（pid + 命令；pid 已死视为陈旧锁直接覆盖），
//      heartbeat 据此决定能不能自动升级
//   3. 非零退出 → 写 events/<ts>-<script>.json，然后 best-effort
//      `report-push.mjs --events` 推到 client/<host>（限时 60s，永不改变退出码）
// 用法：node scripts/run-with-beacon.mjs [--ok-exit 3] <scripts/x.mjs|npm脚本名> [参数...]
// 嵌套：acceptance 里再起 qa:* 时（FACTORY_BEACON_PARENT 已设）直接透传，
//       不重复持锁 / 写事件——外层已经在记。
// 测试开关：FACTORY_BEACON_SKIP=doctor,push（逗号分隔，跳过对应副作用）
// ============================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, projectRoot, resolveJob, writeJson } from "./lib.mjs";
import { clientHost } from "./ops-git-lib.mjs";

export const TAIL_LINES = 80;
export const KEEP_LOGS = 20;
export const PUSH_TIMEOUT_MS = 60_000;
export const DOCTOR_TIMEOUT_MS = 30_000;
export const PARENT_ENV = "FACTORY_BEACON_PARENT";

export function lockFile(configDir = factoryConfigDir()) {
  return path.join(configDir, "running.lock");
}

export function logsDir(configDir = factoryConfigDir()) {
  return path.join(configDir, "logs");
}

export function eventsDir(configDir = factoryConfigDir()) {
  return path.join(configDir, "events");
}

// 文件名用的时间戳：可排序、无冒号（Windows/NTFS 也能放）
export function fileStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

// 「scripts/x.mjs」→ node 直跑；其他 → npm run <name> --
export function resolveTarget(target, root = projectRoot()) {
  const text = String(target || "");
  if (!text) throw new Error("用法: node scripts/run-with-beacon.mjs <scripts/x.mjs|npm脚本名> [参数...]");
  if (/\.(mjs|js|cjs)$/.test(text)) {
    const file = path.isAbsolute(text) ? text : path.join(root, text);
    return { command: process.execPath, prefix: [file], name: path.basename(file).replace(/\.(mjs|js|cjs)$/, "") };
  }
  return { command: "npm", prefix: ["run", text, "--"], name: text.replaceAll(":", "-") };
}

// 外壳自己的选项只认 --ok-exit，且必须写在脚本名前面；其余全部原样交给子进程
export function splitWrapperArgs(argv) {
  const okExit = new Set([0]);
  let i = 0;
  while (i < argv.length && argv[i].startsWith("--")) {
    if (argv[i] === "--ok-exit" && argv[i + 1] != null) {
      for (const code of String(argv[i + 1]).split(",")) okExit.add(Number(code));
      i += 2;
      continue;
    }
    break;
  }
  return { okExit, target: argv[i], args: argv.slice(i + 1) };
}

export function jobFromArgs(args) {
  const index = args.indexOf("--job");
  if (index < 0 || index + 1 >= args.length) return null;
  try {
    return resolveJob(args[index + 1]);
  } catch {
    return args[index + 1];
  }
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function readLock(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

// 返回 { acquired, stale, holder }：别人的活锁不抢（只记 WARN），死锁直接覆盖
export function acquireLock(file, info, { pid = process.pid, now = new Date() } = {}) {
  const existing = readLock(file);
  if (existing && pidAlive(Number(existing.pid)) && Number(existing.pid) !== pid) {
    return { acquired: false, stale: false, holder: existing };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ pid, startedAt: now.toISOString(), ...info }, null, 2)}\n`);
  return { acquired: true, stale: Boolean(existing), holder: null };
}

export function releaseLock(file, pid = process.pid) {
  const existing = readLock(file);
  if (!existing || Number(existing.pid) !== pid) return false;
  fs.rmSync(file, { force: true });
  return true;
}

export function isRunning(file = lockFile()) {
  const existing = readLock(file);
  return Boolean(existing && pidAlive(Number(existing.pid)));
}

export function rotateLogs(dir, keep = KEEP_LOGS) {
  if (!fs.existsSync(dir)) return [];
  const rotatable = fs.readdirSync(dir)
    .filter((name) => /-\d{4}-\d{2}-\d{2}T[\d-]+Z\.log$/.test(name))
    .sort();
  const removed = rotatable.slice(0, Math.max(0, rotatable.length - keep));
  for (const name of removed) fs.rmSync(path.join(dir, name), { force: true });
  return removed;
}

export function tailLines(text, lines = TAIL_LINES) {
  const trimmed = String(text || "").replace(/\s+$/, "");
  return trimmed ? trimmed.split("\n").slice(-lines) : [];
}

export function currentTag(root = projectRoot()) {
  const result = spawnSync("git", ["describe", "--tags", "--always"], { cwd: root, encoding: "utf8", stdio: "pipe" });
  return result.status === 0 ? result.stdout.trim() : null;
}

// doctor 摘要：只要失败项 id，不把整份 checks 塞进事件
export function doctorSummary(root = projectRoot(), { timeoutMs = DOCTOR_TIMEOUT_MS } = {}) {
  const file = path.join(root, "scripts", "deployment-doctor.mjs");
  if (!fs.existsSync(file)) return null;
  const result = spawnSync(process.execPath, [file, "--json"], { cwd: root, encoding: "utf8", stdio: "pipe", timeout: timeoutMs });
  try {
    const parsed = JSON.parse(result.stdout);
    const failed = (parsed.checks || []).filter((item) => item.level !== "warn" && !item.ok).map((item) => `${item.id}: ${item.detail}`);
    const warned = (parsed.checks || []).filter((item) => item.level === "warn").map((item) => item.id);
    return { ok: failed.length === 0, failed, warned };
  } catch {
    return null;
  }
}

export function buildEvent({ name, command, args, exitCode, signal, output, job, tag, host = clientHost(), now = new Date(), logFile, doctor }) {
  return {
    schemaVersion: 1,
    at: now.toISOString(),
    host,
    tag,
    script: name,
    command,
    args,
    exitCode,
    signal: signal || null,
    job,
    slug: job ? path.basename(job) : null,
    log: logFile || null,
    tailLines: tailLines(output),
    doctorSummary: doctor ?? null
  };
}

export function writeEvent(event, { configDir = factoryConfigDir(), now = new Date() } = {}) {
  const file = path.join(eventsDir(configDir), `${fileStamp(now)}-${event.script}.json`);
  writeJson(file, event);
  return file;
}

export function pushEventsBestEffort(root = projectRoot(), { timeoutMs = PUSH_TIMEOUT_MS } = {}) {
  const file = path.join(root, "scripts", "report-push.mjs");
  if (!fs.existsSync(file)) return { ok: false, reason: "缺 report-push.mjs" };
  const result = spawnSync(process.execPath, [file, "--events"], { cwd: root, encoding: "utf8", stdio: "pipe", timeout: timeoutMs });
  return { ok: result.status === 0, reason: result.status === 0 ? null : (result.stderr || result.stdout || String(result.error?.message || "")).trim().split("\n").at(-1) };
}

function skipped(step) {
  return String(process.env.FACTORY_BEACON_SKIP || "").split(",").map((item) => item.trim()).includes(step);
}

function exitCodeFor(status, signal) {
  if (status != null) return status;
  const number = signal ? os.constants.signals[signal] : null;
  return number ? 128 + number : 1;
}

export function runWithBeacon({ argv, root = projectRoot(), configDir = factoryConfigDir(), env = process.env, stdout = process.stdout, stderr = process.stderr, now = new Date() }) {
  const { okExit, target, args } = splitWrapperArgs(argv);
  const resolved = resolveTarget(target, root);
  const childArgs = [...resolved.prefix, ...args];
  const nested = Boolean(env[PARENT_ENV]);

  return new Promise((resolvePromise) => {
    if (nested) {
      const child = spawn(resolved.command, childArgs, { cwd: root, stdio: "inherit", env });
      child.on("exit", (status, signal) => resolvePromise({ exitCode: exitCodeFor(status, signal), nested: true }));
      return;
    }

    fs.mkdirSync(logsDir(configDir), { recursive: true });
    const logFile = path.join(logsDir(configDir), `${resolved.name}-${fileStamp(now)}.log`);
    const log = fs.createWriteStream(logFile, { flags: "a" });
    const commandLine = [resolved.command === process.execPath ? "node" : resolved.command, ...childArgs].join(" ");
    log.write(`# ${now.toISOString()} ${commandLine}\n`);

    const lock = acquireLock(lockFile(configDir), { command: commandLine, script: resolved.name, job: jobFromArgs(args) }, { now });
    if (!lock.acquired) stderr.write(`WARN: running.lock 已被 pid ${lock.holder?.pid}（${lock.holder?.command || "?"}）持有，本次不接管锁\n`);

    const chunks = [];
    let size = 0;
    const capture = (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      while (size > 256 * 1024 && chunks.length > 1) size -= chunks.shift().length;
    };
    const child = spawn(resolved.command, childArgs, {
      cwd: root,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...env, [PARENT_ENV]: String(process.pid), FORCE_COLOR: env.FORCE_COLOR ?? "0" }
    });
    child.stdout.on("data", (chunk) => { stdout.write(chunk); log.write(chunk); capture(chunk); });
    child.stderr.on("data", (chunk) => { stderr.write(chunk); log.write(chunk); capture(chunk); });

    const forward = (signal) => () => { try { child.kill(signal); } catch { /* 子进程已退出 */ } };
    const handlers = { SIGINT: forward("SIGINT"), SIGTERM: forward("SIGTERM") };
    for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);

    child.on("exit", (status, signal) => {
      for (const [sig, handler] of Object.entries(handlers)) process.off(sig, handler);
      const exitCode = exitCodeFor(status, signal);
      const failed = !okExit.has(exitCode);
      log.write(`# exit ${exitCode}${signal ? ` (${signal})` : ""}\n`);
      log.end();
      if (lock.acquired) releaseLock(lockFile(configDir));
      rotateLogs(logsDir(configDir));
      let eventFile = null;
      if (failed) {
        try {
          const event = buildEvent({
            name: resolved.name,
            command: commandLine,
            args,
            exitCode,
            signal,
            output: Buffer.concat(chunks).toString("utf8"),
            job: jobFromArgs(args),
            tag: currentTag(root),
            logFile,
            doctor: skipped("doctor") ? null : doctorSummary(root)
          });
          eventFile = writeEvent(event, { configDir });
          stderr.write(`[beacon] 已记录事件 ${eventFile}\n`);
          if (!skipped("push")) {
            const pushed = pushEventsBestEffort(root);
            stderr.write(pushed.ok ? "[beacon] 事件已上报 client 分支\n" : `[beacon] 事件上报未成功（${pushed.reason}），文件留在本机等 heartbeat 重试\n`);
          }
        } catch (error) {
          stderr.write(`[beacon] 写事件失败：${error.message}\n`);
        }
      }
      resolvePromise({ exitCode, nested: false, logFile, eventFile });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runWithBeacon({ argv: process.argv.slice(2) });
  process.exit(result.exitCode);
}
