# Design

两套视觉体系:**成片包装**(每套视觉家族独立,见 themes/、components/ 与历史资产注册表)与**App UI**(固定暗房工作台)。视觉库详细合同见 [docs/visual-library-design-spec.md](docs/visual-library-design-spec.md)。

## 一、成片包装(视频本体)

Mobile-first vertical talking-head explainer system. The speaker stays primary; captions are readable on phone screens; beats clarify dense arguments without turning the piece into a desktop slide deck.

- 色板/字体/卡片解剖 **一律由主题定义**:`themes/<id>/theme.json`(约 30 tokens)+ `overrides.css`。现有 6 款见 [docs/theme-replication.md](docs/theme-replication.md)。历史色板(#07110f/#2ef2a2)已收编为 `neon-forest` 主题。
- 结构不随主题变:底部安全区卡片、全量字幕、caption-over-card 避让。

### What NOT to Do(成片)

- 不长时间遮眼睛/嘴;字幕不压嘴。
- 不用 generic 渐变球/装饰噪点。
- 非 B-roll 段不做全屏幻灯片。
- 烧录内容不依赖 preview-only 状态,必须最终 MP4 抽帧验证。
- 不逐条视频手搓新配色——新风格 = 新主题,走截图复刻流程。

## 二、App UI(console/public/)

暗房工作台:成片画面是界面里最亮的东西;琥珀只给主行动与当前态。register: product(见 PRODUCT.md)。

### Colors(OKLCH,`console/public/style.css :root`)

- 背景层:`--bg` 0.17/0.014/65 · `--surface` 0.21 · `--surface-2` 0.24 · `--inset` 0.14(输入/日志凹陷)
- 文字:`--text` 0.93 · `--text-2` 0.76(≥4.5:1) · `--dim` 0.62(仅辅助)
- 强调:`--accent` 琥珀 0.83/0.09/70(≈#f6c07f,与 warm-glass 同源);`--accent-deep`(主按钮底)
- 语义:`--ok` / `--warn` / `--bad`;策略 Restrained——琥珀只出现在主行动、当前工位、选中态。

### Typography

Inter + PingFang SC 单家族;固定 rem 阶(1.125):12/13/14(基准)/16/20;等宽只用于日志与 JSON;标题 `text-wrap: balance`。

### 视觉库

- 一级入口为 `视觉库 | 视频项目`，默认进入视觉库。
- 左侧按视觉家族逐套管理；主区只展示当前家族，避免跨体系失真比较。
- 资产卡 80% 以上是真实 poster；hover/focus 才懒加载动态预览。
- 主题、画幅、状态、兼容性都是筛选维度；YouTube 横屏是一等能力。
- 失败、过期、历史和不支持资产必须保留可见。

### Components

- **工位卡**:圆角 12;状态圈 ○/▶/✓;折叠用 grid-rows 0fr→1fr 动画。
- **按钮**:`.accent` 主行动 / 默认次级 / `.ghost` 三级,全交互状态齐备。
- **资产卡**:真渲染 poster + 状态；模板自身色板保持原样，选中态只用 App 琥珀描边。
- **编辑表**:输入静默透明,hover/focus 显边;表头 sticky。
- **运行抽屉**:底部毛玻璃 + 收起后右下运行胶囊延续状态。

### Motion

150/240ms ease-out-quart;只表达状态(折叠/抽屉/hover/modal/运行 pulse);`prefers-reduced-motion` 全局 1ms;禁 bounce、页面级入场编排。z 语义:drawer 40 / modal 60 / toast 80。
