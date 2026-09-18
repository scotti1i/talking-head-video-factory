# talking-head-video-factory 协作规范

## 目标

把口播视频剪辑工程化：稳定处理 A-roll、字幕、章节、解释性浮层、最终 MP4 QA、交付文件夹和 Vault 记录。

## 唯一入口

- 日常入口只有 `talkinghead-edit` Skill；Skill 做语义判断，仓库脚本做确定性执行。
- 唯一合同见 `docs/data-contract.md`。原片→哈希词级缓存→完整 take 地图→内容结构计划→语义 EDL→切点 QA→缓存重映射字幕→beats/B-roll→variants→最终 QA/交付；规划器合同见 `docs/planner-contract.md`。
- `npm run console` 仅兼容查看旧 job，不作为新工作流或模型入口。
- 旧 Python brandkit、`build-composition.mjs`、SaleSmartly 专用 builder 不得接入新 job。
- 内容生产 `profile`、发布 `variants`、平台 `policies` 是三条正交轴：普通口播/录屏/商单/工厂外贸不能和抖音/YouTube 画幅混成同一个枚举。

## 主题与 beats(风格铁律)

- 风格只能从 `themes/registry.json` 选,禁止逐 job 手搓配色/新模板;新增风格走 `docs/theme-replication.md` 的截图复刻流程。
- 所有画幅走 `npm run build:beats` / `build:variants`(同一 builder、同一数据)。
- 改 builder 或主题后,必须用 `jobs/beats-regression` 构建并通过 `npm run check`;该 job 同时是主题预览图取景棚。

## 硬规则

- 人说话是主画面，所有包装都服务理解，不抢主体。
- 原片放 `assets/originals/`；编辑与字幕共用一次词级转录缓存，禁止重复 Whisper。
- EDL 必须按语义完整性写，并引用内容结构段和完整 take；禁止用静音检测直接决定剪辑。每个切点必须带声音审听，电影条和波形只作辅助证据。
- 内容计划、切点、视觉引用和最终成片批准都绑定当前输入与媒体哈希；上游变化后旧批准自动失效。
- 字幕、章节、解释层必须是确定性的时间轴 clip，不能靠运行时 DOM 改内容。
- 交付前必须检查最终 MP4，不只看预览。
- 不删除用户手动放进交付文件夹的文件；清理必须显式指定范围。
- 文件夹里如果用户放了封面图，默认保留。
- 每条视频都要留下 job 配置、数据文件、QA 抽帧和交付路径。
- 交付后运行 `npm run storage:report`；原片、书面脚本、当前数据、封面、delivery 与 approval 永不进入安全清理。`renders/work-*`、tmp、缩略图和波形缓存才是确定性 safe-rebuildable；A-roll、历代成片和 QA 帧必须人工确认。
- 默认先考虑一鱼多吃：一次 A-roll 母版 + 一份字幕数据，派生竖屏、横屏、Shorts 等 variant。
- Shorts 从母版或高码率竖屏派生，不从平台下载件继续二压。
- YouTube 横屏长视频必须从未压缩 / 未剪辑原片或等价母素材重建，不从抖音成片、平台下载件、二压件继续做。
- 横屏成片必须真实填满 16:9 画布，禁止用 `contain` / `pad` 人为补左右黑边。源画幅偏窄时优先回 Screen Studio 导出 16:9；可以安全裁掉菜单栏、Dock 等非内容边缘时，才等比放大后做内容安全裁切。最终 MP4 抽帧发现 pillarbox 即 QA 失败，不得交付。
- YouTube Shorts 可以从抖音竖屏成片母版切，但默认必须走 stream copy；只有源文件规格不合规且用户明确同意时，才允许重编码。
- YouTube 上传默认走 `~/Documents/code/youtube-upload/` 的 YouTube Data API 工具；单条成片用 `publish_single.py`，批量课程用 `upload.py`，先跑 `auth.py` 或 dry-run 校验频道。不要优先走 Chrome / Studio 手工上传，除非 API 认证失效且用户明确同意。

## HyperFrames 规则

- HTML 是 source of truth。
- 独立 composition 不使用 `<template>`。
- video 必须 `muted playsinline`，音频用单独 `<audio>`。
- 所有 timed 元素必须有 `data-start`、`data-duration`、`data-track-index`。
- `window.__timelines["main"]` 必须同步注册，即使只有空 timeline。

## 口播包装审美

- 竖屏 1080x1920 优先。
- 横屏 1920x1080 要重排版，不硬裁竖屏。
- 字幕默认在 lower third，不压嘴。
- 章节提示轻、短、透明。
- 解释层可以覆盖 B-roll，但默认不长时间挡脸。
- 字体、字号、边距按手机观看设计，不按电脑幻灯片设计。
