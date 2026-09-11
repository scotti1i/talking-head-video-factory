import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { jobsRoot as resolveJobsRoot, parseArgs, projectRoot, readJson, writeJson } from "./lib.mjs";

const MEDIA_RE = /\.(mp4|mov|m4v|mkv|webm|avi|wav|mp3|m4a|aac|flac|zip)$/i;
const QA_KEEP_RE = /(^|\/)(?:[^/]+-)?(?:approval|report|verification)\.(json|md)$/i;
const REVIEW_RENDER_RE = /(review|preview|draft|rough|temp|tmp|pre[-_](remux|normalize|audio)|feedback[-_]?v?\d+|[-_]v\d+)([-_.]|$)/i;

export function buildStorageReport(root = projectRoot(), options = {}) {
  // 传入非仓库根（测试夹具）时沿用 <root>/jobs；真实运行读 FACTORY_JOBS_ROOT
  const jobsRoot = options.jobsRoot || (root === projectRoot() ? resolveJobsRoot() : path.join(root, "jobs"));
  const globalInodes = new Set();
  const jobs = fs.existsSync(jobsRoot)
    ? fs.readdirSync(jobsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(jobsRoot, entry.name, "project.json")))
        .map((entry) => scanJob(path.join(jobsRoot, entry.name), globalInodes, options))
        .sort((a, b) => b.logicalBytes - a.logicalBytes)
    : [];
  const totals = sumJobs(jobs);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    jobCount: jobs.length,
    totals,
    jobs
  };
}

export function scanJob(jobDir, globalInodes = new Set(), { includeCandidates = true } = {}) {
  const project = readJson(path.join(jobDir, "project.json"));
  const categories = new Map();
  const safeCandidates = [];
  const reviewCandidates = [];
  let logicalBytes = 0;
  let uniqueBytes = 0;
  let fileCount = 0;

  for (const file of walkFiles(jobDir)) {
    const relative = normalize(path.relative(jobDir, file));
    const stat = fs.statSync(file);
    const inode = `${stat.dev}:${stat.ino}`;
    const globallyUnique = !globalInodes.has(inode);
    globalInodes.add(inode);
    const category = classifyJobPath(relative);
    const current = categories.get(category) || { id: category, files: 0, logicalBytes: 0, uniqueBytes: 0 };
    current.files += 1;
    current.logicalBytes += stat.size;
    if (globallyUnique) current.uniqueBytes += stat.size;
    categories.set(category, current);
    logicalBytes += stat.size;
    if (globallyUnique) uniqueBytes += stat.size;
    fileCount += 1;

    if (!includeCandidates) continue;
    const candidate = cleanupCandidate(relative, category, stat);
    if (!candidate) continue;
    const value = {
      path: file,
      relative,
      bytes: stat.size,
      reclaimableBytes: stat.nlink === 1 ? stat.size : 0,
      links: stat.nlink,
      category,
      reason: candidate.reason,
      class: candidate.class
    };
    if (candidate.class === "safe-rebuildable") safeCandidates.push(value);
    else reviewCandidates.push(value);
  }

  return {
    slug: path.basename(jobDir),
    path: jobDir,
    profile: project.profile || null,
    policies: Array.isArray(project.policies) ? project.policies : [],
    targets: projectTargets(project),
    fileCount,
    logicalBytes,
    uniqueBytes,
    categories: [...categories.values()].sort((a, b) => b.logicalBytes - a.logicalBytes),
    safeReclaimableBytes: sumReclaimable(safeCandidates),
    reviewReclaimableBytes: sumReclaimable(reviewCandidates),
    safeCandidates: safeCandidates.sort((a, b) => b.bytes - a.bytes),
    reviewCandidates: reviewCandidates.sort((a, b) => b.bytes - a.bytes)
  };
}

export function classifyJobPath(relativePath) {
  const rel = normalize(relativePath);
  if (rel.startsWith("assets/originals/")) return "originals";
  if (rel.startsWith("assets/source-archives/") || rel.startsWith("assets/source-packages/")) return "source-archives";
  if (rel.startsWith("delivery/")) return "delivery";
  if (rel.startsWith("cover/")) return "cover";
  if (/(^|\/)renders\/work-[^/]+\//.test(rel) || /\.(rgb48le|rgba|yuv|raw)$/i.test(rel)) return "cache";
  if (/(^|\/)renders\//.test(rel) || rel.startsWith("shorts/")) return "renders";
  if (rel.startsWith("qa/") || /\/qa\//.test(rel) || rel.startsWith("snapshots/")) return "qa";
  if (rel.startsWith("tmp/") || rel.startsWith(".thumbnails/") || rel.startsWith(".waveform-cache/") || /\/node_modules\//.test(rel)) return "cache";
  if (rel.startsWith("assets/derived/") || rel.startsWith("assets/intermediates/") || /^assets\/aroll[^/]*\.(mp4|mov)$/i.test(rel)) return "working-media";
  if (rel.startsWith("assets/")) return MEDIA_RE.test(rel) ? "supporting-media" : "supporting-assets";
  if (rel.startsWith("data/") || /(^|\/)(project|package)\.json$/.test(rel) || /(^|\/)project\.md$/.test(rel)) return "metadata";
  if (/\.log$/i.test(rel) || rel.startsWith("vendor/")) return "generated";
  return "other";
}

export function cleanupCandidate(relativePath, category, stat = { size: 0, nlink: 1 }) {
  const rel = normalize(relativePath);
  if (category === "cache") return { class: "safe-rebuildable", reason: "缩略图、波形、临时目录或依赖缓存，可由现有数据重建" };
  if (category === "generated" && /\.log$/i.test(rel)) return { class: "safe-rebuildable", reason: "执行日志，不参与内容或最终交付" };
  if (category === "working-media") return { class: "review-required", reason: "A-roll/转码中间件可重建，但重建成本高，须确认原片与 EDL 完整" };
  if (category === "renders") {
    return {
      class: "review-required",
      reason: REVIEW_RENDER_RE.test(path.basename(rel))
        ? "文件名显示为审片、旧版本或预处理成片；确认已有保留终版后可清"
        : "成片或切片，必须人工确认是否为当前终版、已交付或唯一版本"
    };
  }
  if (category === "qa" && !QA_KEEP_RE.test(rel)) {
    return { class: "review-required", reason: "QA 帧/音频/联系表可重建，但可能是人工批准证据，须保留报告与 approval" };
  }
  return null;
}

export function renderStorageMarkdown(report) {
  const lines = [
    "# Talking-head factory storage report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Jobs: ${report.jobCount}`,
    `- Logical size: ${formatBytes(report.totals.logicalBytes)}`,
    `- Unique in-tree size: ${formatBytes(report.totals.uniqueBytes)}`,
    `- Safe rebuildable candidates: ${formatBytes(report.totals.safeReclaimableBytes)}`,
    `- Review-required candidates: ${formatBytes(report.totals.reviewReclaimableBytes)}`,
    "",
    "> 该报告只提供候选清单，不删除文件。原片、交付件、封面、项目数据和批准报告不会进入 safe-rebuildable。硬链接文件按 nlink 标记，删除单个链接未必释放空间。",
    "",
    "## Jobs",
    "",
    "| Job | Profile | Targets | Total | Originals | Working | Renders | QA | Safe | Review |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|"
  ];
  for (const job of report.jobs) {
    const byId = Object.fromEntries(job.categories.map((item) => [item.id, item.logicalBytes]));
    const targets = job.targets.map((item) => `${item.platform || "non-platform"}/${item.id}`).join("<br>") || "_none_";
    lines.push(`| ${job.slug} | ${job.profile || "⚠ inferred default"} | ${targets} | ${formatBytes(job.logicalBytes)} | ${formatBytes(byId.originals || 0)} | ${formatBytes(byId["working-media"] || 0)} | ${formatBytes(byId.renders || 0)} | ${formatBytes(byId.qa || 0)} | ${formatBytes(job.safeReclaimableBytes)} | ${formatBytes(job.reviewReclaimableBytes)} |`);
  }
  lines.push("", "## Largest review-required candidates", "");
  const largest = report.jobs.flatMap((job) => job.reviewCandidates.map((item) => ({ ...item, job: job.slug })))
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)
    .slice(0, 80);
  for (const item of largest) {
    lines.push(`- ${formatBytes(item.reclaimableBytes)} · \`${item.job}/${item.relative}\` · ${item.reason}`);
  }
  lines.push("", "## Safe rebuildable candidates", "");
  const safe = report.jobs.flatMap((job) => job.safeCandidates.map((item) => ({ ...item, job: job.slug })))
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  if (!safe.length) lines.push("- none");
  else {
    const groups = groupCleanupCandidates(safe);
    for (const item of groups.slice(0, 120)) {
      lines.push(`- ${formatBytes(item.reclaimableBytes)} · ${item.files} files · \`${item.job}/${item.root}\` · ${item.reason}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function compactStorageReport(report) {
  return {
    ...report,
    jobs: report.jobs.map((job) => {
      const { safeCandidates, reviewCandidates, ...summary } = job;
      return {
        ...summary,
        safeGroups: groupCleanupCandidates(safeCandidates.map((item) => ({ ...item, job: job.slug }))),
        largestReviewCandidates: reviewCandidates.slice(0, 20)
      };
    })
  };
}

export function groupCleanupCandidates(candidates) {
  const groups = new Map();
  for (const item of candidates) {
    const root = cleanupGroupRoot(item.relative);
    const key = `${item.job || ""}\0${root}\0${item.reason}`;
    const current = groups.get(key) || {
      job: item.job || "",
      root,
      files: 0,
      logicalBytes: 0,
      reclaimableBytes: 0,
      reason: item.reason
    };
    current.files += 1;
    current.logicalBytes += item.bytes;
    current.reclaimableBytes += item.reclaimableBytes;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let current = value;
  let unit = -1;
  do {
    current /= 1024;
    unit += 1;
  } while (current >= 1024 && unit < units.length - 1);
  return `${current >= 100 ? current.toFixed(0) : current >= 10 ? current.toFixed(1) : current.toFixed(2)} ${units[unit]}`;
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  return files;
}

function sumJobs(jobs) {
  return jobs.reduce((sum, job) => ({
    logicalBytes: sum.logicalBytes + job.logicalBytes,
    uniqueBytes: sum.uniqueBytes + job.uniqueBytes,
    safeReclaimableBytes: sum.safeReclaimableBytes + job.safeReclaimableBytes,
    reviewReclaimableBytes: sum.reviewReclaimableBytes + job.reviewReclaimableBytes,
    fileCount: sum.fileCount + job.fileCount
  }), { logicalBytes: 0, uniqueBytes: 0, safeReclaimableBytes: 0, reviewReclaimableBytes: 0, fileCount: 0 });
}

function sumReclaimable(items) {
  return items.reduce((sum, item) => sum + item.reclaimableBytes, 0);
}

function projectTargets(project) {
  const variants = Array.isArray(project.variants) ? project.variants : [];
  if (variants.length) {
    return variants.map((item) => ({
      id: item.id || item.label || "unnamed",
      platform: item.platform || null,
      policies: [...new Set([...(project.policies || []), ...(item.policies || [])])]
    }));
  }
  if (project.platform) {
    return [{ id: "root", platform: project.platform, policies: project.policies || [] }];
  }
  return [];
}

function cleanupGroupRoot(relative) {
  const rel = normalize(relative);
  const work = rel.match(/^(.*?renders\/work-[^/]+)(?:\/|$)/);
  if (work) return work[1];
  const known = rel.match(/^(.*?(?:\.thumbnails|\.waveform-cache|tmp|node_modules))(?:\/|$)/);
  if (known) return known[1];
  if (/\.(rgb48le|rgba|yuv|raw)$/i.test(rel)) return path.posix.dirname(rel);
  return rel;
}

function normalize(value) {
  return String(value).split(path.sep).join("/");
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = projectRoot();
  const report = buildStorageReport(root, { includeCandidates: true });
  const outputDir = path.resolve(root, String(args.output || "reports/storage"));
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonFile = path.join(outputDir, args.plan ? "storage-plan.json" : "storage-report.json");
  const markdownFile = path.join(outputDir, args.plan ? "storage-plan.md" : "storage-report.md");
  writeJson(jsonFile, args.plan ? report : compactStorageReport(report));
  fs.writeFileSync(markdownFile, renderStorageMarkdown(report));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Jobs: ${report.jobCount}`);
    console.log(`Logical: ${formatBytes(report.totals.logicalBytes)}`);
    console.log(`Unique in tree: ${formatBytes(report.totals.uniqueBytes)}`);
    console.log(`Safe rebuildable: ${formatBytes(report.totals.safeReclaimableBytes)}`);
    console.log(`Review required: ${formatBytes(report.totals.reviewReclaimableBytes)}`);
    console.log(`Report: ${markdownFile}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
