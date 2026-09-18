# Windows 学员安装（WSL2）

这条剪辑线在 Linux 上跑。Windows 电脑通过 WSL2 装一个 Ubuntu，仓库、Claude Code / Codex、whisper、Remotion 全在 Ubuntu 里；Windows 只负责放原片和取成片。

**电脑要求**：Windows 11、内存 16GB 以上（8GB 也能装，渲染时容易被杀）、系统盘剩 30GB 以上。**不需要 NVIDIA 显卡**——没显卡只是转录慢一些。

> 状态（2026-09-18）：这套脚本从内部部署版精简而来，Linux 部分已在对齐容器里验证；**Windows 真机尚未从零跑过一遍**。第一个跑通的学员请把 `SETUP PASS` 之前的输出截图发群里。

## 三步

### 第 1 步：管理员 PowerShell 跑 Install-Host.ps1（装 WSL2 + Ubuntu）

开始菜单搜「PowerShell」→ 右键「以管理员身份运行」，逐行粘贴：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
Invoke-WebRequest https://raw.githubusercontent.com/scotti1i/talking-head-video-factory/main/deploy/windows/Install-Host.ps1 -OutFile $env:TEMP\Install-Host.ps1
& $env:TEMP\Install-Host.ps1
```

第一次跑会装 WSL 并提示重启。**重启电脑**。

### 第 2 步：重启后打开 Ubuntu，建 Linux 用户

开始菜单打开「Ubuntu」，按提示输入用户名（小写英文）和密码（输入时不显示，正常）。
建好后再回到管理员 PowerShell 跑一次第 1 步的最后一行 `& $env:TEMP\Install-Host.ps1`，看到「Windows 侧准备完成」即可。

### 第 3 步：在 Ubuntu 里跑 Bootstrap-Ubuntu.sh

在 Ubuntu 窗口粘贴（右键就是粘贴）：

```bash
git clone https://github.com/scotti1i/talking-head-video-factory.git ~/talking-head-video-factory
bash ~/talking-head-video-factory/deploy/windows/Bootstrap-Ubuntu.sh
```

会问一次 sudo 密码（就是刚建的 Linux 密码）。全程 15-40 分钟，主要在编 whisper 和下 1.6GB 模型。结尾看到 **`SETUP PASS`** 就装好了；看到 `SETUP FAIL` 就把最后一屏截图发群里，修好后重跑同一条命令，装好的步骤会跳过。

国内下载模型慢：先 `export FACTORY_HF_ENDPOINT=https://hf-mirror.com` 再跑第二条命令。
想先把环境装通、模型稍后再下：`FACTORY_SKIP_WHISPER_MODEL=1 bash ~/talking-head-video-factory/deploy/windows/Bootstrap-Ubuntu.sh`，之后不带这个变量重跑一次即可补模型（其余步骤会跳过）。

## 装好之后

- **Claude Code / Codex 装在 Ubuntu 里**，不是 Windows 里。在 Ubuntu 窗口按官方文档装（[Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) / [Codex CLI](https://github.com/openai/codex)，都是一条 npm 全局安装命令），然后把 skill 复制过去：
  ```bash
  mkdir -p ~/.agents/skills && cp -R ~/talking-head-video-factory/skills/talkinghead-edit ~/.agents/skills/
  ```
- **原片放 WSL 家目录下**（例如 `~/videos/`），不要留在 Windows 盘的 `/mnt/c/...` 直接剪——慢 10 倍，硬链接也会失败。从 Windows 拷进去：资源管理器地址栏输入 `\\wsl$\Ubuntu\home\<你的用户名>`，把文件拖进 `videos` 文件夹。
- **成片在 `~/Downloads`**。Windows 侧取：资源管理器地址栏输入 `\\wsl$\Ubuntu\home\<你的用户名>\Downloads`。
- 然后在 Ubuntu 的仓库目录里 `cd ~/talking-head-video-factory && claude`（或 `codex`），对它说：
  > 用 xiaolin 模板把 `~/videos/xxx.mp4` 剪成抖音竖屏。

## 自查

任何时候想看环境对不对：

```powershell
# Windows 侧（普通 PowerShell 即可；第一行放行脚本执行策略，只对当前窗口生效）
Set-ExecutionPolicy -Scope Process Bypass -Force
& "\\wsl$\Ubuntu\home\<你的用户名>\talking-head-video-factory\deploy\windows\Check-Host.ps1"
```

```bash
# Ubuntu 侧
cd ~/talking-head-video-factory && npm run doctor
```

`doctor` 会打印平台（WSL2）、CJK 字体、whisper-cli 与模型是否就位，缺什么会给出装法。

## 内存 16GB 的机器

把 [`wslconfig-16gb.example`](wslconfig-16gb.example) 复制为 `C:\Users\<Windows 用户名>\.wslconfig`，然后 PowerShell 跑 `wsl --shutdown`，重新打开 Ubuntu 生效。

## 文件说明

| 文件 | 作用 |
|---|---|
| `Install-Host.ps1` | 管理员跑：查 Win11 / 内存 / 磁盘，装 WSL2 + Ubuntu；NVIDIA 只提示不强求 |
| `Check-Host.ps1` | 普通用户跑：只查 Windows 版本、WSL 状态、内存 |
| `Bootstrap-Ubuntu.sh` | Ubuntu 里跑：apt 依赖、Node 22、仓库、hyperframes 浏览器、Remotion 依赖、whisper.cpp、模型、doctor、npm test |
| `wslconfig-16gb.example` | 16GB 机器的 WSL 内存配置 |
