import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendUpdateLog, compareSemver, dirtyCodePaths, latestTag, listTags, parseSemver, performUpdate } from "./factory-update.mjs";
import { describeHead, git } from "./ops-git-lib.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "factory-update-"));
  git(repo, ["init", "--quiet", "-b", "main"]);
  fs.mkdirSync(path.join(repo, "scripts"));
  for (const [tag, version] of [["v1.0.0", "1.0.0"], ["v1.2.0", "1.2.0"], ["v1.10.0", "1.10.0"]]) {
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version }));
    fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), `// ${version}\n`);
    git(repo, ["add", "-A"]);
    git(repo, [...IDENTITY, "commit", "--quiet", "-m", version]);
    git(repo, ["tag", tag]);
  }
  git(repo, ["tag", "v2.0.0-rc.1"]);
  git(repo, ["tag", "nightly-2026"]);
  return repo;
}

test("semver 排序：v1.10.0 > v1.2.0，预发布默认不算最新", () => {
  assert.deepEqual(parseSemver("v1.2.3-rc.1"), { tag: "v1.2.3-rc.1", major: 1, minor: 2, patch: 3, pre: "rc.1" });
  assert.equal(parseSemver("nightly"), null);
  assert.ok(compareSemver(parseSemver("v1.10.0"), parseSemver("v1.2.0")) > 0);
  assert.ok(compareSemver(parseSemver("v2.0.0-rc.1"), parseSemver("v2.0.0")) < 0);
  assert.equal(latestTag(["v1.0.0", "v1.10.0", "v1.2.0", "v2.0.0-rc.1", "nightly"]), "v1.10.0");
  assert.equal(latestTag(["v1.0.0", "v2.0.0-rc.1"], { includePrerelease: true }), "v2.0.0-rc.1");
  assert.equal(latestTag([]), null);
});

test("更新：从 tag 到 tag，步骤全过后停在新 tag；失败回滚并重装", () => {
  const repo = makeRepo();
  git(repo, ["checkout", "--quiet", "v1.0.0"]);
  assert.equal(latestTag(listTags(repo)), "v1.10.0");
  const logs = [];
  const log = (message) => logs.push(message);

  const calls = [];
  const ok = performUpdate({ repoDir: repo, tag: "v1.2.0", log, steps: { install: () => calls.push("install"), smoke: () => calls.push("smoke") } });
  assert.deepEqual(ok, { previous: "v1.0.0", tag: "v1.2.0" });
  assert.equal(describeHead(repo).tag, "v1.2.0");
  assert.deepEqual(calls, ["install", "smoke"]);
  assert.match(logs.at(-1), /update ok: v1.2.0/);

  calls.length = 0;
  assert.throws(
    () => performUpdate({ repoDir: repo, tag: "v1.10.0", log, steps: { install: () => calls.push("install"), smoke: () => { throw new Error("smoke 炸了"); } } }),
    /更新到 v1.10.0 失败，已回滚到 v1.2.0.*smoke 炸了/
  );
  assert.equal(describeHead(repo).tag, "v1.2.0");
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version, "1.2.0");
  assert.deepEqual(calls, ["install", "install"]);
  assert.ok(logs.some((line) => /rollback -> v1.2.0/.test(line)));
  assert.throws(() => performUpdate({ repoDir: repo, tag: "v9.9.9", log, steps: {} }), /tag 不存在/);
});

test("代码目录有本地改动时拒绝更新；job / requests 之外的改动不算", () => {
  const repo = makeRepo();
  git(repo, ["checkout", "--quiet", "v1.0.0"]);
  fs.mkdirSync(path.join(repo, "requests"));
  fs.writeFileSync(path.join(repo, "requests", "x.md"), "ask");
  assert.deepEqual(dirtyCodePaths(repo), []);
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// hacked\n");
  assert.deepEqual(dirtyCodePaths(repo), ["M scripts/x.mjs"]);
  assert.throws(() => performUpdate({ repoDir: repo, tag: "v1.2.0", steps: {} }), /代码目录有本地改动/);
  assert.equal(describeHead(repo).tag, "v1.0.0");
});

test("update.log 追加记录", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "factory-update-log-")), "nested", "update.log");
  appendUpdateLog("check: a", { file, now: new Date("2026-09-11T00:00:00.000Z") });
  appendUpdateLog("check: b", { file, now: new Date("2026-09-11T00:00:01.000Z") });
  assert.equal(fs.readFileSync(file, "utf8"), "[2026-09-11T00:00:00.000Z] check: a\n[2026-09-11T00:00:01.000Z] check: b\n");
});
