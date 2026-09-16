import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkUpdate, heartbeatFile, lastAcceptances, runHeartbeat } from "./heartbeat.mjs";
import { describeHead, git } from "./ops-git-lib.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function makeRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "heartbeat-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(repo);
  git(repo, ["init", "--quiet", "-b", "main"]);
  fs.mkdirSync(path.join(repo, "scripts"));
  for (const [tag, version] of [["v2.0.0", "2.0.0"], ["v2.0.1", "2.0.1"]]) {
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version }));
    git(repo, ["add", "-A"]);
    git(repo, [...IDENTITY, "commit", "--quiet", "-m", version]);
    git(repo, ["tag", tag]);
  }
  const remote = path.join(base, "remote.git");
  git(base, ["init", "--quiet", "--bare", remote]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "--quiet", "origin", "main", "--tags"]);
  git(repo, ["checkout", "--quiet", "v2.0.0"]);
  const configDir = path.join(base, "config");
  const jobs = path.join(base, "jobs");
  fs.mkdirSync(path.join(jobs, "demo", "qa"), { recursive: true });
  fs.writeFileSync(path.join(jobs, "demo", "qa", "acceptance.json"), JSON.stringify({ overall: "FAIL", ranAt: "2026-09-15T00:00:00.000Z", revision: "R1" }));
  fs.mkdirSync(path.join(jobs, "no-acceptance"));
  fs.writeFileSync(path.join(jobs, "stray.txt"), "");
  return { base, repo, remote, configDir, jobs };
}

const quiet = { doctor: () => ({ ok: true, failed: [], warned: [] }), freeDiskGiB: () => 123.4 };

test("checkUpdate 与 update --check 同一判定；lastAcceptances 只列有 acceptance.json 的 job", () => {
  const { repo, jobs } = makeRepo();
  const update = checkUpdate(repo);
  assert.equal(update.current, "v2.0.0");
  assert.equal(update.latest, "v2.0.1");
  assert.equal(update.newer, true);
  assert.equal(update.fetched, true);
  assert.deepEqual(lastAcceptances(jobs), { demo: { overall: "FAIL", ranAt: "2026-09-15T00:00:00.000Z", revision: "R1" } });
  assert.deepEqual(lastAcceptances(path.join(jobs, "missing")), {});
});

test("心跳：写当日文件、推到 ops/<host>/heartbeat/，无锁且有新 tag 时自动升级并记录结果", () => {
  const { repo, remote, configDir, jobs } = makeRepo();
  const now = new Date("2026-09-16T03:30:00.000Z");
  const calls = [];
  const result = runHeartbeat({
    root: repo, configDir, jobs, host: "factory-01", now,
    deps: {
      ...quiet,
      runUpdate: (dir) => {
        calls.push("update");
        git(dir, ["checkout", "--quiet", "v2.0.1"]);
        return { exitCode: 0, tail: ["更新完成: v2.0.0 -> v2.0.1"] };
      }
    }
  });
  assert.equal(result.file, heartbeatFile(configDir, now));
  assert.deepEqual(calls, ["update"]);
  const hb = JSON.parse(fs.readFileSync(result.file, "utf8"));
  assert.equal(hb.host, "factory-01");
  assert.equal(hb.tag, "v2.0.1");
  assert.equal(hb.update.latest, "v2.0.1");
  assert.equal(hb.running, null);
  assert.equal(hb.diskFreeGiB, 123.4);
  assert.equal(hb.unpushedEvents, 0);
  assert.equal(hb.doctor.ok, true);
  assert.equal(hb.acceptance.demo.overall, "FAIL");
  assert.deepEqual({ ...hb.autoUpdate, at: undefined, tail: undefined }, { attempted: true, ok: true, from: "v2.0.0", to: "v2.0.1", target: "v2.0.1", exitCode: 0, at: undefined, tail: undefined });
  assert.equal(describeHead(repo).tag, "v2.0.1");
  const files = git(remote, ["ls-tree", "-r", "--name-only", "client/factory-01"]).stdout.split("\n");
  assert.ok(files.includes("ops/factory-01/heartbeat/2026-09-16.json"));
  // 升级前后各推一次：远端最后一版心跳已含 autoUpdate
  const pushed = JSON.parse(git(remote, ["show", "client/factory-01:ops/factory-01/heartbeat/2026-09-16.json"]).stdout);
  assert.equal(pushed.autoUpdate.ok, true);
  assert.equal(git(remote, ["rev-list", "--count", "client/factory-01"]).stdout, "3");
});

test("有 running.lock 或已是最新时不升级；升级失败记录 exitCode 与尾行；--no-update 跳过", () => {
  const { repo, configDir, jobs } = makeRepo();
  fs.mkdirSync(configDir, { recursive: true });
  const lock = path.join(configDir, "running.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, command: "npm run qa:cuts", startedAt: "2026-09-16T03:00:00.000Z" }));
  let updates = 0;
  const busy = runHeartbeat({ root: repo, configDir, jobs, host: "h", push: false, deps: { ...quiet, runUpdate: () => { updates += 1; return { exitCode: 0, tail: [] }; } } });
  assert.equal(updates, 0);
  assert.equal(busy.heartbeat.running.command, "npm run qa:cuts");
  assert.match(busy.heartbeat.autoUpdate.reason, /有命令在跑/);
  fs.rmSync(lock);

  const failed = runHeartbeat({ root: repo, configDir, jobs, host: "h", push: false, deps: { ...quiet, runUpdate: () => ({ exitCode: 1, tail: ["smoke 炸了", "已回滚到 v2.0.0"] }) } });
  assert.deepEqual({ attempted: failed.heartbeat.autoUpdate.attempted, ok: failed.heartbeat.autoUpdate.ok, to: failed.heartbeat.autoUpdate.to }, { attempted: true, ok: false, to: "v2.0.0" });
  assert.deepEqual(failed.heartbeat.autoUpdate.tail, ["smoke 炸了", "已回滚到 v2.0.0"]);
  assert.ok(git(repo, ["rev-parse", "--verify", "-q", "client/h"]).ok);

  const skipped = runHeartbeat({ root: repo, configDir, jobs, host: "h", push: false, autoUpdate: false, deps: { ...quiet, runUpdate: () => { throw new Error("不该调用"); } } });
  assert.equal(skipped.heartbeat.autoUpdate.reason, "--no-update");

  git(repo, ["checkout", "--quiet", "v2.0.1"]);
  const latest = runHeartbeat({ root: repo, configDir, jobs, host: "h", push: false, deps: { ...quiet, runUpdate: () => { throw new Error("不该调用"); } } });
  assert.equal(latest.heartbeat.autoUpdate.reason, "已是最新");

  // 修复分支上不自动升级，交给 update 的 PR 状态机
  git(repo, ["checkout", "--quiet", "-b", "client/h-fix-caption-drift", "v2.0.0"]);
  const fix = runHeartbeat({ root: repo, configDir, jobs, host: "h", push: false, deps: { ...quiet, runUpdate: () => { throw new Error("不该调用"); } } });
  assert.match(fix.heartbeat.autoUpdate.reason, /修复分支/);
});

test("先把未上报事件推出去，再统计 unpushedEvents", () => {
  const { repo, remote, configDir, jobs } = makeRepo();
  fs.mkdirSync(path.join(configDir, "events"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "events", "2026-09-16T01-00-00-000Z-qa-cuts.json"), "{}");
  const result = runHeartbeat({ root: repo, configDir, jobs, host: "factory-02", autoUpdate: false, deps: quiet });
  assert.equal(result.heartbeat.unpushedEvents, 0);
  assert.ok(result.notes.some((note) => /事件上报 1 条 · 已 push/.test(note)));
  const files = git(remote, ["ls-tree", "-r", "--name-only", "client/factory-02"]).stdout.split("\n");
  assert.ok(files.includes("ops/factory-02/events/2026-09-16T01-00-00-000Z-qa-cuts.json"));
});
