# 一鱼多吃：一次口播，多版本成片

## 目标

一次口播拍摄，尽量产出：

- 抖音 / 视频号竖屏长版
- YouTube 横屏长版
- YouTube Shorts 竖屏版
- 可选：短切片包

核心原则：**母版优先，多版本派生**。不要从平台下载件、二压件、低码率高光片再继续切。

素材优先级：

1. YouTube 横屏长视频：未压缩 / 未剪辑原始素材，或等价相机母素材。
2. 抖音竖屏完整：可使用剪好的高码率竖屏母版。
3. YouTube Shorts：可从抖音竖屏高码率母版直接切，但默认 stream copy，不重新渲染、不重新编码。

## 内容资产层级

```text
一次拍摄
  ↓
同一语义 EDL + 干净 A-roll
  ↓
同一份字幕 / 章节 / 解释层数据
  ↓
多版本 composition
  ├→ douyin-vertical       1080x1920
  ├→ youtube-horizontal    1920x1080
  └→ youtube-shorts        1080x1920 / 可切 100-170s
```

## Variant 配置

在 `project.json` 里写：

```json
{
  "variants": [
    {
      "id": "douyin-vertical",
      "label": "抖音竖屏",
      "width": 1080,
      "height": 1920,
      "layout": "vertical",
      "outputName": "douyin-vertical-60fps.mp4"
    },
    {
      "id": "youtube-horizontal",
      "label": "YouTube 横屏",
      "width": 1920,
      "height": 1080,
      "layout": "horizontal",
      "outputName": "youtube-horizontal-60fps.mp4"
    }
  ]
}
```

构建所有版本：

```bash
npm run build:variants -- --job jobs/<slug>
```

检查所有版本：

```bash
npm run check:variants -- --job jobs/<slug>
```

渲染并 QA 所有版本：

```bash
npm run render:variants -- --job jobs/<slug>
```

交付所有版本：

```bash
npm run deliver:variants -- --job jobs/<slug>
```

切 Shorts：

```bash
npm run cut:shorts -- --job jobs/<slug>
```

切片数据写在：

```text
jobs/<slug>/data/shorts.json
```

## 竖屏版

用途：

- 抖音
- 视频号
- YouTube Shorts

规则：

- 人脸优先。
- 字幕在 lower third，不压嘴。
- 解释层少而短。
- 信息量大的解释层出现时，可以隐藏字幕。

## 横屏版

用途：

- YouTube 长视频
- B 站横屏候选

规则：

- 16:9 画布不是简单裁切竖屏。
- 必须从原始拍摄素材或等价母素材重建；不从抖音成片、YouTube 下载件或二压干净版继续做。
- 右侧保留口播主体。
- 左侧给解释卡、流程图、关键数字或真实 B-roll。
- 字幕在人物下方安全区域，不挡嘴。
- 横屏观众更能接受信息面板，但不能变成 PPT。

## Shorts 切片

之前验证过：Shorts 的核心目标是播放和涨粉，不是先导流长视频。

优先级：

1. 从母版或高码率竖屏文件切。
2. 一个 Short 一个结论。
3. 默认工程上限卡 120 秒；需要更长时必须在 `project.json` 明确调高。
4. 默认必须 `stream copy`，也就是 `ffmpeg -c copy`，不重新渲染、不重新编码。
5. 必须重编码时要写明原因，并保留高码率或低 CRF。
6. 先本地样片包，肉眼 QA 后再上传。
7. 输出必须是 1080x1920 / 60fps / AAC 音频。

## 推荐版本矩阵

| 版本 | 画幅 | 时长 | 用途 |
|------|------|------|------|
| douyin-vertical | 1080x1920 | 完整或精剪 | 抖音 / 视频号 |
| youtube-horizontal | 1920x1080 | 完整长版 | YouTube 深度内容 |
| youtube-shorts | 1080x1920 | 100-170s | YouTube Shorts 涨粉 |
| clips | 1080x1920 | 30-90s | 钩子测试 / 二次分发 |

## 不做什么

- 不从已经上传过的平台下载件继续二次剪。
- 不把竖屏强行裁成横屏。
- 不让横屏版失去口播主体。
- 不为每个平台重新手改一套字幕 HTML。
- 不先做低质量切片再反推母版。
- 不把 Shorts 切片当作一次新的 render。
