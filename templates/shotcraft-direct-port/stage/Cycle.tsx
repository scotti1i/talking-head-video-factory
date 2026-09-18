// ============================================================
// 循环：节点沿圆环按口播逐个出现，弧线箭头首尾相接（最后一段合环），可有中心枢纽。
// 用于"A 推动 B、B 又回到 A"的闭环逻辑；不是流程也不是汇流。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {CycleScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, FONT, INK, ON_ACCENT, contentRect, inCubic, outCubic, progress, stageOpacity, surface, toneColor} from './theme';
import {CANVAS} from './Canvas';

const NODE = 168;
const RADIUS = 250;
const GAP = 0.36; // 弧线两端离节点中心的角度留白（弧度）

export const Cycle: React.FC<{frame: number; scene: CycleScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  if (frame < scene.start - 20 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 - 10;
  const n = scene.nodes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pos = (i: number) => ({x: cx + Math.cos(angle(i)) * RADIUS, y: cy + Math.sin(angle(i)) * RADIUS});
  const latest = scene.nodes.reduce((acc, nd, i) => (frame >= nd.at ? i : acc), -1);
  const closeAt = scene.closeAt ?? scene.nodes[n - 1].at + 18;
  const stage = stageOpacity(frame, scene.start, scene.end);
  const arc = (i: number, j: number) => {
    const a0 = angle(i) + GAP;
    const a1 = angle(j) - GAP + (j < i ? 2 * Math.PI : 0);
    const p0 = {x: cx + Math.cos(a0) * RADIUS, y: cy + Math.sin(a0) * RADIUS};
    const p1 = {x: cx + Math.cos(a1) * RADIUS, y: cy + Math.sin(a1) * RADIUS};
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return {d: `M ${p0.x} ${p0.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${p1.x} ${p1.y}`, len: (a1 - a0) * RADIUS};
  };
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16, transformStyle: 'preserve-3d'}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <defs>
          <marker id={`cyc-arrow-${scene.id}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={ACCENT} />
          </marker>
        </defs>
        <circle cx={cx} cy={cy} r={RADIUS} fill="none" stroke="rgba(243,239,230,.08)" strokeWidth={1.5} strokeDasharray="4 10" />
        {scene.nodes.map((nd, i) => {
          const j = (i + 1) % n;
          const at = j === 0 ? closeAt : scene.nodes[j].at;
          const draw = progress(frame, at - 8, at + 16, outCubic);
          if (draw <= 0) return null;
          const {d, len} = arc(i, j);
          return <path key={nd.id} d={d} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} markerEnd={draw >= 0.98 ? `url(#cyc-arrow-${scene.id})` : undefined} opacity={0.9} />;
        })}
      </svg>
      {scene.nodes.map((nd, i) => {
        if (frame < nd.at) return null;
        const pop = spring({frame: frame - nd.at, fps, config: {damping: 11, stiffness: 170}});
        const active = i === latest ? 1 : 0;
        const p = pos(i);
        return (
          <div key={nd.id} style={{position: 'absolute', left: p.x - NODE / 2, top: p.y - NODE / 2, width: NODE, height: NODE, ...surface(active ? 'fill' : 'glass', {radius: 999, active, accent: active > 0}), opacity: pop, transform: `translateZ(${(i % 3) * 32 + active * 80 + Math.sin(frame / 34 + i) * 6}px) scale(${0.85 + pop * 0.15})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2}}>
            <Object3 image={nd.image} kind={nd.glyph ?? 'none'} active={active > 0} size={nd.image ? 54 : 48} />
            <div style={{fontFamily: FONT, fontSize: 26, fontWeight: 600, whiteSpace: 'nowrap', color: active ? ON_ACCENT : INK}}>{nd.label}</div>
          </div>
        );
      })}
      {scene.hub && frame >= scene.hub.at ? (() => {
        const pop = spring({frame: frame - scene.hub!.at, fps, config: {damping: 11, stiffness: 170}});
        return (
          <div style={{position: 'absolute', left: cx - 110, top: cy - 100, width: 220, height: 200, ...surface('glass', {radius: 28}), opacity: pop, transform: `scale(${0.9 + pop * 0.1})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4}}>
            <Object3 image={scene.hub!.image} kind={scene.hub!.glyph ?? 'none'} size={scene.hub!.image ? 80 : 64} />
            <div style={{fontFamily: FONT, fontSize: 30, fontWeight: 700, color: INK, whiteSpace: 'nowrap'}}>{scene.hub!.label}</div>
          </div>
        );
      })() : null}
      {scene.note && frame >= scene.note.at ? (() => {
        const inP = progress(frame, scene.note!.at, scene.note!.at + 14, outCubic);
        const out = scene.note!.until ? progress(frame, scene.note!.until, scene.note!.until + 12, inCubic) : 0;
        return <div style={{position: 'absolute', left: cx, top: 770, transform: `translateX(-50%) translateY(${(1 - inP) * 18}px)`, padding: '10px 22px', ...surface(scene.note!.tone === 'accent' ? 'fill' : 'glass', {radius: 999, accent: scene.note!.tone === 'accent'}), color: scene.note!.tone === 'accent' ? ON_ACCENT : toneColor(scene.note!.tone, INK), fontFamily: FONT, fontSize: 28, fontWeight: 600, opacity: inP * (1 - out), whiteSpace: 'nowrap'}}>{scene.note!.text}</div>;
      })() : null}
    </div>
  );
};
