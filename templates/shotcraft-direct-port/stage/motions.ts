// ============================================================
// 舞台动作库（从 Video Shotcraft 上游直接移植的运动参数，纯函数，帧驱动）
// 每个函数头注明上游文件与原始节拍；参数不做"神似改写"，只改坐标系 / 尺度。
// 原件与哈希：vendor/video-shotcraft/scene-recipes/PROVENANCE.json
// ============================================================
import {Easing, interpolate} from 'remotion';

const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const outCubic = Easing.out(Easing.cubic);
const inCubic = Easing.in(Easing.cubic);

// ---------- BlurSlide.tsx：逐词入场 y 40→0 + blur 10→0 + opacity 0→1，同一条 outCubic ----------
export const blurSlide = (frame: number, at: number, dur = 16, dy = 40) => {
  const p = interpolate(frame, [at, at + dur], [0, 1], {...CL, easing: outCubic});
  return {opacity: p, transform: `translateY(${(1 - p) * dy}px)`, filter: `blur(${(1 - p) * 10}px)`} as const;
};

// ---------- KaraokeFillSync.tsx：词内 linear 填充，clip-path inset 按进度揭开；读指下划线 8px 跟随右缘 ----------
export const karaokeClip = (frame: number, start: number, end: number) => {
  const p = interpolate(frame, [start, end], [0, 1], CL);
  return {p, active: frame >= start && frame < end, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`};
};

// ---------- MarkerUnderlineTitle.tsx：马克笔笔画多边形（中轴微歪 + 变宽 + 毛糙），10f 从左到右描画 ----------
const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const markerStroke = (len: number, seed = 77, thickness = 1) => {
  const rand = mulberry32(seed);
  const N = 40;
  const top: string[] = [];
  const bot: string[] = [];
  const wob = Array.from({length: N + 1}, () => rand() - 0.5);
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = t * len;
    const mid = 19 - t * 9 + Math.sin(t * Math.PI * 1.6 + 0.4) * 2.6 + wob[i] * 1.6;
    const wBase = (14 + Math.sin(t * Math.PI) * 6 - Math.max(0, t - 0.86) * 46) * thickness;
    const w = Math.max(2.2, wBase + wob[i] * 3);
    top.push(`${x.toFixed(1)},${(mid - w / 2).toFixed(1)}`);
    bot.push(`${x.toFixed(1)},${(mid + w / 2).toFixed(1)}`);
  }
  return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
};
export const markerDraw = (frame: number, at: number) => {
  const draw = interpolate(frame, [at, at + 10], [0, 1], CL);
  return 1 - Math.pow(1 - draw, 2.2);
};

// ---------- ContactShadowLift.tsx：抬起 translateY -28 + scale 1.08（10f outCubic），接触阴影 1→1.72 放大、0.55→0.18 变淡 ----------
export const contactLift = (lift: number) => ({
  y: -28 * lift,
  scale: 1 + 0.08 * lift,
  shadowScale: 1 + 0.72 * lift,
  shadowOpacity: 0.55 - 0.37 * lift,
});

// ---------- ScoreSlam.tsx：8–14f 砸落 scale 2.5→0.97 / rotate 5→0 / y -80→0（Easing.in quad），14–22f 回弹到 1，冲击环 60→860 直径 14f，震屏 18px 5f 指数衰减 ----------
const hash = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};
export const slamEnter = (frame: number, at: number) => {
  const impact = at + 6;
  const scale = frame < impact
    ? interpolate(frame, [at, impact], [2.5, 0.97], {...CL, easing: Easing.in(Easing.quad)})
    : interpolate(frame, [impact, impact + 8], [0.97, 1], {...CL, easing: outCubic});
  const rot = interpolate(frame, [at, impact], [5, 0], {...CL, easing: Easing.in(Easing.quad)});
  const y = interpolate(frame, [at, impact], [-80, 0], {...CL, easing: Easing.in(Easing.quad)});
  const opacity = interpolate(frame, [at, at + 3], [0, 1], CL);
  let shakeX = 0;
  let shakeY = 0;
  if (frame >= impact && frame < impact + 5) {
    const t = frame - impact;
    const amp = 18 * Math.exp(-t * 0.9);
    shakeX = amp * (hash(frame * 7 + 1) * 2 - 1);
    shakeY = amp * (hash(frame * 13 + 2) * 2 - 1);
  }
  const ringT = interpolate(frame, [impact, impact + 14], [0, 1], {...CL, easing: outCubic});
  const ringLin = interpolate(frame, [impact, impact + 14], [0, 1], CL);
  const ringD = interpolate(ringT, [0, 1], [60, 860]);
  const ringOp = interpolate(ringLin, [0, 0.65, 1], [0.75, 0.55, 0]);
  const ringOn = frame >= impact && frame < impact + 14;
  return {scale, rot, y, opacity, shakeX, shakeY, ringD, ringOp, ringOn, impact};
};

// ---------- PopBurstConfirm.tsx：缩 0.6x 蓄力 3f → 弹 1.35x 过冲 → back(2) 落回；释放帧 10 根短线粒子 14f + 圆环扩到 2.5 倍 20f ----------
export const popBurst = (frame: number, at: number) => {
  const pop = at + 7; // 20–23 缩 / 23–27 蓄力 / 27 释放（相对 at）
  const scale = (() => {
    if (frame <= at) return 0;
    if (frame <= at + 3) return interpolate(frame, [at, at + 3], [1, 0.6], {...CL, easing: Easing.in(Easing.quad)});
    if (frame <= pop) return 0.6;
    if (frame <= pop + 6) return interpolate(frame, [pop, pop + 6], [0.6, 1.35], {...CL, easing: outCubic});
    return interpolate(frame, [pop + 6, pop + 17], [1.35, 1], {...CL, easing: Easing.out(Easing.back(2))});
  })();
  const pt = interpolate(frame, [pop, pop + 14], [0, 1], CL);
  const rt = interpolate(frame, [pop, pop + 20], [0, 1], CL);
  return {
    scale,
    particlesOn: pt > 0 && pt < 1,
    pDist: 0.55 + 0.45 * outCubic(pt), // 相对半径（乘以物件半径）
    pLen: 0.24 * (1 - pt),
    pOpacity: 1 - pt,
    ringOn: rt > 0 && rt < 1,
    ringR: 1 + 1.5 * outCubic(rt), // 相对半径
    ringOpacity: 0.85 * (1 - rt),
    ringWidth: 8 - 6 * rt,
  };
};
export const burstAngles = Array.from({length: 10}).map((_, i) => ((i * 36 + 9 * Math.sin(i * 7.31)) * Math.PI) / 180);

// ---------- ScanlineAnnotateFocus.tsx：取景框四角括号从 1.75 倍收拢（outBack 0.13）、对准瞬间 7% 白色微闪、标注 0.05→0.16 淡入上移 ----------
export const bracketsFocus = (frame: number, at: number, fps = 30) => {
  const a = interpolate(frame, [at, at + 0.11 * fps * 4.6], [0, 1], {...CL, easing: outCubic});
  const s0 = interpolate(frame, [at, at + 0.13 * fps * 4.6], [0, 1], CL);
  const back = Easing.out(Easing.back(1.7))(s0);
  const scale = 1.75 + (1 - 1.75) * back;
  const flash = 0.07 * interpolate(frame, [at + 5, at + 12], [0, 1], CL) * (1 - interpolate(frame, [at + 12, at + 30], [0, 1], CL));
  return {opacity: a, scale, flash};
};

// ---------- CrashZoomReal.tsx：40–46f 急推 6f（bezier .55,0,.7,1）到 2.6x，46–51f 过冲回 2.45x ----------
export const crashZoom = (frame: number, at: number, peak = 2.6, settle = 2.45) =>
  interpolate(frame, [at, at + 6, at + 11], [1, peak, settle], {...CL, easing: Easing.bezier(0.55, 0, 0.7, 1)});

// ---------- OdometerDigitRoll.tsx：0.85 行/帧高速滚，位 i 在 at+i*7 开始 16f outCubic 减速过冲半格，6f 回弹锁定；残影 ±0.5 行 0.25/0.12 ----------
export const odometerPos = (frame: number, at: number, i: number, digit: number, spin = 0.85) => {
  const f = frame - at;
  const s = 20 + i * 7;
  const p0 = spin * s;
  const T = Math.ceil((p0 + 6 - digit) / 10) * 10 + digit;
  if (f < 0) return 0;
  if (f < s) return spin * f;
  if (f < s + 16) return interpolate(f, [s, s + 16], [p0, T + 0.5], {...CL, easing: outCubic});
  if (f < s + 22) return interpolate(f, [s + 16, s + 22], [T + 0.5, T], {...CL, easing: outCubic});
  return T;
};

// ---------- FlylineArc.tsx：22f outCubic 生长，亮头暗尾（0.4→1 按离头距离平方），到达后 10f 抹匀，光头 r26 光晕 + r9 实心 ----------
export const flyline = (frame: number, at: number) => {
  const e = interpolate(frame, [at, at + 22], [0, 1], {...CL, easing: outCubic});
  const settle = interpolate(frame, [at + 22, at + 32], [0, 1], CL);
  return {e, growing: frame >= at && frame < at + 22, settle};
};

// ---------- CircleMatchIris.tsx：光圈 clip-path circle 从 22px 炸开到 2100px（45f inOut cubic），圆心严格同心；起点两次脉冲 ----------
export const circleIris = (frame: number, at: number, r0 = 22) => ({
  r: interpolate(frame, [at, at + 45], [r0, 2100], {...CL, easing: Easing.inOut(Easing.cubic)}),
  pulse: frame < at ? 1 + 0.45 * Math.abs(Math.sin((Math.max(0, frame - (at - 30)) / 30) * Math.PI * 2)) : 1,
});

// ---------- MultiplaneReal.tsx：三层深度系数 0.35 / 0.7 / 1.4，Easing.bezier(.35,0,.25,1) ----------
export const MULTIPLANE = {back: 0.35, mid: 0.7, front: 1.4} as const;
export const multiplaneDrive = (frame: number, period = 900, amplitude = 60) => Math.sin(frame / period) * amplitude;

export {inCubic, outCubic};
