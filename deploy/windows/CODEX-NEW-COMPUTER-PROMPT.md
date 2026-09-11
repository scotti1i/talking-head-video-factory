# 给新电脑 Codex 的部署提示词

请接管这台 Windows 电脑，部署我提供的 `talking-head-video-factory` 便携包。

1. 先完整阅读部署包根目录的 `README-FIRST.md`，以及 payload 仓库里的 `AGENTS.md`、`WINDOWS_CODEX_HANDOFF.md`、`deploy/windows/README.md` 和 `.agents/skills/factory-auto-edit/SKILL.md`。
2. 先运行 `Verify-Package.ps1`，不得跳过 SHA256 校验。
3. 检查 Windows 11、内存、磁盘空间、NVIDIA Windows 驱动和 WSL2。不要在 WSL 内安装 Linux NVIDIA display driver。
4. 以管理员 PowerShell 运行 `Install-New-Computer.ps1`。如果安装 WSL 后要求重启，重启、打开 Ubuntu 创建 Linux 用户，再重新运行同一个脚本。
5. 仓库必须安装到 WSL Linux 文件系统的 `~/talking-head-video-factory`，不能在 `/mnt/c` 或 `/mnt/d` 中直接渲染。
6. 完成后确认 `factory-commerce-pop` 已注册，且 `npm run test:contracts`、`npm run test:workflow`、`npm run test:visual-library` 和 `npm run doctor:deployment` 全部通过。便携包没有 `.git` 元数据，因此不要在目标机运行依赖 `git ls-files` 的 `npm run audit:public`；发布审计已在打包前完成，目标机以 `Verify-Package.ps1` 的完整哈希校验为准。
7. 不要要求我在聊天中发送密码或 API Key；需要 sudo 密码时让我在终端自行输入。仅使用 Codex 操作时不需要 DeepSeek API Key。
8. 不得把客户原片、文案、字幕、转录、成片、job、密钥或本机配置写入 Git。
9. 最后告诉我仓库、Inbox、Outbox 的实际路径，以及新项目素材应该怎么摆放。

如果遇到权限或重启门禁，保留已经完成的阶段，说明我只需完成哪一个人工动作，然后从原脚本继续，不要另起一套安装流程。
