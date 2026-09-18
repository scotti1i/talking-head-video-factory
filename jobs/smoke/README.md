# Job 模板

每条口播视频一个 job。建议流程：

1. 把未剪原片放进 `assets/originals/`，不要先覆盖母素材。
2. 跑 `npm run inventory` 与 `npm run transcribe:editor`，生成素材清单和可复用词级转录。
3. 审核 `data/rough-cut-edl.json` 后渲染粗剪，再用 `npm run qa:cuts` 逐切点验收。
4. 校准 `data/captions.json`，排 `data/beats.json`；只有确实帮助理解时才填 `data/broll.json`。
5. 在项目根目录执行 `npm run build:beats -- --job jobs/<slug>`。
6. 进入 job 目录执行 `npm run check && npm run render:final`。
7. 回项目根目录执行最终 MP4 QA 和交付。

多版本输出：

```bash
npm run build:variants -- --job jobs/<slug>
npm run check:variants -- --job jobs/<slug>
npm run render:variants -- --job jobs/<slug>
npm run deliver:variants -- --job jobs/<slug>
```

注意：`data/*.json` 是内容事实源，`index.html` 是可重复构建的渲染事实源。不要手写大量字幕或卡片 HTML。
