# 新电脑一键部署说明

本包包含当前 `talking-head-video-factory` 运行仓库、Windows/WSL 部署脚本、`factory-auto-edit` Skill、`factory-commerce-pop 2.0.0`、所需组件、字体和通用模板音效。

本包不包含客户原片、文案、字幕、转录缓存、job、历史成片、交付视频、API Key、机器配置、Whisper 模型或 `node_modules`。Whisper 模型和 npm 依赖会在目标电脑安装时下载。

## 使用前

- 正式环境要求 Windows 11、至少 16GB 内存（建议 32GB）、NVIDIA Windows 驱动和至少 50GB 可用空间。
- 安装过程需要联网，首次可能较久；安装 WSL 后可能需要重启一次。
- 如果还没安装 Codex，可以先完成本脚本部署，之后安装并登录 Codex，再打开 WSL 中的仓库。

## 一键安装

1. 把整个 ZIP 复制到新电脑并完整解压，不能直接在压缩包预览窗口运行。
2. 右键 PowerShell，选择“以管理员身份运行”。
3. 进入解压目录并运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Verify-Package.ps1
.\Install-New-Computer.ps1
```

如果脚本安装了 WSL 并要求重启：重启 Windows，打开一次 Ubuntu、创建 Linux 用户，然后回到同一解压目录再次运行 `Install-New-Computer.ps1`。

安装器会把仓库放到 Ubuntu 的 `~/talking-head-video-factory`，并创建：

```text
D:\AutoEdit\Inbox
D:\AutoEdit\Outbox
```

## 使用 Codex

安装并登录 Codex 后，打开：

```text
\\wsl.localhost\Ubuntu\home\<你的Ubuntu用户名>\talking-head-video-factory
```

然后把 `CODEX-NEW-COMPUTER-PROMPT.md` 的内容粘贴给 Codex，让它完成复核和首条 smoke test。

## 新视频素材结构

```text
D:\AutoEdit\Inbox\<项目名>\
├── originals\
├── original-script.txt
├── broll\
└── references\
```

原片只放 Inbox；系统会通过哈希导入复制到 WSL，不会直接修改 Inbox。

本包是无 `.git` 元数据的离线工作快照。目标机以 `Verify-Package.ps1` 校验完整性；如需继续通过 Git 更新版本，请另行连接正式代码仓库。
