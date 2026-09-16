import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { installGitHooks } from "./install-git-hooks.mjs";
import { git } from "./ops-git-lib.mjs";
import { projectRoot } from "./lib.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com"];

function makeRepo({ copy = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "factory-hooks-"));
  const repo = path.join(base, "repo");
  const configDir = path.join(base, "config");
  fs.mkdirSync(path.join(repo, "scripts", "git-hooks"), { recursive: true });
  fs.mkdirSync(configDir);
  fs.copyFileSync(path.join(projectRoot(), "scripts", "git-hooks", "pre-commit"), path.join(repo, "scripts", "git-hooks", "pre-commit"));
  fs.copyFileSync(path.join(projectRoot(), "scripts", "gate-protected.json"), path.join(repo, "scripts", "gate-protected.json"));
  git(repo, ["init", "--quiet", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "package.json"), "{}");
  git(repo, ["add", "-A"]);
  git(repo, [...IDENTITY, "commit", "--quiet", "-m", "init"]);
  const install = installGitHooks({ repoDir: repo, copy });
  return { repo, configDir, install };
}

function commit(repo, file, env) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), `${Date.now()}\n`);
  git(repo, ["add", "-A", "-f", "--", file]);
  const result = spawnSync("git", [...IDENTITY, "commit", "--quiet", "-m", `touch ${file}`], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, FACTORY_ROLE: "", FACTORY_CONFIG_DIR: "", ...env }
  });
  if (result.status !== 0) git(repo, ["reset", "--quiet", "--", file]);
  return { ok: result.status === 0, stderr: result.stderr };
}

test("hooks:install 设置 core.hooksPath 并给 hook 可执行位", () => {
  const { repo, install } = makeRepo();
  assert.equal(install.mode, "hooksPath");
  assert.equal(git(repo, ["config", "core.hooksPath"]).stdout, "scripts/git-hooks");
  assert.ok(fs.statSync(path.join(repo, "scripts", "git-hooks", "pre-commit")).mode & 0o111);
  const copied = makeRepo({ copy: true });
  assert.equal(copied.install.mode, "copy");
  assert.ok(fs.existsSync(path.join(copied.repo, ".git", "hooks", "pre-commit")));
});

test("操作员角色（环境变量）改代码目录被拒并提示 request；ops/ 与 requests/ 放行", () => {
  const { repo, configDir } = makeRepo();
  const env = { FACTORY_ROLE: "operator", FACTORY_CONFIG_DIR: configDir };
  for (const file of ["scripts/x.mjs", "components/a/component.json", "docs/note.md", ".agents/skills/x/SKILL.md", "package.json", "deploy/windows/x.sh"]) {
    const result = commit(repo, file, env);
    assert.equal(result.ok, false, file);
    assert.match(result.stderr, /拒绝提交/);
    assert.match(result.stderr, /npm run request/);
  }
  assert.equal(commit(repo, "ops/factory-01/demo/qa/acceptance.json", env).ok, true);
  assert.equal(commit(repo, "requests/2026-09-11-x.md", env).ok, true);
});

test("修复分支 client/<host>-fix-*：代码目录放行，gate-protected.json 列出的门禁文件仍拒绝并提示 request", () => {
  const { repo, configDir } = makeRepo();
  const env = { FACTORY_ROLE: "operator", FACTORY_CONFIG_DIR: configDir };
  git(repo, ["checkout", "--quiet", "-b", "client/factory-01-fix-caption-drift"]);
  for (const file of ["scripts/captions-from-aroll.mjs", "components/a/component.json", "themes/x/theme.json", "docs/note.md", "package.json", "deploy/windows/x.sh", "scripts/timeline/x.mjs", "ops/factory-01/demo/qa/acceptance.json"]) {
    const result = commit(repo, file, env);
    assert.equal(result.ok, true, `${file}\n${result.stderr}`);
  }
  for (const file of [
    "scripts/qa-alignment.mjs", "scripts/qa-cuts.mjs", "scripts/qa-final.mjs", "scripts/approve-cut-qa.mjs", "scripts/approve-final-qa.mjs",
    "scripts/governance-lib.mjs", "scripts/review-feedback-lib.mjs", "scripts/deliver.mjs", "scripts/deliver-variants.mjs",
    "scripts/review-independent.mjs", "scripts/acceptance.mjs", "aroll-treat/registry.json", "scripts/git-hooks/post-merge",
    "scripts/gate-protected.json", "scripts/install-git-hooks.mjs", "release/public-manifest.json", ".github/workflows/ci.yml"
  ]) {
    const result = commit(repo, file, env);
    assert.equal(result.ok, false, file);
    assert.match(result.stderr, /门禁与审批相关文件只能走 npm run request/);
  }
  // commit() 会把清单文件本身写成时间戳，恢复后再测不误伤
  git(repo, ["checkout", "--quiet", "--", "scripts/gate-protected.json"]);
  // 前缀相似但不在清单里的文件不误伤
  assert.equal(commit(repo, "scripts/qa-cuts-helper.mjs", env).ok, true);
  assert.equal(commit(repo, "scripts/deliver-lib.mjs", env).ok, true);
  // 缺清单文件：拒绝，不猜
  fs.rmSync(path.join(repo, "scripts", "gate-protected.json"));
  assert.match(commit(repo, "scripts/other.mjs", env).stderr, /缺少 .*gate-protected\.json/);
  // 非修复分支（client/<host> 报告分支也一样）仍按运行 tag 规则拒绝
  git(repo, ["checkout", "--quiet", "-b", "client/factory-01"]);
  git(repo, ["checkout", "--quiet", "--", "scripts/gate-protected.json"]);
  const onReport = commit(repo, "scripts/z.mjs", env);
  assert.equal(onReport.ok, false);
  assert.match(onReport.stderr, /npm run propose/);
});

test("角色从 env 文件读取；developer 或未设置时放行", () => {
  const { repo, configDir } = makeRepo();
  fs.writeFileSync(path.join(configDir, "env"), "DEEPSEEK_API_KEY=x\nFACTORY_ROLE=operator\n");
  assert.equal(commit(repo, "scripts/from-env.mjs", { FACTORY_CONFIG_DIR: configDir }).ok, false);
  fs.writeFileSync(path.join(configDir, "env"), "FACTORY_ROLE=developer\n");
  assert.equal(commit(repo, "scripts/from-env.mjs", { FACTORY_CONFIG_DIR: configDir }).ok, true);
  const { repo: bare, configDir: emptyConfig } = makeRepo();
  assert.equal(commit(bare, "scripts/free.mjs", { FACTORY_CONFIG_DIR: emptyConfig }).ok, true);
});
