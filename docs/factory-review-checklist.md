# 工厂口播成片 · 独立审片清单（v2）

> 用法：`npm run review:independent -- --job jobs/<slug> --revision Rn` 把本清单「审片清单」一节原文、静帧板和门禁报告交给一个**没有剪辑上下文**的模型逐条打分；任一 ✗ 即不过，acceptance 失败。
> 出处：2026-09-11 客户审计——8 条真片 96 条审片反馈里，同一缺陷平均被投诉 2–5 轮；原因是每轮只响应最后一句话，没有固定标准。下面 10 条就是那 96 条反馈的归纳，每条注明看什么证据。

## 审片清单

1. **段首状态**：每个 A-roll 段的第一个可见帧已经在说话状态（嘴型、表情、手势都进入口播），没有吸气、举手、找镜头、拍摄者口令（含异语言）。证据：每个切点后 0.05s / 0.3s 的帧；`qa/dialogue-continuity-report.json` 段首 ≤0.08s。
2. **尾词完整**：每段结尾最后一个词的发音和尾音衰减完整，字幕出现了词不等于声音完整；成片不得在词没说完时结束。证据：切点前 0.1s 帧、`qa/alignment-report.json`、`qa/caption-voice-report.json`。
3. **字幕覆盖与词面**：每个有声区都有字幕，无声区没有残留字幕；字幕逐词与文稿一致，不漏词、不多词、不错序（`proveedor adecuado` 少了 `adecuado` 就是 ✗）。证据：`qa/caption-voice-report.json` 必须 passed；抽帧里的字幕文字与 `data/captions.json` 一致。
4. **字幕同步**：字幕不早于起声出现，不晚于起声 80ms；上一条不拖进下一句。证据：`qa/alignment-report.json` 最大偏差 ≤1 帧；每个字幕切换点前后 0.05s 的帧对（前一帧还是旧字幕、后一帧已是新字幕）。
5. **字幕版式**：全片同一条 Y 基线（A-roll、B-roll、画中画都一样）、同一字号、在平台安全区内、不越界、不压脸、重点词只是变色不加框。证据：抽帧。
6. **切点干净**：相邻段之间没有手位 / 表情 / 头位跳变穿帮；有跳变的切点必须被 B-roll 或转场遮住，而不是靠观众不注意。证据：每个切点前后 2 帧的帧对。
7. **B-roll 纪律**：相邻 B-roll 之间不夹 <0.5s 的 A-roll 闪回；B-roll 不用来遮未剪掉的静音或口令；每段 B-roll 与当下口播语义对应；1 秒内不出现「上一段—空镜—下一段」三次切换。证据：抽帧 + `data/broll.json` / `data/primary-clips.json` 的 intent。
8. **Zoom 与动效**：全片 face-zoom 3–4 次、以脸为中心（放大后眼鼻中轴在画面中心附近，不偏左右）、转场后 ≥2s 才 zoom、8–9 帧推进保持到句尾再回落，不是一闪即回。证据：`data/aroll-cues.json` + zoom 峰值帧。
9. **对白响度与音效**：相邻有声窗口响度跳变 ≤4dB；开场首句不能比后面明显轻；音效清楚可辨但不盖人声、不刺耳，开场与收尾有可听的提示音。图看不出听感，所以证据只认报告：`qa/dialogue-continuity-report.json` 响度项 + `qa/audio-report.json`；缺任一报告 = ✗。
10. **收尾 CTA**：只有一个可执行动作（私信 / 邮件 / 电话），1.2–1.8s，不遮脸不遮字幕，与真实联系动作素材或语义贴纸成组，音效与动作对齐。证据：最后 3 秒抽帧。

## 三条不要误判

- 画面角落的说话人小窗（画中画）是模板形态，不是第三方人脸。
- 下区色卡压在衣服 / 胸口上是设计内的，只有盖住五官才算压脸。
- 段首 0.05s 帧里嘴微张但已发声（报告段首 ≤0.08s）算通过；只有明显吸气 / 举手准备才算 ✗。

## 附录 · 历史反馈回归清单（客户 2026-08-28 至 09-04，96 条）

acceptance 通过后，用下表对照一遍成片；每一行都是被至少投诉 2 轮的缺陷。

| 缺陷 | 曾出现的 job / 轮次 | 对应清单条 |
|---|---|---|
| 拍摄者口令 / 准备段 / 收工元话语残留 | import R1；china R0；solar R0、R1、R2；test1 R2；test3 R2 | 1 |
| 无信息停顿、气口太松 | import R0、R1；china R0；solar R0；test1 R2 | 1 |
| 词尾截断 / 整句误删 | china R0（Pero、origen）；solar R0（más bajo）、R2（proceso、contáctanos） | 2 |
| 字幕漏词 / 错词 | import R3（adecuado）；solar R0（populares）、R2（Desde）、R3（Nosotros、Si estás） | 3 |
| 字幕与人声不同步 / 无声区残留 | helpful-sites R0–R4（14 条）；import R0、R1、R2；china R0；solar R1 | 4 |
| 字幕字号 / Y 轴跳动 / 越界 | b2b-tk R3、R4；import R3、R7；solar R0 | 5 |
| 手位跳切没遮住 | b2b-tk R0、R1、R5、R6、R7（同一处 5 轮） | 6 |
| B-roll 闪回 / 遮静音 / 收尾跳画面 | import R0；solar R0（3 条） | 7 |
| Zoom 瞬间往返 / 太频繁 / 脸偏 / 转场后立刻 zoom | import R2、R3、R4；china R0 | 8 |
| 音效太软 → 太吵 → 刺耳来回 | import R3–R7（5 轮）；helpful-sites R6–R8；b2b-tk R7、R8 | 9 |
| 开场人声偏轻 / 响度跳变 | solar R0、R1；alfredo ×4（手写增益） | 9 |
| CTA 位置 / 图标黑边 / 封面遮脸 | b2b-tk R7、R9；import R4、R5 | 10 |
