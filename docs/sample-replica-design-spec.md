# `sample-replica` 视觉复刻规格

## 目标

只复刻用户给定样片 `3543 / 3544 / 3545` 的视觉语言与剪辑节奏，不沿用 `trade-proof` 的自创卡片，不为展示能力增加样片中没有的新组件。

## 对标截图

- 字幕：`reports/foreign-trade-talkinghead-reference-20260806/keyframes/3545-keyword-caption-02.40.jpg`
- 动作标签：`reports/foreign-trade-talkinghead-reference-20260806/keyframes/3543-action-label-07.60.jpg`
- 问题气泡：`reports/foreign-trade-talkinghead-reference-20260806/keyframes/3544-question-bubble-14.60.jpg`
- 地图：`reports/foreign-trade-talkinghead-reference-20260806/keyframes/3545-map-11.80.jpg`
- CTA：`reports/foreign-trade-talkinghead-reference-20260806/keyframes/3545-cta-22.60.jpg`
- 动态电影条：`3543-labels-5fps.jpg`、`3544-questions-5fps.jpg`、`3545-map-5fps.jpg`、`3545-cta-5fps.jpg`

## 色板与字体

- 字幕白：`#FFFFFF`
- 当前词黄：`#FFFF00`
- 字幕描边：`#000000`
- 动作标签蓝：`#17257F`
- 问题卡紫：`#7900E8`
- CTA 粉：`#FF5EB8`
- CTA 橙：`#FF9A1F`
- 字体：`Arial Black`；本机系统字体作为冻结渲染环境，覆盖拉丁字母与西里尔字母。

## 版式

- 画幅：`1080 × 1920`。
- 字幕：水平居中，基线约在画面高度 `78%`；最大宽度 `90%`；每组最多 3 个词、最多 2 行；全大写；粗黑描边，无投影。
- 逐词高亮：同一字幕组保持不动，只把当前发音词切成黄色；其余词恢复白色。
- 问题卡：顶部居中，左约 `14%`、上约 `12%`、宽约 `72%`；白底紫字，大圆角。
- 动作标签：中下部居中，左约 `12%`、宽约 `76%`；白底蓝字、直角；图标与标签分离并在其上方。
- CTA：顶部居中，宽约 `40%`；粉/橙重字与信封图形，和字幕保持垂直分离。
- 地图：顶部居中，左约 `15%`、上约 `10%`、宽约 `70%`，不覆盖脸。

## 动效与声音

- 主转场以硬切为主；章节切换才使用一次 `4–6f` directional whip/blur。
- 标签进场 `5–6f`，短促 pop/overshoot；退场 `4–6f`，不拖尾。
- 问题卡从侧上方进入，配轻 whoosh；动作标签和 CTA 配短 pop；强结论可配一次 impact。
- 不铺常驻 BGM；SFX 必须低于人声并在手机外放可辨。

## 三个禁止项

1. 禁止出现 `trade-proof` 的巨型黄字、深色身份章、蓝底动作条或网页式信息卡。
2. 禁止随机添加样片没有的颜色、glitch、纸撕、360° 旋转或多套转场家族。
3. 禁止因贴图隐藏正常字幕；只有样片同款顶部问题卡出现时，允许短暂暂停字幕。
