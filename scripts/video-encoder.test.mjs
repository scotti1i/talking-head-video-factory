import assert from "node:assert/strict";
import test from "node:test";

import { resolveVideoEncoder, videoEncoderArgs } from "./video-encoder.mjs";

test("Windows/WSL 自动使用 NVENC，其他环境保留 CPU 回退", () => {
  const encoders = "V....D h264_nvenc NVIDIA NVENC H.264 encoder";
  assert.equal(resolveVideoEncoder({ requested: "auto", platform: "linux", encoderOutput: encoders }), "nvenc");
  assert.equal(resolveVideoEncoder({ requested: "auto", platform: "darwin", encoderOutput: encoders }), "cpu");
  assert.equal(resolveVideoEncoder({ requested: "cpu", platform: "linux", encoderOutput: encoders }), "cpu");
  assert.throws(() => resolveVideoEncoder({ requested: "nvenc", platform: "linux", encoderOutput: "libx264" }), /不包含 h264_nvenc/);
});

test("CPU 与 NVENC 参数保持同一 GOP 和码率合同", () => {
  const cpu = videoEncoderArgs({ mode: "cpu", preset: "veryfast", crf: "20", fps: 30 });
  const gpu = videoEncoderArgs({ mode: "nvenc", crf: "20", fps: 30, videoBitrate: "18M" });
  assert.deepEqual(cpu.slice(0, 4), ["-c:v", "libx264", "-preset", "veryfast"]);
  assert.equal(cpu[cpu.indexOf("-g") + 1], "30");
  assert.deepEqual(gpu.slice(0, 4), ["-c:v", "h264_nvenc", "-preset", "p5"]);
  assert.equal(gpu[gpu.indexOf("-b:v") + 1], "18M");
  assert.equal(gpu[gpu.indexOf("-bufsize") + 1], "36M");
});
