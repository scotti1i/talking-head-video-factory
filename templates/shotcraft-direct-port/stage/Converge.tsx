// ============================================================
// 多来源沿贝塞尔路径汇流到同一结果（BezierSourceConvergeMerge 直接移植）：
// 预计算弧长 → 路径 draw-on → 来源沿路径汇聚并收缩 → 结果脉冲 → 可选反向擦除。
// 时间改为绝对帧，让每个来源在口播说到它时才出现。
// ============================================================
import React from 'react';
import type {ConvergeScene} from './Plan';
import {Object3} from './Glyph';
import {E, seg} from '../Motion';
import {ACCENT, FONT, INK, clamp, inCubic, lerp, outCubic, progress, surface, tile, tileSheen} from './theme';
import {CANVAS} from './Canvas';
import {circleIris} from './motions';

type Pt = {x: number; y: number};
const SINK_X = 1328;
const SINK_Y = 490;
const SAMPLES = 1200;
const LINE_LEN = 384;
const START_X = 296;

const cubic = (y0: number, u: number): Pt => {
  const v = 1 - u;
  return {
    x: v * v * v * START_X + 3 * v * v * u * 744 + 3 * v * u * u * 856 + u * u * u * SINK_X,
    y: v * v * v * y0 + 3 * v * v * u * y0 + 3 * v * u * u * SINK_Y + u * u * u * SINK_Y,
  };
};

const makeGeom = (y0: number) => {
  const cum = [0];
  let px = START_X;
  let py = y0;
  let acc = 0;
  for (let k = 1; k <= SAMPLES; k += 1) {
    const point = cubic(y0, k / SAMPLES);
    acc += Math.hypot(point.x - px, point.y - py);
    cum.push(acc);
    px = point.x;
    py = point.y;
  }
  const len = LINE_LEN + acc;
  const pointAt = (distance: number): Pt => {
    const targetDistance = clamp(distance, 0, len);
    if (targetDistance <= LINE_LEN) return {x: -88 + targetDistance, y: y0};
    const target = targetDistance - LINE_LEN;
    let lo = 0;
    let hi = SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const s0 = cum[i - 1];
    const s1 = cum[i];
    const u = (i - 1 + (s1 > s0 ? (target - s0) / (s1 - s0) : 0)) / SAMPLES;
    return cubic(y0, u);
  };
  let f0 = 0.2;
  for (let k = 1; k <= 40; k += 1) {
    const q = k / 40;
    if (pointAt(len * q).x >= START_X) {
      f0 = q;
      break;
    }
  }
  return {len, pointAt, f0};
};

const geomCache = new Map<number, ReturnType<typeof makeGeom>>();
const geomFor = (y: number) => {
  const key = Math.round(y);
  if (!geomCache.has(key)) geomCache.set(key, makeGeom(key));
  return geomCache.get(key)!;
};

export const Converge: React.FC<{frame: number; scene: ConvergeScene}> = ({frame, scene}) => {
  if (frame < scene.start - 12 || frame >= scene.end + 20) return null;
  const n = scene.sources.length;
  const spacing = n <= 1 ? 0 : Math.min(160, 660 / (n - 1));
  const ys = scene.sources.map((_, i) => SINK_Y + (i - (n - 1) / 2) * spacing);
  const compact = n > 4;
  const nodeW = compact ? 212 : 172;
  const nodeH = compact ? 74 : 172;
  const conv = progress(frame, scene.convergeAt, scene.convergeAt + 66, E.inOutCubic);
  const erase = scene.eraseAt ? progress(frame, scene.eraseAt, scene.eraseAt + 20, E.outQuad) : 0;
  const firstAt = Math.min(...scene.sources.map((s, i) => s.at ?? scene.start + 4 + i * 5));
  const packetOn = progress(frame, firstAt + 14, firstAt + 30) * (1 - progress(frame, scene.convergeAt - 4, scene.convergeAt + 8));
  const packetCycle = ((frame - firstAt) / 42) % 1;
  const sinkIn = progress(frame, scene.sink.at, scene.sink.at + 17, outCubic);
  const pulse = 1 + seg(clamp((frame - (scene.convergeAt + 66)) / 24), 0, 0.5, E.outBack) * 0.12 - seg(clamp((frame - (scene.convergeAt + 66)) / 24), 0.5, 1, E.outQuad) * 0.12;
  const sinkScale = lerp(sinkIn, 0.7, 1) * pulse;
  const stageOut = 1 - progress(frame, scene.end - 16, scene.end, inCubic);
  const captionIn = scene.caption ? progress(frame, scene.caption.at, scene.caption.at + 14, outCubic) : 0;
  const noteIn = scene.note ? progress(frame, scene.note.at, scene.note.at + 18, outCubic) : 0;
  const iris = scene.handoff === 'circle-iris' ? circleIris(frame, scene.start, scene.irisFrom?.r ?? 88) : null;
  const irisClip = iris ? `circle(${iris.r}px at ${scene.irisFrom?.x ?? SINK_X}px ${scene.irisFrom?.y ?? SINK_Y}px)` : undefined;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stageOut, zIndex: 14, clipPath: irisClip, WebkitClipPath: irisClip}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {scene.sources.map((source, index) => {
          const y = ys[index];
          const {len} = geomFor(y);
          const at = source.at ?? scene.start + 4 + index * 5;
          const draw = progress(frame, at, at + 30, E.outQuad);
          const offset = erase > 0 ? -erase * len : len * (1 - draw);
          return <path key={`${source.label}-${index}`} d={`M -88,${y} L ${START_X},${y} C 744,${y} 856,${SINK_Y} ${SINK_X},${SINK_Y}`} fill="none" stroke="rgba(245,245,247,.82)" strokeWidth="4" strokeDasharray={len} strokeDashoffset={offset} opacity={draw * (1 - clamp((erase - 0.85) / 0.15))} />;
        })}
      </svg>
      {scene.sources.map((source, index) => {
        const y = ys[index];
        const {len, pointAt, f0} = geomFor(y);
        const at = source.at ?? scene.start + 4 + index * 5;
        const frac = f0 + (1 - f0) * conv;
        const point = pointAt(len * frac);
        const shrink = conv < 0.75 ? lerp(conv / 0.75, 1, 0.35) : lerp((conv - 0.75) / 0.25, 0.35, 0);
        const w = Math.max(0.1, nodeW * shrink);
        const h = Math.max(0.1, nodeH * shrink);
        const appear = progress(frame, at, at + 12, outCubic);
        const packetFraction = f0 + (1 - f0) * ((packetCycle + index * 0.13) % 1);
        const packet = pointAt(len * packetFraction);
        return (
          <React.Fragment key={`${source.label}-${index}`}>
            <div style={{position: 'absolute', left: point.x - w / 2, top: point.y - h / 2, width: w, height: h, transform: `scale(${appear})`, opacity: appear * (conv > 0.92 ? clamp((1 - conv) / 0.08) : 1), ...surface('glass', {radius: 999}), display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, zIndex: 2, fontFamily: FONT, fontSize: Math.max(4, (compact ? 29 : 32) * shrink), fontWeight: 600, whiteSpace: 'nowrap'}}>
              {source.label}
            </div>
            <div style={{position: 'absolute', left: packet.x - 8, top: packet.y - 8, width: 16, height: 16, borderRadius: 8, background: ACCENT, boxShadow: '0 0 18px rgba(230,232,147,.55)', opacity: packetOn * appear}} />
          </React.Fragment>
        );
      })}
      <div style={{position: 'absolute', left: SINK_X - 96, top: SINK_Y - 96, width: 192, height: 192, ...tile({radius: 999, accent: true}), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: sinkIn, transform: `scale(${sinkScale})`}}>
        <div style={tileSheen()} />
        <Object3 image={scene.sink.image} kind={scene.sink.kind} active />
      </div>
      {/* 汇点标签在圆下方（2026-09-06：长标签塞圆里会溢出、被汇流线压住） */}
      <div style={{position: 'absolute', left: SINK_X - 240, top: SINK_Y + 104, width: 480, textAlign: 'center', fontFamily: FONT, color: INK, fontWeight: 600, fontSize: 27, whiteSpace: 'nowrap', opacity: sinkIn, zIndex: 3}}>{scene.sink.label}</div>
      {scene.caption ? (
        <div style={{position: 'absolute', left: 1090, top: 640, width: 640, color: INK, fontFamily: FONT, fontSize: 48, lineHeight: 1.18, fontWeight: 700, opacity: captionIn, transform: `translateY(${(1 - captionIn) * 18}px)`}}>
          {scene.caption.text}
        </div>
      ) : null}
      {scene.note ? (
        <div style={{position: 'absolute', left: SINK_X - 330, top: SINK_Y + 150, width: 660, textAlign: 'center', color: 'rgba(245,245,247,.9)', fontFamily: FONT, fontSize: 38, lineHeight: 1.25, fontWeight: 600, opacity: noteIn, transform: `translateY(${(1 - noteIn) * 18}px)`, whiteSpace: 'pre-line'}}>
          {scene.note.text}
        </div>
      ) : null}
    </div>
  );
};
