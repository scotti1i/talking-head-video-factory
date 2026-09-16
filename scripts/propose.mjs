// ============================================================
// propose —— 客户机自己修代码，走 PR，不直接进主干
// 为什么：spec v2.0.3 §F——运行系统永远是「tag」或「tag + 一个开着的 PR」。
// 操作员（Codex）能定位到具体行的 bug，在 client/<host>-fix-<slug> 分支上改，
// 本地测试全绿才能提交；PR 开到 v2 由我们审；门禁文件仍由 hook 拒绝。
// 用法：
//   npm run propose -- --title "..."      从当前 tag 建分支并记录状态
//   npm run propose -- --submit [--what ..] [--why ..] [--reproduce ..]
//                                        跑测试 → commit → push → 开 PR（或更新已有 PR）
//   npm run propose -- --status           查 PR 状态
//   npm run propose -- --abandon          补丁存档到 ops/<host>/rejected/<branch>/，回到 tag
// 状态文件：~/.config/talking-head-factory/propose/<branch>.json {pr, url, base, tag}
// token：FACTORY_GITHUB_TOKEN，否则 git credential fill（credential.helper store）；
//        需要 Contents RW + Pull requests RW。token 永不打印、永不写进仓库。
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { factoryConfigDir, parseArgs, projectRoot, readJson, sanitizeSlug, writeJson } from "./lib.mjs";
import { clientHost, describeHead, fixBranch, git, hasRemote, isFixBranch } from "./ops-git-lib.mjs";
import { pushRejected } from "./report-push.mjs";

export const PR_BASE = "v2";
export const GITHUB_API = "https://api.github.com";

// ---------- 状态文件 ----------
export function proposeDir(configDir = factoryConfigDir()) {
  return path.join(configDir, "propose");
}

export function stateFile(branch, configDir = factoryConfigDir()) {
  return path.join(proposeDir(configDir), `${String(branch).replaceAll("/", "__")}.json`);
}

export function readProposeState(branch, configDir = factoryConfigDir()) {
  const file = stateFile(branch, configDir);
  return fs.existsSync(file) ? readJson(file) : null;
}

export function writeProposeState(state, configDir = factoryConfigDir()) {
  const file = stateFile(state.branch, configDir);
  writeJson(file, state);
  return file;
}

// ---------- GitHub ----------
export function parseRemote(url) {
  const text = String(url || "").trim();
  const match = text.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) throw new Error(`origin 不是 GitHub 仓库，无法开 PR: ${text || "(空)"}`);
  return { owner: match[1], repo: match[2] };
}

export function credentialFill(host = "github.com") {
  const result = spawnSync("git", ["credential", "fill"], {
    input: `protocol=https\nhost=${host}\n\n`,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" }
  });
  if (result.status !== 0) return null;
  const line = String(result.stdout || "").split("\n").find((item) => item.startsWith("password="));
  return line ? line.slice("password=".length) : null;
}

export function githubToken({ env = process.env, fill = credentialFill } = {}) {
  const fromEnv = String(env.FACTORY_GITHUB_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const stored = fill();
  if (stored) return stored;
  throw new Error("找不到 GitHub token：设置 FACTORY_GITHUB_TOKEN，或先 git push 一次让 credential.helper store 记住（token 需 Contents RW + Pull requests RW）");
}

async function githubRequest(method, url, { token, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "talking-head-video-factory-propose",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = data?.errors?.map((item) => item.message || JSON.stringify(item)).join("; ") || data?.message || text;
    throw new Error(`GitHub ${method} ${url} → ${response.status}: ${detail}`);
  }
  return data;
}

// 默认 provider：真的走网络；测试注入假的
export function githubProvider({ token } = {}) {
  const auth = () => token || githubToken();
  return {
    async createPr({ owner, repo, title, head, base, body }) {
      const data = await githubRequest("POST", `${GITHUB_API}/repos/${owner}/${repo}/pulls`, { token: auth(), body: { title, head, base, body } });
      return { number: data.number, url: data.html_url, state: data.state, merged: Boolean(data.merged) };
    },
    async getPr({ owner, repo, number }) {
      const data = await githubRequest("GET", `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`, { token: auth() });
      return { number: data.number, url: data.html_url, state: data.state, merged: Boolean(data.merged || data.merged_at) };
    }
  };
}

// ---------- 测试套件 ----------
export function listTestFiles(root) {
  const globs = [["scripts"], ["scripts", "timeline"], ["console"]];
  const files = [];
  for (const parts of globs) {
    const dir = path.join(root, ...parts);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".test.mjs")) files.push(path.relative(root, path.join(dir, name)).replaceAll(path.sep, "/"));
    }
  }
  return files.sort();
}

export function testCommands(root) {
  const pkg = readJson(path.join(root, "package.json"));
  const commands = [{ label: "node --test（全部套件）", command: process.execPath, args: ["--test", ...listTestFiles(root)] }];
  for (const script of ["test:timing", "test:governance"]) {
    if (pkg.scripts?.[script]) commands.push({ label: `npm run ${script}`, command: "npm", args: ["run", script] });
  }
  return commands;
}

export function defaultRunTests(root) {
  const results = [];
  for (const item of testCommands(root)) {
    const result = spawnSync(item.command, item.args, { cwd: root, encoding: "utf8", stdio: "pipe" });
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    const summary = output.split("\n").filter((line) => /^ℹ (tests|pass|fail) /.test(line.trim())).map((line) => line.trim()).join(" · ");
    results.push({ label: item.label, exitCode: result.status ?? 1, summary: summary || output.trim().split("\n").at(-1) || "", output });
  }
  return results;
}

// ---------- 四个动作 ----------
export function createProposal({ title, repoDir = projectRoot(), configDir = factoryConfigDir(), host = clientHost(), now = new Date() }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("必须提供 --title \"<一句话说清修什么>\"");
  const head = describeHead(repoDir);
  if (head.branch && isFixBranch(head.branch)) {
    throw new Error(`已在修复分支 ${head.branch}；先 npm run propose -- --submit 提交，或 --abandon 放弃后再建新的`);
  }
  // 运行状态必须是 tag 的 detached HEAD；停在分支上（哪怕分支头恰好打了 tag）不是客户机的正常状态
  if (!head.tag || head.branch) {
    throw new Error(`当前不在发布 tag 上（${head.branch || "detached"}@${head.sha}）；先 npm run update 回到 tag 再 propose`);
  }
  const slug = sanitizeSlug(cleanTitle).slice(0, 40).replace(/[.-]+$/, "") || "fix";
  const branch = fixBranch(slug, host);
  if (git(repoDir, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`], { allowFail: true }).ok) {
    throw new Error(`分支 ${branch} 已存在；换个标题，或 git branch -D ${branch} 后重试`);
  }
  git(repoDir, ["checkout", "--quiet", "-b", branch, head.tag]);
  const state = { schemaVersion: 1, branch, title: cleanTitle, host, base: PR_BASE, tag: head.tag, createdAt: now.toISOString(), pr: null, url: null };
  const file = writeProposeState(state, configDir);
  return { branch, tag: head.tag, state, file };
}

export function renderPrBody({ title, what, why, reproduce, tests, host, tag }) {
  const lines = [
    `## ${title}`,
    "",
    "### 改了什么 / 为什么",
    "",
    what?.trim() || "（未填写 --what）",
    "",
    why?.trim() || "（未填写 --why）",
    "",
    "### 复现命令",
    "",
    "```bash",
    reproduce?.trim() || "（未填写 --reproduce）",
    "```",
    "",
    "### 本地测试",
    "",
    ...tests.map((item) => `- ${item.exitCode === 0 ? "PASS" : "FAIL"} · ${item.label} · ${item.summary}`),
    "",
    `- 主机：${host}`,
    `- 基于 tag：${tag}`,
    "",
    "> 由 npm run propose 生成；客户机修复分支，合并前请按 v2 规则复核门禁未被触碰。"
  ];
  return lines.join("\n");
}

export async function submitProposal({
  repoDir = projectRoot(), configDir = factoryConfigDir(), host = clientHost(),
  what, why, reproduce, runTests = defaultRunTests, github = null, push = true, now = new Date()
}) {
  const head = describeHead(repoDir);
  if (!head.branch || !isFixBranch(head.branch)) throw new Error(`当前不在修复分支（${head.branch || head.tag || head.sha}）；先 npm run propose -- --title \"...\"`);
  const state = readProposeState(head.branch, configDir);
  if (!state) throw new Error(`缺少状态文件 ${stateFile(head.branch, configDir)}；这个分支不是 propose 建的`);

  const tests = runTests(repoDir);
  const failed = tests.filter((item) => item.exitCode !== 0);
  if (failed.length) {
    const detail = failed.map((item) => `  - ${item.label}: exit ${item.exitCode} · ${item.summary}`).join("\n");
    throw new Error(`本地测试未全绿，拒绝提交：\n${detail}\n修到全绿再 --submit；测不过的改动不进 PR。`);
  }

  git(repoDir, ["add", "-A"]);
  const hasStaged = !git(repoDir, ["diff", "--cached", "--quiet"], { allowFail: true }).ok;
  if (hasStaged) git(repoDir, ["commit", "--quiet", "-m", state.title]);
  const ahead = Number(git(repoDir, ["rev-list", "--count", `${state.tag}..HEAD`]).stdout || 0);
  if (!ahead) throw new Error(`分支 ${head.branch} 相对 ${state.tag} 没有任何提交，没东西可提`);

  let pushed = false;
  if (push) {
    if (!hasRemote(repoDir)) throw new Error("仓库没有 origin 远端，无法 push / 开 PR");
    git(repoDir, ["push", "--quiet", "-u", "origin", `${head.branch}:${head.branch}`]);
    pushed = true;
  }

  const { owner, repo } = parseRemote(git(repoDir, ["remote", "get-url", "origin"]).stdout);
  const body = renderPrBody({ title: state.title, what, why, reproduce, tests, host, tag: state.tag });
  const provider = github || githubProvider();
  let pr;
  if (state.pr) {
    pr = await provider.getPr({ owner, repo, number: state.pr });
  } else {
    pr = await provider.createPr({ owner, repo, title: state.title, head: head.branch, base: state.base || PR_BASE, body });
  }
  const next = { ...state, pr: pr.number, url: pr.url, submittedAt: now.toISOString(), what: what || state.what || null, why: why || state.why || null, reproduce: reproduce || state.reproduce || null };
  writeProposeState(next, configDir);
  return { branch: head.branch, pr: pr.number, url: pr.url, created: !state.pr, pushed, ahead, tests, state: next };
}

export async function proposalStatus({ repoDir = projectRoot(), configDir = factoryConfigDir(), github = null, branch = null }) {
  const current = branch || describeHead(repoDir).branch;
  if (!current || !isFixBranch(current)) throw new Error("当前不在修复分支；--status 只查 propose 建的分支");
  const state = readProposeState(current, configDir);
  if (!state) throw new Error(`缺少状态文件 ${stateFile(current, configDir)}`);
  if (!state.pr) return { branch: current, state, pr: null, status: "none" };
  const { owner, repo } = parseRemote(git(repoDir, ["remote", "get-url", "origin"]).stdout);
  const pr = await (github || githubProvider()).getPr({ owner, repo, number: state.pr });
  return { branch: current, state, pr, status: prStatusLabel(pr) };
}

export function prStatusLabel(pr) {
  if (!pr) return "none";
  if (pr.merged) return "merged";
  return pr.state === "open" ? "open" : "closed";
}

// 补丁存档：<tag>..HEAD 的 format-patch 目录（未提交改动先 WIP commit，不丢）
export function archivePatches({ repoDir, branch, tag, outDir = null }) {
  const dirty = git(repoDir, ["status", "--porcelain"]).stdout;
  if (dirty) {
    git(repoDir, ["add", "-A"]);
    git(repoDir, ["commit", "--quiet", "-m", `WIP（propose 存档自动提交）`]);
  }
  const dir = outDir || fs.mkdtempSync(path.join(os.tmpdir(), "factory-patch-"));
  fs.mkdirSync(dir, { recursive: true });
  const base = tag || git(repoDir, ["describe", "--tags", "--abbrev=0", "HEAD"]).stdout;
  git(repoDir, ["format-patch", "--quiet", "-o", dir, `${base}..HEAD`]);
  const patches = fs.readdirSync(dir).filter((name) => name.endsWith(".patch")).sort();
  fs.writeFileSync(path.join(dir, "README.md"), [
    `# ${branch}`,
    "",
    `- 基于 tag：${base}`,
    `- HEAD：${git(repoDir, ["rev-parse", "HEAD"]).stdout}`,
    `- 补丁数：${patches.length}`,
    `- 存档时间：${new Date().toISOString()}`,
    "",
    "用 `git am *.patch` 可在主仓库重放。",
    ""
  ].join("\n"));
  return { dir, base, patches };
}

export function abandonProposal({ repoDir = projectRoot(), configDir = factoryConfigDir(), host = clientHost(), push = true, now = new Date() }) {
  const head = describeHead(repoDir);
  if (!head.branch || !isFixBranch(head.branch)) throw new Error("当前不在修复分支，没有可放弃的 propose");
  const state = readProposeState(head.branch, configDir) || { branch: head.branch, tag: null };
  const archive = archivePatches({ repoDir, branch: head.branch, tag: state.tag });
  let pushed = null;
  if (archive.patches.length) pushed = pushRejected({ dir: archive.dir, branchName: head.branch, repoDir, host, push, now });
  git(repoDir, ["checkout", "--quiet", archive.base]);
  git(repoDir, ["branch", "-D", "--quiet", head.branch]);
  writeProposeState({ ...state, abandonedAt: now.toISOString(), archived: archive.patches, pushed: Boolean(pushed?.pushed) }, configDir);
  return { branch: head.branch, tag: archive.base, patches: archive.patches, pushed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const push = !args["no-push"];
  if (args.submit) {
    const result = await submitProposal({ what: args.what, why: args.why, reproduce: args.reproduce, push });
    for (const item of result.tests) console.log(`  PASS · ${item.label} · ${item.summary}`);
    console.log(`${result.created ? "PR 已开" : "PR 已更新"}: ${result.url}（#${result.pr}，${result.ahead} 个提交，分支 ${result.branch}）`);
    console.log("下一步：把这个链接给用户；我们一个工作日内审。之后每次 npm run update 会按 PR 状态自动处理（合并→升级到新 tag；关闭→补丁存档并回到 tag）。");
  } else if (args.status) {
    const result = await proposalStatus({});
    console.log(result.pr ? `PR #${result.pr.number} · ${result.status} · ${result.pr.url}` : `分支 ${result.branch} 还没开 PR（npm run propose -- --submit）`);
  } else if (args.abandon) {
    const result = abandonProposal({ push });
    console.log(`已放弃 ${result.branch}：${result.patches.length} 个补丁${result.pushed ? `存档到 ${result.pushed.branch}（${result.pushed.pushed ? "已 push" : result.pushed.warning || "未 push"}）` : "（无提交，未存档）"}，已回到 ${result.tag}`);
  } else {
    const result = createProposal({ title: args.title });
    console.log(`已从 ${result.tag} 建修复分支 ${result.branch}`);
    console.log("下一步：改代码（门禁文件除外，见 scripts/gate-protected.json）→ 本地跑通 → npm run propose -- --submit --what \"...\" --why \"...\" --reproduce \"...\"");
  }
}
