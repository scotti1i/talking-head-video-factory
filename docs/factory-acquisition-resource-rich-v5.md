# 工厂外贸资源丰富 V5 基线

这份基线冻结 2026-08-13 经人工反馈和 Gemini A/B 复核后的西语工厂外贸成片。它是生产赛道的最低视觉与剪辑标准，不是所有口播任务的默认模板。

## 事实源

- job：`jobs/foreign-trade-time-cost-spanish-20260810`
- 内容 profile：`factory-acquisition`
- 主题：`sample-replica`
- 剪辑计划：`qa/v5-resource-rich-editorial-plan.md`
- Gemini A/B：`qa/v5-gemini-ab-review.md`
- 当前成片：`variants/douyin-vertical/renders/business-review-v5-resource-rich-spanish-30fps.mp4`
- 成片 SHA-256：`88c3f3ee412a57ee2fb85c7eeb96ed63cef13b731185e73fc0d5adceb2462610`

成片属于可重渲染的大二进制文件，不进 Git。Git 必须保存重建它所需的当前 JSON、主题、组件、媒体清单、精选商品图、BGM/SFX 和验收文档。

## 已确认的剪辑语言

1. 字幕全程存在，卡片和商品图不替代句子。
2. 镜头变化跟随语义：7 个 camera cues，4 个 A-roll transition cues。
3. 视觉元素必须带来新像素：4 张商品实物图，不重复字幕文字。
4. 视觉节制：只保留全程 topline 与 1 个地点 micro overlay，不堆解释卡。
5. 声音形成完整层次：连续低音量 BGM，9 个语义 SFX，最终走响度 QA。
6. 完整保留书面脚本中的独有信息；只删除失败重录、重复拍摄和明确无效停顿。
7. 所有突变前后都要抽帧检查，最终还需整片播放检查。

## 资源预算

- 商品图：4 张，分别对应智能手表、手机配件、充电器与线材、无线耳机。
- 信息卡：2 个视觉层，其中 topline 常驻，地点卡只出现一次。
- 镜头：7 次语义景别变化。
- A-roll 转场：4 次。
- 音效：9 个 cue，复用 4 个短音效素材。
- 音乐：1 条连续 BGM，配置音量 0.16。

新的生产赛道对比必须给每个 agent 相同的源素材、书面脚本、主题、组件、商品图、BGM/SFX 和上述预算。冷启动赛道仍保留，但不能拿它证明某个 agent 无法复现生产效果。

## 验收门

- 内容：独有脚本信息无缺失，字幕无漏句、错字和长时间空窗。
- 切点：无截断音节、跳嘴、异常手势和残留失败 take。
- 视觉：商品出现与品类词同步；卡片不遮脸、不遮字幕；无无意义动效。
- 音频：人声清楚，BGM 不压人声，SFX 不突兀，响度门禁通过。
- 画面：竖屏安全区正确，SDR Rec.709 元数据正确，无黑边或错误裁切。
- 主观：盲评至少比较完整成片；短抽样只能用于定位问题，不能替代整片判断。

## 冻结时 QA 结果

- `build:variants` 与 `check:variants`：0 error。
- 成片规格：1080×1920、30fps、H.264 `yuv420p`、limited range、BT.709，失败项为 0。
- 成片音频：-13.3 LUFS、True Peak -1.1 dBFS，音频门禁通过。
- 自动报告仍标记 `review_required`，因为工具不会把抽帧检查冒充整片人工播放。
- 已知非阻塞提示：常驻 topline 与地点卡有意叠层；动态视频背景触发 9 个对比度采样提示；语义转场缩放导致约 3px 的预期裁切溢出。
- Gemini 完整片 A/B 已通过，详情见 job 内 `qa/v5-gemini-ab-review.md`；业务方最终主观验收仍高于模型结论。

## 回归命令

```bash
node --test $(rg --files -g '*.test.mjs' -g '!jobs/**')
npm run build:variants -- --job jobs/foreign-trade-time-cost-spanish-20260810
npm run check:variants -- --job jobs/foreign-trade-time-cost-spanish-20260810
npm run render:variants -- --job jobs/foreign-trade-time-cost-spanish-20260810
npm run qa:variants -- --job jobs/foreign-trade-time-cost-spanish-20260810
```
