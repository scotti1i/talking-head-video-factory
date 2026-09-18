import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

test("EDL 字幕生成保留同一份缓存的语义词级时码", (context) => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "factory-caption-words-"));
  context.after(() => fs.rmSync(job, { recursive: true, force: true }));
  fs.mkdirSync(path.join(job, "data", "transcripts"), { recursive: true });
  writeJson(path.join(job, "project.json"), {
    caption: { maxCharsPerLine: 18 },
    editorial: { contractVersion: 1 }
  });
  writeJson(path.join(job, "data", "rough-cut-edl.json"), [
    {
      id: "edl-001",
      storyBeatId: "story-001",
      takeId: "take-001",
      source: "assets/originals/take.mp4",
      sourceStart: 0,
      sourceEnd: 1.6,
      reason: "fixture"
    }
  ]);
  writeJson(path.join(job, "data", "transcripts", "index.json"), {
    sources: [{ source: "assets/originals/take.mp4", transcript: "data/transcripts/take.json" }]
  });
  writeJson(path.join(job, "data", "transcripts", "take.json"), {
    segments: [{ id: "seg-0001", start: 0, end: 1.6, text: "前两天的全网都在说AI team。" }],
    words: [
      { id: "w-0001-001", start: 0.05, end: 0.15, text: "前" },
      { id: "w-0001-002", start: 0.15, end: 0.32, text: "两" },
      { id: "w-0001-003", start: 0.32, end: 0.48, text: "天" },
      { id: "w-0001-004", start: 0.48, end: 0.62, text: "的" },
      { id: "w-0001-005", start: 0.62, end: 0.78, text: "全" },
      { id: "w-0001-006", start: 0.78, end: 0.94, text: "网" },
      { id: "w-0001-007", start: 0.94, end: 1.06, text: "都" },
      { id: "w-0001-008", start: 1.06, end: 1.18, text: "在" },
      { id: "w-0001-009", start: 1.18, end: 1.3, text: "说" },
      { id: "w-0001-010", start: 1.3, end: 1.42, text: "AI" },
      { id: "w-0001-011", start: 1.42, end: 1.55, text: "team。" }
    ]
  });

  const result = spawnSync(process.execPath, [
    path.join(ROOT, "scripts", "captions-from-edl.mjs"),
    "--job", job
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const captions = JSON.parse(fs.readFileSync(path.join(job, "data", "captions.json"), "utf8"));
  assert.ok(captions.length >= 1);
  for (const caption of captions) {
    assert.equal(caption.words.map((word) => word.t).join(""), caption.t);
    assert.equal(caption.storyBeatId, "story-001");
    assert.equal(caption.edlSegmentId, "edl-001");
  }
  const words = captions.flatMap((caption) => caption.words);
  assert.equal(words.map((word) => word.t).join("").replaceAll(" ", ""), "前两天的全网都在说AIteam。");
  assert.equal(words[0].s, 0.05);
  assert.equal(words.at(-1).e, 1.55);
});

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
