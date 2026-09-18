// ============================================================
// 真人 + 单个概念标签：只命名当下对象，不把整段口播排成大卡
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {LabelScene} from './Plan';
import {FONT, INK, ON_ACCENT, accentPill, inCubic, progress, surface, toneColor} from './theme';
import {blurSlide, markerDraw, markerStroke, odometerPos} from './motions';

// OdometerDigitRoll：每个数位是一条 0–9 纵向 strip，高速滚动后逐位减速过冲锁定，滚动期叠错帧残影
const Odometer: React.FC<{text: string; frame: number; at: number; fontSize: number; color: string}> = ({text, frame, at, fontSize, color}) => {
  const ROW = Math.round(fontSize * 1.1);
  const DW = Math.round(fontSize * 0.66);
  let digitIndex = 0;
  return (
    <div style={{display: 'flex', alignItems: 'center', height: ROW}}>
      {text.split('').map((ch, k) => {
        if (!/[0-9]/.test(ch)) return <span key={k} style={{fontSize, lineHeight: `${ROW}px`, color}}>{ch}</span>;
        const i = digitIndex++;
        const pos = odometerPos(frame, at, i, Number(ch));
        const speed = Math.abs(pos - odometerPos(frame - 1, at, i, Number(ch)));
        const gate = Math.min(1, Math.max(0, (speed - 0.06) / 0.44));
        const strip = (dy: number, opacity: number, key: string) => (
          <div key={key} style={{position: 'absolute', left: 0, top: 0, width: DW, transform: `translateY(${-(pos % 10) * ROW + dy}px)`, opacity}}>
            {Array.from({length: 20}).map((_, j) => <div key={j} style={{width: DW, height: ROW, lineHeight: `${ROW}px`, textAlign: 'center', fontSize, fontVariantNumeric: 'tabular-nums', color}}>{j % 10}</div>)}
          </div>
        );
        return (
          <div key={k} style={{position: 'relative', width: DW, height: ROW, overflow: 'hidden'}}>
            {gate > 0.001 ? [strip(ROW * 0.5, 0.25 * gate, 'g1'), strip(-ROW * 0.5, 0.12 * gate, 'g2')] : null}
            {strip(0, 1, 'main')}
          </div>
        );
      })}
    </div>
  );
};

export const Label: React.FC<{frame: number; scene: LabelScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 20, transformStyle: 'preserve-3d'}}>
      {scene.items.map((item) => {
        if (frame < item.at) return null;
        const pop = spring({frame: frame - item.at, fps, config: {damping: 11, stiffness: 170}});
        const until = Math.min(item.until ?? scene.end, scene.end);
        const out = progress(frame, until, until + 14, inCubic);
        if (out >= 1) return null;
        const accent = item.tone === 'accent';
        const size = item.size ?? 'm';
        const fontSize = size === 's' ? 28 : size === 'l' ? 48 : size === 'xl' ? 120 : size === 'giant' ? 240 : 34;
        const pad = size === 's' ? '10px 20px' : size === 'l' ? '16px 36px' : size === 'xl' || size === 'giant' ? '0' : '13px 26px';
        const hero = size === 'xl' || size === 'giant';
        const form = item.form ?? (accent ? 'fill' : 'glass');
        const styled = hero ? {} : accent && form === 'fill' ? accentPill('accent') : surface(form, {radius: 999, accent: item.tone === 'red'});
        const heroReveal = hero ? blurSlide(frame, item.at, 16, 40) : null;
        const underlineLen = Math.round(item.text.length * fontSize * 0.98);
        const underlineDraw = item.underline ? markerDraw(frame, item.at + 22) : 0;
        return (
          <div
            key={`${item.text}-${item.at}`}
            style={{
              position: 'absolute',
              left: item.x,
              top: item.y,
              padding: pad,
              ...styled,
              color: hero ? toneColor(item.tone, INK) : accent && form === 'fill' ? ON_ACCENT : toneColor(item.tone, INK),
              fontFamily: FONT,
              fontSize,
              fontWeight: hero ? 800 : 600,
              letterSpacing: hero ? '-0.05em' : '-0.015em',
              lineHeight: 1,
              transform: `${item.anchor === 'center' ? 'translateX(-50%) ' : ''}${heroReveal ? heroReveal.transform : `translateY(${(1 - pop) * 18}px) scale(${0.9 + pop * 0.1})`}`,
              filter: heroReveal ? heroReveal.filter : undefined,
              transformOrigin: item.anchor === 'center' ? 'center' : 'left center',
              marginLeft: item.anchor === 'center' ? undefined : 0,
              opacity: (heroReveal ? heroReveal.opacity : pop) * (1 - out),
              whiteSpace: 'nowrap',
            }}
          >
            {item.odometer && hero ? <Odometer text={item.text} frame={frame} at={item.at} fontSize={fontSize} color={toneColor(item.tone, INK)} /> : item.text}
            {item.underline && underlineDraw > 0 ? (
              <svg width={underlineLen} height={44} viewBox="0 0 252 44" preserveAspectRatio="none" style={{position: 'absolute', left: -6, bottom: -18, overflow: 'visible'}}>
                <clipPath id={`ul-${item.at}`}><rect x={0} y={-20} width={underlineDraw * 258} height={60} /></clipPath>
                <path d={markerStroke(252, 77)} fill={toneColor(item.tone, INK)} clipPath={`url(#ul-${item.at})`} opacity={0.9} />
              </svg>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
