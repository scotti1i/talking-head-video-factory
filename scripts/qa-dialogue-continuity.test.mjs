import assert from "node:assert/strict";
import test from "node:test";

import { validateDialogueContinuity } from "./qa-dialogue-continuity.mjs";

const valid = {
  schemaVersion: 1,
  takeStarts: [
    { id: "take-1", timelineStart: 0, speechStart: 0.06, operatorCueReviewed: true, waveformReviewed: true, pictureReviewed: true }
  ],
  protectedPhraseEnds: [
    { id: "ending-1", text: "más bajo", speechEnd: 2, cutEnd: 2.12, audibleComplete: true, waveformReviewed: true, mouthClosureReviewed: true }
  ],
  levelingChecks: [
    { id: "level-1", beforeJumpDb: 8, afterJumpDb: 3.2, method: "gain-envelope+compressor", waveformReviewed: true, listened: true }
  ],
  brollChecks: [
    { id: "proof-1", entryPolicy: "voice-aligned", noMaskedSilence: true, noShortArollFlash: true, nearbyTakeCutsCovered: true }
  ]
};

test("段首、尾音、局部响度和空镜边界全部通过才放行", () => {
  assert.equal(validateDialogueContinuity(valid, { primaryClips: [{ id: "proof-1" }] }).status, "passed");
});

test("拒绝长前摇、截尾、未平滑响度和空镜掩盖静音", () => {
  const invalid = structuredClone(valid);
  invalid.takeStarts[0].speechStart = 0.5;
  invalid.protectedPhraseEnds[0].cutEnd = 2.02;
  invalid.levelingChecks[0].afterJumpDb = 6;
  invalid.brollChecks[0].noMaskedSilence = false;
  const result = validateDialogueContinuity(invalid, { primaryClips: [{ id: "proof-1" }] });
  assert.equal(result.status, "failed");
  assert.match(result.failures.join("\n"), /段首气口|尾音保护|相邻人声窗口跳变|noMaskedSilence/);
});
