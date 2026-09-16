import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { dropFixBranch, fixBranchDecision, performUpdate } from "./factory-update.mjs";
import { describeHead, fixBranch, git, isFixBranch } from "./ops-git-lib.mjs";
import { abandonProposal, createProposal, githubToken, parseRemote, prStatusLabel, proposalStatus, readProposeState, renderPrBody, stateFile, submitProposal } from "./propose.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function makeRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "propose-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  git(repo, ["init", "--quiet", "-b", "v2"]);
  git(repo, ["config", "user.name", "test"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  for (const [tag, version] of [["v2.0.0", "2.0.0"], ["v2.0.1", "2.0.1"]]) {
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version, scripts: {} }));
    fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), `// ${version}\n`);
    git(repo, ["add", "-A"]);
    git(repo, [...IDENTITY, "commit", "--quiet", "-m", version]);
    git(repo, ["tag", tag]);
  }
  const remote = path.join(base, "remote.git");
  git(base, ["init", "--quiet", "--bare", remote]);
  git(repo, ["remote", "add", "origin", `${remote}`]);
  git(repo, ["push", "--quiet", "origin", "v2", "--tags"]);
  git(repo, ["checkout", "--quiet", "v2.0.0"]);
  const configDir = path.join(base, "config");
  return { base, repo, remote, configDir };
}

// 假 GitHub：记录调用，可预设状态；parseRemote 需要 github.com 形态的 URL，所以测试里把 origin 换成假 URL 前先 push
function fakeGithub(initial = { state: "open", merged: false }) {
  const calls = [];
  let current = { number: 42, url: "https://github.com/scotti1i/talking-head-video-factory/pull/42", ...initial };
  return {
    calls,
    set(next) { current = { ...current, ...next }; },
    async createPr(input) { calls.push(["create", input]); return { ...current }; },
    async getPr(input) { calls.push(["get", input]); return { ...current }; }
  };
}

function useGithubRemote(repo, remote) {
  // push 先走真实 bare 仓库，再把 URL 改成 GitHub 形态给 parseRemote；push 用 pushurl 继续指向本地
  git(repo, ["remote", "set-url", "origin", "https://github.com/scotti1i/talking-head-video-factory.git"]);
  git(repo, ["remote", "set-url", "--push", "origin", remote]);
}

test("分支命名 client/<host>-fix-<slug>；parseRemote 认 https / ssh / 带 token 三种 origin", () => {
  assert.equal(fixBranch("caption-drift", "desktop-01"), "client/desktop-01-fix-caption-drift");
  assert.equal(isFixBranch("client/desktop-01-fix-caption-drift"), true);
  assert.equal(isFixBranch("client/desktop-01"), false);
  assert.equal(isFixBranch("client/desktop-01/fix-x"), false);
  assert.deepEqual(parseRemote("https://github.com/scotti1i/talking-head-video-factory.git"), { owner: "scotti1i", repo: "talking-head-video-factory" });
  assert.deepEqual(parseRemote("git@github.com:scotti1i/talking-head-video-factory.git"), { owner: "scotti1i", repo: "talking-head-video-factory" });
  assert.deepEqual(parseRemote("https://x-access-token:abc@github.com/o/r"), { owner: "o", repo: "r" });
  assert.throws(() => parseRemote("/tmp/remote.git"), /不是 GitHub/);
  assert.equal(githubToken({ env: { FACTORY_GITHUB_TOKEN: " t1 " }, fill: () => "t2" }), "t1");
  assert.equal(githubToken({ env: {}, fill: () => "t2" }), "t2");
  assert.throws(() => githubToken({ env: {}, fill: () => null }), /找不到 GitHub token/);
  assert.equal(prStatusLabel({ state: "closed", merged: true }), "merged");
  assert.equal(prStatusLabel({ state: "closed", merged: false }), "closed");
  assert.equal(prStatusLabel({ state: "open", merged: false }), "open");
  assert.equal(prStatusLabel(null), "none");
});

test("propose --title：从当前 tag 建分支并写状态；不在 tag 上或已在修复分支时拒绝", () => {
  const { repo, configDir } = makeRepo();
  const result = createProposal({ title: "字幕漂移 0.3s：captions 对齐用错基准", repoDir: repo, configDir, host: "factory-01", now: new Date("2026-09-16T00:00:00.000Z") });
  assert.equal(result.branch, "client/factory-01-fix-字幕漂移-0.3s-captions-对齐用错基准");
  assert.equal(result.tag, "v2.0.0");
  assert.equal(describeHead(repo).branch, result.branch);
  const state = readProposeState(result.branch, configDir);
  assert.deepEqual({ ...state, createdAt: undefined }, { schemaVersion: 1, branch: result.branch, title: "字幕漂移 0.3s：captions 对齐用错基准", host: "factory-01", base: "v2", tag: "v2.0.0", pr: null, url: null, createdAt: undefined });
  assert.ok(fs.existsSync(stateFile(result.branch, configDir)));
  assert.throws(() => createProposal({ title: "again", repoDir: repo, configDir, host: "factory-01" }), /已在修复分支/);
  git(repo, ["checkout", "--quiet", "v2"]);
  assert.throws(() => createProposal({ title: "x", repoDir: repo, configDir, host: "factory-01" }), /不在发布 tag 上/);
  assert.throws(() => createProposal({ title: "  ", repoDir: repo, configDir }), /--title/);
});

test("propose --submit：测试不绿拒绝；全绿则 commit、push、开 PR、存 pr/url；再次 submit 只更新不重开", async () => {
  const { repo, remote, configDir } = makeRepo();
  const { branch } = createProposal({ title: "fix caption drift", repoDir: repo, configDir, host: "h1" });
  useGithubRemote(repo, remote);
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// fixed\n");
  const github = fakeGithub();

  const red = [{ label: "node --test", exitCode: 1, summary: "tests 3 · pass 2 · fail 1" }];
  await assert.rejects(submitProposal({ repoDir: repo, configDir, host: "h1", runTests: () => red, github }), /本地测试未全绿/);
  assert.equal(github.calls.length, 0);
  assert.match(git(repo, ["status", "--porcelain"]).stdout, /^ ?M scripts\/x\.mjs$/);

  const green = [{ label: "node --test", exitCode: 0, summary: "tests 3 · pass 3 · fail 0" }, { label: "npm run test:governance", exitCode: 0, summary: "tests 30 · pass 30 · fail 0" }];
  const result = await submitProposal({ repoDir: repo, configDir, host: "h1", what: "captions 基准改成 aroll.mp4", why: "v2.0.0 用了原片时间轴", reproduce: "npm run qa:alignment -- --job jobs/demo", runTests: () => green, github, now: new Date("2026-09-16T01:00:00.000Z") });
  assert.equal(result.created, true);
  assert.equal(result.pr, 42);
  assert.equal(result.pushed, true);
  assert.equal(result.ahead, 1);
  assert.equal(git(repo, ["status", "--porcelain"]).stdout, "");
  assert.equal(git(repo, ["log", "-1", "--format=%s"]).stdout, "fix caption drift");
  assert.equal(git(remote, ["rev-parse", branch]).stdout, git(repo, ["rev-parse", "HEAD"]).stdout);
  const [kind, input] = github.calls[0];
  assert.equal(kind, "create");
  assert.deepEqual({ owner: input.owner, repo: input.repo, head: input.head, base: input.base, title: input.title }, { owner: "scotti1i", repo: "talking-head-video-factory", head: branch, base: "v2", title: "fix caption drift" });
  assert.match(input.body, /### 改了什么 \/ 为什么\n\ncaptions 基准改成 aroll\.mp4\n\nv2\.0\.0 用了原片时间轴/);
  assert.match(input.body, /npm run qa:alignment -- --job jobs\/demo/);
  assert.match(input.body, /PASS · npm run test:governance · tests 30/);
  assert.match(input.body, /主机：h1\n- 基于 tag：v2\.0\.0/);
  const state = readProposeState(branch, configDir);
  assert.deepEqual({ pr: state.pr, url: state.url, base: state.base, tag: state.tag }, { pr: 42, url: "https://github.com/scotti1i/talking-head-video-factory/pull/42", base: "v2", tag: "v2.0.0" });

  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// fixed twice\n");
  const again = await submitProposal({ repoDir: repo, configDir, host: "h1", runTests: () => green, github });
  assert.equal(again.created, false);
  assert.equal(again.ahead, 2);
  assert.equal(github.calls.at(-1)[0], "get");

  const status = await proposalStatus({ repoDir: repo, configDir, github });
  assert.equal(status.status, "open");
  github.set({ state: "closed", merged: true });
  assert.equal((await proposalStatus({ repoDir: repo, configDir, github })).status, "merged");
  assert.equal(renderPrBody({ title: "t", tests: [], host: "h", tag: "v1" }).includes("（未填写 --what）"), true);
});

test("propose --abandon：补丁存档到 ops/<host>/rejected/<branch>/ 并 push，回到 tag，分支删除", () => {
  const { repo, remote, configDir } = makeRepo();
  const { branch } = createProposal({ title: "try something", repoDir: repo, configDir, host: "h2" });
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// attempt 1\n");
  git(repo, ["add", "-A"]);
  git(repo, [...IDENTITY, "commit", "--quiet", "-m", "attempt 1"]);
  fs.writeFileSync(path.join(repo, "scripts", "y.mjs"), "// uncommitted\n");
  const result = abandonProposal({ repoDir: repo, configDir, host: "h2", now: new Date("2026-09-16T02:00:00.000Z") });
  assert.equal(result.tag, "v2.0.0");
  assert.deepEqual(result.patches, ["0001-attempt-1.patch", "0002-WIP-propose.patch"]);
  assert.equal(describeHead(repo).tag, "v2.0.0");
  assert.equal(git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`], { allowFail: true }).ok, false);
  assert.equal(git(repo, ["status", "--porcelain"]).stdout, "");
  const files = git(remote, ["ls-tree", "-r", "--name-only", "client/h2"]).stdout.split("\n");
  assert.ok(files.includes(`ops/h2/rejected/${branch}/0001-attempt-1.patch`));
  assert.ok(files.includes(`ops/h2/rejected/${branch}/README.md`));
  assert.match(git(remote, ["log", "-1", "--format=%s", "client/h2"]).stdout, /^rejected\(h2\): client\/h2-fix-try-something 2026-09-16 /);
  assert.equal(readProposeState(branch, configDir).abandonedAt, "2026-09-16T02:00:00.000Z");
});

test("update 状态机：open 等待 / merged 升级 / closed 或无 PR 存档后升级 / 查询失败按 open 处理", async () => {
  const { repo, remote, configDir } = makeRepo();
  const logs = [];
  const log = (message) => logs.push(message);
  assert.deepEqual(await fixBranchDecision({ repoDir: repo, configDir, prStatus: () => { throw new Error("不该查"); } }), { action: "none", branch: null });

  const { branch } = createProposal({ title: "drift", repoDir: repo, configDir, host: "h3" });
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// fix\n");
  git(repo, ["add", "-A"]);
  git(repo, [...IDENTITY, "commit", "--quiet", "-m", "drift"]);
  const state = readProposeState(branch, configDir);
  // 没 PR（从没 --submit）：存档
  const noPr = await fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: () => { throw new Error("不该查"); }, log });
  assert.equal(noPr.action, "rejected");
  assert.equal(noPr.pr, null);
  assert.deepEqual(noPr.archived.patches, ["0001-drift.patch"]);
  assert.equal(noPr.archived.pushed.pushed, true);
  assert.ok(git(remote, ["ls-tree", "-r", "--name-only", "client/h3"]).stdout.includes(`ops/h3/rejected/${branch}/0001-drift.patch`));
  assert.equal(readProposeState(branch, configDir).resolved, "no-pr");
  assert.equal(describeHead(repo).branch, branch);

  // 假装已 submit
  fs.writeFileSync(stateFile(branch, configDir), JSON.stringify({ ...state, pr: 7, url: "https://github.com/o/r/pull/7" }));
  const open = await fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: async () => ({ number: 7, state: "open", merged: false, url: "https://github.com/o/r/pull/7" }), log });
  assert.equal(open.action, "wait");
  assert.equal(open.pr.number, 7);
  assert.equal(describeHead(repo).branch, branch);

  const unknown = await fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: async () => { throw new Error("ENOTFOUND api.github.com"); }, log });
  assert.equal(unknown.action, "wait");
  assert.equal(unknown.reason, "status-unavailable");

  const closed = await fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: async () => ({ number: 7, state: "closed", merged: false }), log });
  assert.equal(closed.action, "rejected");
  assert.equal(readProposeState(branch, configDir).resolved, "rejected");

  const merged = await fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: async () => ({ number: 7, state: "closed", merged: true }), log });
  assert.equal(merged.action, "merged");
  assert.equal(readProposeState(branch, configDir).resolved, "merged");
  assert.ok(logs.some((line) => /已合并/.test(line)));

  // merged 之后走正常升级并删分支：状态只剩 tag
  const updated = performUpdate({ repoDir: repo, tag: "v2.0.1", steps: {}, log });
  assert.equal(updated.tag, "v2.0.1");
  dropFixBranch(repo, branch);
  assert.equal(describeHead(repo).tag, "v2.0.1");
  assert.equal(git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`], { allowFail: true }).ok, false);

  // 未提交改动时拒绝存档，避免丢改动
  createProposal({ title: "dirty", repoDir: repo, configDir, host: "h3" });
  fs.writeFileSync(path.join(repo, "scripts", "x.mjs"), "// dirty\n");
  await assert.rejects(fixBranchDecision({ repoDir: repo, configDir, host: "h3", prStatus: async () => null, log }), /未提交改动/);
});
