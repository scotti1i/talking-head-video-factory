import assert from "node:assert/strict";
import test from "node:test";

import { validateCaptionVoice } from "./qa-caption-voice.mjs";

test("accepts captions and equivalent text that exactly cover approved voice", () => {
  const result = validateCaptionVoice({
    captions: [
      { s: 2, e: 2.5, t: "HELLO" },
      { s: 2.5, e: 3, t: "WORLD" }
    ],
    beats: [{ type: "media-pop-sticker", start: 0, end: 1 }],
    contract: {
      tolerance: 0.02,
      regions: [
        { start: 0, end: 1, coverage: "text-overlay", beatType: "media-pop-sticker" },
        { start: 2, end: 3, coverage: "captions", expectedText: "HELLO WORLD" }
      ]
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("rejects silent tails and uncovered speech", () => {
  const result = validateCaptionVoice({
    captions: [{ s: 1.2, e: 2.4, t: "LATE AND LONG" }],
    beats: [],
    contract: {
      tolerance: 0.03,
      regions: [{ start: 1, end: 2, coverage: "captions", expectedText: "LATE AND LONG" }]
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /超出已批准的人声字幕区/);
  assert.match(result.errors.join("\n"), /起声后/);
});

test("rejects a spoken word omitted by temporally valid captions", () => {
  const result = validateCaptionVoice({
    captions: [{ s: 1, e: 2, t: "Buscamos al proveedor" }],
    beats: [],
    contract: {
      tolerance: 0.03,
      regions: [{ start: 1, end: 2, coverage: "captions", expectedText: "Buscamos al proveedor adecuado" }]
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /字幕逐词不完整/);
  assert.match(result.errors.join("\n"), /adecuado/);
});
