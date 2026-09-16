// ============================================================
// approve:open —— 起 console（若未起）并把浏览器开到该 job 的审批页
// 为什么：客户零终端，Codex 在 R0 生成后自动调它，人只要看片、点通过。
// 用法：npm run approve:open -- --job jobs/<slug>
// 打开浏览器的命令按环境挑第一个存在的：wslview（WSL）→ explorer.exe（WSL 无 wslu）
//   → xdg-open（Linux 桌面）→ open（macOS）。都没有就把 URL 打印出来让人自己贴。
// ============================================================
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { consolePort } from "../console/approve.mjs";
import { commandExists, jobsRoot, parseArgs, projectRoot, resolveJob } from "./lib.mjs";

export const OPENERS = Object.freeze(["wslview", "explorer.exe", "xdg-open", "open"]);

export function pickOpener({ commandExists: exists = commandExists } = {}) {
  return OPENERS.find((name) => exists(name)) || null;
}

export function approveUrl(port, slug) {
  return `http://127.0.0.1:${port}/approve?job=${encodeURIComponent(slug)}`;
}

// job 参数 → 相对 jobsRoot 的 slug；jobs 根目录之外的路径直接拒绝
export function jobSlug(jobArg, { root = jobsRoot() } = {}) {
  const dir = resolveJob(jobArg);
  const rel = path.relative(path.resolve(root), dir);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`job 不在 jobs 根目录内：${dir}`);
  return rel.split(path.sep).join("/");
}

export async function isListening(port, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnConsole() {
  const child = spawn(process.execPath, [path.join(projectRoot(), "console", "server.mjs")], { cwd: projectRoot(), detached: true, stdio: "ignore" });
  child.unref();
}

// 没在听就后台拉起一个，最多等 waitMs；探测与拉起都可注入（测试不开端口）
export async function ensureConsole({ port, probe = isListening, start = spawnConsole, waitMs = 15_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (await probe(port)) return { started: false };
  start();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(300);
    if (await probe(port)) return { started: true };
  }
  throw new Error(`console 在 ${waitMs / 1000}s 内没有在 127.0.0.1:${port} 起来；手动运行 npm run console 看报错`);
}

export function openUrl(url, { opener = pickOpener() } = {}) {
  if (!opener) return { opened: false, url };
  const child = spawn(opener, [url], { detached: true, stdio: "ignore" });
  child.unref();
  return { opened: true, opener, url };
}

async function main() {
  const args = parseArgs();
  if (!args.job) throw new Error("用法：npm run approve:open -- --job jobs/<slug>");
  const port = consolePort();
  const url = approveUrl(port, jobSlug(args.job));
  const { started } = await ensureConsole({ port });
  if (started) console.log(`console 已在后台启动：http://127.0.0.1:${port}`);
  const result = openUrl(url);
  console.log(result.opened ? `已用 ${result.opener} 打开审批页：${url}` : `没找到能开浏览器的命令，请手动打开：${url}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error.message); process.exit(1); });
