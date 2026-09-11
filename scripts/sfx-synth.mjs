// ============================================================
// 模板包音效合成基础库
//   确定性 PCM 合成 → 16-bit 立体声 WAV。不采样、不含第三方录音。
//   generate-*-sfx.mjs 只描述声音，波形与文件封装统一在这里。
// ============================================================
import fs from "node:fs";
import path from "node:path";

export const SAMPLE_RATE = 48_000;

// xorshift32：固定种子，同一脚本每次生成字节一致。
let seed = 0x6d2b79f5;
export function noise() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
}

export function clamp(value) {
  return Math.max(-0.92, Math.min(0.92, value));
}

export function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function envelope(time, duration, attack = 0.02, release = 0.12) {
  const on = smoothstep(time / Math.max(attack, 1e-6));
  const off = smoothstep((duration - time) / Math.max(release, 1e-6));
  return on * off;
}

export function chirp(time, startHz, endHz, duration, phase = 0) {
  const rate = (endHz - startHz) / duration;
  return Math.sin(2 * Math.PI * (startHz * time + 0.5 * rate * time * time) + phase);
}

export function pulse(time, at, length, frequency, amplitude) {
  const local = time - at;
  if (local < 0 || local > length) return 0;
  return Math.sin(2 * Math.PI * frequency * local) * envelope(local, length, 0.004, length * 0.75) * amplitude;
}

// render(time, duration, lowNoise) → 单声道数值或 [left, right]
export function synthesize(outputDir, name, duration, render) {
  const frameCount = Math.ceil(duration * SAMPLE_RATE);
  const pcm = Buffer.alloc(frameCount * 4);
  let lowNoise = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const time = index / SAMPLE_RATE;
    lowNoise = lowNoise * 0.92 + noise() * 0.08;
    const frame = render(time, duration, lowNoise);
    const left = Array.isArray(frame) ? frame[0] : frame;
    const right = Array.isArray(frame) ? frame[1] : frame;
    pcm.writeInt16LE(Math.round(clamp(left) * 32767), index * 4);
    pcm.writeInt16LE(Math.round(clamp(right) * 32767), index * 4 + 2);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), wavFile(pcm, SAMPLE_RATE, 2));
}

export function wavFile(pcm, rate, channels) {
  const header = Buffer.alloc(44);
  const byteRate = rate * channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
