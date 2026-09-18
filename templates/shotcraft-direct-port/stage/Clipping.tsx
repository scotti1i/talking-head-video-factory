// ============================================================
// 剪报：新闻 / 公告原文"剪下来"贴在舞台上——纸白底、衬线大标题、来源行、轻微旋转、关键词马克笔高亮。
// 与证据页的区别：证据页是整页截图聚焦；剪报是一句话级别的引用，无截图时的权威感来源。
// ============================================================
import React from 'react';
import type {ClippingScene} from './Plan';
import {FONT, contentRect, outCubic, progress, stageOpacity} from './theme';

const SERIF = 'Songti SC, STSong, Noto Serif SC, serif';

export const Clipping: React.FC<{frame: number; scene: ClippingScene}> = ({frame, scene}) => {
  if (frame < scene.at - 8 || frame >= scene.end + 20) return null;
  const rect = contentRect('hero-right');
  const w = Math.min(880, rect.w - 120);
  const x = rect.x + (rect.w - w) / 2;
  const enter = progress(frame, scene.at, scene.at + 16, outCubic);
  const stage = stageOpacity(frame, scene.at, scene.end, 12, 16);
  const rot = scene.rotate ?? -1.6;
  const mark = (text: string) => {
    if (!scene.highlight || !text.includes(scene.highlight)) return text;
    const [pre, ...rest] = text.split(scene.highlight);
    return <>{pre}<span style={{background: 'linear-gradient(180deg, transparent 18%, rgba(205,210,122,.85) 18%, rgba(205,210,122,.85) 88%, transparent 88%)', padding: '0 4px'}}>{scene.highlight}</span>{rest.join(scene.highlight)}</>;
  };
  return (
    <div style={{position: 'absolute', left: x, top: 200, width: w, opacity: enter * stage, transform: `rotate(${rot}deg) translateY(${(1 - enter) * 26}px) translateZ(70px)`, zIndex: 17, background: '#F5F2E9', borderRadius: 6, padding: '44px 52px 34px', boxShadow: '0 30px 70px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.4) inset', clipPath: 'polygon(0 2%, 3% 0, 97% 1%, 100% 3%, 99% 97%, 96% 100%, 4% 99%, 0 96%)'}}>
      <div style={{fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: '#6B6558', letterSpacing: '0.12em', borderBottom: '2px solid #1C1A16', paddingBottom: 10, marginBottom: 20}}>{scene.kicker ?? '摘录'}</div>
      <div style={{fontFamily: SERIF, fontSize: scene.headline.length > 18 ? 44 : 54, fontWeight: 900, lineHeight: 1.3, letterSpacing: '-0.01em', color: '#141210'}}>{mark(scene.headline)}</div>
      {scene.body ? <div style={{fontFamily: SERIF, fontSize: 26, lineHeight: 1.6, color: '#3A362E', marginTop: 18}}>{mark(scene.body)}</div> : null}
      <div style={{fontFamily: FONT, fontSize: 21, fontWeight: 500, color: '#8A8374', marginTop: 26}}>—— {scene.source}</div>
    </div>
  );
};
