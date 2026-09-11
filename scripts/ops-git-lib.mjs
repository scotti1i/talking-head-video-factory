// ============================================================
// client/<host> 分支发布机制（report:push / request 共用）
// 为什么：客户机器上的代码只能 update，不能改；但 job 的文本证据
// （data / qa / review / delivery）和需求单必须回流到仓库让我们复核。
// 做法：临时 git worktree 挂到 client/<host>，拷文件、commit、push，
// 然后删 worktree——主工作区（可能停在 tag 的 detached HEAD）全程不动，
// 所以「回到之前的分支 / tag」天然成立，不存在切换失败留下半截状态。
// 操作员只需要对 client/<host> 有 push 权限的 deploy token。
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function clientHost(hostname = os.hostname()) {
  const host = String(hostname || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return host || "unknown";
}

export function clientBranch(host = clientHost()) {
  return `client/${host}`;
}

export function git(repoDir, args, { allowFail = false } = {}) {
  const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} 失败（${repoDir}）\n${(result.stderr || result.stdout || "").trim()}`);
  }
  return { ok: result.status === 0, stdout: String(result.stdout || "").trim(), stderr: String(result.stderr || "").trim() };
}

// 当前所在：分支名 / tag（detached 时）/ sha
export function describeHead(repoDir) {
  const branch = git(repoDir, ["symbolic-ref", "--short", "-q", "HEAD"], { allowFail: true }).stdout || null;
  const tag = git(repoDir, ["describe", "--tags", "--exact-match", "HEAD"], { allowFail: true }).stdout || null;
  const sha = git(repoDir, ["rev-parse", "--short", "HEAD"], { allowFail: true }).stdout || null;
  return { branch, tag, sha };
}

export function hasRemote(repoDir, remote = "origin") {
  return git(repoDir, ["remote", "get-url", remote], { allowFail: true }).ok;
}

function identityArgs(repoDir, host) {
  const email = git(repoDir, ["config", "user.email"], { allowFail: true }).stdout;
  const name = git(repoDir, ["config", "user.name"], { allowFail: true }).stdout;
  if (email && name) return [];
  return ["-c", `user.name=${name || `factory-operator-${host}`}`, "-c", `user.email=${email || `factory-operator@${host}.local`}`];
}

// 让本地 client 分支就位：优先远端已有的，其次本地已有的，最后从 HEAD 新建。
function prepareBranch(repoDir, branch, remote) {
  const localExists = git(repoDir, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`], { allowFail: true }).ok;
  let remoteExists = false;
  if (hasRemote(repoDir, remote)) {
    const fetched = git(repoDir, ["fetch", "--quiet", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], { allowFail: true });
    remoteExists = fetched.ok && git(repoDir, ["rev-parse", "--verify", "-q", `refs/remotes/${remote}/${branch}`], { allowFail: true }).ok;
  }
  if (!localExists && remoteExists) {
    git(repoDir, ["branch", "--track", branch, `${remote}/${branch}`]);
    return;
  }
  if (localExists && remoteExists) {
    // 本地落后远端且能快进就快进；本地领先（上次没 push 出去）保留，push 时再合
    const isAncestor = git(repoDir, ["merge-base", "--is-ancestor", branch, `${remote}/${branch}`], { allowFail: true }).ok;
    if (isAncestor) git(repoDir, ["branch", "-f", branch, `${remote}/${branch}`]);
    return;
  }
  if (!localExists) git(repoDir, ["branch", branch, "HEAD"]);
}

export function publishToClientBranch({ repoDir, host = clientHost(), stage, message, push = true, remote = "origin" }) {
  const branch = clientBranch(host);
  const before = describeHead(repoDir);
  if (before.branch === branch) {
    throw new Error(`当前工作区已经检出 ${branch}；请先回到发布 tag（npm run update）再执行。`);
  }
  prepareBranch(repoDir, branch, remote);

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "factory-ops-"));
  fs.rmSync(worktree, { recursive: true, force: true });
  git(repoDir, ["worktree", "add", "--quiet", worktree, branch]);
  const result = { branch, host, committed: false, pushed: false, sha: null, paths: [], warning: null };
  try {
    const staged = stage(worktree) || [];
    result.paths = staged;
    if (staged.length) git(worktree, ["add", "-A", "-f", "--", ...staged]);
    const clean = git(worktree, ["diff", "--cached", "--quiet"], { allowFail: true }).ok;
    if (!clean) {
      git(worktree, [...identityArgs(repoDir, host), "commit", "--quiet", "-m", message]);
      result.committed = true;
    }
    result.sha = git(worktree, ["rev-parse", "--short", "HEAD"]).stdout;
    if (push) {
      if (!hasRemote(repoDir, remote)) {
        result.warning = `仓库没有 ${remote} 远端，已只 commit 到 ${branch}`;
      } else {
        const pushed = git(worktree, ["push", "--quiet", "-u", remote, `${branch}:${branch}`], { allowFail: true });
        if (pushed.ok) {
          result.pushed = true;
        } else {
          // 远端可能被另一台机器推进过：rebase 一次再试
          const rebased = git(worktree, ["pull", "--quiet", "--rebase", remote, branch], { allowFail: true });
          const retry = rebased.ok ? git(worktree, ["push", "--quiet", "-u", remote, `${branch}:${branch}`], { allowFail: true }) : pushed;
          if (retry.ok) {
            result.pushed = true;
            result.sha = git(worktree, ["rev-parse", "--short", "HEAD"]).stdout;
          } else {
            result.warning = `push ${branch} 失败，已只 commit 到本地：${(retry.stderr || rebased.stderr || pushed.stderr).split("\n").at(-1)}`;
          }
        }
      }
    }
  } finally {
    git(repoDir, ["worktree", "remove", "--force", worktree], { allowFail: true });
    git(repoDir, ["worktree", "prune"], { allowFail: true });
    fs.rmSync(worktree, { recursive: true, force: true });
  }
  const after = describeHead(repoDir);
  if (after.sha !== before.sha || after.branch !== before.branch) {
    throw new Error(`主工作区状态漂移：之前 ${JSON.stringify(before)}，现在 ${JSON.stringify(after)}`);
  }
  return result;
}

export function timestampLabel(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
