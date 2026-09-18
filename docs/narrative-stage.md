# 叙事舞台：Planner 最小说明书

> 一句话：把口播讲的“对象 / 关系 / 定义 / 数据 / 证据”翻译成同一个舞台上按词出现的状态变化，而不是插一张张卡。
> 对标语法：`reports/xiaolin-gdp-reference-20260901/visual-grammar-v1.md`。引擎源码：`templates/shotcraft-direct-port/stage/`。

## 它是什么

- 一条视频 = 一份 `data/scene-plan.json`（秒，Planner 可读）+ 词级时间戳 `data/words-timeline.json`。
- `npm run visual:stage -- --job jobs/<slug>` 把计划编译成帧并生成 Remotion 只读模块；组件里没有任何一条视频专属内容。
- 舞台恒定五层：A-roll 派生背景 → 场景层 → 人物控制器 → 字幕 → 原声。人物、背景、字幕由引擎负责，Planner 只写场景与人物形态关键帧。

## 人物四态（谁在主导画面）

| 模式 | 用途 | 禁忌 |
|---|---|---|
| `hero-center` / `hero` | 提问、态度、笑点、结论；右侧只放标签 | 不塞大段说明文字 |
| `dock` / `focus` | 人物仍需表达，内容需要大面积 | 不要只露半张脸 |
| `orb-right` / `orb-left` | 图表 / 定义 / 关系图需要最大面积 | 不要求手势表达；不超过短边 24% |
| `hidden` | 章节页、纯证据 | 不连续隐藏过久 |

关键帧 `{at, mode}` 间隔 ≥ 35 帧（换位曲线 25f + 10f 回落），一个解释段按 `hero → dock/orb → hero` 闭环。

## 场景类型选型表（22 种）

| type | 观众此刻要做什么 | 关键字段 | 不要用在 |
|---|---|---|---|
| `label` | 认出当下命名的对象 | `items[{text, at, x, y, tone}]` | 需要解释的内容 |
| `equation` | 理解等价 / 计算关系 | `rows[{terms[{text, at, kind: term/op/result}]}]`, `collapseAt` | 五项以上比较 |
| `graph` | 跟随流程、因果、分支、判定 | `nodes[{id,label,kind,at,x,y,states,highlight,dim,badge,remove}]`, `edges[{from,to,at,highlight,dim,dashed,bend,remove}]`, `notes` | 只有名词没有关系词 |
| `converge` | 多个来源到同一结果 | `sources[{label,at}]`, `sink{label,kind,at}`, `convergeAt`, `note` | 来源少于 3 |
| `split` | 一个对象拆成两个问题 / 概念 | `header{glyph}`, `cards[2]{text,glyph,tag{text,at},glyphLeaveAt}`, `shiftAt`, `collapseAt` | 非二分结构 |
| `concept` | 准确记住一句定义 | `term`, `phrases[{text,at}]`, `demoteAt`, `slot` | 只是强调一个关键词 |
| `reminders` | 记住仍在谈哪个概念 | `items[{text,at}]` | 需要阅读的内容 |
| `evidence` | 认出并核验真实页面 | `image`, `imageSize`, `thumbCrop`, `expandAt`, `focus[{at,box}]`, `source` | 没有真实截图 |
| `data` | 读趋势、区间、前后差 | `title`, `series`, `highlights`, `marker`, `chips`, `delta`, `spikes`, `verdict` | 没有数据也没标“示意” |
| `reference` | 认出"那种东西"（教程 / 新闻 / 产品）| `kind: mock-cover`, `title`, `subtitle`, `tag`, `at`, `x`, `y`, `w` | 需要证明来源的场合（用 `evidence`） |
| `broll` | 把抽象名词落到现实物件 | `media`, `origin: generated/third-party/own`, `layout: panel/full`, `caption` | 单段 > 7 秒；全片 > 25% |
| `ladder` 递进阶梯 | 步骤沿对角线逐级抬升，台阶导轨随口播点亮，末级可挂判定 | 有真实顺序的递进 / 升级（波形图→粗剪→精剪；懂 AI→有经验→专业人员） |
| `cycle` 循环 | 节点沿圆环逐个出现，弧线箭头合环，可有中心枢纽 | A 推动 B、B 回到 A 的闭环（飞轮 / 反馈） |
| `accent` 点缀 | 人物口播时关键词旁弹出小物件 / 小标签，1.2 秒即走 | 大段口播的伴奏，不解释只点一下 |
| `quote` 引用 | 大引号 + 大字 + 署名 | 别人的原话（博主、官方、客户）；没有截图时替代证据页 |
| `timeline` 时间线 | 横向导轨，里程碑上下交错，红色 = 事故点 | 按时间讲一件事（诊断好好的 → 托管 → 改规则 → 大跌） |
| `compare` 前后对比 | 左「以前」右「以后」逐行揭示，中间箭头，可落判定 | 以前 X、以后 Y；替代第二个汇流 |
| `title` 标题卡 | 整屏大字 + 副题，盖在全屏人物上 | YouTube 横屏开场 2 秒 |
| `chat` 手机模拟器 | 420×760 设备框，聊天气泡弹簧入场 | 本来就是对话的段落（客户问 / AI 答） |
| `leaderboard` 排行榜 | 行序出现，条按最大值归一化，highlight 行强调实底 | 排序 / 对比（平台、价格、份额） |
| `gauge` 表盘 | 270° 弧扫入 + 大数字滚动 | 单一数值的冲击（百分比 / 通过率） |
| `flip` 翻牌 | 正面悬念 flipAt 翻到背面答案 | 一个悬念一张牌 |
| `map` 地图 | 标记涟漪 + 抛物航线；有真实地图铺底，无图用抽象经纬（不伪造地理） | 跨境 / 发货地 / 市场 |
| `clipping` 剪报 | 纸质剪片 + 衬线标题 + 马克笔高亮 + 来源行 | 新闻 / 公告一句话引用 |

全部时间字段写秒，且必须落在 `words-timeline.json` 里对应口播词的开始时刻；不允许按固定间隔轮播。编译器会核对每个 `at / *At` 与最近词首的距离（容差 0.12s）并列出偏离清单。

### 材质（2026-09-02 Scott 定：现代扁平，Apple / Notion 方向）

- 只有纯色面 + 1px 发丝线：普通 = 7% 白面，焦点 = 强调色底面 + 强调边，降权 = 只有发丝线；没有渐变、内高光、发光、颗粒、拟物阴影。
- 只有浮层有柔影：人物框、引用卡、证据页、数据白卡。
- 字体做主角：关键词 120–200px（`label size:xl`、`split.tag`、`concept.term`），说明文字 34px 退居次位；不给文字加发光。
- 背景：原片模糊层（14%）+ 一盏极弱顶灯 + 底部渐暗，三层按 0.35 / 0.7 / 1.4 系数视差漂移。

### 动作注册表（`visual-recipes/stage-motions.json`）

从 Video Shotcraft 直接移植的运动参数集中在 `stage/motions.ts`，每个动作在注册表里有：上游文件与哈希、挂在哪个舞台字段、状态（`ported` / `vendored-candidate`）、默认路由规则。编译器 `applyMotionDefaults` 按规则自动填字段，`validateMotions` 拒绝引用未移植动作。

| 计划字段 | 取值 | 上游动作 | 默认规则 |
|---|---|---|---|
| `node.enter` | pop / slam | diagram-cascade / ScoreSlam | 场景末段建立、highlight 到结束、且是最后一个节点 → slam |
| `badge.fx` | impact / burst | impact-feedback / PopBurstConfirm | ✓ ✕ 或红色 → burst |
| `edge.style` | line / flyline | — / FlylineArc | 有 highlight → flyline |
| `focus.style` | box / brackets | — / ScanlineAnnotateFocus | 框高 < 80px（一句话）→ brackets |
| `focus.zoom` | shared / crash | SharedElementMorph / CrashZoomReal | 显式 |
| `phrase.reveal` | blur-slide / karaoke | BlurSlide / KaraokeFillSync | 短语能在词表里逐字对上 → karaoke（编译器自动解析 words，合并英文碎片） |
| `label.odometer` | true | OdometerDigitRoll | 显式，纯数字 |
| `underline` | true | MarkerUnderlineTitle | 显式（手绘感，扁平体系默认关） |
| `converge.handoff` | circle-iris | CircleMatchIris | 上一场景在同一圆心有圆时显式 |

候选（已 vendor 未接入）：morph-from-primitive、before-after-slider-scrub、hatch-depth、integration-hub-map、line-carry-transition。

### 真实物件库（2026-09-02 Scott：真实元素越多视频越丰富）

- 复杂物件不手画：`assets/objects/objects.json` 列出物件（id / label / subject），`generate.sh` 逐个调 `codex exec`（ChatGPT 内置图像生成）出 1024×1024 纯色底插画；`key-and-inject.py` 抠底、裁边、缩 512、拷进 `public/factory/objects/`，并把 `image` 字段注入计划（节点 / 汇流结果 / 概念卡 / 二分卡）。
- 风格锁定在 objects.json 的 `style` 里（小Lin 式扁平体积、米白 + 深灰 + 一处哑金、无文字无品牌标志），所有物件同一句风格描述，保证成套。
- 理解档：`origin: generated`，不冒充真实品牌；平台类物件用抽象形（音符手机、微笑纸箱、浏览器小店）。
- 生成失败或缺图时组件自动退回线性图标（`Object3`）。
- **跨 job 共享库 `visual-assets/objects/`**（2026-09-02 起）：每个 job 的 `keyed/` 物件汇入这里（`index.json` 记 id / subject / 来源 job），准备工作区时先铺共享库再用本 job 覆盖——同一物件不必每条视频重生成。并行生成用 `xargs -P 7` 调 `gen-one.sh <id>`（22 个约 6 分钟）；后台调用必须 `< /dev/null`，否则 codex 会等 stdin 卡死。
- **真实 logo 优先**（Scott 2026-09-02）：能找到的官方 svg/png 放 `assets/logos/`，节点 `image` 直接引用（`factory/<slug>/logos/x.svg`）；找不到（抖音各 CDN 均无）就退回生成物件，不伪造品牌标志。
- **B-roll（Seedance 文生视频）**：`assets/broll/spec.json` 列片段（prompt / out / duration）。**首选即梦 CLI VIP 通道**（2026-09-04 Scott 拍板，APIMart 不再充值）：`dreamina text2video --prompt="<prompt + style>" --duration=5 --ratio=16:9 --video_resolution=720p --model_version=seedance2.5 --poll=0`，maestro 账号排队 0、每条 100 积分、约 2 分钟；`dreamina query_result --submit_id=<id>` 取 `video_url` 再 curl 落到 `assets/broll/`。兜底才用 `node scripts/apimart-media.mjs batch --spec <spec>`（doubao-seedance-2.0，`ratio:"16:9"` + `resolution:"720p"`）；计划里 `type: broll`，`layout: panel`（人物左、片段右）或 `full`（整屏，人物 `hidden`），单段 ≤ 片段时长（5 秒）。全片 B-roll 时长控制在 25% 以内，它是落地名词的工具，不是壁纸。

### 形态变体（避免同一种圆角卡反复出现）

- 节点 `shape`: `card`（默认）/ `circle`（实体、平台、对象）/ `pill`（附属物、报表、标签类）；标签 `form`: `glass` / `fill` / `outline`，`size`: `s / m / l`。
- 材质由状态自动决定：当前焦点 = 填充面，普通 = 玻璃面，降权 = 只有发丝线；强调色只落在正在讲的东西上。
- 编排纪律：同一屏内至少两种形态；连续三个同形态节点视为单调，换 `shape` 或改用 `converge`。

### 音效（词级锚点上的事件声）

`sfx: true` 时引擎按事件类型自动挂声：节点 / 公式项建立 → pop，判定徽章 → click，红色判定 → snap，人物换位 → swoosh，汇流完成 / 概念落定 → soft。同一 3 帧内的重复声音只保留一个；音量 0.18–0.34，不与口播争。素材来自 Video Shotcraft 上游 `public/audio`（Apache-2.0）。

### 字幕安全区

字幕占画面底部 170px（y ≥ 900）。人物框、数据卡、证据页的固定布局已收在 900 之上；带坐标的标签、注释、节点顶边不得低于 840，编译器直接拒绝。

### 人物空闲居中（编译器自动，2026-09-02）

右侧没有内容时人物不该缩在左边。编译器对 hero / dock / focus 段自动处理：内容出现前空闲 ≥ 1.8 秒的段先 `hero-center`，内容出现前 0.6 秒才切回；内容结束后仍空闲 ≥ 2.2 秒再居中。写分镜时只管内容节拍，不必手排居中关键帧（显式写的关键帧仍然优先）。

### 常驻背景板（2026-09-02）

`plan.background.plate` 指向 `factory/plates/<name>.png`（共享库 `visual-assets/plates/`，gpt-image-2 生成，`spec.json` 可再出候选）。默认 `studio-topglow`：深色摄影棚顶光板。板子做极慢推近 + 视差漂移 + 45 秒一道斜向光扫；原片模糊层降到 7%。

### 人物角标（2026-09-02 改）

`orb-left / orb-right` 现在是 176×292 的小竖版人像卡（头肩全入、头更小），不再是圆形——圆形裁切总把下巴切掉。名字保留以兼容旧计划。

### 时间线对时（2026-09-03）

字幕 / 词级时间戳如果来自原始 take + EDL 映射，可能整段早于真实语音（本片 14–28s 早 0.5–1.3s，Scott 一眼看出"字幕偏快"）。校正：

```bash
ffmpeg -i jobs/<slug>/assets/aroll.mp4 -ar 16000 -ac 1 jobs/<slug>/qa/aroll16k.wav
whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin -l zh -f jobs/<slug>/qa/aroll16k.wav -oj -of jobs/<slug>/qa/aroll-turbo
python3 scripts/retime-timeline.py jobs/<slug> --dry   # 先看偏移表
python3 scripts/retime-timeline.py jobs/<slug>         # 字幕 / 词表 / 分镜一起校正，原文件留 .pre-retime.bak
```

### 场景要知道人物在哪（2026-09-03）

`NarrativeStage` 把当前人物形态传给场景；概念卡按 `contentRect(mode)` 居中，不再假设人物是角标。新场景类型一律用 `contentRect` 定位，不写死坐标。

### 皮肤：立体透视舞台 `stage3d`（2026-09-03）

`plan.skin: "stage3d"`。四层：网点 / 斜纹纹理底（慢视差）→ 一块带透视的黑面板承载全部场景（`perspective(3000px) rotateY(-6°) rotateX(2°)`，缓慢摆动推拉）→ 彩色实底卡（节点 `tone: red | purple | lime | ink`，虚线内边，`en` 双语小字）→ » 箭头（边 `style: chevron`）。强调色青柠 `#D7F25B`，字幕关键词同色。人物在面板外保持正视；人物居中或隐藏时不画面板。旧皮肤 `glass` 保留，工作区准备按 plan.skin 写 `Skin.ts`。

### 素材需求单（2026-09-03 Scott 第三轮 review）

写分镜时同步产出 `MATERIAL-REQUEST.md`，每个想上画面的东西分四类：**必须你给**（第一人称事实：我做过 / 我开源了 / 我的数据 / 我在用的界面 / 我的客户）· **我能抓**（公开网页 / 官方文档 / logo，`scripts/web-evidence.sh`）· **我能造**（物件 / 引擎内动画 / 辅助理解 B-roll）· **拿不准**（隐私 / 口径 / 品牌授权）。第一人称事实永远不能用相关公开页顶替；没给到的位置留占位并标出。英文证据页的聚焦句必须带 `note` 中文译注。

### 反八股（2026-09-03 Scott 两轮 review 后定稿）

Scott 的判断：节奏快、每 4 秒有变化是对的，甚至可以更激进；问题在 **真实信息太少**、**口播时没有关键词点缀**、**尺度与位置无跳跃**、**模板复用太多且顺序雷同**。规则：

1. **真实素材是主角**：每条片至少 4 处真实材料（网页截图 `scripts/web-evidence.sh`、App 截图、录屏、AI 视频）。标签只留名词 / 数字 / 判定，复述口播的标签一律换成真实材料或点缀。
2. **点缀层**：`plan.keywords` 让字幕关键词金色加重；`accent` 场景在人物旁弹小物件 / 小标签。大段口播里每 2–3 秒一个点缀。
3. **尺度与位置要跳**：每条片至少一次 `giant` 巨字整屏、一次 `close` 推近、一段 `hero-right` 镜像、一次 `broll: strip` 通栏。
4. **每条片一个签名**：不同背景板（`studio-topglow` / `graphite-curtain` / `slate-gradient`）、不同开场手法（真实页面撞推 / 通栏 B-roll / 巨字）、不同默认人物侧。
5. **型录审计**：编译器打印每场「类型:变体」签名并与其他 job 比三元组重合度（`visual-recipes/stage-usage.json`），>35% 或开头四场相同 → 八股预警。
6. 前 10 秒每秒一个动作。4 秒 / 6 秒语义门禁保留。

人物形态新增：`close`（hero 框内推近 1.45×）、`hero-right`（人物在右、内容区 x 54–1220）。标签尺寸新增 `giant`（240px）。B-roll 新增 `strip` 通栏。

## 编排时的五条纪律

1. 同一个知识对象跨场景保持身份：`graph` 里用 `states` 换位，不新建第二张卡；`equation/concept/split` 用 `collapseAt/demoteAt` 缩成提醒，不整页替换。
2. 一句口播只触发一个主动作；说出名词 → 节点，说出关系词 → 连线，说出“但是 / 如果” → 分支或降暗，说出“算 / 不算 / 对 / 错” → 徽章。
3. 画面文字只用口播原话或其最短直译；没有英文装饰词、没有自造金句、没有“反事实”这类分析术语。
4. 素材分两档（2026-09-02 Scott 定）：**证据档**——口播在说"官方建议 / 数据显示 / 某某说过"这类事实来源时，画面必须是真实截图或真实数据并写来源；**理解档**——新闻、人物、产品、教程、场景的"那种东西"允许生成或合成（`reference` 示意封面、`broll` 生成片段、示意图表），画面不标"示意"字样，只在 `origin` 字段记录来源类型。视觉是辅助理解，不是取证；但理解档不得冒充具体来源（不写假账号、假数据、假机构名）。
5. 解释场景 4 秒无状态变化会被编译器警告，6 秒直接拒绝；人物段落不受此约束。

## 归档（2026-09-03 Scott 定）

`glass` / `blueprint` / `paper` 三套旧皮肤保留代码但**归档**，不再用于成片；成片皮肤只有 `stage3d`（xiaolin 模板）。`templates/job` 是 job 脚手架（`scripts/new-job.mjs` 用），不是视觉模板，不归档。

## 名字与调用

对 Scott 这套叫 **xiaolin 模板**（工程名：叙事舞台引擎，皮肤 `stage3d`）。新 session 里说「用 xiaolin 模板剪 <视频>」即可，`talkinghead-edit` skill 会路由到本说明书的流程。

## 判断手册与审片（2026-09-07 起）

判断真源 `docs/xiaolin-taste.md`（拒绝清单 / 结构上限 / 编排判断 / 审片清单 / 停机规则），参照成片 `docs/exemplars/`。编译器 `auditStructure` 按手册 §4 拦换位密度、无休息时长、抖音片长；`stage-review.mjs` 让全新上下文的模型按 §6 打分；`stage-approve.mjs` 记 Scott 通过；`stage-render --final` 两者缺一即拒；`stage-regress.mjs` 对参照成片做静帧 SSIM 回归。

## 先样片后成片（硬流程，2026-09-03 Scott 定）

1. `node scripts/stage-render.mjs --job jobs/<slug> --proof`：540p、快编码，出预览给 Scott 审；不进 Downloads。
2. Scott 说通过 / review 过 → `--final`：1080p **60fps**（合成帧率 60，逻辑帧仍按 plan.fps=30 插值，动效变顺滑，A-roll 保持源帧率）、crf 15、Rec.709 规范化，自动打包到 `~/Downloads/<日期-片名-YouTube横屏-xiaolin>/`，文件夹只留最新成片。
3. 只有 Scott 明说「这次就要成片」才跳过样片。

## 新增模板五步（可维护性约束）

每加一种形态必须同时完成，缺一项 `npm run test:visual-stage` 或 `test:visual-vendor` 会拦：

1. `Plan.ts`：类型 + 加入 `Scene` 联合。
2. `stage/<Name>.tsx`：组件，根节点 `transformStyle: 'preserve-3d'`，位置一律用 `contentRect(mode)`，强调面上的文字色用 `ON_ACCENT`，不写死颜色 / 坐标。
3. `NarrativeStage.tsx`：分发；整屏 / 自带边框的类型加入面板豁免。
4. `scripts/narrative-stage-plan.mjs`：`SCENE_TYPES`、`sceneBoxes`（几何 / 容器 / 覆盖率门禁的依据）、`contentIntervals`、`validatePlan` 字段校验、`sceneSignature`。
5. `visual-recipes/stage-motions.json` 登记 + `jobs/stage-catalog-20260903` 加一场 demo（路由覆盖测试要求目录 job 含全部类型）+ `shotcraft-direct-port.mjs` 的 `STAGE_FILES` 与测试计数。

## 工作流（2026-09-03 起：五条命令）

```bash
# 0. 时间线单源（成片音轨转一次，字幕 + 词表同源；不再走 take 转录 + 剪辑表映射）
ffmpeg -i jobs/<slug>/assets/aroll.mp4 -ar 16000 -ac 1 jobs/<slug>/qa/aroll16k.wav
whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin -l zh -f jobs/<slug>/qa/aroll16k.wav -ojf -of jobs/<slug>/qa/aroll-turbo
python3 scripts/timeline-from-aroll.py jobs/<slug>            # 先 --dry 看偏移表
# 1. 写 data/scene-plan.json；素材还没生成时可先编译看门禁
ALLOW_MISSING_MEDIA=1 node scripts/narrative-stage-plan.mjs --job jobs/<slug> --module /tmp/np.ts
# 2. 生成素材：物件 codex 并行（assets/objects/gen-one.sh + xargs -P 7 < /dev/null）；B-roll 即梦 VIP（seedance2.5）优先，apimart batch 兜底
# 3. 绑定工作区（换 job 只做这一次；之后粘性）
NARRATIVE_JOB=jobs/<slug> node -e "import('./scripts/shotcraft-direct-port.mjs').then(m=>m.prepareInkPressWorkspace())"
# 4. 静帧自检（一次打包，按分镜自动取点，出拼板）
node scripts/stage-stills.mjs --job jobs/<slug> --out qa/stills-v1
# 5. 渲染 runner（锁 → 8 并发渲染 → Rec.709 → 门禁 → 抽帧板 → 720p 预览 → 交付）
node scripts/stage-render.mjs --job jobs/<slug> --deliver "2026-09-03-片名-YouTube横屏"
```

编译门禁现在有四道：素材存在性、字幕安全区、语义停滞（4s 警 / 6s 错）、**几何门禁**（人物框 vs 元素包围盒按 0.5s 采样，重叠即错；形变窗口内不采样）。新增场景类型必须在 `sceneBoxes` 登记包围盒。

## 工作流（旧版，逐步退役）

```bash
# 1. 词级时间戳映射到成片时间轴（一次）
#    输入：原始 take 的 whisper 词级转录 + rough-cut-edl.json
# 2. 编写 data/scene-plan.json（先按上表判断每段的观看任务，再挑类型）
npm run visual:stage -- --job jobs/<slug>            # 编译 + 校验 + 生成 NarrativePlan.ts
cd renders/work-shotcraft/ink-press && npx tsc --noEmit
npx remotion still src/factory-index.ts NarrativeStage out.png --frame=<f>   # 关键帧自检
npx remotion render src/factory-index.ts NarrativeStage out.mp4 --concurrency=8  # 2026-09-03 实测 M4 Max：8 并发帧速约 3×，300 帧逐帧 PSNR 对照单并发最低 47dB、无异常帧；成片门禁的突变扫描兜底，若再出现单帧纹理异常再退回 --concurrency=1
# 3. Rec.709 规范化 + 抽帧复核（同 v4 流程），交付前看最终 MP4
```

换视频 = `NARRATIVE_JOB=jobs/<slug>` 环境变量跑一次工作区准备（`prepareInkPressWorkspace`），之后该 job 有粘性（记在 `renders/work-shotcraft/.narrative-job`），没设环境变量的命令 / 测试不会把工作区换回默认样片。工作区签名包含计划哈希，计划一变旧批准自动失效；重建工作区时 `node_modules` 会被挪走再挪回，不会丢依赖。

编译门禁会拦：素材路径不存在、节点没有图标 / 文字 / 图片 / pill、任一场景 >6 秒无语义变化（>4 秒警告）、词锚偏离口播词 >0.12 秒。写分镜时每 4 秒左右放一个 `at`。

## 上下文责任（谁能提供什么）

| 责任方 | 稳定得到 | 边界 |
|---|---|---|
| 工厂自动 | 词级时间戳、字幕、A-roll、人脸安全区、故事段落 | 不根据文件名猜事实 |
| Agent 分析 | 顺序、分支、共享对象、概念对、公式项、节点的可识别物体类型 | 只能声明推导，不能宣称数据核实 |
| Agent 研究 | 真实页面截图（headless Chrome 可抓）、来源、定义 | 证据档抓不到（403 / 登录墙）就回退人物；理解档改走生成 |
| Agent 生成 | `dreamina text2video` 5s 片段（720p/16:9，约 25 积分）、示意封面 | 只做理解档；单段 ≤ 7s，全片 ≤ 25%，提示词里禁品牌 / 真人 / 文字 |
| 用户补充 | 真实业务数据、私有素材、指定要引用的封面 / 视频 | 未确认内容不得代为拍板 |

当前 GMV Max 样片里由用户补充才能升级的一处：`seller-test` 的示意曲线（若有真实开启前后 GMV 可替换）。开头"很多人都在教你"已按理解档用 `reference` 示意封面补上。
