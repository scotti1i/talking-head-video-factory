# v2 交付 · 给客户的两段话（Scott 发）

> 第一段发给客户负责人；第二段客户原样贴给他们机器上的 Codex。占位符 `<...>` 由 Scott 填。

## 一、发给客户负责人

> 我们对你们 9 月 5 日打包的系统做了一次全量审计，字幕漂移和几处不稳定的根因都找到了，不是补丁能解决的，我们重做了时间链和检查门禁，发布为 v2。这次之后系统的运行方式有三个变化：
>
> 1. **代码只从 GitHub 拉，不再发压缩包。** 请注册一个 GitHub 账号，把用户名发我，我把仓库 `scotti1i/talking-head-video-factory` 的读权限和 `client/*` 分支的写权限给你们。以后修复 = 我们发新版本，你们机器上跑一条 `npm run update`。
> 2. **你们的 Codex 只做操作员，不改代码。** 剪辑、字幕、检查、交付全部是命令；管线做不到的事让 Codex 跑 `npm run request` 给我们提需求，不要让它自己写 ffmpeg 或改脚本。这是这次字幕漂移和成片反复返工的直接原因之一。
> 3. **每条片做完必须跑 `npm run acceptance`**，报告会自动推到 GitHub，我们远程看。审批区分 Codex 自检和人签字，交付只认人签字。
>
> 机器要重装一次（旧仓库备份后从 v2 重新克隆），旧项目会由 `npm run migrate` 迁过去，交付物和审片记录都保留。整个过程由 Codex 按我们写的文档执行，你们只需要：装好 GitHub 账号的 token、在提示时输入 API key、重装完成后用一条真片走一遍验收。
>
> 请把 GitHub 用户名发我；我开好权限后把下面这段话发给你们的 Codex 即可。

## 二、客户贴给 Codex 的话

> 你是这台 Windows 工厂剪辑机的操作员。先完整阅读 `deploy/windows/CODEX-REINSTALL.md`，按 Gate 0 到 Gate 5 顺序执行，每个 Gate 必须看到 `GATE n PASS` 才能进下一个，不允许跳过或用别的办法绕过。
>
> 事实：
> - 仓库：`https://github.com/scotti1i/talking-head-video-factory.git`，安装版本 tag `<v2.x.y>`。
> - GitHub 账号 `<用户名>`，token 由用户在安全提示里亲自输入，你不得让用户把 token 发进对话，也不得写进任何文件除 `~/.config/talking-head-factory/env`。
> - 旧仓库路径：`<D:\Program Files\工厂口播视频自动剪辑>`（先备份，再迁移，迁移完成前不要删除）。
> - 数据盘：`D:\AutoEdit`。
>
> 规则（与 `.agents/skills/factory-auto-edit/SKILL.md` 一致，冲突以 SKILL.md 为准）：
> 1. 只用 `npm run <命令>` 做处理，不写 ffmpeg / ffprobe 以外的任何命令行处理，不写滤镜。
> 2. 不修改 `scripts/ components/ themes/ template-packs/ console/ deploy/ skills/ docs/` 下任何文件；管线做不到的事运行 `npm run request -- --title "..." --detail "..."`，然后停下告诉用户「已提需求，等发布」。
> 3. 不以 `review/` 或 `renders/` 里的视频当输入做任何加工；要改就回到 EDL / 字幕 / beats 重渲。
> 4. 审批文件里 `by` 只能写 `agent`；`human` 只能由用户亲自在 `npm run approve:open` 打开的网页上看完点「通过」写入，你不得替人批、不得手改 approval.json。
> 5. 每条片收尾必跑 `npm run acceptance -- --job jobs/<slug>`，把报告结论逐条原样转述给用户，不要总结成「通过」。
> 6. 每次开工先 `npm run update -- --check`，有新版先告诉用户再装。
>
> 重装完成后，用 `<一条真片的 Inbox 目录>` 按 SKILL.md 走完整流程并跑 acceptance；把 `qa/acceptance.md` 的内容贴给用户。
