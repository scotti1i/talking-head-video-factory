import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { appendComponentBeat, findBeatGap, ROOT } from "./jobs.mjs";

test("竖横屏分别寻找拍子空档", () => {
  const beats = [{ start: 0, end: 5, formats: ["portrait"] }];
  assert.equal(findBeatGap(beats, 4, 20, "portrait"), 5);
  assert.equal(findBeatGap(beats, 4, 20, "landscape"), 0);
});

test("未声明 formats 的拍子同时占用竖横屏", () => {
  const beats = [{ start: 0, end: 5 }];
  assert.equal(findBeatGap(beats, 4, 8, "portrait"), null);
  assert.equal(findBeatGap(beats, 4, 9, "landscape"), 5);
});

test("真实 job 写入按画幅分槽并拒绝越界与重叠", () => {
  const slug = `.visual-library-test-${process.pid}`;
  const dir = path.join(ROOT, "jobs", slug);
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ title: "test", duration: 8 }));
  fs.writeFileSync(path.join(dir, "data", "beats.json"), "[]");
  try {
    const portrait = appendComponentBeat(slug, { type: "statement", beat: { title: "竖屏" }, format: "vertical", duration: 4 });
    const landscape = appendComponentBeat(slug, { type: "statement", beat: { title: "横屏" }, format: "horizontal", duration: 4 });
    assert.deepEqual([portrait.beat.start, portrait.beat.formats], [0, ["portrait"]]);
    assert.deepEqual([landscape.beat.start, landscape.beat.formats], [0, ["landscape"]]);
    assert.throws(() => appendComponentBeat(slug, { type: "statement", beat: {}, format: "vertical", start: -1 }), /不能小于 0/);
    assert.throws(() => appendComponentBeat(slug, { type: "statement", beat: {}, format: "vertical", start: 2 }), /已有拍子/);
    assert.throws(() => appendComponentBeat(slug, { type: "statement", beat: {}, format: "vertical", start: 6 }), /超出视频总时长/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
