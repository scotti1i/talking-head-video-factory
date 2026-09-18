import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {E, lerp, seg} from './Motion';
import {VISUAL_ROUTE} from './VisualRoute';

// GMV Max 29.47s–76.49s 连续关系场景。
// 运动源码移植：
// - DiagramCascadeBuild: damping 11 / stiffness 170、edge 提前 8f、16f draw-on、末尾 breathe。
// - SharedElementMorph: 25f cubic-bezier(0.4,0,0.2,1) 到 1.03，10f cubic settle。
// - BezierSourceConvergeMerge: 168f、四路曲线 draw-on、0.34–0.74 汇流、0.78–0.90 反向擦除。
// 原件与 SHA-256 记录在 vendor/video-shotcraft/scene-recipes/PROVENANCE.json。

export const CONTINUOUS_RELATION_DURATION = 1411;
export const CONTINUOUS_RELATION_SOURCE_START = 884;

const BG = '#0B0B0D';
const PANEL = '#111113';
const INK = '#F6F2E8';
const DIM = '#8D8B84';
const ACCENT = '#E6E893';
const RED = '#E98D77';
const FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';

type Box = {x: number; y: number; w: number; h: number; r: number};
type NodeKind = 'creator' | 'search' | 'click' | 'order' | 'ad' | 'organic';

const routeScene = (id: string) => {
  const scene = VISUAL_ROUTE.scenes.find((item) => item.id === id);
  if (!scene) throw new Error(`视觉路由缺少场景: ${id}`);
  return scene;
};

const QUESTION = routeScene('question-real-order');
const SEQUENCE = routeScene('sequence-last-click-path');
const FOCUS = routeScene('focus-remove-last-click');
const PARALLEL = routeScene('relationship-parallel-paths');
const CONVERGE = routeScene('relationship-many-to-one');
const CONCEPT = routeScene('definition-attribution-incrementality');

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const progress = (frame: number, start: number, end: number, easing = Easing.linear) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

// SharedElementMorph 的同一条位置/尺寸/圆角进度曲线。
const sharedProgress = (frame: number, start: number) => {
  const drive = interpolate(frame, [start, start + 25], [0, 1.03], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const settle = interpolate(frame, [start + 25, start + 35], [1.03, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return frame <= start + 25 ? drive : settle;
};

const mixBox = (a: Box, b: Box, p: number): Box => ({
  x: lerp(p, a.x, b.x),
  y: lerp(p, a.y, b.y),
  w: lerp(p, a.w, b.w),
  h: lerp(p, a.h, b.h),
  r: lerp(p, a.r, b.r),
});

const Speaker: React.FC<{frame: number}> = ({frame}) => {
  const hero: Box = {x: 54, y: 58, w: 604, h: 900, r: 30};
  const dock: Box = {x: 54, y: 118, w: 410, h: 728, r: 26};
  const focus: Box = {x: 54, y: 86, w: 520, h: 820, r: 28};
  const orb: Box = {x: 1638, y: 54, w: 226, h: 226, r: 113};
  const leftOrb: Box = {x: 54, y: 54, w: 226, h: 226, r: 113};
  const finalDock: Box = {x: 54, y: 120, w: 410, h: 728, r: 26};
  let box = hero;
  if (frame >= SEQUENCE.startFrame) box = mixBox(hero, dock, sharedProgress(frame, SEQUENCE.startFrame));
  if (frame >= FOCUS.startFrame) box = mixBox(dock, focus, sharedProgress(frame, FOCUS.startFrame));
  if (frame >= PARALLEL.startFrame) box = mixBox(focus, orb, sharedProgress(frame, PARALLEL.startFrame));
  const finalSpeakerStart = CONCEPT.startFrame + 144;
  if (frame >= finalSpeakerStart) box = mixBox(orb, leftOrb, sharedProgress(frame, finalSpeakerStart));
  if (frame >= finalSpeakerStart + 35) box = mixBox(leftOrb, finalDock, sharedProgress(frame, finalSpeakerStart + 35));
  const isOrb = box.w < 300;
  const glow = 0.18 + Math.sin(frame / 54) * 0.025;

  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: box.r,
        overflow: 'hidden',
        border: `2px solid ${ACCENT}`,
        boxShadow: `0 14px 34px rgba(0,0,0,.42), 0 0 26px rgba(230,232,147,${glow})`,
        zIndex: 30,
      }}
    >
      <OffthreadVideo
        src={staticFile('factory/aroll.mp4')}
        startFrom={CONTINUOUS_RELATION_SOURCE_START}
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: isOrb ? '50% 25%' : '50% 42%',
        }}
      />
      <div style={{position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)', borderRadius: box.r}} />
    </div>
  );
};

const Glyph: React.FC<{kind: NodeKind; active?: boolean}> = ({kind, active = false}) => {
  const stroke = active ? ACCENT : INK;
  const common = {fill: 'none', stroke, strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  if (kind === 'creator' || kind === 'organic') {
    return (
      <svg width="72" height="72" viewBox="0 0 72 72">
        <rect x="12" y="8" width="48" height="56" rx="10" {...common} />
        <path d="M30 25 L48 36 L30 47 Z" fill={active ? ACCENT : INK} stroke="none" />
        {kind === 'organic' ? <path d="M47 13 C55 15 58 21 57 28 C50 27 45 22 47 13 Z" fill={ACCENT} stroke="none" /> : null}
      </svg>
    );
  }
  if (kind === 'search') {
    return (
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="31" cy="31" r="19" {...common} />
        <path d="M45 45 L61 61" {...common} />
      </svg>
    );
  }
  if (kind === 'click') {
    return (
      <svg width="72" height="72" viewBox="0 0 72 72">
        <path d="M18 10 L54 38 L38 42 L48 60 L38 65 L28 46 L16 57 Z" {...common} />
      </svg>
    );
  }
  if (kind === 'ad') {
    return (
      <svg width="72" height="72" viewBox="0 0 72 72">
        <path d="M14 29 L44 17 L44 55 L14 43 Z" {...common} />
        <path d="M44 27 C55 30 58 42 44 46" {...common} />
        <path d="M19 44 L24 59 L35 56 L31 48" {...common} />
      </svg>
    );
  }
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <path d="M17 26 H55 L52 61 H20 Z" {...common} />
      <path d="M27 27 C27 10 45 10 45 27" {...common} />
      <path d="M29 43 L35 49 L46 37" {...common} />
    </svg>
  );
};

const RelationNode: React.FC<{
  frame: number;
  start: number;
  x: number;
  y: number;
  label: string;
  kind: NodeKind;
  active?: number;
  dim?: number;
  small?: boolean;
  badge?: string;
  badgeTone?: 'accent' | 'red';
}> = ({frame, start, x, y, label, kind, active = 0, dim = 0, small = false, badge, badgeTone = 'accent'}) => {
  const {fps} = useVideoConfig();
  if (frame < start) return null;
  const pop = spring({frame: frame - start, fps, config: {damping: 11, stiffness: 170}});
  const w = small ? 214 : 246;
  const h = small ? 150 : 172;
  const focusScale = 1 + active * 0.055;
  const opacity = 1 - dim * 0.68;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        transform: `scale(${pop * focusScale})`,
        transformOrigin: 'center',
        opacity,
        borderRadius: 20,
        background: PANEL,
        border: `${active > 0.2 ? 3 : 2}px solid ${active > 0.2 ? ACCENT : 'rgba(246,242,232,.34)'}`,
        boxShadow: active > 0.2
          ? '0 12px 30px rgba(0,0,0,.38), 0 0 25px rgba(230,232,147,.20)'
          : '0 10px 26px rgba(0,0,0,.32)',
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Glyph kind={kind} active={active > 0.2} />
      <div style={{fontFamily: FONT, fontWeight: 700, fontSize: small ? 29 : 32, lineHeight: 1.1}}>{label}</div>
      {badge ? (
        <div style={{position: 'absolute', right: -18, bottom: -16, padding: '9px 16px', borderRadius: 999, background: badgeTone === 'red' ? RED : ACCENT, color: BG, fontFamily: FONT, fontSize: 25, fontWeight: 800, boxShadow: '0 8px 18px rgba(0,0,0,.32)'}}>
          {badge}
        </div>
      ) : null}
    </div>
  );
};

const Edge: React.FC<{
  frame: number;
  childStart: number;
  from: {x: number; y: number};
  to: {x: number; y: number};
  active?: number;
  dim?: number;
  bend?: number;
  dashed?: boolean;
}> = ({frame, childStart, from, to, active = 0, dim = 0, bend = 0, dashed = false}) => {
  // DiagramCascadeBuild：线比子节点早 8f 开始，16f 完成，out-cubic。
  const grow = progress(frame, childStart - 8, childStart + 8, Easing.out(Easing.cubic));
  if (grow <= 0) return null;
  const midX = (from.x + to.x) / 2;
  const d = `M ${from.x} ${from.y} C ${midX} ${from.y + bend}, ${midX} ${to.y + bend}, ${to.x} ${to.y}`;
  return (
    <path
      d={d}
      fill="none"
      pathLength={1}
      stroke={active > 0.2 ? ACCENT : INK}
      strokeWidth={active > 0.2 ? 5 : 3.5}
      strokeLinecap="round"
      strokeDasharray={dashed ? '0.045 0.035' : 1}
      strokeDashoffset={1 - grow}
      opacity={(1 - dim * 0.72) * (0.55 + active * 0.45)}
      markerEnd={grow > 0.84 ? 'url(#relation-arrow)' : undefined}
    />
  );
};

const stageOpacity = (frame: number, start: number, end: number, enter = 18, exit = 18) =>
  progress(frame, start - enter, start, Easing.out(Easing.cubic)) * (1 - progress(frame, end, end + exit, Easing.in(Easing.cubic)));

const SharedOrder: React.FC<{frame: number}> = ({frame}) => {
  const question: Box = {x: 978, y: 392, w: 720, h: 230, r: 28};
  const sequence: Box = {x: 1518, y: 370, w: 248, h: 174, r: 20};
  const focus: Box = {x: 1240, y: 385, w: 300, h: 220, r: 24};
  const parallel: Box = {x: 1240, y: 402, w: 176, h: 176, r: 88};
  let box = question;
  if (frame >= SEQUENCE.startFrame) box = mixBox(question, sequence, sharedProgress(frame, SEQUENCE.startFrame));
  if (frame >= FOCUS.startFrame) box = mixBox(sequence, focus, sharedProgress(frame, FOCUS.startFrame));
  if (frame >= PARALLEL.startFrame) box = mixBox(focus, parallel, sharedProgress(frame, PARALLEL.startFrame));
  const questionOpacity = 1 - progress(frame, SEQUENCE.startFrame - 7, SEQUENCE.startFrame + 15, Easing.in(Easing.cubic));
  const iconOpacity = progress(frame, SEQUENCE.startFrame + 3, SEQUENCE.startFrame + 25, Easing.out(Easing.cubic));
  const focusActive = progress(frame, FOCUS.startFrame, FOCUS.startFrame + 22, Easing.out(Easing.cubic));
  const naturalActive = progress(frame, 760, 804, Easing.out(Easing.cubic));
  const active = Math.max(focusActive * (1 - progress(frame, 470, 500)), naturalActive);
  const opacity = 1 - progress(frame, CONVERGE.startFrame - 14, CONVERGE.startFrame + 18, Easing.in(Easing.cubic));
  const breathe = frame >= FOCUS.startFrame && frame < PARALLEL.startFrame ? 1 + Math.sin((frame - FOCUS.startFrame) / 24) * 0.011 : 1;
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r, background: PANEL, border: `${active > 0.12 ? 3 : 2}px solid ${active > 0.12 ? ACCENT : 'rgba(246,242,232,.38)'}`, boxShadow: active > 0.12 ? '0 18px 46px rgba(0,0,0,.46), 0 0 30px rgba(230,232,147,.18)' : '0 18px 46px rgba(0,0,0,.42)', opacity, transform: `scale(${breathe})`, transformOrigin: 'center', overflow: 'hidden', zIndex: 18}}>
      <div style={{position: 'absolute', inset: 0, opacity: questionOpacity, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 44px', textAlign: 'center', fontFamily: FONT, fontSize: 62, fontWeight: 800, color: INK, letterSpacing: '-0.04em'}}>
        一张真实的订单，可能是什么样？
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: iconOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4}}>
        <Glyph kind="order" active={active > 0.12} />
        {box.w > 205 ? <div style={{fontFamily: FONT, fontSize: 32, fontWeight: 800, color: INK}}>订单</div> : null}
        {frame >= 306 && frame < 382 ? <div style={{position: 'absolute', right: -2, bottom: 8, padding: '8px 14px', borderRadius: 999, background: ACCENT, color: BG, fontFamily: FONT, fontSize: 22, fontWeight: 800}}>全算广告的</div> : null}
      </div>
    </div>
  );
};

const SequenceStage: React.FC<{frame: number}> = ({frame}) => {
  if (frame < SEQUENCE.startFrame - 18 || frame >= FOCUS.startFrame + 24) return null;
  const opacity = stageOpacity(frame, SEQUENCE.startFrame, FOCUS.startFrame, 18, 24);
  return (
    <div style={{position: 'absolute', inset: 0, opacity, zIndex: 10}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <defs>
          <marker id="relation-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L5,2.5 z" fill={ACCENT} /></marker>
        </defs>
        <Edge frame={frame} childStart={170} from={{x: 773, y: 457}} to={{x: 837, y: 457}} />
        <Edge frame={frame} childStart={219} from={{x: 1113, y: 457}} to={{x: 1207, y: 457}} />
        <Edge frame={frame} childStart={278} from={{x: 1453, y: 457}} to={{x: 1518, y: 457}} active={progress(frame, 270, 294)} />
      </svg>
      <RelationNode frame={frame} start={SEQUENCE.startFrame} x={650} y={457} label="达人视频" kind="creator" />
      <RelationNode frame={frame} start={170} x={990} y={457} label="品牌搜索" kind="search" />
      <RelationNode frame={frame} start={219} x={1330} y={457} label="广告点击" kind="click" active={progress(frame, 219, 245)} />
    </div>
  );
};

const FocusStage: React.FC<{frame: number}> = ({frame}) => {
  if (frame < FOCUS.startFrame - 8 || frame >= PARALLEL.startFrame + 18) return null;
  const opacity = stageOpacity(frame, FOCUS.startFrame, PARALLEL.startFrame, 10, 18);
  const move = sharedProgress(frame, FOCUS.startFrame);
  const remove = progress(frame, 382, 474, Easing.inOut(Easing.cubic));
  const questionIn = progress(frame, 479, 505, Easing.out(Easing.cubic));
  const adX = lerp(move, 1207, 790);
  const adY = lerp(move, 371, 330);
  const lineGrow = progress(frame, FOCUS.startFrame + 4, FOCUS.startFrame + 22, Easing.out(Easing.cubic));
  return (
    <div style={{position: 'absolute', inset: 0, opacity, zIndex: 14}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <defs>
          <marker id="focus-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L5,2.5 z" fill={ACCENT} /></marker>
        </defs>
        <path d={`M ${adX + 246} ${adY + 86} C 1130 ${adY + 86}, 1160 495, 1240 495`} pathLength={1} fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - lineGrow + remove} opacity={1 - remove} markerEnd={lineGrow > 0.84 && remove < 0.3 ? 'url(#focus-arrow)' : undefined} />
      </svg>
      <div style={{position: 'absolute', left: adX, top: adY - remove * 84, width: 246, height: 172, opacity: 1 - remove, transform: `scale(${1 - remove * 0.28})`, borderRadius: 20, background: PANEL, border: `3px solid ${ACCENT}`, boxShadow: '0 14px 34px rgba(0,0,0,.38), 0 0 26px rgba(230,232,147,.16)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: INK}}>
        <Glyph kind="click" active />
        <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 32}}>广告点击</div>
      </div>
      <div style={{position: 'absolute', left: 812, top: 548, padding: '10px 20px', borderRadius: 999, background: PANEL, border: '2px solid rgba(246,242,232,.38)', color: INK, fontFamily: FONT, fontSize: 29, fontWeight: 800, opacity: progress(frame, 382, 410) * (1 - progress(frame, 505, 540)), transform: `translateY(${(1 - progress(frame, 382, 410)) * 18}px)`}}>
        没有最后点击
      </div>
      <div style={{position: 'absolute', left: 1070, top: 650, width: 640, textAlign: 'center', color: INK, fontFamily: FONT, fontSize: 55, lineHeight: 1.14, fontWeight: 800, opacity: questionIn, transform: `translateY(${(1 - questionIn) * 26}px)`}}>
        他可能也会买
      </div>
    </div>
  );
};

const ParallelStage: React.FC<{frame: number}> = ({frame}) => {
  if (frame < PARALLEL.startFrame - 18 || frame >= CONVERGE.startFrame + 20) return null;
  const opacity = stageOpacity(frame, PARALLEL.startFrame, CONVERGE.startFrame, 18, 20);
  const secondActive = progress(frame, 760, 822, Easing.out(Easing.cubic));
  const question = progress(frame, 830, 850, Easing.out(Easing.cubic));
  return (
    <div style={{position: 'absolute', inset: 0, opacity, zIndex: 11}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <defs>
          <marker id="relation-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L5,2.5 z" fill={ACCENT} /></marker>
        </defs>
        <Edge frame={frame} childStart={PARALLEL.startFrame - 20} from={{x: 553, y: 350}} to={{x: 597, y: 350}} dim={0.48} />
        <Edge frame={frame} childStart={PARALLEL.startFrame - 20} from={{x: 843, y: 350}} to={{x: 887, y: 350}} dim={0.48} />
        <Edge frame={frame} childStart={PARALLEL.startFrame - 20} from={{x: 1133, y: 350}} to={{x: 1240, y: 470}} dim={0.48} bend={18} />
        <Edge frame={frame} childStart={685} from={{x: 643, y: 700}} to={{x: 797, y: 700}} active={secondActive * 0.55} />
        <Edge frame={frame} childStart={721} from={{x: 1043, y: 700}} to={{x: 1240, y: 520}} active={secondActive} bend={-26} />
        {frame >= 806 ? <path d="M 520 614 C 760 560, 990 568, 1240 490" fill="none" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" strokeDasharray="12 14" opacity={question * 0.78} markerEnd="url(#relation-arrow)" /> : null}
      </svg>
      <RelationNode frame={frame} start={PARALLEL.startFrame - 35} x={430} y={350} label="达人视频" kind="creator" dim={0.48} small />
      <RelationNode frame={frame} start={PARALLEL.startFrame - 35} x={720} y={350} label="品牌搜索" kind="search" dim={0.48} small />
      <RelationNode frame={frame} start={PARALLEL.startFrame - 35} x={1010} y={350} label="广告点击" kind="click" dim={0.48} small />
      <RelationNode frame={frame} start={PARALLEL.startFrame} x={520} y={700} label="看过广告" kind="ad" active={secondActive * 0.75} badge={frame >= 622 ? '没点' : undefined} badgeTone="red" />
      <RelationNode frame={frame} start={685} x={920} y={700} label="自然视频" kind="organic" active={secondActive} />
      {frame >= 738 ? <div style={{position: 'absolute', left: 1060, top: 650, padding: '10px 18px', borderRadius: 999, background: ACCENT, color: BG, fontFamily: FONT, fontWeight: 800, fontSize: 25, transform: `scale(${spring({frame: frame - 738, fps: 30, config: {damping: 11, stiffness: 170}})})`}}>自然单</div> : null}
      {frame >= 830 ? <div style={{position: 'absolute', left: 1076, top: 505, width: 86, height: 86, borderRadius: 43, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PANEL, border: `3px solid ${ACCENT}`, color: ACCENT, fontFamily: FONT, fontSize: 54, fontWeight: 800, transform: `scale(${spring({frame: frame - 830, fps: 30, config: {damping: 11, stiffness: 170}})})`, boxShadow: '0 0 28px rgba(230,232,147,.22)'}}>?</div> : null}
    </div>
  );
};

type Pt = {x: number; y: number};
const CONVERGE_SOURCES = [
  {y: 250, label: '达人视频'},
  {y: 410, label: '品牌搜索'},
  {y: 570, label: '广告点击'},
  {y: 730, label: '自然视频'},
];
const CONVERGE_X = 1328;
const CONVERGE_Y = 490;
const SAMPLES = 1600;
const LINE_LEN = 384;
const cubic = (y0: number, u: number): Pt => {
  const v = 1 - u;
  return {
    x: v * v * v * 296 + 3 * v * v * u * 744 + 3 * v * u * u * 856 + u * u * u * CONVERGE_X,
    y: v * v * v * y0 + 3 * v * v * u * y0 + 3 * v * u * u * CONVERGE_Y + u * u * u * CONVERGE_Y,
  };
};
const makeGeom = (y0: number) => {
  const cum = [0];
  let px = 296;
  let py = y0;
  let acc = 0;
  for (let k = 1; k <= SAMPLES; k += 1) {
    const point = cubic(y0, k / SAMPLES);
    acc += Math.hypot(point.x - px, point.y - py);
    cum.push(acc);
    px = point.x;
    py = point.y;
  }
  const len = LINE_LEN + acc;
  const pointAt = (distance: number): Pt => {
    const targetDistance = clamp(distance, 0, len);
    if (targetDistance <= LINE_LEN) return {x: -88 + targetDistance, y: y0};
    const target = targetDistance - LINE_LEN;
    let lo = 0;
    let hi = SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const s0 = cum[i - 1];
    const s1 = cum[i];
    const u = (i - 1 + (s1 > s0 ? (target - s0) / (s1 - s0) : 0)) / SAMPLES;
    return cubic(y0, u);
  };
  let f0 = 0.2;
  for (let k = 1; k <= 40; k += 1) {
    const q = k / 40;
    if (pointAt(len * q).x >= 296) {
      f0 = q;
      break;
    }
  }
  return {len, pointAt, f0};
};
const CONVERGE_GEOMS = CONVERGE_SOURCES.map((source) => makeGeom(source.y));

const ConvergeStage: React.FC<{frame: number}> = ({frame}) => {
  if (frame < CONVERGE.startFrame || frame >= CONVERGE.endFrame) return null;
  const localFrame = frame - CONVERGE.startFrame;
  const t = clamp(localFrame / 167);
  const conv = seg(t, 0.34, 0.74, E.inOutCubic);
  const erase = seg(t, 0.78, 0.9, E.outQuad);
  const packetCycle = (seg(t, 0.1, 0.74, E.linear) * 2) % 1;
  const badgeIn = seg(t, 0.16, 0.26, E.outCubic);
  const badgeScale = lerp(badgeIn, 0.7, 1) * (1 + seg(t, 0.7, 0.78, E.outBack) * 0.12 - seg(t, 0.78, 0.86, E.outQuad) * 0.12);
  const captionIn = seg(t, 0.84, 0.9, E.outCubic);
  const stageOut = 1 - progress(frame, CONVERGE.endFrame - 16, CONVERGE.endFrame, Easing.in(Easing.cubic));
  return (
    <div style={{position: 'absolute', inset: 0, opacity: stageOut, zIndex: 14}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {CONVERGE_SOURCES.map((source, index) => {
          const {len} = CONVERGE_GEOMS[index];
          const draw = seg(t, 0.04 + index * 0.045, 0.21 + index * 0.045, E.outQuad);
          const offset = erase > 0 ? -erase * len : len * (1 - draw);
          return <path key={source.label} d={`M -88,${source.y} L 296,${source.y} C 744,${source.y} 856,${CONVERGE_Y} ${CONVERGE_X},${CONVERGE_Y}`} fill="none" stroke={INK} strokeWidth="4.8" strokeDasharray={len} strokeDashoffset={offset} opacity={draw * (1 - clamp((erase - 0.85) / 0.15))} />;
        })}
      </svg>
      {CONVERGE_SOURCES.map((source, index) => {
        const {len, pointAt, f0} = CONVERGE_GEOMS[index];
        const frac = f0 + (1 - f0) * conv;
        const point = pointAt(len * frac);
        const size = conv < 0.75 ? lerp(conv / 0.75, 172, 60) : lerp((conv - 0.75) / 0.25, 60, 0);
        const appear = seg(t, 0.02 + index * 0.04, 0.12 + index * 0.04, E.outCubic);
        const packetFraction = f0 + (1 - f0) * ((packetCycle + index * 0.13) % 1);
        const packet = pointAt(len * packetFraction);
        const packetOn = seg(t, 0.1, 0.16) * (1 - seg(t, 0.7, 0.76));
        return (
          <React.Fragment key={source.label}>
            <div style={{position: 'absolute', left: point.x - size / 2, top: point.y - size / 2, width: Math.max(0.1, size), height: Math.max(0.1, size), transform: `scale(${appear})`, opacity: appear * (conv > 0.92 ? clamp((1 - conv) / 0.08) : 1), borderRadius: '50%', background: PANEL, border: `2px solid rgba(246,242,232,.46)`, boxShadow: '0 12px 28px rgba(0,0,0,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, fontFamily: FONT, fontSize: Math.max(4, size * 0.2), fontWeight: 800, whiteSpace: 'nowrap'}}>{source.label}</div>
            <div style={{position: 'absolute', left: packet.x - 8, top: packet.y - 8, width: 16, height: 16, borderRadius: 8, background: ACCENT, boxShadow: '0 0 18px rgba(230,232,147,.55)', opacity: packetOn}} />
          </React.Fragment>
        );
      })}
      <div style={{position: 'absolute', left: CONVERGE_X - 88, top: CONVERGE_Y - 88, width: 176, height: 176, borderRadius: 88, background: PANEL, border: `3px solid ${ACCENT}`, boxShadow: '0 14px 34px rgba(0,0,0,.38), 0 0 28px rgba(230,232,147,.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: badgeIn, transform: `scale(${badgeScale})`}}>
        <Glyph kind="order" active />
        <div style={{fontFamily: FONT, color: INK, fontWeight: 800, fontSize: 28}}>订单</div>
      </div>
      <div style={{position: 'absolute', left: 1090, top: 640, width: 620, color: INK, fontFamily: FONT, fontSize: 48, lineHeight: 1.18, fontWeight: 800, opacity: captionIn}}>
        订单最后从哪里进来
      </div>
    </div>
  );
};

const ConceptStage: React.FC<{frame: number}> = ({frame}) => {
  const enterStart = CONCEPT.startFrame - 14;
  const returnFrame = CONCEPT.startFrame + 144;
  if (frame < enterStart) return null;
  const enter = progress(frame, enterStart, CONCEPT.startFrame + 6, Easing.out(Easing.cubic));
  const shift = frame >= returnFrame ? sharedProgress(frame, returnFrame) : 0;
  const left: Box = mixBox({x: 190, y: 274, w: 710, h: 470, r: 26}, {x: 500, y: 248, w: 630, h: 500, r: 26}, shift);
  const right: Box = mixBox({x: 1020, y: 274, w: 710, h: 470, r: 26}, {x: 1190, y: 248, w: 630, h: 500, r: 26}, shift);
  const forkGrow = progress(frame, enterStart + 4, CONCEPT.startFrame + 6, Easing.out(Easing.cubic));
  const adLeave = progress(frame, CONCEPT.startFrame - 12, CONCEPT.startFrame + 23, Easing.in(Easing.cubic));
  const leftFocus = progress(frame, returnFrame, returnFrame + 18, Easing.out(Easing.cubic));
  const attributionIn = progress(frame, 1322, 1340, Easing.out(Easing.cubic));
  const incrementIn = progress(frame, 1374, 1392, Easing.out(Easing.cubic));
  const headerOut = 1 - progress(frame, returnFrame, returnFrame + 8, Easing.in(Easing.cubic));
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter, zIndex: 16}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: headerOut}}>
        <path d={`M 960 188 C 960 220, ${left.x + left.w / 2} 220, ${left.x + left.w / 2} ${left.y}`} pathLength={1} stroke={INK} strokeWidth="4" fill="none" strokeDasharray={1} strokeDashoffset={1 - forkGrow} opacity=".62" />
        <path d={`M 960 188 C 960 220, ${right.x + right.w / 2} 220, ${right.x + right.w / 2} ${right.y}`} pathLength={1} stroke={ACCENT} strokeWidth="4" fill="none" strokeDasharray={1} strokeDashoffset={1 - forkGrow} opacity=".9" />
      </svg>
      <div style={{position: 'absolute', left: 872, top: 58, width: 176, height: 152, borderRadius: 24, background: PANEL, border: `3px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: headerOut, transform: `scale(${spring({frame: frame - enterStart, fps: 30, config: {damping: 11, stiffness: 170}})})`, boxShadow: '0 12px 30px rgba(0,0,0,.34)'}}>
        <Glyph kind="order" active />
      </div>
      {[{box: left, accent: false, text: '订单最后\n从哪里进来'}, {box: right, accent: true, text: '没有这笔广告费\n他还会不会买'}].map(({box, accent, text}, index) => (
        <div key={text} style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r, background: PANEL, border: `${accent || (index === 0 && leftFocus > 0.2) ? 3 : 2}px solid ${accent || (index === 0 && leftFocus > 0.2) ? ACCENT : 'rgba(246,242,232,.34)'}`, boxShadow: accent ? '0 16px 40px rgba(0,0,0,.38), 0 0 26px rgba(230,232,147,.13)' : '0 16px 40px rgba(0,0,0,.38)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, color: INK, transform: `translateY(${(1 - enter) * 44}px) scale(${0.97 + enter * 0.03})`}}>
          {index === 1 ? (
            <div style={{position: 'relative', width: 142, height: 112}}>
              {adLeave < 0.95 ? <div style={{position: 'absolute', inset: 0, opacity: 1 - adLeave, transform: `translateY(${-adLeave * 62}px) scale(${1 - adLeave * 0.35})`}}><Glyph kind="ad" active /></div> : null}
              <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: adLeave, color: ACCENT, fontFamily: FONT, fontSize: 96, fontWeight: 800}}>?</div>
            </div>
          ) : <Glyph kind="order" active={leftFocus > 0.2} />}
          <div style={{whiteSpace: 'pre-line', textAlign: 'center', fontFamily: FONT, fontSize: 49, fontWeight: 800, lineHeight: 1.24, letterSpacing: '-0.035em'}}>{text}</div>
          {index === 0 && attributionIn > 0 ? <div style={{position: 'absolute', left: 34, top: 30, padding: '10px 22px', borderRadius: 999, background: ACCENT, color: BG, fontFamily: FONT, fontSize: 32, fontWeight: 900, transform: `scale(${attributionIn})`, transformOrigin: 'left center'}}>归因</div> : null}
          {index === 1 && incrementIn > 0 ? <div style={{position: 'absolute', left: 34, top: 30, padding: '10px 22px', borderRadius: 999, background: ACCENT, color: BG, fontFamily: FONT, fontSize: 32, fontWeight: 900, transform: `scale(${incrementIn})`, transformOrigin: 'left center'}}>增量</div> : null}
        </div>
      ))}
    </div>
  );
};

const CAPTIONS = [
  [0, 79, '但你仔细想一下，一张真实的订单可能是什么样'],
  [79, 170, '这个人昨天可能先刷到了一个达人视频'],
  [170, 219, '然后今天去搜了你的品牌'],
  [219, 294, '最后下单之前点了一次广告'],
  [294, 382, '按照刚才那个算法，这张订单全算广告的'],
  [382, 479, '可就算没有最后那次点击'],
  [479, 563, '他可能也会买，这事你不知道'],
  [563, 622, '还有一些人看过广告'],
  [622, 685, '但是当时没点。过了两天之后'],
  [685, 721, '他刷到一个自然视频'],
  [721, 779, '他下单了。按照刚才的算法'],
  [779, 830, '它又成了自然单'],
  [830, 909, '可前面那次广告到底有没有影响他'],
  [909, 1017, '你还是不知道。所以这个公式能告诉你的，是订单最后从哪里进来的'],
  [1017, 1126, '它回答不了另一个问题'],
  [1126, 1186, '就是如果没有了这笔广告费'],
  [1186, 1282, '这个人还会不会买？做广告的时候'],
  [1282, 1322, '我们把前者这个东西啊'],
  [1322, 1411, '我们叫归因，后面这个才叫增量'],
] as const;

const Caption: React.FC<{frame: number}> = ({frame}) => {
  const caption = CAPTIONS.find(([start, end]) => frame >= start && frame < end);
  if (!caption) return null;
  const [start, end, text] = caption;
  const fade = Math.min(progress(frame, start, start + 4), 1 - progress(frame, end - 4, end));
  return (
    <div style={{position: 'absolute', left: 150, right: 150, bottom: 34, minHeight: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#FFFFFF', fontFamily: FONT, fontSize: 56, fontWeight: 750, lineHeight: 1.16, letterSpacing: '-0.025em', textShadow: '0 3px 3px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.7)', opacity: fade, zIndex: 80}}>
      {text}
    </div>
  );
};

export const ContinuousRelationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const bgScale = interpolate(frame, [0, durationInFrames - 1], [1.02, 1.055], {extrapolateRight: 'clamp'});
  const glowX = interpolate(frame, [0, durationInFrames - 1], [-80, 120], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: BG, overflow: 'hidden'}}>
      <Audio src={staticFile('factory/aroll.mp4')} startFrom={CONTINUOUS_RELATION_SOURCE_START} />
      <div style={{position: 'absolute', inset: -50, transform: `scale(${bgScale})`, opacity: 0.2, filter: 'blur(34px) saturate(.72) brightness(.58)'}}>
        <OffthreadVideo src={staticFile('factory/aroll.mp4')} startFrom={CONTINUOUS_RELATION_SOURCE_START} muted style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 38%'}} />
      </div>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(11,11,13,.74)'}} />
      <div style={{position: 'absolute', left: glowX, top: 140, width: 880, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,232,147,.10), rgba(230,232,147,0) 68%)'}} />
      <div style={{position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'radial-gradient(rgba(246,242,232,.45) .7px, transparent .7px)', backgroundSize: '8px 8px'}} />

      <SequenceStage frame={frame} />
      <FocusStage frame={frame} />
      <ParallelStage frame={frame} />
      <SharedOrder frame={frame} />
      <ConvergeStage frame={frame} />
      <ConceptStage frame={frame} />
      <Speaker frame={frame} />
      <Caption frame={frame} />
    </AbsoluteFill>
  );
};
