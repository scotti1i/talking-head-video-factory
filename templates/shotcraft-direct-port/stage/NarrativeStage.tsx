// ============================================================
// 叙事舞台根组件：背景 → 场景层 → 人物 → 字幕 → 原声
// 所有场景、人物状态、字幕都来自编译后的 NARRATIVE_PLAN，组件里没有任何一条视频专属内容。
// ============================================================
import React from 'react';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {NarrativePlan, Scene, SpeakerMode} from './Plan';
import {Background, Captions, StageRoot} from './Chrome';
import {Speaker, speakerBoxAt} from './Speaker';
import {SKIN, contentRect} from './theme';
import {Label} from './Label';
import {Equation} from './Equation';
import {Graph} from './Graph';
import {Converge} from './Converge';
import {Split} from './Split';
import {Concept} from './Concept';
import {Reminders} from './Reminders';
import {Evidence} from './Evidence';
import {DataFocus} from './DataFocus';
import {Reference} from './Reference';
import {Sfx} from './Sfx';
import {Broll} from './Broll';
import {Ladder} from './Ladder';
import {Cycle} from './Cycle';
import {Accent} from './Accent';
import {Quote} from './Quote';
import {Timeline} from './Timeline';
import {Compare} from './Compare';
import {Title} from './Title';
import {Chat} from './Chat';
import {Leaderboard} from './Leaderboard';
import {Gauge} from './Gauge';
import {Flip} from './Flip';
import {MapScene} from './MapScene';
import {Clipping} from './Clipping';

const PAD = 40; // 场景前后各保留 40f 供进出场

const SceneView: React.FC<{frame: number; scene: Scene; speakerMode: SpeakerMode; ratio?: number}> = ({frame, scene, speakerMode, ratio = 1}) => {
  switch (scene.type) {
    case 'label':
      return <Label frame={frame} scene={scene} />;
    case 'equation':
      return <Equation frame={frame} scene={scene} />;
    case 'graph':
      return <Graph frame={frame} scene={scene} />;
    case 'converge':
      return <Converge frame={frame} scene={scene} />;
    case 'split':
      return <Split frame={frame} scene={scene} />;
    case 'concept':
      return <Concept frame={frame} scene={scene} speakerMode={speakerMode} />;
    case 'reminders':
      return <Reminders frame={frame} scene={scene} />;
    case 'evidence':
      return <Evidence frame={frame} scene={scene} />;
    case 'data':
      return <DataFocus frame={frame} scene={scene} />;
    case 'reference':
      return <Reference frame={frame} scene={scene} />;
    case 'broll':
      return <Broll frame={frame} scene={scene} ratio={ratio} />;
    case 'ladder':
      return <Ladder frame={frame} scene={scene} />;
    case 'cycle':
      return <Cycle frame={frame} scene={scene} />;
    case 'accent':
      return <Accent frame={frame} scene={scene} speakerMode={speakerMode} />;
    case 'quote':
      return <Quote frame={frame} scene={scene} speakerMode={speakerMode} />;
    case 'timeline':
      return <Timeline frame={frame} scene={scene} />;
    case 'compare':
      return <Compare frame={frame} scene={scene} />;
    case 'title':
      return <Title frame={frame} scene={scene} />;
    case 'chat':
      return <Chat frame={frame} scene={scene} speakerMode={speakerMode} />;
    case 'leaderboard':
      return <Leaderboard frame={frame} scene={scene} />;
    case 'gauge':
      return <Gauge frame={frame} scene={scene} />;
    case 'flip':
      return <Flip frame={frame} scene={scene} />;
    case 'map':
      return <MapScene frame={frame} scene={scene} />;
    case 'clipping':
      return <Clipping frame={frame} scene={scene} />;
    default:
      return null;
  }
};

export const NarrativeStage: React.FC<{plan: NarrativePlan}> = ({plan}) => {
  // 逻辑帧按 plan.fps 走（分镜与组件的帧常量都以它为准）；合成帧率更高时（60fps 成片）逻辑帧取分数，动效随之插值
  const {fps: videoFps} = useVideoConfig();
  const ratio = videoFps / plan.fps;
  const frame = useCurrentFrame() / ratio;
  const media = plan.source.media;
  const startFrom = Math.round(plan.source.startFrame * ratio); // 媒体 startFrom 是合成帧
  const speakerMode = speakerBoxAt(frame, plan.speaker).mode;
  return (
    <AbsoluteFill>
      <StageRoot>
        <Audio src={staticFile(media)} startFrom={startFrom} />
        <Sfx plan={plan} ratio={ratio} />
        <Background frame={frame} durationInFrames={plan.durationInFrames} media={media} startFrom={startFrom} plate={plan.background?.plate} />
        {SKIN === 'stage3d' ? (() => {
          // 小Lin 式立体舞台：一块带透视的黑色面板承载内容，镜头缓慢推拉；人物在面板外保持正视
          const base = contentRect(speakerMode);
          // 角标模式下面板拉到接近全宽，证据页 / 汇流才装得下
          const rect = speakerMode === 'orb-left' || speakerMode === 'orb-right' ? {x: 96, y: 60, w: 1794, h: 840} : base;
          // 证据页 / B-roll / 数据卡自带边框，此时不画面板（2026-09-03 Scott：画板套框框没意义）
          const selfFramed = plan.scenes.some((sc) => frame >= sc.start && frame < sc.end && (sc.type === 'evidence' || sc.type === 'broll' || sc.type === 'data'));
          // 面板只在有内容时才存在：内容出现前 BOARD_LEAD 帧淡入，内容结束后淡出；空板子一秒都不许（2026-09-04 Scott：开场右边一块黑板不可接受）
          const BOARD_LEAD = 10;
          let boardIn = 0;
          for (const [a, b] of plan.content ?? []) {
            if (frame < a - BOARD_LEAD || frame >= b + 12) continue;
            boardIn = Math.max(boardIn, frame < a ? (frame - (a - BOARD_LEAD)) / BOARD_LEAD : frame < b ? 1 : 1 - (frame - b) / 12);
          }
          const drawBoard = !selfFramed && boardIn > 0 && speakerMode !== 'hero-center' && speakerMode !== 'hidden' && speakerMode !== 'stage';
          // 真 3D：面板绕 Y 轴 ±3° 缓摆、绕 X 轴 ±1.2°、并有慢速推拉；内容层在面板前 60px 形成前后景视差
          // 幅度翻倍 + 节拍相机：任一场景元素出现（at）时镜头推 3% 再在 20 帧内回弹（2026-09-03 Scott：3D 看不出来）
          const beatAts: number[] = [];
          for (const sc of plan.scenes) {
            if (frame < sc.start - 10 || frame >= sc.end + 10) continue;
            const anyScene = sc as unknown as Record<string, unknown>;
            for (const key of ['nodes', 'steps', 'milestones', 'items', 'phrases', 'sources']) {
              const arr = anyScene[key];
              if (Array.isArray(arr)) for (const el of arr) if (el && typeof el.at === 'number') beatAts.push(el.at);
            }
            if (Array.isArray(anyScene.cards)) for (const c of anyScene.cards as Array<{tag?: {at: number}}>) if (c.tag) beatAts.push(c.tag.at);
            if (typeof anyScene.expandAt === 'number') beatAts.push(anyScene.expandAt as number);
            if (typeof anyScene.convergeAt === 'number') beatAts.push(anyScene.convergeAt as number);
          }
          let beat = 0;
          for (const at of beatAts) { const d = frame - at; if (d >= 0 && d < 24) beat = Math.max(beat, Math.exp(-d / 7)); }
          // 节拍相机压到几乎不可见：元素密集出现时面板跟着大幅弹会"鬼畜"（2026-09-04 Scott），面板只保留慢摆慢推
          const ry = -7 + Math.sin(frame / 380) * 5 + beat * 0.25;
          const rx = 2.5 + Math.cos(frame / 520) * 2;
          const dolly = 1 + Math.sin(frame / 700) * 0.025 + beat * 0.004;
          const persp = `perspective(2600px) rotateY(${ry}deg) rotateX(${rx}deg) scale(${dolly})`;
          return (
            <div style={{position: 'absolute', inset: 0, transform: persp, transformOrigin: `${rect.x + rect.w / 2}px 540px`, transformStyle: 'preserve-3d'}}>
              {!drawBoard ? null : <div style={{position: 'absolute', opacity: boardIn, left: rect.x - 48, top: rect.y - 24, width: rect.w + 96, height: rect.h + 36, borderRadius: 30, background: 'linear-gradient(180deg,#101013,#0B0B0D)', boxShadow: '0 0 0 1px rgba(255,255,255,.16), 0 40px 90px rgba(0,0,0,.6)', outline: '1px dashed rgba(255,255,255,.22)', outlineOffset: -10}} />}
              <div style={{position: 'absolute', inset: 0, transform: 'translateZ(60px)', transformStyle: 'preserve-3d'}}>
                {plan.scenes
                  .filter((scene) => frame >= scene.start - PAD && frame < scene.end + PAD && !(scene.type === 'broll' && scene.layout !== 'panel') && scene.type !== 'title')
                  .map((scene) => <SceneView key={scene.id} frame={frame} scene={scene} speakerMode={speakerMode} ratio={ratio} />)}
              </div>
            </div>
          );
        })() : null}
        {SKIN === 'stage3d' ? plan.scenes
          .filter((scene) => frame >= scene.start - PAD && frame < scene.end + PAD && ((scene.type === 'broll' && scene.layout !== 'panel') || scene.type === 'title'))
          .map((scene) => <SceneView key={scene.id} frame={frame} scene={scene} speakerMode={speakerMode} ratio={ratio} />) : null}
        {SKIN !== 'stage3d' ? plan.scenes
          .filter((scene) => frame >= scene.start - PAD && frame < scene.end + PAD)
          .map((scene) => <SceneView key={scene.id} frame={frame} scene={scene} speakerMode={speakerMode} ratio={ratio} />) : null}
        <Speaker frame={frame} keyframes={plan.speaker} media={media} startFrom={startFrom} />
        <Captions frame={frame} fps={plan.fps} captions={plan.captions} keywords={plan.keywords} bottom={plan.captionBottom} />
      </StageRoot>
    </AbsoluteFill>
  );
};
