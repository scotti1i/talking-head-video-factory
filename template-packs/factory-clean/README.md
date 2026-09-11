# factory-clean

真人与现场为主的克制询单模板。`pack.json` 只放脚本真读的字段（主题、字幕、B-roll 覆盖上限）。

## 编辑规则（人读）

以下规则由剪辑者 / Agent 执行，脚本不解析（2026-09-11 自 pack.json 迁出）：

- B-roll 默认全屏画中画（fullscreen-pip），优先真实证据素材；总覆盖不超过 18%（`brollPolicy.maxCoverage` 由脚本校验）。
- 需要 BGM 音床；语义音效全片不超过 3 处。
