import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  approvalActor,
  assertHighSignalsResolved,
  assertHumanApproval,
  detectBatchStamp,
  listHighSignals,
  signalId,
  unresolvedHighSignals
} from "./governance-lib.mjs";

function tempJob() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "governance-"));
}

function write(jobDir, relative, data) {
  const file = path.join(jobDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

test("审批人默认 agent，human 必须留名，非法值失败关闭", () => {
  assert.deepEqual(approvalActor({ reviewer: "codex" }), { by: "agent", name: "codex" });
  assert.deepEqual(approvalActor({ by: "human", name: "张三" }), { by: "human", name: "张三" });
  assert.throws(() => approvalActor({ by: "human" }), /--name/);
  assert.throws(() => approvalActor({ by: "robot", name: "x" }), /只能是 human 或 agent/);
  assert.throws(() => approvalActor({}), /--name/);
});

test("deliver / review init 只接受 by: human；缺文件或 agent 都拒绝", () => {
  const job = tempJob();
  const file = path.join(job, "qa", "approval.json");
  assert.throws(() => assertHumanApproval(file, "最终画面批准", "deliver"), /缺少「最终画面批准」/);
  write(job, "qa/approval.json", { status: "publish_ready", by: "agent", name: "codex" });
  assert.throws(() => assertHumanApproval(file, "最终画面批准", "deliver"), /by=agent/);
  write(job, "qa/approval.json", { status: "publish_ready" });
  assert.throws(() => assertHumanApproval(file, "最终画面批准", "deliver"), /by=缺失/);
  write(job, "qa/approval.json", { status: "publish_ready", by: "human", name: "张三" });
  assert.equal(assertHumanApproval(file, "最终画面批准", "deliver").name, "张三");
});

test("FACTORY_ALLOW_AGENT_APPROVAL=1 绕过人签但大声警告", () => {
  const job = tempJob();
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  process.env.FACTORY_ALLOW_AGENT_APPROVAL = "1";
  try {
    assert.equal(assertHumanApproval(path.join(job, "qa", "approval.json"), "最终画面批准", "deliver"), null);
  } finally {
    delete process.env.FACTORY_ALLOW_AGENT_APPROVAL;
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /!!!!!!.*FACTORY_ALLOW_AGENT_APPROVAL=1/);
});

test("两秒内写出的两份 approval 判为批量盖章", () => {
  const job = tempJob();
  write(job, "qa/cuts/approval.json", { status: "approved", by: "agent", reviewedAt: "2026-09-05T10:00:00.000Z" });
  write(job, "variants/douyin/qa/approval.json", { status: "publish_ready", by: "agent", reviewedAt: "2026-09-05T10:00:01.400Z" });
  write(job, "variants/youtube/qa/approval.json", { status: "publish_ready", by: "human", reviewedAt: "2026-09-05T10:30:00.000Z" });
  const result = detectBatchStamp(job);
  assert.equal(result.count, 3);
  assert.deepEqual(result.pairs, [{ a: "qa/cuts/approval.json", b: "variants/douyin/qa/approval.json", gapMs: 1400 }]);
});

test("high 信号只有落在保留段里或属于切点边界时才需要登记，登记后放行", () => {
  const job = tempJob();
  write(job, "data/editor-signals.json", {
    sources: [{
      source: "assets/originals/take-01.mp4",
      disfluencySignals: [
        { type: "adjacent_repeat", severity: "high", start: 10, end: 12, reason: "同一表达连续重复" },
        { type: "pause_inside_segment", severity: "high", start: 40, end: 41, reason: "卡壳" },
        { type: "low_confidence", severity: "review", start: 5, end: 5.4, reason: "低置信" }
      ],
      cutBoundarySignals: [
        { range: 1, side: "out", time: 20.5, severity: "high", reason: "附近没有可靠气口" },
        { range: 2, side: "in", time: 30, severity: "ok", reason: "有气口" }
      ]
    }]
  });
  write(job, "data/rough-cut-edl.json", [
    { source: "assets/originals/take-01.mp4", sourceStart: 0, sourceEnd: 20.5, reason: "开头" },
    { source: "assets/originals/take-01.mp4", sourceStart: 30, sourceEnd: 35, reason: "结尾" }
  ]);
  const high = listHighSignals(job);
  assert.deepEqual(high.map((item) => item.id), ["take-01.mp4#adjacent_repeat@10", "take-01.mp4#cut:1:out@20.5"]);
  assert.equal(signalId("a/b/take.mp4", { type: "pause_inside_segment", start: 1.23456 }), "take.mp4#pause_inside_segment@1.235");
  assert.throws(() => assertHighSignalsResolved(job, "review init"), /2 条 severity=high/);

  write(job, "data/resolved-signals.json", [{ id: "take-01.mp4#adjacent_repeat@10", reason: "重复的是强调语气，保留" }]);
  assert.equal(unresolvedHighSignals(job).length, 1);
  write(job, "data/resolved-signals.json", [
    { id: "take-01.mp4#adjacent_repeat@10", reason: "重复的是强调语气，保留" },
    { id: "take-01.mp4#cut:1:out@20.5", reason: "听审确认词尾完整" }
  ]);
  assert.doesNotThrow(() => assertHighSignalsResolved(job, "review init"));
  write(job, "data/resolved-signals.json", [{ id: "x" }]);
  assert.throws(() => unresolvedHighSignals(job), /reason/);
});
