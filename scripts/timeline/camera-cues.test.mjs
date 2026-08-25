import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCameraCues } from "./camera-cues.mjs";

test("缺少 camera cues 文件时仍注册初始镜头状态", (context) => {
  const jobDir = makeJob(context);
  const result = createCameraCues({ jobDir, totalDuration: 10 });
  assert.deepEqual(result.items, []);
  assert.match(result.timelineJs, /set\(cameraWrap, \{ xPercent: 0, yPercent: 0, scale: 1 \}, 0\)/);
});

test("镜头转场可以从指定景别进入并保持目标景别", (context) => {
  const jobDir = makeJob(context);
  const items = [
    {
      id: "opening-pull",
      start: 0.1,
      duration: 0.17,
      fromScale: 1.12,
      scale: 1,
      xPercent: 0,
      yPercent: 0,
      ease: "power4.out"
    },
    {
      id: "product-hold",
      start: 2,
      duration: 0.17,
      scale: 1.08,
      xPercent: -1,
      yPercent: 0,
      ease: "expo.out"
    }
  ];
  const result = createCameraCues({ jobDir, totalDuration: 10, items });
  assert.deepEqual(result.items, items.map((item) => ({
    xPercent: 0,
    yPercent: 0,
    ...item,
    ...(item.fromScale == null ? {} : { fromXPercent: 0, fromYPercent: 0 })
  })));
  assert.match(result.timelineJs, /set\(cameraWrap, \{ xPercent: 0, yPercent: 0, scale: 1\.12 \}, 0\.10\)/);
  assert.match(result.timelineJs, /scale: 1, duration: 0\.17, ease: "power4\.out" \}, 0\.10/);
  assert.match(result.timelineJs, /xPercent: -1, yPercent: 0, scale: 1\.08, duration: 0\.17, ease: "expo\.out" \}, 2\.00/);
  assert.doesNotMatch(result.timelineJs, /scale: 1[^\n]+2\.17/);
  assert.doesNotMatch(result.timelineJs, /setTimeout|requestAnimationFrame|Math\.random|Date\.now|performance\.now|tl\.play|repeat/);
});

test("拒绝非法范围、重叠、越界和被 B-roll 占用的 cue", (context) => {
  const jobDir = makeJob(context);
  const valid = { id: "camera", start: 1, duration: 0.17, scale: 1.08 };
  assert.throws(
    () => createCameraCues({ jobDir, totalDuration: 10, items: [{ ...valid, scale: 1.2 }] }),
    /scale: 必须在 1\.\.1\.18/
  );
  assert.throws(
    () => createCameraCues({ jobDir, totalDuration: 10, items: [valid, { ...valid, id: "next", start: 1.1 }] }),
    /camera 与 next 不允许重叠/
  );
  assert.throws(
    () => createCameraCues({ jobDir, totalDuration: 10, items: [{ ...valid, start: 9.9, duration: 0.2 }] }),
    /超出成片/
  );
  assert.throws(
    () => createCameraCues({
      jobDir,
      totalDuration: 10,
      items: [valid],
      blockedRanges: [{ start: 0.9, end: 1.5, label: "B-roll proof" }]
    }),
    /不允许与 B-roll proof 重叠/
  );
});

function makeJob(context) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-camera-cues-"));
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  return jobDir;
}
