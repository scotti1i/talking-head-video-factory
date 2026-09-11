// ============================================================
// hooks:install —— 让仓库自带的 git hooks 生效
// 为什么：hook 文件跟着 tag 发布（scripts/git-hooks/），用 core.hooksPath
// 指过去，update 后自动拿到新版本，不需要每次复制进 .git/hooks。
// 用法：node scripts/install-git-hooks.mjs [--repo <path>] [--copy]
//   --copy：不改 core.hooksPath，直接复制到 .git/hooks（给不想动 config 的环境）
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot } from "./lib.mjs";
import { git } from "./ops-git-lib.mjs";

export const HOOKS_DIR = "scripts/git-hooks";

export function installGitHooks({ repoDir = projectRoot(), copy = false } = {}) {
  const hooksDir = path.join(repoDir, HOOKS_DIR);
  if (!fs.existsSync(hooksDir)) throw new Error(`缺少 ${hooksDir}`);
  const inside = git(repoDir, ["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  if (!inside.ok) return { installed: false, reason: "不是 git 工作区" };
  const hooks = fs.readdirSync(hooksDir).filter((name) => !name.startsWith("."));
  for (const name of hooks) fs.chmodSync(path.join(hooksDir, name), 0o755);
  if (copy) {
    const gitDir = git(repoDir, ["rev-parse", "--git-path", "hooks"]).stdout;
    const target = path.resolve(repoDir, gitDir);
    fs.mkdirSync(target, { recursive: true });
    for (const name of hooks) fs.copyFileSync(path.join(hooksDir, name), path.join(target, name));
    for (const name of hooks) fs.chmodSync(path.join(target, name), 0o755);
    return { installed: true, mode: "copy", target, hooks };
  }
  git(repoDir, ["config", "core.hooksPath", HOOKS_DIR]);
  return { installed: true, mode: "hooksPath", target: HOOKS_DIR, hooks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const result = installGitHooks({ repoDir: args.repo ? path.resolve(String(args.repo)) : projectRoot(), copy: Boolean(args.copy) });
  if (!result.installed) console.log(`跳过安装 hooks：${result.reason}`);
  else console.log(`git hooks 已安装（${result.mode} → ${result.target}）: ${result.hooks.join(", ")}`);
}
