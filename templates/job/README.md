# Job 模板

每条口播视频一个 job。建议流程：

1. 把未剪原片放进 `assets/originals/`，不要先覆盖母素材。
2. 跑 `npm run inventory` 与 `npm run transcribe:editor`，生成素材清单和可复用词级转录。
3. 先听原片并完成 `data/semantic-take-map.json`，再填 `data/editorial-plan.json`；每段 EDL 必须引用 `storyBeatId` 和 `takeId`。
4. 运行 `npm run editorial:check -- --job jobs/<slug>`，由独立上下文或真人复核后再批准内容计划。
5. 渲染粗剪；`npm run qa:cuts` 后必须完整审听粗剪和每条带声音切点片，填写 `qa/cuts/listening-review.json` 才能批准。
6. 校准字幕；解释卡片、B-roll 和主展示轨都必须引用同一个 `storyBeatId` 并写明 `intent` / `reason`，空数组合法。
7. 运行 `npm run visual:check -- --job jobs/<slug>`，再构建、检查和渲染 variants。
8. 回项目根目录执行最终 MP4 QA 和交付。

多版本输出：

```bash
npm run build:variants -- --job jobs/<slug>
npm run check:variants -- --job jobs/<slug>
npm run render:variants -- --job jobs/<slug>
npm run deliver:variants -- --job jobs/<slug>
```

注意：`data/*.json` 是内容事实源，`index.html` 是可重复构建的渲染事实源。不要手写大量字幕或卡片 HTML。
