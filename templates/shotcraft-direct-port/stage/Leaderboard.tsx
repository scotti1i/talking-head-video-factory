// ============================================================
// 排行榜 / 柱状对比：行按口播出现，横向条按最大值归一化生长，数值滚动；highlight 行用强调实底。
// 用于平台对比、价格对比、份额排序（2026-09-03 Scott 勾选）。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {LeaderboardScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, FONT, INK, ON_ACCENT, RED, contentRect, outCubic, progress, stageOpacity, surface} from './theme';

export const Leaderboard: React.FC<{frame: number; scene: LeaderboardScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const first = Math.min(...scene.rows.map((r) => r.at));
  if (frame < first - 12 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const max = Math.max(...scene.rows.map((r) => r.value));
  const n = scene.rows.length;
  const rowH = Math.min(120, (rect.h - 200) / n);
  const y0 = rect.y + 120 + (rect.h - 200 - rowH * n) / 2;
  const x0 = rect.x + 60;
  const w = rect.w - 120;
  const stage = stageOpacity(frame, scene.start, scene.end);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16, transformStyle: 'preserve-3d'}}>
      {scene.title ? <div style={{position: 'absolute', left: x0, top: rect.y + 40, fontFamily: FONT, fontSize: 34, fontWeight: 700, color: INK, opacity: progress(frame, first - 8, first + 6, outCubic)}}>{scene.title}</div> : null}
      {scene.rows.map((row, i) => {
        if (frame < row.at) return null;
        const pop = spring({frame: frame - row.at, fps, config: {damping: 12, stiffness: 170}});
        const grow = progress(frame, row.at + 4, row.at + 26, outCubic);
        const hot = scene.highlight === i;
        const barW = Math.max(64, (w - 420) * (row.value / max) * grow);
        const shown = row.display ?? String(Math.round(row.value * grow));
        return (
          <div key={i} style={{position: 'absolute', left: x0, top: y0 + i * rowH, width: w, height: rowH - 16, opacity: pop, transform: `translateZ(${(hot ? 70 : 20) + Math.sin(frame / 34 + i) * 5}px) translateY(${(1 - pop) * 16}px)`, display: 'flex', alignItems: 'center', gap: 18}}>
            <div style={{width: 44, fontFamily: FONT, fontSize: 26, fontWeight: 800, color: hot ? ACCENT : 'rgba(245,245,247,.5)', textAlign: 'right'}}>{i + 1}</div>
            {row.image ? <Object3 image={row.image} kind="none" size={40} /> : null}
            <div style={{width: 240, fontFamily: FONT, fontSize: 29, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden'}}>{row.label}</div>
            <div style={{height: Math.min(56, rowH - 40), width: barW, borderRadius: 12, ...(hot ? surface('fill', {radius: 12, accent: true}) : {background: row.tone === 'red' ? `linear-gradient(90deg, ${RED}, #8E2634)` : 'linear-gradient(90deg,#3A3A44,#26262E)', border: '1px solid rgba(255,255,255,.14)'})}} />
            <div style={{fontFamily: FONT, fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: hot ? ACCENT : INK}}>{shown}</div>
          </div>
        );
      })}
    </div>
  );
};
