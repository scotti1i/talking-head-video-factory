import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeIntakeCopy, planIntake } from "./intake-lib.mjs";
import { sanitizeSlug } from "./lib.mjs";

test("收件箱只读导入原片、文稿、B-roll 与参考图并校验哈希", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-intake-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const job = path.join(root, "job");
  fs.mkdirSync(path.join(source, "originals"), { recursive: true });
  fs.mkdirSync(path.join(source, "broll"), { recursive: true });
  fs.mkdirSync(path.join(source, "references"), { recursive: true });
  fs.mkdirSync(job);
  fs.writeFileSync(path.join(source, "originals", "take-01.MOV"), "take");
  fs.writeFileSync(path.join(source, "originals", "script.txt"), "script");
  fs.writeFileSync(path.join(source, "broll", "proof.mp4"), "proof");
  fs.writeFileSync(path.join(source, "references", "style.jpg"), "style");

  const plan = planIntake({ sourceDir: source });
  assert.equal(plan.originals.length, 1);
  const manifest = executeIntakeCopy({ plan, jobDir: job, now: new Date("2026-08-25T00:00:00.000Z") });
  assert.equal(manifest.entries.length, 4);
  assert.equal(manifest.writtenScript, "assets/originals/original-script.txt");
  assert.equal(fs.readFileSync(path.join(source, "originals", "take-01.MOV"), "utf8"), "take");
  assert.equal(fs.readFileSync(path.join(job, "assets", "originals", "take-01.MOV"), "utf8"), "take");
});

test("文稿不唯一时失败关闭", (context) => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "factory-intake-bad-"));
  context.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.writeFileSync(path.join(source, "take.mov"), "take");
  fs.writeFileSync(path.join(source, "a.txt"), "a");
  fs.writeFileSync(path.join(source, "b.md"), "b");
  assert.throws(() => planIntake({ sourceDir: source }), /需要且只能有一份/);
  assert.throws(() => planIntake({ sourceDir: "" }), /必须提供收件箱目录/);
  assert.equal(sanitizeSlug("../../客户 A"), "客户-a");
  assert.equal(sanitizeSlug(".."), "");
});
