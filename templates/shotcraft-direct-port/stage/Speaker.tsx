// ============================================================
// 人物控制器（v3）：hero-center / hero / dock / focus / orb-right / orb-left / hidden
// 人物框是舞台上最"实"的物件：发丝线 + 深柔影，不加发光；高度收在字幕安全区之上。
// ============================================================
import React from 'react';
import {OffthreadVideo, staticFile} from 'remotion';
import type {SpeakerKeyframe, SpeakerMode} from './Plan';
import {Box, mixBox, sharedProgress} from './theme';
import {CANVAS, FOCUS, PORTRAIT, SPLIT_SHIFT} from './Canvas';

export const SPEAKER_BOXES: Record<SpeakerMode, Box> = {
  'hero-center': {x: 668, y: 58, w: 584, h: 830, r: 34},
  hero: {x: 54, y: 58, w: 584, h: 830, r: 34},
  'hero-right': {x: 1282, y: 58, w: 584, h: 830, r: 34},
  close: {x: 54, y: 58, w: 584, h: 830, r: 34},
  'close-right': {x: 1282, y: 58, w: 584, h: 830, r: 34},
  stage: {x: 0, y: 0, w: 1920, h: 1080, r: 0},
  dock: {x: 54, y: 118, w: 410, h: 712, r: 30},
  focus: {x: 54, y: 86, w: 520, h: 800, r: 32},
  // 2026-09-02 Scott：圆形角标里脸露不全 → 改成小竖版人像卡（头肩全入，头更小）；名字保留 orb 以兼容旧计划
  'orb-right': {x: 1690, y: 54, w: 176, h: 292, r: 26},
  'orb-left': {x: 54, y: 54, w: 176, h: 292, r: 26},
  hidden: {x: 54, y: 54, w: 0.1, h: 0.1, r: 0},
  // studio 三态（2026-09-07 Scott：横屏素材保持横屏）：全画幅 / 横卡居左 / 左上小卡
  full: {x: 0, y: 0, w: 1920, h: 1080, r: 0},
  wide: {x: 60, y: 100, w: 1200, h: 675, r: 28},
  pip: {x: 54, y: 54, w: 466, h: 262, r: 22},
};

// 竖屏两态：full = 原片铺满；focus = 放大 1.1 并上移 270（2026-09-08 Scott：上一版头太靠上，改成整个头都在画面里的上半身取景），下巴约在 y 1040，以下留给内容（2026-09-07 studio-portrait）
if (PORTRAIT) {
  SPEAKER_BOXES.full = {x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, r: 0};
  SPEAKER_BOXES.focus = {x: Math.round((CANVAS.w - CANVAS.w * FOCUS.scale) / 2), y: -FOCUS.shift, w: Math.round(CANVAS.w * FOCUS.scale), h: Math.round(CANVAS.h * FOCUS.scale), r: 0};
  SPEAKER_BOXES.split = {x: 0, y: -SPLIT_SHIFT, w: CANVAS.w, h: CANVAS.h, r: 0};
  // lecture（2026-09-12 课程录屏 Short）：A-roll 已是合成好的 1080×1920，整幅铺满，不裁不放大
  SPEAKER_BOXES.lecture = {x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, r: 0}; // 上移 300 不缩放：脸在上半区，下半区给第三方面板
}
const ZOOM: Partial<Record<SpeakerMode, number>> = {close: 1.45, 'close-right': 1.45, stage: 1};
export const speakerBoxAt = (frame: number, keyframes: SpeakerKeyframe[]): {box: Box; mode: SpeakerMode; zoom: number} => {
  let box = SPEAKER_BOXES[keyframes[0].mode];
  let mode = keyframes[0].mode;
  let zoom = ZOOM[mode] ?? 1;
  for (let i = 1; i < keyframes.length; i += 1) {
    const kf = keyframes[i];
    if (frame < kf.at) break;
    const prev = SPEAKER_BOXES[keyframes[i - 1].mode];
    const p = kf.cut ? 1 : sharedProgress(frame, kf.at);
    box = mixBox(prev, SPEAKER_BOXES[kf.mode], p);
    zoom = (ZOOM[keyframes[i - 1].mode] ?? 1) + ((ZOOM[kf.mode] ?? 1) - (ZOOM[keyframes[i - 1].mode] ?? 1)) * p;
    mode = kf.mode;
  }
  return {box, mode, zoom};
};

export const Speaker: React.FC<{frame: number; keyframes: SpeakerKeyframe[]; media: string; startFrom: number}> = ({
  frame,
  keyframes,
  media,
  startFrom,
}) => {
  const {box, mode, zoom} = speakerBoxAt(frame, keyframes);
  if (mode === 'hidden' && box.w < 1) return null;
  const isOrb = box.w < 300 && box.h > box.w; // 竖版小卡才按头肩取景；16:9 小卡按原片构图
  const isWide = box.w / Math.max(1, box.h) > 1.5; // studio 16:9 形态：不裁、不放大
  const isFull = box.w >= CANVAS.w - 1;
  const isPlain = isWide || (PORTRAIT && isFull); // 不裁、不放大、人物在信息层之下
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
        boxShadow: isFull ? 'none' : '0 0 0 1px rgba(255,255,255,0.18), 0 24px 60px rgba(0,0,0,0.45)',
        background: '#000',
        zIndex: isPlain ? 5 : 40, // studio 16:9 形态：人物是画面，信息叠在上面（点缀 / 提醒 / 插页都在 z 16+）
      }}
    >
      <OffthreadVideo
        src={staticFile(media)}
        startFrom={startFrom}
        muted
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: isPlain ? '50% 50%' : isOrb ? '50% 30%' : '50% 42%', transform: `scale(${zoom.toFixed(3)})`, transformOrigin: '50% 34%'}}
      />
    </div>
  );
};
