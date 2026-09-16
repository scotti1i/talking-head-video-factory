import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { projectRoot } from "./lib.mjs";
import { git } from "./ops-git-lib.mjs";
import { listPendingEvents, pushEvents } from "./report-push.mjs";
import { acquireLock, isRunning, releaseLock, resolveTarget, rotateLogs, splitWrapperArgs, tailLines } from "./run-with-beacon.mjs";

const WRAPPER = path.join(projectRoot(), "scripts", "run-with-beacon.mjs");
const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-"));
  const configDir = path.join(base, "config");
  const script = path.join(base, "child.mjs");
  fs.writeFileSync(script, [
    "const code = Number(process.argv[2] || 0);",
    "for (let i = 1; i <= 100; i += 1) console.log(`line ${i}`);",
    "console.error('stderr says hi');",
    "if (process.argv.includes('--hang')) { setInterval(() => {}, 1000); } else process.exit(code);"
  ].join("\n"));
  return { base, configDir, script };
}

function runWrapper(argv, { configDir, env = {} }) {
  return spawnSync(process.execPath, [WRAPPER, ...argv], {
    cwd: projectRoot(),
    encoding: "utf8",
    env: { ...process.env, FACTORY_CONFIG_DIR: configDir, FACTORY_BEACON_SKIP: "doctor,push", FACTORY_BEACON_PARENT: "", ...env }
  });
}

test("参数拆分：--ok-exit 只认脚本名前的；.mjs 走 node，其他走 npm run", () => {
  const split = splitWrapperArgs(["--ok-exit", "3", "scripts/x.mjs", "--job", "jobs/a", "--ok-exit", "9"]);
  assert.deepEqual([...split.okExit], [0, 3]);
  assert.equal(split.target, "scripts/x.mjs");
  assert.deepEqual(split.args, ["--job", "jobs/a", "--ok-exit", "9"]);
  const node = resolveTarget("scripts/qa-cuts.mjs", "/repo");
  assert.equal(node.command, process.execPath);
  assert.deepEqual(node.prefix, [path.join("/repo", "scripts", "qa-cuts.mjs")]);
  assert.equal(node.name, "qa-cuts");
  const npm = resolveTarget("qa:cuts", "/repo");
  assert.deepEqual([npm.command, npm.prefix, npm.name], ["npm", ["run", "qa:cuts", "--"], "qa-cuts"]);
  assert.throws(() => resolveTarget(""), /用法/);
  assert.deepEqual(tailLines("a\nb\nc\n\n", 2), ["b", "c"]);
  assert.deepEqual(tailLines(""), []);
});

test("失败：退出码原样透传、事件含末 80 行与 job、日志落盘、锁已释放", () => {
  const { configDir, script } = fixture();
  const result = runWrapper([script, "7", "--job", "jobs/demo-slug"], { configDir });
  assert.equal(result.status, 7);
  assert.match(result.stdout, /line 100/);
  assert.match(result.stderr, /stderr says hi/);
  assert.match(result.stderr, /已记录事件/);
  const events = fs.readdirSync(path.join(configDir, "events"));
  assert.equal(events.length, 1);
  assert.match(events[0], /^\d{4}-\d{2}-\d{2}T[\d-]+Z-child\.json$/);
  const event = JSON.parse(fs.readFileSync(path.join(configDir, "events", events[0]), "utf8"));
  assert.equal(event.exitCode, 7);
  assert.equal(event.script, "child");
  assert.equal(event.slug, "demo-slug");
  assert.deepEqual(event.args, ["7", "--job", "jobs/demo-slug"]);
  assert.equal(event.tailLines.length, 80);
  assert.equal(event.tailLines.at(-1), "stderr says hi");
  assert.equal(event.tailLines[0], "line 22");
  assert.ok(typeof event.tag === "string" && event.tag.length);
  assert.ok(fs.existsSync(event.log));
  assert.match(fs.readFileSync(event.log, "utf8"), /line 1\n[\s\S]*# exit 7/);
  assert.equal(fs.existsSync(path.join(configDir, "running.lock")), false);
});

test("成功或 --ok-exit 内的退出码不写事件；嵌套调用直接透传", () => {
  const { configDir, script } = fixture();
  assert.equal(runWrapper([script, "0"], { configDir }).status, 0);
  assert.equal(runWrapper(["--ok-exit", "3", script, "3"], { configDir }).status, 3);
  assert.equal(fs.existsSync(path.join(configDir, "events")), false);
  assert.equal(fs.readdirSync(path.join(configDir, "logs")).length, 2);
  const nested = runWrapper([script, "5"], { configDir, env: { FACTORY_BEACON_PARENT: "123" } });
  assert.equal(nested.status, 5);
  assert.equal(fs.existsSync(path.join(configDir, "events")), false);
  assert.equal(fs.readdirSync(path.join(configDir, "logs")).length, 2);
});

test("锁：陈旧锁（pid 已死）被覆盖；他人活锁不接管；运行中 isRunning 为真", () => {
  const { configDir, script } = fixture();
  const lock = path.join(configDir, "running.lock");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(lock, JSON.stringify({ pid: 999999999, command: "ghost" }));
  assert.equal(isRunning(lock), false);
  const stale = runWrapper([script, "0"], { configDir });
  assert.equal(stale.status, 0);
  assert.doesNotMatch(stale.stderr, /不接管锁/);
  assert.equal(fs.existsSync(lock), false);

  // 当前测试进程活着，用它的 pid 假装别人正在跑
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, command: "someone else" }));
  assert.equal(isRunning(lock), true);
  const busy = runWrapper([script, "4"], { configDir });
  assert.equal(busy.status, 4);
  assert.match(busy.stderr, /不接管锁/);
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).command, "someone else");

  const own = acquireLock(lock, { command: "mine" }, { pid: 424242 });
  assert.equal(own.acquired, false);
  releaseLock(lock, process.pid);
  assert.equal(fs.existsSync(lock), false);
  assert.equal(acquireLock(lock, { command: "mine" }, { pid: 424242 }).acquired, true);
  assert.equal(releaseLock(lock, 1), false);
  assert.equal(releaseLock(lock, 424242), true);
});

test("日志只保留最近 20 个，heartbeat.log 之类不带时间戳的不动", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-logs-"));
  for (let i = 0; i < 25; i += 1) fs.writeFileSync(path.join(dir, `x-2026-09-16T00-00-${String(i).padStart(2, "0")}-000Z.log`), "");
  fs.writeFileSync(path.join(dir, "heartbeat.log"), "");
  const removed = rotateLogs(dir);
  assert.equal(removed.length, 5);
  assert.equal(fs.readdirSync(dir).length, 21);
  assert.ok(fs.existsSync(path.join(dir, "heartbeat.log")));
  assert.ok(fs.existsSync(path.join(dir, "x-2026-09-16T00-00-24-000Z.log")));
  assert.ok(!fs.existsSync(path.join(dir, "x-2026-09-16T00-00-00-000Z.log")));
});

test("report:push --events：待上报事件推到 ops/<host>/events/ 并改名 .pushed.json", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-push-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(repo);
  git(repo, ["init", "--quiet", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "package.json"), "{}");
  git(repo, ["add", "-A"]);
  git(repo, [...IDENTITY, "commit", "--quiet", "-m", "init"]);
  git(repo, ["tag", "v2.0.0"]);
  const remote = path.join(base, "remote.git");
  git(base, ["init", "--quiet", "--bare", remote]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "--quiet", "origin", "main", "--tags"]);
  git(repo, ["checkout", "--quiet", "v2.0.0"]);

  const configDir = path.join(base, "config");
  fs.mkdirSync(path.join(configDir, "events"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "events", "2026-09-16T01-00-00-000Z-qa-cuts.json"), JSON.stringify({ exitCode: 1 }));
  fs.writeFileSync(path.join(configDir, "events", "2026-09-16T00-00-00-000Z-old.pushed.json"), JSON.stringify({ exitCode: 1 }));
  assert.equal(listPendingEvents(configDir).length, 1);

  const result = pushEvents({ repoDir: repo, host: "factory-01", configDir, now: new Date("2026-09-16T01:05:00") });
  assert.equal(result.pending, 1);
  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.deepEqual(fs.readdirSync(path.join(configDir, "events")).sort(), [
    "2026-09-16T00-00-00-000Z-old.pushed.json",
    "2026-09-16T01-00-00-000Z-qa-cuts.pushed.json"
  ]);
  const files = git(remote, ["ls-tree", "-r", "--name-only", "client/factory-01"]).stdout.split("\n");
  assert.ok(files.includes("ops/factory-01/events/2026-09-16T01-00-00-000Z-qa-cuts.json"));
  assert.match(git(remote, ["log", "-1", "--format=%s", "client/factory-01"]).stdout, /^event\(factory-01\): 1 条 2026-09-16 01:05$/);
  assert.equal(pushEvents({ repoDir: repo, host: "factory-01", configDir }).pending, 0);
  assert.equal(git(repo, ["describe", "--tags", "--exact-match", "HEAD"]).stdout, "v2.0.0");
});
