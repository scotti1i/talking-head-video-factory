# Linux 对齐容器：上次运行记录

- 日期：2026-09-18（第 4 轮，镜像 `thvf-narrative-linux-parity`，Ubuntu 24.04 amd64 在 Apple 芯片 Docker Desktop 下经 Rosetta 模拟）
- 分支：release/narrative-stage
- 容器环境：x86_64 · Node v22.23.2 · ffmpeg 6.1.1-3ubuntu5（apt）· fc-list :lang=zh 30 条（fonts-noto-cjk）

## 通过项

| 步骤 | 结果 | 备注 |
|---|---|---|
| `npm run doctor` | 信息项 | 正确打印平台 `linux x64`、CJK 字体（15 个中文字族，Noto）、whisper-cli 与模型缺失并给出装法（容器不含 whisper，按设计） |
| `npm test` | PASS | 8 组全过；`visual-recipe-registry.test.mjs` 的 3 条全库测试在没有上游 `~/.codex/skills/video-shotcraft` 时按 skip 处理 |
| `npm run smoke` | PASS | hyperframes lint / validate / inspect 20 采样 0 问题；生成 HTML 系统字体命中 0；CJK 子集化走 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` |
| 合成 A-roll | PASS | `jobs/stage-catalog-20260903` 没有 A-roll，用 ffmpeg lavfi 纯色 186s 顶位（只验渲染链，不验画面） |

## 失败项与原因

| 步骤 | 结果 | 原因 |
|---|---|---|
| `narrative-stage-plan.mjs --job jobs/stage-catalog-20260903`（CLI） | FAIL（信息项，不计入） | 型录 job 的结构门禁「连续 79s 无视觉休息，上限 70s」——Mac 上同样不过，是型录内容不是 Linux 差异 |
| `prepareInkPressWorkspace()` | FAIL | `拒绝覆盖没有工厂标记的目录 renders/work-shotcraft/ink-press`：上一步 CLI 在工作区尚未准备时就把 `NarrativePlan.ts` 写进 `src/factory/`，留下无标记半目录。**容器跑完后已修**（shotcraft-direct-port.mjs：无标记且无 package.json 的残留目录自动清理；A-roll 缺席时 `public/factory/aroll.mp4` 不计缺文件），Mac 上复现并验证通过（`prepared reused=true ok=true`），**容器内未重跑**（硬截止） |
| `stage-stills.mjs --job jobs/stage-catalog-20260903 --out qa/stills-linux` | 未跑到 | 被上一步挡住；容器里没有出过静帧 |

## 已知环境现象

- 第 3 轮在 doctor 的 `ffmpeg -version` 处卡死：容器内 `ps` 看到 `[ffmpeg] <defunct>` 僵尸、node `spawnSync` 不返回、CPU 0%。Rosetta 模拟下的偶发，kill 后第 4 轮同一步秒过。不是仓库 bug；真 x86 机器 / WSL 不会经过 Rosetta。
- 第 1–2 轮暴露并已修的 Linux 差异：`build-beats-composition.mjs` / `visual-preview-generate.mjs` 写死 Hiragino 字体路径（smoke 炸）；`shotcraft-direct-port.mjs` 硬读未导出的内部参照 job（叙事舞台一帧渲不出）；`ContinuousRelationScene.tsx` 在模块加载期查空路由抛错拖死 NarrativeStage。

## Mac 侧对照（同一批代码）

- `npm test` 8 组全过；`npm run smoke` 过。
- `test:visual-vendor`（不在 `npm test` 内）3 失败，基线（改动前）同样 3 失败，未动。
- 叙事舞台静帧：型录 job 在 Mac 上 24 个取点中 20 张出图（4 个场景引用仓库里没有的 logo / 证据图 / B-roll，Remotion 加载 404 直接取消整批），拼板见课程仓库 `cohort2/week-07-ai-video-editing/ppt/deck/img/catalog/contact-sheet.jpg`。

## 下次要做

1. 重跑 `deploy/linux-parity/run.sh`，确认 prepare + stage-stills 在容器里出图（预计 6 张，每张十几秒）。
2. 型录 job 补齐 `logos/youtube.svg`、`logos/tiktok.svg`、`evidence/shopify-agentic-commerce.png`、`broll/employee-desk.mp4` 或改成占位，否则 --auto 取点必挂。

---

# Windows 学员安装层：Bootstrap-Ubuntu.sh 容器验证（2026-09-18）

- 环境：`docker run --platform linux/amd64 ubuntu:24.04`（Apple 芯片 Rosetta 模拟），模拟全新机：先装 `sudo git curl ca-certificates`，建非 root 用户 `student` + sudo 免密，以 student 跑脚本；无 Windows 真机，`FACTORY_SKIP_WSL_CHECK=1`（跳过 /proc/version 的 WSL 门槛）+ `FACTORY_SKIP_WHISPER_MODEL=1`（跳过 1.6GB 模型）。仓库按脚本原样从 GitHub main 克隆。
- 网络：宿主 TUN 的 fake-IP 直连 `archive.ubuntu.com` 中途掉线（第 1 轮 apt 拉 .deb 全挂 `198.18.1.3:80 Unable to connect`，与 run.sh 注释里同一现象）；第 2 轮起 apt / curl / git / npm 全走 `http://host.docker.internal:1082`。

## 逐步耗时（第 2 轮，全新环境）

| 步骤 | 耗时 | 结果 |
|---|---|---|
| apt 依赖（ffmpeg / Noto CJK / fonttools / cmake / Chromium 共享库） | 95s | PASS |
| nvm + Node 22 | 18s | PASS（v22.23.2） |
| git clone | 7s | PASS |
| npm install + `hyperframes browser ensure` | 29s | PASS（chrome-headless-shell 131 下载 107MB） |
| Remotion 工作区依赖（`npm ci` 187 包 + `remotion browser ensure` 92MB） | 24s | PASS，落在 `renders/work-shotcraft/.ink-press-node_modules-keep` |
| whisper.cpp（tarball → cmake CPU 版 → `~/.local/bin/whisper-cli`） | 47s | PASS（cmake 打印两条 `fatal: not a git repository` 是取版本号，无害） |
| whisper 模型 | 跳过 | `FACTORY_SKIP_WHISPER_MODEL=1` |
| `npm run doctor` | 1s | 第 2 轮 FAIL：跳过模型后 doctor 报一条 MISSING 退出 1 → 脚本改为该场景降级为 WARN |
| `npm test` | 2s | PASS（8 组 76 条全过） |
| 全程 | 约 3.7 分钟（不含模型；真机无 Rosetta 应更快，编 whisper 与下模型是大头） | **SETUP PASS**（第 3 轮） |

- 第 3 轮复跑（幂等验证）：全部步骤跳过，38s 到 `SETUP PASS`。
- doctor 输出：`PLATFORM linux x64`、ffmpeg 6.1.1、whisper-cli OK、pyftsubset OK、15 个中文字族、HyperFrames 0.5.6。

## 这次修的

- `Bootstrap-Ubuntu.sh`：apt 加 `-o Acquire::Retries=5`（网络抖动一个包失败整步挂）；新增 `FACTORY_SKIP_WHISPER_MODEL` / `FACTORY_SKIP_WSL_CHECK`；跳过模型时 doctor 的 MISSING 降级为提示。
- `Install-Host.ps1` / `Check-Host.ps1`：加 UTF-8 BOM（Windows PowerShell 5.1 读无 BOM 的 UTF-8 中文乱码）；`wsl.exe` 输出统一经 `Invoke-Wsl` 去 NUL / 去 `\r` / 丢空行再比较（原来只在 `--list --quiet` 一处处理，`--status` / `--list --verbose` 直接打印会串 NUL），`wsl --update` 失败降级为警告。
- 新增 `.gitattributes`：`*.sh` / `*.mjs` 钉 LF，`*.ps1` 钉 CRLF（学员 Windows git 默认 autocrlf=true 会把 .sh 转成 CRLF，bash 报 `$'\r': command not found`）。
- 未验证项：`.ps1` 本机无 pwsh，只做了人工审（PS 5.1 语法：无 `??` / 三元 / `&&`）；Windows 真机从零仍未跑过。
