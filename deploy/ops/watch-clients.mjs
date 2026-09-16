// ============================================================
// 我们这边的客户看板（spec H）：读 GitHub 上所有 client/* 分支的心跳、事件、rejected 补丁，加开着的 PR，
//   汇总成一段人能读的报告；有异常退出码 2（给定时任务用来决定要不要推通知）。
// 异常定义：48h 无心跳 · 有未处理事件（近 7 天）· 心跳里 acceptance 有 FAIL · 自动升级失败 · 有 open PR 超过 1 个工作日 · 盘位 <60GiB
// 用法：node deploy/ops/watch-clients.mjs [--repo scotti1i/talking-head-video-factory] [--json]
// 依赖：gh 已登录（仓库管理员）。不需要 clone。
// ============================================================
import { spawnSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter(Boolean));
const REPO = String(args.repo || "scotti1i/talking-head-video-factory");
const HOURS_48 = 48 * 3600 * 1000;
const now = Date.now();

function gh(pathname, extra = []) {
  const result = spawnSync("gh", ["api", pathname, ...extra], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function contents(branch, dir) {
  const list = gh(`repos/${REPO}/contents/${dir}?ref=${encodeURIComponent(branch)}`);
  return Array.isArray(list) ? list : [];
}

function fileJson(branch, filePath) {
  const item = gh(`repos/${REPO}/contents/${filePath}?ref=${encodeURIComponent(branch)}`);
  if (!item?.content) return null;
  try { return JSON.parse(Buffer.from(item.content, "base64").toString("utf8")); } catch { return null; }
}

const branches = (gh(`repos/${REPO}/branches?per_page=100`) || []).map((b) => b.name).filter((n) => n.startsWith("client/"));
const reportBranches = branches.filter((n) => !/-fix-/.test(n));
const prs = (gh(`repos/${REPO}/pulls?state=open&per_page=50`) || []).filter((pr) => pr.head?.ref?.startsWith("client/"));
const anomalies = [];
const hosts = [];

for (const branch of reportBranches) {
  const host = branch.slice("client/".length);
  const base = `ops/${host}`;
  const heartbeats = contents(branch, `${base}/heartbeat`).filter((f) => f.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name));
  const latestHb = heartbeats.at(-1) ? fileJson(branch, heartbeats.at(-1).path) : null;
  const hbAt = latestHb?.at ? Date.parse(latestHb.at) : (heartbeats.at(-1) ? Date.parse(heartbeats.at(-1).name.slice(0, 10)) : NaN);
  const events = contents(branch, `${base}/events`).filter((f) => f.name.endsWith(".json"));
  const recentEvents = events.filter((f) => { const t = Date.parse(f.name.slice(0, 10)); return Number.isFinite(t) ? now - t < 7 * 24 * 3600 * 1000 : true; });
  const rejected = contents(branch, `${base}/rejected`);
  const jobs = contents(branch, base).filter((f) => f.type === "dir" && !["heartbeat", "events", "rejected"].includes(f.name));
  const acceptance = Object.entries(latestHb?.acceptance || {}).map(([slug, r]) => `${slug}:${r.overall || "?"}`);
  const failedAcceptance = Object.entries(latestHb?.acceptance || {}).filter(([, r]) => String(r.overall || "").toUpperCase() === "FAIL");
  const summary = {
    host,
    lastHeartbeat: Number.isFinite(hbAt) ? new Date(hbAt).toISOString() : null,
    tag: latestHb?.tag || null,
    updateNewer: latestHb?.update?.newer || false,
    autoUpdate: latestHb?.autoUpdate || null,
    diskFreeGiB: latestHb?.diskFreeGiB ?? null,
    recentEvents: recentEvents.map((f) => f.name),
    rejected: rejected.map((f) => f.name),
    jobsReported: jobs.map((f) => f.name),
    acceptance
  };
  hosts.push(summary);
  if (!Number.isFinite(hbAt) || now - hbAt > HOURS_48) anomalies.push(`${host}：${Number.isFinite(hbAt) ? `${Math.round((now - hbAt) / 3600000)} 小时` : "从未"}没有心跳`);
  if (recentEvents.length) anomalies.push(`${host}：近 7 天有 ${recentEvents.length} 个出错事件（最新 ${recentEvents.at(-1).name}）`);
  if (failedAcceptance.length) anomalies.push(`${host}：acceptance FAIL：${failedAcceptance.map(([s]) => s).join("、")}`);
  if (latestHb?.autoUpdate && /fail|rollback|回滚|失败/i.test(JSON.stringify(latestHb.autoUpdate))) anomalies.push(`${host}：自动升级失败或回滚`);
  if (typeof latestHb?.diskFreeGiB === "number" && latestHb.diskFreeGiB < 60) anomalies.push(`${host}：盘位只剩 ${latestHb.diskFreeGiB} GiB`);
}
for (const pr of prs) {
  const ageH = (now - Date.parse(pr.created_at)) / 3600000;
  if (ageH > 24) anomalies.push(`PR #${pr.number}「${pr.title}」已开 ${Math.round(ageH)} 小时未处理：${pr.html_url}`);
}

const lines = [];
lines.push(`# 客户机器看板 · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · 仓库 ${REPO}`);
if (!reportBranches.length) lines.push("- 还没有任何 client/* 分支：客户尚未推过报告（Gate 5 或心跳都没跑到）。");
for (const h of hosts) {
  lines.push(`- ${h.host}：tag ${h.tag || "?"} · 最近心跳 ${h.lastHeartbeat || "无"} · 盘位 ${h.diskFreeGiB ?? "?"} GiB · 事件 ${h.recentEvents.length} · 拒绝补丁 ${h.rejected.length} · job ${h.jobsReported.length}${h.acceptance.length ? ` · acceptance ${h.acceptance.join(" ")}` : ""}`);
}
lines.push(prs.length ? `- 开着的客户 PR ${prs.length} 个：${prs.map((p) => `#${p.number} ${p.title}`).join("；")}` : "- 没有开着的客户 PR");
lines.push(anomalies.length ? `\n## 需要处理\n${anomalies.map((a) => `- ${a}`).join("\n")}` : "\n一切正常。");
if (args.json) console.log(JSON.stringify({ hosts, prs: prs.map((p) => ({ number: p.number, title: p.title, url: p.html_url })), anomalies }, null, 2));
else console.log(lines.join("\n"));
process.exit(anomalies.length ? 2 : 0);
