// ============================================================
// 概念帧（方向探索，不进成片）：把"归因 / 增量"这一拍按"字体做主角 + 物件有体积 + 有一盏灯"的方向重画。
// 目的：验证方向，而不是新模板。若 Scott 认可，再把这些原则回灌到 split / concept / graph。
// ============================================================
import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {Glyph} from './Glyph';
import {ACCENT, FONT, INK} from './theme';

const SPEAKER = {x: 54, y: 118, w: 410, h: 712, r: 30};

// 有体积的物件：多层渐变模拟顶光 + 底部反光，不是平面框
const ObjectTile: React.FC<{x: number; y: number; size: number; kind: any; accent?: boolean; frame: number}> = ({x, y, size, kind, accent, frame}) => {
  const sweep = ((frame * 3) % (size * 3)) - size;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size * 0.26, background: 'linear-gradient(160deg, #2C2C31 0%, #17171A 55%, #0F0F11 100%)', boxShadow: `0 40px 90px rgba(0,0,0,.62), 0 8px 18px rgba(0,0,0,.4), inset 0 2px 0 rgba(255,255,255,.22), inset 0 -2px 0 rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)${accent ? `, 0 0 80px rgba(230,232,147,.16)` : ''}`, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.16), rgba(255,255,255,0) 52%)'}} />
      <div style={{position: 'absolute', top: 0, bottom: 0, left: sweep, width: size * 0.5, background: 'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.06) 50%, rgba(255,255,255,0) 100%)'}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <Glyph kind={kind} active={accent} size={size * 0.5} />
      </div>
    </div>
  );
};

export const Styleframe: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: '#050506', overflow: 'hidden', fontFamily: FONT}}>
      {/* 远景：原片模糊层 + 一盏顶光 */}
      <div style={{position: 'absolute', inset: -60, opacity: 0.16, filter: 'blur(50px) saturate(.6) brightness(.5)'}}>
        <OffthreadVideo src={staticFile('factory/aroll.mp4')} startFrom={2205} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(5,5,6,.78)'}} />
      <div style={{position: 'absolute', left: 300, top: -700, width: 1500, height: 1500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.085), rgba(255,255,255,0) 60%)'}} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 420, background: 'linear-gradient(180deg, rgba(5,5,6,0), rgba(5,5,6,.8))'}} />

      {/* 人物 */}
      <div style={{position: 'absolute', left: SPEAKER.x, top: SPEAKER.y, width: SPEAKER.w, height: SPEAKER.h, borderRadius: SPEAKER.r, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,.3), 0 40px 90px rgba(0,0,0,.6)'}}>
        <OffthreadVideo src={staticFile('factory/aroll.mp4')} startFrom={2205} muted style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 42%'}} />
      </div>

      {/* 眉题 */}
      <div style={{position: 'absolute', left: 580, top: 150, fontSize: 22, letterSpacing: '.22em', color: 'rgba(245,245,247,.45)', fontWeight: 500}}>同一张订单 · 两个问题</div>

      {/* 归因：大字做主角 */}
      <div style={{position: 'absolute', left: 574, top: 190, display: 'flex', alignItems: 'baseline', gap: 36}}>
        <div style={{fontSize: 210, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: INK}}>归因</div>
        <div style={{fontSize: 34, fontWeight: 500, color: 'rgba(245,245,247,.62)', letterSpacing: '-0.01em'}}>订单最后从哪里进来</div>
      </div>
      <div style={{position: 'absolute', left: 580, top: 456, width: 1180, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,.28), rgba(255,255,255,0))'}} />

      {/* 增量：正在讲的那个，强调色 + 物件 */}
      <div style={{position: 'absolute', left: 574, top: 500, display: 'flex', alignItems: 'baseline', gap: 36}}>
        <div style={{fontSize: 210, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: ACCENT, textShadow: '0 0 60px rgba(230,232,147,.25)'}}>增量</div>
        <div style={{fontSize: 34, fontWeight: 500, color: 'rgba(245,245,247,.8)', letterSpacing: '-0.01em'}}>没有这笔广告费，他还会不会买</div>
      </div>

      {/* 物件：订单 / 问号 */}
      <ObjectTile x={1560} y={150} size={220} kind="order" frame={frame} />
      <div style={{position: 'absolute', left: 1560, top: 500, width: 220, height: 220, borderRadius: 58, background: 'linear-gradient(160deg, #3A3A22 0%, #1C1C12 60%, #111109 100%)', boxShadow: '0 40px 90px rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(230,232,147,.35), 0 0 90px rgba(230,232,147,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontSize: 130, fontWeight: 800}}>?</div>

      {/* 字幕 */}
      <div style={{position: 'absolute', left: 150, right: 150, bottom: 34, minHeight: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 56, fontWeight: 750, letterSpacing: '-0.025em', textShadow: '0 3px 3px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.7)'}}>我们叫归因，后面这个才叫增量</div>
    </AbsoluteFill>
  );
};
