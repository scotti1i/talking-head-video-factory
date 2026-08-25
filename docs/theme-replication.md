# 主题模板与授权参考素材分析流程

风格不许逐条视频发明。每种视觉 = `themes/<id>/` 下的一个主题包,选主题是控制台"包装"工位的一个开关。

## 主题包结构

```text
themes/
├── registry.json          # 注册表:default + themes 列表 + 铁律
├── _shared/
│   ├── fonts/             # 冻结字体(构建时硬链接进 job)
│   └── vendor/gsap.min.js # 冻结动效引擎
└── <id>/
    ├── theme.json         # label / description / fonts / tokens(约 30 个设计令牌)
    ├── overrides.css      # 可选:结构级改造(追加在基础 CSS 之后)
    └── preview.jpg        # 真渲染预览(控制台主题卡展示用)
```

`build:beats` 只认 tokens + overrides.css;拍子数据(beats.json)与主题完全解耦——同一条视频换主题只需重新构建,不改数据。

## 参考素材分析流程（新增主题的唯一正道）

只使用公司自有、公开许可或已取得书面授权的参考视频。分析目标是提取可复用的版式语言，不复制人物、logo、文案、地图、商品图或专有媒体资产：

1. **确认权利**：记录参考素材来源和授权范围；不能确认再分发权的帧只保存在本机，不进入 git。
2. **采样**：从已授权素材截取 5-8 张信息卡出现瞬间，保存在本机 `themes/<新id>/reference/`；公开仓库默认忽略该目录。
3. **拆解**：对着截图回答四件事——
   - 色板:底色 / 主文字 / 强调色 / 卡片底(渐变?玻璃?纯色?)
   - 字排:标题字重字号、正文字体(衬线感?手写感?)、kicker 处理
   - 卡片解剖:圆角、描边、顶线、投影、模糊
   - 布局气质:卡片贴哪个安全区、留白密度
4. **落 tokens**：复制 `themes/warm-glass/theme.json` 为 `themes/<新id>/theme.json`，把拆解结果逐个填进 tokens。结构级差异写进 `overrides.css`。
5. **注册**：把 id 加进 `themes/registry.json`。
6. **对照验证**：用回归 job 构建、抽帧，并与授权参考图并排比对：
   ```bash
   node scripts/build-beats-composition.mjs --job jobs/beats-regression --theme <新id>
   cd jobs/beats-regression && ../../node_modules/.bin/hyperframes snapshot . --at <代表性时间点>
   ```
7. **出预览**：满意后生成只含自有素材的预览图，并把回归 job 恢复默认主题：
   ```bash
   ffmpeg -y -i jobs/beats-regression/snapshots/<抽帧文件>.png -vf scale=540:-2 -q:v 4 themes/<新id>/preview.jpg
   node scripts/build-beats-composition.mjs --job jobs/beats-regression
   ```
8. **冻结**：主题一旦用于成片就冻结；要演进就改 tokens 并记录版本，全量统一，不逐条漂。

> 只抽象色板、字排、卡片解剖和安全区关系。不得照抄内容、logo、人物、地图或第三方媒体；无法确认权利的参考帧不得公开提交。

## 现有主题

| id | 定位 |
|----|------|
| `warm-glass` | 默认。深棕暖玻璃，不挡脸、全字幕 |
| `pastel-ledger` | 奶白纸卡、打字机字距、糖果数据色、贴纸 kicker |
| `field-notes` | 米黄档案纸、重衬线、砖红马克笔、胶带贴片 |
| `signal-yellow` | 黑幕荧光黄、扁平硬边、海报冲击 |
| `steel-blueprint` | 冷灰蓝工程制图、hairline、等宽标注、橙红强调 |
| `neon-forest` | 墨绿霓虹技术视觉 |

> 注：跨平台部署不得依赖系统专有字体。生产需要的字体必须具有可再分发许可，并冻结进 `_shared/fonts/`。

## 回归基准

公开仓库故意不分发任何客户原片或历史 job。首次安装运行 `npm run smoke`，再把无隐私基线复制为 `jobs/beats-regression`；首条公司自有真片获批后，用它替换为本地常驻基准，但不要提交媒体：

```bash
cp -R jobs/smoke jobs/beats-regression
```

- 改 builder / 主题后必须在这里重新构建并通过 `npm run check`；
- 真片基准应覆盖字幕、至少三类 beat、B-roll 和横竖屏 variant；
- 预览图只能使用公司自有或已获再分发授权的内容。
