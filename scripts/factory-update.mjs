// ============================================================
// update —— 客户机器只通过 tag 升级代码，失败自动回滚
// 为什么：spec §3 / §9——发布 = 打 tag，不再做便携 zip；客户机器
// 永远停在某个 v* tag 的 detached HEAD 上，代码目录不允许有本地改动。
// 用法：npm run update -- [--check] [--tag vX.Y.Z] [--pre]
//   --check：只比对当前 / 最新，不装；有新版退出码 3
// 环境：FACTORY_SKIP_DOCTOR=1 跳过 doctor:deployment（非 WSL 开发机）
// 记录：~/.config/talking-head-factory/update.log
// v2.0.3 §F：HEAD 在 client/<host>-fix-<slug> 修复分支上时先看 PR 状态——
//   open → 不动，退出 0；merged → 正常升到最新 tag；closed 未合并 / 没 PR →
//   format-patch 存档到 ops/<host>/rejected/<branch>/ 再升到最新 tag。
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, parseArgs, projectRoot, readJson, writeJson } from "./lib.mjs";
import { clientHost, describeHead, git, hasRemote, isFixBranch } from "./ops-git-lib.mjs";
import { archivePatches, githubProvider, parseRemote, prStatusLabel, readProposeState, writeProposeState } from "./propose.mjs";
import { pushRejected } from "./report-push.mjs";

export const CODE_PATHS = Object.freeze([
  "scripts", "components", "themes", "template-packs", "console", "deploy", "skills", "docs", ".agents",
  "package.json", "package-lock.json"
]);

export function parseSemver(tag) {
  const match = String(tag || "").match(/^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { tag, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || null };
}

export function compareSemver(a, b) {
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre.localeCompare(b.pre, "en", { numeric: true });
}

export function latestTag(tags, { includePrerelease = false } = {}) {
  const parsed = tags.map(parseSemver).filter(Boolean).filter((item) => includePrerelease || item.pre === null);
  if (!parsed.length) return null;
  return parsed.sort(compareSemver).at(-1).tag;
}

export function listTags(repoDir) {
  return git(repoDir, ["tag", "-l", "v*"]).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function dirtyCodePaths(repoDir) {
  const output = git(repoDir, ["status", "--porcelain", "--", ...CODE_PATHS]).stdout;
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function appendUpdateLog(message, { file = path.join(factoryConfigDir(), "update.log"), now = new Date() } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `[${now.toISOString()}] ${message}\n`);
  return file;
}

function runStep(label, fn, log) {
  log(`step ${label}: start`);
  try {
    fn();
    log(`step ${label}: ok`);
  } catch (error) {
    log(`step ${label}: FAIL ${String(error.message || error).split("\n")[0]}`);
    throw new Error(`${label} 失败：${error.message || error}`);
  }
}

// steps 可注入（测试用）；真实步骤见 realSteps()
export function performUpdate({ repoDir, tag, steps, log = () => {} }) {
  const before = describeHead(repoDir);
  const previous = before.tag || git(repoDir, ["rev-parse", "HEAD"]).stdout;
  if (!git(repoDir, ["rev-parse", "--verify", "-q", `refs/tags/${tag}`], { allowFail: true }).ok) {
    throw new Error(`tag 不存在: ${tag}；先 git fetch --tags`);
  }
  const dirty = dirtyCodePaths(repoDir);
  if (dirty.length) {
    throw new Error(`代码目录有本地改动，拒绝更新：\n${dirty.join("\n")}\n客户机器不改代码；需要改动请 npm run request，本地改动请先撤销。`);
  }
  log(`update ${previous} -> ${tag}`);
  try {
    runStep(`checkout ${tag}`, () => git(repoDir, ["checkout", "--quiet", tag]), log);
    for (const [name, fn] of Object.entries(steps)) {
      if (typeof fn !== "function") continue;
      runStep(name, fn, log);
    }
  } catch (error) {
    log(`rollback -> ${previous}`);
    git(repoDir, ["checkout", "--quiet", previous]);
    try {
      if (typeof steps.install === "function") steps.install();
      log(`rollback ok: ${describeHead(repoDir).tag || previous}`);
    } catch (installError) {
      log(`rollback install FAIL: ${installError.message}`);
    }
    throw new Error(`更新到 ${tag} 失败，已回滚到 ${previous}。原因：${error.message}`);
  }
  log(`update ok: ${tag}`);
  return { previous, tag };
}

// ============================================================
// 修复分支状态机（可注入 prStatus 与 archive，测试不走网络）
// prStatus(state) → { state: "open"|"closed", merged: boolean, url } 或 null（没 PR）
// 返回 action：none（不在修复分支）/ wait（PR 开着）/ merged / rejected
// ============================================================
export async function fixBranchDecision({ repoDir, configDir = factoryConfigDir(), host = clientHost(), prStatus, archive, push = true, log = () => {} }) {
  const head = describeHead(repoDir);
  if (!head.branch || !isFixBranch(head.branch)) return { action: "none", branch: head.branch };
  const branch = head.branch;
  const state = readProposeState(branch, configDir);
  let pr = null;
  if (state?.pr) {
    try {
      pr = await prStatus(state);
    } catch (error) {
      log(`fix-branch ${branch}: PR #${state.pr} 状态查询失败（${String(error.message || error).split("\n")[0]}），按 open 处理不动`);
      return { action: "wait", branch, pr: { number: state.pr, url: state.url, state: "unknown" }, state, reason: "status-unavailable" };
    }
  }
  if (pr && !pr.merged && pr.state === "open") {
    log(`fix-branch ${branch}: PR #${state.pr} open，等待审核`);
    return { action: "wait", branch, pr, state };
  }
  if (pr?.merged) {
    log(`fix-branch ${branch}: PR #${state.pr} 已合并，升到最新 tag`);
    if (state) writeProposeState({ ...state, resolved: "merged", resolvedAt: new Date().toISOString() }, configDir);
    return { action: "merged", branch, pr, state };
  }
  const dirty = dirtyCodePaths(repoDir);
  if (dirty.length) {
    throw new Error(`修复分支 ${branch} 有未提交改动，先 git add -A && git commit 或 git checkout -- <文件>，再 npm run update：\n${dirty.join("\n")}`);
  }
  const archived = (archive || defaultArchive)({ repoDir, branch, tag: state?.tag || null, host, push });
  log(`fix-branch ${branch}: PR ${pr ? `#${state.pr} 已关闭未合并` : "不存在"}，${archived.patches.length} 个补丁存档到 ${archived.target}`);
  if (state) writeProposeState({ ...state, resolved: pr ? "rejected" : "no-pr", resolvedAt: new Date().toISOString(), archived: archived.patches }, configDir);
  return { action: "rejected", branch, pr, state, archived };
}

// format-patch 到临时目录 → report:push --rejected 推到 ops/<host>/rejected/<branch>/
function defaultArchive({ repoDir, branch, tag, host, push }) {
  const archive = archivePatches({ repoDir, branch, tag });
  const pushed = archive.patches.length ? pushRejected({ dir: archive.dir, branchName: branch, repoDir, host, push }) : null;
  return { ...archive, target: `ops/${host}/rejected/${branch}`, pushed };
}

// 主工作区从修复分支回到 tag 后，本地分支删掉，状态只剩 tag
export function dropFixBranch(repoDir, branch) {
  git(repoDir, ["branch", "-D", "--quiet", branch], { allowFail: true });
}

function shell(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} 退出码 ${result.status}`);
}

export function realSteps(repoDir) {
  const steps = {
    install: () => shell("npm", ["ci", "--no-audit", "--no-fund"], repoDir),
    hooks: () => shell("node", [path.join(repoDir, "scripts", "install-git-hooks.mjs")], repoDir)
  };
  if (process.env.FACTORY_SKIP_DOCTOR !== "1") steps.doctor = () => shell("npm", ["run", "doctor:deployment"], repoDir);
  const pkg = readJson(path.join(repoDir, "package.json"));
  if (pkg.scripts?.smoke) steps.smoke = () => shell("npm", ["run", "smoke"], repoDir);
  return steps;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const repoDir = projectRoot();
  const log = (message) => {
    appendUpdateLog(message);
    console.log(`[update] ${message}`);
  };
  if (hasRemote(repoDir)) {
    const fetched = git(repoDir, ["fetch", "--tags", "--quiet", "origin"], { allowFail: true });
    if (!fetched.ok) console.warn(`WARN: git fetch --tags 失败（${fetched.stderr.split("\n").at(-1)}），只用本地已有 tag 比对`);
  } else {
    console.warn("WARN: 没有 origin 远端，只用本地已有 tag 比对");
  }
  const current = describeHead(repoDir);
  const latest = latestTag(listTags(repoDir), { includePrerelease: Boolean(args.pre) });
  const currentLabel = current.tag || `${current.branch || "detached"}@${current.sha}`;
  if (args.check) {
    console.log(`当前: ${currentLabel} · 最新: ${latest || "无 v* tag"}`);
    const newer = latest && latest !== current.tag;
    if (current.branch && isFixBranch(current.branch)) console.log(`当前在修复分支 ${current.branch}；npm run update 会按 PR 状态处理（open 等待 / merged 升级 / closed 存档后升级）`);
    console.log(newer ? `有新版 ${latest}，执行 npm run update 升级` : "已是最新");
    appendUpdateLog(`check: current=${currentLabel} latest=${latest || "none"} ${newer ? "UPDATE_AVAILABLE" : "UP_TO_DATE"}`);
    process.exit(newer ? 3 : 0);
  }
  // 修复分支：先问 PR 状态再决定动不动
  const decision = await fixBranchDecision({
    repoDir,
    log,
    prStatus: async (state) => {
      const { owner, repo } = parseRemote(git(repoDir, ["remote", "get-url", "origin"]).stdout);
      const pr = await githubProvider().getPr({ owner, repo, number: state.pr });
      return { ...pr, label: prStatusLabel(pr) };
    }
  });
  if (decision.action === "wait") {
    console.log(`修复分支 ${decision.branch} 的 PR #${decision.pr.number} 仍在审核（${decision.pr.url || "无链接"}）；不升级、不改动。等 PR 合并或关闭后再 npm run update。`);
    process.exit(0);
  }
  if (decision.action === "rejected") {
    console.log(`PR ${decision.pr ? `#${decision.pr.number} 已关闭未合并` : "不存在"}：${decision.archived.patches.length} 个补丁已存档到 ${decision.archived.target}${decision.archived.pushed?.pushed ? "（已 push）" : "（本地 commit，未 push）"}，现在回到最新 tag。`);
  }
  const target = String(args.tag || latest || "");
  if (!target) throw new Error("没有可用的 v* tag");
  if (target === current.tag) {
    console.log(`已在 ${target}，无需更新`);
    process.exit(0);
  }
  const result = performUpdate({ repoDir, tag: target, steps: realSteps(repoDir), log });
  if (decision.action !== "none") dropFixBranch(repoDir, decision.branch);
  console.log(`更新完成: ${result.previous} -> ${result.tag}`);
}
