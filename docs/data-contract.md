# 唯一数据合同

`talkinghead-edit` 只认以下事实源。生成的 HTML、MP4、截图都不是编辑输入。

合同分三条正交轴：

- `project.json#profile`：内容生产方式，例如普通口播、录屏实操、商单展示、工厂外贸。
- `project.json#variants[]`：发布目标与画幅，例如抖音竖屏、YouTube 横屏、Shorts。
- `project.json#policies` / `variants[].policies`：平台审核覆盖层，例如 `douyin-compliance`。

工厂外贸不是第三种平台；同一个 `factory-acquisition` job 可以同时拥有抖音和 YouTube variants。profile 注册表位于 `profiles/registry.json`。

| 文件 | 责任 | 谁判断 |
|---|---|---|
| `project.md` | 目标、保留项、删除项、包装边界 | 人 / Agent |
| `project.json` | 画布、主题、交付和 variants | 确定性配置 |
| `project.json#editorial.writtenScript` | 可选书面脚本路径与保留策略；`factory-acquisition` 必填 | 人 / Agent |
| `project.json#editorial.fineCutPreset` | 气口、句间停顿与跨 take 处理边界，来自 `fine-cut/registry.json` | 确定性配置 |
| `project.json#templatePack` | 版本化模板包，来自 `template-packs/registry.json` | 人选择，脚本应用 |
| `data/source-inventory.json` | 原片规格与路径 | 脚本 |
| `data/color-managed-sources.json` | 原片到 SDR Rec.709 工作副本的可复现映射 | 脚本 |
| `data/transcripts/index.json` | 素材哈希到词级转录缓存 | 脚本 |
| `data/takes-packed.md` | 供语义剪辑阅读的紧凑转录 | 脚本 |
| `data/editor-signals.json` | 低置信度、段内异常停顿、气口候选与 EDL 声学边界 | 脚本标记，人 / Agent 听审 |
| `data/rough-cut-edl.json` | 保留段，使用原片绝对语义时间 | 人 / Agent |
| `data/resolved-signals.json` | `editor-signals.json` 里 `severity: high` 信号的处理登记（sidecar，EDL 是数组放不下） | 人 / Agent 听审后登记 |
| `qa/cuts/approval.json` | 所有切点已逐张检查；`by: human` 才算交付门禁 | 人（`--by human`）/ Agent（默认） |
| `data/captions.json` | 校准后的最终字幕 | 人 / Agent |
| `data/caption-voice.json` | 经波形、语义和人物状态批准的人声区及字幕/等价屏幕文字覆盖方式 | 人 / Agent；脚本门禁 |
| `data/dialogue-continuity.json` | 每个 take 段首、尾词、局部响度跳变及 B-roll 边界的人工审计事实 | 人 / Agent；脚本门禁 |
| `data/beats.json` | 解释性卡片 | 人 / Agent |
| `data/broll.json` | B-roll 时间、素材、意图与理由 | 人 / Agent |
| `data/primary-clips.json` | 长段主展示媒体、源时码与说话人小窗 | 人 / Agent |
| `data/audio-cues.json` | 语义节点上的短音效、时间和音量 | 人 / Agent 定语义，脚本校验 |
| `data/music-bed.json` | 全片或长段连续 BGM；与短音效分离 | 人 / Agent 定语义，脚本校验 |
| `data/aroll-cues.json` | 纯 A-roll 的短促镜头冲击与跨 take 遮切 | 人 / Agent 定语义和切点，脚本校验 |
| `data/shorts.json` | Shorts 语义区间 | 人 / Agent |
| `qa/approval.json` | 最终 MP4 抽帧与完整播放状态；`by: human` 才能 `deliver` | 人（`--by human`）/ Agent（默认） |
| `qa/audio-report.json` | profile 要求下的响度与 true peak 门禁 | 脚本 |
| `qa/caption-voice-report.json` | 字幕与已批准人声区的覆盖门禁；提前、拖尾、漏句或跨静音即失败 | 脚本 |
| `qa/dialogue-continuity-report.json` | 段首≤0.08s、尾音保护、局部响度≤4dB 跳变及空镜不遮静音的门禁 | 脚本 |
| `qa/acceptance.json` / `qa/acceptance.md` | `npm run acceptance` 逐步结果：退出码、末 40 行、证据路径、整体 PASS/FAIL | 脚本 |
| `review/Rn/manifest.json` | 冻结审片视频哈希、时长与当轮事实源哈希 | 脚本 |
| `review/Rn/feedback.json` | 时间码、类别、修改指令、作用域、状态和处理结果 | 专业剪辑 / Agent 结构化 |
| `project.json#legacy` | `npm run migrate` 写入：`migratedAt`、`from`、`reasons[]`（为什么不算 v2 产物） | 脚本 |
| `requests/<日期>-<slug>.md` | 操作员需求单（仓库级，不在 job 内），commit 到 `client/<主机名>` | 操作员 / Agent |
| `ops/<主机名>/<slug>/**` | `report:push` 回流的 job 文本证据副本；只存在于 `client/<主机名>` 分支 | 脚本 |

## 审批文件（`qa/cuts/approval.json`、`qa/approval.json`、`variants/*/qa/approval.json`）

```json
{
  "status": "approved",
  "by": "human",
  "name": "张三",
  "reviewedAt": "2026-09-11T08:05:12.000Z",
  "reviewer": "张三",
  "cutCount": 14,
  "acousticReviewed": true,
  "notes": "逐张检查通过"
}
```

- `by` 只允许 `human` / `agent`，默认 `agent`；`name` 必填。`reviewer` 是兼容旧字段，与 `name` 相同。
- `deliver`、`deliver:variants`、`review init` 只接受 `by: human`。Agent 不得替人写 `human`；用户亲自看完后在终端执行 `--by human --name <人名>`，或在网页审批页（`npm run approve:open -- --job jobs/<slug>`，即 console 的 `/approve?job=<slug>`）点「通过」。`FACTORY_ALLOW_AGENT_APPROVAL=1` 只给 CI / smoke，执行时大声警告。
- 网页审批写出的文件与终端命令同形（`governance-lib.mjs` 唯一定义），只多三个字段：`via: "console"`、`fullPlayback: true`；终审另有 `revision`（审的是哪一版 `review/Rn`）、`videoHash`（该版 `video.mp4` 的 SHA-256）、`watchedToEnd: true`（浏览器 `ended` 事件真的触发过）。终审的「待审」判定：最新 `review/Rn/video.mp4` 没有对应的 human 签（`revision` 不同，或没记 `revision` 但 `reviewedAt` 早于该视频）。
- 网页上点「有问题，退回」不写任何 approval，只把一段话追加到 `review/Rn/feedback-inbox.md`；Agent 下一轮先读它。
- 批量盖章：job 内任意两份 approval 的 `reviewedAt`（缺失时用 mtime）相差 ≤ 2 秒，`workflow-status` 的「批量盖章」gate 标红，job 不算 ready。

## resolved-signals.json

`data/editor-signals.json` 由 `transcript:audit` 生成、没有 id；登记文件用派生 id 引用：

- `disfluencySignals`：`<原片文件名>#<type>@<start>`，例如 `take-01.mp4#adjacent_repeat@12.34`
- `cutBoundarySignals`：`<原片文件名>#cut:<range>:<side>@<time>`，例如 `take-01.mp4#cut:3:out@57.2`

`start` / `time` 保留三位小数。格式：

```json
[
  { "id": "take-01.mp4#adjacent_repeat@12.34", "reason": "重复是强调语气，保留" },
  { "id": "take-01.mp4#cut:3:out@57.2", "reason": "听审确认词尾完整，无爆音" }
]
```

- 只有仍落在 EDL 保留段内的 high `disfluencySignals` 与全部 high `cutBoundarySignals` 需要登记；已被 EDL 整段剪掉的不用。
- `reason` 必填一句话；`review init` 与 `npm run status`（「高危信号处理登记」）都读它，未登记的 high 信号会让 `review init` 拒绝冻结 R0。

## project.json 的内容 profile 与书面脚本

```json
{
  "profile": "factory-acquisition",
  "policies": [],
  "editorial": {
    "editingMode": "script-preserving-edl",
    "fineCutPreset": "standard",
    "writtenScript": {
      "path": "assets/originals/original-script.txt",
      "policy": "preserve-complete-script"
    }
  },
  "templatePack": "factory-proof",
  "variants": [
    { "id": "douyin-vertical", "platform": "douyin", "layout": "vertical" },
    { "id": "youtube-horizontal", "platform": "youtube", "layout": "horizontal" }
  ]
}
```

`clean-talkinghead` 默认按语义清洁剪辑，卡片和 BGM 均可为空。`screen-demo` 允许使用已经剪好的 Screen Studio 主素材，不强制伪造 EDL 切点。`commercial-showcase` 要求真实产品/实操/结果证据。`factory-acquisition` 以完整书面脚本为内容边界：只删片头片尾等待、明确口误和有证据的重复拍摄；不为追求极限紧凑删除独有脚本内容。ASR 只是时码证据，原稿优先于 Whisper 拼写。

`fineCutPreset` 与 `templatePack` 是正交轴：前者只控制语言节奏，后者只控制主题、字幕、B-roll、音效和镜头包装。模板包可以复用真实预览与资源，但不得改变文稿句序或 EDL 内容。

用户明确要求某一版不加 BGM 时仍保留 `data/music-bed.json`，写为 `{"enabled":false,"reason":"..."}`。这表示经过确认的创作选择，不等于遗漏音频工序；构建器不会生成背景音乐轨。

`factory-acquisition` 新 job 默认使用 `social-fast`：TikTok / Instagram 前三秒必须尽快进入有效口播；第 0 帧封面之后，首个有效音节以及每个新 take 的首个有效音节默认都要在 0.08 秒内进入。交付首帧必须同时落在首个有效音节、对应嘴型已经形成、表情与手势已经进入口播状态的交集内；吸气、张口准备、举手准备或寻找镜头的画面即使出现小波形也不算正文。除用户明确要求的空音频、语义停顿和转场所需 0.1–0.3 秒缓冲外，不保留可感知气口。拍摄者的“开始/Action/Go”、数拍、提示词、碰麦和演员准备声必须在每个 take 的段首单独听审；项目语言锁定的 ASR 可能漏掉异语言口令，不能用“转写中没有”推断“声轨中没有”。每个 take 尾部还要审查“念完了/完了/拍完了/done/finished”等仅服务拍摄流程的收工元话语：它们不属于书面文稿，必须在批准的最后一个词及嘴型闭合保护量之后删除。该 preset 默认以 1.1 倍速派生 A-roll 母版；若语种、说话人清晰度或用户要求不适合，必须显式覆盖而不是暗中变速。切点仍必须同时检查电影条、人物进入状态与波形，静音检测只能量取候选边界，不能自动决定删除。A-roll 变速后，字幕、B-roll、Zoom、转场和音效必须全部从变速后的最终声轨重建，不允许按旧时码整体缩放。A-roll 改动后字幕必须从新时间线重映射，并在最终 MP4 上逐段复核，禁止用整体平移掩盖漏句或切点错误。每段经批准的有效人声必须由 `data/captions.json` 或明确声明的等价屏幕文字覆盖；无人声区不得残留字幕。`data/caption-voice.json` 把这些批准声区固定下来；每个口播声区必须填写 `expectedText`，内容是该区实际说出的完整、按顺序的词语。构建后必须运行 `captions:voice-qa`，同时检查时间覆盖和逐词序列，任何漏词、多词、错序、提前、拖尾或跨静音显示都失败。

整体 LUFS 正规化不能代替对白内部动态处理。每个 take 的前 1 秒和波形明显上下跳变处必须以 0.1–0.2 秒窗口检查局部响度；相邻有效人声窗口修正后默认不超过 4dB 跳变。超过时先在 A-roll 派生母版使用增益包络、压缩器或两者组合平滑，再做整条响度正规化；不得把弱首字直接拉成突发大声，也不得以 BGM 或音效掩盖。

每个保留段的出点必须建立“尾词保护”：最后一个有效词的完整音节、辅音与尾音衰减均需保留，默认在确认的语音结束后留 0.08–0.25 秒保护量，并同时检查源词级时码、波形衰减与嘴型闭合。字幕里出现了词不等于声音完整；`más bajo`、`origen` 这类尾词被截断时一律 QA 失败。

`factory-acquisition` 的固定 A-roll 美颜终调使用注册表中的 `factory-neutral-skin-v1`：逐拍摄段先检查曝光和白平衡，再通过 FFmpeg 的 `colorbalance + eq + bilateral + unsharp` 做中间调提亮、降黄、边缘保护磨皮与轻回锐。该链路必须非生成式，不允许用会重建眼睛、嘴型或脸部纹理的修复模型替代真实人物；输出写入新派生母版并生成 `data/aroll-beauty.json`，禁止覆盖原 A-roll。每条真片至少检查两组不同时间点的同帧前后对照。

`social-fast` 的包装节奏还必须满足：任何转场完成后至少 2 秒才允许开始 `face-zoom`，避免连续视觉加速造成碎裂；若转场与 Zoom 的声音触发点在 2 秒窗口内相邻，只保留语义优先级较高的一条音效（CTA > 主证据转场 > Zoom），不得叠加两次提醒。相邻 B-roll 默认直接衔接，禁止在不足 0.5 秒的 A-roll 闪回后又进入下一段 B-roll。B-roll 进入点只能与当前 take 的有效起声基本同步（误差不超过约 0.08 秒），或在该 take 已连续有效口播至少 2 秒后进入；严禁用空镜遮住本应从 A-roll 删除的段首静音、口令或准备画面。若 B-roll 退出后 1 秒内存在 A-roll take 切点，默认延长 B-roll 跨过切点并保留约 0.3 秒后摇，或至少提前 2 秒结束；不得出现“上一段—空镜—下一段”在 1 秒内多次闪切。

所有外部 B-roll 在入时间线前先派生统一工作副本：MP4、1080×1920（竖屏项目）、60fps、yuv420p、TV range、Rec.709，并使用不超过 1 秒的短 GOP，保证逐帧抽取与转场寻帧稳定。低于 50fps 的源素材升为 60fps 时必须使用帧混合或运动插值，不得只复制帧；MOV/HLG/BT.2020 素材先 tone-map，再以审色抽帧检查曝光、白平衡和饱和度是否与相邻镜头一致。原文件始终只读保留。

外部图片与视频必须记录来源页、作者/提供者、许可条件和本地 SHA-256；用户自带素材记录原始路径与哈希。任何进入主轨或解释层的 B-roll 工作副本都必须移除源音轨，口播 A-roll 始终是唯一连续叙事声轨。真实证据优先于装饰性库存素材：产品照片、客户沟通、工厂/仓库、邮件或电话等画面应与当前口播语义直接对应。

## A-roll 工作母版合同（`project.json.aroll`，v2）

`aroll:treat` 把剪辑母版 `assets/aroll-cut.mp4` 处理成工作母版 `assets/aroll.mp4` 后写入：

```json
"aroll": {
  "playbackRate": 1.1,
  "treat": "social-fast-v1",
  "master": "assets/aroll.mp4",
  "cut": "assets/aroll-cut.mp4",
  "edlHash": "<sha256 data/rough-cut-edl.json>",
  "cutHash": "<sha256 剪辑母版>",
  "masterHash": "<sha256 工作母版>",
  "duration": 232.6,
  "fps": 60
}
```

- `playbackRate` / `treat` 来自 `aroll-treat/registry.json` 的预设（`factory-acquisition` 默认 `social-fast-v1` = 1.1 倍速 + 对白链），job 不写滤镜。
- `captions:build`、`qa:alignment`、`build*` 先校验 `edlHash` 与 `masterHash`：EDL 改了必须重跑 `roughcut:render` + `aroll:treat`；手工替换 `aroll.mp4` 直接拒绝。
- `qa:cuts`、`review:independent` 的切点时间按 `playbackRate` 换算。

相关文件：

| 文件 | 含义 | 谁写 |
|---|---|---|
| `data/aroll-master.json` | 处理记录：预设、滤镜、输入输出哈希与时长 | `aroll:treat` |
| `data/aroll-transcript.json` | 工作母版的一次性词级转录（按 `masterHash` 缓存） | `captions:build` |
| `data/captions.json` | 字幕，时间来自工作母版转录 + 能量谷吸附，词面来自文稿对齐 | `captions:build` |
| `data/caption-voice.json` | 人声区合同，由转录语音区生成（旧文件里的 `text-overlay` 区保留） | `captions:build` |
| `data/words-timeline.json` | 词级时间线（动效 / 重点词用） | `captions:build` |
| `data/captions-provenance.json` | 字幕来源：`masterHash`、`edlHash`、模型、文稿对齐统计；与当前母版不符 = acceptance 失败 | `captions:build` |
| `qa/alignment-report.json` | 逐 EDL 段原片↔母版互相关，`maxAbsOffsetFrames ≤ 1` 才 passed | `qa:alignment` |

时间链全貌见 `docs/timing-chain.md`。

## 审片版本与反馈

`review/R0`、`review/R1` 只增不改。创建 revision 时必须把当轮视频复制/CoW 冻结到 `review/Rn/video.mp4`，并记录成片 SHA-256、时长与当轮 EDL/字幕/beats/B-roll 等事实源哈希；验证时复核冻结视频哈希。反馈的 `start/end` 必须在视频时长内；`scope` 只允许 `project`、`client`、`template-pack` 或 `factory-profile`。默认 `project`，只有专业剪辑明确选择后才提升为长期规则。

`resolved` / `accepted` / `rejected` 必须写 `resolution`；修改过事实源时列出 `changedFiles`。Harness 可以把自然语言反馈结构化，但验证失败时不得开始改片，也不得覆盖上一轮视频。

## rough-cut-edl.json

```json
[
  {
    "source": "assets/originals/take-01.mp4",
    "sourceStart": 12.34,
    "sourceEnd": 28.91,
    "reason": "保留完整问题和第一次清晰回答"
  }
]
```

相邻段允许来自不同 take。不得用“删掉 1.2 秒静音”代替语义判断。每个段必须能解释为什么保留。

### A-roll 色彩边界

`roughcut:render` 默认使用 `--color-mode auto-sdr`。完整标记为 HLG / PQ / BT.2020 的原片必须先在进入 A-roll 时做真实 tone-map，缓存到 `assets/derived/sdr-rec709/`，再按 EDL 拼接；禁止只把 HDR 标签改成 BT.709，也禁止在最终合成后统一套 tone-map，因为那会连字幕、贴纸和主题色一起改掉。

自动路径必须失败关闭：色彩标记不完整时停止并要求人工确认，不猜测 gamma。只有人工确认素材和处理链后，才可显式使用 `--color-mode legacy`。每个转换缓存必须带 source/output SHA-256、backend、preset 和 policy version sidecar；hash 或 provenance 不匹配就重建。A-roll 先写同目录临时文件，通过画幅、时间轴、音轨、旋转、SAR 和色彩检查后原子替换，最后才发布 `color-managed-sources.json`。

默认 SDR 交付必须是 `yuv420p`、limited range、BT.709 space / transfer / primaries，且不得残留 Dolby Vision、mastering display 或 content light side data。元数据门禁只能证明交付规格；HDR 项目还必须留同帧 proxy/A-roll 视觉对照，不能把“标签全绿”当成 tone-map 正确的唯一证据。

## broll.json

```json
[
  {
    "id": "workflow-screen",
    "start": 21.2,
    "end": 27.4,
    "src": "assets/broll/workflow.mp4",
    "mode": "fullscreen-pip",
    "pipShape": "circle",
    "transition": "fade",
    "intent": "让观众看见口播所说的真实操作界面",
    "reason": "仅靠口头描述难以确认工作流长什么样"
  }
]
```

硬约束：前 3 秒默认不用；单段不超过 10 秒；不重叠；总时长不超过成片 25%；默认保留说话人小窗。`pipShape` 可选 `rounded` / `circle`，默认 `rounded`；竖屏需要圆形人像时显式写 `circle`。普通 B-roll 的 `transition` 可选 `fade` / `cut`，默认 `fade`；连续结果图需要无漏底切换时用 `cut`。

真人为主、图片只做证据时可用悬浮画框：

```json
{
  "id": "result-proof",
  "start": 87.28,
  "end": 90.84,
  "src": "assets/gallery/result.jpg",
  "mode": "floating-frame",
  "placement": "left",
  "transition": "morph",
  "coverEnter": false,
  "coverExit": true,
  "intent": "让成品图在真人肩侧提供视觉证据",
  "reason": "尾部扩成全屏可以遮住已知 A-roll 跳切"
}
```

`floating-frame` 只允许本地静态图片，`placement` 只允许 `left` / `right`，`transition` 固定为 `morph`。`motion` 默认 `float`；产品排报等需要快速物理确认时可显式选 `pop-bounce`（0.15 秒缩放 overshoot + 位移回落），禁止把这一节奏偷偷变成所有项目的全局默认。`coverEnter` 表示从全屏收回画框，`coverExit` 表示结尾把画框扩成全屏；连续片段可用这两个布尔值完成确定性的遮切。仍受单段 10 秒、总占比 25% 和不得与 primary clip 重叠的限制。

## primary-clips.json

长时间实操演示不拆成大量短 B-roll，改用主展示轨：

```json
[
  {
    "id": "workflow-demo",
    "kind": "demo-stage",
    "start": 21.3,
    "end": 84.2,
    "src": "assets/broll/workflow.mp4",
    "sourceStart": 0,
    "fit": "contain",
    "focus": { "x": 0.5, "y": 0.5 },
    "speakerPip": true,
    "transition": {
      "type": "focus-dissolve",
      "enter": 0.46,
      "exit": 0.36
    },
    "formats": ["portrait"],
    "intent": "让真实操作成为这段口播的主画面",
    "reason": "连续实操需要保留上下文，不能切碎成零散插图"
  }
]
```

现场、仓库、质检、发货等真实证据成为主画面时，使用 `proof-footage`：

```json
{
  "id": "warehouse-proof",
  "kind": "proof-footage",
  "start": 32.4,
  "end": 36.8,
  "src": "assets/proof/warehouse-walkthrough.mp4",
  "sourceStart": 4.2,
  "speakerPip": false,
  "transition": {
    "type": "whip-blur",
    "duration": 0.17,
    "exit": 0.17,
    "direction": "left"
  },
  "intent": "让观众看见真实仓储现场",
  "reason": "这是可验证服务能力的一手证据"
}
```

硬约束：`kind` 只允许 `demo-stage` / `proof-footage`；时间段互不重叠，也不得与 `broll.json` 重叠；媒体和已启用的说话人小窗都必须覆盖完整区间；`fit` 只允许 `contain` / `cover`，`demo-stage` 默认 `contain`，`proof-footage` 默认全画布 `cover`；`sourceStart` 是展示媒体的起始秒数，说话人小窗始终按成片时码同步。相邻 `proof-footage` 之间不得夹入少于 0.5 秒的 A-roll 闪回：语义连续时直接衔接，确需回到人物时至少保留 0.5 秒，并确认包含完整表情或语义动作。

`proof-footage` 只放真实、已授权、能支撑口播论点的现场媒体；不用 AI 生图、虚构产品界面或无关库存画面代替证据。只是辅助说明的短素材仍放 `broll.json`，不得为了转场把它升格为主轨。

### Primary transition preset

`transition` 可省略，省略等同 `{"type":"cut"}`。只允许四档 preset：

| `type` | 参数合同 | 语义边界 |
|---|---|---|
| `cut` | 无时长参数 | 常规 A-roll 与无需引导的证据切换，应是默认。 |
| `focus-dissolve` | `enter` / `exit` 各 0.15–0.8s；默认 0.46 / 0.36s | 从口播平稳交接到实操或需要观众看清的主证据。 |
| `whip-blur` | `enter` 为 0.13–0.20s；`exit` 为 0 或同范围；默认 0.17 / 0.17s；`direction` 只允许 `left` / `right` / `up` / `down` | 仅用于语义动量突然提高的证据交接，不作逐句装饰。 |
| `flash` | `enter` 为 0.15–0.25s；`exit` 为 0 或同范围；默认 0.20 / 0s | 仅用于重大转折或确实的时刻感，短片默认最多一次。 |

`duration` 是 `enter` 的短写，不同时写两个意图不同的值；所有非硬切的 `enter + exit` 必须小于 clip 时长。preset 只生成绝对时间的 scale / opacity / translate / blur / flash 时间线，边界会恢复 transform、filter 与 overlay，禁止随机选转场或用运行时回调改变结果。

## A-roll cues（`data/aroll-cues.json`）

纯 A-roll 内部需要短促镜头重音，或粗剪母版已经包含跨 take 硬切、需要用同一套视觉语言遮切时，使用独立 cue：

```json
[
  {
    "id": "hook-punch",
    "type": "punch",
    "start": 1.35,
    "duration": 0.2,
    "scale": 1.06
  },
  {
    "id": "answer-reveal",
    "type": "flash-punch",
    "start": 6.76,
    "duration": 0.22,
    "scale": 1.1
  },
  {
    "id": "take-change",
    "type": "whip-cut",
    "start": 7.21,
    "duration": 0.18,
    "direction": "left",
    "scale": 1.1
  }
]
```

五类 cue 都使用最终成片的绝对秒数，必须有唯一小写 `id`，且 `start + duration` 不得超出成片：

| `type` | 参数范围 | 时间语义 |
|---|---|---|
| `punch` | `duration` 0.12–0.45s；`scale` 1.02–1.18 | `start` 开始推近，约在窗口 38% 处达到最大尺度，结尾恢复。 |
| `flash-punch` | `duration` 0.15–0.30s；`scale` 1.04–1.20 | `start` 开始推近与暖闪，约在窗口 40% 处达峰，结尾恢复；只用于关键结论。 |
| `whip-cut` | `duration` 0.13–0.24s；`scale` 1.08–1.18；`direction` 为 `left/right/up/down` | `start` 是遮切窗口起点；粗剪母版中的真实切点必须对齐 `start + duration / 2`。 |
| `rgb-glitch-cut` | `duration` 0.20–0.40s；`scale` 1.06–1.14 | `start` 是遮切窗口起点；只用于确有数字/故障语义的切镜。 |
| `face-zoom` | `duration` 0.50–8.00s；`scale` 1.10–1.30；`attackFrames` / `releaseFrames` 各 8–9 帧；`focusX` / `focusY` 指向人脸中心 | `start` 随语句起声开始，以 60fps 在 8–9 帧内从 100% 推至目标比例，保持到该句尾部，再以相同帧数回到 100%；它是段落级视线引导，不是瞬时转场。 |

cue 之间不得重叠，也不得与 gallery intro、`broll.json` 或 `primary-clips.json` 的区间重叠；这些效果只写 `video-wrap` 的 transform 和各自唯一 overlay。builder 同步生成 paused GSAP 绝对时间线，窗口结束时清理 scale / translate / transform origin / overlay，不使用回调、运行时计时或随机数。`face-zoom` 必须以人脸为缩放中心，放大阶段、保持阶段、回落阶段都必须在最终 MP4 的逐帧抽样中验证。贴纸与字幕可以和 cue 同时出现，因为它们不写 A-roll transform。

工厂商业引流口播若用户没有另行指定，整条成片默认只使用约 3–4 次 `face-zoom`，按段落价值分散安排，不因每个贴纸或重点词重复触发。`focusX/focusY` 必须按当前出镜人的实际脸位逐条测量；放大后的眼鼻中轴应落在目标视觉中心附近，不复用固定坐标导致人物持续偏左或偏右。

## audio-cues.json

```json
[
  {
    "id": "proof-enter",
    "start": 32.4,
    "duration": 0.575,
    "asset": "assets/sfx/whoosh-short.mp3",
    "volume": 0.05
  }
]
```

每项必须有唯一 `id`、`start >= 0`、`duration > 0`、现存的 job 相对 `asset` 和 `volume` 0–1，且不得超出成片。`asset` 不得是绝对路径、URL 或跳出 job 目录；音效先由共享媒体引擎冻结进 `assets/`，builder 只负责确定性挂载，不临时下载、生成或随机挑选。

音效只标记少数语义事件：主证据进场、关键结论落点、CTA 确认。不给每句字幕、每张卡或每个切点配声；对话始终是主声轨。`audio-cues.json` 不表示 BGM，也不代替画面的 `transition` 意图。

提示音需要清楚可辨但不刺耳：同一版先用中等音量建立层次，再在最终混音中检查短时峰值和主观舒适度。联系型 CTA 应优先构成一个完整的视听动作组，例如邮件/电话实拍或贴纸配合克制的键盘、提示铃声；声音必须与可见动作对齐，而不是仅在结尾叠加无关冲击声。

对 `factory-acquisition`，当脚本结尾出现联系、询价、私信、写信、邮件或电话等引流话术时，默认必须使用“联系型收尾组”：真实联系动作素材（或语义明确的联系贴纸）＋可立即执行的联系卡＋与动作对齐的键盘/电话/提示铃。该组可以比中段动效更醒目，但对白始终是主声轨；中段贴纸与色卡音效不得沿用收尾 CTA 的强提醒响度。

联系型收尾组不能跨项目固定复用同一张大色卡。先按当条产品语义选择用户提供或可授权、至少 1080p 的真实产品/工厂素材作为 B-roll 背景，并冻结来源、许可和哈希；CTA 卡只保留一个明确行动和必要联系方式，使用高反差、小面积呈现。只有找不到合格语义素材时才退回通用联系贴纸，不用无关库存画面冒充产品证据。

A-roll 的提亮、轻度降噪/磨皮和轻度脸型优化只允许在原片之外生成派生母版。处理前后需要同帧对照，肤色保持自然、五官比例不变、边缘无拉伸；原始素材和既有 A-roll 母版不得覆盖。封面从人物端正、脸部清晰的审片帧派生，独立输出 `cover/cover.png`；用户要求首帧挂封面时，再生成短时长、静音、同规格的首帧视频作为确定性时间轴 clip。

## music-bed.json

连续 BGM 不再伪装成一条超长 `audio-cues`：

```json
{
  "id": "background-bed",
  "start": 0,
  "duration": 38.13,
  "asset": "assets/bgm/background-bed.m4a",
  "volume": 0.12
}
```

每个 job 最多一条 music bed。`asset` 必须冻结在 job 内，`start + duration` 不得超过成片，`volume` 为 0–1。短语义 SFX 继续放 `audio-cues.json`。要求音频门禁的 profile 在 variant 渲染后执行两遍 loudnorm，目标 `-13 LUFS / -1.2 dBTP`，再写 `qa/audio-report.json`；临时正规化文件位于 `tmp/`，成功替换成片后不保留第二份预处理视频。

## `commercial-showcase` profile extension：gallery intro

高级套图开场使用单一确定性配置，不把动画参数散落到 job：

```json
{
  "intro": {
    "enabled": true,
    "mode": "gallery",
    "duration": 8,
    "title": "XP Lite 2.0 Arctic White 上市物料",
    "assets": [
      "assets/gallery/01.jpg", "assets/gallery/02.jpg",
      "assets/gallery/03.jpg", "assets/gallery/04.jpg",
      "assets/gallery/05.jpg", "assets/gallery/06.jpg",
      "assets/gallery/07.jpg", "assets/gallery/08.jpg",
      "assets/gallery/09.jpg", "assets/gallery/10.jpg",
      "assets/gallery/11.jpg", "assets/gallery/12.jpg",
      "assets/gallery/13.jpg", "assets/gallery/14.jpg",
      "assets/gallery/15.jpg", "assets/gallery/16.jpg"
    ],
    "heroIndex": 7,
    "focusIndices": [0, 3, 6],
    "speakerPip": true
  }
}
```

`gallery` v2 只支持 9:16，时长固定 8 秒，且必须提供 16 张互不重复、位于 job `assets/` 内的本地方形 JPEG。hero 与三个 focus 索引必须互不重复；旧的两个 focus 配置会确定性补足第三张。`speakerPip=true` 时用同源 A-roll 在左上显示圆头像，并在 8 秒交界扩成全屏完成同帧交接。builder 会生成唯一时间线和 `index.motion.json`，不得在播放时随机选择卡片。

## project.json 的字幕隐藏区间

需要由大号语义贴纸完全接管文字表达时，可在 `caption.hideDuring` 写最终成片绝对时间：

```json
{
  "caption": {
    "hideDuring": [
      { "start": 0, "end": 7.298 },
      { "start": 13.458, "end": 15.733 }
    ]
  }
}
```

每项必须是有限数字 `start >= 0`、`end > start`，不得互相重叠或超出成片。任何与区间相交的整条字幕 cue 都不渲染；不要把单词切成半条字幕。普通 overlay beat 不会自动隐藏字幕，必须由 job 明确声明这些语义接管区间。

## beats.json 的画幅合同

每个 beat 可用 `formats` 明确它进入哪些成片：

```json
[
  {
    "type": "statement",
    "start": 8.2,
    "end": 12.2,
    "formats": ["portrait"],
    "kicker": "核心判断",
    "title": "竖屏才出现的卡片",
    "body": "横屏会使用另一套重排内容。",
    "accent": "不是硬裁"
  }
]
```

- `portrait`：竖屏语义，标准画布 1080×1920。
- `landscape`：YouTube 横屏语义，标准画布 1920×1080。
- 省略 `formats`：向后兼容，等同于 `["portrait", "landscape"]`，同一拍同时进入竖屏与横屏。
- 显式填写时必须是非空、无重复的数组；只允许 `portrait` / `landscape`。`vertical` / `horizontal` 是 project/layout 与目录别名，不写进 `beats[].formats`。
- builder 先校验 beat 的画幅声明没有越过 `component.json.formats`，再只保留当前目标画幅；beat 不能声明组件本身不支持的画幅。

横屏不是竖屏硬裁：允许同一语义分别写 portrait-only 与 landscape-only beat，两者仍由同一个 `build:beats` builder 和同一份数据合同构建。

## `factory-acquisition` profile extension：trade-proof beat schema

三个组件都继承 beat 的通用字段：`type`、`start`、`end`、`kicker`、`title`，以及可选 `formats`。它们解决三个不同问题：语义定位、证据累积、行动收口，不互相代用。三者的组件 manifest 都固定 `captionMode: "overlay"`：字幕保持口播主字幕样式，job 不得通过 beat 改成全屏卡字幕。

### micro-overlay

```json
{
  "type": "micro-overlay",
  "start": 5.1,
  "end": 7.4,
  "kicker": "RISK CHECK",
  "title": "Who is tracking production?",
  "variant": "question",
  "icon": "question",
  "items": ["Lead time?", "Quality?", "Dispatch?"]
}
```

- 必填 `variant`，只允许 `locator` / `action` / `question`；三者分别表达地点、流程动作、风险问题。
- 可选 `body`；`icon` 只允许 `pin` / `package` / `inspect` / `track` / `question`。
- `items` 只能用于 `question`，必须是 2–3 个非空字符串。
- 只在观众需要瞬间定位一个语义节点时短暂出现；不承担整段解说，不将普通名词变成随机贴纸。

### proof-collage

```json
{
  "type": "proof-collage",
  "start": 34.3,
  "end": 38.9,
  "kicker": "REAL WORK, ON THE GROUND",
  "title": "Proof before promises",
  "body": "Supplier visits, quality checks and dispatch.",
  "photos": [
    { "src": "assets/proof/visit.jpg", "alt": "团队到厂看样", "label": "SUPPLIER", "focus": "top" },
    { "src": "assets/proof/qc.jpg", "alt": "工作人员质检", "label": "QC" },
    { "src": "assets/proof/packing.jpg", "alt": "货物打包", "label": "PACKING" }
  ]
}
```

- 必填 `photos`，只允许 3–4 项。每项可以是本地图片路径，或 `{src, alt?, label?, focus?}`。
- `src` 必须是冻结在 job 内的 png / jpg / webp / avif，不允许 URL；`focus` 只允许 `center` / `top` / `bottom` / `left` / `right`，默认 `center`；可选 `body`。
- 仅在同一论点需要三到四份真实、已授权证据累积信任时使用。禁止把 AI 生图、示意图、重复图或无关库存图写成“客户证明”。

### cta-badge

```json
{
  "type": "cta-badge",
  "start": 60,
  "end": 61.6,
  "kicker": "READY TO IMPORT?",
  "title": "Tell us what you need",
  "action": "SEND US A DM",
  "handle": "@YOURHANDLE"
}
```

- 必填非空 `action`；可选非空 `handle` 与字符串 `body`。
- 只在结尾已建立完证据链后出现，默认 1.2–1.8 秒；行动必须可执行，例如私信、发送需求或预约沟通。
- 不用在开场，不写虚假紧迫感、价格促销或多个并列行动，不用全屏卡遮住说话人。

### `factory-commerce-pop` extension：产品网址与 UI 点击贴纸

这两个组件只属于已注册的高密度电商弹贴语言。它们仍是普通 `beats.json` clip，使用最终成片绝对时间，不从口播文字在运行时随机生成内容。

#### product-domain-pop

```json
{
  "type": "product-domain-pop",
  "start": 10.2,
  "end": 12.6,
  "kicker": "TOYS",
  "title": "example-supplier.com",
  "src": "assets/products/toy.png",
  "alt": "玩具产品透明图",
  "hitOffset": 0.16
}
```

- `src` 必须是冻结在 job `assets/` 内的本地 png / jpg / webp / avif / svg，不允许 URL、data URI 或越界路径。
- `kicker` 是短品类标签，`title` 是当下口播明确说出的域名；不得替观众编造网址或供应商背书。
- `hitOffset` 可选，表示产品落点相对 beat 开始的秒数，必须小于 beat 时长；默认 0。
- 组件在头顶安全区显示纸带、胸腹区显示产品图，人物脸部仍是主画面。只在品类和网址形成同一语义单元时使用。

#### ui-click-sticker

```json
{
  "type": "ui-click-sticker",
  "start": 28.1,
  "end": 29.8,
  "kicker": "NEXT UPDATE",
  "title": "+ Follow",
  "variant": "follow",
  "afterText": "✓ Following",
  "pressOffset": 0.72
}
```

- `variant` 只允许 `save` / `follow`；`title` 是点击前状态，`afterText` 是确认后的状态。
- `pressOffset` 可选，表示按钮压下相对 beat 开始的秒数，必须小于 beat 时长；默认 0.72 秒。
- 只在口播明确发出收藏或关注 CTA 时使用。状态切换只是视觉确认，不表示平台上的真实关注或收藏操作。
- 两组件的 `captionMode` 均为 `overlay`；普通字幕默认保留，若大贴纸完整接管文字，必须由 job 显式写 `caption.hideDuring`。

## 通过条件

1. 转录命中素材哈希缓存，不重复跑模型；`transcript:audit` 已基于原音生成声学审计。
2. 粗剪后存在逐切点电影条和波形，且 `approval.json` 已写入。
3. 没有可靠气口的 EDL 边界已逐个听审，并在切点批准中明确记录。
4. 竖屏与横屏是独立 variants，由同一个 beats builder 构建并通过 HyperFrames 检查；profile 不替代发布目标。
5. A-roll 最大关键帧间隔不超过 2 秒；标准粗剪输出固定 1 秒 GOP，避免并行 seek 黑帧。
6. 最终 MP4 规格 QA 与抽帧 QA 都完成。
7. `qa/approval.json` 明确记录是否真的完整播放；未完整播放不得标 publish-ready。
8. Shorts 默认 stream copy；不合规时必须显式允许重编码。
9. profile 要求书面脚本、music bed 或音频 QA 时，缺任一门禁都不得标 ready；普通口播不因 beats/BGM 为空而失败。
