// ============================================================
// factory-b2b-leadgen 原创音效生成
//   用法：node scripts/generate-b2b-leadgen-sfx.mjs
//   输出：template-packs/factory-b2b-leadgen/assets/sfx/*.wav（8 个）
// ============================================================
import path from "node:path";

import { chirp, envelope, pulse, smoothstep, synthesize as synthesizeTo } from "./sfx-synth.mjs";

const outputDir = path.resolve("template-packs/factory-b2b-leadgen/assets/sfx");
const synthesize = (name, duration, render) => synthesizeTo(outputDir, name, duration, render);

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
