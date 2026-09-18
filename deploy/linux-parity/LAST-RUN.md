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
