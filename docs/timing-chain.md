# v2 时间链（原片 → 剪辑母版 → 工作母版 → 字幕 → 门禁）

> 2026-09-11。取代 v1「原片词级缓存 → EDL 累加映射 → 字幕」的做法。根因与实验见 `docs/reviews/2026-09-11-client-audit.md` §2。

## 一张图

```
assets/originals/*.mov ──transcribe:editor──▶ data/transcripts/*（剪辑决策用，不再喂字幕）
        │
        ▼ data/rough-cut-edl.json（人 / Agent 写，原片绝对秒）
roughcut:render ──▶ assets/aroll-cut.mp4      剪辑母版：原速；视频段 trim=end_frame 封顶，音频采样级精确
        │
aroll:treat ──────▶ assets/aroll.mp4          工作母版：倍速 / 对白链 / 限幅（aroll-treat/registry.json 预设）
        │           project.json.aroll = { playbackRate, treat, master, edlHash, cutHash, masterHash, duration, fps }
        ├─ captions:build ─▶ data/aroll-transcript.json（只转录这一份，按 masterHash 缓存）
        │                    → 能量谷吸附词边界 → 文稿词面校正 → data/captions.json + data/caption-voice.json + data/words-timeline.json
        ├─ qa:alignment ──▶ qa/alignment-report.json（每个 EDL 段原片↔母版互相关，≤1 帧）
        └─ qa:cuts / build / render …（sourceVideo = 工作母版）
```

## 合同

| 字段 | 谁写 | 谁读 | 不符时 |
|---|---|---|---|
| `project.json.aroll.edlHash` | `aroll:treat` | `captions:build`、`qa:alignment`、`build*` | 「EDL 已改动但工作母版未重做」拒绝执行 |
| `project.json.aroll.masterHash` | `aroll:treat` | 同上 | 「工作母版被改动过」拒绝执行（手工替换 aroll.mp4 无效） |
| `project.json.aroll.playbackRate` | `aroll:treat`（来自预设） | `qa:cuts`、`qa:alignment`、`review:independent` | — |
| `data/captions-provenance.json.masterHash` | `captions:build` | acceptance | 字幕不是当前母版出的 = FAIL |

## 为什么每一步这样做

1. **粗剪视频段封顶**：`trim,fps` 把段量化到整帧（ceil），音频 `atrim` 精确；`concat` 取较长者并给音频补静音，每切点 ≤1 帧、只增不减。加 `trim=end_frame=floor(dur·fps)` 后视频永不长于音频，末尾由 `fps` 补帧填空。实验：30fps×40 切点 241ms → 0.02ms。
2. **倍速进管线**：`atempo` 与 `setpts` 由预设固定；合同记倍率与哈希。字幕、切点证据、审片抽帧全按合同换算，不再手工传参数。
3. **成片音轨单源**：字幕从工作母版转录出，天然与成片对齐；任何改音轨长度的步骤（倍速、处理）都在转录之前发生。原片转录只用于剪辑决策。
4. **能量谷吸附**：whisper token 尾时码常拖进静音（葡语片 5 轮不收敛的根因之一）。出点收到最后有声帧 + 80ms，入点提到起声，语种无关。`-dtw` 若可用会优先使用（1.9.2 对 turbo 返回 -1）。
5. **文稿词面校正**：拉丁语系按词做序列对齐（Needleman–Wunsch，相似度 ≥0.66 视为同词），ASR 错词换文稿原文，ASR 漏词并入相邻词，确保「字幕逐词覆盖文稿」；CJK 跳过。
6. **人声区合同从转录生成**：`caption-voice.json` 的 regions 与 expectedText 由词表推出，`captions:voice-qa` 不再是「拿字幕校验字幕」；旧文件里的 `text-overlay` 区保留。
7. **对齐门禁**：每段取原片 0.6s 参考（同倍速处理）在母版预期位置 ±0.35s 内做归一化互相关；任一锚点偏差 >1 帧或相关 <0.5 失败。它同时暴露 concat 漂移、倍速错位、手工替换母版。

## 命令顺序（factory-acquisition）

```bash
npm run inventory -- --job jobs/<slug>
npm run transcribe:editor -- --job jobs/<slug>
npm run transcript:audit -- --job jobs/<slug>
# 写 data/rough-cut-edl.json
npm run roughcut:render -- --job jobs/<slug> --fps 60 --width 1080 --height 1920
npm run aroll:treat -- --job jobs/<slug>            # 预设按 profile 默认 social-fast-v1
npm run captions:build -- --job jobs/<slug>
npm run qa:alignment -- --job jobs/<slug>
npm run qa:cuts -- --job jobs/<slug>
npm run captions:voice-qa -- --job jobs/<slug>
npm run dialogue:qa -- --job jobs/<slug>
npm run build:variants -- --job jobs/<slug> && npm run render:variants -- --job jobs/<slug>
npm run review -- init --job jobs/<slug> --revision R0 --video <variant render>
npm run review:independent -- --job jobs/<slug> --revision R0
npm run acceptance -- --job jobs/<slug>
```

## 不再允许

- 对 `review/Rn/video.mp4`、`renders/*` 做任何再加工（脚本硬拒）。
- 手写 `atempo` / `setpts` / `volume=if(...)` / `subtitles=` / `delogo`：需要的能力走 `npm run request`。
- 手工编辑 `data/captions.json` 的时间；改词面走文稿（`editorial.writtenScript`）后重跑 `captions:build`。
