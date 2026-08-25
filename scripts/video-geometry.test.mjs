import assert from "node:assert/strict";
import test from "node:test";
import { displayVideoGeometry, frameRateValue } from "./lib.mjs";

test("displayVideoGeometry swaps dimensions for quarter-turn display matrices", () => {
  assert.deepEqual(
    displayVideoGeometry({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }),
    { width: 1080, height: 1920, rotation: -90 }
  );
  assert.deepEqual(
    displayVideoGeometry({ width: 1920, height: 1080, tags: { rotate: "90" } }),
    { width: 1080, height: 1920, rotation: 90 }
  );
});

test("displayVideoGeometry preserves dimensions without a quarter turn", () => {
  assert.deepEqual(
    displayVideoGeometry({ width: 1920, height: 1080 }),
    { width: 1920, height: 1080, rotation: 0 }
  );
  assert.deepEqual(
    displayVideoGeometry({ width: 1920, height: 1080, side_data_list: [{ rotation: 180 }] }),
    { width: 1920, height: 1080, rotation: 180 }
  );
});

test("frameRateValue compares decimal and rational frame rates numerically", () => {
  assert.equal(frameRateValue("30/1"), 30);
  assert.equal(frameRateValue("30"), 30);
  assert.ok(Math.abs(frameRateValue("30000/1001") - 29.97003) < 0.00001);
  assert.equal(Number.isNaN(frameRateValue("0/0")), true);
});
