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
| `qa/cuts/approval.json` | 所有切点已逐张检查 | 人 / Agent |
| `data/captions.json` | 校准后的最终字幕 | 人 / Agent |
| `data/beats.json` | 解释性卡片 | 人 / Agent |
| `data/broll.json` | B-roll 时间、素材、意图与理由 | 人 / Agent |
| `data/primary-clips.json` | 长段主展示媒体、源时码与说话人小窗 | 人 / Agent |
| `data/audio-cues.json` | 语义节点上的短音效、时间和音量 | 人 / Agent 定语义，脚本校验 |
| `data/music-bed.json` | 全片或长段连续 BGM；与短音效分离 | 人 / Agent 定语义，脚本校验 |
| `data/aroll-cues.json` | 纯 A-roll 的短促镜头冲击与跨 take 遮切 | 人 / Agent 定语义和切点，脚本校验 |
| `data/shorts.json` | Shorts 语义区间 | 人 / Agent |
| `qa/approval.json` | 最终 MP4 抽帧与完整播放状态 | 人 / Agent |
| `qa/audio-report.json` | profile 要求下的响度与 true peak 门禁 | 脚本 |
| `review/Rn/manifest.json` | 冻结审片视频哈希、时长与当轮事实源哈希 | 脚本 |
| `review/Rn/feedback.json` | 时间码、类别、修改指令、作用域、状态和处理结果 | 专业剪辑 / Agent 结构化 |

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

硬约束：`kind` 只允许 `demo-stage` / `proof-footage`；时间段互不重叠，也不得与 `broll.json` 重叠；媒体和已启用的说话人小窗都必须覆盖完整区间；`fit` 只允许 `contain` / `cover`，`demo-stage` 默认 `contain`，`proof-footage` 默认全画布 `cover`；`sourceStart` 是展示媒体的起始秒数，说话人小窗始终按成片时码同步。

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

三类 cue 都使用最终成片的绝对秒数，必须有唯一小写 `id`，且 `start + duration` 不得超出成片：

| `type` | 参数范围 | 时间语义 |
|---|---|---|
| `punch` | `duration` 0.12–0.45s；`scale` 1.02–1.18 | `start` 开始推近，约在窗口 38% 处达到最大尺度，结尾恢复。 |
| `flash-punch` | `duration` 0.15–0.30s；`scale` 1.04–1.20 | `start` 开始推近与暖闪，约在窗口 40% 处达峰，结尾恢复；只用于关键结论。 |
| `whip-cut` | `duration` 0.13–0.24s；`scale` 1.08–1.18；`direction` 为 `left/right/up/down` | `start` 是遮切窗口起点；粗剪母版中的真实切点必须对齐 `start + duration / 2`。 |

cue 之间不得重叠，也不得与 gallery intro、`broll.json` 或 `primary-clips.json` 的区间重叠；这些效果只写 `video-wrap` 的 transform 和各自唯一 overlay。builder 同步生成 paused GSAP 绝对时间线，窗口结束时清理 scale / translate / overlay，不使用回调、运行时计时或随机数。贴纸与字幕可以和 cue 同时出现，因为它们不写 A-roll transform。

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
