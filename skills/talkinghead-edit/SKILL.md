---
name: talkinghead-edit
description: "End-to-end talking-head video editing for Scott: preserve original takes, build a cached word-level transcript, make semantic A-roll cuts, inspect every cut, calibrate captions, package with the narrative-stage engine (叙事舞台 / 小Lin式 / stage3d，docs/narrative-stage.md), derive vertical/horizontal/Shorts variants, inspect the final MP4, deliver files, and prepare YouTube API publishing. Use when the user asks to 剪口播、精剪口误、做动态卡版、加字幕或 B-roll、做抖音/YouTube/Shorts 成片，or review the status of that workflow. This is the only active entrypoint; do not route to talking-head-recut or old brandkit generators."
---

# Talking-head edit

## xiaolin 模板（默认视觉包装，2026-09-03 起）

**开工必读（2026-09-07 起，不读不许写分镜）**：`$FACTORY/docs/xiaolin-taste.md`（判断手册：目标观感 / 参照成片 / 拒绝清单 / 结构上限 / 编排判断 / 审片清单 / 停机规则）+ `$FACTORY/docs/exemplars/`（三条已验收成片的分镜与抽帧条；新 job 的 `project.md` 必须写一句「模仿哪一条、哪里不同」）。出处：2026-09-05 Codex 用同一仓库同一 skill 过了全部门禁，片子仍被判不合格——门禁只查结构，判断在手册里。

Scott 说「用 xiaolin 模板剪 <视频>」（别名：叙事舞台 / 小Lin 式包装 / 我们的模板），或只说「剪 <口播视频>」且要成片包装时，走 **叙事舞台引擎**，说明书 `$FACTORY/docs/narrative-stage.md`（22 种场景形态 / stage3d 立体皮肤 / 五道编译门禁 / 素材需求单）。固定流程：

```bash
# 1. 时间线单源（成片 A-roll → turbo 转录 → 字幕 + 词表）
python3 scripts/timeline-from-aroll.py jobs/<slug>
# 2. 写 data/scene-plan.json（skin: "stage3d"；形态选型见说明书表格）+ 同步产出 MATERIAL-REQUEST.md 给 Scott 回「必须你给」栏
# 3. 编译（五道门禁：几何 / 容器 / 覆盖率 / 语义停滞 / 词锚）+ 绑定工作区
NARRATIVE_JOB=jobs/<slug> node -e "import('./scripts/shotcraft-direct-port.mjs').then(m=>m.prepareInkPressWorkspace())"
# 4. 静帧板自检：自己先看图（Read 每张 board），发现问题回到 2
node scripts/stage-stills.mjs --job jobs/<slug> --out qa/stills-v1
# 5a. 样片（默认）：540p 快编码，只出预览给 Scott 审，不进 Downloads（渲染前自动同步工作区）
node scripts/stage-render.mjs --job jobs/<slug> --proof --version vN --concurrency 2
# 5b. 独立审片（全新上下文的模型按手册 §6 十条打分；任一 ✗ 回到 2）
node scripts/stage-review.mjs --job jobs/<slug> --version vN            # --reviewer codex 也可
# 5c. Scott 看样片说「过了」→ 记录（只记他的原话，代理不得代填）
node scripts/stage-approve.mjs --job jobs/<slug> --version vN --by Scott --notes "<原话>"
# 6. 成片：没有 5b + 5c 的记录直接拒绝；1080p 60fps 高码率，自动打包到 ~/Downloads/<日期-片名-YouTube横屏-xiaolin>/
node scripts/stage-render.mjs --job jobs/<slug> --final --version vN --concurrency 2
# 7. 引擎 / 模板改过 → 参照成片回归（渲染进行中别跑）
node scripts/stage-regress.mjs
```

## 竖屏 `studio-portrait`（2026-09-07 起，Scott：口播为主、动画辅助、注意力在人身上）

- 分镜 `skin: "studio"` + `"canvas": {"w": 1080, "h": 1920}`；prepare 按 canvas 写 `Canvas.ts`，成片交付到 `~/Downloads/<日期-片名-抖音竖屏-xiaolin>/`。
- 人物三态：`full`（原片铺满）/ `focus`（推近 1.1 上移 270，整个头在画面里，下巴以下 y≥990 是下区）/ `split`（原片上移 300，脸在上半区，y 890–1385 放 16:9 第三方面板）。没有卡片化人物、没有换位，只有推近 / 上移。
- 下区（y 990–1300）放 reminders / ladder / compare / quote；贴脸胶囊只在 `full` 态（脸两侧）；第三方画面（broll panel / evidence）只在 `split` 态。开场主题卡 `title` 用 `layout: "topic"`。
- 分镜只写内容：`jobs/<slug>/data/scenes.py` 用原片秒调 `scripts/portrait_plan.py` 的 `PortraitPlan`（`topic / panel / acc / reminders / ladder / compare / quote / cta`，样例 `jobs/openai-demo-strategy-20260908/data/scenes.py`）；库负责原片秒→成片秒换算（`python3 scripts/portrait_plan.py --job jobs/<slug> 12.3` 可查）和人物时间线推导（下区场景 → focus 提前 1.1s，面板 → split 提前 0.6s，其余 full，回 full 延后 0.6s，胶囊避开换态 0.5/0.6s）。
- 竖屏流程命令（粗剪之后）：`scripts/treat-aroll.sh jobs/<slug> 1.1`（倍速 + 磨皮 + 校色 + 降噪 + 响度）→ whisper 转录 → `python3 scripts/captions-from-turbo.py --job jobs/<slug>`（术语表 `scripts/caption-terms.json`，job 私有补充 `data/caption-terms.json`）→ `python3 scripts/timeline-from-aroll.py jobs/<slug>` → `python3 jobs/<slug>/data/scenes.py` → `ALLOW_MISSING_MEDIA=1 node scripts/narrative-stage-plan.mjs --job jobs/<slug>` → `scripts/stage-chain.sh jobs/<slug> vN "批准备注"`（绑工作区 → 样片 → 独立审片 → 批准 → 成片，任一步失败即停；别再从旧 job 复制 chain.sh）。
- 剪辑节奏按手册 §5-11：5s 内进爽点，解释性三类一律 reject。
- 审片：竖屏「休息」= full 态 ≥4s；下区卡片压在衣服上不算压脸（`stage-review.mjs` 已带竖屏说明）。spec `docs/skin-studio-portrait-spec.md`，参照 `docs/exemplars/astra-computer-use-portrait`。

**停机规则（高于「继续想办法」）**：只有 `stage-render.mjs` 能出成片。Chromium 起不来、工作区无标记、登录态失效 → 停下报告原因 + 已试的两种修法，等 Scott；禁止自造 FFmpeg / 录屏 / 其它后备渲染链，禁止用「像的」模板顶替（2026-09-05 Codex 事故）。门禁全绿 ≠ 创作合格，汇报里分开写。

**回路**：Scott 每次看片挑刺当场落 `docs/reviews/<日期>-<job>-feedback.md`（原话 / 处理 / 落在哪）；job 收尾把能量化的进手册 §4 + 编译器，能模板化的进组件，只能判断的进手册 §2 / §5 / §6。并发：渲染 8 并发在 95s 片上卡死过两次（帧缓存 4.7GB × 8），`--concurrency 2` 稳定。

**先样片后成片是硬流程**：Scott 没有明说「这次就要成片」，一律先 `--proof` 给他看；他说通过 / review 过了，再 `--final`。成片文件夹里只留最新一版。

素材判定四类（`MATERIAL-REQUEST.md`）：第一人称事实必须 Scott 给；公开网页我抓（`scripts/web-evidence.sh`，英文页聚焦句带 `note` 中文译注）；物件 / 动画 / 辅助 B-roll 我造（图 Codex CLI → APIMart 兜底；视频即梦 CLI 队列 <2000 才用 → APIMart 兜底）；拿不准先问。禁止拿相关公开页顶替他的第一人称素材。

Turn raw recordings into reviewable, reproducible deliverables. Treat speech as the main picture. Use judgment for meaning; use scripts for deterministic execution.

## Authority and source of truth

Factory root:

```bash
FACTORY=~/talking-head-video-factory   # 改成你 clone 到的路径
```

Read `$FACTORY/AGENTS.md`, `$FACTORY/docs/data-contract.md`, and the job's `project.md` before editing. Job JSON files are content truth; generated HTML is render truth. Do not hand-edit generated HTML.

Keep three axes separate: `profile` describes content production, `variants` describe Douyin/YouTube/Shorts targets, and `policies` describe platform review overlays. A `factory-acquisition` job can still produce both Douyin and YouTube variants; never treat factory as a platform.

Never use:

- `talking-head-recut` for NLE editing.
- `brandkit/engine.py`, per-video Python generators, SaleSmartly-specific builders, or silence-only automatic EDL as the primary workflow.
- the console as a model runner. The Skill is the entrypoint.

## Non-negotiable gates

1. Preserve untouched recordings under `assets/originals/`.
2. Before transcription, rendering, recording, or batch work, run `df -h`; require at least 50G free.
3. Inventory pixel format, range, primaries, transfer, matrix, and display rotation. HDR or wide-gamut sources must be tone-mapped to a cached SDR Rec.709 working copy before A-roll editing; never fix HDR by retagging or by tone-mapping the final composition.
4. Transcribe each source hash once. Reuse `data/transcripts/index.json` for editing and captions.
5. Before writing the EDL, map every repeated take and final complete delivery in `data/semantic-take-map.json`. Every kept EDL range must be covered by a `complete` keep range; a transcript fragment is not proof of a complete thought.
6. Write `data/editorial-plan.json` before the EDL. Every story beat must reference complete take ids; every EDL segment must reference one `storyBeatId` and one `takeId`. Run the plan check and bind an independent review before rough-cut rendering.
7. Cut by semantic completeness. Remove errors, false starts, repeated meaning, and dead air, but keep roughly 0.18–0.35s natural breath when it preserves cadence. Do not optimize for maximum cut count.
8. Listen to the complete rough cut and every hashed `review-cut` MP4 with context before approving cut QA; images and waveforms are supporting evidence only. Exporting WAV/base64, reading metadata, or setting a CLI boolean does not count as listening. If the current agent cannot actually receive/play audio, route this gate to the user, a human, or an audio-capable media model and do not self-approve.
9. Captions, cards, B-roll, and primary clips must inherit the same story-beat ids. Cards and B-roll must explain something difficult to understand from the face alone. If `intent` and `reason` are weak, omit them.
10. Themes come only from `themes/registry.json`. Do not invent per-job palettes.
11. Build vertical and horizontal from the same clean A-roll/EDL, not from a platform-downloaded or already packaged output.
12. Shorts default to stream copy from the high-bitrate vertical master. Re-encode only with explicit user permission.
13. Inspect final MP4 metadata and sampled frames. For SDR delivery, require `yuv420p`, limited range, BT.709 matrix / transfer / primaries, and no HDR side data. Require full-playback review by the user or a media-capable reviewer before claiming publish-ready.
14. Horizontal deliverables must fill the 16:9 canvas without synthetic left/right black bars. Never use `contain` plus `pad` as a convenience fix. Re-export natively at 16:9 or use a content-safe proportional fill crop; any pillarbox in final QA is a delivery failure.

## Workflow

> 小Lin 式连续视觉叙事（同一对象持续生长、人物换位、概念缩成提醒）不走 beats 卡，走叙事舞台：写 `data/scene-plan.json` → `npm run visual:stage` → Remotion `NarrativeStage`。说明书 `docs/narrative-stage.md`，首个全片样片 `jobs/gmv-max-xiaolin-stage-20260902`。

### 1. Resolve or create the job

Use the supplied job if one exists. Otherwise:

```bash
cd "$FACTORY"
npm run new -- <slug>
```

Choose the content profile and targets explicitly when known, for example `--profile factory-acquisition --targets douyin,youtube`. New jobs default to `clean-talkinghead` plus Douyin only; YouTube is never silently rendered.

Copy or link raw takes into `jobs/<slug>/assets/originals/`. Fill `project.md` with the single audience problem, must-keep claims, must-remove defects, packaging boundary, and deliverables.

### 2. Inventory and cached editor transcript

```bash
cd "$FACTORY"
npm run inventory -- --job jobs/<slug>
npm run transcribe:editor -- --job jobs/<slug>
npm run transcript:audit -- --job jobs/<slug>
npm run status -- --job jobs/<slug>
```

Read `data/takes-packed.md` and `data/editor-signals.md`. The transcript is semantic evidence, not proof of fluent delivery: Whisper can silently rewrite a slurred phrase into grammatical text. Any low-confidence word, stretched alignment, or pause inside one transcript segment must be reviewed against the source audio. For multiple takes, first fill `data/semantic-take-map.json`: record the recording/retry pattern, each complete kept delivery, rejected duplicates, and their replacements. Select the clearest complete delivery, not merely the latest take or the cleanest-looking transcript fragment. Then fill `data/editorial-plan.json`: audience problem, thesis, narrative strategy, story beats, complete take references, visual roles, and exclusions. The full contract is `docs/planner-contract.md`.

Read the color fields in `data/source-inventory.json`. The default `roughcut:render` path uses `--color-mode auto-sdr`: Rec.709 sources pass through, recognized HDR / wide-gamut sources are converted once into a content-hash cache, and incomplete color metadata fails closed. The cache needs a matching provenance sidecar; A-roll and its manifest publish only after output validation. Do not use `legacy` merely to make the command pass. For HDR work, inspect matched source-proxy/A-roll frames; metadata alone cannot prove that pixels were tone-mapped correctly.

### 3. Write and render the semantic EDL

Write `data/rough-cut-edl.json` using the contract in `docs/data-contract.md`. Every kept range needs a unique `id`, `storyBeatId`, `takeId`, and short `reason`; it must be fully covered by that `complete` keep range in `data/semantic-take-map.json`. Boundaries should avoid phonemes and visible mid-gesture jumps.

Before rough-cut rendering, run and independently review the plan:

```bash
npm run editorial:check -- --job jobs/<slug>
npm run editorial:approve -- --job jobs/<slug> --reviewer <reviewer> --method <human|fresh-context-agent|media-model> --notes "<logic and coverage checked>"
```

Run `transcript:audit` again after writing or changing the EDL. A word boundary without a nearby acoustic pause is not automatically safe; listen to every boundary marked `review` or `high` in `data/editor-signals.md`.

Before rendering, check disk space. Start long work in a tracked background session:

```bash
cd "$FACTORY"
npm run roughcut:render -- --job jobs/<slug>
npm run transcript:audit -- --job jobs/<slug>
npm run qa:cuts -- --job jobs/<slug>
```

First play the complete rough cut from beginning to end with audio. Then play every `qa/cuts/review-cut-*.mp4`; use `cut-*.jpg` only to support mouth/gesture and waveform inspection. Record what was actually heard for the full rough cut and every cut in `qa/cuts/listening-review.json`, keep the generated paths and SHA-256 unchanged, set each verdict and the sequence verdict to `pass`, and identify the real reviewer/method. Fix the EDL and regenerate until clean; regeneration invalidates the old listening record. Then and only then:

```bash
npm run qa:cuts:approve -- --job jobs/<slug> --reviewer <approver> --notes "<what was checked>"
```

### 4. Build captions from the same cache

```bash
npm run captions:build -- --job jobs/<slug>
```

Calibrate names, products, English terms, punctuation, and segmentation in `data/captions.json`. Each generated caption inherits `storyBeatId` and `edlSegmentId`; preserve those links when calibrating. Do not run Whisper again on the rough cut.

For `factory-acquisition`, read `project.json#editorial.writtenScript` before EDL or caption decisions. Preserve every unique scripted claim unless the project explicitly changes policy. Native script spelling wins over ASR subword fragments; director instructions and pre-roll breaths are not script content.

### 5. Build visual context, choose weapons, and compile the plan

Do not jump from transcript lines to cards. Read `$FACTORY/visual-recipes/QUICKSTART.md`; it is the low-token operating manual. Do not load the 155-recipe registry into context. First scaffold the facts, assets, face analysis, user approvals, research, and explicit unknowns:

```bash
cd "$FACTORY"
npm run visual:context -- --job jobs/<slug>
npm run visual:plan:init -- --job jobs/<slug>
```

Review `data/visual-context.json`. The initialized plan covers every real EDL segment with the face as a safe baseline. Record semantic deductions under `analysis` with `basis` and exact `supports`; record external facts under verified `research`; record private facts, rights, taste, and prohibitions under approved `userInputs`. A gap with `resolver=tool-analysis/agent-research/user` may only be resolved by `analysis:/research:/user:` evidence respectively, and that evidence must support every declared `requires` capability. Captions prove literal speech only; they cannot impersonate structure analysis, verified data, or provenance. Local media is not usable merely because it exists: record provenance and rights. Leave an unresolved gap explicit and keep `face`; never invent a screenshot, fact, relationship, English label, or “golden quote” to fill it.

For each story beat, ask whether the face already communicates enough. When a visual materially improves understanding, classify the job and query only short production summaries:

```bash
npm run visual:recipes -- search --query "<visualJob> <content keyword>"
npm run visual:recipes -- show --id <chosen-recipe-id>
```

Default search exposes only content-adaptable, production-approved weapons. `--scope all` is research only; an unported result cannot enter a job. Write `data/visual-plan.json` with one visual main track: face, a directly ported Shotcraft recipe, or one rights-cleared B-roll asset. Every non-face shot needs `storyBeatId`, `intent`, `reason`, `contextEvidence`, `assetRefs`, speaker state, and confidence. Every `requirementCoverage` reference must also appear in `contextEvidence` and declare the matching `supports` capability. PIP/split requires measured `face-safe-layout`. Recipe props may replace registered content only; timing, easing, color, shadow, camera, transition, and SFX remain upstream truth.

Compile the plan rather than hand-copying it into execution files:

```bash
npm run visual:plan:check -- --job jobs/<slug>
npm run visual:prepare -- --job jobs/<slug>
npm run visual:render -- --job jobs/<slug>
npm run visual:qa -- --job jobs/<slug>
npm run visual:qa:approve -- --job jobs/<slug> --reviewer <name> --method four-phase-filmstrip --notes "<实际检查结果>"
npm run visual:compile -- --job jobs/<slug>
```

The compiler writes native recipe clips to `primary-clips.json` and rights-cleared evidence media to `broll.json`, preserving manual entries. It fails on unresolved blocking context, unknown rights, overlapping recipe/B-roll shots, stale media hashes, or unsupported content parameters.

Use `data/beats.json` only for lightweight registered HyperFrames overlays that are not already represented on the visual main track. Each still needs a unique `id`, `storyBeatId`, `intent`, and `reason`; do not duplicate a recipe or B-roll message. Captions remain complete except during an approved full-screen recipe where the composition itself carries the same information.

After compilation and any lightweight beats are ready:

```bash
npm run visual:check -- --job jobs/<slug>
```

The report binds editorial plan, EDL, captions, visual context, visual plan, beats, B-roll, and primary clips. Any upstream edit invalidates it.

Continuous BGM belongs in `data/music-bed.json`; `data/audio-cues.json` is only for short semantic SFX. Profiles that require audio QA normalize the rendered audio to the declared target and then run `qa-audio`; do not keep pre-normalization copies after a successful deterministic replacement.

For user recordings or screen captures, stage files under `assets/broll/`. For needed images/icons, load `media-use` and resolve them into the job; keep its manifest. Never fabricate a screenshot of a real product UI when an authentic capture is required.

### 6. Build and inspect the compositions

```bash
cd "$FACTORY"
npm run build:beats -- --job jobs/<slug>
npm run build:variants -- --job jobs/<slug>
npm run check:variants -- --job jobs/<slug>
```

Use the local pinned HyperFrames dependency. Snapshot the hook, every beat/B-roll boundary, and exit frames. Inspect the images. Horizontal output must be a real re-layout: talking head on the right, explanatory surface on the left; never stretch or hard-crop a vertical packaged video.

After builder or theme changes, also rebuild and check `jobs/beats-regression`.

### 7. Review render, final render, and QA

Check disk again. Render a short or draft review first; show it to the user when the edit or visual direction materially changed. After acceptance, start the final render as a tracked background process:

```bash
npm run render:variants -- --job jobs/<slug>
```

Run final QA for each rendered variant. Inspect all QA frames, not only the preview HTML. Report honestly whether full playback was completed or remains a user gate.

After inspecting every frame, record the gate per variant. Set `--fullPlayback true` only when the final MP4 was actually watched end to end:

```bash
npm run qa:final:approve -- --job jobs/<slug>/variants/<id> --reviewer codex --fullPlayback false --notes "<what was checked>"
```

### 8. Shorts, delivery, and publishing

If `data/shorts.json` exists:

```bash
npm run cut:shorts -- --job jobs/<slug> --mode copy
```

Deliver without deleting user-added cover files:

```bash
npm run deliver:variants -- --job jobs/<slug>
npm run status -- --job jobs/<slug>
```

Only when the user explicitly asks to publish. 封面 / 抖音创作者中心定时 / YouTube Shorts 批次的完整操作法在 `$FACTORY/docs/publishing.md`（封面只走 skill `video-cover-factory`、`codex exec` 的 stdin 要接 /dev/null；抖音用 `scripts/cors-static-server.py` 灌文件、封面弹窗 input 按 class 选、只收 JPG；Shorts 批次复制 `jobs/shorts-batch-20260910/` 改 specs.py；YouTube 用 `<你的 youtube-upload 工具目录>/publish_single.py`，先 dry-run 和频道核对，OAuth 只在 Scott 明说时代点、绝不输密码）。Use browser upload only after API authentication is confirmed broken and the user agrees.

## Completion report

Return:

- job path and Git commit;
- source count, source-to-final duration, and cut count;
- editorial plan and independent approval paths;
- cut QA approval path;
- caption/beat/B-roll counts;
- visual-context gap count, visual-plan shot count, chosen production recipes, and compiled native/B-roll ids;
- each variant's resolution, duration, QA path, and delivery path;
- whether full playback and user review are complete;
- any publish action or remaining gate.

After an accepted milestone, commit immediately. At project completion, update the Vault project note with executable paths and commands, never secrets.

After delivery, run `npm run storage:report`. It is read-only. Never delete originals, written scripts, current JSON truth, covers, delivery files, or approvals. Use `reports/storage/storage-plan.md` only as a review queue; `safe-rebuildable` is limited to deterministic caches, while renders/A-roll/QA evidence always require explicit review.
