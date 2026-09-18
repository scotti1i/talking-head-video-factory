// ============================================================
// 二分概念（v4 · 字体做主角）：同一个对象拆成两个问题，两行并列——
// 每行 = [物件] + 问题；说到术语时，术语以主角字号滑入行首，问题退成次级说明，物件缩到行尾。
// 讲完后两行缩成右上角堆叠提醒（旧概念自动降权）。
// 运动：blur-slide（术语入场 y40→0 + blur 10→0）、SharedElementMorph（换位 / 缩小）。
// ============================================================
import React from 'react';
import type {SplitScene} from './Plan';
import {Object3} from './Glyph';
import {ACCENT, Box, FONT, HERO, INK, REMINDER_SLOTS, accentPill, inCubic, lerp, mixBox, outCubic, progress, sharedProgress, surface, tile, tileSheen} from './theme';
import {markerDraw, markerStroke} from './motions';

// 行框留出面板内边距（左右 40 / 上下 24），两行等高，中间 60 间隔（2026-09-03 Scott：面板内间距没优化，挤）
const ROWS_A: Box[] = [
  {x: 740, y: 150, w: 1086, h: 300, r: 0},
  {x: 740, y: 510, w: 1086, h: 300, r: 0},
];
const ROWS_B: Box[] = [
  {x: 564, y: 150, w: 1262, h: 300, r: 0},
  {x: 564, y: 510, w: 1262, h: 300, r: 0},
];

export const Split: React.FC<{frame: number; scene: SplitScene}> = ({frame, scene}) => {
  const enterStart = scene.start - 14;
  if (frame < enterStart) return null;
  const enter = progress(frame, enterStart, scene.start + 8, outCubic);
  const shift = scene.shiftAt ? sharedProgress(frame, scene.shiftAt) : 0;
  const collapse = scene.collapseAt ? sharedProgress(frame, scene.collapseAt) : 0;
  const stageOut = 1 - progress(frame, scene.end, scene.end + 18, inCubic);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter * stageOut, zIndex: 16, transformStyle: 'preserve-3d'}}>
      <div style={{position: 'absolute', left: 700, top: 490, width: 1166, height: 1, background: 'linear-gradient(90deg, rgba(214,178,94,.45), rgba(214,178,94,0))', opacity: enter * (1 - collapse)}} />
      {scene.cards.map((card, index) => {
        const rowBox = mixBox(mixBox(ROWS_A[index], ROWS_B[index], shift), REMINDER_SLOTS[index], collapse);
        const accent = Boolean(card.accent);
        const tagIn = card.tag && frame >= card.tag.at ? progress(frame, card.tag.at, card.tag.at + 22, outCubic) : 0;
        const glyphLeave = card.glyphLeaveAt ? progress(frame, card.glyphLeaveAt, card.glyphLeaveAt + 35, inCubic) : 0;
        const pulseT = card.pulseAt ? progress(frame, card.pulseAt, card.pulseAt + 22, outCubic) : 0;
        const pulse = 1 + Math.sin(pulseT * Math.PI) * 0.02;
        const rowEnter = progress(frame, enterStart + index * 6, scene.start + 10 + index * 6, outCubic);
        const dimOld = collapse > 0.5 && index === 0 && scene.cards[1].tag && frame >= scene.cards[1].tag.at ? 0.62 : 1;
        const objMove = Math.min(1, Math.max(0, (tagIn - 0.3) / 0.5)); // 大问题淡出后物件走到行尾（0.3→0.8）
        const objSize = lerp(objMove, 220, 150);
        const objX = lerp(objMove, 0, rowBox.w - 150);
        const bigQ = 1 - Math.min(1, tagIn * 2.2);
        const smallQ = Math.max(0, (tagIn - 0.85) / 0.15); // 物件到位后说明才出现，不穿过
        // 术语大字按字数缩放，保证不压到右侧说明（CJK 记 1，ASCII 记 0.6，空格 0.3；2 字仍是 HERO.word）
        const tagUnits = card.tag ? [...card.tag.text].reduce((n, ch) => n + (ch === ' ' ? 0.3 : /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.6), 0) : 1;
        const tagFont = Math.min(HERO.word, Math.floor(520 / Math.max(1, tagUnits * 0.92)));
        return (
          <div key={card.text} style={{position: 'absolute', left: rowBox.x, top: rowBox.y, width: rowBox.w, height: rowBox.h, opacity: rowEnter * dimOld, transform: `translateY(${(1 - rowEnter) * 30}px) scale(${pulse})`, transformOrigin: 'left center'}}>
            <div style={{position: 'absolute', inset: 0, opacity: 1 - collapse}}>
              <div style={{position: 'absolute', left: objX, top: (rowBox.h - objSize) / 2, width: objSize, height: objSize, ...tile({radius: objSize * 0.26, accent: accent && glyphLeave > 0.5}), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
                <div style={tileSheen()} />
                {glyphLeave < 0.95 ? (
                  <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 - glyphLeave, transform: `translateY(${-glyphLeave * 60}px) scale(${1 - glyphLeave * 0.3})`}}>
                    <Object3 image={card.image} kind={card.glyph} active={accent} size={objSize * 0.5} />
                  </div>
                ) : null}
              </div>
              {card.tag && tagIn > 0 ? (
                <div style={{position: 'absolute', left: 0, top: (rowBox.h - tagFont) / 2 - 10, fontFamily: FONT, fontSize: tagFont, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: accent ? ACCENT : INK, opacity: tagIn, filter: `blur(${(1 - tagIn) * 10}px)`, transform: `translateY(${(1 - tagIn) * 40}px)`, whiteSpace: 'nowrap'}}>
                  {card.tag.text}
                  {card.tag.underline ? (() => { const draw = markerDraw(frame, card.tag!.at + 22); const len = Math.round(card.tag!.text.length * HERO.word * 0.92); if (draw <= 0) return null; return (
                    <svg width={len} height={44} viewBox="0 0 252 44" preserveAspectRatio="none" style={{position: 'absolute', left: -6, bottom: -26, overflow: 'visible'}}>
                      <clipPath id={`ul-tag-${index}-${scene.id}`}><rect x={0} y={-20} width={draw * 258} height={60} /></clipPath>
                      <path d={markerStroke(252, 77, 1.6)} fill={accent ? ACCENT : INK} clipPath={`url(#ul-tag-${index}-${scene.id})`} opacity={0.85} />
                    </svg>); })() : null}
                </div>
              ) : null}
              <div style={{position: 'absolute', left: 260, top: 0, height: rowBox.h, display: 'flex', alignItems: 'center', fontFamily: FONT, fontSize: 54, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', color: INK, whiteSpace: 'pre-line', opacity: bigQ}}>
                {card.text}
              </div>
              <div style={{position: 'absolute', left: 560, top: 0, height: rowBox.h, display: 'flex', alignItems: 'center', fontFamily: FONT, fontSize: HERO.lead, fontWeight: 500, lineHeight: 1.25, letterSpacing: '-0.01em', color: accent ? 'rgba(245,245,247,.82)' : 'rgba(245,245,247,.62)', whiteSpace: 'nowrap', opacity: smallQ}}>
                {card.text.replace(/\n/g, '')}
              </div>
            </div>
            <div style={{position: 'absolute', inset: 0, opacity: collapse, ...surface(index === 1 ? 'fill' : 'glass', {radius: 22, accent: index === 1}), display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px', color: INK}}>
              {card.tag ? <div style={{padding: '5px 14px', ...accentPill('accent'), fontFamily: FONT, fontSize: 25, fontWeight: 700, whiteSpace: 'nowrap'}}>{card.tag.text}</div> : null}
              <div style={{fontFamily: FONT, fontSize: 25, fontWeight: 600, lineHeight: 1.18, letterSpacing: '-0.02em'}}>{card.text.replace(/\n/g, '')}</div>
            </div>
          </div>
        );
      })}
      {/* 右上角题头图标已撤：只是一块看不出含义的色块（2026-09-04 Scott）；scene.header 保留兼容旧分镜，不再上屏 */}
    </div>
  );
};
