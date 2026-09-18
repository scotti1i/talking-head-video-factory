import assert from "node:assert/strict";
import test from "node:test";

import { validateSemanticTakeMap } from "./semantic-take-map.mjs";

const edl = [{ source: "assets/originals/take.mov", sourceStart: 10, sourceEnd: 20, reason: "完整回答" }];

test("完整表达选段记录覆盖 EDL 时通过", () => {
  const result = validateSemanticTakeMap(validMap(), edl);
  assert.deepEqual(result, { ok: true, errors: [], coveredCount: 1 });
});

test("只写区间但不确认表达完整时失败", () => {
  const value = validMap();
  value.ranges[0].completeness = "fragment";
  assert.equal(validateSemanticTakeMap(value, edl).ok, false);
});

test("EDL 超出已审完整表达范围时失败", () => {
  const value = validMap();
  value.ranges[0].sourceEnd = 18;
  const result = validateSemanticTakeMap(value, edl);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /完整覆盖/);
});

function validMap() {
  return {
    schemaVersion: 1,
    reviewComplete: true,
    recordingPattern: "同一观点重复拍摄，采用最后一遍完整表达",
    ranges: [{
      id: "answer-final",
      source: "assets/originals/take.mov",
      sourceStart: 9.8,
      sourceEnd: 20.3,
      decision: "keep",
      completeness: "complete",
      claim: "完整回答核心问题",
      reason: "起承转合和句末均完整"
    }]
  };
}
