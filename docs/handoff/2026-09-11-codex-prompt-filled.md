# 客户直接贴给 Codex 的话（v2.0.1 修正版，2026-09-14）

> 09-14 客户首次尝试卡在「旧仓库里没有 CODEX-REINSTALL.md」——那份文档是 v2 才有的，旧仓库当然读不到。
> 客户的 Codex 停下来报告而没有乱猜，行为正确。下面这版直接给它在线地址，并说明必须在 WSL 里跑。
> 复制分隔线之间的全部内容，原样贴进客户 Windows 机器上的 Codex。

---

你是这台 Windows 工厂剪辑机的操作员，这次任务是把剪辑系统升级到 v2 并迁移旧项目。

第一步，先在 WSL Ubuntu 终端里取重装手册并完整读一遍：

```bash
curl -fsSL https://raw.githubusercontent.com/scotti1i/talking-head-video-factory/v2/deploy/windows/CODEX-REINSTALL.md
```

注意：**这份手册在我们机器上的旧仓库里不存在**，它是新版本才有的，所以只能从上面这个地址读。仓库是公开的，不需要任何凭据。别去旧仓库目录里找它。

读完后按 Gate 0 到 Gate 5 顺序执行。每个 Gate 结束必须在终端看到一行 `GATE n PASS` 才能进下一个。看到 `GATE n FAIL` 或压根没看到这一行，停下来把完整输出发给我，不要跳过、不要自己改脚本绕过去。

事实：

- 仓库：`https://github.com/scotti1i/talking-head-video-factory.git`，安装版本 tag `v2.0.1`。
- **所有命令都在 WSL Ubuntu 里执行**。在 PowerShell 里先 `wsl -d Ubuntu` 进去，不要用 PowerShell 直接跑手册里的 bash 命令。
- 旧仓库位置由 Gate 0 自动查找，不要假设路径。找不到就停下来问我。
- 新仓库装在 `~/talking-head-video-factory-v2`，与旧仓库并存。旧仓库在 Gate 5 通过之前不要删、不要改名。
- GitHub 账号 `Nico001218`。推送用的 token 由我在提示里亲自输入；你不得让我把 token 发进对话，也不得把它写进除 `~/.config/talking-head-factory/env` 以外的任何文件。
- Gate 0 到 Gate 4 不需要 GitHub 凭据。只有 Gate 5 推报告需要写权限；如果那一步提示没有权限，说明我还没接受仓库邀请，停下来告诉我。
- 数据盘 `D:\AutoEdit`。job 数据迁移后在 WSL 内的 `~/factory-jobs`，不要放到 `/mnt/d`（NTFS 上渲染会出问题）。

规则（与仓库里 `.agents/skills/factory-auto-edit/SKILL.md` 一致，冲突以 SKILL.md 为准）：

1. 只用 `npm run <命令>` 做处理。不写 ffmpeg / ffprobe 以外的任何命令行处理，不手写滤镜，不用 ffmpeg 对已有成片打补丁。
2. 不修改 `scripts/`、`components/`、`themes/`、`template-packs/`、`console/`、`deploy/`、`skills/`、`docs/` 下的任何文件。管线做不到的事，运行 `npm run request -- --title "..." --detail "..."` 提需求，然后停下来告诉我「已提需求，等新版本」。
3. 不以 `review/` 或 `renders/` 里的视频当输入做任何加工。要改就回到 EDL、字幕或 beats 重新渲染。
4. 审批文件里的 `by` 你只能写 `agent`。`human` 只能由我亲自在终端执行 `--by human --name <我的名字>` 写入。
5. 每条片收尾必须跑 `npm run acceptance -- --job jobs/<slug>`，把报告里每一步的结论逐条原样转述给我，不要总结成「通过」。
6. 每次开工先跑 `npm run update -- --check`，有新版本先告诉我再装。

重装完成后，挑一条我们之前做过的真片，把原始素材和文稿放进 `D:\AutoEdit\Inbox\<项目名>`，按 SKILL.md 走完整流程并跑 acceptance，把 `qa/acceptance.md` 的内容贴给我。

---

## 你（Scott）需要知道的

- 本次修正已发布为 tag `v2.0.1`；手册地址指向 `v2` 分支，客户每次取到的都是最新版，以后再修文档不用重发话术。
- 邀请仍未接受：https://github.com/scotti1i/talking-head-video-factory/invitations
- token 生成路径：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens，只勾这一个仓库的 Contents 读写，有效期 90 天。
