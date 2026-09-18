// ============================================================
// 概念卡（v4 · 字体做主角）：术语用主角字号站在左上，定义按短语逐段揭示（blur-slide），
// 当前短语强调色、已讲短语降权；右侧一个有体积的物件承担"这是在讲什么东西"。
// 定义完成后整块缩成右上角概念提醒卡。
// ============================================================
import React from 'react';
import type {ConceptScene, SpeakerMode} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, Box, FONT, HERO, INK, REMINDER_SLOTS, accentPill, contentRect, mixBox, outCubic, progress, sharedProgress, stageOpacity, surface, tile, tileSheen} from './theme';
import {karaokeClip, markerDraw, markerStroke} from './motions';

// 概念卡居中于「当前人物形态的内容区」，不再假设人物是角标（2026-09-03 Scott：3:05 结论卡被 hero 人像遮挡）
const stageFor = (mode: SpeakerMode): Box => {
  const rect = contentRect(mode);
  const w = Math.min(1200, rect.w);
  return {x: rect.x + (rect.w - w) / 2, y: 150, w, h: 640, r: 0};
};

export const Concept: React.FC<{frame: number; scene: ConceptScene; speakerMode?: SpeakerMode}> = ({frame, scene, speakerMode = 'orb-left'}) => {
  const opacity = stageOpacity(frame, scene.start, scene.end, 16, 16);
  const demote = scene.demoteAt ? sharedProgress(frame, scene.demoteAt) : 0;
  const STAGE = stageFor(speakerMode);
  const box = mixBox(STAGE, REMINDER_SLOTS[scene.slot ?? 0], demote);
  const enter = progress(frame, scene.start + 2, scene.start + 18, outCubic); // 等上一场景淡出后再进，避免大字与关系图互压
  const currentIndex = scene.phrases.reduce((acc, phrase, index) => (frame >= phrase.at ? index : acc), -1);
  const termSize = Math.min(scene.term.length > 8 ? 110 : scene.term.length > 5 ? 140 : HERO.word, Math.floor(STAGE.w / Math.max(1, scene.term.length * 0.92)));
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity: opacity * enter, transform: `translateY(${(1 - enter) * 30}px)`, zIndex: 16}}>
      <div style={{position: 'absolute', inset: 0, opacity: 1 - Math.min(1, demote * 2.5)}}>
        {scene.glyph || scene.image ? (
          <div style={{position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', width: 120, height: 120, ...tile({radius: 30, accent: true}), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Object3 image={scene.image} kind={scene.glyph ?? 'none'} active size={60} />
          </div>
        ) : null}
        <div style={{position: 'absolute', left: 0, right: 0, top: scene.glyph ? 140 : 36, textAlign: 'center', fontFamily: FONT, fontSize: termSize, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: INK, whiteSpace: 'nowrap'}}>
          {scene.term}
          {scene.underline && scene.phrases[0] ? (() => { const draw = markerDraw(frame, scene.phrases[0].at); const len = Math.round(scene.term.length * termSize * 0.9); if (draw <= 0) return null; return (
            <svg width={len} height={44} viewBox="0 0 252 44" preserveAspectRatio="none" style={{position: 'absolute', left: -4, bottom: -22, overflow: 'visible'}}>
              <clipPath id={`ul-term-${scene.id}`}><rect x={0} y={-20} width={draw * 258} height={60} /></clipPath>
              <path d={markerStroke(252, 77)} fill={ACCENT} clipPath={`url(#ul-term-${scene.id})`} opacity={0.85} />
            </svg>); })() : null}
        </div>
        <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: (scene.glyph ? 140 : 36) + termSize + 30, width: 160, height: 1, background: 'rgba(214,178,94,.5)'}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: (scene.glyph ? 140 : 36) + termSize + 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18}}>
          {scene.phrases.map((phrase, index) => {
            if (frame < phrase.at) return null;
            const reveal = progress(frame, phrase.at, phrase.at + 16, outCubic);
            const isCurrent = index === currentIndex;
            if (phrase.reveal === 'karaoke' && phrase.words?.length) {
              // KaraokeFillSync：旁白读到哪个词，哪个词从左到右被强调色点亮；读指下划线跟随右缘
              return (
                <div key={`${phrase.text}-${phrase.at}`} style={{fontFamily: FONT, fontSize: 52, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.03em', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', opacity: isCurrent ? 1 : 0.62}}>
                  {phrase.words.map((w, wi) => { const k = karaokeClip(frame, w.at, w.until); return (
                    <span key={wi} style={{position: 'relative', display: 'inline-block', whiteSpace: 'pre', marginRight: /[A-Za-z0-9]$/.test(w.t) ? '0.18em' : 0, marginLeft: /^[A-Za-z0-9]/.test(w.t) ? '0.18em' : 0}}>
                      <span style={{color: 'rgba(245,245,247,.42)'}}>{w.t}</span>
                      <span style={{position: 'absolute', inset: 0, color: ACCENT, clipPath: k.clipPath}}>{w.t}</span>
                      {k.active ? <span style={{position: 'absolute', left: 0, bottom: -10, width: `${k.p * 100}%`, height: 6, background: ACCENT, borderRadius: 3}} /> : null}
                    </span>); })}
                </div>
              );
            }
            return (
              <div key={`${phrase.text}-${phrase.at}`} style={{fontFamily: FONT, fontSize: 52, fontWeight: isCurrent ? 700 : 500, lineHeight: 1.3, letterSpacing: '-0.03em', color: isCurrent ? ACCENT : 'rgba(245,245,247,.62)', opacity: reveal, filter: `blur(${(1 - reveal) * 10}px)`, transform: `translateY(${(1 - reveal) * 40}px)`, }}>
                {phrase.text}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: demote, ...surface('fill', {radius: 22, accent: true}), display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px'}}>
        <div style={{padding: '5px 14px', ...accentPill('accent'), fontFamily: FONT, fontSize: 25, fontWeight: 700, whiteSpace: 'nowrap'}}>{scene.term}</div>
        <div style={{fontFamily: FONT, fontSize: 25, fontWeight: 600, color: INK, lineHeight: 1.18}}>{scene.phrases.map((p) => p.text).join('，')}</div>
      </div>
    </div>
  );
};
