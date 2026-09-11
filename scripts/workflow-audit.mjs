import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { jobsRoot as resolveJobsRoot, parseArgs, projectRoot, writeJson } from "./lib.mjs";
import { evaluateWorkflowStatus } from "./workflow-status.mjs";

export function buildWorkflowAudit(root = projectRoot()) {
  const jobsRoot = root === projectRoot() ? resolveJobsRoot() : path.join(root, "jobs");
  const jobs = fs.readdirSync(jobsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(jobsRoot, entry.name, "project.json")))
    .map((entry) => auditJob(path.join(jobsRoot, entry.name)))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    totals: {
      jobs: jobs.length,
      ready: jobs.filter((item) => item.ready).length,
      inferredProfiles: jobs.filter((item) => item.profile?.inferred).length,
      errors: jobs.filter((item) => item.error).length
    },
    jobs
  };
}

function auditJob(jobDir) {
  const slug = path.basename(jobDir);
  try {
    const status = evaluateWorkflowStatus(jobDir);
    return {
      slug,
      title: status.title,
      profile: status.profile,
      policies: status.policies,
      targets: status.targets.map(({ id, label, platform, layout, policies }) => ({ id, label, platform, layout, policies })),
      ready: status.ready,
      missingRequired: status.checks
        .filter((item) => item.required && !item.ok)
        .map(({ id, name, detail }) => ({ id, name, detail }))
    };
  } catch (error) {
    return { slug, ready: false, error: error.message };
  }
}

export function renderWorkflowAuditMarkdown(report) {
  const lines = [
    "# Talking-head workflow audit",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Jobs: ${report.totals.jobs}`,
    `- Deterministically ready: ${report.totals.ready}`,
    `- Inferred profiles: ${report.totals.inferredProfiles}`,
    `- Contract errors: ${report.totals.errors}`,
    "",
    "> Ready 只表示当前 profile 的确定性证据齐全；不代替用户对内容质量的主观验收。",
    "",
    "| Job | Profile | Targets | State | Missing required evidence |",
    "|---|---|---|---|---|"
  ];
  for (const job of report.jobs) {
    const profile = job.error ? "ERROR" : `${job.profile.id}${job.profile.inferred ? " (inferred)" : ""}`;
    const targets = job.error
      ? "_unknown_"
      : job.targets.map((item) => `${item.platform}/${item.id}${item.policies.length ? `[${item.policies.join("+")}]` : ""}`).join("<br>") || "_none_";
    const missing = job.error
      ? job.error
      : job.missingRequired.map((item) => item.id).join(", ") || "—";
    lines.push(`| ${job.slug} | ${profile} | ${targets} | ${job.ready ? "ready" : "incomplete"} | ${missing} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = projectRoot();
  const report = buildWorkflowAudit(root);
  const outputDir = path.resolve(root, String(args.output || "reports/workflow"));
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonFile = path.join(outputDir, "workflow-audit.json");
  const markdownFile = path.join(outputDir, "workflow-audit.md");
  writeJson(jsonFile, report);
  fs.writeFileSync(markdownFile, renderWorkflowAuditMarkdown(report));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Jobs: ${report.totals.jobs}`);
    console.log(`Ready: ${report.totals.ready}`);
    console.log(`Inferred profiles: ${report.totals.inferredProfiles}`);
    console.log(`Contract errors: ${report.totals.errors}`);
    console.log(`Report: ${markdownFile}`);
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
