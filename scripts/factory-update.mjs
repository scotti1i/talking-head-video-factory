// ============================================================
// update —— 客户机器只通过 tag 升级代码，失败自动回滚
// 为什么：spec §3 / §9——发布 = 打 tag，不再做便携 zip；客户机器
// 永远停在某个 v* tag 的 detached HEAD 上，代码目录不允许有本地改动。
// 用法：npm run update -- [--check] [--tag vX.Y.Z] [--pre]
//   --check：只比对当前 / 最新，不装；有新版退出码 3
// 环境：FACTORY_SKIP_DOCTOR=1 跳过 doctor:deployment（非 WSL 开发机）
// 记录：~/.config/talking-head-factory/update.log
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, parseArgs, projectRoot, readJson } from "./lib.mjs";
import { describeHead, git, hasRemote } from "./ops-git-lib.mjs";

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
    console.log(newer ? `有新版 ${latest}，执行 npm run update 升级` : "已是最新");
    appendUpdateLog(`check: current=${currentLabel} latest=${latest || "none"} ${newer ? "UPDATE_AVAILABLE" : "UP_TO_DATE"}`);
    process.exit(newer ? 3 : 0);
  }
  const target = String(args.tag || latest || "");
  if (!target) throw new Error("没有可用的 v* tag");
  if (target === current.tag) {
    console.log(`已在 ${target}，无需更新`);
    process.exit(0);
  }
  const result = performUpdate({ repoDir, tag: target, steps: realSteps(repoDir), log });
  console.log(`更新完成: ${result.previous} -> ${result.tag}`);
}
