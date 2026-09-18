---
name: video-cover-factory
description: "Generate or revise polished video covers directly with GPT Image 2 from real source-video face references, including natural skin/color correction, identity consistency, locked series styling, and separate 3:4, 4:3, or landscape 16:9 variants. Use when the user asks to 做视频封面、系列封面、一键封面、视频抽帧做封面、本人脸一致、美颜、抖音 3:4、横屏 4:3、YouTube 横屏 16:9, including the 50天50个AI应用 challenge and 专属会员干货实操长视频."
---

# GPT Image Cover Factory

Generate the finished cover as one image with the built-in image generation tool. Local code may prepare reference frames and QA evidence, but must never assemble the final cover.

## Authority

```bash
SKILL=~/talking-head-video-factory/skills/video-cover-factory   # 改成你 clone 到的路径
```

Select the series before generation:

- `50天50个AI应用`: read `references/50-days-style.md`;
- `专属会员`: read `references/member-practical-style.md`;
- `创业思考`: read `references/entrepreneurship-thinking-style.md`;
- model capability or workflow rationale: read `references/openai-image-research.md`.

The approved `50天50个AI应用` anchor is bundled at `assets/series/50-days-50-ai-apps/series-master-3x4.png`. Use its `neutral-daylight` skin/color treatment for every episode and format unless the user explicitly changes the series standard.

The `专属会员` series is for frequent, practical long-form teaching. It is not tied to a Day challenge and must not show the letters `VIP`. Show only the sequential `专属会员 NN` identifier and the episode topic. Until its first `3:4` candidate is explicitly approved, treat `assets/series/exclusive-member-longform/series.json` as a candidate contract and do not use a candidate image as a later-episode style anchor.

## Hard boundary

1. Use the built-in image generation tool, currently GPT Image 2, for every finished cover and every revision.
2. Do not build covers with HTML, CSS, canvas, SVG, Pillow, ImageMagick, ffmpeg overlays, or local compositing.
3. Local tools may only extract and rank real video frames, create a candidate contact sheet, hash inputs, and copy outputs.
4. Never use a generated cover, candidate, or prior revision as the edit target or subject base. If an output is wrong, discard it and start a fresh generation from the current episode's original video frames.
5. Include the current episode's three original video frames in every generation call, including text, layout, and skin revisions. Generated images never replace those identity inputs.
6. After the series master is approved, include it only as a style/layout reference. State explicitly that it must not control identity, skin, pose, or facial detail.
7. Do not locally repair generated text, crop in new layout elements, paste a face, or beautify a face.
8. Run `df -h` before frame extraction or batch generation; require at least 50G free.

## Inputs

Required:

- absolute source-video path;
- series name and numbering policy; show a number only when the series contract or user explicitly requires one (`Day` only for Day-based series; `专属会员 NN` for member videos);
- one short cover hook, preferably 8–14 Chinese characters;
- requested aspect ratios.

Default output set when the user asks for all platforms:

- Douyin portrait: `3:4`;
- landscape: `4:3`;
- YouTube landscape thumbnail: `16:9`.

Treat “YouTube 横屏” as `16:9`. Never generate `9:16` or a Shorts cover unless the user explicitly overrides this series contract in a future request.

## Step 1: prepare identity references

```bash
python3 "$SKILL/scripts/prepare_references.py" \
  --video "/absolute/path/to/video.mp4" \
  --output "/absolute/path/to/cover-job"
```

This produces:

- `refs/identity-01-primary.jpg`: strongest near-frontal identity/pose reference;
- `refs/identity-02-angle.jpg`: complementary three-quarter view;
- `refs/identity-03-expression.jpg`: another real expression;
- `qa/candidates.jpg`: 12-frame review sheet;
- `references.json`: timestamps, hashes, metrics, and roles.

Inspect all three reference images before generation. If any is blurred, occluded, or unlike the desired on-camera presence, rerun with a better video or replace it with another candidate from the same episode.

## Step 2: generate the first series master

For a new series, generate only the primary `3:4` cover first. Pass all three identity files to the built-in image generation tool as local reference images.

State image roles in the prompt:

- Image 1: primary identity and preferred pose;
- Image 2: identity-only three-quarter evidence;
- Image 3: identity-only alternate-expression evidence.

Request one complete, finished marketing cover at the target aspect ratio. Include the identity invariants, beauty contract, exact visible text, hierarchy, visual direction, and forbidden elements from the series reference.

Do not generate the other ratios until the user approves this image as the series master. Copy the approved image into the series assets as `series-master-3x4.png`; it becomes the permanent style anchor.

## Step 3: generate variants

Make one separate built-in image-generation call per aspect ratio. Do not crop or locally reflow the master.

For an approved series, pass references in this order:

1. current episode primary face frame;
2. current episode angle face frame;
3. current episode expression face frame;
4. approved series master as style/layout anchor.

Tell the model that Images 1–3 control identity, while Image 4 controls only campaign styling, typography character, palette, recurring motifs, and information hierarchy. Ask it to recompose natively for the target ratio.

Do not revise a generated variant in place. For every retry, pass Images 1–3 again and generate a new finished cover from scratch; the approved master may remain Image 4 only as a style/layout reference.

For later episodes, the same four-reference contract applies. The episode identifier, topic, and current real face may change; the campaign visual language must not.

## Skin and color contract: `identity-first-neutral` default

Do not express retouching as a percentage. Separate identity geometry from temporary capture conditions.

- use current-video frames to lock facial geometry, features, hairstyle, age, and recognizability;
- when the frames have a magenta/red cast or harsh phone-camera highlights, do not preserve that cast as identity;
- neutralize magenta/red contamination and keep a believable warm-neutral East Asian skin tone;
- reduce only the contrast of temporary redness, obvious blemishes, under-eye fatigue, and oily specular highlights;
- treat irregular gray, brown, purple, or near-black facial patches caused by source lighting, compression, sharpening, facial-hair hallucination, or generative shading as temporary artifacts, not identity;
- keep broad skin color and luminance transitions continuous across the forehead, eye contour, cheeks, nose, mouth area, and jaw; remove dirty-looking blotches without flattening real facial structure;
- retain pores, natural skin microtexture, faint stubble, and real tonal variation;
- clean minor flyaway hair without changing hairstyle or hairline;
- avoid hyper-sharpening, fake orange-peel texture, waxy highlights, gray skin, orange skin, or makeup-like color;
- keep natural facial fullness, cheek volume, jaw width, and chin length exactly as seen in the video frames.

Preserve exactly: head shape, face width, hairline, hair color, eye shape and spacing, nose, lips, moles, asymmetry, age, ethnicity, and recognizability.

Never: facial contouring, jaw shaping, face slimming, cheek reduction, chin lengthening, plastic skin, enlarged eyes, reshaped nose/lips, added makeup look, age change, ethnicity change, or a “similar-looking” replacement person.

If no approved skin look exists, generate three calibration variants before freezing the series master:

1. `neutral-daylight`: neutral white balance, believable natural skin, low contrast;
2. `healthy-warm`: subtle warm-golden vitality without orange/pink makeup color;
3. `soft-studio`: neutral skin with broad soft light and controlled highlights.

Change only skin color, temporary condition cleanup, and lighting between these variants. Keep facial geometry, expression, layout, and text invariant. Freeze the selected skin look in the approved series master.

For `50天50个AI应用`, the approved selection is `neutral-daylight`. Do not regenerate the calibration trio for normal episodes.

## QA and revision

Open every generated image and check:

- identity: immediately recognizable as the same real person in the current video;
- beauty: polished but still natural, with real skin texture;
- skin continuity: no irregular dark, gray, purple, or brown blotches on the forehead, around the eyes, cheeks, nose, mouth, or jaw; preserve real moles and faint stubble without turning them into patches;
- exact text: no extra words, missing characters, wrong episode identifier, duplicated glyphs, or mojibake;
- layout: safe margins, no facial obstruction, clear hierarchy at phone size;
- series: palette, visual grammar, numbering system, and typography character match the approved master;
- ratio: composed natively for the requested format, not visibly stretched or cropped.

If one item fails, discard that output and make a fresh image-generation call from the three original current-episode frames. Restate the one targeted correction plus all invariants. Never edit the failed generated image and never fix it with a local overlay.

## One-click behavior after master approval

When the user gives only a video, episode identifier, and hook:

1. prepare and inspect the three real identity references;
2. load the approved series master;
3. generate each requested ratio directly with the built-in image tool;
4. inspect identity, beauty, exact text, and series match;
5. regenerate only failed variants from the original current-episode frames with targeted corrections; never feed the failed output back as the edit target.

“One click” means one skill invocation, not one model call. Separate native generations are required for reliable multi-format composition.
