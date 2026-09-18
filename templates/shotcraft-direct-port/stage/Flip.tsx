// ============================================================
// 翻牌卡：正面（问题 / 数字）→ flipAt 绕 Y 轴翻到背面（答案）。一个悬念一张牌。
// ============================================================
import React from 'react';
import type {FlipScene} from './Plan';
import {ACCENT, FONT, INK, ON_ACCENT, contentRect, inOutCubic, progress, stageOpacity, surface} from './theme';
import {Object3} from './Glyph';

const W = 720;
const H = 430;

export const Flip: React.FC<{frame: number; scene: FlipScene}> = ({frame, scene}) => {
  if (frame < scene.start - 12 || frame >= scene.end + 20) return null;
  const rect = contentRect('dock');
  const x = rect.x + (rect.w - W) / 2;
  const y = rect.y + (rect.h - H) / 2 - 20;
  const enter = progress(frame, scene.start - 8, scene.start + 10, inOutCubic);
  const flip = progress(frame, scene.flipAt, scene.flipAt + 22, inOutCubic);
  const deg = flip * 180;
  const stage = stageOpacity(frame, scene.start, scene.end);
  const face = (front: boolean) => ({position: 'absolute', inset: 0, borderRadius: 30, backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 50px', textAlign: 'center', transform: front ? undefined : 'rotateY(180deg)'} as React.CSSProperties);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: W, height: H, opacity: enter * stage, zIndex: 16, perspective: 1600}}>
      <div style={{position: 'absolute', inset: 0, transform: `rotateY(${deg}deg) translateZ(40px)`, transformStyle: 'preserve-3d'}}>
        <div style={{...face(true), ...surface('glass', {radius: 30})}}>
          {scene.front.image ? <Object3 image={scene.front.image} kind="none" size={72} /> : null}
          <div style={{fontFamily: FONT, fontSize: scene.front.text.length > 10 ? 46 : 62, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25, color: INK}}>{scene.front.text}</div>
          <div style={{fontFamily: FONT, fontSize: 24, fontWeight: 600, color: ACCENT, letterSpacing: '0.06em'}}>翻牌 ›</div>
        </div>
        <div style={{...face(false), ...surface('fill', {radius: 30, accent: true, active: 1})}}>
          <div style={{fontFamily: FONT, fontSize: scene.back.text.length > 10 ? 48 : 66, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25, color: ON_ACCENT}}>{scene.back.text}</div>
          {scene.back.sub ? <div style={{fontFamily: FONT, fontSize: 27, fontWeight: 600, color: 'rgba(20,20,22,.72)'}}>{scene.back.sub}</div> : null}
        </div>
      </div>
    </div>
  );
};
