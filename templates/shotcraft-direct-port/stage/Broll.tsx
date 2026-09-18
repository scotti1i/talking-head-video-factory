// ============================================================
// B-roll：把抽象名词落到现实物件。panel = 人物 dock 时占据右侧大面板；full = 全屏铺满（人物隐藏或圆形）。
// 入场用 SharedElementMorph 的同一条曲线做轻微缩放 + 淡入，退场反向；片段本身不做任何滤镜叠加。
// ============================================================
import React from 'react';
import {OffthreadVideo, Sequence, staticFile} from 'remotion';
import type {BrollScene} from './Plan';
import {Box, FONT, INK, SHADOW_DEEP, contentRect, inCubic, outCubic, progress} from './theme';
import {PORTRAIT} from './Canvas';

// 面板从人物 hero 卡右缘之外开始（contentRect('hero') 的 x=700），不与人像重叠（2026-09-02 Scott 指出 v1 重叠）
const PANEL_BOX: Box = {x: 700, y: 70, w: 1166, h: 810, r: 28};
const FULL_BOX: Box = {x: 0, y: 0, w: 1920, h: 1080, r: 0};
const STRIP_BOX: Box = {x: 0, y: 250, w: 1920, h: 600, r: 0}; // 通栏：电影感横条，人物退到角标

export const Broll: React.FC<{frame: number; scene: BrollScene; ratio?: number}> = ({frame, scene, ratio = 1}) => {
  if (frame < scene.start - 12 || frame >= scene.end + 16) return null;
  // 竖屏：所有布局都落在 split 态的下半区面板（人物上移后腾出的位置）
  const box: Box = PORTRAIT ? {...contentRect('split'), r: 24} : scene.layout === 'full' ? FULL_BOX : scene.layout === 'strip' ? STRIP_BOX : PANEL_BOX;
  const isScreen = scene.layout === 'screen'; // 录屏容器：设备框 + 顶栏三点，Screen Studio 录屏直接进
  const enter = progress(frame, scene.start - 12, scene.start + 10, outCubic);
  const out = progress(frame, scene.end, scene.end + 16, inCubic);
  const scale = 1.03 - enter * 0.03 + out * 0.02;
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r, overflow: 'hidden', boxShadow: scene.layout === 'full' || scene.layout === 'strip' ? '0 0 0 1px rgba(255,255,255,0.14)' : `0 0 0 1px rgba(255,255,255,0.28), ${SHADOW_DEEP}`, opacity: enter * (1 - out), transform: `scale(${scale})`, zIndex: 15, background: '#000'}}>
      {isScreen ? <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 34, background: '#1B1B20', borderBottom: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, zIndex: 2}}>{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{width: 11, height: 11, borderRadius: 6, background: c, display: 'inline-block'}} />)}</div> : null}
      {/* 视频必须从场景入场那一刻开始播：不包 Sequence 时 OffthreadVideo 按合成时间取帧，场景在 20s 时 5s 素材早已停在最后一帧（2026-09-03 深夜发现，此前三条成片都冻着） */}
      <Sequence from={Math.round((scene.start - 12) * ratio)} layout="none">
        <OffthreadVideo src={staticFile(scene.media)} startFrom={Math.round((scene.mediaStart ?? 0) * ratio)} muted style={{width: '100%', height: isScreen ? 'calc(100% - 34px)' : '100%', marginTop: isScreen ? 34 : 0, objectFit: isScreen ? 'contain' : 'cover', background: isScreen ? '#0B0B0D' : undefined}} />
      </Sequence>
      <div style={{position: 'absolute', inset: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)', borderRadius: box.r}} />
      {scene.caption ? (
        <div style={{position: 'absolute', left: 24, bottom: 22, padding: '6px 14px', borderRadius: 999, background: 'rgba(10,10,12,.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.18)', color: INK, fontFamily: FONT, fontSize: 22, fontWeight: 500}}>{scene.caption}</div>
      ) : null}
    </div>
  );
};
