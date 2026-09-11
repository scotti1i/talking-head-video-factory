import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { clientHost, describeHead, git, publishToClientBranch } from "./ops-git-lib.mjs";
import { collectReportFiles, pushJobReport } from "./report-push.mjs";
import { writeRequest } from "./request.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function makeRepo({ withRemote = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "factory-ops-test-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(repo);
  git(repo, ["init", "--quiet", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "fixture", version: "2.0.0" }));
  fs.mkdirSync(path.join(repo, "scripts"));
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// code\n");
  git(repo, [...IDENTITY, "commit", "--quiet", "--allow-empty", "-m", "init"]);
  git(repo, ["add", "-A"]);
  git(repo, [...IDENTITY, "commit", "--quiet", "-m", "code"]);
  git(repo, ["tag", "v2.0.0"]);
  let remote = null;
  if (withRemote) {
    remote = path.join(base, "remote.git");
    git(base, ["init", "--quiet", "--bare", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    git(repo, ["push", "--quiet", "origin", "main", "--tags"]);
  }
  return { base, repo, remote };
}

function makeJob(base) {
  const job = path.join(base, "jobs", "demo");
  const files = {
    "project.json": "{}",
    "project.md": "# demo",
    "data/rough-cut-edl.json": "[]",
    "data/captions.srt": "1",
    "data/transcripts/take.json": "{}",
    "assets/aroll.mp4": "binary",
    "assets/originals/take.mp4": "binary",
    "renders/final.mp4": "binary",
    "qa/acceptance.json": "{}",
    "qa/cuts/frames/cut-01.jpg": "binary",
    "review/R0/feedback.json": "{}",
    "review/R0/video.mp4": "binary",
    "delivery/manifest.json": "{}",
    "requests/2026-09-11-x.md": "# x",
    "variants/douyin/project.json": "{}",
    "variants/douyin/qa/report.json": "{}",
    "variants/douyin/renders/out.mp4": "binary",
    "tmp/scratch.json": "{}"
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(job, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.symlinkSync(path.join(job, "assets"), path.join(job, "variants", "douyin", "assets"), "dir");
  return job;
}

test("主机名清洗成分支安全字符串", () => {
  assert.equal(clientHost("DESKTOP-Factory 01.local"), "desktop-factory-01-local");
  assert.equal(clientHost(""), "unknown");
});

test("白名单只收文本证据：媒体、assets、renders、tmp、symlink 全部排除", () => {
  const { base } = makeRepo({ withRemote: false });
  const job = makeJob(base);
  assert.deepEqual(collectReportFiles(job), [
    "data/captions.srt",
    "data/rough-cut-edl.json",
    "data/transcripts/take.json",
    "delivery/manifest.json",
    "project.json",
    "project.md",
    "qa/acceptance.json",
    "requests/2026-09-11-x.md",
    "review/R0/feedback.json",
    "variants/douyin/project.json",
    "variants/douyin/qa/report.json"
  ]);
});

test("停在 tag 的 detached HEAD 上 report:push：client 分支从 tag 建、commit、push，主工作区不动", () => {
  const { base, repo, remote } = makeRepo();
  const job = makeJob(base);
  git(repo, ["checkout", "--quiet", "v2.0.0"]);
  const before = describeHead(repo);
  assert.equal(before.branch, null);
  assert.equal(before.tag, "v2.0.0");

  const result = pushJobReport({ jobDir: job, repoDir: repo, host: "factory-01", now: new Date("2026-09-11T08:05:00") });
  assert.equal(result.branch, "client/factory-01");
  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(result.files, 11);
  assert.deepEqual(describeHead(repo), before);
  assert.equal(git(repo, ["status", "--porcelain"]).stdout, "");
  assert.equal(git(repo, ["worktree", "list"]).stdout.split("\n").length, 1);

  const remoteFiles = git(remote, ["ls-tree", "-r", "--name-only", "client/factory-01"]).stdout.split("\n");
  assert.ok(remoteFiles.includes("ops/factory-01/demo/qa/acceptance.json"));
  assert.ok(remoteFiles.includes("scripts/x.mjs"));
  assert.ok(!remoteFiles.some((file) => file.endsWith(".mp4") || file.endsWith(".jpg")));
  assert.match(git(remote, ["log", "-1", "--format=%s", "client/factory-01"]).stdout, /^ops\(factory-01\): demo 2026-09-11 08:05$/);

  // 第二次无变更：不产生空 commit
  const again = pushJobReport({ jobDir: job, repoDir: repo, host: "factory-01" });
  assert.equal(again.committed, false);
  assert.equal(git(remote, ["rev-list", "--count", "client/factory-01"]).stdout, "3");
});

test("没有远端时只 commit 并给出说明；远端被别人推进时 rebase 后仍能 push", () => {
  const noRemote = makeRepo({ withRemote: false });
  const job = makeJob(noRemote.base);
  const local = pushJobReport({ jobDir: job, repoDir: noRemote.repo, host: "solo" });
  assert.equal(local.committed, true);
  assert.equal(local.pushed, false);
  assert.match(local.warning, /没有 origin 远端/);
  assert.ok(git(noRemote.repo, ["rev-parse", "--verify", "client/solo"]).ok);

  const { base, repo, remote } = makeRepo();
  const job2 = makeJob(base);
  pushJobReport({ jobDir: job2, repoDir: repo, host: "shared" });
  // 另一台机器往同一分支推了一个文件
  const other = path.join(base, "other");
  git(base, ["clone", "--quiet", "--branch", "client/shared", remote, other]);
  fs.writeFileSync(path.join(other, "ops", "shared", "note.md"), "elsewhere");
  git(other, ["add", "-A"]);
  git(other, [...IDENTITY, "commit", "--quiet", "-m", "other machine"]);
  git(other, ["push", "--quiet", "origin", "client/shared"]);

  fs.writeFileSync(path.join(job2, "qa", "acceptance.json"), "{\"overall\":\"PASS\"}");
  const result = pushJobReport({ jobDir: job2, repoDir: repo, host: "shared" });
  assert.equal(result.pushed, true);
  const files = git(remote, ["ls-tree", "-r", "--name-only", "client/shared"]).stdout.split("\n");
  assert.ok(files.includes("ops/shared/note.md"));
  assert.ok(files.includes("ops/shared/demo/qa/acceptance.json"));
});

test("request 写需求单、带版本与主机、commit 到 client 分支", () => {
  const { base, repo, remote } = makeRepo();
  const job = makeJob(base);
  const result = writeRequest({
    title: "支持 1.15 倍速 A-roll",
    detail: "客户要求成片比原片快 15%，现有 aroll:treat 预设只有 1.1。",
    jobDir: job,
    repoDir: repo,
    host: "factory-01",
    now: new Date("2026-09-11T02:00:00.000Z")
  });
  assert.equal(result.relativePath, "requests/2026-09-11-支持-1.15-倍速-a-roll.md");
  const content = fs.readFileSync(result.file, "utf8");
  assert.match(content, /^# 支持 1.15 倍速 A-roll/);
  assert.match(content, /主机：factory-01/);
  assert.match(content, /job：demo/);
  assert.match(content, /仓库版本：v2.0.0 @ /);
  assert.match(content, /版本号：2.0.0/);
  assert.match(content, /node=v\d+/);
  assert.equal(result.pushed, true);
  assert.match(git(remote, ["log", "-1", "--format=%s", "client/factory-01"]).stdout, /^request\(factory-01\): 支持 1.15 倍速 A-roll$/);
  assert.ok(git(remote, ["-c", "core.quotepath=false", "ls-tree", "-r", "--name-only", "client/factory-01"]).stdout.includes(result.relativePath));
  assert.throws(() => writeRequest({ title: "支持 1.15 倍速 A-roll", detail: "x", repoDir: repo, host: "factory-01", now: new Date("2026-09-11T02:00:00.000Z") }), /已存在/);
  assert.throws(() => writeRequest({ title: "no detail", repoDir: repo }), /--detail/);
});

test("当前工作区就在 client 分支上时拒绝，避免自我覆盖", () => {
  const { repo } = makeRepo({ withRemote: false });
  git(repo, ["checkout", "--quiet", "-b", "client/here"]);
  assert.throws(() => publishToClientBranch({ repoDir: repo, host: "here", stage: () => [], message: "x" }), /已经检出/);
});
