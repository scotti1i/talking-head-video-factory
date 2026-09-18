// ============================================================
// 递进阶梯：步骤沿对角线逐级抬升（左下 → 右上），台阶式导轨随口播点亮，
// 当前级用强调面、已过级降暗；最后一级可挂判定徽章。编号编码的是真实顺序。
// 运动源码：DiagramCascadeBuild 的弹簧（damping 11 / stiffness 170）+ 导轨描线。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {LadderScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, FONT, INK, ON_ACCENT, accentPill, contentRect, inCubic, outCubic, progress, stageOpacity, surface, toneColor} from './theme';
import {CANVAS, PORTRAIT} from './Canvas';

const TILE_W = 246;

export const Ladder: React.FC<{frame: number; scene: LadderScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  if (frame < scene.start - 20 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const n = scene.steps.length;
  const hasImage = scene.steps.some((s) => s.image);
  const tileH = PORTRAIT ? 72 : hasImage ? 216 : 172;
  const tileW = PORTRAIT ? rect.w : TILE_W;
  const dx = Math.min(330, (rect.w - 120 - TILE_W) / Math.max(1, n - 1));
  const dy = Math.min(150, 420 / Math.max(1, n - 1));
  const spanW = TILE_W + dx * (n - 1);
  const x0 = rect.x + (rect.w - spanW) / 2 + TILE_W / 2;
  const y0 = 700;
  // 竖屏：一行一步，从上往下，占下区 y 1000–1360（最多 4 步）
  const centers = PORTRAIT ? scene.steps.map((_, i) => ({x: rect.x + rect.w / 2, y: rect.y + 36 + i * 76})) : scene.steps.map((_, i) => ({x: x0 + i * dx, y: y0 - i * dy}));
  const latest = scene.steps.reduce((acc, s, i) => (frame >= s.at ? i : acc), -1);
  const stage = stageOpacity(frame, scene.start, scene.end);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16, transformStyle: 'preserve-3d'}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {PORTRAIT ? null : scene.steps.slice(1).map((step, i) => {
          const a = centers[i];
          const b = centers[i + 1];
          // 台阶式导轨：从上一级右缘水平走到下一级中线，再向上接到下一级底边
          const d = `M ${a.x + TILE_W / 2 + 6} ${a.y} H ${b.x} V ${b.y + tileH / 2 + 6}`;
          const len = Math.abs(b.x - (a.x + TILE_W / 2 + 6)) + Math.abs(a.y - (b.y + tileH / 2 + 6));
          const draw = progress(frame, step.at - 8, step.at + 14, outCubic);
          if (draw <= 0) return null;
          return (
            <g key={step.id}>
              <path d={d} fill="none" stroke="rgba(243,239,230,.16)" strokeWidth={2} />
              <path d={d} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} opacity={0.9} />
            </g>
          );
        })}
      </svg>
      {scene.steps.map((step, i) => {
        if (frame < step.at) return null;
        const pop = spring({frame: frame - step.at, fps, config: {damping: 11, stiffness: 170}});
        const active = i === latest ? 1 : 0;
        const passed = i < latest ? 1 : 0;
        const c = centers[i];
        return (
          <div key={step.id} style={{position: 'absolute', left: c.x - tileW / 2, top: c.y - tileH / 2, width: tileW, height: tileH, ...surface(active ? 'fill' : 'glass', {radius: 24, active, accent: active > 0}), opacity: pop * (1 - passed * 0.3), transform: `translateZ(${i * 34 + active * 90 + Math.sin(frame / 34 + i) * 6}px) scale(${0.9 + pop * 0.1}) translateY(${(1 - pop) * 24}px)`, display: 'flex', flexDirection: PORTRAIT ? 'row' : 'column', alignItems: 'center', justifyContent: PORTRAIT ? 'flex-start' : 'center', gap: PORTRAIT ? 16 : 2, paddingLeft: PORTRAIT ? 72 : 0, boxSizing: 'border-box'}}>
            <div style={{position: 'absolute', left: 14, top: 10, fontFamily: FONT, fontSize: 20, fontWeight: 700, color: active ? ON_ACCENT : ACCENT, letterSpacing: '0.04em', opacity: 0.9}}>{String(i + 1).padStart(2, '0')}</div>
            <Object3 image={step.image} kind={step.glyph ?? 'none'} active={active > 0} size={PORTRAIT ? 44 : step.image ? 78 : 64} />
            <div style={{fontFamily: FONT, fontSize: 30, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap', color: active ? ON_ACCENT : INK}}>{step.label}</div>
            {step.sub ? <div style={{fontFamily: FONT, fontSize: 20, fontWeight: 500, color: active ? 'rgba(20,20,22,.7)' : 'rgba(245,245,247,.6)'}}>{step.sub}</div> : null}
            {i === n - 1 && scene.verdict && frame >= scene.verdict.at ? (() => {
              const bp = spring({frame: frame - scene.verdict!.at, fps, config: {damping: 9, stiffness: 220}});
              return <div style={{position: 'absolute', right: -18, bottom: -16, padding: '6px 14px', ...accentPill(scene.verdict!.tone ?? 'accent'), fontFamily: FONT, fontSize: 22, fontWeight: 700, transform: `scale(${bp})`, whiteSpace: 'nowrap'}}>{scene.verdict!.text}</div>;
            })() : null}
          </div>
        );
      })}
      {scene.note && frame >= scene.note.at ? (() => {
        const inP = progress(frame, scene.note!.at, scene.note!.at + 14, outCubic);
        const out = scene.note!.until ? progress(frame, scene.note!.until, scene.note!.until + 12, inCubic) : 0;
        const color = scene.note!.tone === 'accent' ? ON_ACCENT : toneColor(scene.note!.tone, INK);
        return <div style={{position: 'absolute', left: rect.x + rect.w / 2, top: PORTRAIT ? rect.y + rect.h - 24 : 760, transform: `translateX(-50%) translateY(${(1 - inP) * 18}px)`, padding: '10px 22px', ...surface(scene.note!.tone === 'accent' ? 'fill' : 'glass', {radius: 999, accent: scene.note!.tone === 'accent'}), color, fontFamily: FONT, fontSize: 28, fontWeight: 600, opacity: inP * (1 - out), whiteSpace: 'nowrap'}}>{scene.note!.text}</div>;
      })() : null}
    </div>
  );
};
