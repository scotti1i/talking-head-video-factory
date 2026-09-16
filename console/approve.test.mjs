import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  approvalDetail,
  consolePort,
  finalApprovalState,
  latestRevision,
  mediaUrl,
  pendingApprovals,
  resolveMediaPath,
  submitApproval,
  writeFeedbackInbox
} from "./approve.mjs";

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
};

// 一个待审切点的 job：切点报告 + 两张切点图 + 声学审计（晚于 EDL）
function makeCutsJob(root, slug, { warnings = 0 } = {}) {
  const dir = path.join(root, slug);
  write(path.join(dir, "project.json"), { title: `标题-${slug}` });
  write(path.join(dir, "data", "rough-cut-edl.json"), [{ source: "a.mov", sourceStart: 0, sourceEnd: 2 }]);
  write(path.join(dir, "qa", "cuts", "cut-01.jpg"), "jpg");
  write(path.join(dir, "qa", "cuts", "cut-02.jpg"), "jpg");
  write(path.join(dir, "qa", "cuts", "report.json"), { status: "review", cuts: [
    { index: 1, time: 1.5, image: "qa/cuts/cut-01.jpg" },
    { index: 2, time: 4.25, image: "qa/cuts/cut-02.jpg" }
  ] });
  const future = new Date(Date.now() + 5000);
  write(path.join(dir, "data", "editor-signals.json"), { sources: [{ source: "a.mov", disfluencySignals: [], cutBoundarySignals: Array.from({ length: warnings }, (_, i) => ({ severity: "warn", time: i })) }] });
  fs.utimesSync(path.join(dir, "data", "editor-signals.json"), future, future);
  return dir;
}

// 一个待终审的 job：R0、R1 两版审片视频 + 规格 QA 报告无失败 + 抽帧
function makeFinalJob(root, slug) {
  const dir = path.join(root, slug);
  write(path.join(dir, "project.json"), { title: `标题-${slug}` });
  write(path.join(dir, "review", "R0", "video.mp4"), "old video bytes");
  write(path.join(dir, "review", "R1", "video.mp4"), "new video bytes");
  write(path.join(dir, "qa", "report.json"), { failures: [] });
  write(path.join(dir, "qa", "final-frames", "f-001.jpg"), "jpg");
  write(path.join(dir, "qa", "final-frames", "f-002.jpg"), "jpg");
  write(path.join(dir, "qa", "final-frames", "f-003.jpg"), "jpg");
  return dir;
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "approve-jobs-"));
}

test("端口取 CONSOLE_PORT，默认 4870", () => {
  assert.equal(consolePort({}), 4870);
  assert.equal(consolePort({ CONSOLE_PORT: "5001" }), 5001);
});

test("待审判定：切点缺 human 签、终审最新修订缺 human 签；agent 签不算", () => {
  const root = tempRoot();
  try {
    makeCutsJob(root, "cuts-job");
    makeFinalJob(root, "final-job");
    write(path.join(root, "agent-signed", "project.json"), { title: "x" });
    write(path.join(root, "agent-signed", "qa", "cuts", "report.json"), { cuts: [] });
    write(path.join(root, "agent-signed", "qa", "cuts", "approval.json"), { by: "agent", name: "codex" });
    write(path.join(root, ".hidden", "project.json"), {});
    write(path.join(root, "no-project", "qa", "cuts", "report.json"), { cuts: [] });
    const pending = pendingApprovals({ root }).map((item) => [item.slug, item.kind, item.revision]);
    assert.deepEqual(pending.sort(), [["agent-signed", "cuts", null], ["cuts-job", "cuts", null], ["final-job", "final", "R1"]]);
    assert.equal(latestRevision(path.join(root, "final-job")).revision, "R1");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("终审：human 签了旧修订仍算待审；签了最新修订才算过", () => {
  const root = tempRoot();
  try {
    const dir = makeFinalJob(root, "job");
    write(path.join(dir, "qa", "approval.json"), { by: "human", name: "甲", reviewedAt: new Date().toISOString(), revision: "R0" });
    assert.equal(finalApprovalState(dir).pending, true);
    write(path.join(dir, "qa", "approval.json"), { by: "human", name: "甲", reviewedAt: new Date().toISOString(), revision: "R1" });
    assert.equal(finalApprovalState(dir).pending, false);
    // 终端命令写的没有 revision 字段：靠 reviewedAt 是否晚于最新审片视频
    write(path.join(dir, "qa", "approval.json"), { by: "human", name: "甲", reviewedAt: "2020-01-01T00:00:00.000Z" });
    assert.equal(finalApprovalState(dir).pending, true);
    write(path.join(dir, "qa", "approval.json"), { by: "human", name: "甲", reviewedAt: new Date(Date.now() + 60_000).toISOString() });
    assert.equal(finalApprovalState(dir).pending, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("详情：切点图与审片视频都走 /media/，拦截理由随详情返回", () => {
  const root = tempRoot();
  try {
    makeCutsJob(root, "job", { warnings: 2 });
    const detail = approvalDetail("job", { root });
    assert.equal(detail.title, "标题-job");
    assert.deepEqual(detail.cuts.images.map((image) => image.url), ["/media/job/qa/cuts/cut-01.jpg", "/media/job/qa/cuts/cut-02.jpg"]);
    assert.equal(detail.cuts.boundaryWarnings, 2);
    assert.equal(detail.cuts.blocker, null);
    assert.equal(detail.final, null);
    const withFinal = makeFinalJob(root, "job2");
    fs.rmSync(path.join(withFinal, "qa", "final-frames"), { recursive: true });
    const detail2 = approvalDetail("job2", { root });
    assert.equal(detail2.final.videoUrl, "/media/job2/review/R1/video.mp4");
    assert.deepEqual(detail2.final.revisions, ["R0", "R1"]);
    assert.match(detail2.final.blocker, /没有最终 MP4 抽帧/);
    assert.throws(() => approvalDetail("../etc", { root }), /越界|不合法/);
    assert.throws(() => approvalDetail("nope", { root }), /job 不存在/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("POST 切点：写出与终端 qa:cuts:approve 同形的 approval.json（多 via），有气口警告必须勾听过", () => {
  const root = tempRoot();
  try {
    const dir = makeCutsJob(root, "job", { warnings: 1 });
    assert.throws(() => submitApproval({ root, job: "job", kind: "cuts", name: "甲", fullPlayback: true }), /无可靠气口/);
    assert.throws(() => submitApproval({ root, job: "job", kind: "cuts", name: "  ", fullPlayback: true, acousticReviewed: true }), /姓名/);
    assert.throws(() => submitApproval({ root, job: "job", kind: "cuts", name: "甲", fullPlayback: false, acousticReviewed: true }), /完整看完/);
    const now = new Date("2026-09-16T08:00:00.000Z");
    const { file, approval } = submitApproval({ root, job: "job", kind: "cuts", name: "甲", fullPlayback: true, acousticReviewed: true }, now);
    assert.equal(file, path.join(dir, "qa", "cuts", "approval.json"));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      via: "console",
      fullPlayback: true,
      status: "approved",
      by: "human",
      name: "甲",
      reviewedAt: "2026-09-16T08:00:00.000Z",
      reviewer: "甲",
      cutCount: 2,
      acousticReviewed: true,
      acousticBoundaryWarnings: 1,
      notes: "网页审批：逐张看完切点图"
    });
    assert.deepEqual(approval, JSON.parse(fs.readFileSync(file, "utf8")));
    assert.equal(pendingApprovals({ root }).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("POST 终审：必须播放到结尾；写 by:human + via + videoHash + revision，与终端 qa:final:approve 同形", () => {
  const root = tempRoot();
  try {
    const dir = makeFinalJob(root, "job");
    assert.throws(() => submitApproval({ root, job: "job", kind: "final", name: "乙", fullPlayback: true, watchedToEnd: false }), /播放到结尾/);
    assert.throws(() => submitApproval({ root, job: "job", kind: "final", name: "乙", fullPlayback: true, watchedToEnd: true, revision: "R0" }), /不是最新修订/);
    assert.throws(() => submitApproval({ root, job: "job", kind: "other", name: "乙", fullPlayback: true }), /kind/);
    const now = new Date("2026-09-16T09:00:00.000Z");
    const { file } = submitApproval({ root, job: "job", kind: "final", name: "乙", fullPlayback: true, watchedToEnd: true, revision: "R1" }, now);
    const expectedHash = crypto.createHash("sha256").update("new video bytes").digest("hex");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      via: "console",
      revision: "R1",
      videoHash: expectedHash,
      watchedToEnd: true,
      status: "publish_ready",
      by: "human",
      name: "乙",
      reviewedAt: "2026-09-16T09:00:00.000Z",
      reviewer: "乙",
      frameCount: 3,
      fullPlayback: true,
      notes: "网页审批：R1 完整播放到结尾"
    });
    assert.equal(finalApprovalState(dir).pending, false);
    // 规格 QA 有失败项时拒绝，和终端一致
    write(path.join(dir, "qa", "report.json"), { failures: ["pillarbox"] });
    assert.throws(() => submitApproval({ root, job: "job", kind: "final", name: "乙", fullPlayback: true, watchedToEnd: true }), /规格 QA 仍有失败项/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("退回：只追加 review/Rn/feedback-inbox.md，不写 approval", () => {
  const root = tempRoot();
  try {
    const dir = makeFinalJob(root, "job");
    assert.throws(() => writeFeedbackInbox({ root, job: "job", note: "  " }), /写一句问题/);
    const first = writeFeedbackInbox({ root, job: "job", name: "丙", note: "12 秒字幕错字" }, new Date("2026-09-16T10:00:00.000Z"));
    assert.equal(first.revision, "R1");
    writeFeedbackInbox({ root, job: "job", revision: "r1", note: "结尾黑场太长" }, new Date("2026-09-16T10:01:00.000Z"));
    const text = fs.readFileSync(path.join(dir, "review", "R1", "feedback-inbox.md"), "utf8");
    assert.match(text, /^# R1 退回意见（网页审批）\n\n## 2026-09-16T10:00:00\.000Z · 丙\n\n12 秒字幕错字\n\n## 2026-09-16T10:01:00\.000Z · 未署名\n\n结尾黑场太长\n\n$/);
    assert.equal(fs.existsSync(path.join(dir, "qa", "approval.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("媒体路由只认 jobsRoot 之内的文件", () => {
  const root = tempRoot();
  try {
    assert.equal(resolveMediaPath("job/qa/cuts/cut-01.jpg", { root }), path.join(root, "job", "qa", "cuts", "cut-01.jpg"));
    assert.throws(() => resolveMediaPath("../outside.mp4", { root }), /越界/);
    assert.throws(() => resolveMediaPath("job/../../etc/passwd", { root }), /越界/);
    assert.throws(() => resolveMediaPath("/etc/passwd", { root }), /越界/);
    assert.throws(() => resolveMediaPath("", { root }), /越界/);
    assert.equal(mediaUrl(path.join(root, "a b", "review", "R0", "video.mp4"), { root }), "/media/a%20b/review/R0/video.mp4");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
