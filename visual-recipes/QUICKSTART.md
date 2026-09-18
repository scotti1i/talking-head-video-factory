# 视觉武器库：Planner 最小说明书

Shotcraft 是镜头语言配方库，不是主题和自动剪辑器：它回答“怎么表现”，`editorial-plan + visual-context` 决定“为什么此刻要表现”。不要把全库说明塞进提示词；先判断语义任务，再查询，只读取候选配方的完整记录与源码。

## 一次规划的最短路径

1. 运行 `visual:context` 和 `visual:plan:init`，先得到覆盖真实 EDL 的全人物安全计划。
2. 从 `editorial-plan.json` 读懂这段话在叙事中负责什么，不从单句字幕猜。
3. 从 `visual-context.json` 检查事实、素材、人物安全区和缺口；为 `analysis/research/userInputs` 明确填写 `supports`。
4. 把确实需要视觉补充的段落归为一个 `visualJob`：`hook/evidence/definition/data/comparison/relationship/process/sequence/emphasis/transition/cta`。
5. 查询生产武器：
   `npm run visual:recipes -- search --query "<visualJob> <内容关键词>"`
6. 没有合适结果时可用 `--scope all` 查尚未移植的候选，但不能直接用于生产；先走移植与保真验收。
7. 上下文不足时保留 `face`，不编造数据、截图、关系、英文标签或金句。

## 生产铁律

- Planner 选择“意图 + 配方 id + 变体”，不设计实现。
- Builder 只接受 `production.json` 中已批准的配方。
- 当前可换真实内容并进入生产的直接移植只有 3 个：`paper-title-card`、`row-embed`、`list-stack-press`。目录中标为 `reference-preview` 的上游段落只用于研究，Planner 不可选。
- `mode=broll` 只引用一个已核权的本地图片或视频；编译器自动写入 `broll.json`。版权未知、超过 10 秒、全片超过 25% 或与配方主轨重叠都会失败。
- 实现从上游 TSX 复制并只改集中配置；卡名、README 或截图不能作为重写依据。
- 每个视觉必须记录 `storyBeatId`、`intent`、`reason`、`contextEvidence`、`assetRefs` 与人物状态；`requirementCoverage` 引用的证据必须声明对应 `supports` 能力。
- 字幕只证明原话，不自动证明数据、关系或顺序。语义拆解写进 `analysis`，外部事实写进 `research`，私有事实/授权写进 `userInputs`；三类证据不能互相冒充。
- 主题只换皮，不得改变已调好的时间比例、缓动、hold、相机路径和音效结构。
- 原生配方先由 Remotion 渲染，再以独立视频与音频轨接入 HyperFrames；中间媒体必须满足 1 秒以内关键帧间隔，避免并行最终渲染取错帧。
- 渲染后必须生成入场、动作、稳定、退场四阶段电影条并记录人工/Agent 视觉批准；批准绑定媒体与电影条哈希，任何变化都会阻止编译。
- 真实页面、新闻、人物、产品、数字优先使用真实证据；没有素材就回退人物画面。

## 查询层级

- `list`：默认只列生产可用配方。
- `search --query`：低 token 候选检索，默认最多 8 条。
- `show --id`：只在选中候选后读取完整用途、要求、变体和源码候选。
- 对生产配方，`show --id` 同时返回 `production.contentContract`；Planner 只能填写其中 `required/optional` 内容字段，固定帧数和运动参数不可改。
- `list/search --scope all`：研究全库，结果未经移植不得渲染。

## 连续场景（小Lin 式）走叙事舞台

需要“同一对象持续生长、人物换位、概念缩成提醒”的段落，不用上面的单镜头配方，改写 `data/scene-plan.json` 走 `npm run visual:stage`；说明书在 `docs/narrative-stage.md`。
