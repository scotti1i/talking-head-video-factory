// ============================================================
// 地图定位：暗色经纬网格 + 标记点涟漪 + 弧线航线（跨境 / 发货地 / 市场）。
// 有真实地图截图（image）则铺底图，没有就用抽象网格球面——不伪造地理细节。
// 坐标是 1920×1080 舞台坐标，由分镜给（例：中国 ~ x1350,y430；美西 ~ x430,y400）。
// ============================================================
import React from 'react';
import {Img, staticFile, spring, useVideoConfig} from 'remotion';
import type {MapSceneType} from './Plan';
import {ACCENT, FONT, INK, RED, contentRect, outCubic, progress, stageOpacity, surface} from './theme';
import {CANVAS} from './Canvas';

export const MapScene: React.FC<{frame: number; scene: MapSceneType}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const first = Math.min(...scene.markers.map((m) => m.at));
  if (frame < first - 12 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const stage = stageOpacity(frame, scene.start, scene.end);
  const pos = Object.fromEntries(scene.markers.map((m) => [m.id, m]));
  const enter = progress(frame, first - 10, first + 8, outCubic);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stage, zIndex: 16}}>
      <div style={{position: 'absolute', left: rect.x + 30, top: rect.y + 40, width: rect.w - 60, height: rect.h - 80, borderRadius: 26, overflow: 'hidden', border: '1px solid rgba(255,255,255,.16)', background: '#101014', opacity: enter}}>
        {scene.image ? <Img src={staticFile(scene.image)} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85}} /> : (
          <svg width="100%" height="100%" viewBox={`0 0 ${rect.w - 60} ${rect.h - 80}`}>
            {Array.from({length: 13}).map((_, i) => <line key={`v${i}`} x1={(i * (rect.w - 60)) / 12} y1={0} x2={(i * (rect.w - 60)) / 12} y2={rect.h - 80} stroke="rgba(245,245,247,.07)" strokeWidth={1} />)}
            {Array.from({length: 7}).map((_, i) => <path key={`h${i}`} d={`M 0 ${(i * (rect.h - 80)) / 6} Q ${(rect.w - 60) / 2} ${(i * (rect.h - 80)) / 6 + (i - 3) * 14} ${rect.w - 60} ${(i * (rect.h - 80)) / 6}`} fill="none" stroke="rgba(245,245,247,.07)" strokeWidth={1} />)}
          </svg>
        )}
      </div>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {(scene.arcs ?? []).map((arc, i) => {
          const a = pos[arc.from]; const b = pos[arc.to];
          if (!a || !b || frame < arc.at) return null;
          const draw = progress(frame, arc.at, arc.at + 26, outCubic);
          const mx = (a.x + b.x) / 2; const my = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
          const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
          const len = Math.hypot(b.x - a.x, b.y - a.y) * 1.25;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} opacity={0.9} />
              {draw >= 0.99 ? <circle cx={b.x} cy={b.y} r={5} fill={ACCENT} /> : null}
            </g>
          );
        })}
        {scene.markers.map((m) => {
          if (frame < m.at) return null;
          const pop = spring({frame: frame - m.at, fps, config: {damping: 10, stiffness: 200}});
          const ringT = ((frame - m.at) % 50) / 50;
          const color = m.tone === 'red' ? RED : ACCENT;
          return (
            <g key={m.id}>
              <circle cx={m.x} cy={m.y} r={10 + ringT * 30} fill="none" stroke={color} strokeWidth={2} opacity={(1 - ringT) * 0.5 * pop} />
              <circle cx={m.x} cy={m.y} r={9 * pop} fill={color} stroke="#0B0B0D" strokeWidth={3} />
            </g>
          );
        })}
      </svg>
      {scene.markers.map((m) => {
        if (frame < m.at) return null;
        const pop = spring({frame: frame - m.at, fps, config: {damping: 12, stiffness: 180}});
        return <div key={m.id} style={{position: 'absolute', left: m.x + 20, top: m.y - 24, padding: '7px 16px', ...surface('glass', {radius: 999}), fontFamily: FONT, fontSize: 25, fontWeight: 600, color: INK, opacity: pop, transform: `translateY(${(1 - pop) * 10}px)`, whiteSpace: 'nowrap', zIndex: 17}}>{m.label}</div>;
      })}
    </div>
  );
};
