// ============================================================
// 持续生长的关系图：同一张画布上节点按口播出现、换位、聚焦、降暗、判定、移除，
// 连线从对象边缘出发、在下一个对象边缘结束并带完整箭头。
// 运动源码：DiagramCascadeBuild（节点弹簧 / 连线早 8f 描线 16f）、SharedElementMorph（换位）。
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {GraphEdge, GraphNode, GraphNote, GraphScene} from './Plan';
import {Glyph, Object3} from './Glyph';
import {Impact} from './Fx';
import {burstAngles, contactLift, flyline, popBurst, slamEnter} from './motions';
import {ACCENT, Box, FONT, INK, ON_ACCENT, RED as RED_FX, accentPill, inCubic, inOutCubic, lerp, mixBox, outCubic, progress, sharedProgress, stageOpacity, surface, tile, tileSheen, toneColor, toneTile, windowLevel} from './theme';
import {CANVAS} from './Canvas';

const nodeSize = (node: GraphNode, text?: string) => {
  if (text) return {w: node.w ?? 720, h: node.h ?? 230, r: node.r ?? 30};
  if (node.shape === 'circle') return {w: node.w ?? (node.small ? 150 : 186), h: node.h ?? (node.small ? 150 : 186), r: 999};
  if (node.shape === 'pill') return {w: node.w ?? 230, h: node.h ?? 76, r: 999};
  if (node.small) return {w: node.w ?? 214, h: node.h ?? (node.image ? 176 : 150), r: node.r ?? 22};
  return {w: node.w ?? 246, h: node.h ?? (node.image ? 216 : 172), r: node.r ?? 24};
};

type Resolved = {box: Box; text?: string; textMix: number; exists: boolean; removal: number; active: number; dim: number; pop: number; slam?: ReturnType<typeof slamEnter>};

const resolveNode = (node: GraphNode, frame: number, fps: number): Resolved => {
  const exists = frame >= node.at;
  const base = {...nodeSize(node, node.text), x: node.x, y: node.y};
  let box: Box = {x: base.x - base.w / 2, y: base.y - base.h / 2, w: base.w, h: base.h, r: base.r};
  let text = node.text;
  let textMix = node.text ? 1 : 0;
  let prevText = node.text;
  if (node.states) {
    let prevBox = box;
    for (const state of node.states) {
      if (frame < state.at) break;
      const size = nodeSize(node, state.text);
      const target: Box = {x: state.x - (state.w ?? size.w) / 2, y: state.y - (state.h ?? size.h) / 2, w: state.w ?? size.w, h: state.h ?? size.h, r: state.r ?? size.r};
      const p = sharedProgress(frame, state.at);
      box = mixBox(prevBox, target, p);
      // 文字态 → 图标态：文字先淡出（at-7 → at+15），图标随后淡入（at+3 → at+25）
      if (prevText && !state.text) {
        textMix = 1 - progress(frame, state.at - 7, state.at + 15, inCubic);
        text = prevText;
      } else if (state.text) {
        text = state.text;
        textMix = 1;
      } else {
        text = undefined;
        textMix = 0;
      }
      prevBox = target;
      prevText = state.text;
    }
  }
  const slam = node.enter === 'slam' && exists ? slamEnter(frame, node.at) : undefined;
  const pop = !exists ? 0 : slam ? slam.scale : spring({frame: frame - node.at, fps, config: {damping: 11, stiffness: 170}});
  let removal = 0;
  if (node.remove && frame >= node.remove.at) {
    removal = node.remove.mode === 'fade' ? progress(frame, node.remove.at, node.remove.at + 18, inCubic) : progress(frame, node.remove.at, node.remove.at + 26, inOutCubic);
  }
  return {box, text, textMix, exists, removal, active: windowLevel(frame, node.highlight), dim: windowLevel(frame, node.dim), pop, slam};
};

// 从盒子中心沿方向到边界的锚点（留 6px 间隙，避免线头插进卡里）
const anchor = (box: Box, towards: {x: number; y: number}) => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  const hw = box.w / 2 + 6;
  const hh = box.h / 2 + 6;
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return {x: cx + dx * t, y: cy + dy * t};
};

const NodeView: React.FC<{node: GraphNode; res: Resolved; frame: number}> = ({node, res, frame}) => {
  const {box, text, textMix, removal, active, dim, pop, slam} = res;
  if (!res.exists || removal >= 1) return null;
  // ContactShadowLift：聚焦即抬起（-28px / 1.08），独立接触阴影同步放大变淡
  const liftM = contactLift(text ? 0 : active);
  const focusScale = liftM.scale;
  const opacity = (1 - dim * 0.68) * (1 - removal) * (slam ? slam.opacity : Math.min(1, pop + 0.15));
  const lift = node.remove?.mode === 'fade' ? 0 : removal;
  const isGlyph = textMix < 1;
  const badge = node.badge;
  const badgeVisible = badge && frame >= badge.at && (!badge.until || frame < badge.until + 14);
  const badgeOut = badge?.until ? progress(frame, badge.until, badge.until + 14, inCubic) : 0;
  const breathe = active > 0.5 ? 1 + Math.sin((frame - node.at) / 24) * 0.011 : 1;
  return (
    <>
    {active > 0.02 && !text ? (
      <div style={{position: 'absolute', left: box.x + box.w * 0.06, top: box.y + box.h - 26, width: box.w * 0.88, height: 44, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.45) 42%, rgba(0,0,0,0) 72%)', transform: `scale(${liftM.shadowScale})`, opacity: liftM.shadowOpacity * active, zIndex: 11}} />
    ) : null}
    {slam?.ringOn ? (
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 13}}><circle cx={box.x + box.w / 2} cy={box.y + box.h / 2} r={slam.ringD / 2} fill="none" stroke={ACCENT} strokeWidth={2} opacity={slam.ringOp} /></svg>
    ) : null}
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y - lift * 84 + liftM.y + (slam ? slam.y + slam.shakeY : 0),
        width: box.w,
        height: box.h,
        transform: `translateZ(${(node.depth ?? (node.id.length % 3) * 40) + active * 90 + Math.sin(frame / 34 + node.id.length) * 6}px) translateX(${slam ? slam.shakeX : 0}px) scale(${pop * focusScale * breathe * (1 - lift * 0.28)}) rotate(${slam ? slam.rot : 0}deg)`,
        transformOrigin: 'center',
        opacity,
        ...(text ? surface('glass', {radius: box.r, soft: true}) : tile({radius: box.r, active, dim})),
        ...toneTile(node.tone, box.r),
        color: node.tone === 'lime' ? ON_ACCENT : INK,
        overflow: 'visible',
        zIndex: 12,
      }}
    >
      {text ? null : <div style={tileSheen()} />}
      {text ? (
        <div style={{position: 'absolute', inset: 0, opacity: textMix, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 44px', textAlign: 'center', fontFamily: FONT, fontSize: 60, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.2, transformStyle: 'preserve-3d'}}>
          {text}
        </div>
      ) : null}
      {isGlyph ? (
        <div style={{position: 'absolute', inset: 0, opacity: 1 - textMix, display: 'flex', flexDirection: node.shape === 'pill' ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: node.shape === 'pill' ? 12 : node.image ? 2 : 8, paddingTop: node.image && node.shape !== 'pill' ? 6 : 0}}>
          <Object3 image={node.image} kind={node.kind} active={active > 0.2} size={node.shape === 'pill' ? 34 : node.shape === 'circle' ? (node.image ? 60 : 64) : node.image ? (node.small ? 62 : 78) : 76} />
          {box.w > 205 || node.shape === 'circle' ? <div style={{fontFamily: FONT, fontWeight: 600, fontSize: node.shape === 'pill' ? 28 : node.small || node.shape === 'circle' ? 27 : 30, lineHeight: 1.1, whiteSpace: 'nowrap', letterSpacing: '-0.01em', color: active > 0.2 ? INK : 'rgba(245,245,247,.92)'}}>{node.label}</div> : null}
          {node.en && box.w > 205 ? <div style={{fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', opacity: 0.72, marginTop: -2, whiteSpace: 'nowrap', color: node.tone === 'lime' ? ON_ACCENT : INK}}>{node.en}</div> : null}
        </div>
      ) : null}
      {badgeVisible ? (
        <div
          style={{
            position: 'absolute',
            right: node.shape === 'pill' ? -22 : node.shape === 'circle' ? -6 : -18,
            bottom: node.shape === 'pill' || node.shape === 'circle' ? undefined : node.small ? -30 : -16,
            top: node.shape === 'pill' ? -26 : node.shape === 'circle' ? -10 : undefined,
            padding: '8px 16px',
            ...accentPill(badge.tone),
            fontFamily: FONT,
            fontSize: 24,
            fontWeight: 700,
            transform: `scale(${badge.fx === 'burst' ? popBurst(frame, badge.at).scale : spring({frame: frame - badge.at, fps: 30, config: {damping: 11, stiffness: 170}})})`,
            opacity: 1 - badgeOut,
            whiteSpace: 'nowrap',
          }}
        >
          {badge.text}
        </div>
      ) : null}
    </div>
    </>
  );
};

const EdgeView: React.FC<{edge: GraphEdge; from: Resolved; to: Resolved; frame: number; sceneId: string}> = ({edge, from, to, frame, sceneId}) => {
  if (frame < edge.at - 8 || !from.exists || !to.exists) return null;
  const grow = progress(frame, edge.at - 8, edge.at + 8, outCubic);
  if (grow <= 0) return null;
  const a = anchor(from.box, {x: to.box.x + to.box.w / 2, y: to.box.y + to.box.h / 2});
  const b = anchor(to.box, {x: from.box.x + from.box.w / 2, y: from.box.y + from.box.h / 2});
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const bend = edge.bend ?? 0;
  const d = horizontal
    ? `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y + bend}, ${(a.x + b.x) / 2} ${b.y + bend}, ${b.x} ${b.y}`
    : `M ${a.x} ${a.y} C ${a.x + bend} ${(a.y + b.y) / 2}, ${b.x + bend} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`;
  const active = windowLevel(frame, edge.highlight);
  const dim = windowLevel(frame, edge.dim);
  const erase = edge.remove ? progress(frame, edge.remove.at, edge.remove.at + 18, inCubic) : 0;
  const nodeFade = (1 - from.removal) * (1 - to.removal);
  const opacity = (1 - dim * 0.72) * (0.55 + active * 0.45) * (1 - erase) * nodeFade;
  if (opacity <= 0.01) return null;
  if (edge.style === 'chevron') {
    // 小Lin 式 »：沿路径放 3 个青柠色双箭头，依次点亮
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return (
      <g opacity={opacity}>
        {[0.28, 0.5, 0.72].map((t, i) => {
          const on = progress(frame, edge.at + i * 4, edge.at + i * 4 + 8, outCubic);
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          return <text key={i} x={px} y={py} fill={ACCENT} fontFamily={FONT} fontSize={46} fontWeight={800} textAnchor="middle" dominantBaseline="central" transform={`rotate(${ang} ${px} ${py})`} opacity={on * (1 - erase)}>»</text>;
        })}
      </g>
    );
  }
  if (edge.style === 'flyline') {
    // FlylineArc：22f outCubic 生长，亮头暗尾，到达后 10f 抹匀；光头 r26 光晕 + r9 实心
    const fl = flyline(frame, edge.at);
    const c1 = horizontal ? {x: (a.x + b.x) / 2, y: a.y + bend} : {x: a.x + bend, y: (a.y + b.y) / 2};
    const c2 = horizontal ? {x: (a.x + b.x) / 2, y: b.y + bend} : {x: b.x + bend, y: (a.y + b.y) / 2};
    const u = 1 - fl.e;
    const head = {x: u * u * u * a.x + 3 * u * u * fl.e * c1.x + 3 * u * fl.e * fl.e * c2.x + fl.e ** 3 * b.x, y: u * u * u * a.y + 3 * u * u * fl.e * c1.y + 3 * u * fl.e * fl.e * c2.y + fl.e ** 3 * b.y};
    const tailOpacity = 0.4 + 0.6 * fl.settle;
    return (
      <g opacity={opacity * (1 - erase)}>
        <path d={d} fill="none" pathLength={1} stroke={ACCENT} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - fl.e} opacity={tailOpacity} markerEnd={fl.e > 0.98 ? `url(#arrow-${sceneId}-accent)` : undefined} />
        <path d={d} fill="none" pathLength={1} stroke={ACCENT} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={`${Math.min(0.3, fl.e)} 1`} strokeDashoffset={-(Math.max(0, fl.e - 0.3))} opacity={1 - fl.settle} />
        {fl.growing ? (<><circle cx={head.x} cy={head.y} r={26} fill={ACCENT} opacity={0.22} /><circle cx={head.x} cy={head.y} r={9} fill="#fff" stroke={ACCENT} strokeWidth={3} /></>) : null}
      </g>
    );
  }
  return (
    <path
      d={d}
      fill="none"
      pathLength={1}
      stroke={active > 0.2 ? ACCENT : 'rgba(245,245,247,.6)'}
      strokeWidth={active > 0.2 ? 3.5 : 2.5}
      strokeLinecap="round"
      strokeDasharray={edge.dashed ? '0.045 0.035' : 1}
      strokeDashoffset={1 - grow + erase}
      opacity={opacity}
      markerEnd={grow > 0.84 && erase < 0.3 ? `url(#arrow-${sceneId}-${active > 0.2 ? 'accent' : 'ink'})` : undefined}
    />
  );
};

const NoteView: React.FC<{note: GraphNote; frame: number; sceneEnd: number}> = ({note, frame, sceneEnd}) => {
  if (frame < note.at) return null;
  const inP = progress(frame, note.at, note.at + 26, outCubic);
  const until = Math.min(note.until ?? sceneEnd, sceneEnd);
  const out = progress(frame, until, until + 16, inCubic);
  if (out >= 1) return null;
  const color = note.tone === 'accent' && note.pill ? ON_ACCENT : toneColor(note.tone, INK);
  if (note.pill) {
    return (
      <div style={{position: 'absolute', left: note.x, top: note.y, padding: '10px 22px', ...surface(note.tone === 'accent' ? 'fill' : 'glass', {radius: 999, accent: note.tone === 'accent'}), color, fontFamily: FONT, fontSize: note.size ?? 28, fontWeight: 600, opacity: inP * (1 - out), transform: `translateY(${(1 - inP) * 18}px)`, whiteSpace: 'nowrap'}}>
        {note.text}
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', left: note.x, top: note.y, width: note.w ?? 640, textAlign: 'center', color, fontFamily: FONT, fontSize: note.size ?? 54, lineHeight: 1.14, fontWeight: 700, letterSpacing: '-0.03em', opacity: inP * (1 - out), transform: `translateY(${(1 - inP) * 26}px)`, whiteSpace: 'pre-line'}}>
      {note.text}
    </div>
  );
};

export const Graph: React.FC<{frame: number; scene: GraphScene}> = ({frame, scene}) => {
  const {fps} = useVideoConfig();
  const opacity = stageOpacity(frame, scene.start, scene.end, 18, 20);
  const resolved = new Map<string, Resolved>();
  for (const node of scene.nodes) resolved.set(node.id, resolveNode(node, frame, fps));
  return (
    <div style={{position: 'absolute', inset: 0, opacity, zIndex: 10}}>
      <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <defs>
          <marker id={`arrow-${scene.id}-accent`} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L5,2.5 z" fill={ACCENT} /></marker>
          <marker id={`arrow-${scene.id}-ink`} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L5,2.5 z" fill={INK} /></marker>
        </defs>
        {scene.edges.map((edge) => {
          const from = resolved.get(edge.from);
          const to = resolved.get(edge.to);
          if (!from || !to) return null;
          return <EdgeView key={`${edge.from}-${edge.to}-${edge.at}`} edge={edge} from={from} to={to} frame={frame} sceneId={scene.id} />;
        })}
      </svg>
      {scene.nodes.map((node) => {
        const res = resolved.get(node.id)!;
        return <NodeView key={node.id} node={node} res={res} frame={frame} />;
      })}
      {scene.nodes.map((node) => {
        if (node.fx === false || node.text) return null;
        const res = resolved.get(node.id)!;
        const cx = res.box.x + res.box.w / 2;
        const cy = res.box.y + res.box.h / 2;
        return (
          <React.Fragment key={`fx-${node.id}`}>
            <Impact frame={frame} at={node.at + 2} x={cx} y={cy} radius={Math.max(res.box.w, res.box.h) * 0.62} />
            {node.badge && node.badge.fx !== 'burst' ? <Impact frame={frame} at={node.badge.at + 1} x={node.shape === 'circle' ? res.box.x + res.box.w - 30 : res.box.x + res.box.w - 6} y={node.shape === 'circle' ? res.box.y + 14 : res.box.y + res.box.h - 4} tone={node.badge.tone === 'red' ? 'red' : 'accent'} radius={56} /> : null}
            {node.badge && node.badge.fx === 'burst' ? (() => {
              const b = popBurst(frame, node.badge!.at);
              const bx = node.shape === 'circle' ? res.box.x + res.box.w - 30 : res.box.x + res.box.w - 6;
              const by = node.shape === 'circle' ? res.box.y + 14 : res.box.y + res.box.h - 4;
              const R = 34;
              const color = node.badge!.tone === 'red' ? RED_FX : ACCENT;
              if (!b.particlesOn && !b.ringOn) return null;
              return (
                <svg width={CANVAS.w} height={CANVAS.h} style={{position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30}}>
                  {b.ringOn ? <circle cx={bx} cy={by} r={R * b.ringR} fill="none" stroke={color} strokeWidth={b.ringWidth} opacity={b.ringOpacity} /> : null}
                  {b.particlesOn ? burstAngles.map((ang, i) => { const d0 = R * 2 * b.pDist; const len = R * 2 * b.pLen; return <line key={i} x1={bx + Math.cos(ang) * d0} y1={by + Math.sin(ang) * d0} x2={bx + Math.cos(ang) * (d0 + len)} y2={by + Math.sin(ang) * (d0 + len)} stroke={i % 5 < 2 ? color : '#F5F5F7'} strokeWidth={5} strokeLinecap="round" opacity={b.pOpacity} />; }) : null}
                </svg>
              );
            })() : null}
          </React.Fragment>
        );
      })}
      {scene.notes?.map((note) => <NoteView key={`${note.text}-${note.at}`} note={note} frame={frame} sceneEnd={scene.end} />)}
    </div>
  );
};

export const lerpPoint = (t: number, a: {x: number; y: number}, b: {x: number; y: number}) => ({x: lerp(t, a.x, b.x), y: lerp(t, a.y, b.y)});
