# Lessons Learned

## 2026-06-11 字幕烧录事故

### 问题

字幕、章节和解释性浮层在预览里看起来有，但最终 MP4 没有稳定生效。

### 根因

早期实现用 `tl.call()` 运行时修改 DOM：

```js
tl.call(() => {
  cap.textContent = "...";
  cap.style.opacity = "1";
}, [], start);
```

这对预览可能有效，但最终逐帧捕获不是按人类播放方式从头跑一遍。捕获某一帧时，之前的 callback 不一定已经按预期修改 DOM。

### 修正

每一条字幕、章节、解释层都必须是静态 clip：

```html
<div
  class="clip caption"
  data-start="12.30"
  data-duration="2.40"
  data-track-index="1001"
>
  这里是字幕
</div>
```

### 新规则

- 不用 timeline callback 改字幕文本。
- 不用 timeline callback 控制解释层是否存在。
- 不用预览判断烧录成功。
- 必须抽最终 MP4 帧检查。

## 交付文件夹事故

### 问题

用户把封面图手动放进交付文件夹，但我误以为“只保留这个”是只保留 MP4，把封面删了。

### 修正

`deliver.mjs` 默认不删除目标文件夹里的任何用户文件。封面如果已存在，保留用户版本，不覆盖。

### 新规则

- 自动化脚本不清空 Downloads 目标文件夹。
- 如果必须清理，必须只清理脚本自己生成且可识别的文件。
- 用户手动放进去的封面图默认是有效交付物。

## 视觉规则

- 口播视频不是 PPT。
- 人脸优先，信息层辅助。
- 字幕不是越上越好；不能长期压嘴。
- 信息量大的解释层出现时，可以隐藏字幕。
- 章节提示必须等钩子讲完再出现。

## 渲染参数

长视频最终交付优先：

```bash
npx --yes hyperframes@0.5.6 render --fps 60 --quality standard --workers 8 --video-bitrate 24M --output renders/final-60fps.mp4
```

`high` 质量在长视频最终编码阶段更容易被系统杀掉。公开视频发抖音，`standard + 24M + 60fps` 更稳。

## 一鱼多吃

以前 YouTube Shorts 验证过：不要从二压高光短切继续生产。正确顺序是母版优先：

1. 先保留高质量 A-roll 母版。
2. 再派生抖音竖屏 / YouTube 横屏 / Shorts。
3. Shorts 更适合播放和涨粉；长视频是内容母库。
4. 横屏版要重新布局，不要硬裁竖屏。
