# 历史兼容区

以下能力不再属于 `talkinghead-edit` 主链。公开仓库只保留仍被兼容入口调用的最小集合：

- `scripts/create-rough-cut-edl.mjs`：静音检测 EDL，不能替代语义剪辑。
- `scripts/apply-rough-cut-cuts.mjs`：旧 cuts 二次映射。

旧 chapters/overlays builder、重复 Whisper 脚本、逐项目 builder、campaign-specific builder 与旧 brandkit 不进入公开发布物。它们只能留在私有历史中，不能接入新 job。

新 job 不得调用这些入口。需要复刻旧 job 时先迁移内容到：

- `data/rough-cut-edl.json`
- `data/captions.json`
- `data/beats.json`
- `data/broll.json`
- `project.json#variants`

只有迁移后的数据合同可以进入当前构建、QA 与交付链。
