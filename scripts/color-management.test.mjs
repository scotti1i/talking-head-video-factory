import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertRec709Conversion,
  classifyVideoColor,
  isHdrVideoStream,
  isDeliveryRec709VideoStream,
  isRec709VideoStream,
  normalizeColorMode,
  prepareSdrRec709Source,
  resolveToneMapBackend,
  sdrCachePath
} from "./color-management.mjs";

test("识别 HLG/PQ HDR，Rec.709 不误判", () => {
  assert.equal(isHdrVideoStream(video({ color_transfer: "arib-std-b67" })), true);
  assert.equal(isHdrVideoStream(video({ color_transfer: "smpte2084" })), true);
  assert.equal(isHdrVideoStream(video({ color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" })), false);
  assert.equal(isRec709VideoStream(video({ color_transfer: "bt709", color_primaries: "bt709", color_space: "bt709" })), true);
  assert.equal(isDeliveryRec709VideoStream(video({ color_transfer: "bt709", color_primaries: "bt709", color_space: "bt709", color_range: "tv", pix_fmt: "yuv420p" })), true);
  assert.equal(classifyVideoColor(video({ color_transfer: "bt709", color_primaries: "bt709", color_space: "bt709", color_range: "tv" })), "rec709");
  const doviTagged709 = video({
    color_transfer: "bt709",
    color_primaries: "bt709",
    color_space: "bt709",
    color_range: "tv",
    pix_fmt: "yuv420p",
    side_data_list: [{ side_data_type: "DOVI configuration record" }]
  });
  assert.equal(classifyVideoColor(doviTagged709), "hdr");
  assert.equal(isDeliveryRec709VideoStream(doviTagged709), false);
  assert.equal(classifyVideoColor(video({ color_transfer: null, color_primaries: null, color_space: null })), "unknown");
});

test("color mode 和内容哈希缓存路径保持确定性", () => {
  assert.equal(normalizeColorMode(), "auto-sdr");
  assert.equal(normalizeColorMode("legacy"), "legacy");
  assert.throws(() => normalizeColorMode("hdr-ish"), /只能是 auto-sdr\/legacy/);
  assert.equal(
    sdrCachePath({ jobDir: "/job", sourcePath: "/job/assets/originals/手机 HDR.MOV", sourceHash: "abcdef1234567890" }),
    "/job/assets/derived/sdr-rec709/-HDR-abcdef123456-rec709-v2.mov"
  );
  assert.equal(resolveToneMapBackend({ backend: "ffmpeg", platform: "linux" }), "ffmpeg");
  assert.throws(() => resolveToneMapBackend({ backend: "cuda" }), /只能是 auto\/avfoundation\/ffmpeg/);
});

test("Apple tone-map 结果必须保留画幅、时长、音轨并标记 BT.709", () => {
  const sourceProbe = probe(video({ width: 1920, height: 1080, rotation: -90, duration: "7.298333" }), true, "7.298333");
  const outputProbe = probe(video({ width: 1080, height: 1920, rotation: 0, duration: "7.300000", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" }), true, "7.300000");
  assert.doesNotThrow(() => assertRec709Conversion({ sourceProbe, outputProbe, sourcePath: "raw.mov", outputPath: "sdr.mov" }));
  const bad = probe(video({ width: 1080, height: 1920, rotation: 0, duration: "7.300000" }), true, "7.300000");
  assert.throws(() => assertRec709Conversion({ sourceProbe, outputProbe: bad, sourcePath: "raw.mov", outputPath: "bad.mov" }), /不是 yuv420p\/tv\/BT\.709 SDR/);
  const upsideDown = probe(video({ width: 1080, height: 1920, rotation: 180, duration: "7.300000", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" }), true, "7.300000");
  assert.throws(() => assertRec709Conversion({ sourceProbe, outputProbe: upsideDown, sourcePath: "raw.mov", outputPath: "upside-down.mov" }), /未烘焙旋转/);
  const shifted = probe(video({ width: 1080, height: 1920, rotation: 0, duration: "7.300000", start_time: "0.500000", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" }), true, "7.300000", "0.500000");
  assert.throws(() => assertRec709Conversion({ sourceProbe, outputProbe: shifted, sourcePath: "raw.mov", outputPath: "shifted.mov" }), /改变视频起点/);
});

test("HDR 源首次转换、再次命中缓存；SDR 源直接复用", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-color-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const sourcePath = path.join(jobDir, "assets", "originals", "take.mov");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "hdr-source");
  const sourceProbe = probe(video({ width: 1920, height: 1080, rotation: -90, duration: "7.298333" }), true, "7.298333");
  const outputProbe = probe(video({ width: 1080, height: 1920, rotation: 0, duration: "7.300000", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" }), true, "7.300000");
  let conversions = 0;
  const fakeProbe = (file) => file === sourcePath ? sourceProbe : outputProbe;
  const fakeRun = (command, args) => {
    if (command === avconvertPath) {
      conversions += 1;
      fs.writeFileSync(args[args.indexOf("--output") + 1], "avconvert-output");
      return;
    }
    fs.writeFileSync(args.at(-1), "sdr-output");
  };
  const avconvertPath = path.join(jobDir, "avconvert");
  fs.writeFileSync(avconvertPath, "tool");

  const first = prepareSdrRec709Source({ jobDir, sourcePath, probe: fakeProbe, runCommand: fakeRun, platform: "darwin", avconvertPath });
  const second = prepareSdrRec709Source({ jobDir, sourcePath, probe: fakeProbe, runCommand: fakeRun, platform: "darwin", avconvertPath });
  assert.equal(first.converted, true);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(conversions, 1);

  fs.writeFileSync(second.outputPath, "tampered-cache");
  const rebuilt = prepareSdrRec709Source({ jobDir, sourcePath, probe: fakeProbe, runCommand: fakeRun, platform: "darwin", avconvertPath });
  assert.equal(rebuilt.cached, false);
  assert.equal(conversions, 2);

  const sdrProbe = probe(video({ color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", color_range: "tv", pix_fmt: "yuv420p" }), true);
  const untouched = prepareSdrRec709Source({ jobDir, sourcePath, probe: () => sdrProbe, runCommand: fakeRun, platform: "darwin", avconvertPath });
  assert.equal(untouched.outputPath, sourcePath);
  assert.equal(untouched.converted, false);
  assert.equal(conversions, 2);
});

test("Linux/WSL HDR 使用 FFmpeg zscale tone-map 并复用内容哈希缓存", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-color-ffmpeg-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const sourcePath = path.join(jobDir, "assets", "originals", "take.mov");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "hdr-source");
  const sourceProbe = probe(video({ width: 1920, height: 1080, rotation: -90, duration: "7.298333" }), true, "7.298333");
  const outputProbe = probe(video({ width: 1080, height: 1920, rotation: 0, duration: "7.300000", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", pix_fmt: "yuv420p" }), true, "7.300000");
  const commands = [];
  const fakeRun = (command, args) => {
    commands.push([command, args]);
    fs.writeFileSync(args.at(-1), "sdr-output");
  };
  const fakeProbe = (file) => file === sourcePath ? sourceProbe : outputProbe;
  const first = prepareSdrRec709Source({
    jobDir,
    sourcePath,
    probe: fakeProbe,
    runCommand: fakeRun,
    platform: "linux",
    backend: "auto",
    ffmpegPath: "ffmpeg"
  });
  const second = prepareSdrRec709Source({
    jobDir,
    sourcePath,
    probe: fakeProbe,
    runCommand: fakeRun,
    platform: "linux",
    backend: "auto",
    ffmpegPath: "ffmpeg"
  });
  assert.equal(first.backend, "ffmpeg");
  assert.equal(second.cached, true);
  assert.equal(commands.length, 1);
  assert.match(commands[0][1][commands[0][1].indexOf("-vf") + 1], /zscale=.*tonemap=mobius/);
});

test("auto-sdr 对缺失色彩标记 fail closed", (context) => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-color-unknown-"));
  context.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const sourcePath = path.join(jobDir, "take.mp4");
  fs.writeFileSync(sourcePath, "untagged-source");
  const unknownProbe = probe(video({ color_space: null, color_transfer: null, color_primaries: null, color_range: null, pix_fmt: "yuv420p" }), true);
  assert.throws(
    () => prepareSdrRec709Source({ jobDir, sourcePath, probe: () => unknownProbe }),
    /缺少完整色彩标记/
  );
});

function video(overrides = {}) {
  const rotation = overrides.rotation ?? -90;
  return {
    codec_type: "video",
    codec_name: "hevc",
    pix_fmt: "yuv420p10le",
    width: 1920,
    height: 1080,
    r_frame_rate: "30/1",
    avg_frame_rate: "30/1",
    duration: "7.298333",
    color_range: "tv",
    color_space: "bt2020nc",
    color_transfer: "arib-std-b67",
    color_primaries: "bt2020",
    side_data_list: rotation ? [{ rotation }] : [],
    ...overrides
  };
}

function probe(videoStream, withAudio = true, duration = "7.298333", startTime = "0.000000") {
  return {
    streams: [
      { start_time: "0.000000", ...videoStream },
      ...(withAudio ? [{ codec_type: "audio", duration, start_time: startTime }] : [])
    ],
    format: { duration, start_time: startTime }
  };
}
