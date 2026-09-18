// ============================================================
// 理解档引用卡：口播提到"某类视频 / 教程 / 新闻"但没有真实封面时，用示意封面建立对象锚点。
// 它不冒充来源（没有假账号、假数据），只是把"那种东西"画出来：
// 深色封面 + 大标题 + 播放标识 + 类别角标，白边、双层阴影、低幅阻尼漂移（小Lin 引用卡的运动规则）。
// ============================================================
import React from 'react';
import type {ReferenceScene} from './Plan';
import {ACCENT, DISPLAY_FONT, FONT, INK, SHADOW_DEEP, accentPill, inCubic, outCubic, progress} from './theme';

export const Reference: React.FC<{frame: number; scene: ReferenceScene}> = ({frame, scene}) => {
  if (frame < scene.at) return null;
  const enter = progress(frame, scene.at, scene.at + 16, outCubic);
  const out = progress(frame, scene.end, scene.end + 16, inCubic);
  if (out >= 1) return null;
  const h = Math.round(scene.w * 9 / 16);
  const drift = Math.sin((frame - scene.at) / 70) * 4;
  const tilt = Math.sin((frame - scene.at) / 110) * 0.35;
  return (
    <div
      style={{
        position: 'absolute',
        left: scene.x,
        top: scene.y + drift,
        width: scene.w,
        height: h,
        borderRadius: 18,
        overflow: 'hidden',
        background: '#1C1C1E',
        boxShadow: `0 0 0 1px rgba(255,255,255,.14), ${SHADOW_DEEP}`,
        opacity: enter * (1 - out),
        transform: `rotate(${tilt}deg) translateY(${(1 - enter) * 22}px) scale(${0.96 + enter * 0.04})`,
        transformOrigin: 'center',
        zIndex: 18,
      }}
    >
      {scene.tag ? (
        <div style={{position: 'absolute', left: 26, top: 22, padding: '5px 14px', ...accentPill('accent'), fontFamily: FONT, fontSize: 20, fontWeight: 700}}>{scene.tag}</div>
      ) : null}
      <div style={{position: 'absolute', left: 30, right: 30, bottom: 34, color: INK, fontFamily: FONT}}>
        <div style={{fontFamily: DISPLAY_FONT, fontSize: Math.round(scene.w * 0.085), fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.035em', whiteSpace: 'pre-line'}}>{scene.title}</div>
        {scene.subtitle ? <div style={{marginTop: 10, fontSize: Math.round(scene.w * 0.038), fontWeight: 500, color: 'rgba(245,245,247,.7)'}}>{scene.subtitle}</div> : null}
      </div>
      <div style={{position: 'absolute', right: 26, top: 22, width: 54, height: 54, borderRadius: 27, background: 'rgba(255,255,255,.10)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <svg width="22" height="22" viewBox="0 0 22 22"><path d="M6 3 L19 11 L6 19 Z" fill={ACCENT} /></svg>
      </div>
    </div>
  );
};
