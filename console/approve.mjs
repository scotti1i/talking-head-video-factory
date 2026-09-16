// ============================================================
// 网页一键审批（v2.0.3 spec B）——唯一必须留人的地方，但零终端
// 为什么：客户没有代码基础，终端 approve 命令对他们不可用；但审批
//   by:human 是 deliver / review init 的硬门，不能让 Agent 代签。
//   这里把「待审批」从磁盘事实推导出来，把「通过」写成与终端命令
//   完全同形的 approval.json（形状由 governance-lib 唯一定义）。
// 待审批判定：
//   切点：qa/cuts/report.json 存在，且 qa/cuts/approval.json 缺失或 by !== human
//   终审：review/R*/video.mp4 存在，且 qa/approval.json 不是 human 签的最新修订
//        （approval.revision 与最新修订不同，或没记 revision 但早于最新审片视频）
// 只放纯函数（读盘、判定、写文件），HTTP 路由在 server.mjs。
// ============================================================
import fs from "node:fs";
import path from "node:path";

import { atomicWriteJson, jobsRoot, readJson } from "../scripts/lib.mjs";
import {
  assertCutApprovalAllowed,
  assertFinalApprovalAllowed,
  cutApprovalRecord,
  finalApprovalRecord,
  readApproval
} from "../scripts/governance-lib.mjs";
import { sha256File } from "../scripts/review-feedback-lib.mjs";

export const DEFAULT_PORT = 4870;
export const APPROVAL_KINDS = Object.freeze(["cuts", "final"]);

export function consolePort(env = process.env) {
  return Number(env.CONSOLE_PORT || DEFAULT_PORT);
}

// ---- 路径 ----
function resolveInside(root, rel, label = "路径") {
  const base = path.resolve(root);
  const target = path.resolve(base, String(rel || ""));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`${label}越界`);
  return target;
}

export function jobDirOf(slug, { root = jobsRoot() } = {}) {
  const text = String(slug || "").trim();
  if (!text || text.startsWith(".")) throw new Error("job 名不合法");
  const dir = resolveInside(root, text, "job ");
  if (dir === path.resolve(root)) throw new Error("job 名不合法");
  return dir;
}

// /media/<相对 jobsRoot 的路径>：只允许 jobsRoot 之内的文件
export function resolveMediaPath(rel, { root = jobsRoot() } = {}) {
  const file = resolveInside(root, rel, "媒体路径");
  if (file === path.resolve(root)) throw new Error("媒体路径越界");
  return file;
}

export function mediaUrl(file, { root = jobsRoot() } = {}) {
  const rel = path.relative(path.resolve(root), path.resolve(file)).split(path.sep).map(encodeURIComponent).join("/");
  return `/media/${rel}`;
}

// ---- 修订 ----
export function listRevisions(jobDir) {
  const reviewDir = path.join(jobDir, "review");
  if (!fs.existsSync(reviewDir)) return [];
  return fs.readdirSync(reviewDir)
    .map((name) => ({ name, match: name.match(/^R(\d+)$/) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => ({ revision: name, n: Number(match[1]), video: path.join(reviewDir, name, "video.mp4") }))
    .filter((item) => fs.existsSync(item.video))
    .map((item) => ({ ...item, videoMtime: fs.statSync(item.video).mtimeMs }))
    .sort((a, b) => a.n - b.n);
}

export function latestRevision(jobDir) {
  return listRevisions(jobDir).at(-1) || null;
}

// ---- 待审批判定 ----
export function cutApprovalState(jobDir) {
  const reportFile = path.join(jobDir, "qa", "cuts", "report.json");
  if (!fs.existsSync(reportFile)) return null;
  const approval = readApproval(path.join(jobDir, "qa", "cuts", "approval.json"));
  return { pending: approval?.by !== "human", approval };
}

export function finalApprovalState(jobDir) {
  const latest = latestRevision(jobDir);
  if (!latest) return null;
  const approval = readApproval(path.join(jobDir, "qa", "approval.json"));
  let pending = approval?.by !== "human";
  if (!pending) {
    pending = approval.revision
      ? approval.revision !== latest.revision
      : !(Date.parse(approval.reviewedAt || "") >= latest.videoMtime);
  }
  return { pending, approval, revision: latest.revision };
}

function readTitle(jobDir, slug) {
  const file = path.join(jobDir, "project.json");
  if (!fs.existsSync(file)) return slug;
  try {
    return readJson(file).title || slug;
  } catch {
    return slug;
  }
}

export function pendingApprovals({ root = jobsRoot() } = {}) {
  if (!fs.existsSync(root)) return [];
  const items = [];
  for (const slug of fs.readdirSync(root).sort()) {
    if (slug.startsWith(".")) continue;
    const jobDir = path.join(root, slug);
    if (!fs.existsSync(path.join(jobDir, "project.json"))) continue;
    const title = readTitle(jobDir, slug);
    const cuts = cutApprovalState(jobDir);
    if (cuts?.pending) items.push({ slug, title, kind: "cuts", revision: null, updatedAt: fs.statSync(path.join(jobDir, "qa", "cuts", "report.json")).mtimeMs });
    const final = finalApprovalState(jobDir);
    if (final?.pending) items.push({ slug, title, kind: "final", revision: final.revision, updatedAt: latestRevision(jobDir).videoMtime });
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

function blockerOf(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error.message;
  }
}

// 详情页数据：切点图 / 审片视频的 URL、前置检查的拦截理由（拦截时按钮禁用并把理由亮出来）
export function approvalDetail(slug, { root = jobsRoot() } = {}) {
  const jobDir = jobDirOf(slug, { root });
  if (!fs.existsSync(path.join(jobDir, "project.json"))) throw new Error("job 不存在");
  const title = readTitle(jobDir, slug);
  const cutsState = cutApprovalState(jobDir);
  let cuts = null;
  if (cutsState) {
    const report = readJson(path.join(jobDir, "qa", "cuts", "report.json"));
    const signalsFile = path.join(jobDir, "data", "editor-signals.json");
    const signals = fs.existsSync(signalsFile) ? readJson(signalsFile) : { sources: [] };
    const boundaryWarnings = (signals.sources || []).flatMap((source) => (source.cutBoundarySignals || []).filter((item) => item.severity !== "ok"));
    // 切点要「听过气口」才能签，页面必须能放工作母版：每张切点图可点跳到该切点前 1.5s 播放
    const project = fs.existsSync(path.join(jobDir, "project.json")) ? readJson(path.join(jobDir, "project.json")) : {};
    const master = path.join(jobDir, project.sourceVideo || "assets/aroll.mp4");
    cuts = {
      ...cutsState,
      video: fs.existsSync(master) ? mediaUrl(master, { root }) : null,
      cutCount: (report.cuts || []).length,
      images: (report.cuts || []).map((cut) => ({ index: cut.index, time: cut.time, url: mediaUrl(path.join(jobDir, cut.image), { root }) })),
      boundaryWarnings: boundaryWarnings.length,
      blocker: blockerOf(() => assertCutApprovalAllowed(jobDir, { acousticReviewed: true }))
    };
  }
  const finalState = finalApprovalState(jobDir);
  let final = null;
  if (finalState) {
    const latest = latestRevision(jobDir);
    final = {
      ...finalState,
      videoUrl: mediaUrl(latest.video, { root }),
      revisions: listRevisions(jobDir).map((item) => item.revision),
      blocker: blockerOf(() => assertFinalApprovalAllowed(path.join(jobDir, "qa")))
    };
  }
  return { slug, title, cuts, final };
}

// ---- 写入 ----
function cleanName(name) {
  const text = String(name || "").trim();
  if (!text) throw new Error("必须填写姓名");
  if (text.length > 40) throw new Error("姓名过长");
  return text;
}

export function submitApproval({ root = jobsRoot(), job, kind, name, fullPlayback, watchedToEnd, acousticReviewed, revision } = {}, now = new Date()) {
  if (!APPROVAL_KINDS.includes(kind)) throw new Error(`kind 只能是 ${APPROVAL_KINDS.join("|")}`);
  const jobDir = jobDirOf(job, { root });
  const who = cleanName(name);
  if (fullPlayback !== true) throw new Error("必须勾选「我完整看完了这条片」");

  if (kind === "cuts") {
    const heard = acousticReviewed === true;
    const { report, boundaryWarnings } = assertCutApprovalAllowed(jobDir, { acousticReviewed: heard });
    const approval = cutApprovalRecord({
      by: "human",
      name: who,
      cutCount: report.cuts.length,
      acousticReviewed: heard,
      acousticBoundaryWarnings: boundaryWarnings.length,
      notes: "网页审批：逐张看完切点图",
      now,
      extra: { via: "console", fullPlayback: true }
    });
    const file = path.join(jobDir, "qa", "cuts", "approval.json");
    atomicWriteJson(file, approval);
    return { file, approval };
  }

  if (watchedToEnd !== true) throw new Error("必须把审片视频播放到结尾才能通过");
  const latest = latestRevision(jobDir);
  if (!latest) throw new Error("没有可审的审片视频（review/R*/video.mp4）");
  if (revision && String(revision).toUpperCase() !== latest.revision) throw new Error(`${revision} 不是最新修订（最新 ${latest.revision}），请刷新页面`);
  const { frames } = assertFinalApprovalAllowed(path.join(jobDir, "qa"));
  const approval = finalApprovalRecord({
    by: "human",
    name: who,
    frameCount: frames.length,
    fullPlayback: true,
    notes: `网页审批：${latest.revision} 完整播放到结尾`,
    now,
    extra: { via: "console", revision: latest.revision, videoHash: sha256File(latest.video), watchedToEnd: true }
  });
  const file = path.join(jobDir, "qa", "approval.json");
  atomicWriteJson(file, approval);
  return { file, approval };
}

// 「有问题，退回」：只追加一条到 review/Rn/feedback-inbox.md，不写任何 approval。
export function writeFeedbackInbox({ root = jobsRoot(), job, revision, name, note } = {}, now = new Date()) {
  const jobDir = jobDirOf(job, { root });
  const text = String(note || "").trim();
  if (!text) throw new Error("退回必须写一句问题");
  const target = revision ? listRevisions(jobDir).find((item) => item.revision === String(revision).toUpperCase()) : latestRevision(jobDir);
  if (!target) throw new Error("找不到对应的审片修订");
  const file = path.join(jobDir, "review", target.revision, "feedback-inbox.md");
  const who = String(name || "").trim() || "未署名";
  const entry = `## ${now.toISOString()} · ${who}\n\n${text}\n\n`;
  const header = fs.existsSync(file) ? "" : `# ${target.revision} 退回意见（网页审批）\n\n`;
  fs.appendFileSync(file, header + entry);
  return { file, revision: target.revision };
}
