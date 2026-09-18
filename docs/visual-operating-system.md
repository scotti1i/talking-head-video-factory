# 口播视觉操作系统

## 先说清 Shotcraft 是什么

Video Shotcraft 不是一套可以直接套全片的主题，也不是替代剪辑 Planner 的编辑器。它是“镜头语言武器库”：155 张配方把一个视觉意图拆成适用场景、前置素材、持续时间、能量、运动阶段、变体和源码候选。覆盖 11 类视觉任务，以及 UI 入场、文字、转场、效果、交互、数据、节奏、相机、开场和收尾等 10 个镜头品类。

它解决“这个意思可以怎样被拍出来”；我们的编辑合同解决“这段为什么此刻需要画面、事实从哪里来、人物是否退场、应该选哪件武器”。`Ink Press / AiflPromo` 是把若干武器组合成完整成片的参考工程，不等于 155 张卡都已成为可替换内容的生产组件。

## 目标

先知道工厂会怎么剪、能渲染什么，再做视觉计划。Planner 不能把字幕直接变成任意卡片；它只能从已登记、已移植、已验收的武器中选择，并说明为什么选、依赖什么事实和素材。

## 四层真相源

1. `editorial-plan.json`：整条视频在回答什么，段落承担什么叙事任务。
2. `visual-context.json`：画面决策可依赖的事实、素材、人物分析、工具分析、外部研究和用户输入，以及尚未解决的缺口。
3. `visual-plan.json`：每个视觉镜头的意图、配方、人物状态、证据与素材引用。
4. `visual-route-input.json → visual-route.json`：当一个连续解释段内部需要多次构图变化时，Planner 只交付语义节拍；确定性路由器选择场景配方、变体与人物状态。
5. `beats/broll/primary-clips/aroll-cues/audio-cues`：由编译器生成的执行时间轴；不承担选型思考。

### 连续场景路由

路由不是从关键词直接生成动画。Planner 先标记 `visualJob`，再提供可验证的结构信号：有序项、分支数量、多源汇流的 sink、被聚焦/移除的对象、共享对象或概念对。`scripts/visual-scene-router.mjs` 只做确定性选择：

- `hook + question + sharedObject` → 人物提问与共享对象；
- `sequence + orderedItems` → 逐级路径；
- `emphasis + focusObject + removeObject` → 局部聚焦与对象移除；
- `relationship + parallel-paths` → 双路径关系图；
- `relationship + many-to-one` → 贝塞尔汇流；
- `definition/comparison + conceptPairs` → 共享对象拆成两个概念。

任何结构信号不足都失败关闭并回退人物，禁止因为字幕里出现多个名词就猜一张关系图。路由输出必须无重叠、无空洞覆盖整段，并显式记录贯穿镜头的共享对象。

## 连续叙事舞台（2026-09-02 新增的第五层）

上面的路由器只能在“已登记的 7 种情况”里选一个配方，组件里还写死着订单、广告点击。Scott 看过 v4 后的判断是：只证明了关系图一项，小Lin 的十种能力没有系统。现在改成：

- 一条视频一份 `data/scene-plan.json`（秒）+ `data/words-timeline.json`（词级锚点），`npm run visual:stage` 编译成帧并生成只读 `NarrativePlan.ts`。
- 引擎 `templates/shotcraft-direct-port/stage/`：人物四态控制器 + 十种场景类型（标签、公式、关系图、汇流、二分、概念卡、提醒堆叠、引用→证据、数据聚焦）+ 事件动效，组件里零视频专属内容。
- 选型表、字段、纪律、上下文责任见 `docs/narrative-stage.md`；对标语法见 `reports/xiaolin-gdp-reference-20260901/visual-grammar-v1.md`。
- 门禁：编译器校验（类型、引用、人物关键帧间隔、4/6 秒无变化）→ tsc → 关键帧静帧 → 单并发全片渲染 → Rec.709 规范化 → 最终 MP4 抽帧复核。工作区签名含计划哈希。

`visual-scene-router.mjs` 保留给 `ContinuousRelationScene`（v4 样片）；新视频一律走叙事舞台。

## 上下文责任

| 责任方 | 能稳定得到的内容 | 不能越权的边界 |
|---|---|---|
| 工厂自动 | 完整叙事结构、字幕与词锚、A-roll、人物框、本地素材、书面稿、平台与画幅 | 不根据文件名猜事实或版权 |
| Agent 工具分析 | 从完整表达中拆出的顺序、步骤、实体、概念边界和人物安全区 | 只能声明推导能力，不能宣称数据已核实或来源已确认 |
| Agent 外部研究 | 新闻/人物/产品/数据来源、真实页面截图、定义、关系、比较基准、公开素材授权 | 不把推断当事实；来源必须存档 |
| 用户补充 | 私有资料、未公开事实、战略解释、敏感判断、版权授权、指定审美与禁区 | 未确认内容不得代用户拍板 |

每条证据都要声明机器可检验的 `supports`，例如 `ordered-items`、`plain-language-definition`、`source-provenance`。`requirementCoverage` 不再只检查“编号存在”，还检查该证据是否真的具备所需能力。

每个缺口都写进 `visual-context.json.gaps`。`resolver` 只有 `tool-analysis`、`agent-research`、`user`，并分别只能引用 `analysis:`、`research:`、`user:` 证据；`requires` 必须被该证据覆盖。未解决时 `fallback=face`。字幕只能证明说过什么，不能直接冒充研究或结构分析。

## 武器库两层

- `visual-recipes/shotcraft-registry.json`：全库认知层。155 张配方全部可检索，记录用途、能量、时长、上下文要求、变体与上游 TSX 候选。
- `visual-recipes/production.json`：生产许可层。只有源码已直接移植、原片已看、许可证明确且保真门禁可运行的配方才能进入。

生产许可按“可替换真实内容”授予，不按“仓库里有源码”授予。当前 Planner 只看见 `paper-title-card`、`row-embed`、`list-stack-press` 三个 `content-adaptable` 配方；其余 Ink Press 源段落保留为 `reference-preview`，完成参数接口与真素材验收后再逐个晋级。

Planner 默认只能看到生产层。需要新能力时先用 `--scope all` 找候选，再完成源码移植、真实素材适配、对照渲染和审核；不能直接把候选名称写进计划。

## 低 token 查询

```bash
npm run visual:context -- --job jobs/<slug>
npm run visual:plan:init -- --job jobs/<slug>
npm run visual:recipes -- search --query "evidence 产品截图"
npm run visual:recipes -- search --query "data 图表 指标" --scope all
npm run visual:recipes -- show --id shotcraft/chart-live-moves
```

默认只返回最多 8 条单行摘要。只有选中候选后才读取完整记录、配方卡与 TSX，避免每次规划加载全库。

`visual:plan:init` 不做审美判断，只把每个真实 EDL 段建立成全人物安全基线。Agent 在这个基线上增加有证据的 recipe 或 B-roll；不是先生成一堆卡，再想办法删错。

## 规划决策

每个段落先判断 `visualJob`：`hook/evidence/definition/data/comparison/relationship/process/sequence/emphasis/transition/cta`。随后按顺序判断：

1. 人物画面是否已经足够？足够就用 `face`。
2. 视觉是否能补充理解，而不是复述字幕？
3. 所需事实、素材、授权与人物安全区是否齐全？
4. 生产武器库是否有语义匹配的配方？
5. 配方的时长、能量、画幅和前后镜头是否合适？

任一步否定都不发明组件；记录缺口并回退人物画面。

生产视觉共用一条主轨：原生配方和 B-roll 不得重叠。B-roll 必须引用 `visual-context.json` 中唯一一个已核权本地图片/视频；编译器把它写入现有 `broll.json`，并保留人工条目。第一 3 秒、单段 10 秒和全片 25% 是失败关闭的上限。

## 直接移植与渲染边界

- Video Shotcraft 的 Remotion TSX 是运动真相源；仓库中的 `vendor/video-shotcraft/ink-press` 是不可编辑的上游基线。
- 生产适配从基线复制到 job，再修改集中配置、真实截图和中文内容；不翻译成 HyperFrames HTML。
- HyperFrames 继续负责 A-roll、字幕、轻包装与最终时间轴；Remotion 原生镜头先渲成全屏片段或透明层，再由现有媒体轨合成。
- 原生 SFX 通过独立音轨进入最终时间线；配方视频统一规范为最多 1 秒关键帧间隔，确保并行渲染随机寻帧仍与源帧一致。
- 主题只负责允许换皮的 token。相机曲线、时长比例、hold、缓动与音效钉帧不能被主题覆盖。

## 门禁

1. 注册表门：配方 id、变体、源码候选与许可证齐全。
2. 上游门：vendor 文件哈希与 provenance 一致。
3. 上下文门：视觉依赖的每项 requirement 都有具备对应 `supports` 的证据引用；解决者类型匹配，阻塞缺口清零，PIP/分屏已有实测人物安全区。
4. 计划门：只引用 production-approved 配方，时间覆盖正确的 story beat。
5. 结构保真门：vendor 哈希、`PageCam` 挂载、原始坐标、时间点、缓动与相机参数的自动断言通过。
6. 配方画面门：每个渲染镜头的入场、动作、稳定、退场电影条经复核批准；批准绑定当前媒体与电影条哈希。
7. 成片门：真实 MP4 的词落点、人物安全区、连拍运动、字幕可读性与最终音频通过。
