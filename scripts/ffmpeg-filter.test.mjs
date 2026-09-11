import assert from "node:assert/strict";
import test from "node:test";
import { assertNotDerivedInput, ffmpegMajorVersion, filterComplexFileArgs, frameCapFilter } from "./ffmpeg-filter.mjs";

test("视频段封顶帧数 = floor(时长×fps)，避免比音频长", () => {
  assert.equal(frameCapFilter(1.2, 30), ",trim=end_frame=36");
  assert.equal(frameCapFilter(1.2033, 60), ",trim=end_frame=72");
  assert.equal(frameCapFilter(0.01, 30), "");
});

test("滤镜图文件参数随 FFmpeg 大版本切换（≥7 用 -/filter_complex）", () => {
  const major = ffmpegMajorVersion();
  const args = filterComplexFileArgs("/tmp/x.ffmpeg");
  assert.equal(args[1], "/tmp/x.ffmpeg");
  assert.equal(args[0], major >= 7 ? "-/filter_complex" : "-filter_complex_script");
});

test("审片成片与渲染产物不得作输入", () => {
  const jobDir = "/jobs/demo";
  assert.throws(() => assertNotDerivedInput("/jobs/demo/review/R1/video.mp4", jobDir, "roughcut:render"), /不得以 review\/R1\/video.mp4 作输入/);
  assert.throws(() => assertNotDerivedInput("/jobs/demo/renders/final.mp4", jobDir, "x"), /renders/);
  assert.doesNotThrow(() => assertNotDerivedInput("/jobs/demo/assets/originals/a.mov", jobDir, "x"));
  assert.doesNotThrow(() => assertNotDerivedInput("/jobs/demo/renders/x.mp4", jobDir, "x", { allow: ["renders"] }));
  assert.doesNotThrow(() => assertNotDerivedInput("/elsewhere/a.mov", jobDir, "x"));
});
