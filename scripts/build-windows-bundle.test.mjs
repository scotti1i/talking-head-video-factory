import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeArchiveEntries } from "./build-windows-bundle.mjs";

const manifest = {
  rootFiles: ["package.json"],
  roots: [".agents", "template-packs", "deploy/windows"],
  forbiddenPathPatterns: [
    "(^|/)factory\\.config\\.psd1$",
    "(^|/)jobs(?:/|$)",
    "(^|/)reports(?:/|$)",
    "(^|/)visual-assets(?:/|$)",
  ],
};

test("迁移包允许产品代码，拒绝客户 job、密钥与依赖目录", () => {
  assert.equal(assertSafeArchiveEntries([
    "talking-head-video-factory/package.json",
    "talking-head-video-factory/.agents/skills/factory-auto-edit/SKILL.md",
    "talking-head-video-factory/template-packs/factory-clean/pack.json"
  ], manifest), true);
  assert.throws(() => assertSafeArchiveEntries([
    "talking-head-video-factory/jobs/any-client/data/rough-cut-edl.json"
  ], manifest), /审计失败/);
  assert.throws(() => assertSafeArchiveEntries([
    "talking-head-video-factory/deploy/windows/factory.config.psd1"
  ], manifest), /审计失败/);
  assert.throws(() => assertSafeArchiveEntries([
    "talking-head-video-factory/reports/client/source-inventory.json"
  ], manifest), /审计失败/);
  assert.throws(() => assertSafeArchiveEntries([
    "talking-head-video-factory/visual-assets/evidence/client/frame.jpg"
  ], manifest), /审计失败/);
});
