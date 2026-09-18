import React from 'react';
import {Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CamKey, PageCam} from '../aifl/live/PageCam';
import layout from '../aifl/live-layout.json';

export type ListStackItem = {title: string; meta?: string};
export type ListStackProps = {
  title: string;
  kicker?: string;
  counterLabel?: string;
  items: ListStackItem[];
  fontFamily?: string;
};

const CARDS = layout.papers.cards;
const PAGE_H = layout.papers.pageH;
const CUES = [18, 30, 42, 54, 66];
const DUR = 22;
const TILTS = [2, -2, 2, -2, 2];
const FLY_EASE = Easing.bezier(0.45, 0.05, 0.25, 1.12);
const CAMERA_EASE = Easing.bezier(0.33, 0, 0.15, 1);
const CAMERA_KEYS: CamKey[] = [
  {frame: 0, cx: 960, cy: 270, zoom: 1.35},
  {frame: 30, cx: 960, cy: 330, zoom: 1.15},
  {frame: 36, cx: 960, cy: 520, zoom: 1.02},
  {frame: 74, cx: 960, cy: 820, zoom: 0.95},
  {frame: 100, cx: 960, cy: 860, zoom: 0.9},
];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const AMBER = 'oklch(52% 0.115 65)';
const INK = 'oklch(18% 0.006 82)';
const MUTED = 'oklch(50% 0.006 82)';
const PAPER = '#faf7f2';

// 上游 DigitRoll 用全局 frame 计算新数字，会短暂滚出与 landedCount
// 无关的值。保留原计数器位置和曲线，只在真实落地数量之间切换。
const StableLandedCounter: React.FC<{count: number; frame: number}> = ({count, frame}) => {
  const changeFrame = count > 0 ? CUES[count - 1] + DUR : -100;
  const progress = count > 0
    ? interpolate(frame, [changeFrame, changeFrame + 7], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.25, 0.8, 0.25, 1),
      })
    : 1;
  const lineH = 108;
  const previous = Math.max(0, count - 1);

  return (
    <span style={{position: 'relative', display: 'inline-block', overflow: 'hidden', width: 112, height: lineH, verticalAlign: 'bottom'}}>
      {count > 0 && progress < 1 ? (
        <span style={{position: 'absolute', inset: 0, transform: `translateY(${-progress * lineH}px)`, fontFamily: MONO, fontSize: 94, lineHeight: `${lineH}px`, color: AMBER, fontVariantNumeric: 'tabular-nums'}}>{previous}</span>
      ) : null}
      <span style={{position: 'absolute', inset: 0, transform: `translateY(${count > 0 ? (1 - progress) * lineH : 0}px)`, fontFamily: MONO, fontSize: 94, lineHeight: `${lineH}px`, color: AMBER, fontVariantNumeric: 'tabular-nums'}}>{count}</span>
    </span>
  );
};

// ScenePapers 的直接内容移植：PageCam、页面尺寸、卡片坐标、五段镜头、
// 12f 错峰、22f 落地、交替倾角、堆叠下压与扫光均来自上游。
// 唯一替换的是原截图和 paperN.png 中烘焙死的文字内容。
export const FactoryListStack: React.FC<ListStackProps> = ({
  title,
  kicker = '信息输入',
  counterLabel = '项已纳入',
  items,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const visibleItems = items.slice(0, 5);
  const serif = fontFamily || 'Songti SC, STSong, serif';
  const landedCount = CUES.slice(0, visibleItems.length).filter((cue) => frame >= cue + DUR).length;
  const stackPress = (settledIndex: number) => {
    let press = 0;
    for (let j = settledIndex + 1; j < visibleItems.length; j += 1) {
      press = Math.max(press, interpolate(frame, [CUES[j], CUES[j] + 4, CUES[j] + 8], [0, 6, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }));
    }
    return press;
  };
  const glazeX = interpolate(frame, [82, 96], [-700, 2600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.35, 1),
  });
  const glazeVis = interpolate(frame, [81, 86, 92, 95], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <>
      <Sequence from={3}><Audio src={staticFile('audio/transition-soft.mp3')} volume={0.45}/></Sequence>
      <Sequence from={28}><Audio src={staticFile('audio/click-camera.mp3')} volume={0.45}/></Sequence>

      <PageCam
        src="textures/live/papers-full.png"
        pageH={PAGE_H}
        keys={CAMERA_KEYS}
        ease={CAMERA_EASE}
      >
        {/* 覆盖上游截图中的固定英文；相机与页面坐标仍由上游 PageCam 驱动。 */}
        <div style={{position: 'absolute', inset: 0, background: PAPER}}/>

        <header style={{position: 'absolute', left: 408, top: 72, width: 1104, color: INK}}>
          <div style={{fontFamily: MONO, fontSize: 17, letterSpacing: '0.14em', color: MUTED}}>{kicker}</div>
          <div style={{marginTop: 12, fontFamily: serif, fontSize: 46, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15}}>{title}</div>
          <div style={{position: 'absolute', top: 16, right: 0, width: 90, height: 2, background: AMBER}}/>
        </header>

        {visibleItems.map((item, i) => {
          const c = CARDS[i];
          const cue = CUES[i];
          const t = interpolate(frame, [cue, cue + DUR], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: FLY_EASE,
          });
          if (t <= 0) return null;
          const settled = t >= 0.999;
          const dy = 600 * (1 - t) + (settled ? stackPress(i) : 0);
          const rot = TILTS[i] * (1 - t);
          const scale = 1.06 - 0.06 * t;
          const shadow = settled
            ? '0 2px 8px rgba(60,45,30,.10)'
            : `0 32px 64px rgba(60,45,30,${0.22 * (1 - t) + 0.06})`;
          const highlightStart = cue + DUR;
          const highlightGrow = interpolate(frame, [highlightStart, highlightStart + 7], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.3, 0, 0.2, 1),
          });
          const highlightFade = interpolate(frame, [highlightStart + 7, highlightStart + 12], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div key={`${item.title}-${i}`} style={{position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, transform: `translateY(${dy}px) rotate(${rot}deg) scale(${scale})`, transformOrigin: 'center center', boxShadow: shadow, borderRadius: 12, background: '#fff', border: '1px solid rgba(78,58,32,.14)', overflow: 'hidden'}}>
              <div style={{position: 'absolute', left: 22, top: 24, fontFamily: MONO, fontSize: 17, color: MUTED}}>
                #{String(i + 1).padStart(2, '0')}
              </div>
              <div style={{position: 'absolute', left: 112, top: item.meta ? 22 : 78, right: 34, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: serif, fontSize: item.meta ? 35 : 42, fontWeight: 600, color: INK}}>
                {item.title}
              </div>
              {item.meta ? (
                <>
                  <div style={{position: 'absolute', left: 22, right: 22, top: 92, height: 1, background: 'rgba(78,58,32,.12)'}}/>
                  <div style={{position: 'absolute', left: 22, right: 28, top: 132, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: serif, fontSize: 24, color: AMBER}}>{item.meta}</div>
                </>
              ) : null}
              {highlightGrow > 0 && highlightFade > 0 ? (
                <div style={{position: 'absolute', left: item.meta ? 20 : 108, top: item.meta ? c.h * 0.72 : 128, width: `${highlightGrow * (item.meta ? 40 : 48)}%`, height: item.meta ? 30 : 24, background: 'oklch(97% 0.028 85)', opacity: 0.6 * highlightFade, borderRight: `2px solid ${AMBER}`, pointerEvents: 'none'}}/>
              ) : null}
            </div>
          );
        })}

        <div style={{position: 'absolute', top: 40, height: PAGE_H - 80, left: glazeX, width: 420, transform: 'rotate(14deg)', opacity: glazeVis * 0.5, mixBlendMode: 'overlay', background: 'linear-gradient(90deg, transparent, rgba(255,240,214,.9) 45%, rgba(255,240,214,.9) 55%, transparent)', pointerEvents: 'none'}}/>
      </PageCam>

      {/* 与上游一致：计数器固定在屏幕坐标，不跟随页面相机。 */}
      <div style={{position: 'absolute', top: 70, right: 96, textAlign: 'right', pointerEvents: 'none'}}>
        <div style={{fontFamily: MONO, fontSize: 24, letterSpacing: '0.16em', color: MUTED}}>{kicker}</div>
        <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 6}}>
          <StableLandedCounter count={landedCount} frame={frame}/>
        </div>
        <div style={{fontFamily: MONO, fontSize: 20, letterSpacing: '0.12em', color: MUTED, marginTop: 4}}>{counterLabel}</div>
      </div>
    </>
  );
};
