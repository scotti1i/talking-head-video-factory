import assert from "node:assert/strict";
import test from "node:test";

import { deterministicFontStack } from "./font-stack.mjs";

test("主题拉丁字体优先，多语言冻结字体位于 generic fallback 前", () => {
  assert.equal(
    deterministicFontStack("Inter, LXGWWenKaiTC, sans-serif"),
    "Inter, LXGWWenKaiTC, FactoryCJK, sans-serif"
  );
});

test("无主题字体时仍以 FactoryCJK 提供确定性多语言兜底", () => {
  assert.equal(deterministicFontStack("sans-serif"), "FactoryCJK, sans-serif");
});

test("移除不冻结的中文系统字体但保留明确主题字体", () => {
  assert.equal(
    deterministicFontStack('Inter, "PingFang SC", system-ui'),
    "Inter, FactoryCJK, system-ui"
  );
});
