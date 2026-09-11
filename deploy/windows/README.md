# Windows 部署

目标结构：Windows 只提供收件箱、出件箱和浏览器；仓库、缓存、Whisper 与 HyperFrames 运行在 WSL2 的 Linux 文件系统中。不要把仓库放在 `/mnt/c` 或 `/mnt/d` 上直接渲染。

## 一次性准备

1. 升级 Windows 11，安装 RTX 显卡对应的最新 NVIDIA 生产或 Studio Driver。
2. 管理员 PowerShell 运行 `Install-Host.ps1`；若安装 WSL 后要求重启，重启并打开 Ubuntu 创建 Linux 用户。
3. 把仓库克隆到 WSL 的 `~/talking-head-video-factory`，运行 `Bootstrap-Ubuntu.sh`。
4. 运行 `Set-DeepSeekKey.sh`，在安全提示中输入 API Key。密钥不得进入仓库。
5. `Bootstrap-Ubuntu.sh` 会创建本机 `factory.config.psd1`；若用户名或数据盘不是默认值，再按实际情况修改。

16GB 试点机应将 `wslconfig-16gb.example` 复制为 `%USERPROFILE%\.wslconfig`，再运行 `wsl --shutdown`；这会给 WSL 分配 12GB 内存和 8GB swap。32GB 以上生产机应按实际并发单独配置，不要照搬 16GB 模板。

完整的 Codex 自动接管说明见仓库根目录 `WINDOWS_CODEX_HANDOFF.md`。

Harness 版本固定在配置里的 `DshVersion`，升级时先在隔离分支跑回归，不让目标机每次启动自动漂移到最新版。

## 验收顺序

```powershell
.\Check-Host.ps1
.\Invoke-Doctor.ps1 -RequireHdr
.\Start-Harness.ps1
```

桌面快捷启动可指向 `Launch-Harness.ps1`。它会复用已运行的服务；服务未启动时在后台拉起 WSL Harness，等待 `http://127.0.0.1:3080` 就绪后自动打开浏览器，并将日志写入 `D:\AutoEdit\Install\logs\`。

Harness 从仓库根目录启动后会自动发现 `.agents/skills/factory-auto-edit/SKILL.md`。首次使用 30-60 秒 SDR 真实样片；随后补跑一条 HDR 色彩回归，不允许跳过 `-RequireHdr` 检查。

## 日常文件夹

```text
D:\AutoEdit\
├── Inbox\<项目名>\
│   ├── originals\
│   ├── original-script.txt
│   ├── broll\
│   └── references\
└── Outbox\<项目名>\
```

Windows 文件只作为收件箱和出件箱。`npm run intake` 会校验哈希并把素材复制到 WSL job；后续处理不会修改 Inbox。

官方入口与配置说明：

- <https://www.deepseek.com/harness/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md>
