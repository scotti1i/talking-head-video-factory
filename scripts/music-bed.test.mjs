import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadMusicBed, renderMusicBed, validateMusicBed } from "./music-bed.mjs";

test("连续 BGM 使用独立合同并渲染为根级音轨", () => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "music-bed-"));
  fs.mkdirSync(path.join(jobDir, "assets", "bgm"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "assets", "bgm", "bed.m4a"), "audio");
  fs.writeFileSync(path.join(jobDir, "data", "music-bed.json"), JSON.stringify({
    id: "background-bed",
    asset: "assets/bgm/bed.m4a",
    start: 0,
    duration: 12,
    volume: 0.12
  }));
  const bed = loadMusicBed({ jobDir, totalDuration: 12 });
  const html = renderMusicBed(bed);
  assert.match(html, /id="music-bed-background-bed"/);
  assert.match(html, /data-track-index="720"/);
  assert.match(html, /data-duration="12\.00"/);
});

test("BGM 不允许越界、绝对路径或缺素材", () => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "music-bed-invalid-"));
  assert.throws(() => validateMusicBed({
    id: "bed",
    asset: "/tmp/bed.m4a",
    start: 0,
    duration: 13,
    volume: 2
  }, { jobDir, totalDuration: 12 }), /music-bed\.json 校验失败/);
});
