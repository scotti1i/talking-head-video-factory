import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REASON_CAPTIONS_V1,
  REASON_NO_AROLL_CONTRACT,
  REASON_NO_HUMAN_APPROVAL,
  applyMigration,
  legacyReasons,
  planMigration,
  renderTable,
  resolveSourceJobs
} from "./migrate-jobs.mjs";

function write(base, relative, content) {
  const file = path.join(base, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function oldRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-old-"));
  const jobs = path.join(repo, "jobs");
  // v1 job：有字幕、无成片转录、Agent 审批
  write(jobs, "v1-job/project.json", { title: "v1", profile: "factory-acquisition" });
  write(jobs, "v1-job/data/captions.json", [{ s: 0, e: 1, t: "hi" }]);
  write(jobs, "v1-job/data/rough-cut-edl.json", "[{\"source\":\"a.mp4\",\"sourceStart\":0,\"sourceEnd\":1,\"reason\":\"x\"}]\n");
  write(jobs, "v1-job/qa/cuts/approval.json", { status: "approved", reviewer: "codex" });
  write(jobs, "v1-job/assets/aroll.mp4", "binary");
  write(jobs, "v1-job/package.json", { scripts: { lint: "../../node_modules/.bin/hyperframes lint" } });
  write(jobs, "v1-job/variants/douyin/project.json", { variantId: "douyin" });
  write(jobs, "v1-job/variants/douyin/package.json", { scripts: { lint: "../../../../node_modules/.bin/hyperframes lint" } });
  fs.symlinkSync("../../assets", path.join(jobs, "v1-job", "variants", "douyin", "assets"), "dir");
  // 坏 JSON job
  write(jobs, "broken/project.json", { title: "broken", aroll: { master: "assets/aroll.mp4" } });
  write(jobs, "broken/data/beats.json", "{ not json");
  write(jobs, "broken/qa/approval.json", { status: "publish_ready", by: "human", name: "张三" });
  write(jobs, "broken/data/aroll-transcript.json", {});
  write(jobs, "broken/data/captions.json", []);
  // 生成物 job
  write(jobs, "smoke/project.json", { title: "smoke" });
  // 没有 project.json 的目录不算 job
  fs.mkdirSync(path.join(jobs, "not-a-job"));
  return repo;
}

test("--from 可以给仓库根或 jobs 目录", () => {
  const repo = oldRepo();
  assert.equal(resolveSourceJobs(repo), path.join(repo, "jobs"));
  assert.equal(resolveSourceJobs(path.join(repo, "jobs")), path.join(repo, "jobs"));
});

test("legacy 原因逐条给出，坏 JSON 记录路径", () => {
  const repo = oldRepo();
  assert.deepEqual(legacyReasons(path.join(repo, "jobs", "v1-job")), [REASON_NO_AROLL_CONTRACT, REASON_CAPTIONS_V1, REASON_NO_HUMAN_APPROVAL]);
  const broken = legacyReasons(path.join(repo, "jobs", "broken"));
  assert.equal(broken.length, 1);
  assert.match(broken[0], /^JSON 解析失败: data\/beats\.json/);
});

test("复制迁移：写 legacy、重写 hyperframes 路径、不动 data/、幂等、冲突不覆盖", () => {
  const repo = oldRepo();
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "migrate-new-")), "jobs");
  const plan = planMigration({ fromJobs: path.join(repo, "jobs"), to });
  assert.deepEqual(plan.entries.map((item) => [item.slug, item.action]), [["broken", "copy"], ["smoke", "skip-generated"], ["v1-job", "copy"]]);
  assert.match(renderTable(plan), /v1-job\s+copy\s+3/);

  applyMigration(plan, { now: new Date("2026-09-11T00:00:00.000Z") });
  assert.deepEqual(plan.entries.map((item) => item.action), ["copied", "skip-generated", "copied"]);
  const migrated = JSON.parse(fs.readFileSync(path.join(to, "v1-job", "project.json"), "utf8"));
  assert.deepEqual(migrated.legacy, {
    migratedAt: "2026-09-11T00:00:00.000Z",
    from: path.join(repo, "jobs", "v1-job"),
    reasons: [REASON_NO_AROLL_CONTRACT, REASON_CAPTIONS_V1, REASON_NO_HUMAN_APPROVAL]
  });
  // data/ 逐字节一致，源 project.json 不变
  assert.equal(fs.readFileSync(path.join(to, "v1-job", "data", "rough-cut-edl.json"), "utf8"), fs.readFileSync(path.join(repo, "jobs", "v1-job", "data", "rough-cut-edl.json"), "utf8"));
  assert.equal(fs.readFileSync(path.join(to, "broken", "data", "beats.json"), "utf8"), "{ not json");
  assert.equal("legacy" in JSON.parse(fs.readFileSync(path.join(repo, "jobs", "v1-job", "project.json"), "utf8")), false);
  // symlink 原样保留，package.json 指到仓库绝对路径
  assert.equal(fs.readlinkSync(path.join(to, "v1-job", "variants", "douyin", "assets")), "../../assets");
  const pkg = JSON.parse(fs.readFileSync(path.join(to, "v1-job", "package.json"), "utf8"));
  assert.match(pkg.scripts.lint, /^\/.*\/node_modules\/\.bin\/hyperframes lint$/);
  const variantPkg = JSON.parse(fs.readFileSync(path.join(to, "v1-job", "variants", "douyin", "package.json"), "utf8"));
  assert.equal(variantPkg.scripts.lint, pkg.scripts.lint);
  assert.equal(fs.existsSync(path.join(to, "smoke")), false);

  // 幂等：再跑一遍全部 skip-identical
  const again = planMigration({ fromJobs: path.join(repo, "jobs"), to });
  assert.deepEqual(again.entries.map((item) => item.action), ["skip-identical", "skip-generated", "skip-identical"]);
  applyMigration(again);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to, "v1-job", "project.json"), "utf8")).legacy, migrated.legacy);

  // 目标已有不同 project.json → conflict，不覆盖
  write(to, "v1-job/project.json", { title: "edited on new machine" });
  const conflict = planMigration({ fromJobs: path.join(repo, "jobs"), to });
  assert.equal(conflict.entries.find((item) => item.slug === "v1-job").action, "conflict");
  applyMigration(conflict);
  assert.equal(JSON.parse(fs.readFileSync(path.join(to, "v1-job", "project.json"), "utf8")).title, "edited on new machine");
});

test("--move 迁移后源目录消失；源与目标相同拒绝", () => {
  const repo = oldRepo();
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "migrate-move-")), "jobs");
  const plan = applyMigration(planMigration({ fromJobs: path.join(repo, "jobs"), to }), { move: true });
  assert.deepEqual(plan.entries.map((item) => item.action), ["moved", "skip-generated", "moved"]);
  assert.equal(fs.existsSync(path.join(repo, "jobs", "v1-job")), false);
  assert.ok(fs.existsSync(path.join(to, "v1-job", "assets", "aroll.mp4")));
  assert.throws(() => planMigration({ fromJobs: to, to }), /源与目标相同/);
  assert.throws(() => planMigration({ fromJobs: path.join(repo, "nope"), to }), /不存在/);
});
