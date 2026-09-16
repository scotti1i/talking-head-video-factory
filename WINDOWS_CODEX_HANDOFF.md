# Windows Codex 接管上下文

> 给目标 Windows 电脑上的 Codex：先完整阅读本文件、`AGENTS.md`、`docs/windows-harness-pilot.md`、`deploy/windows/README.md`，再执行任何命令。目标是闭环完成部署，不是只给用户一份教程。
>
> **已有 v1 部署的机器不要从头走本文件**：直接按 `deploy/windows/CODEX-REINSTALL.md` 的 Gate 0–5 重装 + 迁移旧 job。本文件只覆盖全新机器的首次部署；两者共用的日常规则在 `.agents/skills/factory-auto-edit/SKILL.md` 的「硬规则」段。

## 0. v2 的三条边界（先记住）

- 代码只从 git tag 来：`npm run update -- --check` 看新版，`npm run update` 升级，失败自动回滚。没有便携 zip / tar 包，不要找 `dist/` 或 `deploy:bundle`。
- 你是操作员：`FACTORY_ROLE=operator` 下 git hook 拒绝任何触及 `scripts/ components/ themes/ template-packs/ console/ deploy/ skills/ docs/ .agents/ package*.json` 的 commit。管线做不到 → `npm run request -- --title --detail`，然后停下等发布。
- job 不在仓库里：`npm run migrate` 后它们在 `FACTORY_JOBS_ROOT`（默认 `~/factory-jobs`），`--job jobs/<slug>` 自动解析到那里。回流给我们的只有文本证据（`npm run report:push` / `npm run acceptance`），永远不推媒体。

## 1. 最终目标

在一台工厂 Windows 电脑上部署本地自动剪辑工作站：用户把口播素材、确定文稿、B-roll 和参考图拖入 `Inbox`；DeepSeek Harness 调用仓库的 `factory-auto-edit` Skill 完成素材导入、词级转录、语义 fine cut、模板包装、R0 审片、时间码反馈修订和最终交付。

```text
D:\AutoEdit\Inbox\<project>
  -> WSL2 repository + local caches
  -> DeepSeek Harness orchestration
  -> R0 review + editor feedback + R1...
  -> D:\AutoEdit\Outbox\<project>
```

内容边界：这是有确定文稿的工厂外贸口播。只剪气口、口误、失败重拍、重复表达和无信息等待；不重新组织叙事，不改写观点，不删除文稿独有信息。

## 2. 已知目标机状态

- CPU：Intel i5-12400。
- 内存：当前 16GB，可试点；生产建议 32GB。
- 系统：最初为 Windows 10 22H2；正式验收要求升级 Windows 11。
- GPU：计划/应已安装 RTX 5060；必须安装最新 Windows NVIDIA 生产或 Studio 驱动。
- DeepSeek 模型通过 API Key 调用，不在本地运行大模型。GPU 主要服务 Whisper 和 FFmpeg NVENC。

不要在 WSL 内安装 Linux NVIDIA 显卡驱动。Windows 驱动会把 CUDA 运行时映射进 WSL2。CUDA Toolkit 可装在 WSL 中，用来编译 GPU Whisper。

## 3. 架构决策

- Windows：显卡驱动、浏览器、`D:\AutoEdit\Inbox`、`D:\AutoEdit\Outbox`。
- WSL2 Ubuntu：Git 仓库、Node、FFmpeg、Whisper、缓存、job、DeepSeek Harness。
- 仓库必须位于 WSL Linux 文件系统，例如 `/home/factory/talking-head-video-factory`；禁止在 `/mnt/c` 或 `/mnt/d` 直接渲染。
- Inbox 只读。必须通过 `npm run intake` 做哈希清单和复制，不得直接编辑源素材。
- API Key 只放 `~/.config/talking-head-factory/env`，权限 `600`；禁止写进 git、Markdown、日志、job 或 Outbox。
- 第一次只交付 MP4 + SRT + EDL + QA。剪映工程是后续适配器，不是当前内容真相。

## 4. 用户仅需完成的动作

把以下人工动作一次列给用户；其余由你执行：

1. 确认 Windows 11、RTX 5060 和 NVIDIA 驱动已经安装；允许必要的重启。
2. 管理员权限运行 PowerShell。
3. WSL 首次启动时创建 Linux 用户，建议用户名 `factory`。
4. 在安全输入提示中亲自粘贴 DeepSeek API Key；不要让用户把 key 发进对话。
5. 首条 R0 生成后，由专业剪辑完整播放并给至少 3 条带时间码反馈。

## 5. 自主执行顺序

### Gate A：只读预检

先执行并记录结果：

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber
Get-CimInstance Win32_ComputerSystem | Select-Object @{N='RAM_GB';E={[math]::Round($_.TotalPhysicalMemory/1GB,1)}}
Get-Volume | Sort-Object DriveLetter
nvidia-smi
wsl --list --verbose
```

要求：Windows build >= 22000、RAM >= 16GB、目标 SSD 可用空间 >= 50GB、Windows 和 WSL 内都能看到 NVIDIA GPU。任何一项不满足，修复后再继续，不要绕过门禁。

### Gate B：Windows 宿主

以管理员 PowerShell 在仓库中运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Install-Host.ps1
```

若脚本返回 3010，重启后继续。不要自动执行永久 ExecutionPolicy 修改。

### Gate C：克隆到 WSL 与基础安装

若仓库尚未克隆，克隆 Scott 指定的发布 tag（不是 main）：

```powershell
wsl -d Ubuntu -- bash -lc "cd ~ && git clone --branch vX.Y.Z https://github.com/scotti1i/talking-head-video-factory.git"
```

然后：

```powershell
wsl -d Ubuntu -- bash -lc "cd ~/talking-head-video-factory && bash deploy/windows/Bootstrap-Ubuntu.sh"
```

脚本会安装 Node 22、FFmpeg、fonttools、whisper.cpp、模型和 npm 依赖，写入 `FACTORY_ROLE=operator`，安装 git hooks，结尾打印 `GATE 2 PASS`。若没有 `nvcc`，它先安装 CPU Whisper；随后按 NVIDIA 官方 WSL-Ubuntu CUDA Toolkit 指引安装 Toolkit，再重跑脚本升级为 GPU Whisper。不要安装 Linux display driver。

之后升级只用 `npm run update`；旧机器上的 job 用 `npm run migrate -- --from <旧仓库路径>` 迁到 `FACTORY_JOBS_ROOT`（完整步骤见 `deploy/windows/CODEX-REINSTALL.md`）。

### Gate D：Key、生产 doctor 与 Harness

让用户在 WSL 的安全提示中输入 key：

```powershell
wsl -d Ubuntu -- bash -lc "cd ~/talking-head-video-factory && bash deploy/windows/Set-DeepSeekKey.sh"
```

随后从 Windows PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd \\wsl.localhost\Ubuntu\home\factory\talking-head-video-factory\deploy\windows
.\Check-Host.ps1
.\Invoke-Doctor.ps1 -RequireHdr
.\Start-Harness.ps1
```

Harness 首次下载依赖可能需要 8-20 分钟；`Start-Harness.ps1` 已给 Node 预留 6GB heap。后续通常几十秒启动。浏览器访问 `http://localhost:3080`，Workspace 选择 `/home/factory/talking-head-video-factory`。

### Gate E：真实 smoke test

创建：

```text
D:\AutoEdit\Inbox\smoke-001\
  originals\          # 30-60 秒真实口播
  original-script.txt # 对应确定文稿
  broll\              # 可为空
  references\         # 可为空
```

在 Harness 中要求：

```text
使用 factory-auto-edit skill。读取 /mnt/d/AutoEdit/Inbox/smoke-001。
这是工厂外贸口播，保留原文叙事，只做语义 fine cut、剪气口、口误和失败重拍。
先 dry-run，展示导入计划、语言、fine-cut preset 和 template pack；确认后执行 R0。
不得修改 Inbox，不得覆盖任何审片版本。
```

必须验证：

- Inbox 文件哈希前后不变。
- 词级转录只生成一次并进入哈希缓存。
- EDL 不重排句序、不丢文稿独有信息。
- 每个切点存在电影条/波形证据和批准记录。
- 至少能选择 `factory-clean`、`factory-proof` 两个公共模板包；公司自有参考素材可按 `docs/theme-replication.md` 新增模板。
- R0 MP4 可完整播放，随后吸收至少 3 条时间码反馈生成 R1，R0 哈希保持不变。
- Outbox 至少包含 MP4、SRT、干净 A-roll、EDL、反馈记录、QA 和素材清单。
- 切点批准与最终批准由用户在 `npm run approve:open` 打开的网页上亲自点「通过」（v2.0.3 起，不再用终端命令）；`npm run status` 里「批量盖章」必须为绿。
- 收尾 `npm run acceptance -- --job jobs/smoke-001` 通过，且 GitHub 出现 `client/<主机名>` 分支的 `ops(...)` commit。

## 6. 性能与故障判断

- 第一次慢通常是 npm/Harness 下载和原生依赖安装，不等于日常启动速度。
- 16GB 时避免同时运行多个渲染、浏览器大量标签和其他剪辑软件；生产升级 32GB。
- `ffmpeg -encoders` 有 `h264_nvenc` 不代表真的可用；必须通过 `npm run doctor:deployment -- --production --require-hdr` 的实际 3 帧编码。
- 若 WSL 看不到 GPU，先检查 Windows 驱动、`wsl --update` 和重启；禁止在 WSL 装 Linux NVIDIA 驱动碰运气。
- 若 Harness 启动慢，保留终端并观察下载/编译，不要重复启动多个实例。
- 渲染、转录和批量任务前可用空间必须 >= 50GiB。

## 7. 完成定义

只有以下全部成立才能向用户报告“部署完成”：

1. 宿主检查、生产 doctor、HDR/NVENC smoke 全部通过。
2. DeepSeek Harness 能加载项目 Skill。
3. 真实素材完成 R0 -> 专业反馈 -> R1。
4. 最终 MP4 已完整播放，Outbox 交付齐全。
5. API Key、客户素材、转录和 job 没有进入 git。
6. 报告实际耗时：转录倍速、A-roll 渲染、包装渲染、总自动化耗时、RAM/GPU 峰值。

## 8. 禁止事项

- 不绕过 Windows 11、50GiB、NVENC、HDR 或最终播放门禁。
- 不直接在 Windows 挂载盘上运行仓库。
- 不用静音检测直接决定 EDL。
- 不重复 Whisper。
- 不覆盖 R0/R1 历史版本。
- 不从二压平台文件继续制作横屏长视频。
- 不把素材、key、模型或本地配置提交到 GitHub。
- 不在未经专业剪辑明确分类的情况下，把单条客户反馈升级为全局模板规则。
- 不在客户机器上改代码目录，不绕过 pre-commit hook；不以 `review/` 或 `renders/` 里的视频当输入；不在 approval 里替人写 `by: human`。
