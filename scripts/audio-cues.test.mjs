import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAudioCues, renderAudioCues, validateAudioCues } from "./audio-cues.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

test("缺少 audio-cues.json 时返回空数组", (context) => {
  const jobDir = makeJob(context);
  assert.deepEqual(loadAudioCues({ jobDir, totalDuration: 10 }), []);
});

test("有效 cue 被严格读取并渲染为根级音频元素", (context) => {
  const jobDir = makeJob(context);
  fs.mkdirSync(path.join(jobDir, "assets", "sfx"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "assets", "sfx", "whoosh.mp3"), "fixture");
  const cues = [
    {
      id: "proof-enter",
      start: 2.25,
      duration: 0.4,
      asset: "assets/sfx/whoosh.mp3",
      volume: 0.06
    }
  ];
  writeCues(jobDir, cues);

  assert.deepEqual(loadAudioCues({ jobDir, totalDuration: 10 }), cues);
  assert.equal(
    renderAudioCues(cues),
    '<audio id="audio-cue-proof-enter" src="assets/sfx/whoosh.mp3" data-start="2.25" data-duration="0.40" data-track-index="760" data-volume="0.06" preload="auto"></audio>'
  );
});

test("active builder 把 cue 音频直接挂在 composition root", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "build-beats-composition.mjs"), "utf8");
  assert.match(
    source,
    /<audio id="talking-audio"[^>]*><\/audio>\s*\$\{renderMusicBed\(musicBed\)\}\s*\$\{renderAudioCues\(audioCues\)\}\s*\$\{primary\.html\}/
  );
});

test("拒绝缺字段、错误范围、重复 id 和超出成片的 cue", (context) => {
  const jobDir = makeJob(context);
  fs.mkdirSync(path.join(jobDir, "assets", "sfx"), { recursive: true });
  fs.writeFileSync(path.join(jobDir, "assets", "sfx", "pop.mp3"), "fixture");

  assert.throws(
    () => validateAudioCues([
      { id: "same", start: 0, duration: 0.3, asset: "assets/sfx/pop.mp3", volume: 0.1 },
      { id: "same", start: -1, duration: 0, asset: "../outside.mp3", volume: 1.1 },
      { id: "bad id", start: "2", duration: 9, asset: "", volume: "0.1" },
      { id: "too-late", start: 4.8, duration: 0.3, asset: "assets/sfx/pop.mp3", volume: 0.1 }
    ], { jobDir, totalDuration: 5 }),
    (error) => {
      assert.match(error.message, /不允许重复 same/);
      assert.match(error.message, /\.start: 必须是大于等于 0/);
      assert.match(error.message, /\.duration: 必须是大于 0/);
      assert.match(error.message, /\.volume: 必须是 0\.\.1/);
      assert.match(error.message, /必须位于 job 目录内/);
      assert.match(error.message, /只允许字母、数字/);
      assert.match(error.message, /超出成片/);
      return true;
    }
  );
});

test("拒绝不存在的音效文件", (context) => {
  const jobDir = makeJob(context);
  writeCues(jobDir, [
    { id: "missing", start: 1, duration: 0.5, asset: "assets/sfx/missing.mp3", volume: 0.05 }
  ]);
  assert.throws(
    () => loadAudioCues({ jobDir, totalDuration: 5 }),
    /文件不存在 assets\/sfx\/missing\.mp3/
  );
});

function makeJob(context) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-audio-cues-"));
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  return jobDir;
}

function writeCues(jobDir, cues) {
  fs.writeFileSync(path.join(jobDir, "data", "audio-cues.json"), `${JSON.stringify(cues, null, 2)}\n`);
}
