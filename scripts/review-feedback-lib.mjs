import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { atomicWriteJson, readJson } from "./lib.mjs";
import { assertHighSignalsResolved, assertHumanApproval } from "./governance-lib.mjs";

export const FEEDBACK_CATEGORIES = Object.freeze([
  "fine-cut",
  "take-selection",
  "caption",
  "framing",
  "broll",
  "template",
  "audio",
  "trade-expression",
  "compliance",
  "other"
]);

export const FEEDBACK_SCOPES = Object.freeze([
  "project",
  "client",
  "template-pack",
  "factory-profile"
]);

export const FEEDBACK_STATUSES = Object.freeze([
  "open",
  "planned",
  "resolved",
  "accepted",
  "rejected"
]);

const TRUTH_FILES = Object.freeze([
  "project.md",
  "project.json",
  "data/rough-cut-edl.json",
  "data/captions.json",
  "data/beats.json",
  "data/broll.json",
  "data/primary-clips.json",
  "data/aroll-cues.json",
  "data/audio-cues.json",
  "data/music-bed.json"
]);

// spec §2.3：冻结审片版本前，切点批准必须是人签的，且 high 信号已登记处理。
// 纯函数层不读环境变量以外的东西；enforce=false 只给旧测试夹具用。
export function assertReviewInitAllowed(jobDir) {
  assertHumanApproval(path.join(jobDir, "qa", "cuts", "approval.json"), "切点批准", "review init");
  assertHighSignalsResolved(jobDir, "review init");
}

export function createReviewRevision({ jobDir, revision, video, duration, now = new Date(), enforce = true }) {
  const normalizedRevision = normalizeRevision(revision);
  const reviewDir = path.join(jobDir, "review", normalizedRevision);
  if (fs.existsSync(reviewDir)) throw new Error(`审片版本已存在: ${reviewDir}`);
  if (enforce) assertReviewInitAllowed(jobDir);
  const videoPath = resolveJobRelative(jobDir, video, "video");
  if (!fs.existsSync(videoPath)) throw new Error(`审片视频不存在: ${video}`);
  const videoDuration = Number(duration);
  if (!(videoDuration > 0)) throw new Error("审片视频时长必须大于 0");

  fs.mkdirSync(reviewDir, { recursive: true });
  try {
    const frozenVideoPath = path.join(reviewDir, `video${path.extname(videoPath).toLowerCase() || ".mp4"}`);
    fs.copyFileSync(videoPath, frozenVideoPath, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
    const manifest = {
      schemaVersion: 1,
      revision: normalizedRevision,
      createdAt: now.toISOString(),
      video: {
        path: path.relative(jobDir, frozenVideoPath).replaceAll(path.sep, "/"),
        source: path.relative(jobDir, videoPath).replaceAll(path.sep, "/"),
        sha256: sha256File(frozenVideoPath),
        duration: round(videoDuration)
      },
      truth: TRUTH_FILES
        .map((relativePath) => snapshotFile(jobDir, relativePath))
        .filter(Boolean)
    };
    const feedback = {
      schemaVersion: 1,
      revision: normalizedRevision,
      items: []
    };
    atomicWriteJson(path.join(reviewDir, "manifest.json"), manifest);
    atomicWriteJson(path.join(reviewDir, "feedback.json"), feedback);
    return { reviewDir, manifest, feedback };
  } catch (error) {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    throw error;
  }
}

export function validateReviewFeedback({ jobDir, revision }) {
  const normalizedRevision = normalizeRevision(revision);
  const reviewDir = path.join(jobDir, "review", normalizedRevision);
  const manifestPath = path.join(reviewDir, "manifest.json");
  const feedbackPath = path.join(reviewDir, "feedback.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(feedbackPath)) {
    throw new Error(`审片版本不完整: ${reviewDir}`);
  }
  const manifest = readJson(manifestPath);
  const feedback = readJson(feedbackPath);
  if (manifest.schemaVersion !== 1 || feedback.schemaVersion !== 1) throw new Error("审片合同 schemaVersion 必须为 1");
  if (manifest.revision !== normalizedRevision || feedback.revision !== normalizedRevision) throw new Error("审片版本号不一致");
  if (!Array.isArray(feedback.items)) throw new Error("feedback.items 必须是数组");
  const duration = Number(manifest.video?.duration);
  if (!(duration > 0)) throw new Error("manifest.video.duration 非法");
  const frozenVideoPath = resolveJobRelative(jobDir, manifest.video?.path, "manifest.video.path");
  if (!fs.existsSync(frozenVideoPath)) throw new Error("冻结审片视频不存在");
  if (sha256File(frozenVideoPath) !== manifest.video.sha256) throw new Error("冻结审片视频哈希漂移；拒绝覆盖历史 revision");

  const ids = new Set();
  for (const [index, item] of feedback.items.entries()) {
    const label = `feedback.items[${index}]`;
    if (!/^[a-z][a-z0-9-]*$/.test(item?.id || "")) throw new Error(`${label}.id 必须是 kebab-case`);
    if (ids.has(item.id)) throw new Error(`${label}.id 重复: ${item.id}`);
    ids.add(item.id);
    const start = Number(item.start);
    const end = Number(item.end ?? item.start);
    if (!(start >= 0 && end >= start && end <= duration + 0.001)) throw new Error(`${label} 时间越界`);
    if (!FEEDBACK_CATEGORIES.includes(item.category)) throw new Error(`${label}.category 非法`);
    if (!FEEDBACK_SCOPES.includes(item.scope)) throw new Error(`${label}.scope 非法`);
    if (!FEEDBACK_STATUSES.includes(item.status)) throw new Error(`${label}.status 非法`);
    if (!String(item.instruction || "").trim()) throw new Error(`${label}.instruction 不能为空`);
    if (["resolved", "accepted", "rejected"].includes(item.status) && !String(item.resolution || "").trim()) {
      throw new Error(`${label}.resolution 在 ${item.status} 状态下不能为空`);
    }
    for (const changedFile of item.changedFiles || []) {
      resolveJobRelative(jobDir, changedFile, `${label}.changedFiles`);
    }
  }

  return {
    revision: normalizedRevision,
    duration,
    count: feedback.items.length,
    open: feedback.items.filter((item) => ["open", "planned"].includes(item.status)).length,
    resolved: feedback.items.filter((item) => ["resolved", "accepted"].includes(item.status)).length
  };
}

export function renderFeedbackMarkdown({ jobDir, revision }) {
  const normalizedRevision = normalizeRevision(revision);
  const reviewDir = path.join(jobDir, "review", normalizedRevision);
  const feedback = readJson(path.join(reviewDir, "feedback.json"));
  validateReviewFeedback({ jobDir, revision: normalizedRevision });
  const lines = [
    `# ${normalizedRevision} 审片反馈`,
    "",
    "| 时间 | 类别 | 指令 | 范围 | 状态 | 处理结果 |",
    "|---|---|---|---|---|---|"
  ];
  for (const item of feedback.items) {
    const range = `${formatTime(item.start)}–${formatTime(item.end ?? item.start)}`;
    lines.push(`| ${range} | ${item.category} | ${escapeCell(item.instruction)} | ${item.scope} | ${item.status} | ${escapeCell(item.resolution || "")} |`);
  }
  if (!feedback.items.length) lines.push("| — | — | 暂无反馈 | — | — | — |");
  return `${lines.join("\n")}\n`;
}

function normalizeRevision(value) {
  const revision = String(value || "").trim().toUpperCase();
  if (!/^R\d+$/.test(revision)) throw new Error("revision 必须是 R0、R1 这类格式");
  return revision;
}

function resolveJobRelative(jobDir, requested, label) {
  const text = String(requested || "").trim();
  if (!text || path.isAbsolute(text)) throw new Error(`${label} 必须是 job 内相对路径`);
  const root = path.resolve(jobDir);
  const resolved = path.resolve(root, text);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`${label} 不得越出 job`);
  return resolved;
}

function snapshotFile(jobDir, relativePath) {
  const file = path.join(jobDir, relativePath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return {
    path: relativePath,
    sha256: sha256File(file)
  };
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function formatTime(value) {
  const total = Number(value || 0);
  const minutes = Math.floor(total / 60);
  const seconds = (total - minutes * 60).toFixed(3).padStart(6, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

function escapeCell(value) {
  return String(value || "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}
