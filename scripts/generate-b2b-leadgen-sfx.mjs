import fs from "node:fs";
import path from "node:path";

const sampleRate = 48_000;
const outputDir = path.resolve("template-packs/factory-b2b-leadgen/assets/sfx");
fs.mkdirSync(outputDir, { recursive: true });

let seed = 0x6d2b79f5;
function noise() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
}

function clamp(value) {
  return Math.max(-0.92, Math.min(0.92, value));
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function envelope(time, duration, attack = 0.02, release = 0.12) {
  const on = smoothstep(time / Math.max(attack, 1e-6));
  const off = smoothstep((duration - time) / Math.max(release, 1e-6));
  return on * off;
}

function chirp(time, startHz, endHz, duration, phase = 0) {
  const rate = (endHz - startHz) / duration;
  return Math.sin(2 * Math.PI * (startHz * time + 0.5 * rate * time * time) + phase);
}

function pulse(time, at, length, frequency, amplitude) {
  const local = time - at;
  if (local < 0 || local > length) return 0;
  return Math.sin(2 * Math.PI * frequency * local) * envelope(local, length, 0.004, length * 0.75) * amplitude;
}

function synthesize(name, duration, render) {
  const frameCount = Math.ceil(duration * sampleRate);
  const pcm = Buffer.alloc(frameCount * 4);
  let lowNoise = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    lowNoise = lowNoise * 0.92 + noise() * 0.08;
    const frame = render(time, duration, lowNoise);
    const left = Array.isArray(frame) ? frame[0] : frame;
    const right = Array.isArray(frame) ? frame[1] : frame;
    pcm.writeInt16LE(Math.round(clamp(left) * 32767), index * 4);
    pcm.writeInt16LE(Math.round(clamp(right) * 32767), index * 4 + 2);
  }
  fs.writeFileSync(path.join(outputDir, name), wavFile(pcm, sampleRate, 2));
}

function wavFile(pcm, rate, channels) {
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

synthesize("opening-soft-rise.wav", 0.42, (time, duration, air) => {
  const env = envelope(time, duration, 0.08, 0.15);
  const tone = chirp(time, 260, 760, duration) * 0.16;
  const sparkle = pulse(time, 0.27, 0.15, 980, 0.10);
  return (tone + air * 0.06 + sparkle) * env;
});

synthesize("card-soft-rise.wav", 0.24, (time, duration) => {
  const env = envelope(time, duration, 0.025, 0.14);
  const rounded = chirp(time, 380, 650, duration) * 0.20;
  const body = Math.sin(2 * Math.PI * 190 * time) * 0.05;
  return (rounded + body) * env;
});

synthesize("transition-soft-whoosh.wav", 0.30, (time, duration, air) => {
  const env = envelope(time, duration, 0.08, 0.10);
  const tonalAir = chirp(time, 180, 560, duration) * 0.045;
  const pan = smoothstep(time / duration);
  const signal = (air * 0.16 + tonalAir) * env;
  return [signal * (1 - pan * 0.35), signal * (0.65 + pan * 0.35)];
});

synthesize("broll-reveal.wav", 0.34, (time, duration, air) => {
  const whoosh = (air * 0.14 + chirp(time, 210, 520, duration) * 0.04) * envelope(time, duration, 0.07, 0.14);
  const cue = pulse(time, 0.22, 0.12, 720, 0.11);
  return whoosh + cue;
});

synthesize("zoom-air.wav", 0.22, (time, duration, air) => {
  const env = envelope(time, duration, 0.06, 0.08);
  return (air * 0.11 + chirp(time, 250, 490, duration) * 0.03) * env;
});

synthesize("contact-typing.wav", 0.76, (time) => {
  const clicks = [0.02, 0.13, 0.25, 0.36, 0.49, 0.61, 0.70];
  return clicks.reduce((sum, at, index) => sum + pulse(time, at, 0.055, 820 + index * 47, 0.13), 0);
});

synthesize("contact-ring.wav", 0.90, (time, duration) => {
  const gate = (time < 0.30 || (time > 0.43 && time < 0.73)) ? 1 : 0;
  const env = envelope(time, duration, 0.02, 0.12);
  const ring = Math.sin(2 * Math.PI * 660 * time) * 0.11 + Math.sin(2 * Math.PI * 880 * time) * 0.09;
  return ring * gate * env;
});

synthesize("cta-confirm.wav", 0.58, (time, duration) => {
  const env = envelope(time, duration, 0.01, 0.30);
  const chord = Math.sin(2 * Math.PI * 523.25 * time) * 0.09
    + Math.sin(2 * Math.PI * 659.25 * time) * 0.08
    + Math.sin(2 * Math.PI * 783.99 * time) * 0.07;
  return chord * env;
});

console.log(`Generated 8 original SFX files in ${outputDir}`);
