# 历史兼容区

以下能力不再属于 `talkinghead-edit` 主链，只为复盘旧 job 保留：

- `scripts/build-composition.mjs`：旧 chapters/overlays builder。
- `scripts/create-rough-cut-edl.mjs`：静音检测 EDL，不能替代语义剪辑。
- `scripts/apply-rough-cut-cuts.mjs`：旧 cuts 二次映射。
- `scripts/transcribe-captions.mjs`：对粗剪重复 Whisper。
- `scripts/build-*-job.mjs`、`compose-youtube-*.mjs`：逐项目或逐画幅 builder。
- `scripts/*salesmartly*.mjs`：SaleSmartly 单项目硬编码。
- `~/.agents/skills/talkinghead-edit/brandkit/`：Python brandkit v1。

新 job 不得调用这些入口。需要复刻旧 job 时先迁移内容到：

- `data/rough-cut-edl.json`
- `data/captions.json`
- `data/beats.json`
- `data/broll.json`
- `project.json#variants`

只有迁移后的数据合同可以进入当前构建、QA 与交付链。
