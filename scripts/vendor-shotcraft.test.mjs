import assert from "node:assert/strict";
import test from "node:test";

import { verifyVendoredShotcraft } from "./vendor-shotcraft.mjs";

test("Shotcraft 只读上游基线未被改写", () => {
  const result = verifyVendoredShotcraft();
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.fileCount > 20, true);
  assert.equal(Boolean(result.revision), true);
});
