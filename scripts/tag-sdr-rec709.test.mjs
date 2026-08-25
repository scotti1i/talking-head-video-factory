import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRec709Sdr,
  bitstreamFilterFor,
  buildTagArgs
} from "./tag-sdr-rec709.mjs";

test("H.264 与 HEVC 用码流过滤器无损写入完整 Rec.709 VUI", () => {
  assert.match(bitstreamFilterFor("h264"), /^h264_metadata=/);
  assert.match(bitstreamFilterFor("hevc"), /^hevc_metadata=/);
  assert.throws(() => bitstreamFilterFor("vp9"), /不支持无损写入/);
  const args = buildTagArgs("in.mp4", "out.mp4", "h264");
  assert.deepEqual(args.slice(args.indexOf("-c"), args.indexOf("-color_range")), [
    "-c", "copy",
    "-bsf:v", "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1"
  ]);
  assert.deepEqual(args.slice(-3), ["-movflags", "+faststart", "out.mp4"]);
});

test("Rec.709 复核要求像素格式、范围、矩阵、传递与原色全部明确", () => {
  assert.equal(assertRec709Sdr({
    pix_fmt: "yuv420p",
    color_range: "tv",
    color_space: "bt709",
    color_transfer: "bt709",
    color_primaries: "bt709"
  }), true);
  assert.throws(() => assertRec709Sdr({
    pix_fmt: "yuv420p",
    color_range: "tv",
    color_space: "bt709"
  }), /color_transfer=unknown.*color_primaries=unknown/);
});
