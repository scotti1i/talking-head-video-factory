// ============================================================
// 左人物右大卡的数据聚焦：白色数据卡获得最大阅读面积，区间高亮跟着口播累积，
// 变量锁定以标签形式落在卡底，异常（大促 / 爆视频）以红色尖峰 + 判定进入，
// 读完后白卡撤走，曲线轮廓留在真人画面上提醒仍在谈同一张图。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {DataScene} from './Plan';
import {Impact} from './Fx';
import {ACCENT, BG, Box, FONT, INK, NUM_FONT, PAPER, PAPER_INK, RED, SHADOW_DEEP, inCubic, lerp, outCubic, progress, stageOpacity} from './theme';

const CARD: Box = {x: 520, y: 70, w: 1346, h: 810, r: 28};
const PLOT = {x: 96, y: 226, w: 1170, h: 410}; // 相对卡片
const BLUE = '#EADFC5';
const YELLOW = 'rgba(214,178,94,.20)';
const MUTED = 'rgba(243,239,230,.55)';

export const DataFocus: React.FC<{frame: number; scene: DataScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const opacity = stageOpacity(frame, scene.start, scene.end, 18, 18);
  const escape = scene.escapeAt ? progress(frame, scene.escapeAt, scene.escapeAt + 24, inCubic) : 0;
  const enter = progress(frame, scene.start, scene.start + 18, outCubic);
  const draw = progress(frame, scene.start + 6, scene.start + 46, outCubic);
  const n = scene.series.length;
  const px = (i: number) => PLOT.x + (i / (n - 1)) * PLOT.w;
  const py = (v: number) => PLOT.y + PLOT.h - v * PLOT.h;
  const fracX = (f: number) => PLOT.x + f * PLOT.w;
  const values = scene.series.map((v, i) => {
    const spike = scene.spikes?.find((s) => s.index === i);
    if (!spike || frame < spike.at) return v;
    const p = spring({frame: frame - spike.at, fps, config: {damping: 9, stiffness: 150}});
    return lerp(p, v, spike.value);
  });
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(v)}`).join(' ');
  const lineColor = escape > 0 ? `rgba(230,232,147,${0.4 + escape * 0.5})` : BLUE;
  const verdictOn = scene.verdict ? progress(frame, scene.verdict.at, scene.verdict.at + 16, outCubic) : 0;
  return (
    <div style={{position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, opacity, transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + enter * 0.04})`, transformOrigin: 'center', zIndex: 16}}>
      {/* 白卡 */}
      <div style={{position: 'absolute', inset: 0, borderRadius: CARD.r, background: '#141416', boxShadow: `${SHADOW_DEEP}, inset 0 0 0 1px rgba(214,178,94,.3), inset 0 0 0 5px #141416, inset 0 0 0 6px rgba(255,255,255,.07)`, opacity: 1 - escape}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 60, textAlign: 'center', fontFamily: FONT, fontSize: 40, fontWeight: 700, color: INK, letterSpacing: '-0.02em'}}>{scene.title}</div>
        <svg width={CARD.w} height={CARD.h} style={{position: 'absolute', inset: 0}}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={PLOT.x} x2={PLOT.x + PLOT.w} y1={py(g)} y2={py(g)} stroke="rgba(243,239,230,.10)" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '6 8'} />
          ))}
          {scene.highlights?.map((h) => {
            if (frame < h.at) return null;
            const grow = progress(frame, h.at, h.at + 20, outCubic);
            const until = h.until ? 1 - progress(frame, h.until, h.until + 12, inCubic) : 1;
            const x0 = fracX(h.range[0]);
            const w = (fracX(h.range[1]) - x0) * grow;
            const fill = h.tone === 'red' ? 'rgba(233,141,119,.35)' : YELLOW;
            const desat = verdictOn > 0 && h.tone !== 'red' ? 0.45 : 0;
            return (
              <g key={`${h.label}-${h.at}`} opacity={until * (1 - desat)}>
                <rect x={x0} y={PLOT.y - 10} width={w} height={PLOT.h + 10} fill={fill} rx={6} />
                <text x={x0 + 16} y={PLOT.y + PLOT.h - 18} fontFamily={FONT} fontSize={28} fontWeight={700} fill={MUTED} opacity={grow}>{h.label}</text>
              </g>
            );
          })}
          {scene.marker && frame >= scene.marker.at ? (
            <g opacity={progress(frame, scene.marker.at, scene.marker.at + 14, outCubic)}>
              <line x1={fracX(scene.marker.xFrac)} x2={fracX(scene.marker.xFrac)} y1={PLOT.y - 40} y2={PLOT.y + PLOT.h} stroke={ACCENT} strokeWidth={2} strokeDasharray="10 8" opacity={0.8} />
            </g>
          ) : null}
        </svg>
        {scene.marker && frame >= scene.marker.at ? (
          <div style={{position: 'absolute', left: fracX(scene.marker.xFrac) - 10, top: PLOT.y - 78, padding: '6px 16px', borderRadius: 10, background: ACCENT, color: '#141416', fontFamily: FONT, fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap', transform: `scale(${spring({frame: frame - scene.marker.at, fps, config: {damping: 12, stiffness: 170}})})`, transformOrigin: 'left center'}}>
            {scene.marker.label}
          </div>
        ) : null}
        {scene.delta && frame >= scene.delta.at && (!scene.delta.until || frame < scene.delta.until) ? (
          <div style={{position: 'absolute', left: PLOT.x + PLOT.w - 250, top: PLOT.y + 40, padding: '8px 18px', borderRadius: 999, background: ACCENT, color: '#141416', fontFamily: FONT, fontSize: 28, fontWeight: 800, whiteSpace: 'nowrap', transform: `scale(${spring({frame: frame - scene.delta.at, fps, config: {damping: 11, stiffness: 170}})})`, boxShadow: '0 8px 18px rgba(0,0,0,.18)', opacity: scene.delta.until ? 1 - progress(frame, scene.delta.until - 12, scene.delta.until, inCubic) : 1}}>
            {scene.delta.text}
          </div>
        ) : null}
        <div style={{position: 'absolute', left: 64, bottom: 54, display: 'flex', gap: 16}}>
          {scene.chips?.map((chip) => {
            if (frame < chip.at) return null;
            const pop = spring({frame: frame - chip.at, fps, config: {damping: 12, stiffness: 170}});
            return (
              <div key={`${chip.text}-${chip.at}`} style={{padding: '10px 22px', borderRadius: 999, background: chip.tone === 'accent' ? ACCENT : 'rgba(243,239,230,.08)', border: chip.tone === 'accent' ? 'none' : '1px solid rgba(243,239,230,.18)', color: chip.tone === 'accent' ? '#141416' : INK, fontFamily: FONT, fontSize: 28, fontWeight: 700, transform: `translateY(${(1 - pop) * 16}px) scale(${0.9 + pop * 0.1})`, opacity: pop, whiteSpace: 'nowrap'}}>
                {chip.text}
              </div>
            );
          })}
        </div>
        {scene.verdict ? (
          <div style={{position: 'absolute', left: PLOT.x + PLOT.w / 2 - 240, top: PLOT.y + PLOT.h / 2 - 44, width: 480, padding: '14px 0', textAlign: 'center', borderRadius: 16, background: scene.verdict.tone === 'red' ? RED : ACCENT, color: '#141416', fontFamily: FONT, fontSize: 40, fontWeight: 900, opacity: verdictOn, transform: `scale(${0.9 + verdictOn * 0.1})`, boxShadow: '0 12px 30px rgba(0,0,0,.22)'}}>
            {scene.verdict.text}
          </div>
        ) : null}
      </div>
      {/* 曲线（白卡撤走后仍留在画面上） */}
      <svg width={CARD.w} height={CARD.h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <path d={path} fill="none" stroke={lineColor} strokeWidth={escape > 0 ? 4 : 4.5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        {values.map((v, i) => {
          const spike = scene.spikes?.find((s) => s.index === i);
          const on = draw >= (i / (n - 1)) - 0.01;
          const isSpike = spike && frame >= spike.at;
          return <circle key={i} cx={px(i)} cy={py(v)} r={isSpike ? 9 : 4.5} fill={isSpike ? RED : lineColor} opacity={on ? 1 : 0} />;
        })}
      </svg>
      {scene.spikes?.map((spike) => {
        if (frame < spike.at) return null;
        const pop = spring({frame: frame - spike.at, fps, config: {damping: 11, stiffness: 170}});
        return (
          <React.Fragment key={`${spike.label}-${spike.at}`}>
            <div style={{position: 'absolute', left: px(spike.index) - 90, top: py(spike.value) - 66, width: 180, textAlign: 'center', padding: '6px 0', borderRadius: 999, background: RED, color: '#141416', fontFamily: FONT, fontSize: 26, fontWeight: 800, transform: `scale(${pop})`, opacity: 1 - escape, whiteSpace: 'nowrap'}}>
              {spike.label}
            </div>
            <div style={{position: 'absolute', left: -CARD.x, top: -CARD.y}}>
              <Impact frame={frame} at={spike.at + 1} x={CARD.x + px(spike.index)} y={CARD.y + py(spike.value)} tone="red" radius={70} />
            </div>
          </React.Fragment>
        );
      })}
      <div style={{position: 'absolute', left: 8, top: PLOT.y + PLOT.h + 30, fontFamily: NUM_FONT, fontSize: 1, color: INK, opacity: 0}}>.</div>
    </div>
  );
};
