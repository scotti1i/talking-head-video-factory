import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  evaluateAudioMetrics,
  parseEbur128Summary,
  renderAudioReportMarkdown,
  resolveAudioGates,
  runAudioQa
} from "./qa-audio.mjs";

const EBUR_LOG = `
[Parsed_ebur128_0 @ 0x123] Summary:

  Integrated loudness:
    I:         -13.1 LUFS
    Threshold: -23.1 LUFS

  Loudness range:
    LRA:         1.2 LU

  True peak:
    Peak:       -1.3 dBFS
`;

test("解析最后一个 ebur128 Summary 的综合响度和 True Peak", () => {
  const earlier = EBUR_LOG.replace("-13.1", "-18.0").replace("-1.3", "-5.0");
  assert.deepEqual(parseEbur128Summary(`${earlier}\n${EBUR_LOG}`), {
    integratedLufs: -13.1,
    truePeakDbfs: -1.3
  });
  assert.throws(() => parseEbur128Summary("no summary"), /缺少 Summary/);
  assert.throws(
    () => parseEbur128Summary("Summary:\nIntegrated loudness:\n I: -inf LUFS\nTrue peak:\n Peak: -inf dBFS"),
    /可能无有效音轨或为静音/
  );
});

test("默认门禁包含边界，并分别报告过静、过响和削波", () => {
  assert.deepEqual(evaluateAudioMetrics({ integratedLufs: -14, truePeakDbfs: -1 }), {
    passed: true,
    failures: []
  });
  const quiet = evaluateAudioMetrics({ integratedLufs: -14.1, truePeakDbfs: -1.2 });
  assert.equal(quiet.passed, false);
  assert.match(quiet.failures[0], /< -14\.00/);
  const hot = evaluateAudioMetrics({ integratedLufs: -11.9, truePeakDbfs: -0.9 });
  assert.equal(hot.passed, false);
  assert.equal(hot.failures.length, 2);
});

test("CLI 门禁参数可覆盖且拒绝反向范围", () => {
  assert.deepEqual(resolveAudioGates({
    "min-lufs": "-15",
    "max-lufs": "-11",
    "max-true-peak": "-0.8"
  }), {
    minLufs: -15,
    maxLufs: -11,
    maxTruePeakDbfs: -0.8
  });
  assert.throws(() => resolveAudioGates({ "min-lufs": -10, "max-lufs": -12 }), /不能大于/);
});

test("QA 落 JSON/Markdown，失败判断保留在报告", (context) => {
  const jobDir = makeJob(context);
  const video = path.join(jobDir, "renders", "final.mp4");
  fs.writeFileSync(video, "fixture");
  const spawn = () => ({ status: 0, stdout: "", stderr: EBUR_LOG.replace("-1.3", "-0.5") });
  const report = runAudioQa({
    jobDir,
    video: "renders/final.mp4",
    spawn,
    now: new Date("2026-08-06T00:00:00.000Z")
  });

  assert.equal(report.status, "failed");
  assert.match(report.failures[0], /true peak/);
  const json = JSON.parse(fs.readFileSync(path.join(jobDir, "qa", "audio-report.json"), "utf8"));
  assert.deepEqual(json, report);
  const markdown = fs.readFileSync(path.join(jobDir, "qa", "audio-report.md"), "utf8");
  assert.match(markdown, /Status: \*\*failed\*\*/);
  assert.match(renderAudioReportMarkdown(report), /-0\.50 dBFS/);
});

function makeJob(context) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-qa-audio-"));
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  return jobDir;
}
