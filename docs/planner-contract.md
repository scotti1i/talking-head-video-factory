# 规划器合同 v1

规划器负责语义判断，脚本负责确定性执行。它不能从转录直接跳到切点；`data/editorial-plan.json` 是完整表达选段与 EDL 之间唯一允许的内容结构层。

## 输入

- `project.md` / `project.json`：受众问题、交付边界、内容 profile 与平台目标。
- `data/transcripts/index.json` / `data/takes-packed.md`：词级证据，不等于流利表达。
- `data/editor-signals.json`：声学风险，只能辅助判断。
- `data/semantic-take-map.json`：听过原片后确认的完整表达与淘汰 take。

## 输出

规划器必须写：

1. `data/editorial-plan.json`：这条片子如何回答观众问题。
2. `data/rough-cut-edl.json`：把结构计划落实成原片绝对时间段。
3. `data/visual-context.json`：视觉可依赖的事实、素材、工具分析、外部研究、用户输入与未解决缺口。
4. `data/visual-plan.json`：从全人物安全基线出发，只增加有证据的生产配方或核权 B-roll。

`data/recipe-renders.json`、由视觉计划生成的 `broll.json` / `primary-clips.json` 和 `visual-plan-compiled.json` 属于编译器输出，不由 Planner 重复手写。`beats.json` 只保留不与视觉主轨重复的轻量 HyperFrames 包装。

字幕不是第二次规划。`captions:build` 从同一份词级缓存和 EDL 生成，并继承结构引用。

## editorial-plan.json

```json
{
  "schemaVersion": 1,
  "audienceProblem": "观众不知道平台是否强制标注 AI 内容",
  "thesis": "平台规则不同，不能把一个平台的要求套到另一个平台",
  "narrativeStrategy": "先纠正常见误解，再给平台规则和行动结论",
  "sourcePolicy": "preserve-order",
  "createdBy": {
    "name": "Codex",
    "method": "agent",
    "model": "当前实际模型标识",
    "skill": "talkinghead-edit"
  },
  "storyBeats": [
    {
      "id": "story-001",
      "role": "hook",
      "claim": "网上流传的不标 AI 就限流并非通用规则",
      "purpose": "纠正观众带进来的错误前提",
      "takeIds": ["take-final-01"],
      "visualRole": "face"
    },
    {
      "id": "story-002",
      "role": "evidence",
      "claim": "亚马逊与 TikTok 的规则对象不同",
      "purpose": "用真实规则证明平台差异",
      "takeIds": ["take-final-02"],
      "visualRole": "evidence",
      "visualReason": "规则原文比人物复述更可信"
    }
  ],
  "exclusions": [
    {
      "claim": "第一次口误版本",
      "reason": "已被 take-final-01 的完整表达替代"
    }
  ]
}
```

`sourcePolicy` 只有两种：

- `preserve-order`：保持原始论述顺序，只清理错误、重复和等待。
- `allow-semantic-reorder`：允许为了明确叙事重新排列完整表达，必须在 `narrativeStrategy` 说明原因。

`visualRole` 只有 `face` / `evidence` / `explanation` / `atmosphere` / `none`。除 `face` 和 `none` 外必须填写 `visualReason`。

Agent 或混合规划必须记录实际模型标识和 `talkinghead-edit` Skill；这不是质量证明，而是让回归时能识别模型或规则版本变化。

## visual-context 与 visual-plan

先运行：

```bash
npm run visual:context -- --job jobs/<slug>
npm run visual:plan:init -- --job jobs/<slug>
```

初始化计划按真实 EDL 建立全人物基线，不做审美猜测。Planner 逐段判断人物是否已经足够；需要补充时，先查询生产武器，再读选中武器的完整记录和机器可读内容合同：

```bash
npm run visual:recipes -- search --query "<visualJob> <内容关键词>"
npm run visual:recipes -- show --id <recipe-id>
```

每个视觉镜头必须记录 `storyBeatId`、起止时间、`intent`、`reason`、人物状态、`contextEvidence`、`assetRefs` 和置信度。`mode=recipe` 只能使用 `production-approved + content-adaptable` 配方，并以 `direct-port` 传入合同允许的真实内容；`upstream-original` 只用于基准预览。`mode=broll` 只能引用一个版权状态已知的本地图片或视频。未解决缺口阻塞对应视觉时保留 `face`。

证据是带能力类型的账本，而不是任意引用：

- `analysis:`：从完整表达或已检查素材中推导顺序、步骤、实体和概念结构；必须记录 `basis` 与 `supports`，不能宣称数据或来源已核实。
- `research:`：外部事实与来源；必须 `verified`、有 `sources`，并明确 `supports`。
- `user:`：私有事实、版权、审美和禁区；必须 `approved` 并明确 `supports`。
- `automatic:captions`：只支持原话、开场或 CTA 等字面证据，不自动支持 `ordered-items`、`verified-data` 或 `source-provenance`。

`requirementCoverage` 使用的引用必须同时出现在 `contextEvidence`，而且其 `supports` 必须包含该 requirement。`gap.resolver` 与引用前缀严格对应；PIP 或分屏没有 `face-safe-layout` 时失败并回退人物全屏。

配方与 B-roll 共用唯一视觉主轨，不得互相重叠。完成计划后依次运行：

```bash
npm run visual:plan:check -- --job jobs/<slug>
npm run visual:prepare -- --job jobs/<slug>
npm run visual:render -- --job jobs/<slug>
npm run visual:qa -- --job jobs/<slug>
npm run visual:qa:approve -- --job jobs/<slug> --reviewer <name> --method four-phase-filmstrip --notes "<实际检查结果>"
npm run visual:compile -- --job jobs/<slug>
```

## 统一引用链

每条新合同 EDL 必须写：

```json
{
  "id": "edl-001",
  "storyBeatId": "story-001",
  "takeId": "take-final-01",
  "source": "assets/originals/take-01.mp4",
  "sourceStart": 12.34,
  "sourceEnd": 28.91,
  "reason": "保留完整误解、纠正和落句"
}
```

引用链必须连续：

```text
storyBeatId
  └─ takeId
      └─ EDL id
          ├─ captions.edlSegmentId
          └─ visual-context / visual-plan
               └─ beats / broll / primary-clips.storyBeatId
```

解释卡片、B-roll 和主展示轨还必须有唯一 `id`、`intent` 与 `reason`。模板类型、颜色或素材路径不能代替“帮助观众理解了什么”。

## 五道门禁

1. **内容计划**：结构段完整、引用真实 keep take、顺序符合 `sourcePolicy`；独立复核绑定 project、计划、take map 与 EDL 哈希。
2. **EDL**：每段有唯一 id，并同时引用结构段和完整 Take；脚本验证时间区间覆盖。
3. **听审**：完整粗剪和逐切点带声音审听；批准绑定 EDL、计划、声学报告、听审文件和媒体哈希。
4. **视觉引用**：上下文缺口、生产武器、素材核权、视觉计划和编译执行轨都能追溯到结构段；每个配方镜头完成入场、动作、稳定、退场四阶段审查，媒体或电影条变化后批准失效。
5. **最终成片**：规格报告绑定最终 MP4、全部抽帧和当前内容/视觉数据；任何上游变化都使旧批准失效。

执行命令：

```bash
npm run editorial:check -- --job jobs/<slug>
npm run editorial:approve -- --job jobs/<slug> --reviewer <name> --method fresh-context-agent --notes "<检查内容>"
npm run visual:context -- --job jobs/<slug>
npm run visual:plan:init -- --job jobs/<slug>
npm run visual:plan:check -- --job jobs/<slug>
npm run visual:prepare -- --job jobs/<slug>
npm run visual:render -- --job jobs/<slug>
npm run visual:qa -- --job jobs/<slug>
npm run visual:qa:approve -- --job jobs/<slug> --reviewer <name> --method four-phase-filmstrip --notes "<实际检查结果>"
npm run visual:compile -- --job jobs/<slug>
npm run visual:check -- --job jobs/<slug>
```

## 会话与模型漂移

- 真源只在 job 文件，不依赖聊天记忆。
- 规划和批准分开；批准记录复核人、方法和证据哈希。
- 允许切点存在小幅判断差异，但不允许核心观点覆盖、结构顺序、完整表达与视觉理由漂移。
- 不确定时标记失败并回到原片；转录文本不能替代听原片。

## 旧 job

旧 job 不会被脚本自动伪造为已审查。它仍可打开和预览，但工作流状态会明确显示缺少内容计划或旧批准失效。迁移时必须重新听原片、补 `semantic-take-map.json` 与 `editorial-plan.json`，再给 EDL、字幕和视觉数据补引用；不能把旧 EDL 的每一段机械宣称为完整表达。

可以先生成不触碰当前事实源的提案：

```bash
npm run editorial:migrate -- --job jobs/<legacy-slug>
```

输出只写入 `data/migration-proposal/`，所有完整性状态保持待复核；脚本不会改写当前 EDL、字幕、视觉数据或批准文件。
