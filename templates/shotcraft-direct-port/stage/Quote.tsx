// ============================================================
// 引用：别人的原话（博主、官方、客户）用大引号 + 大字放出来，署名小字。
// 与"标签"的区别：这是一句话，不是一个词；与"证据页"的区别：没有截图时用它。
// ============================================================
import React from 'react';
import type {QuoteScene, SpeakerMode} from './Plan';
import {ACCENT, FONT, INK, contentRect, outCubic, progress, stageOpacity} from './theme';
import {blurSlide} from './motions';

export const Quote: React.FC<{frame: number; scene: QuoteScene; speakerMode?: SpeakerMode}> = ({frame, scene, speakerMode = 'hero'}) => {
  if (frame < scene.at - 4 || frame >= scene.end + 20) return null;
  const rect = contentRect(speakerMode);
  const w = Math.min(scene.w ?? 1080, rect.w - 80);
  const x = rect.x + (rect.w - w) / 2;
  const opacity = stageOpacity(frame, scene.at, scene.end, 14, 16);
  const bs = blurSlide(frame, scene.at, 18, 36);
  const byIn = scene.by ? progress(frame, scene.at + 16, scene.at + 30, outCubic) : 0;
  const longest = Math.max(...scene.text.split(/(?<=[，。！？；])/).map((x) => x.length));
  const fontSize = longest > 16 ? 48 : longest > 12 ? 56 : 64;
  return (
    <div style={{position: 'absolute', left: x, top: scene.y ?? 300, width: w, opacity: opacity * bs.opacity, transform: bs.transform, filter: bs.filter, zIndex: 16}}>
      <div style={{position: 'absolute', left: -18, top: -58, fontFamily: FONT, fontSize: 132, fontWeight: 800, lineHeight: 1, color: ACCENT, opacity: 0.85}}>「</div>
      <div style={{fontFamily: FONT, fontSize, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.02em', color: INK}}>{scene.text.split(/(?<=[，。！？；])/).map((seg, i) => <div key={i}>{seg}</div>)}</div>
      {scene.by ? <div style={{marginTop: 18, fontFamily: FONT, fontSize: 26, fontWeight: 500, color: 'rgba(245,245,247,.6)', opacity: byIn, transform: `translateY(${(1 - byIn) * 10}px)`}}>—— {scene.by}</div> : null}
    </div>
  );
};
