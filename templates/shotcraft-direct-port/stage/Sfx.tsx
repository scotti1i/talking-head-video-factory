// ============================================================
// 事件音效：只在词级锚点上的语义事件发声，一个事件一种声音，音量克制
// 素材来自 Video Shotcraft 上游 public/audio（Apache-2.0）
//   节点 / 公式项建立 → pop            判定徽章 → click-camera
//   人物换位          → swoosh-quick   汇流完成 / 概念落定 → transition-soft
//   判定（红）        → transition-snap
// ============================================================
import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import type {NarrativePlan, Scene} from './Plan';

type Cue = {at: number; src: string; volume: number};

const SOUND = {
  pop: 'audio/pop.mp3',
  click: 'audio/click-camera.mp3',
  swoosh: 'audio/swoosh-quick.mp3',
  soft: 'audio/transition-soft.mp3',
  snap: 'audio/transition-snap.mp3',
};

const collect = (plan: NarrativePlan): Cue[] => {
  const cues: Cue[] = [];
  for (let i = 1; i < plan.speaker.length; i += 1) cues.push({at: plan.speaker[i].at, src: SOUND.swoosh, volume: 0.22});
  for (const scene of plan.scenes) cues.push(...sceneCues(scene));
  // 同一帧附近（±3f）的重复声音只保留一个，避免叠成噪音
  cues.sort((a, b) => a.at - b.at);
  return cues.filter((cue, i) => i === 0 || cue.src !== cues[i - 1].src || cue.at - cues[i - 1].at > 3);
};

const sceneCues = (scene: Scene): Cue[] => {
  const out: Cue[] = [];
  switch (scene.type) {
    case 'graph':
      for (const node of scene.nodes) {
        if (!node.text) out.push({at: node.at, src: SOUND.pop, volume: 0.3});
        if (node.badge) out.push({at: node.badge.at, src: node.badge.tone === 'red' ? SOUND.snap : SOUND.click, volume: 0.28});
      }
      break;
    case 'equation':
      for (const row of scene.rows) for (const term of row.terms) if (term.kind !== 'op') out.push({at: term.at, src: SOUND.pop, volume: term.kind === 'result' ? 0.32 : 0.22});
      if (scene.collapseAt) out.push({at: scene.collapseAt, src: SOUND.soft, volume: 0.24});
      break;
    case 'converge':
      for (const s of scene.sources) if (s.at) out.push({at: s.at, src: SOUND.pop, volume: 0.2});
      out.push({at: scene.convergeAt + 60, src: SOUND.soft, volume: 0.3});
      break;
    case 'split':
      for (const card of scene.cards) if (card.tag) out.push({at: card.tag.at, src: SOUND.click, volume: 0.3});
      if (scene.collapseAt) out.push({at: scene.collapseAt, src: SOUND.soft, volume: 0.24});
      break;
    case 'concept':
      for (const p of scene.phrases) out.push({at: p.at, src: SOUND.pop, volume: 0.2});
      if (scene.demoteAt) out.push({at: scene.demoteAt, src: SOUND.soft, volume: 0.24});
      break;
    case 'data':
      for (const c of scene.chips ?? []) out.push({at: c.at, src: SOUND.pop, volume: 0.22});
      if (scene.marker) out.push({at: scene.marker.at, src: SOUND.click, volume: 0.28});
      for (const s of scene.spikes ?? []) out.push({at: s.at, src: SOUND.snap, volume: 0.3});
      if (scene.verdict) out.push({at: scene.verdict.at, src: SOUND.snap, volume: 0.34});
      break;
    case 'evidence':
      if (scene.expandAt) out.push({at: scene.expandAt, src: SOUND.soft, volume: 0.26});
      for (const f of scene.focus ?? []) out.push({at: f.at, src: SOUND.click, volume: 0.22});
      break;
    case 'label':
      for (const item of scene.items) out.push({at: item.at, src: SOUND.pop, volume: 0.18});
      break;
    case 'reference':
      out.push({at: scene.at, src: SOUND.soft, volume: 0.24});
      break;
    default:
      break;
  }
  return out;
};

export const Sfx: React.FC<{plan: NarrativePlan; ratio?: number}> = ({plan, ratio = 1}) => {
  if (plan.sfx === false) return null;
  const cues = collect(plan);
  return (
    <>
      {cues.map((cue, i) => (
        <Sequence key={`${cue.src}-${cue.at}-${i}`} from={Math.round(cue.at * ratio)} durationInFrames={Math.round(60 * ratio)}>
          <Audio src={staticFile(cue.src)} volume={cue.volume} />
        </Sequence>
      ))}
    </>
  );
};
