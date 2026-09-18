// ============================================================
// 引用卡 → 证据页：先以真实页面缩略图（白边、双层阴影、低幅阻尼漂移）建立“我说的是这个”，
// 需要细读时同一张卡升级为证据舞台，镜头在真实截图上平移缩放，聚焦框只亮当前一句。
// ============================================================
import React from 'react';
import {Img, staticFile} from 'remotion';
import type {EvidenceScene} from './Plan';
import {ACCENT, Box, FONT, INK, SHADOW_DEEP, accentPill, inCubic, lerp, mixBox, outCubic, progress, sharedProgress, stageOpacity} from './theme';
import {bracketsFocus, crashZoom} from './motions';
import {PORTRAIT} from './Canvas';
import {contentRect} from './theme';

// 竖屏：引用卡与证据页都是 split 态的下半区面板，不再放大（2026-09-08）
const THUMB: Box = PORTRAIT ? {...contentRect('split'), r: 20} : {x: 900, y: 300, w: 880, h: 495, r: 18};
const STAGE: Box = PORTRAIT ? {...contentRect('split'), r: 20} : {x: 330, y: 70, w: 1536, h: 820, r: 20};

type View = {scale: number; tx: number; ty: number};

export const Evidence: React.FC<{frame: number; scene: EvidenceScene}> = ({frame, scene}) => {
  const opacity = stageOpacity(frame, scene.start, scene.end, 16, 16);
  const expand = scene.expandAt ? sharedProgress(frame, scene.expandAt) : 0;
  const box = mixBox(THUMB, STAGE, expand);
  const enter = progress(frame, scene.start, scene.start + 14, outCubic);
  const drift = (1 - expand) * Math.sin(frame / 70) * 4;
  const tilt = (1 - expand) * 0.4;

  // 缩略图视图：把 thumbCrop 铺满卡片
  const thumbView: View = {scale: THUMB.w / scene.thumbCrop.w, tx: -scene.thumbCrop.x * (THUMB.w / scene.thumbCrop.w), ty: -scene.thumbCrop.y * (THUMB.w / scene.thumbCrop.w)};
  // 证据页基础视图：同一栏放大铺满舞台宽度
  const baseScale = STAGE.w / scene.thumbCrop.w;
  const baseView: View = {scale: baseScale, tx: -scene.thumbCrop.x * baseScale, ty: -scene.thumbCrop.y * baseScale};
  const focusView = (f: {box: {x: number; y: number; w: number; h: number}; scale?: number}): View => {
    const scale = f.scale ?? Math.min(2.2, (STAGE.w * 0.9) / f.box.w);
    let tx = STAGE.w / 2 - (f.box.x + f.box.w / 2) * scale;
    let ty = STAGE.h / 2 - (f.box.y + f.box.h / 2) * scale;
    tx = Math.min(0, Math.max(STAGE.w - scene.imageSize.w * scale, tx));
    ty = Math.min(0, Math.max(STAGE.h - scene.imageSize.h * scale, ty));
    return {scale, tx, ty};
  };
  const mixView = (a: View, b: View, p: number): View => ({scale: lerp(p, a.scale, b.scale), tx: lerp(p, a.tx, b.tx), ty: lerp(p, a.ty, b.ty)});

  let view = thumbView;
  if (scene.expandAt) view = mixView(thumbView, baseView, expand);
  let activeFocus: EvidenceScene['focus'] extends (infer T)[] | undefined ? T | null : never = null;
  let prev = baseView;
  for (const f of scene.focus ?? []) {
    if (frame < f.at) break;
    const target = focusView(f);
    const p = f.zoom === 'crash' ? (crashZoom(frame, f.at, 2.6, 2.45) - 1) / 1.45 : sharedProgress(frame, f.at);
    view = mixView(prev, target, p);
    prev = target;
    activeFocus = f;
  }
  const focusIn = activeFocus ? progress(frame, activeFocus.at + 10, activeFocus.at + 24, outCubic) : 0;
  const stageLabel = progress(frame, (scene.expandAt ?? scene.end) + 20, (scene.expandAt ?? scene.end) + 36, outCubic);

  return (
    <>
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y + drift,
        width: box.w,
        height: box.h,
        borderRadius: box.r,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: `0 0 0 ${lerp(expand, 3, 1)}px rgba(255,255,255,${lerp(expand, 0.95, 0.35)}), ${SHADOW_DEEP}`,
        opacity: opacity * enter,
        transform: `rotate(${tilt}deg) translateY(${(1 - enter) * 24}px) scale(${0.96 + enter * 0.04})`,
        transformOrigin: 'center',
        zIndex: 18,
      }}
    >
      <Img src={staticFile(scene.image)} style={{position: 'absolute', left: 0, top: 0, width: scene.imageSize.w, height: scene.imageSize.h, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`, transformOrigin: 'top left'}} />
      {activeFocus && activeFocus.style === 'brackets' ? (() => {
        // ScanlineAnnotateFocus：四角括号从 1.75 倍收拢对准（outBack），对准瞬间 7% 白闪
        const b = bracketsFocus(frame, activeFocus.at);
        const bx = activeFocus.box.x * view.scale + view.tx - 14;
        const by = activeFocus.box.y * view.scale + view.ty - 12;
        const bw = activeFocus.box.w * view.scale + 28;
        const bh = activeFocus.box.h * view.scale + 24;
        const arm = Math.min(28, bw * 0.12);
        const line = '2px solid rgba(255,255,255,.92)';
        const corner = (style: React.CSSProperties) => <div style={{position: 'absolute', width: arm, height: arm, ...style}} />;
        return (
          <>
            <div style={{position: 'absolute', inset: 0, background: `rgba(11,11,13,${0.58 * b.opacity})`, clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${by}px, ${bx}px ${by}px, ${bx}px ${by + bh}px, ${bx + bw}px ${by + bh}px, ${bx + bw}px ${by}px, 0 ${by}px)`}} />
            <div style={{position: 'absolute', left: bx, top: by, width: bw, height: bh, transform: `scale(${b.scale})`, opacity: b.opacity, background: `rgba(255,255,255,${b.flash})`, borderRadius: 6}}>
              {corner({left: 0, top: 0, borderTop: line, borderLeft: line})}
              {corner({right: 0, top: 0, borderTop: line, borderRight: line})}
              {corner({left: 0, bottom: 0, borderBottom: line, borderLeft: line})}
              {corner({right: 0, bottom: 0, borderBottom: line, borderRight: line})}
            </div>
          </>
        );
      })() : activeFocus ? (
        <div
          style={{
            position: 'absolute',
            left: activeFocus.box.x * view.scale + view.tx - 10,
            top: activeFocus.box.y * view.scale + view.ty - 8,
            width: activeFocus.box.w * view.scale + 20,
            height: activeFocus.box.h * view.scale + 16,
            borderRadius: 10,
            border: '2px solid rgba(255,255,255,.92)',
            boxShadow: `0 0 0 4000px rgba(11,11,13,${0.58 * focusIn})`,
            opacity: focusIn,
          }}
        />
      ) : null}
      {/* 聚焦句旁的中文译注（2026-09-03 Scott：英文页很多人看不懂，翻译放在要注意的句子旁边） */}
      {activeFocus && activeFocus.note && expand > 0.5 ? (() => {
        const nx = activeFocus.box.x * view.scale + view.tx;
        const below = activeFocus.box.y * view.scale + view.ty + activeFocus.box.h * view.scale + 26;
        const top = below > STAGE.h - 130 ? activeFocus.box.y * view.scale + view.ty - 96 : below;
        const inP = progress(frame, activeFocus.at + 10, activeFocus.at + 22, outCubic);
        return (
          <div style={{position: 'absolute', left: Math.max(24, Math.min(nx, STAGE.w - 960)), top, maxWidth: 920, padding: '10px 20px', ...accentPill('accent'), fontFamily: FONT, fontSize: 30, fontWeight: 700, lineHeight: 1.3, opacity: inP, transform: `translateY(${(1 - inP) * 12}px)`, zIndex: 3}}>
            {activeFocus.note}
          </div>
        );
      })() : null}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, background: 'rgba(10,10,12,.78)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderTop: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', padding: '0 24px', color: INK, fontFamily: FONT, fontSize: 23, fontWeight: 500, opacity: stageLabel * expand}}>
        {scene.source}
      </div>
      {expand < 0.5 ? <div style={{position: 'absolute', inset: 0, borderRadius: box.r, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', opacity: (1 - progress(frame, scene.expandAt ?? scene.end, (scene.expandAt ?? scene.end) + 10, inCubic))}} /> : null}
    </div>
    {/* 缩略态下方的来源小字：淡化，像权威引用的脚注 */}
    {expand < 0.95 ? (
      <div style={{position: 'absolute', left: box.x, top: box.y + drift + box.h + 16, width: box.w, textAlign: 'center', fontFamily: FONT, fontSize: 20, fontWeight: 500, color: 'rgba(243,239,230,.42)', letterSpacing: '0.02em', opacity: opacity * enter * (1 - expand), zIndex: 18}}>
        {scene.source}
      </div>
    ) : null}
    </>
  );
};
