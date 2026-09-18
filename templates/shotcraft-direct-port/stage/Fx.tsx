// ============================================================
// 事件点缀：只在“发生了新事件”时出现（新节点建立、对错判定），不做持续装饰
// 一次冲击环 + 六粒短促尘点，16f 内结束；来源于 impact-feedback 的“撞停即撤”节拍
// ============================================================
import React from 'react';
import {ACCENT, RED, progress, outCubic} from './theme';
import {CANVAS} from './Canvas';

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const Impact: React.FC<{frame: number; at: number; x: number; y: number; tone?: 'accent' | 'red'; radius?: number}> = ({
  frame,
  at,
  x,
  y,
  tone = 'accent',
  radius = 92,
}) => {
  if (frame < at || frame > at + 18) return null;
  const t = progress(frame, at, at + 16, outCubic);
  const color = tone === 'red' ? RED : ACCENT;
  const ring = 22 + t * radius;
  return (
    <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30}}>
      <circle cx={x} cy={y} r={ring} fill="none" stroke={color} strokeWidth={4 * (1 - t) + 1} opacity={(1 - t) * 0.75} />
      {Array.from({length: 6}).map((_, i) => {
        const ang = (i / 6) * Math.PI * 2 + rand(i + at) * 0.6;
        const dist = 30 + t * (radius + 30) * (0.7 + rand(i * 3 + at) * 0.5);
        return <circle key={i} cx={x + Math.cos(ang) * dist} cy={y + Math.sin(ang) * dist} r={4 * (1 - t) + 1} fill={color} opacity={(1 - t) * 0.9} />;
      })}
    </svg>
  );
};
