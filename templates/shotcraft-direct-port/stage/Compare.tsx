// ============================================================
// 前后对比：左「以前」右「以后」两块面板并排，逐行揭示，中间一个箭头，最后可落判定。
// 用于"以前是 X，以后是 Y"的结构；不是二分（二分是同一对象的两个概念）。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {ComparePanel, CompareScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, FONT, INK, ON_ACCENT, accentPill, contentRect, outCubic, progress, stageOpacity, surface, toneColor} from './theme';
import {PORTRAIT} from './Canvas';
import {blurSlide} from './motions';

const Panel: React.FC<{frame: number; panel: ComparePanel; x: number; y: number; w: number; h: number; after: boolean; fps: number}> = ({frame, panel, x, y, w, h, after, fps}) => {
  if (frame < panel.at) return null;
  const pop = spring({frame: frame - panel.at, fps, config: {damping: 12, stiffness: 160}});
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, ...surface('glass', {radius: 28, accent: after}), opacity: pop * (after ? 1 : 0.86), transform: `translateZ(${(after ? 90 : 20) + Math.sin(frame / 34 + (after ? 1 : 0)) * 6}px) translateY(${(1 - pop) * 20}px)`, padding: '30px 34px', boxSizing: 'border-box'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18}}>
        {panel.image || panel.glyph ? <Object3 image={panel.image} kind={panel.glyph ?? 'none'} active={after} size={panel.image ? 48 : 40} /> : null}
        <div style={{fontFamily: FONT, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: after ? ACCENT : INK}}>{panel.title}</div>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        {panel.lines.map((ln, i) => {
          if (frame < ln.at) return null;
          const bs = blurSlide(frame, ln.at, 14, 22);
          return <div key={i} style={{fontFamily: FONT, fontSize: 34, fontWeight: 600, lineHeight: 1.35, color: after ? INK : 'rgba(245,245,247,.72)', ...bs}}>{ln.text}</div>;
        })}
      </div>
    </div>
  );
};

export const Compare: React.FC<{frame: number; scene: CompareScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  if (frame < scene.start - 20 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const gap = PORTRAIT ? 70 : 110;
  const w = (rect.w - 40 - gap) / 2;
  const y = PORTRAIT ? rect.y : 210;
  const h = PORTRAIT ? rect.h - 70 : 480;
  const lx = rect.x + 20;
  const rx = lx + w + gap;
  const arrowIn = progress(frame, scene.right.at - 6, scene.right.at + 12, outCubic);
  const stage = stageOpacity(frame, scene.start, scene.end);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16, transformStyle: 'preserve-3d'}}>
      <Panel frame={frame} panel={scene.left} x={lx} y={y} w={w} h={h} after={false} fps={fps} />
      <div style={{position: 'absolute', left: lx + w + gap / 2 - 30, top: y + h / 2 - 30, width: 60, height: 60, borderRadius: 30, ...surface('fill', {radius: 999, accent: true}), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 32, fontWeight: 800, color: ON_ACCENT, opacity: arrowIn, transform: `scale(${0.6 + arrowIn * 0.4})`}}>→</div>
      <Panel frame={frame} panel={scene.right} x={rx} y={y} w={w} h={h} after fps={fps} />
      {scene.verdict && frame >= scene.verdict.at ? (() => {
        const p = spring({frame: frame - scene.verdict!.at, fps, config: {damping: 9, stiffness: 220}});
        return <div style={{position: 'absolute', left: rect.x + rect.w / 2, top: PORTRAIT ? rect.y + rect.h - 46 : 770, transform: `translateX(-50%) scale(${p})`, padding: '10px 24px', ...accentPill(scene.verdict!.tone ?? 'accent'), color: scene.verdict!.tone === 'red' ? toneColor('red') : undefined, fontFamily: FONT, fontSize: 30, fontWeight: 800, whiteSpace: 'nowrap'}}>{scene.verdict!.text}</div>;
      })() : null}
    </div>
  );
};
