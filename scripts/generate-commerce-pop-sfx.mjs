// ============================================================
// factory-commerce-pop 原创音效生成
//   用法：node scripts/generate-commerce-pop-sfx.mjs
//   输出：template-packs/factory-commerce-pop/assets/sfx/*.wav（4 个）
//   2026-09-11：客户快照不含 wav，按 pack.json 语义重新合成；短促原创波形，无第三方音频。
// ============================================================
import path from "node:path";

import { chirp, envelope, pulse, synthesize as synthesizeTo } from "./sfx-synth.mjs";

const outputDir = path.resolve("template-packs/factory-commerce-pop/assets/sfx");
const synthesize = (name, duration, render) => synthesizeTo(outputDir, name, duration, render);

// 分支节点 pop：圆润下落式短音，无重击感。
synthesize("pop-soft.wav", 0.16, (time, duration) => {
  const env = envelope(time, duration, 0.004, 0.10);
  const body = chirp(time, 520, 240, duration) * 0.30;
  const click = pulse(time, 0, 0.012, 1400, 0.12);
  return (body + click) * env;
});

// 核心点 ding：单音钟声 + 五度泛音，长尾衰减。
synthesize("final-ding.wav", 0.70, (time, duration) => {
  const env = envelope(time, duration, 0.003, 0.45);
  const decay = Math.exp(-time * 3.2);
  const bell = Math.sin(2 * Math.PI * 1318.5 * time) * 0.14
    + Math.sin(2 * Math.PI * 1975.5 * time) * 0.07 * Math.exp(-time * 5)
    + Math.sin(2 * Math.PI * 659.25 * time) * 0.05;
  return bell * decay * env;
});

// 点击确认：干脆按键 + 短上行确认音。
synthesize("click-confirm.wav", 0.26, (time) => {
  const click = pulse(time, 0, 0.018, 1900, 0.16) + pulse(time, 0.004, 0.03, 620, 0.10);
  const confirm = pulse(time, 0.07, 0.17, 880, 0.09) * (1 + 0.2 * Math.sin(2 * Math.PI * 6 * time));
  return click + confirm;
});

// 关注/收藏确认：两音上行 chime（C6 → E6）。
synthesize("follow-confirm.wav", 0.42, (time) => {
  const first = pulse(time, 0, 0.20, 1046.5, 0.12);
  const second = pulse(time, 0.12, 0.28, 1318.5, 0.12);
  const shimmer = pulse(time, 0.12, 0.28, 2637, 0.03);
  return first + second + shimmer;
});

console.log(`Generated 4 original SFX files in ${outputDir}`);
