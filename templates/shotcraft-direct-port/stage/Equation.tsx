// ============================================================
// 公式按口播顺序建立：先出第一项，说到关系词才出运算符，结果最后落定；
// 讲完后整块缩到真人前方作为公式提醒卡，当前项继续保留强调。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {EquationScene, EquationTerm} from './Plan';
import {ACCENT, Box, FONT, INK, REMINDER_SLOTS, accentPill, lerp, mixBox, progress, sharedProgress, stageOpacity, surface, tile, tileSheen, ON_ACCENT} from './theme';

const BOARD: Box = {x: 540, y: 190, w: 1326, h: 660, r: 28};
const MINI: Box = {...REMINDER_SLOTS[0], h: 250};
const TERM_SIZE = 58;
const OP_SIZE = 84;
const ROW_GAP = 196;

const textWidth = (text: string, size: number) => {
  let w = 0;
  for (const ch of text) w += /[　-鿿＀-￯]/.test(ch) ? size * 1.02 : size * 0.6;
  return w;
};

type Placed = {term: EquationTerm; x: number; w: number};

const layoutRow = (terms: EquationTerm[]): Placed[] => {
  const placed: Placed[] = [];
  let cursor = 0;
  for (const term of terms) {
    const isOp = term.kind === 'op';
    const w = isOp ? OP_SIZE * 1.05 : textWidth(term.text, TERM_SIZE) + 64;
    placed.push({term, x: cursor, w});
    cursor += w + 24;
  }
  return placed;
};

export const Equation: React.FC<{frame: number; scene: EquationScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const collapse = scene.collapseAt ? sharedProgress(frame, scene.collapseAt) : 0;
  const box = mixBox(BOARD, MINI, collapse);
  const scale = lerp(collapse, 1, MINI.w / BOARD.w);
  // 板子只在有内容时存在：自带玻璃板从第一个项出现前 10 帧起，不从场景起点起（2026-09-07 独立审片抓到 24s 空板 2.8s）
  const firstAt = Math.min(...scene.rows.flatMap((r) => r.terms.map((t) => t.at)));
  const opacity = stageOpacity(frame, Math.max(scene.start, firstAt - 10), scene.end, 16, 16);
  const rows = scene.rows.map((row) => layoutRow(row.terms));
  const rowsHeight = scene.rows.length * ROW_GAP - (ROW_GAP - 112);
  const topPad = (BOARD.h - rowsHeight) / 2;
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity, zIndex: 18}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: BOARD.w,
          height: BOARD.h,
          ...surface('glass', {radius: BOARD.r, accent: collapse > 0.5, soft: collapse < 0.5}),
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {rows.map((row, rowIndex) => {
          const rowW = row.length ? row[row.length - 1].x + row[row.length - 1].w : 0;
          const rowX = (BOARD.w - rowW) / 2;
          const rowY = topPad + rowIndex * ROW_GAP;
          return (
            <div key={rowIndex} style={{position: 'absolute', left: rowX, top: rowY, height: 112}}>
              {row.map(({term, x, w}) => {
                if (frame < term.at) return null;
                const pop = spring({frame: frame - term.at, fps, config: {damping: 12, stiffness: 160}});
                const isOp = term.kind === 'op';
                const isResult = term.kind === 'result';
                const active = isResult ? progress(frame, term.at, term.at + 16) : 0;
                return (
                  <div
                    key={`${term.text}-${term.at}`}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: 0,
                      width: w,
                      height: 112,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...(isOp ? {} : tile({radius: 22, active: isResult ? active : 0})),
                      color: isOp ? ACCENT : isResult ? (active > 0.5 ? ON_ACCENT : ACCENT) : INK, // 结果格激活成强调实底后字改深色（2026-09-06 Scott：36% 看不清）
                      fontFamily: FONT,
                      fontSize: isOp ? OP_SIZE : TERM_SIZE,
                      fontWeight: isOp ? 400 : 700,
                      letterSpacing: '-0.015em',
                      whiteSpace: 'nowrap',
                      transform: `translateY(${(1 - pop) * 16}px) scale(${0.92 + pop * 0.08})`,
                      opacity: pop,
                    }}
                  >
                    {isOp ? null : <div style={tileSheen()} />}
                    <span style={{position: 'relative'}}>{term.text}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* 缩小态角标：提示这是刚才的公式 */}
      {collapse > 0.6 ? (
        <div style={{position: 'absolute', left: 18, top: -18, padding: '6px 14px', ...accentPill('accent'), fontFamily: FONT, fontSize: 22, fontWeight: 700, opacity: (collapse - 0.6) / 0.4}}>
          刚才的算法
        </div>
      ) : null}
    </div>
  );
};
