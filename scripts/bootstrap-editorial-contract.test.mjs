import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.join(import.meta.dirname, "bootstrap-editorial-contract.mjs");

test("旧 job 迁移只生成待复核提案，不改写当前事实源", () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-migration-"));
  const originalEdl = [{ source: "take.mp4", sourceStart: 1, sourceEnd: 4, reason: "旧剪辑段" }];
  write(job, "data/rough-cut-edl.json", originalEdl);
  write(job, "data/captions.json", [{ s: 0, e: 2.8, t: "旧字幕" }]);
  write(job, "data/beats.json", []);
  write(job, "data/broll.json", []);
  const result = spawnSync(process.execPath, [script, "--job", job], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(read(job, "data/rough-cut-edl.json"), originalEdl);
  const proposal = read(job, "data/migration-proposal/semantic-take-map.proposed.json");
  assert.equal(proposal.reviewComplete, false);
  assert.equal(proposal.ranges[0].completeness, "review-required");
  const proposedEdl = read(job, "data/migration-proposal/rough-cut-edl.proposed.json");
  assert.equal(proposedEdl[0].storyBeatId, "story-001");
  assert.equal(proposedEdl[0].takeId, "proposal-take-001");
});

function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function read(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}
