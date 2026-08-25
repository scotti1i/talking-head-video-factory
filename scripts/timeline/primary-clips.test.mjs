import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPrimaryClips } from "./primary-clips.mjs";

test("portrait demo-stage 输出两个 direct-root video 与精确舞台坐标", (context) => {
  const fixture = makeFixture(context);
  const result = createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({ start: 20, end: 80, sourceStart: 2 })]
  });

  assert.equal(result.items.length, 1);
  assert.equal((result.html.match(/<video /g) || []).length, 2);
  assert.doesNotMatch(result.html, /<(div|section)\b/);
  assert.match(result.html, /data-media-start="2\.00"/);
  assert.match(result.html, /id="primary-demo-pip-workflow"[^>]+data-media-start="20\.00"/);
  assert.match(result.css, /top: 500px; width: 1080px; height: 810px/);
  assert.match(result.css, /left: var\(--primary-pip-left, 18px\); top: var\(--primary-pip-top, 1200px\); width: var\(--primary-pip-size, 304px\); height: var\(--primary-pip-size, 304px\)/);
  assert.match(result.css, /caption-primary-pip \{ left: 330px; top: 1450px; width: 570px/);
  assert.match(result.css, /var\(--primary-stage-bg, #050608\)/);
  assert.match(result.css, /var\(--primary-stage-divider, #20252b\)/);
  assert.match(result.css, /var\(--primary-pip-border, #f3f0ea\)/);
  assert.match(result.css, /var\(--primary-pip-shadow,/);
  assert.match(result.timelineJs, /opacity: 0 \}, 20\.00/);
  assert.match(result.timelineJs, /opacity: 1 \}, 80\.00/);
  assert.deepEqual(result.ranges, [{ start: 20, end: 80 }]);
  assert.deepEqual(result.pipRanges, [{ start: 20, end: 80 }]);
});

test("portrait-only clip 在 landscape 构建时完全过滤", (context) => {
  const fixture = makeFixture(context, { format: "landscape", width: 1920, height: 1080 });
  const result = createPrimaryClips({ ...fixture.options, items: [primaryItem()] });
  assert.deepEqual(result, { items: [], html: "", css: "", timelineJs: "", ranges: [], pipRanges: [] });
});

test("proof-footage 是全屏主叙事轨，默认 cover 且不强制 speaker PIP", (context) => {
  const fixture = makeFixture(context);
  const result = createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({
      id: "warehouse-proof",
      kind: "proof-footage",
      fit: undefined,
      speakerPip: false
    })]
  });

  assert.equal(result.items[0].kind, "proof-footage");
  assert.equal(result.items[0].fit, "cover");
  assert.equal((result.html.match(/<video /g) || []).length, 1);
  assert.match(result.html, /class="primary-demo-media primary-proof-media"/);
  assert.match(result.html, /data-kind="proof-footage"/);
  assert.match(result.html, /--primary-fit:cover/);
  assert.match(result.css, /primary-demo-media\.primary-proof-media \{ inset: 0; width: 1080px; height: 1920px/);
  assert.deepEqual(result.ranges, [{ start: 20, end: 30 }]);
  assert.deepEqual(result.pipRanges, []);
});

test("结构字段严格校验", (context) => {
  const fixture = makeFixture(context);
  const cases = [
    [primaryItem({ kind: "broll" }), /kind 只能是 demo-stage\/proof-footage/],
    [primaryItem({ fit: "stretch" }), /fit 只能是 contain\/cover/],
    [primaryItem({ focus: { x: 1.1, y: 0.5 } }), /focus x\/y 必须在 0\.\.1/],
    [primaryItem({ formats: [] }), /formats 必须是非空数组/],
    [primaryItem({ formats: ["portrait", "portrait"] }), /formats 不允许重复/],
    [primaryItem({ formats: ["vertical"] }), /formats 包含无效值 vertical/],
    [primaryItem({ transition: "fade" }), /transition 必须是对象/],
    [primaryItem({ transition: { type: "spring" } }), /transition.type 只能是 cut\/focus-dissolve\/whip-blur\/flash/],
    [primaryItem({ transition: { type: "focus-dissolve", enter: 0.1 } }), /必须在 0.15\.\.0.8 秒/],
    [primaryItem({ transition: { type: "whip-blur", duration: 0.21 } }), /必须在 0.13\.\.0.2 秒/],
    [primaryItem({ transition: { type: "whip-blur", direction: "diagonal" } }), /direction 只能是 left\/right\/up\/down/],
    [primaryItem({ transition: { type: "flash", duration: 0.26 } }), /必须在 0.15\.\.0.25 秒/],
    [primaryItem({ start: 20, end: 20.7, transition: { type: "focus-dissolve", enter: 0.4, exit: 0.35 } }), /必须小于 clip duration/]
  ];
  for (const [item, pattern] of cases) {
    assert.throws(() => createPrimaryClips({ ...fixture.options, items: [item] }), pattern);
  }
});

test("whip-blur 用 4–6 帧 directional blur，并在边界清理 transform/filter", (context) => {
  const fixture = makeFixture(context);
  const result = createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({
      kind: "proof-footage",
      speakerPip: false,
      transition: { type: "whip-blur", duration: 0.17, exit: 0.13, direction: "up" }
    })]
  });

  assert.deepEqual(result.items[0].transition, {
    type: "whip-blur",
    enter: 0.17,
    exit: 0.13,
    direction: "up"
  });
  assert.match(result.timelineJs, /opacity: 0, xPercent: 0, yPercent: 6, filter: "blur\(18px\)"/);
  assert.match(result.timelineJs, /videoWrap, \{ opacity: 0, xPercent: 0, yPercent: -4, filter: "blur\(16px\)", duration: 0\.17/);
  assert.match(result.timelineJs, /duration: 0\.13[^\n]+29\.87/);
  assert.match(result.timelineJs, /opacity: 0, xPercent: 0, yPercent: 0, filter: "none" \}, 30\.00/);
  assert.match(result.timelineJs, /videoWrap, \{ opacity: 1, xPercent: 0, yPercent: 0, filter: "none" \}, 30\.00/);
  assert.doesNotMatch(result.timelineJs, /repeat|Math\.random|setTimeout|onComplete/);
});

test("flash 只默认闪入一次，并把 overlay 和 filter 清到确定状态", (context) => {
  const fixture = makeFixture(context);
  const result = createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({
      id: "answer-reveal",
      kind: "proof-footage",
      speakerPip: false,
      transition: { type: "flash", duration: 0.2 }
    })]
  });

  assert.deepEqual(result.items[0].transition, { type: "flash", enter: 0.2, exit: 0 });
  assert.match(result.html, /id="primary-transition-flash-answer-reveal" class="primary-transition-flash clip"[^>]+data-kind="transition-overlay"/);
  assert.match(result.html, /id="primary-transition-flash-answer-reveal"[^>]+data-manual-timeline="true"/);
  assert.match(result.css, /primary-transition-flash[^}]+mix-blend-mode: screen/);
  assert.equal((result.timelineJs.match(/autoAlpha: 0\.96/g) || []).length, 1);
  assert.match(result.timelineJs, /#primary-transition-flash-answer-reveal[^\n]+autoAlpha: 0 \}, 30\.00/);
  assert.match(result.timelineJs, /#primary-demo-answer-reveal[^\n]+opacity: 0, filter: "none" \}, 30\.00/);
  assert.match(result.timelineJs, /videoWrap, \{ opacity: 1, filter: "none" \}, 30\.00/);
  assert.doesNotMatch(result.timelineJs, /repeat|Math\.random|setTimeout|onComplete/);
});

test("focus-dissolve 生成无弹跳、可 seek 的主画面交叉溶解", (context) => {
  const fixture = makeFixture(context);
  const result = createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({
      start: 20,
      end: 30,
      transition: { type: "focus-dissolve", enter: 0.46, exit: 0.36 }
    })]
  });

  assert.match(result.timelineJs, /#primary-demo-workflow[^\n]+scale: 1\.018/);
  assert.match(result.timelineJs, /videoWrap, \{ opacity: 0, duration: 0\.46, ease: "sine\.inOut" \}, 20\.00/);
  assert.match(result.timelineJs, /#primary-demo-pip-workflow[^\n]+scale: 0\.965/);
  assert.match(result.timelineJs, /#primary-demo-workflow[^\n]+opacity: 0, scale: 0\.992[^\n]+29\.64/);
  assert.match(result.timelineJs, /videoWrap, \{ opacity: 1, duration: 0\.36[^\n]+29\.64/);
  assert.match(result.timelineJs, /tl\.set\("#primary-demo-workflow", \{ opacity: 0 \}, 30\.00\)/);
  assert.match(result.timelineJs, /tl\.set\("#primary-demo-pip-workflow", \{ opacity: 0 \}, 30\.00\)/);
  assert.doesNotMatch(result.timelineJs, /back|bounce|elastic|repeat|Math\.random|setTimeout/);
});

test("同画幅 primary 互斥，不同画幅可共用同一时间", (context) => {
  const fixture = makeFixture(context);
  const first = primaryItem({ id: "first", start: 20, end: 40 });
  const second = primaryItem({ id: "second", start: 30, end: 50 });
  assert.throws(() => createPrimaryClips({ ...fixture.options, items: [first, second] }), /同一画幅重叠/);

  const landscape = primaryItem({ id: "landscape", start: 20, end: 40, formats: ["landscape"] });
  assert.doesNotThrow(() => createPrimaryClips({ ...fixture.options, items: [first, landscape] }));
});

test("primary 不允许与 B-roll 重叠", (context) => {
  const fixture = makeFixture(context);
  assert.throws(() => createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({ start: 20, end: 40 })],
    broll: [{ id: "coverage", start: 35, end: 42 }]
  }), /不允许与 B-roll coverage 重叠/);
});

test("屏幕源与 speaker PIP 都做媒体尾部校验", (context) => {
  const fixture = makeFixture(context, { demoDuration: 30, arrollDuration: 35 });
  assert.throws(() => createPrimaryClips({
    ...fixture.options,
    items: [primaryItem({ start: 20, end: 40, sourceStart: 12 })]
  }), /sourceStart \+ clip duration 超出源媒体尾部/);

  const pipFixture = makeFixture(context, { demoDuration: 100, arrollDuration: 35 });
  assert.throws(() => createPrimaryClips({
    ...pipFixture.options,
    items: [primaryItem({ start: 20, end: 40 })]
  }), /speakerPip 超出 A-roll 尾部/);
});

test("truncateTimeline 只校验实际可见区间", (context) => {
  const fixture = makeFixture(context, { duration: 50, demoDuration: 35, arrollDuration: 50 });
  const result = createPrimaryClips({
    ...fixture.options,
    truncateTimeline: true,
    items: [primaryItem({ start: 40, end: 70, sourceStart: 20 })]
  });
  assert.equal(result.items[0].end, 50);
  assert.match(result.html, /data-duration="10\.00"/);
});

test("相同输入生成完全一致的 bundle", (context) => {
  const fixture = makeFixture(context);
  const options = { ...fixture.options, items: [primaryItem()] };
  assert.deepEqual(createPrimaryClips(options), createPrimaryClips(options));
});

function primaryItem(overrides = {}) {
  return {
    id: "workflow",
    kind: "demo-stage",
    start: 20,
    end: 30,
    src: "assets/demo.mp4",
    sourceStart: 0,
    fit: "contain",
    focus: { x: 0.5, y: 0.5 },
    speakerPip: true,
    formats: ["portrait"],
    intent: "展示真实操作",
    reason: "实操本身承担主叙事",
    ...overrides
  };
}

function makeFixture(context, overrides = {}) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-clips-"));
  const assets = path.join(jobDir, "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, "demo.mp4"), "fixture");
  fs.writeFileSync(path.join(assets, "aroll.mp4"), "fixture");
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));

  const durations = new Map([
    ["demo.mp4", overrides.demoDuration ?? 120],
    ["aroll.mp4", overrides.arrollDuration ?? 120]
  ]);
  return {
    options: {
      jobDir,
      duration: overrides.duration ?? 100,
      width: overrides.width ?? 1080,
      height: overrides.height ?? 1920,
      format: overrides.format ?? "portrait",
      sourceVideo: "assets/aroll.mp4",
      broll: [],
      durationProbe: (file) => durations.get(path.basename(file))
    }
  };
}
