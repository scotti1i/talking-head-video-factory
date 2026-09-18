# Production Polish Audit

## Immediate Defaults

- Center real software demos as the main focal point.
- Use a full-screen mask behind demo scenes instead of lower-third demo cards.
- Keep subtitles disabled unless the caption source is verified as a real transcript.
- Use low-volume audio cues only for structural transitions, never under every sentence.

## Current Priorities

1. Split the generated composition into sub-compositions.
   - `build-composition.mjs` is over the project line budget.
   - HyperFrames lint warns that generated `index.html` is large.
   - Suggested split: `aroll-layer`, `chapters`, `hud-overlays`, `demo-focus`, `captions`, `audio-cues`.

2. Add a real animation map QA step.
   - Run an animation summary after significant motion changes.
   - Catch repeated eases, dead zones, and unintended exits before full render.

3. Add a small audio-mix check.
   - Verify the final file has one primary voice track plus optional cue tracks.
   - Keep cue volume below the voice, around `0.03` to `0.06` for this style.
   - Add loudness normalization only at final-delivery stage, not rough review.

4. Make demo focus configurable per clip.
   - Data fields to support later: `presentation`, `frameHeight`, `maskStrength`, `cue`.
   - Default `presentation` should be `center-focus` for real recordings.

5. Improve contrast warnings without making cards opaque.
   - Current design intentionally uses translucent overlays on moving video.
   - Better fix: text backplates and stronger shadows, not solid blocks.

6. Avoid rebuilding YouTube horizontal from vertical platform exports.
   - Keep using source/proxy material for horizontal variants.
   - Build horizontal as a distinct layout, not a hard crop.

## Nice To Have

- Add beat markers for future music beds.
- Add two alternate HUD skins: compact label-only and full explainer.
- Add optional before/after split-screen for software demos.
- Add a `render:review:fast` preset for 12M quick reviews and keep `24M+` for brand review.
