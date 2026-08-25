import { commandOk } from "./lib.mjs";

export const VIDEO_ENCODERS = Object.freeze(["auto", "cpu", "nvenc"]);

export function resolveVideoEncoder({ requested = "auto", platform = process.platform, encoderOutput } = {}) {
  const mode = String(requested || "auto").toLowerCase();
  if (!VIDEO_ENCODERS.includes(mode)) throw new Error(`video-encoder 只能是 ${VIDEO_ENCODERS.join("/")}`);
  const available = encoderOutput == null ? readFfmpegEncoders() : String(encoderOutput);
  const hasNvenc = /\bh264_nvenc\b/.test(available);
  if (mode === "nvenc" && !hasNvenc) throw new Error("请求了 NVENC，但当前 FFmpeg 不包含 h264_nvenc");
  if (mode === "cpu") return "cpu";
  if (mode === "nvenc") return "nvenc";
  return ["linux", "win32"].includes(platform) && hasNvenc ? "nvenc" : "cpu";
}

export function videoEncoderArgs({ mode, preset = "veryfast", crf = "20", videoBitrate, fps = 30 }) {
  const gop = String(Math.round(Number(fps)));
  const rate = videoBitrate ? bitrateArgs(videoBitrate) : null;
  if (mode === "nvenc") {
    return [
      "-c:v", "h264_nvenc",
      "-preset", "p5",
      "-tune", "hq",
      "-rc", "vbr",
      ...(rate || ["-cq", String(crf), "-b:v", "0"]),
      "-spatial-aq", "1",
      "-temporal-aq", "1",
      "-g", gop,
      "-keyint_min", gop,
      "-sc_threshold", "0"
    ];
  }
  if (mode !== "cpu") throw new Error(`未知编码模式: ${mode}`);
  return [
    "-c:v", "libx264",
    "-preset", String(preset),
    ...(rate || ["-crf", String(crf)]),
    "-g", gop,
    "-keyint_min", gop,
    "-sc_threshold", "0"
  ];
}

function readFfmpegEncoders() {
  const result = commandOk("ffmpeg", ["-hide_banner", "-encoders"]);
  return result.ok ? result.output : "";
}

function bitrateArgs(value) {
  const bitrate = String(value);
  const numeric = Number.parseInt(bitrate, 10);
  const buffer = Number.isFinite(numeric) && numeric > 0 ? `${numeric * 2}M` : bitrate;
  return ["-b:v", bitrate, "-maxrate", bitrate, "-bufsize", buffer];
}
