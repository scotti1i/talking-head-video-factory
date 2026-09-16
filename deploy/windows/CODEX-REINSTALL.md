# 客户机器重装 + 迁移（v2）

> 给客户 Windows 机器上的 Codex：这是操作员手册，不是开发手册。六个 gate 按顺序执行，每个 gate 结束必须在终端看到一行 `GATE n PASS`；看到 `GATE n FAIL` 或没看到这行，停下把完整输出发给用户，不得跳过、不得自己修脚本。出处：`docs/v2-design-spec.md` §6。

## 这份文档从哪来（先读这段）

**旧仓库里没有这个文件**，它是 v2 才有的。在旧仓库目录里读它一定失败，那是预期的，不是环境坏了，也不需要修。始终从下面这个地址取最新版（仓库公开，不需要任何凭据）：

```bash
curl -fsSL https://raw.githubusercontent.com/scotti1i/talking-head-video-factory/v2/deploy/windows/CODEX-REINSTALL.md
```

## 前提

- 已完成 v1 部署（WSL2 Ubuntu、Node 22、whisper.cpp、DeepSeek Key）。旧仓库位置不假设，Gate 0 自己找。
- Scott 已给出本次发布的 tag（形如 `v2.0.0`）和仓库访问凭据（只能推 `client/*` 分支的 token）。**凭据由用户亲自输入，不经过对话。**
- **所有命令都在 WSL Ubuntu 终端执行**（Windows PowerShell 里 `wsl -d Ubuntu` 进去）。不要在 PowerShell 里跑本文的 bash 命令。

## Gate 0 · 定位并备份旧仓库（含旧 job）

先找到旧仓库真实位置：历史上同时存在过 WSL 家目录和 `/mnt/d` 两份，不要假设路径。

```bash
mkdir -p "$HOME/.config/talking-head-factory"
OLD_REPO="$(find "$HOME" /mnt/d -maxdepth 5 -type f -path '*/scripts/render-rough-cut-edl.mjs' 2>/dev/null \
  | head -1 | sed 's#/scripts/render-rough-cut-edl.mjs##')"
echo "找到旧仓库: ${OLD_REPO:-（没找到）}"
```

没找到就停下来问用户旧仓库在哪，拿到后 `OLD_REPO="<用户给的路径>"`，不要自己猜。确认路径后备份：

```bash
echo "$OLD_REPO" > "$HOME/.config/talking-head-factory/old-repo-path"
DATE="$(date +%Y%m%d)"
mkdir -p "/mnt/d/AutoEdit/Backup/$DATE"
tar -czf "/mnt/d/AutoEdit/Backup/$DATE/factory-v1.tar.gz" \
  -C "$(dirname "$OLD_REPO")" "$(basename "$OLD_REPO")" \
  && ls -lh "/mnt/d/AutoEdit/Backup/$DATE/" \
  && echo "GATE 0 PASS" || echo "GATE 0 FAIL"
```

预期最后一行：`GATE 0 PASS`。备份包含 `jobs/`，会很大；盘位不够先清 `D:\AutoEdit\Backup` 里更早的日期，不清 job。

## Gate 1 · 克隆 v2 tag 到 WSL

新仓库固定装在 WSL 家目录，与旧仓库并存（旧仓库原地不动，Gate 3 还要从它迁 job）。

```bash
TAG="v2.0.1"   # 换成 Scott 给的 tag
NEW_REPO="$HOME/talking-head-video-factory-v2"
git clone --branch "$TAG" https://github.com/scotti1i/talking-head-video-factory.git "$NEW_REPO" \
  && cd "$NEW_REPO" \
  && git config credential.helper store \
  && git describe --tags --exact-match HEAD \
  && echo "GATE 1 PASS" || echo "GATE 1 FAIL"
```

- `git describe` 必须打印出 `$TAG`；仓库停在 tag 的 detached HEAD 上是**正常状态**，不要 `git checkout main`。
- 第一次 `npm run report:push` 时 git 会要凭据：让用户亲自粘贴 deploy token（用户名填 `x-access-token`），`credential.helper store` 会记住。
- 旧仓库原地保留不改名，Gate 3 从它迁移 job；确认 Gate 5 通过后才可删除。
- 之后所有 gate 都在 `$NEW_REPO` 里执行。新开终端时先 `NEW_REPO="$HOME/talking-head-video-factory-v2"; cd "$NEW_REPO"`。

## Gate 2 · bootstrap（含 hook 安装与操作员角色）

```bash
cd "$HOME/talking-head-video-factory-v2"
bash deploy/windows/Bootstrap-Ubuntu.sh
```

脚本结尾自行打印 `GATE 2 PASS`（失败打印 `GATE 2 FAIL`）。它做了四件治理动作：

- `~/.config/talking-head-factory/env` 写入 `FACTORY_ROLE=operator`；
- `git config core.hooksPath scripts/git-hooks`，之后任何触及 `scripts/ components/ themes/ template-packs/ console/ deploy/ skills/ docs/ .agents/ package*.json` 的 commit 都会被拒绝，提示 `npm run request`（要改代码只能走 `npm run propose`，见「之后的日常」）；
- 跑一次 `npm run doctor:deployment`；
- 通过 `powershell.exe` 注册 Windows 计划任务 `TalkingHeadFactoryHeartbeat`：每天 03:30 `wsl.exe -d Ubuntu -- bash <仓库>/deploy/windows/Run-Heartbeat.sh`，做体检、把事件和心跳回流到 `client/<主机名>` 分支、没有命令在跑时自动升级到最新 tag。日志在 `~/.config/talking-head-factory/logs/heartbeat.log`。

计划任务注册不影响 gate 结果，但要单独验证——在 **Windows PowerShell** 里：

```powershell
schtasks /Query /TN TalkingHeadFactoryHeartbeat
```

看到一行状态为 `Ready` 即可。若脚本输出 `WARN: 心跳计划任务注册失败`，把 WARN 那行里的命令原样在 PowerShell 执行一次，再查询；仍失败就停下把输出发给用户。手动触发一次验证链路：`schtasks /Run /TN TalkingHeadFactoryHeartbeat`，一分钟后在 WSL 里 `tail -n 20 ~/.config/talking-head-factory/logs/heartbeat.log` 应看到 `[heartbeat]` 行。

DeepSeek Key 如需重设：`bash deploy/windows/Set-DeepSeekKey.sh`（只改 key 一行，不动其他配置）。

## Gate 3 · 迁移旧 job

```bash
cd "$HOME/talking-head-video-factory-v2"
node scripts/gate.mjs 3 -- npm run migrate -- --from "$(cat "$HOME/.config/talking-head-factory/old-repo-path")"
```

- 先看一遍表格：每个 job 一行，`copied` 为正常；`conflict` / `error` 会让 gate FAIL，把表格发给用户。
- 默认目标 `~/factory-jobs`（或已配置的 `FACTORY_JOBS_ROOT`）；脚本会把 `FACTORY_JOBS_ROOT=` 写进 env 文件。之后所有 `--job jobs/<slug>` 都解析到那里，仓库目录里不再有 `jobs/`。
- 每个迁移的 job 的 `project.json` 多了 `legacy` 字段，列出它为什么不算 v2 产物（字幕不是从成片转录来的、没有人签审批等）。`data/` 一个字节都没改。
- 想先看不写：加 `--dry-run`。重复执行安全：已迁移的会显示 `skip-identical`。

预期最后一行：`GATE 3 PASS`。

## Gate 4 · 生产 doctor + 回归样片

```bash
cd "$HOME/talking-head-video-factory-v2"
node scripts/gate.mjs 4 -- bash -c "npm run doctor:deployment -- --production --require-hdr && npm run smoke"
```

- doctor 检查 NVENC 实际编码、HDR 滤镜、Whisper 模型、字体、盘位 ≥ 50GiB、`DEEPSEEK_API_KEY`。
- `smoke` 生成无隐私样片并通过 HyperFrames lint / validate / inspect；job 落在 `FACTORY_JOBS_ROOT/smoke`。

预期最后一行：`GATE 4 PASS`。任一失败先修环境（驱动、盘位、Key），不改脚本。

## Gate 5 · 用一条真片跑 acceptance 并 push

选一条已迁移或新导入的真实 job（`<slug>`），按 `.agents/skills/factory-auto-edit/SKILL.md` 完成到 R0 之后：

```bash
cd "$HOME/talking-head-video-factory-v2"
node scripts/gate.mjs 5 -- npm run acceptance -- --job jobs/<slug>
```

- acceptance 顺序跑 status / qa:alignment / captions:voice-qa / dialogue:qa / audio:qa / review:independent，每步退出码和末 40 行写进 `qa/acceptance.{json,md}`，然后自动 `report:push` 到 `client/<主机名>` 分支。
- 报告里任何一步 `FAIL`，gate 就 FAIL；把 `qa/acceptance.md` 原样转述给用户，**不要总结成「通过」**。
- 若提示「命令不存在，请 npm run update」，先 `npm run update -- --check` 看有没有新 tag。

预期最后一行：`GATE 5 PASS`，且 GitHub 上出现 `client/<主机名>` 分支的新 commit（`ops(<host>): <slug> <时间>`）。

## 之后的日常

| 场景 | 命令 |
|---|---|
| 每次开工 | `npm run update -- --check`（退出码 3 = 有新版，先告诉用户） |
| 升级 | `npm run update`（自动 checkout 新 tag → npm ci → doctor → smoke，失败回滚） |
| 管线做不到 | `npm run request -- --title "..." --detail "..." --job jobs/<slug>`，然后停下等发布 |
| 每条片收尾 | `npm run acceptance -- --job jobs/<slug>` |
| 单独回流证据 | `npm run report:push -- --job jobs/<slug>` |

## 禁止

- 跳过任何 gate，或在没看到 `GATE n PASS` 时进入下一步。
- 在客户机器上编辑 `scripts/` 等代码目录（hook 会拒绝；绕过 hook 视为事故）。
- 把 `review/` 或 `renders/` 里的视频当输入再加工。
- 在 approval 文件里写 `by: human`——只有用户亲自看完后由用户在终端执行 `--by human --name <人名>`。
