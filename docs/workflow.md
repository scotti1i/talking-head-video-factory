# 口播视频工程化流程

## 治理层（v2，先看这一段）

| 场景 | 命令 | 说明 |
|---|---|---|
| 每次开工 | `npm run update -- --check` | 只比对 tag，不装；退出码 3 = 有新版 |
| 升级 | `npm run update [-- --tag vX.Y.Z]` | checkout tag → `npm ci` → doctor → smoke，失败回滚上一个 tag；`~/.config/talking-head-factory/update.log` |
| 旧 job 迁移 | `npm run migrate -- [--from <旧仓库>] [--to <jobs-root>] [--dry-run] [--move]` | 迁到 `FACTORY_JOBS_ROOT`，写 `project.json.legacy`，不动 `data/`，幂等 |
| 管线做不到 | `npm run request -- --title "..." --detail "..." [--job jobs/<slug>]` | 写 `requests/<日期>-<slug>.md`，commit + push 到 `client/<主机名>` |
| 回流证据 | `npm run report:push -- --job jobs/<slug> [--no-push]` | 只推 `project.json/md`、`data/ qa/ review/ delivery/ requests/` 文本，进 `ops/<主机名>/<slug>/` |
| 收尾验收 | `npm run acceptance -- --job jobs/<slug> [--no-push]` | 顺序跑 status / qa:alignment / captions:voice-qa / dialogue:qa / audio:qa / review:independent，写 `qa/acceptance.{json,md}` 后 `report:push` |
| 装 hook | `npm run hooks:install` | `core.hooksPath=scripts/git-hooks`；`FACTORY_ROLE=operator` 时拒绝改代码目录 |
| 网页审批 | `npm run approve:open -- --job jobs/<slug>` | 起 console（未起时）并开浏览器到 `/approve?job=<slug>`：看切点图 / 播完审片视频 → 填姓名 → 「通过」写 `by: human` 的 approval；「有问题，退回」写 `review/Rn/feedback-inbox.md`。`/approve` 不带 job = 待审列表 |

- job 根目录：`FACTORY_JOBS_ROOT`（环境变量或 `~/.config/talking-head-factory/env`）；未设置时仍是 `<仓库>/jobs`。`--job jobs/<slug>` 两种情况都能解析。
- 审批人：`qa:cuts:approve` / `qa:final:approve` 接受 `--by human|agent --name <人名>`（默认 agent），写 `by` / `name` / `reviewedAt`。`deliver`、`deliver:variants`、`review init` 只接受 `by: human`；`FACTORY_ALLOW_AGENT_APPROVAL=1` 仅供 CI / smoke，会大声警告。
- `npm run status` 新增「批量盖章」gate：job 内任意两份 approval 相隔 ≤ 2 秒即标红（Agent 一把梭的指纹）。
- `review init` 还要求 `data/editor-signals.json` 里每条 `severity: high` 都已在 `data/resolved-signals.json` 登记（或已被 EDL 剪掉）。
- 硬拒：`build:beats` 的 `sourceVideo`、`intake --source` 路径含 `review/` 或 `renders/` 直接报错；审片成片不是事实源。

## 0. 定义目标

每条视频开工前先写清：

- 标题候选
- 平台：默认抖音竖屏
- 目标时长
- 观众是谁
- 主论点是什么
- 哪些段落需要章节 / 解释层
- 内容 profile：普通口播 / 录屏实操 / 商单展示 / 工厂外贸
- 发布 targets：抖音 / YouTube / Shorts；不要把 profile 当平台
- 如果有书面脚本，记录路径和 `reference` / `preserve-complete-script` 策略

## 1. 原片清点与一次转录

原片放进 `assets/originals/`，先跑：

```bash
npm run inventory -- --job jobs/<slug>
npm run transcribe:editor -- --job jobs/<slug>
```

转录按素材哈希缓存，编辑与字幕共用；不要对粗剪再次 Whisper。

## 2. 语义 A-roll 粗剪

读 `project.md` 和 `data/takes-packed.md`，把语义完整的保留段写进 `data/rough-cut-edl.json`。不要让静音检测替代判断。

必须处理：

- 看词停顿
- 长静音
- 表达失败后重录的 overlap
- 重复句
- 明显卡顿

渲染并逐切点检查：

```bash
npm run roughcut:render -- --job jobs/<slug>
npm run qa:cuts -- --job jobs/<slug>
```

每张电影条和波形都看完并修正 EDL 后，才写 `qa/cuts/approval.json`：

```bash
npm run qa:cuts:approve -- --job jobs/<slug> --by human --name <人名> [--acousticReviewed true]
```

Agent 可以先用默认 `--by agent` 记录自己的检查，但那不是交付门禁；`deliver` 与 `review init` 只认人签。`editor-signals.json` 里 `severity: high` 的信号，要么改 EDL 剪掉，要么听审后写进 `data/resolved-signals.json`（格式见 [data-contract.md](data-contract.md)）。

## 3. 处理 A-roll 并从成片音轨生成字幕

```bash
npm run aroll:treat -- --job jobs/<slug>        # 剪辑母版 aroll-cut.mp4 → 工作母版 aroll.mp4（倍速 / 对白链按 aroll-treat/registry.json 预设），写 project.json.aroll
npm run captions:build -- --job jobs/<slug>     # 对工作母版只转录一次 → captions / caption-voice / words-timeline（细节见 docs/timing-chain.md）
npm run qa:alignment -- --job jobs/<slug>       # 每个 EDL 段原片↔母版互相关，≤1 帧
```

字幕词面以 `editorial.writtenScript` 为准（拉丁语系自动对齐替换）；要改词面就改文稿再重跑 `captions:build`，不要手改 `data/captions.json` 的时间。`qa:alignment` 不过说明 EDL 或母版有问题，回到 EDL 重做，不许整体平移字幕。

目标格式：

```json
[
  { "s": 0.0, "e": 2.4, "t": "第一句字幕" },
  { "s": 2.4, "e": 5.0, "t": "第二句字幕" }
]
```

## 4. 排 beats 与 B-roll

章节不是越早越好。开头钩子没讲完，不要先把完整目录弹出来。

目标格式：

```json
[
  { "start": 46, "duration": 4.5, "num": "02", "title": "问答 AI 的上限" }
]
```

解释信息统一写入 `data/beats.json`。B-roll 写入 `data/broll.json`，每段必须有 `intent` 与 `reason`。

普通口播允许 `beats.json=[]`。工厂外贸只使用对应 profile 的样片语言，不套通用“高端科普卡”。连续 BGM 写 `data/music-bed.json`，不得塞成一条长 SFX。

## 5. 写解释层

解释层只在三种情况下出现：

- 口播信息量太高
- 有流程 / 对比 / 数字需要视觉化
- 观众不看图会跟丢

目标格式：

```json
[
  {
    "id": "workflow",
    "start": 100,
    "duration": 8,
    "kicker": "工作流",
    "title": "Agent 不是问答",
    "body": "它会读取资料、调用工具、执行任务。",
    "bullets": ["读取上下文", "执行动作", "复盘迭代"],
    "hideCaptions": true
  }
]
```

新工作流不使用 `overlays.json`；上例只用于旧 job 兼容。字幕默认完整保留，并按卡片位置让位。

## 6. 构建 composition

```bash
npm run build:variants -- --job jobs/<slug>
```

这一步会生成：

```text
jobs/<slug>/variants/<id>/index.html
jobs/<slug>/variants/<id>/project.json
```

所有字幕、章节、解释层都会变成静态 `data-start` / `data-duration` clip。
只构建 `project.json#variants` 中明确声明的平台版本；不会因为 profile 是工厂外贸就默认抖音，也不会因为项目有 YouTube 配置就静默渲染。

多版本说明见 [multi-format.md](multi-format.md)。

## 7. 检查

```bash
npm run check:variants -- --job jobs/<slug>
```

必须通过：

- HyperFrames lint
- HyperFrames validate
- HyperFrames inspect

## 8. 渲染

```bash
npm run render:variants -- --job jobs/<slug>
```

每个 variant 使用自己的画布、帧率和码率。抖音与 YouTube 是并列 target，不拿一个平台成片二压另一个平台。

经验：`high` 质量可能在长视频最终编码阶段被系统杀掉；`standard + 24M + 60fps` 是更稳的抖音交付参数。

## 9. 最终 QA

回项目根目录：

```bash
npm run qa:variants -- --job jobs/<slug>
```

输出：

```text
jobs/<slug>/variants/<id>/qa/final-frames/
jobs/<slug>/variants/<id>/qa/report.json
jobs/<slug>/variants/<id>/qa/report.md
```

必须看最终 MP4 抽出来的帧，不看预览。

`commercial-showcase` 与 `factory-acquisition` 的 variant 渲染链还会执行音频正规化和 `qa/audio-report.json` 响度门禁。

## 10. 交付

```bash
npm run qa:final:approve -- --job jobs/<slug>/variants/<id> --by human --name <人名> --fullPlayback true
npm run deliver:variants -- --job jobs/<slug>
```

`deliver:variants` 先要求 `qa/cuts/approval.json` 与每个 variant 的 `qa/approval.json` 都是 `by: human`，再按 target 分别复制到 `Downloads`。它不会删除目标文件夹里的用户文件。

## 10.5 验收与回流

```bash
npm run acceptance -- --job jobs/<slug>
```

每步是独立子进程，退出码与末 40 行写进 `qa/acceptance.json` / `qa/acceptance.md`；任一步失败整体 FAIL，命令缺失提示 `npm run update`。结束后自动 `report:push` 到 `client/<主机名>`。转述时逐步引用结论，不要概括成「通过」。

## 11. Vault 记录

记录至少包含：

- 标题
- 成片路径
- 封面路径
- 口播稿路径
- 分辨率 / 帧率 / 时长 / 码率
- QA 抽帧路径
- 发布状态
- 后续数据回填表

## 12. 存储复盘

交付后运行 `npm run storage:report`。报告只盘点，不清理；先确认最终交付和批准状态，再根据 `storage-plan.md` 判断历史审片版和可重建中间件。原片、书面脚本、当前数据合同、封面、delivery 与 approval 永远不在安全清理区。
