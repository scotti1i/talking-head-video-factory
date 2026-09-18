// ============================================================
// 手机模拟器：聊天气泡对话（客户 / 我 / AI）。420×760 设备框，气泡从下往上堆，新气泡弹簧入场并把旧气泡推上去。
// 用于"客户问 → 客服答"这类本来就是对话的段落（2026-09-03 Scott 勾选）。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {ChatScene, SpeakerMode} from './Plan';
import {ACCENT, FONT, INK, ON_ACCENT, contentRect, inCubic, outCubic, progress, stageOpacity} from './theme';

const W = 420;
const H = 760;

export const Chat: React.FC<{frame: number; scene: ChatScene; speakerMode?: SpeakerMode}> = ({frame, scene, speakerMode = 'hero'}) => {
  const {fps} = useVideoConfig();
  const first = Math.min(...scene.messages.map((m) => m.at));
  if (frame < first - 12 || frame >= scene.end + 20) return null;
  const rect = contentRect(speakerMode);
  // 默认居中于内容区；side 只在明确指定时靠边（2026-09-03：靠边会留出大片空白）
  const x = scene.side === 'left' ? rect.x + 60 : scene.side === 'right' ? rect.x + rect.w - 60 - W : rect.x + (rect.w - W) / 2;
  const y = 90;
  const enter = progress(frame, first - 12, first + 8, outCubic);
  const out = progress(frame, scene.end, scene.end + 16, inCubic);
  const shown = scene.messages.filter((m) => frame >= m.at);
  // 气泡高度估算：每行 15 字，行高 40，内边距 28
  const heights = shown.map((m) => Math.ceil(m.text.length / 14) * 40 + 28);
  const total = heights.reduce((a, b) => a + b + 14, 0);
  const shift = Math.max(0, total - (H - 120));
  let cursor = 0;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: W, height: H, borderRadius: 44, background: '#0E0E12', boxShadow: '0 0 0 2px rgba(255,255,255,.18), 0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden', opacity: enter * (1 - out) * stageOpacity(frame, first, scene.end, 1, 1), transform: `translateY(${(1 - enter) * 30}px) translateZ(80px)`, zIndex: 18}}>
      <div style={{height: 86, borderBottom: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 24, fontWeight: 700, color: INK, letterSpacing: '0.02em'}}>{scene.title ?? '对话'}</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 86, bottom: 0, padding: '18px 18px 24px', transform: `translateY(${-shift}px)`}}>
        {shown.map((m, i) => {
          const pop = spring({frame: frame - m.at, fps, config: {damping: 13, stiffness: 190}});
          const mine = m.from !== 'customer';
          const top = cursor; cursor += heights[i] + 14;
          const bg = m.from === 'customer' ? '#1F1F26' : m.from === 'ai' ? ACCENT : '#2F6BFF';
          const color = m.from === 'ai' ? ON_ACCENT : INK;
          return (
            <div key={i} style={{position: 'absolute', top, left: mine ? undefined : 18, right: mine ? 18 : undefined, maxWidth: W - 90, padding: '12px 16px', borderRadius: 20, borderBottomLeftRadius: mine ? 20 : 6, borderBottomRightRadius: mine ? 6 : 20, background: bg, color, fontFamily: FONT, fontSize: 26, fontWeight: 500, lineHeight: 1.45, opacity: pop, transform: `scale(${0.85 + pop * 0.15}) translateY(${(1 - pop) * 14}px)`, transformOrigin: mine ? 'right bottom' : 'left bottom', whiteSpace: 'pre-wrap'}}>
              {m.from === 'ai' ? <div style={{fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.75, marginBottom: 4}}>AI</div> : null}
              {m.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
