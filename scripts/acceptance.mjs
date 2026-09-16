// ============================================================
// acceptance —— 每条片收尾的验收串跑，结论原样落盘并回流
// 为什么：spec §5 规则 5——Codex 不能自己总结「通过」；每一步都是
// 独立子进程，退出码 + 末 40 行证据写进 qa/acceptance.{json,md}，
// 然后 report:push 到 client/<host> 让我们复核。任一步失败即整体失败。
// 用法：npm run acceptance -- --job jobs/<slug> [--no-push]
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, resolveJob, writeJson } from "./lib.mjs";
import { clientHost } from "./ops-git-lib.mjs";

export const TAIL_LINES = 40;
export const MISSING_SCRIPT_MESSAGE = "命令不存在，请 npm run update";

// 顺序固定；optional 的命令缺失记 SKIP，其余缺失 = FAIL
export const ACCEPTANCE_STEPS = Object.freeze([
  { id: "status", script: "status", extraArgs: ["--strict"], evidence: ["project.json", "data/rough-cut-edl.json", "data/captions.json"] },
  { id: "qa:alignment", script: "qa:alignment", evidence: ["qa/alignment-report.json"] },
  { id: "captions:voice-qa", script: "captions:voice-qa", evidence: ["qa/caption-voice-report.json", "data/caption-voice.json"] },
  { id: "dialogue:qa", script: "dialogue:qa", evidence: ["qa/dialogue-continuity-report.json"] },
  { id: "audio:qa", script: "audio:qa", optional: true, evidence: ["qa/audio-report.json", "variants/*/qa/audio-report.json"] },
  { id: "review:independent", script: "review:independent", needsRevision: true, evidence: ["review/<revision>/independent-review.json"] }
]);

export function latestRevision(jobDir) {
  const reviewDir = path.join(jobDir, "review");
  if (!fs.existsSync(reviewDir)) return null;
  const numbers = fs.readdirSync(reviewDir)
    .map((name) => name.match(/^R(\d+)$/))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  if (!numbers.length) return null;
  return `R${Math.max(...numbers)}`;
}

// package.json 里有名字还不够：脚本文件也得在（另一位同事的命令可能还没发布）。
// 命令经 run-with-beacon.mjs 外壳时，真正的目标是最后一个 scripts/ token，全部都要存在。
export function scriptAvailable(root, scriptName) {
  const pkg = readJson(path.join(root, "package.json"));
  const command = pkg.scripts?.[scriptName];
  if (!command) return { ok: false, command: null };
  const targets = String(command).split(/\s+/).filter((token) => token.startsWith("scripts/"));
  if (targets.some((target) => !fs.existsSync(path.join(root, target)))) return { ok: false, command };
  return { ok: true, command };
}

export function defaultRunStep({ root, script, args }) {
  const result = spawnSync("npm", ["run", script, "--", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  return { exitCode: result.status ?? 1, output: `${result.stdout || ""}${result.stderr || ""}` };
}

export function tail(output, lines = TAIL_LINES) {
  return String(output || "").replace(/\s+$/, "").split("\n").slice(-lines);
}

function expandEvidence(jobDir, patterns, revision) {
  const out = [];
  for (const pattern of patterns) {
    const relative = pattern.replace("<revision>", revision || "R?");
    if (relative.includes("*")) {
      const [head, tailPart] = relative.split("*/");
      const base = path.join(jobDir, head);
      if (fs.existsSync(base)) {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const candidate = path.posix.join(head, entry.name, tailPart);
          out.push({ path: candidate, exists: fs.existsSync(path.join(jobDir, candidate)) });
        }
      }
      continue;
    }
    out.push({ path: relative, exists: fs.existsSync(path.join(jobDir, relative)) });
  }
  return out;
}

export function evaluateAcceptance({ jobDir, root = projectRoot(), runStep = defaultRunStep, host = clientHost(), now = new Date() }) {
  if (!fs.existsSync(path.join(jobDir, "project.json"))) throw new Error(`不是 job 目录（缺 project.json）: ${jobDir}`);
  const revision = latestRevision(jobDir);
  const steps = [];
  for (const step of ACCEPTANCE_STEPS) {
    const available = scriptAvailable(root, step.script);
    const args = ["--job", jobDir, ...(step.extraArgs || [])];
    if (step.needsRevision) args.push("--revision", revision || "");
    const command = `npm run ${step.script} -- ${args.join(" ")}`;
    const record = { id: step.id, script: step.script, command, status: "FAIL", exitCode: null, tail: [], evidence: expandEvidence(jobDir, step.evidence, revision) };
    if (!available.ok) {
      record.status = step.optional ? "SKIP" : "FAIL";
      record.tail = [step.optional ? "命令不存在，按可选项跳过" : MISSING_SCRIPT_MESSAGE];
      steps.push(record);
      continue;
    }
    if (step.needsRevision && !revision) {
      record.tail = ["没有 review/Rn 审片版本，先 npm run review -- init"];
      steps.push(record);
      continue;
    }
    const result = runStep({ root, script: step.script, args, jobDir });
    record.exitCode = result.exitCode;
    record.tail = tail(result.output);
    record.status = result.exitCode === 0 ? "PASS" : "FAIL";
    record.evidence = expandEvidence(jobDir, step.evidence, revision);
    steps.push(record);
  }
  const overall = steps.every((step) => step.status !== "FAIL") ? "PASS" : "FAIL";
  return {
    schemaVersion: 1,
    job: jobDir,
    slug: path.basename(jobDir),
    host,
    revision,
    ranAt: now.toISOString(),
    overall,
    steps
  };
}

export function renderAcceptanceMarkdown(report) {
  const lines = [
    `# 验收报告 · ${report.slug}`,
    "",
    `- 结论：**${report.overall}**`,
    `- 时间：${report.ranAt}`,
    `- 主机：${report.host}`,
    `- 审片版本：${report.revision || "无"}`,
    "",
    "| 步骤 | 结果 | 退出码 | 证据 |",
    "|---|---|---|---|"
  ];
  for (const step of report.steps) {
    const evidence = step.evidence.map((item) => `${item.exists ? "✓" : "✗"} ${item.path}`).join("<br>") || "—";
    lines.push(`| ${step.id} | ${step.status} | ${step.exitCode ?? "—"} | ${evidence} |`);
  }
  for (const step of report.steps) {
    lines.push("", `## ${step.id} · ${step.status}`, "", `\`${step.command}\``, "", "```", ...step.tail, "```");
  }
  lines.push("", "> 本报告由 npm run acceptance 生成；转述时逐步原样引用结论，不得概括成「通过」。", "");
  return lines.join("\n");
}

export function writeAcceptance(jobDir, report) {
  const jsonPath = path.join(jobDir, "qa", "acceptance.json");
  const mdPath = path.join(jobDir, "qa", "acceptance.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(mdPath, renderAcceptanceMarkdown(report));
  return { jsonPath, mdPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const report = evaluateAcceptance({ jobDir });
  const written = writeAcceptance(jobDir, report);
  for (const step of report.steps) console.log(`${step.status === "PASS" ? "✓" : step.status === "SKIP" ? "·" : "✗"} ${step.id} · ${step.status}${step.exitCode == null ? "" : ` (exit ${step.exitCode})`}`);
  console.log(`\n验收结论: ${report.overall} → ${written.mdPath}`);
  if (!args["no-push"]) {
    const { pushJobReport } = await import("./report-push.mjs");
    try {
      const pushed = pushJobReport({ jobDir });
      console.log(`report:push · ${pushed.branch} · ${pushed.pushed ? "已 push" : "未 push"}${pushed.warning ? ` · ${pushed.warning}` : ""}`);
    } catch (error) {
      console.warn(`WARN: report:push 失败：${error.message}`);
    }
  }
  if (report.overall !== "PASS") process.exitCode = 1;
}
