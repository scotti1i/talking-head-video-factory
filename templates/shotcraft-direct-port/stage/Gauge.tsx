// ============================================================
// 计数表盘：270° 弧随数值扫过，中央大数字滚动；超阈值可变红。百分比 / 进度 / 利用率。
// ============================================================
import React from 'react';
import type {GaugeScene} from './Plan';
import {ACCENT, FONT, INK, RED, contentRect, outCubic, progress, stageOpacity} from './theme';
import {CANVAS} from './Canvas';

export const Gauge: React.FC<{frame: number; scene: GaugeScene}> = ({frame, scene}) => {
  if (frame < scene.at - 8 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 - 20;
  const R = 220;
  const max = scene.max ?? 100;
  const p = progress(frame, scene.at, scene.at + 40, outCubic) * Math.min(1, scene.value / max);
  const hot = scene.tone === 'red';
  const color = hot ? RED : ACCENT;
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5 * p;
  const x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0);
  const x2 = cx + R * Math.cos(a0 + sweep), y2 = cy + R * Math.sin(a0 + sweep);
  const shown = scene.display ? scene.display : `${Math.round(scene.value * progress(frame, scene.at, scene.at + 40, outCubic))}${scene.unit ?? '%'}`;
  const stage = stageOpacity(frame, scene.at, scene.end, 12, 16);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0}}>
        <path d={`M ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 1 1 ${cx + R * Math.cos(a0 + Math.PI * 1.5)} ${cy + R * Math.sin(a0 + Math.PI * 1.5)}`} fill="none" stroke="rgba(245,245,247,.14)" strokeWidth={22} strokeLinecap="round" />
        {p > 0.01 ? <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={22} strokeLinecap="round" /> : null}
        <circle cx={x2} cy={y2} r={16} fill={color} />
      </svg>
      <div style={{position: 'absolute', left: cx - 300, top: cy - 70, width: 600, textAlign: 'center', fontFamily: FONT, fontSize: 128, fontWeight: 800, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', color: hot ? RED : INK}}>{shown}</div>
      {scene.label ? <div style={{position: 'absolute', left: cx - 300, top: cy + 78, width: 600, textAlign: 'center', fontFamily: FONT, fontSize: 32, fontWeight: 600, color: 'rgba(245,245,247,.72)'}}>{scene.label}</div> : null}
    </div>
  );
};
