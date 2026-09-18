// ============================================================
// 时间线：横向导轨，里程碑上下交错出现，导轨随口播填到当前里程碑；红色里程碑 = 事故点。
// 与「关系图」的区别：这是时间顺序，不是因果连线；与「阶梯」的区别：不抬升，只推进。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {TimelineScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, FONT, INK, ON_ACCENT, RED, contentRect, inCubic, outCubic, progress, stageOpacity, surface, toneColor} from './theme';
import {CANVAS} from './Canvas';

const CARD_H = 150;
// 卡宽随文字自适应：中文 1 单位、拉丁 0.55 单位 × 28px 字号 + 图标 + 内边距，最窄 300（2026-09-04 Scott：「Facebook / TikTok 送流量」溢出）
const textUnits = (s: string) => [...s].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 1 : 0.55), 0);
const cardWidth = (m: {label: string; sub?: string; image?: string; glyph?: string}) => Math.max(300, Math.ceil(Math.max(textUnits(m.label) * 28, (m.sub ? textUnits(m.sub) * 20 : 0)) + (m.image || m.glyph ? (m.image ? 44 : 40) + 14 : 0) + 36 + 32));

export const Timeline: React.FC<{frame: number; scene: TimelineScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  if (frame < scene.start - 20 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const n = scene.milestones.length;
  const x0 = rect.x + 200;
  const x1 = rect.x + rect.w - 200;
  const railY = 470;
  const xs = scene.milestones.map((_, i) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)));
  const latest = scene.milestones.reduce((acc, m, i) => (frame >= m.at ? i : acc), -1);
  const fill = latest < 0 ? 0 : xs[latest] + (latest + 1 < n ? (xs[latest + 1] - xs[latest]) * progress(frame, scene.milestones[latest].at, scene.milestones[latest + 1]?.at ?? scene.end, outCubic) * 0.0 : 0);
  const stage = stageOpacity(frame, scene.start, scene.end);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16, transformStyle: 'preserve-3d'}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {/* 导轨随第一个里程碑一起出现，不在空板子上先画一根线（2026-09-04） */}
        {latest >= 0 ? <line x1={x0} y1={railY} x2={x0 + (x1 - x0) * progress(frame, scene.milestones[0].at, scene.milestones[0].at + 18, outCubic)} y2={railY} stroke="rgba(243,239,230,.16)" strokeWidth={2} /> : null}
        {latest >= 0 ? <line x1={x0} y1={railY} x2={Math.max(x0, fill)} y2={railY} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" /> : null}
        {scene.milestones.map((m, i) => {
          if (frame < m.at) return null;
          const pop = spring({frame: frame - m.at, fps, config: {damping: 11, stiffness: 190}});
          const color = m.tone === 'red' ? RED : ACCENT;
          return (
            <g key={m.id}>
              <circle cx={xs[i]} cy={railY} r={16 * pop} fill="#0A0A0C" stroke={color} strokeWidth={3} />
              <circle cx={xs[i]} cy={railY} r={6 * pop} fill={color} />
              <line x1={xs[i]} y1={i % 2 === 0 ? railY - 20 : railY + 20} x2={xs[i]} y2={i % 2 === 0 ? railY - 60 * pop : railY + 60 * pop} stroke={color} strokeWidth={2} opacity={0.8} />
            </g>
          );
        })}
      </svg>
      {scene.milestones.map((m, i) => {
        if (frame < m.at) return null;
        const pop = spring({frame: frame - m.at, fps, config: {damping: 11, stiffness: 190}});
        const above = i % 2 === 0;
        const active = i === latest ? 1 : 0;
        const top = above ? railY - 60 - CARD_H : railY + 60;
        const cardW = cardWidth(m);
        return (
          <div key={m.id} style={{position: 'absolute', left: xs[i] - cardW / 2, top, width: cardW, height: CARD_H, ...surface(active ? 'fill' : 'glass', {radius: 22, active, accent: m.tone === 'red' ? false : active > 0}), boxShadow: m.tone === 'red' && active ? `inset 0 0 0 1px ${RED}, inset 0 0 0 5px #1C1C22, inset 0 0 0 6px rgba(255,255,255,.11)` : undefined, opacity: pop * (i < latest ? 0.7 : 1), transform: `translateZ(${(above ? 70 : 30) + active * 90 + Math.sin(frame / 34 + i) * 6}px) translateY(${(1 - pop) * (above ? -16 : 16)}px)`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px'}}>
            {m.image || m.glyph ? <Object3 image={m.image} kind={m.glyph ?? 'none'} active={active > 0} size={m.image ? 44 : 40} /> : null}
            <div style={{minWidth: 0}}>
              <div style={{fontFamily: FONT, fontSize: 28, fontWeight: 700, lineHeight: 1.15, color: m.tone === 'red' ? RED : active ? ON_ACCENT : INK, whiteSpace: 'nowrap'}}>{m.label}</div>
              {m.sub ? <div style={{fontFamily: FONT, fontSize: 20, fontWeight: 500, color: active ? 'rgba(20,20,22,.7)' : 'rgba(245,245,247,.62)', marginTop: 4, whiteSpace: 'nowrap'}}>{m.sub}</div> : null}
            </div>
          </div>
        );
      })}
      {scene.note && frame >= scene.note.at ? (() => {
        const inP = progress(frame, scene.note!.at, scene.note!.at + 14, outCubic);
        const out = scene.note!.until ? progress(frame, scene.note!.until, scene.note!.until + 12, inCubic) : 0;
        return <div style={{position: 'absolute', left: rect.x + rect.w / 2, top: 760, transform: `translateX(-50%) translateY(${(1 - inP) * 18}px)`, padding: '10px 22px', ...surface(scene.note!.tone === 'accent' ? 'fill' : 'glass', {radius: 999, accent: scene.note!.tone === 'accent'}), color: scene.note!.tone === 'accent' ? ON_ACCENT : toneColor(scene.note!.tone, INK), fontFamily: FONT, fontSize: 28, fontWeight: 600, opacity: inP * (1 - out), whiteSpace: 'nowrap'}}>{scene.note!.text}</div>;
      })() : null}
    </div>
  );
};
