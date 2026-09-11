// ============================================================
// 音频能量包络（10ms RMS）与词边界吸附。
// 为什么：whisper token 时码在词尾会拖进静音（客户葡语片 5 轮「全片重校」不收敛，最后靠手搓 20ms 波形谷才稳）。
//   这里把那套做法固化：字幕出点收到词后最后一个有声帧 + 保护量，入点提到词前第一个有声帧。语种无关。
// ============================================================
import { spawnSync } from "node:child_process";

export const FRAME_MS = 10;
const SAMPLE_RATE = 16000;

// 读整条音频为 10ms RMS 数组（dBFS）
export function readEnvelope(mediaPath) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-i", mediaPath, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`读取音频失败: ${mediaPath}\n${result.stderr}`);
  const pcm = new Int16Array(result.stdout.buffer, result.stdout.byteOffset, Math.floor(result.stdout.byteLength / 2));
  const hop = Math.round(SAMPLE_RATE * FRAME_MS / 1000);
  const frames = Math.floor(pcm.length / hop);
  const rms = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    const base = frame * hop;
    for (let index = 0; index < hop; index += 1) {
      const value = pcm[base + index] / 32768;
      sum += value * value;
    }
    rms[frame] = 20 * Math.log10(Math.sqrt(sum / hop) + 1e-9);
  }
  return { rms, frameSeconds: FRAME_MS / 1000, duration: pcm.length / SAMPLE_RATE, noiseFloor: percentile(rms, 0.1), speechLevel: percentile(rms, 0.9) };
}

export function voicedThreshold(envelope) {
  // 底噪与语音电平之间取 35% 处；车内 / 工厂底噪高时仍能分开
  return envelope.noiseFloor + (envelope.speechLevel - envelope.noiseFloor) * 0.35;
}

function frameAt(envelope, seconds) {
  return Math.min(envelope.rms.length - 1, Math.max(0, Math.round(seconds / envelope.frameSeconds)));
}

// 在 [from, to] 里找最后一个有声帧的时间；没有返回 null
export function lastVoicedBefore(envelope, from, to, threshold = voicedThreshold(envelope)) {
  for (let frame = frameAt(envelope, to); frame >= frameAt(envelope, from); frame -= 1) {
    if (envelope.rms[frame] > threshold) return frame * envelope.frameSeconds;
  }
  return null;
}

export function firstVoicedAfter(envelope, from, to, threshold = voicedThreshold(envelope)) {
  for (let frame = frameAt(envelope, from); frame <= frameAt(envelope, to); frame += 1) {
    if (envelope.rms[frame] > threshold) return frame * envelope.frameSeconds;
  }
  return null;
}

// 词边界吸附：出点 = 不晚于下一个词起点，且收到最后有声帧 + guard；入点 = 不早于上一个词终点，提到第一个有声帧 − lead
export function snapWords(words, envelope, { guard = 0.08, lead = 0.02, maxWordSeconds = 1.2 } = {}) {
  const threshold = voicedThreshold(envelope);
  const out = words.map((word) => ({ ...word }));
  for (let index = 0; index < out.length; index += 1) {
    const word = out[index];
    const next = out[index + 1];
    const prev = out[index - 1];
    let end = Math.min(word.end, next ? next.start : word.end, word.start + maxWordSeconds);
    const voiced = lastVoicedBefore(envelope, word.start, end, threshold);
    if (voiced != null) end = Math.min(end, voiced + guard);
    const firstVoiced = firstVoicedAfter(envelope, Math.max(prev ? prev.end : 0, word.start - 0.15), word.start + 0.2, threshold);
    let start = word.start;
    if (firstVoiced != null && firstVoiced < word.start) start = Math.max(prev ? prev.end : 0, firstVoiced - lead);
    word.start = round(start);
    word.end = round(Math.max(end, start + 0.05));
    word.snapped = true;
  }
  return out;
}

// 语音区：相邻词间隔 < gap 视为同一区
export function voiceRegions(words, { gap = 0.5 } = {}) {
  const regions = [];
  for (const word of words) {
    const current = regions.at(-1);
    if (current && word.start - current.end < gap) {
      current.end = Math.max(current.end, word.end);
      current.words.push(word);
    } else {
      regions.push({ start: word.start, end: word.end, words: [word] });
    }
  }
  return regions;
}

function percentile(values, p) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length) return -90;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
