// ============================================================
// 真人前的提醒堆叠：人重新成为主角，概念仍留在工作记忆里；新卡到达时旧卡降权
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {RemindersScene} from './Plan';
import {FONT, INK, ON_ACCENT, REMINDER_SLOTS, inCubic, progress, surface, toneColor} from './theme';
import {PORTRAIT} from './Canvas';

export const Reminders: React.FC<{frame: number; scene: RemindersScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const out = progress(frame, scene.end, scene.end + 16, inCubic);
  if (out >= 1) return null;
  const latest = scene.items.reduce((acc, item, index) => (frame >= item.at ? index : acc), -1);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - out, zIndex: 18, transformStyle: 'preserve-3d'}}>
      {scene.items.map((item, index) => {
        if (frame < item.at) return null;
        const slot = REMINDER_SLOTS[Math.min(index, REMINDER_SLOTS.length - 1)];
        const pop = spring({frame: frame - item.at, fps, config: {damping: 12, stiffness: 160}});
        const isLatest = index === latest;
        const accent = item.tone === 'accent';
        return (
          <div key={`${item.text}-${item.at}`} style={{position: 'absolute', left: slot.x, top: slot.y, width: slot.w, height: slot.h, ...surface(isLatest ? 'fill' : 'glass', {radius: slot.r, accent: isLatest}), display: 'flex', alignItems: 'center', padding: '0 26px', color: isLatest ? ON_ACCENT : accent ? toneColor('accent') : INK, fontFamily: FONT, fontSize: PORTRAIT ? 34 : 30, fontWeight: 600, letterSpacing: '-0.02em', opacity: pop * (isLatest ? 1 : 0.62), transform: `translateZ(${index * 30 + (isLatest ? 80 : 0) + Math.sin(frame / 34 + index) * 6}px) translateY(${(1 - pop) * 18}px)`, whiteSpace: 'nowrap'}}>
            {item.text}
          </div>
        );
      })}
    </div>
  );
};
