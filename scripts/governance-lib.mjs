// ============================================================
// 治理合同：审批人身份、批量盖章检测、高危信号处理登记
// 为什么：2026-09-05 客户机审计发现 approval.json 全是 Agent 一秒钟批
// 完的，人从没看过切点图；deliver / review init 只认 by: human。
// 这里只放纯函数（读文件、判定、报错），命令行入口各自 import。
// ============================================================
import fs from "node:fs";
import path from "node:path";

import { readJson, readJsonArray } from "./lib.mjs";

export const APPROVAL_ACTORS = Object.freeze(["human", "agent"]);
export const BATCH_STAMP_WINDOW_MS = 2000;
export const AGENT_APPROVAL_BYPASS_ENV = "FACTORY_ALLOW_AGENT_APPROVAL";

// --by human|agent --name <人名>；默认 agent。人签必须留名，Agent 也要留名（哪个 Agent）。
export function approvalActor(args) {
  const by = String(args.by || "agent").trim().toLowerCase();
  if (!APPROVAL_ACTORS.includes(by)) throw new Error(`--by 只能是 human 或 agent，收到: ${by}`);
  const name = String(args.name || args.reviewer || "").trim();
  if (!name) throw new Error(by === "human" ? "--by human 必须带 --name <人名>" : "必须提供 --name（或旧参数 --reviewer）");
  return { by, name };
}

// ============================================================
// 审批文件的唯一写法（v2.0.3 spec B）
// 为什么：终端 approve-*.mjs 与网页 /approve 两个入口写同一份 approval.json，
// 字段形状必须在一处定义，否则 deliver / status 的门禁会读到两套口径。
// extra 只允许追加字段（via / videoHash / revision），不能覆盖 by / reviewedAt。
// ============================================================
export function cutApprovalRecord({ by, name, cutCount, acousticReviewed = false, acousticBoundaryWarnings = 0, notes = "逐张检查通过", now = new Date(), extra = {} }) {
  return {
    ...extra,
    status: "approved",
    by,
    name,
    reviewedAt: now.toISOString(),
    reviewer: name,
    cutCount: Number(cutCount),
    acousticReviewed: Boolean(acousticReviewed),
    acousticBoundaryWarnings: Number(acousticBoundaryWarnings),
    notes: String(notes)
  };
}

export function finalApprovalRecord({ by, name, frameCount, fullPlayback = false, notes = "已检查全部最终 MP4 抽帧", now = new Date(), extra = {} }) {
  const played = Boolean(fullPlayback);
  return {
    ...extra,
    status: played ? "publish_ready" : "frames_approved_playback_pending",
    by,
    name,
    reviewedAt: now.toISOString(),
    reviewer: name,
    frameCount: Number(frameCount),
    fullPlayback: played,
    notes: String(notes)
  };
}

// 切点批准前置检查：报告在、每张切点图在、有气口警告必须明确听审过。
// 返回 { report, boundaryWarnings }；终端与网页共用同一套拒绝理由。
export function assertCutApprovalAllowed(jobDir, { qaDir = path.join(jobDir, "qa", "cuts"), acousticReviewed = false } = {}) {
  const reportPath = path.join(qaDir, "report.json");
  const acousticPath = path.join(jobDir, "data", "editor-signals.json");
  const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
  if (!fs.existsSync(reportPath)) throw new Error(`缺少切点报告: ${reportPath}`);
  if (!fs.existsSync(acousticPath)) throw new Error("缺少编辑声学审计；先运行 npm run transcript:audit");
  if (fs.existsSync(edlPath) && fs.statSync(acousticPath).mtimeMs < fs.statSync(edlPath).mtimeMs) {
    throw new Error("编辑声学审计早于当前 EDL；请重新运行 npm run transcript:audit");
  }
  const report = readJson(reportPath);
  const acoustic = readJson(acousticPath);
  const boundaryWarnings = (acoustic.sources || []).flatMap((source) => (source.cutBoundarySignals || []).filter((item) => item.severity !== "ok"));
  if (boundaryWarnings.length && !acousticReviewed) {
    throw new Error(`有 ${boundaryWarnings.length} 个无可靠气口的切点；听审后使用 --acousticReviewed true 明确确认`);
  }
  const missing = (report.cuts || []).filter((cut) => !fs.existsSync(path.join(jobDir, cut.image)));
  if (missing.length) throw new Error(`缺少 ${missing.length} 张切点图，不能批准`);
  return { report, boundaryWarnings };
}

// 终审批准前置检查：规格 QA 报告在且无失败项、有最终 MP4 抽帧。返回 { report, frames }。
export function assertFinalApprovalAllowed(qaDir) {
  const reportPath = path.join(qaDir, "report.json");
  if (!fs.existsSync(reportPath)) throw new Error(`缺少最终 QA 报告: ${reportPath}`);
  const report = readJson(reportPath);
  if (report.failures?.length) throw new Error(`规格 QA 仍有失败项: ${report.failures.join("; ")}`);
  const frameDir = report.framesDir || path.join(qaDir, "final-frames");
  const frames = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((name) => /\.(jpe?g|png)$/i.test(name)) : [];
  if (!frames.length) throw new Error("没有最终 MP4 抽帧，不能批准");
  return { report, frames };
}

export function readApproval(file) {
  if (!fs.existsSync(file)) return null;
  const approval = readJson(file);
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  return approval;
}

export function agentApprovalBypassed() {
  return process.env[AGENT_APPROVAL_BYPASS_ENV] === "1";
}

// deliver* / review init 的硬门：批准文件必须存在且 by: human。
// CI / smoke 用 FACTORY_ALLOW_AGENT_APPROVAL=1 绕过，但必须大声打印。
export function assertHumanApproval(file, label, commandName) {
  if (agentApprovalBypassed()) {
    console.warn(`!!!!!! ${commandName}: ${AGENT_APPROVAL_BYPASS_ENV}=1 跳过「${label}」人签检查，仅限 CI / smoke，交付件不得出厂 !!!!!!`);
    return null;
  }
  const approval = readApproval(file);
  if (!approval) {
    throw new Error(`${commandName} 拒绝执行：缺少「${label}」批准文件 ${file}；需要人亲自看完后执行对应 approve 命令 --by human --name <人名>`);
  }
  if (approval.by !== "human") {
    throw new Error(
      `${commandName} 拒绝执行：「${label}」的 by=${approval.by || "缺失"}，只接受 by: human（${file}）。` +
      "Agent 不能替人盖章；请用户亲自确认后在终端执行 approve 命令 --by human --name <人名>。"
    );
  }
  return approval;
}

// job 内所有 approval.json：qa/cuts、qa/、variants/*/qa/。
export function findApprovalFiles(jobDir) {
  const found = [];
  const candidates = [
    path.join(jobDir, "qa", "cuts", "approval.json"),
    path.join(jobDir, "qa", "approval.json")
  ];
  const variantsDir = path.join(jobDir, "variants");
  if (fs.existsSync(variantsDir)) {
    for (const entry of fs.readdirSync(variantsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(path.join(variantsDir, entry.name, "qa", "approval.json"));
    }
  }
  for (const file of candidates) {
    if (fs.existsSync(file)) found.push(file);
  }
  return found;
}

// 批量盖章：任意两份 approval 的 reviewedAt（缺失则用 mtime）相差 ≤ 2 秒。
// 人不可能两秒内看完两份不同的抽帧；这是 Agent 一把梭的指纹。
export function detectBatchStamp(jobDir, { windowMs = BATCH_STAMP_WINDOW_MS } = {}) {
  const stamps = findApprovalFiles(jobDir).map((file) => {
    let at = Number.NaN;
    try {
      const approval = readApproval(file);
      at = Date.parse(approval?.reviewedAt || approval?.approvedAt || "");
    } catch {
      at = Number.NaN;
    }
    if (!Number.isFinite(at)) at = fs.statSync(file).mtimeMs;
    return { file: path.relative(jobDir, file).replaceAll(path.sep, "/"), at };
  }).sort((a, b) => a.at - b.at);
  const pairs = [];
  for (let i = 1; i < stamps.length; i += 1) {
    const gap = stamps[i].at - stamps[i - 1].at;
    if (gap <= windowMs) pairs.push({ a: stamps[i - 1].file, b: stamps[i].file, gapMs: Math.round(gap) });
  }
  return { count: stamps.length, pairs };
}

// ============================================================
// 高危编辑信号 × 处理登记（data/resolved-signals.json）
// editor-signals.json 由 transcript:audit 生成、无 id；这里派生稳定 id：
//   <source basename>#<type>@<start>          （disfluencySignals）
//   <source basename>#cut:<range>:<side>@<time>（cutBoundarySignals）
// EDL 是数组放不下附加字段，所以登记放 sidecar：
//   [{ "id": "...", "reason": "一句话说明怎么处理的" }]
// ============================================================
export function signalId(source, item) {
  const base = path.basename(String(source || ""));
  if (item.range != null && item.side) return `${base}#cut:${item.range}:${item.side}@${round3(item.time)}`;
  return `${base}#${item.type}@${round3(item.start)}`;
}

export function listHighSignals(jobDir) {
  const file = path.join(jobDir, "data", "editor-signals.json");
  if (!fs.existsSync(file)) return [];
  const report = readJson(file);
  const edl = safeArray(path.join(jobDir, "data", "rough-cut-edl.json"));
  const out = [];
  for (const source of report.sources || []) {
    const kept = edl.filter((range) => range.source === source.source);
    for (const item of source.disfluencySignals || []) {
      if (item.severity !== "high") continue;
      // 已被 EDL 整段剪掉的信号不需要登记；只有落在保留段里的才算未处理
      const inKept = kept.some((range) => Number(item.end) > Number(range.sourceStart) && Number(item.start) < Number(range.sourceEnd));
      if (!kept.length || inKept) out.push({ id: signalId(source.source, item), kind: item.type, reason: item.reason, start: item.start, end: item.end });
    }
    for (const item of source.cutBoundarySignals || []) {
      if (item.severity !== "high") continue;
      out.push({ id: signalId(source.source, item), kind: "cut_boundary", reason: item.reason, start: item.time, end: item.time });
    }
  }
  return out;
}

export function readResolvedSignals(jobDir) {
  const file = path.join(jobDir, "data", "resolved-signals.json");
  const items = safeArray(file);
  for (const [index, item] of items.entries()) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) throw new Error(`resolved-signals.json[${index}].id 必须是字符串`);
    if (typeof item.reason !== "string" || !item.reason.trim()) throw new Error(`resolved-signals.json[${index}].reason 必须写一句处理说明`);
  }
  return items;
}

export function unresolvedHighSignals(jobDir) {
  const resolved = new Set(readResolvedSignals(jobDir).map((item) => item.id));
  return listHighSignals(jobDir).filter((item) => !resolved.has(item.id));
}

export function assertHighSignalsResolved(jobDir, commandName) {
  const pending = unresolvedHighSignals(jobDir);
  if (!pending.length) return;
  const lines = pending.slice(0, 12).map((item) => `  - ${item.id} · ${item.reason}`);
  if (pending.length > 12) lines.push(`  … 另有 ${pending.length - 12} 条`);
  throw new Error(
    `${commandName} 拒绝执行：data/editor-signals.json 有 ${pending.length} 条 severity=high 信号未在 data/resolved-signals.json 登记处理：\n` +
    `${lines.join("\n")}\n` +
    "逐条听审后把 { id, reason } 写进 data/resolved-signals.json，或修改 EDL 把问题段剪掉。"
  );
}

function safeArray(file) {
  return fs.existsSync(file) ? readJsonArray(file) : [];
}

function round3(value) {
  return String(Math.round(Number(value) * 1000) / 1000);
}
