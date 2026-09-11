import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateAcceptance, latestRevision, renderAcceptanceMarkdown, scriptAvailable, tail, writeAcceptance } from "./acceptance.mjs";

function fixture({ scripts, files = [] }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "acceptance-"));
  const root = path.join(base, "repo");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "");
  }
  const job = path.join(base, "jobs", "demo");
  fs.mkdirSync(path.join(job, "review", "R0"), { recursive: true });
  fs.mkdirSync(path.join(job, "review", "R2"), { recursive: true });
  fs.mkdirSync(path.join(job, "review", "notes"), { recursive: true });
  fs.writeFileSync(path.join(job, "project.json"), "{}");
  return { root, job };
}

const FULL_SCRIPTS = {
  status: "node scripts/factory-status.mjs",
  "qa:alignment": "python3 scripts/qa-alignment.py",
  "captions:voice-qa": "node scripts/captions-voice-qa.mjs",
  "dialogue:qa": "node scripts/dialogue-qa.mjs",
  "audio:qa": "node scripts/qa-audio.mjs",
  "review:independent": "node scripts/review-independent.mjs"
};
const FULL_FILES = ["scripts/factory-status.mjs", "scripts/qa-alignment.py", "scripts/captions-voice-qa.mjs", "scripts/dialogue-qa.mjs", "scripts/qa-audio.mjs", "scripts/review-independent.mjs"];

test("最新审片版本取最大 Rn，忽略非 Rn 目录", () => {
  const { job } = fixture({ scripts: {} });
  assert.equal(latestRevision(job), "R2");
  assert.equal(latestRevision(path.join(job, "nope")), null);
});

test("package.json 有名字但脚本文件缺失也算命令不存在", () => {
  const { root } = fixture({ scripts: { "qa:alignment": "python3 scripts/qa-alignment.py", status: "node scripts/factory-status.mjs" }, files: ["scripts/factory-status.mjs"] });
  assert.equal(scriptAvailable(root, "status").ok, true);
  assert.equal(scriptAvailable(root, "qa:alignment").ok, false);
  assert.equal(scriptAvailable(root, "nothing").ok, false);
});

test("每步独立子进程：退出码与末 40 行落盘，任一失败整体 FAIL，缺命令提示 update", () => {
  const { root, job } = fixture({
    scripts: { ...FULL_SCRIPTS, "audio:qa": undefined, "dialogue:qa": undefined },
    files: FULL_FILES.filter((file) => !file.includes("qa-audio"))
  });
  const calls = [];
  const runStep = ({ script, args }) => {
    calls.push({ script, args });
    if (script === "qa:alignment") {
      fs.mkdirSync(path.join(job, "qa"), { recursive: true });
      fs.writeFileSync(path.join(job, "qa", "alignment-report.json"), "{}");
      return { exitCode: 1, output: Array.from({ length: 50 }, (_, index) => `line ${index + 1}`).join("\n") };
    }
    return { exitCode: 0, output: `${script} ok\n` };
  };
  const report = evaluateAcceptance({ jobDir: job, root, runStep, host: "factory-01", now: new Date("2026-09-11T00:00:00.000Z") });
  assert.equal(report.overall, "FAIL");
  assert.equal(report.revision, "R2");
  const byId = Object.fromEntries(report.steps.map((step) => [step.id, step]));
  assert.equal(byId.status.status, "PASS");
  assert.deepEqual(calls[0].args, ["--job", job, "--strict"]);
  assert.equal(byId["qa:alignment"].status, "FAIL");
  assert.equal(byId["qa:alignment"].exitCode, 1);
  assert.equal(byId["qa:alignment"].tail.length, 40);
  assert.equal(byId["qa:alignment"].tail[0], "line 11");
  assert.deepEqual(byId["qa:alignment"].evidence, [{ path: "qa/alignment-report.json", exists: true }]);
  assert.equal(byId["dialogue:qa"].status, "FAIL");
  assert.deepEqual(byId["dialogue:qa"].tail, ["命令不存在，请 npm run update"]);
  assert.equal(byId["audio:qa"].status, "SKIP");
  assert.equal(byId["review:independent"].status, "PASS");
  assert.deepEqual(calls.at(-1).args, ["--job", job, "--revision", "R2"]);
  assert.equal(byId["review:independent"].evidence[0].path, "review/R2/independent-review.json");
  assert.equal(calls.some((call) => call.script === "dialogue:qa" || call.script === "audio:qa"), false);

  const written = writeAcceptance(job, report);
  const saved = JSON.parse(fs.readFileSync(written.jsonPath, "utf8"));
  assert.equal(saved.overall, "FAIL");
  const markdown = fs.readFileSync(written.mdPath, "utf8");
  assert.match(markdown, /结论：\*\*FAIL\*\*/);
  assert.match(markdown, /\| dialogue:qa \| FAIL \| — \|/);
  assert.match(markdown, /不得概括成「通过」/);
});

test("全部通过时 PASS；没有审片版本时 review:independent 不跑直接 FAIL", () => {
  const { root, job } = fixture({ scripts: FULL_SCRIPTS, files: FULL_FILES });
  const ok = evaluateAcceptance({ jobDir: job, root, runStep: () => ({ exitCode: 0, output: "ok" }) });
  assert.equal(ok.overall, "PASS");
  assert.deepEqual(ok.steps.map((step) => step.status), ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS"]);

  fs.rmSync(path.join(job, "review"), { recursive: true, force: true });
  const noReview = evaluateAcceptance({ jobDir: job, root, runStep: () => ({ exitCode: 0, output: "ok" }) });
  assert.equal(noReview.overall, "FAIL");
  assert.match(noReview.steps.at(-1).tail[0], /没有 review\/Rn/);
  assert.equal(tail("a\nb\nc\n", 2).join(","), "b,c");
  assert.match(renderAcceptanceMarkdown(noReview), /审片版本：无/);
});
