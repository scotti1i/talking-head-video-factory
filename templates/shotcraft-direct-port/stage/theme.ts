// ============================================================
// 舞台主题与运动原语（v3 · 深色舞台 + 三套可切换皮肤，供风格样张对比）
// STAGE_SKIN = glass（默认，Apple 玻璃）| blueprint（回形针 × Vercel 蓝图）| paper（黑卡纸 + 墨）
// 质感原则：材质分层（玻璃面 / 填充面 / 描边面）、1px 发丝线 + 顶部内高光、双层柔影，
// 强调色只落在"当前正在讲"的东西上。运动曲线沿用 Video Shotcraft（SharedElementMorph / DiagramCascadeBuild）。
// ============================================================
import {Easing, interpolate} from 'remotion';
import type {Tone} from './Plan';

import {SKIN_NAME} from './Skin';
import {CANVAS, PORTRAIT} from './Canvas';
export {CANVAS, PORTRAIT};

export type SkinName = 'glass' | 'blueprint' | 'paper' | 'stage3d' | 'studio';
export const SKIN: SkinName = SKIN_NAME;

const SKINS = {
  glass: {
    bg: '#0A0A0C', ink: '#F3EFE6', accent: '#D6B25E', red: '#D9755E',
    hair: 'rgba(255,255,255,0.18)', hairStrong: 'rgba(255,255,255,0.32)', tint: '255,255,255',
    font: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    display: 'PingFang SC, Hiragino Sans GB, sans-serif',
  },
  blueprint: {
    bg: '#070B14', ink: '#EAF2FF', accent: '#8FD3FF', red: '#FF8A7A',
    hair: 'rgba(143,211,255,0.20)', hairStrong: 'rgba(143,211,255,0.38)', tint: '150,190,255',
    font: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    display: 'PingFang SC, Hiragino Sans GB, sans-serif',
  },
  stage3d: {
    bg: '#0B0B0D', ink: '#F5F3EC', accent: '#CDD27A', red: '#C8424F',
    hair: 'rgba(255,255,255,0.22)', hairStrong: 'rgba(255,255,255,0.4)', tint: '255,255,255',
    font: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    display: 'PingFang SC, Hiragino Sans GB, sans-serif',
  },
  // studio（2026-09-07）：人是画面、信息是叠层。海军蓝插页 + 冰蓝唯一强调色，无渐变无发光；见 docs/skin-studio-spec.md
  studio: {
    bg: '#0B1630', ink: '#FFFFFF', accent: '#7FB2FF', red: '#FF7A70',
    hair: 'rgba(255,255,255,0.14)', hairStrong: 'rgba(255,255,255,0.28)', tint: '255,255,255',
    font: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    display: 'PingFang SC, Hiragino Sans GB, sans-serif',
  },
  paper: {
    bg: '#121110', ink: '#F3EAD8', accent: '#E4B25A', red: '#E07B62',
    hair: 'rgba(243,234,216,0.16)', hairStrong: 'rgba(243,234,216,0.30)', tint: '243,234,216',
    font: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    display: 'Songti SC, STSong, Noto Serif SC, serif',
  },
} as const;
const T = SKINS[SKIN];

export const BG = T.bg;
export const PANEL = `rgba(${T.tint},0.055)`;
export const PANEL_STRONG = `rgba(${T.tint},0.10)`;
export const INK = T.ink;
export const DIM = `rgba(${T.tint},0.55)`;
export const ACCENT = T.accent;
export const ACCENT_SOFT = SKIN === 'studio' ? 'rgba(127,178,255,0.18)' : SKIN === 'glass' ? 'rgba(214,178,94,0.16)' : SKIN === 'blueprint' ? 'rgba(143,211,255,0.14)' : SKIN === 'stage3d' ? 'rgba(205,210,122,0.22)' : 'rgba(228,178,90,0.16)';
export const ON_ACCENT = SKIN === 'studio' ? '#07122B' : '#141416'; // 落在强调实底上的文字色
export const CARD_BG = SKIN === 'studio' ? 'rgba(11,22,48,0.78)' : SKIN === 'blueprint' ? '#0E1522' : SKIN === 'paper' ? '#1D1A17' : SKIN === 'stage3d' ? '#17171C' : '#1C1C22'; // 不透明卡底：比背景板亮两档（2026-09-03 Scott：黑卡黑底难受）
export const RED = T.red;
export const PAPER = SKIN === 'paper' ? '#F3EAD8' : '#F5F4F0';
export const PAPER_INK = '#1C1C1E';
export const FONT = T.font;
export const DISPLAY_FONT = T.display;
export const NUM_FONT = 'SF Pro Display, Inter, PingFang SC, sans-serif';

export const HAIRLINE = T.hair;
export const HAIRLINE_STRONG = T.hairStrong;
export const BORDER_SOFT = HAIRLINE; // 兼容旧引用
export const TOP_LIGHT = 'none';
export const SHADOW = '0 8px 24px rgba(0,0,0,0.28)';
export const SHADOW_DEEP = '0 24px 60px rgba(0,0,0,0.40)'; // 只给浮层（人物框 / 引用卡 / 证据页 / 数据卡）
export const GLOW = '0 0 30px rgba(230,232,147,0.14)';
export const GLASS_BLUR = 'blur(28px) saturate(1.25)';
const accentRgb = SKIN === 'studio' ? '127,178,255' : SKIN === 'glass' ? '214,178,94' : SKIN === 'blueprint' ? '143,211,255' : SKIN === 'stage3d' ? '205,210,122' : '228,178,90';

export type Box = {x: number; y: number; w: number; h: number; r: number};
export type SurfaceForm = 'glass' | 'fill' | 'outline';

// 三种材质面：glass = 半透明玻璃（默认卡）、fill = 更亮的实体面（当前焦点 / 结果）、outline = 只有发丝线（降权 / 旧路径）
export const surface = (form: SurfaceForm, opts: {active?: number; radius?: number; accent?: boolean; soft?: boolean} = {}): React.CSSProperties => {
  // v5 · 现代扁平：纯色面 + 1px 发丝线，没有渐变、内高光、发光；层级只靠明度
  const active = opts.active ?? 0;
  const radius = opts.radius ?? 24;
  const accentBorder = opts.accent || active > 0.2;
  const border = `1px solid ${accentBorder ? `rgba(${accentRgb},${0.5 + active * 0.4})` : HAIRLINE}`;
  if (SKIN === 'studio') {
    // 海军蓝玻璃：叠在原片模糊层上，1px 发丝线；高亮 = 冰蓝实底（文字 ON_ACCENT 深色）
    if (form === 'fill' && accentBorder) return {borderRadius: radius, background: '#7FB2FF', border: 'none', boxShadow: '0 10px 28px rgba(0,0,0,.35)'};
    if (form === 'fill') return {borderRadius: radius, background: 'rgba(16,30,62,0.92)', border: `1px solid ${HAIRLINE_STRONG}`, backdropFilter: 'blur(24px)'};
    if (form === 'glass') return {borderRadius: radius, background: 'rgba(11,22,48,0.78)', border: `1px solid ${HAIRLINE}`, backdropFilter: 'blur(24px)'};
    return {borderRadius: radius, background: 'transparent', border: `1px solid ${HAIRLINE_STRONG}`};
  }
  if (SKIN === 'paper') {
    const paperBg = form === 'fill' ? '#2A2622' : form === 'glass' ? '#1D1A17' : 'transparent';
    return {borderRadius: radius, background: paperBg, border};
  }
  if (SKIN === 'stage3d') {
    // 立体舞台：高亮 = 纯青柠实底（文字用 ON_ACCENT 深色）；普通面 = 单层暗卡 + 1px 发丝线，不做双线框（避免卡中卡）
    if (form === 'fill' && accentBorder) return {borderRadius: radius, background: 'linear-gradient(160deg,#D8DC8E,#B9BE68)', border: 'none', boxShadow: '0 12px 30px rgba(0,0,0,.45)'};
    if (form === 'fill') return {borderRadius: radius, background: '#1D1D23', border: `1px solid ${HAIRLINE_STRONG}`};
    if (form === 'glass') return {borderRadius: radius, background: '#17171C', border: `1px solid ${HAIRLINE}`};
    return {borderRadius: radius, background: 'transparent', border: `1px solid ${HAIRLINE_STRONG}`};
  }
  // 小Lin 式双线框：外圈金线 + 5px 留白 + 内圈淡线；卡底不透明
  const frame = `inset 0 0 0 1px rgba(${accentRgb},${accentBorder ? 0.7 + active * 0.3 : 0.26}), inset 0 0 0 5px ${CARD_BG}, inset 0 0 0 6px rgba(${T.tint},0.11)`;
  if (form === 'fill') return {borderRadius: radius, background: accentBorder ? `linear-gradient(${CARD_BG}, ${CARD_BG}) padding-box` : CARD_BG, border: 'none', boxShadow: accentBorder ? `${frame}, inset 0 0 0 200px ${ACCENT_SOFT}` : frame};
  if (form === 'glass') return {borderRadius: radius, background: CARD_BG, border: 'none', boxShadow: frame};
  return {borderRadius: radius, background: 'transparent', border: `1px solid ${HAIRLINE}`};
};

// stage3d 彩色实底（小Lin 式）：红 / 紫 / 青柠 / 墨，配虚线内边
export type TileTone = 'red' | 'purple' | 'lime' | 'ink';
export const toneTile = (tone: TileTone | undefined, radius = 22): React.CSSProperties => {
  if (!tone || SKIN !== 'stage3d') return {};
  const bg = tone === 'red' ? 'linear-gradient(160deg,#8E2634,#5A1622)' : tone === 'purple' ? 'linear-gradient(160deg,#4A3C7E,#2B2249)' : tone === 'lime' ? 'linear-gradient(160deg,#D2D68A,#AEB35C)' : 'linear-gradient(160deg,#1E1E24,#121216)';
  return {borderRadius: radius, background: bg, border: 'none', boxShadow: `inset 0 0 0 1px rgba(255,255,255,.18), inset 0 0 0 6px transparent, 0 10px 30px rgba(0,0,0,.45)`, outline: '1px dashed rgba(255,255,255,.35)', outlineOffset: -7};
};

// v5：实体物件改为扁平面（与 surface 同一套明度层级），保留函数签名供组件调用
export const tile = (opts: {radius?: number; accent?: boolean; active?: number; dim?: number} = {}): React.CSSProperties => {
  const active = opts.active ?? (opts.accent ? 1 : 0);
  const dim = opts.dim ?? 0;
  const base = surface(active > 0.2 ? 'fill' : 'glass', {radius: opts.radius ?? 28, active, accent: opts.accent});
  return {...base, opacity: 1 - dim * 0.55, boxShadow: dim > 0.5 ? 'none' : '0 1px 2px rgba(0,0,0,.25)'};
};

// 扁平材质下没有顶光高光层
export const tileSheen = (): React.CSSProperties => ({display: 'none'});

// 字体做主角的字号阶梯：主角词 / 次级说明 / 眉题
export const HERO = {word: 200, wordSmall: 150, lead: 34, eyebrow: 22} as const;

// 强调色胶囊（术语标签、判定徽章）：扁平纯色，无内高光无投影
export const accentPill = (tone: Tone | undefined = 'accent'): React.CSSProperties => ({
  background: tone === 'red' ? RED : ACCENT,
  color: SKIN === 'studio' ? '#07122B' : SKIN === 'blueprint' ? '#06101C' : SKIN === 'paper' ? '#1A1408' : '#141416',
  borderRadius: 999,
});

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (t: number, a: number, b: number) => a + (b - a) * t;

export const progress = (frame: number, start: number, end: number, easing: (t: number) => number = Easing.linear) =>
  interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

export const outCubic = Easing.out(Easing.cubic);
export const inCubic = Easing.in(Easing.cubic);
export const inOutCubic = Easing.inOut(Easing.cubic);

export const SHARED_DURATION = 35;
export const sharedProgress = (frame: number, start: number) => {
  if (frame < start) return 0;
  const drive = interpolate(frame, [start, start + 25], [0, 1.03], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const settle = interpolate(frame, [start + 25, start + 35], [1.03, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: outCubic,
  });
  return frame <= start + 25 ? drive : settle;
};

export const mixBox = (a: Box, b: Box, p: number): Box => ({
  x: lerp(p, a.x, b.x),
  y: lerp(p, a.y, b.y),
  w: lerp(p, a.w, b.w),
  h: lerp(p, a.h, b.h),
  r: lerp(p, a.r, b.r),
});

export const stageOpacity = (frame: number, start: number, end: number, enter = 18, exit = 18) =>
  progress(frame, start - enter, start, outCubic) * (1 - progress(frame, end, end + exit, inCubic));

export const windowLevel = (frame: number, windows: [number, number][] | undefined, fade = 12) => {
  if (!windows?.length) return 0;
  let level = 0;
  for (const [from, to] of windows) {
    const value = progress(frame, from, from + fade, outCubic) * (1 - progress(frame, to, to + fade, inCubic));
    level = Math.max(level, value);
  }
  return level;
};

export const toneColor = (tone: Tone | undefined, fallback = INK) =>
  tone === 'accent' ? ACCENT : tone === 'red' ? RED : fallback;

// 字幕安全区：画面底部 170px 不放任何舞台元素
export const CAPTION_SAFE_TOP = PORTRAIT ? 1380 : 900;

// 内容区：人物占位之外的可用矩形，所有场景把自己的主体居中在这里（视觉重心）
export type Rect = {x: number; y: number; w: number; h: number};
export const contentRect = (mode: string): Rect => {
  // 竖屏（studio-portrait）：人物永远铺满，内容只占脸下方的下区（y 990–1300），字幕在 1320 以下
  if (PORTRAIT) return mode === 'split' ? {x: 60, y: 890, w: 860, h: 484} : {x: 60, y: 990, w: 840, h: 310}; // split：16:9 第三方面板位（避开右侧抖音图标列 x>930）
  if (mode === 'stage' || mode === 'full') return {x: 1360, y: 120, w: 520, h: 700};
  if (mode === 'wide') return {x: 1300, y: 100, w: 566, h: 675}; // studio：横卡右侧浮动栏
  if (mode === 'pip') return {x: 60, y: 340, w: 1800, h: 560}; // studio：小卡在左上，主区在下方
  if (mode === 'close-right') return {x: 54, y: 60, w: 1166, h: 840};
  switch (mode) {
    case 'hero-center': return {x: 1300, y: 60, w: 566, h: 840};
    case 'hero':
    case 'close': return {x: 700, y: 60, w: 1166, h: 840};
    case 'hero-right': return {x: 54, y: 60, w: 1166, h: 840};
    case 'dock': return {x: 524, y: 60, w: 1342, h: 840};
    case 'focus': return {x: 634, y: 60, w: 1232, h: 840};
    default: return {x: 120, y: 60, w: 1680, h: 840};
  }
};
export const rectCenter = (r: Rect) => ({x: r.x + r.w / 2, y: r.y + r.h / 2});

// 提醒卡固定槽位（真人画面右上角）
export const REMINDER_SLOTS: Box[] = PORTRAIT ? [
  {x: 60, y: 990, w: 840, h: 94, r: 22},
  {x: 60, y: 1098, w: 840, h: 94, r: 22},
  {x: 60, y: 1206, w: 840, h: 94, r: 22},
] : [
  {x: 1326, y: 58, w: 540, h: 132, r: 22},
  {x: 1326, y: 210, w: 540, h: 132, r: 22},
  {x: 1326, y: 362, w: 540, h: 132, r: 22},
];
