// ============================================================
// 舞台基底与字幕（v3）
// 背景四层：原片派生模糊层（慢缩放）→ 两团不同周期漂移的光（一暖一冷）→ 静态胶片颗粒 → 暗角
// 它们负责"画面没有死"，但观众不应主动注意到；字幕固定 lower third，元素不得进入安全区。
// ============================================================
import React, {useLayoutEffect, useRef} from 'react';
import {Img, OffthreadVideo, interpolate, staticFile} from 'remotion';
import type {CaptionLine} from './Plan';
import {ACCENT, BG, FONT, SKIN, progress} from './theme';
import {CANVAS, PORTRAIT} from './Canvas';
import {MULTIPLANE, multiplaneDrive} from './motions';

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")";

// 小Lin 式环境微动层：等高线缓慢漂移（周期 20–30s，对比度极低），观众不应主动注意到
const Contours: React.FC<{frame: number}> = ({frame}) => {
  const paths: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const baseY = 120 + i * 105;
    const pts: string[] = [];
    for (let x = -100; x <= 2020; x += 60) {
      const y = baseY + Math.sin(x / 260 + i * 0.9 + frame / 700) * 26 + Math.sin(x / 110 - i * 0.5 - frame / 520) * 9;
      pts.push(`${pts.length ? 'L' : 'M'} ${x} ${y.toFixed(1)}`);
    }
    paths.push(pts.join(' '));
  }
  return (
    <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0}}>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(243,239,230,.085)" strokeWidth={1.2} />)}
    </svg>
  );
};

// 点云波动（2026-09-03 Scott：不是固定网点加粒子，是点云本身在波动、亮度随波峰呼吸）
// 28px 网格 ≈ 2700 个点，两组慢波叠加做位移，波高决定亮度与半径；canvas 每帧重画，确定性
const DotField: React.FC<{frame: number}> = ({frame}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
    const f = frame;
    for (let gy = -1; gy < 40; gy += 1) {
      for (let gx = -1; gx < 70; gx += 1) {
        const x0 = gx * 28 + 8, y0 = gy * 28 + 8;
        const w1 = Math.sin(x0 / 170 + y0 / 260 + f / 75);
        const w2 = Math.cos(x0 / 320 - y0 / 190 - f / 110);
        const wave = (w1 + w2) / 2; // -1..1
        const dx = 7 * Math.sin(y0 / 140 + f / 90) + 5 * w2;
        const dy = 6 * Math.cos(x0 / 160 - f / 120) + 4 * w1;
        const a = 0.06 + 0.2 * (0.5 + 0.5 * wave);
        const r = 1.3 + 1.5 * (0.5 + 0.5 * wave);
        ctx.beginPath(); ctx.arc(x0 + dx, y0 + dy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,243,236,${a.toFixed(3)})`; ctx.fill();
      }
    }
  }, [frame]);
  return <canvas ref={ref} width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0}} />;
};

// 小Lin 式微粒：120 颗极小的点各自缓慢漂移 + 明暗呼吸，三层视差（近大远小），观众只感到"背景在呼吸"
const PARTICLES = Array.from({length: 120}).map((_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return {x: r(1) * CANVAS.w, y: r(2) * CANVAS.h, size: 1.2 + r(3) * 2.6, depth: 0.4 + r(4) * 1.2, phase: r(5) * Math.PI * 2, speed: 0.15 + r(6) * 0.35};
});
const Particles: React.FC<{frame: number}> = ({frame}) => (
  <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0}}>
    {PARTICLES.map((p, i) => {
      const x = (p.x + frame * p.speed * p.depth + Math.sin(frame / 240 + p.phase) * 18 * p.depth + CANVAS.w) % CANVAS.w;
      const y = (p.y + Math.cos(frame / 300 + p.phase) * 12 * p.depth - frame * 0.05 * p.depth + CANVAS.h) % CANVAS.h;
      const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(frame / 45 + p.phase * 3));
      return <circle key={i} cx={x} cy={y} r={p.size * p.depth} fill={`rgba(245,243,236,${(a * p.depth).toFixed(3)})`} />;
    })}
  </svg>
);

export const Background: React.FC<{frame: number; durationInFrames: number; media: string; startFrom: number; plate?: string}> = ({
  frame,
  durationInFrames,
  media,
  startFrom,
  plate,
}) => {
  const bgScale = interpolate(frame, [0, durationInFrames - 1], [1.03, 1.07], {extrapolateRight: 'clamp'});
  // MultiplaneReal：三层深度按 0.35 / 0.7 / 1.4 系数视差漂移（极慢，观众不应主动注意到）
  const drive = multiplaneDrive(frame, 900, 60);
  // 两团光：周期 11s / 17s，位移幅度 ~140px，永不同步
  const breathe = 0.09 + Math.sin(frame / 200) * 0.02;
  return (
    <>
      {/* 常驻背景板（2026-09-02 Scott：要一张高级的常驻底色）：极慢推拉 + 视差漂移；原片模糊层只留一点呼吸 */}
      {plate ? (
        <div style={{position: 'absolute', inset: -80, transform: `translateX(${drive * MULTIPLANE.back}px) scale(${bgScale})`}}>
          <Img src={staticFile(plate)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: -60, transform: `translateX(${drive * MULTIPLANE.back}px) scale(${bgScale})`, opacity: SKIN === 'studio' ? 0.55 : plate ? 0.07 : 0.14, filter: SKIN === 'studio' ? 'blur(40px) saturate(.8) brightness(.55)' : 'blur(48px) saturate(.6) brightness(.5)'}}>
        <OffthreadVideo src={staticFile(media)} startFrom={startFrom} muted style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 38%'}} />
      </div>
      <div style={{position: 'absolute', inset: 0, background: SKIN === 'studio' ? 'rgba(11,22,48,.28)' : SKIN === 'blueprint' ? 'rgba(7,11,20,.8)' : SKIN === 'paper' ? 'rgba(18,17,16,.84)' : plate ? 'rgba(10,10,12,.42)' : 'rgba(10,10,12,.8)'}} />
      {/* 一道极慢的斜向光扫（周期 ~45s），让底色活着但不抢戏 */}
      {plate ? <div style={{position: 'absolute', top: -200, bottom: -200, width: 1100, left: -1100 + ((frame * 2.6) % 4200), background: 'linear-gradient(105deg, rgba(243,239,230,0) 0%, rgba(243,239,230,.035) 50%, rgba(243,239,230,0) 100%)'}} /> : null}
      {/* 第二道反向、更慢的光扫 + 一团缓慢漂移的暖雾：背景任何时刻都有两个不同周期的东西在动 */}
      {plate ? <div style={{position: 'absolute', top: -200, bottom: -200, width: 900, left: 2400 - ((frame * 1.7) % 4000), background: 'linear-gradient(75deg, rgba(214,178,94,0) 0%, rgba(214,178,94,.03) 50%, rgba(214,178,94,0) 100%)'}} /> : null}
      {plate ? <div style={{position: 'absolute', left: 200 + Math.sin(frame / 430) * 260 + drive * MULTIPLANE.mid, top: 120 + Math.cos(frame / 610) * 140, width: 1400, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(243,239,230,.05), rgba(243,239,230,0) 60%)', filter: 'blur(40px)'}} /> : null}
      {SKIN === 'blueprint' ? (
        <>
          <div style={{position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(143,211,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(143,211,255,.07) 1px, transparent 1px)', backgroundSize: '96px 96px', backgroundPosition: `${(frame * 0.15) % 96}px 0`}} />
          <div style={{position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(143,211,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(143,211,255,.04) 1px, transparent 1px)', backgroundSize: '24px 24px'}} />
        </>
      ) : null}
      {/* 一盏顶灯：慢速左右游移，是画面唯一的主光；底部渐暗压出舞台深度（studio 不用） */}
      {SKIN === 'studio' ? null : <div style={{position: 'absolute', left: 300 + Math.sin(frame / 520) * 120, top: -720, width: 1560, height: 1560, borderRadius: '50%', background: SKIN === 'blueprint' ? `radial-gradient(circle, rgba(170,205,255,${(0.04 + breathe * 0.2).toFixed(3)}), rgba(170,205,255,0) 60%)` : `radial-gradient(circle, rgba(243,239,230,${(0.045 + breathe * 0.2).toFixed(3)}), rgba(243,239,230,0) 60%)`}} />}
      {SKIN === 'studio' ? null : <div style={{position: 'absolute', left: 1100 + Math.cos(frame / 640) * 160 + drive * MULTIPLANE.mid, top: 420 + Math.sin(frame / 560) * 90, width: 1200, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(214,178,94,.05), rgba(214,178,94,0) 62%)'}} />}
      {SKIN === 'glass' ? <Contours frame={frame} /> : null}
      {SKIN === 'stage3d' ? <DotField frame={frame} /> : null}
      {SKIN === 'stage3d' ? <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0}}><defs><pattern id="diag" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><rect width="46" height="120" fill="rgba(255,255,255,.025)" /></pattern></defs><rect width={CANVAS.w} height={CANVAS.h} fill="url(#diag)" /></svg> : null}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 460, background: SKIN === 'blueprint' ? 'linear-gradient(180deg, rgba(7,11,20,0), rgba(7,11,20,.85))' : SKIN === 'paper' ? 'linear-gradient(180deg, rgba(18,17,16,0), rgba(18,17,16,.85))' : 'linear-gradient(180deg, rgba(5,5,6,0), rgba(5,5,6,.82))'}} />
      {SKIN === 'paper' ? <div style={{position: 'absolute', inset: -80, backgroundImage: NOISE, backgroundSize: '220px 220px', opacity: 0.42, mixBlendMode: 'overlay', transform: `translateX(${drive * MULTIPLANE.front * 0.3}px)`}} /> : null}
      {SKIN === 'paper' ? <div style={{position: 'absolute', left: -200 + Math.sin(frame / 400) * 60, top: -300, width: 1400, height: 1400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(228,178,90,.10), rgba(228,178,90,0) 62%)'}} /> : null}
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,.28) 100%)'}} />
    </>
  );
};

// 字幕关键词加重：plan.keywords 里的词在字幕中以强调色 + 800 字重显示（小Lin 式口播点缀）
const emphasize = (text: string, keywords?: string[]) => {
  if (!keywords?.length) return text;
  const re = new RegExp(`(${keywords.filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((part, i) => (keywords.includes(part) ? <span key={i} style={{color: SKIN === 'stage3d' || SKIN === 'studio' ? ACCENT : '#E3C778', fontWeight: 800}}>{part}</span> : part));
};

export const Captions: React.FC<{frame: number; fps: number; captions: CaptionLine[]; keywords?: string[]; bottom?: number}> = ({frame, fps, captions, keywords, bottom}) => {
  const line = captions.find((c) => frame >= c.s && frame < c.e);
  if (!line) return null;
  const fade = Math.min(progress(frame, line.s, line.s + 4), 1 - progress(frame, line.e - 4, line.e));
  return (
    <div
      style={{
        position: 'absolute',
        left: PORTRAIT ? 60 : 150,
        right: PORTRAIT ? 60 : 150,
        bottom: bottom ?? (PORTRAIT ? 420 : 34), // 竖屏：字幕落在 y≈1400–1500，避开 split 面板底边 1374 与抖音底部 UI（2026-09-08）；lecture 版式由分镜给 captionBottom，落到胸口不压五官（2026-09-12）
        minHeight: 132,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#FFFFFF',
        fontFamily: FONT,
        fontSize: PORTRAIT ? 52 : 56,
        fontWeight: 750,
        lineHeight: 1.16,
        letterSpacing: '-0.025em',
        textShadow: '0 3px 3px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.7)',
        opacity: fade,
        zIndex: 80,
      }}
    >
      {emphasize(line.t, keywords)}
    </div>
  );
};

export const StageRoot: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{position: 'absolute', inset: 0, background: BG, overflow: 'hidden'}}>{children}</div>
);
