---
name: talkinghead-edit
description: "End-to-end talking-head video editing: preserve original takes, build a cached word-level transcript, make semantic A-roll cuts, inspect every cut, calibrate captions, add restrained HyperFrames beats and justified B-roll, derive vertical/horizontal/Shorts variants, inspect the final MP4, and deliver files. Use when the user asks to 剪口播、精剪口误、做动态卡版、加字幕或 B-roll、做抖音/YouTube/Shorts 成片，or review the status of that workflow."
---

# Talking-head edit

Turn raw recordings into reviewable, reproducible deliverables. Treat speech as the main picture. Use judgment for meaning; use scripts for deterministic execution.

## Authority and source of truth

Factory root (run from a clone of this repository):

```bash
FACTORY="${FACTORY:-$(git rev-parse --show-toplevel)}"
```

Read `$FACTORY/AGENTS.md`, `$FACTORY/docs/data-contract.md`, and the job's `project.md` before editing. Job JSON files are content truth; generated HTML is render truth. Do not hand-edit generated HTML.

Keep three axes separate: `profile` describes content production, `variants` describe Douyin/YouTube/Shorts targets, and `policies` describe platform review overlays. A `factory-acquisition` job can still produce both Douyin and YouTube variants; never treat factory as a platform.

Never use:

- `talking-head-recut` for NLE editing.
- `brandkit/engine.py`, per-video campaign generators, or silence-only automatic EDL as the primary workflow.
- the console as a model runner. The Skill is the entrypoint.

## Non-negotiable gates

1. Preserve untouched recordings under `assets/originals/`.
2. Before transcription, rendering, recording, or batch work, run `df -h`; require at least 50G free.
3. Inventory pixel format, range, primaries, transfer, matrix, and display rotation. HDR or wide-gamut sources must be tone-mapped to a cached SDR Rec.709 working copy before A-roll editing; never fix HDR by retagging or by tone-mapping the final composition.
4. Transcribe each source hash once. Reuse `data/transcripts/index.json` for editing and captions.
5. Cut by semantic completeness. Remove errors, false starts, repeated meaning, and dead air, but keep roughly 0.18–0.35s natural breath when it preserves cadence. Do not optimize for maximum cut count.
6. Inspect every cut image and waveform before approving cut QA. Never approve unseen evidence.
7. Cards and B-roll must explain something difficult to understand from the face alone. If `intent` and `reason` are weak, omit them.
8. Themes come only from `themes/registry.json`. Do not invent per-job palettes.
9. Build vertical and horizontal from the same clean A-roll/EDL, not from a platform-downloaded or already packaged output.
10. Shorts default to stream copy from the high-bitrate vertical master. Re-encode only with explicit user permission.
11. Inspect final MP4 metadata and sampled frames. For SDR delivery, require `yuv420p`, limited range, BT.709 matrix / transfer / primaries, and no HDR side data. Require full-playback review by the user or a media-capable reviewer before claiming publish-ready.
12. Horizontal deliverables must fill the 16:9 canvas without synthetic left/right black bars. Never use `contain` plus `pad` as a convenience fix. Re-export natively at 16:9 or use a content-safe proportional fill crop; any pillarbox in final QA is a delivery failure.

## Workflow

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

Read `data/takes-packed.md` and `data/editor-signals.md`. The transcript is semantic evidence, not proof of fluent delivery: Whisper can silently rewrite a slurred phrase into grammatical text. Any low-confidence word, stretched alignment, or pause inside one transcript segment must be reviewed against the source audio. For multiple takes, select the clearest complete delivery, not merely the latest take.

Read the color fields in `data/source-inventory.json`. The default `roughcut:render` path uses `--color-mode auto-sdr`: Rec.709 sources pass through, recognized HDR / wide-gamut sources are converted once into a content-hash cache, and incomplete color metadata fails closed. The cache needs a matching provenance sidecar; A-roll and its manifest publish only after output validation. Do not use `legacy` merely to make the command pass. For HDR work, inspect matched source-proxy/A-roll frames; metadata alone cannot prove that pixels were tone-mapped correctly.

### 3. Write and render the semantic EDL

Write `data/rough-cut-edl.json` using the contract in `docs/data-contract.md`. Every kept range needs a short `reason`. Boundaries should avoid phonemes and visible mid-gesture jumps.

Run `transcript:audit` again after writing or changing the EDL. A word boundary without a nearby acoustic pause is not automatically safe; listen to every boundary marked `review` or `high` in `data/editor-signals.md`.

Before rendering, check disk space. Start long work in a tracked background session:

```bash
cd "$FACTORY"
npm run roughcut:render -- --job jobs/<slug>
npm run transcript:audit -- --job jobs/<slug>
npm run qa:cuts -- --job jobs/<slug>
```

Use image inspection on every `qa/cuts/cut-*.jpg`. Check mouth/gesture continuity, waveform truncation, repeated meaning, and over-tight pacing. Fix the EDL and regenerate until clean. Then and only then:

```bash
npm run qa:cuts:approve -- --job jobs/<slug> --reviewer codex --acousticReviewed true --notes "<what was checked>"
```

### 4. Build captions from the same cache

```bash
npm run captions:build -- --job jobs/<slug>
```

Calibrate names, products, English terms, punctuation, and segmentation in `data/captions.json`. Do not run Whisper again on the rough cut.

For `factory-acquisition`, read `project.json#editorial.writtenScript` before EDL or caption decisions. Preserve every unique scripted claim unless the project explicitly changes policy. Native script spelling wins over ASR subword fragments; director instructions and pre-roll breaths are not script content.

### 5. Plan beats and B-roll

Write `data/beats.json` using registered beat types. Favor fewer high-value cards; vary adjacent structures. Captions remain complete even during cards.

Write `data/broll.json` only when useful. Default mode is `fullscreen-pip`, preserving the speaker as a small window. The builder enforces: no first-3-second B-roll without `allowHook`, max 10s per segment, no overlaps, and max 25% total coverage.

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

After builder or theme changes, also rebuild and check the local `jobs/beats-regression`. The public repository intentionally ships no customer fixture: bootstrap it from `jobs/smoke`, then replace that baseline with the first approved, company-owned job when available. Never commit its media.

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

Only publish when the user explicitly asks. Use a separately configured uploader, run auth/dry-run and expected-channel checks first, and never add channel credentials to this repository.

## Completion report

Return:

- job path and Git commit;
- source count, source-to-final duration, and cut count;
- cut QA approval path;
- caption/beat/B-roll counts;
- each variant's resolution, duration, QA path, and delivery path;
- whether full playback and user review are complete;
- any publish action or remaining gate.

After an accepted milestone, commit immediately. At project completion, record executable paths and commands in the job delivery notes, never secrets.

After delivery, run `npm run storage:report`. It is read-only. Never delete originals, written scripts, current JSON truth, covers, delivery files, or approvals. Use `reports/storage/storage-plan.md` only as a review queue; `safe-rebuildable` is limited to deterministic caches, while renders/A-roll/QA evidence always require explicit review.
