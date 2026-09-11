import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAnalysisArgs,
  buildNormalizeArgs,
  parseLoudnormAnalysis,
  resolveNormalizePaths,
  resolvePathInsideJob
} from "./normalize-audio.mjs";

test("路径只允许位于 job 内且输入输出不能相同", (context) => {
  const jobDir = makeJob(context);
  const input = path.join(jobDir, "renders", "raw.mp4");
  fs.writeFileSync(input, "fixture");

  assert.deepEqual(resolveNormalizePaths({
    jobDir,
    input: "renders/raw.mp4",
    output: "renders/normalized.mp4"
  }), {
    inputPath: input,
    outputPath: path.join(jobDir, "renders", "normalized.mp4")
  });
  assert.throws(
    () => resolveNormalizePaths({ jobDir, input: "renders/raw.mp4", output: "renders/raw.mp4" }),
    /不同路径/
  );
  assert.throws(
    () => resolvePathInsideJob(jobDir, "../outside.mp4"),
    /必须位于 job 目录内/
  );
  assert.equal(
    resolvePathInsideJob(jobDir, "new/output/normalized.mp4"),
    path.join(jobDir, "new", "output", "normalized.mp4")
  );
});

test("首遍 loudnorm JSON 从 FFmpeg 日志中可靠解析", () => {
  const log = `frame= 900 fps=0.0\n[Parsed_loudnorm_0] \n{
    "input_i" : "-10.23",
    "input_tp" : "2.71",
    "input_lra" : "1.10",
    "input_thresh" : "-20.31",
    "output_i" : "-13.01",
    "target_offset" : "0.01"
  }\n`;
  assert.deepEqual(parseLoudnormAnalysis(log), {
    inputI: -10.23,
    inputTp: 2.71,
    inputLra: 1.1,
    inputThresh: -20.31,
    targetOffset: 0.01
  });
  assert.throws(() => parseLoudnormAnalysis("no json"), /无法解析 FFmpeg loudnorm 首遍 JSON/);
  assert.throws(
    () => parseLoudnormAnalysis('{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70","target_offset":"inf"}'),
    /可能无有效音轨或为静音/
  );
});

test("两遍 FFmpeg 参数固定目标、复制视频并输出 AAC 192k / 48kHz", () => {
  const analysis = buildAnalysisArgs("in.mp4");
  assert.ok(analysis.includes("loudnorm=I=-13:LRA=7:TP=-1.6:print_format=json"));

  const normalized = buildNormalizeArgs("in.mp4", "out.mp4", {
    inputI: -10.2,
    inputTp: 2.7,
    inputLra: 1.1,
    inputThresh: -20.3,
    targetOffset: 0.1
  });
  const filter = normalized[normalized.indexOf("-af") + 1];
  assert.match(filter, /measured_I=-10\.2/);
  assert.match(filter, /linear=true/);
  assert.deepEqual(normalized.slice(normalized.indexOf("-c:v"), normalized.indexOf("-af")), [
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"
  ]);
  assert.deepEqual(normalized.slice(-3), ["-movflags", "+faststart", "out.mp4"]);
});

function makeJob(context) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-normalize-audio-"));
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  return jobDir;
}
