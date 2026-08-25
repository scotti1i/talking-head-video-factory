import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AROLL_CUE_TYPES, createArollCues } from "./aroll-cues.mjs";

test("缺少 A-roll cues 文件时返回空 bundle", (context) => {
  const jobDir = makeJob(context);
  assert.deepEqual(createArollCues({ jobDir, totalDuration: 10 }), emptyBundle());
});

test("四类 cue 输出唯一 overlay、绝对时间和边界清理", (context) => {
  const jobDir = makeJob(context);
  const items = [
    cue({ id: "hook-punch", type: "punch", start: 1, duration: 0.2, scale: 1.06 }),
    cue({ id: "answer-flash", type: "flash-punch", start: 3, duration: 0.2, scale: 1.1 }),
    cue({ id: "take-whip", type: "whip-cut", start: 5, duration: 0.18, scale: 1.1, direction: "left" }),
    cue({ id: "machine-glitch", type: "rgb-glitch-cut", start: 7, duration: 0.3, scale: 1.08 })
  ];
  const result = createArollCues({ jobDir, totalDuration: 10, items });

  assert.deepEqual([...AROLL_CUE_TYPES], ["punch", "flash-punch", "whip-cut", "rgb-glitch-cut"]);
  assert.deepEqual(result.items, items);
  assert.equal((result.html.match(/class="clip aroll-cue-overlay/g) || []).length, 3);
  assert.match(result.html, /id="aroll-cue-overlay-answer-flash"[^>]+data-start="3\.00"[^>]+data-duration="0\.20"[^>]+data-manual-timeline="true"/);
  assert.match(result.html, /id="aroll-cue-overlay-take-whip"[^>]+data-direction="left"/);
  assert.match(result.html, /id="aroll-cue-filter-take-whip"[^>]+color-interpolation-filters="sRGB"/);
  assert.match(result.html, /id="aroll-cue-blur-take-whip"[^>]+stdDeviation="0 0"[^>]+edgeMode="duplicate"/);
  assert.match(result.css, /aroll-cue-flash-punch/);
  assert.match(result.css, /data-direction="up"/);

  assert.match(result.timelineJs, /scale: 1\.06, duration: 0\.08[^\n]+1\.00/);
  assert.match(result.timelineJs, /#aroll-cue-overlay-answer-flash[^\n]+opacity: 0\.4/);
  assert.match(result.timelineJs, /filter: "url\(#aroll-cue-filter-take-whip\) brightness\(1\.02\)"/);
  assert.match(result.timelineJs, /xPercent: -6, yPercent: 0, scale: 1\.1, duration: 0\.09, ease: "power2\.in"[^\n]+5\.00/);
  assert.match(result.timelineJs, /#aroll-cue-blur-take-whip[^\n]+stdDeviation: "24 1"[^\n]+duration: 0\.09, ease: "power2\.in"/);
  assert.match(result.timelineJs, /opacity: 0\.3/);
  assert.match(result.timelineJs, /xPercent: 6, yPercent: 0, scale: 1\.1 \}, 5\.09/);
  assert.match(result.timelineJs, /#aroll-cue-blur-take-whip[^\n]+stdDeviation: "0 0"[^\n]+duration: 0\.09, ease: "power2\.out"/);
  assert.match(result.timelineJs, /xPercent: 0, yPercent: 0, scale: 1, filter: "blur\(0px\) brightness\(1\)" \}, 5\.18/);
  assert.match(result.css, /aroll-cue-whip-cut \{ z-index: 20/);
  assert.match(result.css, /aroll-cue-rgb-glitch-cut/);
  assert.match(result.timelineJs, /#aroll-cue-overlay-machine-glitch/);
  assert.match(result.timelineJs, /drop-shadow\(9px 0 rgba\(255,0,90,.72\)\)/);
  assert.doesNotMatch(result.timelineJs, /setTimeout|requestAnimationFrame|Math\.random|Date\.now|performance\.now|onComplete|tl\.play|repeat/);
});

test("校验 id、类型、范围、方向和成片边界", (context) => {
  const jobDir = makeJob(context);
  const cases = [
    [cue({ id: "Bad ID" }), /id: 只能使用小写字母/],
    [cue({ type: "zoom" }), /type: 只能是 punch\/flash-punch\/whip-cut\/rgb-glitch-cut/],
    [cue({ start: -0.1 }), /start: 不能小于 0/],
    [cue({ duration: 0.1 }), /duration: 必须在 0.12\.\.0.45/],
    [cue({ scale: 1.19 }), /scale: 必须在 1.02\.\.1.18/],
    [cue({ direction: "left" }), /direction: 只用于 whip-cut/],
    [cue({ type: "flash-punch", duration: 0.31, scale: 1.1 }), /duration: 必须在 0.15\.\.0.3/],
    [cue({ type: "whip-cut", duration: 0.18, scale: 1.1 }), /direction: 只能是 left\/right\/up\/down/],
    [cue({ type: "whip-cut", duration: 0.18, scale: 1.07, direction: "right" }), /scale: 必须在 1.08\.\.1.18/],
    [cue({ type: "rgb-glitch-cut", duration: 0.19, scale: 1.08 }), /duration: 必须在 0.2\.\.0.4/],
    [cue({ start: 9.9, duration: 0.2 }), /结束时间 10\.100s 超出成片/]
  ];
  for (const [item, pattern] of cases) {
    assert.throws(() => createArollCues({ jobDir, totalDuration: 10, items: [item] }), pattern);
  }
});

test("拒绝重复 id、cue 互相重叠和非纯 A-roll 区间", (context) => {
  const jobDir = makeJob(context);
  assert.throws(
    () => createArollCues({
      jobDir,
      totalDuration: 10,
      items: [cue({ id: "same", start: 1 }), cue({ id: "same", start: 2 })]
    }),
    /id 重复 same/
  );
  assert.throws(
    () => createArollCues({
      jobDir,
      totalDuration: 10,
      items: [cue({ id: "first", start: 1, duration: 0.3 }), cue({ id: "second", start: 1.2 })]
    }),
    /first 与 second 不允许重叠/
  );
  assert.throws(
    () => createArollCues({
      jobDir,
      totalDuration: 10,
      items: [cue({ id: "blocked", start: 4 })],
      blockedRanges: [{ start: 3.9, end: 5, label: "B-roll proof" }]
    }),
    /不允许与 B-roll proof 重叠/
  );
});

test("同一输入产生完全相同的 seek-safe bundle", (context) => {
  const jobDir = makeJob(context);
  const options = {
    jobDir,
    totalDuration: 10,
    items: [cue(), cue({ id: "cut", type: "whip-cut", start: 3, duration: 0.18, scale: 1.1, direction: "down" })]
  };
  assert.deepEqual(createArollCues(options), createArollCues(options));
});

function cue(overrides = {}) {
  return {
    id: "cue",
    type: "punch",
    start: 1,
    duration: 0.2,
    scale: 1.06,
    ...overrides
  };
}

function makeJob(context) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-aroll-cues-"));
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  return jobDir;
}

function emptyBundle() {
  return { items: [], html: "", css: "", timelineJs: "", ranges: [] };
}
