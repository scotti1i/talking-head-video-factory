# Windows + DeepSeek Harness 试点方案

## 结论

本机开发后可以整体迁移，而且应该这样做。产品代码、模板包、Agent Skill 和部署检查组成无客户数据的版本化迁移包；Windows 只提供 Inbox / Outbox，实际仓库和中间缓存运行在 WSL2 的 Linux 文件系统。客户原片、转录、审片记录与 Key 永远不进入迁移包或 git。

DeepSeek Harness 暂不 fork、不二开内核。仓库提供项目级 `.agents/skills/factory-auto-edit/SKILL.md`，Harness 从 git 根目录启动后发现它；模型负责语义判断，脚本负责哈希、转录、EDL 渲染、模板、QA 和版本冻结。

## 操作全流程

```text
Windows Inbox
  → 只读预检与哈希复制
  → 固定文稿 + 词级转录缓存
  → 语义 EDL（只精剪气口、口误、失败重拍）
  → 切点电影条/波形批准
  → 选择 fine-cut preset + template pack
  → R0 MP4 + QA + 冻结 manifest
  → 专业剪辑完整播放并给时间码反馈
  → Harness 把反馈结构化为 project/client/template-pack/factory-profile
  → 只修改数据事实源，重新构建为 R1
  → 最终 MP4 / SRT / 干净 A-roll / EDL / QA / 反馈记录进入 Outbox
```

不会覆盖 R0；每轮审片都冻结视频哈希与当时的数据文件哈希。模板改进只有在专业剪辑明确把反馈标为 `template-pack` 后才进入模板，避免一个客户的偏好污染所有项目。

## 机器与速度

现场照片确认当前是 i5-12400、16GB RAM、Windows 10，计划更换 RTX 5060。试点最低可用，但生产建议升级 Windows 11 和 32GB RAM；16GB 在转录、浏览器渲染和 Harness 同时运行时容易交换内存。素材和 job 应放 WSL 的 `~/...`，不能直接在 `/mnt/c` 或 `/mnt/d` 上渲染。

本次隔离样片的已测数据（Mac，非目标 Windows）：

| 阶段 | 样片 | 已测时间 |
|---|---:|---:|
| A-roll 粗剪渲染 | 45.6 秒 / 1080×1920 | 约 8 秒 |
| 包装成片渲染 | 45.6 秒 / 30fps / 24Mbps | 24.4 秒 |
| 结果 | 1080×1920 H.264 | -13.3 LUFS，完整 BT.709 QA 通过 |

RTX 5060 的目标机预算不应先用宣传数字拍脑袋。迁移后用同一 45.6 秒样片跑一次基准，记录：Whisper 倍速、A-roll 倍速、包装渲染倍速、显存峰值和整机 RAM 峰值。验收目标是包装渲染不慢于 1× 实时、5 分钟素材从导入到 R0 不超过 20 分钟；专业审片时间不计入自动化耗时。

## 迁移与回滚

1. 在干净 commit 上运行 `npm run deploy:bundle`；脚本排除全部 `jobs/`，不是只排除当前试点。
2. 将 `dist/*.tar.gz` 和 `.sha256` 复制到目标机，在 WSL 中验哈希并解压。
3. 运行 `npm ci`，再从 `deploy/windows/` 执行宿主检查、生产 doctor 和 Harness 启动脚本。
4. Key 只放 `~/.config/talking-head-factory/env`；模板资源在仓库，Whisper 模型与转录缓存是目标机本地状态。
5. 迁移失败时切回上一个 bundle；客户 Inbox/Outbox 与仓库版本分离，不受代码回滚影响。

## 试点验收

- 同一批真实素材能从 Inbox 生成 R0，且 Inbox 哈希不变。
- 文稿句序和独有内容不被删除。
- 每个切点有电影条、波形和批准记录。
- 可从注册表选择至少 3 个模板包，job 不手搓 CSS。
- R0 接受不少于 3 条专业剪辑的时间码反馈后生成 R1，R0 哈希不变。
- 最终 MP4 通过画幅、fps、音频、色彩、抽帧与人工完整播放门禁。

## 建议推翻

- 建议推翻“现在就二开 DeepSeek Harness”：它仍是开发者预览版，先用项目 Skill + 脚本合同验证 10 条真实视频，只有 UI 或权限边界被证实卡住时再写插件。
- 建议推翻“直接输出剪映工程作为第一交付”：先把 MP4 + EDL + SRT 的自动链跑稳；剪映工程只作为专业剪辑接管的可选适配器，不能成为内容真相。
