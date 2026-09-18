// ============================================================
// 点缀（accent 色胶囊字用 ON_ACCENT，2026-09-06 修：同色字不可见）：人物大段口播时，说到关键词在人物旁弹一个小物件 / 小标签，约 1.2 秒即走。
// 小Lin 大屏口播时的"画面有一点在动"——不是解释，是伴奏。（2026-09-03 Scott review）
// ============================================================
import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {AccentScene, SpeakerMode} from './Plan';
import {SPEAKER_BOXES} from './Speaker';
import {Object3} from './Glyph';
import {FONT, INK, ON_ACCENT, inCubic, progress, surface, toneColor} from './theme';
import {PORTRAIT} from './Canvas';

export const Accent: React.FC<{frame: number; scene: AccentScene; speakerMode?: SpeakerMode}> = ({frame, scene, speakerMode = 'hero'}) => {
  const {fps} = useVideoConfig();
  const sb = SPEAKER_BOXES[speakerMode];
  if (frame < scene.start - 8 || frame >= scene.end + 20) return null;
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 17, pointerEvents: 'none'}}>
      {scene.items.map((it, i) => {
        const until = it.until ?? it.at + Math.round(fps * 1.2);
        if (frame < it.at || frame > until + 12) return null;
        const pop = spring({frame: frame - it.at, fps, config: {damping: 10, stiffness: 210}});
        const out = progress(frame, until, until + 12, inCubic);
        const size = it.size ?? (it.anchor ? 72 : 104);
        // 贴人物两侧肩高：左侧 / 右侧各留 60px
        const onStage = speakerMode === 'stage' || speakerMode === 'full';
        const ax = PORTRAIT && it.anchor ? (it.anchor === 'speaker-left' ? 360 - size / 2 : 840 + size / 2) : onStage ? (it.anchor === 'speaker-left' ? 300 : 1620) : it.anchor === 'speaker-left' ? sb.x - 60 - size / 2 : it.anchor === 'speaker-right' ? sb.x + sb.w + 60 + size / 2 : (it.x ?? 1283);
        const ay = PORTRAIT && it.anchor ? 500 + (i % 2) * 110 : onStage ? 380 + (i % 3) * 130 : it.anchor ? sb.y + sb.h * 0.38 + (i % 2) * 120 : (it.y ?? 470);
        const isText = !it.image && !it.glyph;
        // 文字胶囊比 size 宽：贴人物时按内侧边缘对齐（左贴右缘 / 右贴左缘），不按中心，免得钻进人物卡底下
        const textShift = isText && !onStage && it.anchor === 'speaker-left' ? 'translate(-100%,-50%)' : isText && !onStage && it.anchor === 'speaker-right' ? 'translate(0,-50%)' : 'translate(-50%,-50%)';
        const textX = PORTRAIT && isText && it.anchor ? (it.anchor === 'speaker-left' ? 360 : 840) : isText && !onStage && it.anchor === 'speaker-left' ? sb.x - 40 : isText && !onStage && it.anchor === 'speaker-right' ? sb.x + sb.w + 40 : ax;
        return (
          <div key={i} style={{position: 'absolute', left: isText ? textX : ax - size / 2, top: ay - (isText ? 0 : size / 2), transformOrigin: isText && it.anchor === 'speaker-left' ? 'right center' : isText && it.anchor === 'speaker-right' ? 'left center' : 'center', transform: `${isText ? textShift : ''} scale(${(0.6 + pop * 0.4) * (1 - out * 0.3)}) rotate(${(1 - pop) * -8}deg)`, opacity: pop * (1 - out), ...(isText ? {padding: '8px 18px', ...surface('fill', {radius: 999, accent: it.tone === 'accent'}), color: it.tone === 'accent' ? ON_ACCENT : toneColor(it.tone, INK), fontFamily: FONT, fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap'} : {width: size, height: size, ...surface('glass', {radius: 26}), display: 'flex', alignItems: 'center', justifyContent: 'center'})}}>
            {isText ? it.text : <Object3 image={it.image} kind={it.glyph ?? 'none'} size={Math.round(size * 0.5)} />}
          </div>
        );
      })}
    </div>
  );
};
