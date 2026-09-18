// ============================================================
// 标题卡：YouTube 横屏开场 2 秒。整屏，人物一般为 stage（全屏）或 hidden；大字 blur-slide，副题延后 10 帧。
// ============================================================
import React from 'react';
import type {TitleScene} from './Plan';
import {ACCENT, FONT, INK, stageOpacity, surface} from './theme';
import {PORTRAIT} from './Canvas';
import {blurSlide} from './motions';

export const Title: React.FC<{frame: number; scene: TitleScene}> = ({frame, scene}) => {
  const at = scene.at ?? scene.start;
  if (frame < at - 4 || frame >= scene.end + 20) return null;
  const opacity = stageOpacity(frame, at, scene.end, 12, 14);
  const a = blurSlide(frame, at, 18, 46);
  const b = blurSlide(frame, at + 10, 16, 30);
  const side = scene.layout === 'side';
  const size = side ? (scene.title.length > 12 ? 84 : 104) : scene.title.length > 12 ? 96 : scene.title.length > 8 ? 120 : 150;
  if (scene.layout === 'banner') {
    // 竖屏课程 Short：顶部常驻大字，整条不动（2026-09-12 Scott：上面大字常驻，一句话概括这条讲什么；参考真实 Shorts 是纯黑标题带 + 通栏画面）
    // 苹方最重只到 Semibold，用 text-stroke 补到参考图那个字重；不加眉题、不加强调线——那些是 AI 味装饰
    const lines = scene.title.split('\n');
    const longest = Math.max(...lines.map((x) => x.length));
    const fs = longest > 12 ? 76 : longest > 10 ? 86 : longest > 8 ? 96 : 104;
    const fade = Math.min(1, Math.max(0, (frame - at + 4) / 10));
    return (
      <div style={{position: 'absolute', left: 40, right: 40, top: 300, height: 240, zIndex: 60, opacity: fade, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{fontFamily: FONT, fontSize: fs, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.16, color: '#FFFFFF', WebkitTextStroke: '2.5px #FFFFFF', textAlign: 'center', whiteSpace: 'pre-line'}}>{scene.title}</div>
      </div>
    );
  }
  if (scene.layout === 'topic') {
    // 竖屏开场主题卡：下区玻璃面板，眉题（系列名）+ 大标题 + 冰蓝线从左生长；人物在 focus 态，卡不压脸
    const longest = Math.max(...scene.title.split('\n').map((x) => x.length));
    const ts = longest > 12 ? 52 : longest > 9 ? 60 : 68;
    const rule = Math.min(1, Math.max(0, (frame - at - 14) / 22));
    return (
      <div style={{position: 'absolute', left: 60, top: 990, width: 840, height: 310, zIndex: 60, opacity, ...surface('glass', {radius: 26}), boxSizing: 'border-box', padding: '34px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, transform: `translateY(${(1 - a.opacity) * 24}px)`}}>
        <div style={{fontFamily: FONT, fontSize: 24, fontWeight: 600, letterSpacing: '0.14em', color: ACCENT, ...a}}>{scene.sub ?? '创业思考'}</div>
        <div style={{fontFamily: FONT, fontSize: ts, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.14, color: INK, whiteSpace: 'pre-line', ...a}}>{scene.title}</div>
        <div style={{width: 160 * rule, height: 3, background: ACCENT, opacity: 0.9}} />
      </div>
    );
  }
  if (side && PORTRAIT) {
    // 竖屏：人物铺满，标题落在脸下方的下区（y 940–1300），左对齐，不压脸
    const ps = scene.title.length > 10 ? 60 : scene.title.length > 6 ? 74 : 88;
    return (
      <div style={{position: 'absolute', left: 60, top: 990, width: 840, height: 310, zIndex: 60, opacity, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 16}}>
        <div style={{fontFamily: FONT, fontSize: ps, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, color: INK, textAlign: 'left', textShadow: '0 6px 30px rgba(0,0,0,.6)', ...a}}>{scene.title}</div>
        {scene.sub ? <div style={{fontFamily: FONT, fontSize: 30, fontWeight: 600, color: ACCENT, letterSpacing: '0.04em', ...b}}>{scene.sub}</div> : null}
        <div style={{width: 120, height: 3, background: ACCENT, ...b, opacity: 0.8 * b.opacity}} />
      </div>
    );
  }
  if (side) {
    // 人物 hero 在左（x 54–638），标题占右侧内容区，左对齐，不压脸、不加整屏暗幕
    return (
      <div style={{position: 'absolute', left: 720, top: 60, width: 1140, height: 840, zIndex: 60, opacity, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 22}}>
        <div style={{fontFamily: FONT, fontSize: size, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, color: INK, textAlign: 'left', textShadow: '0 6px 30px rgba(0,0,0,.6)', ...a}}>{scene.title}</div>
        {scene.sub ? <div style={{fontFamily: FONT, fontSize: 36, fontWeight: 600, color: ACCENT, letterSpacing: '0.04em', ...b}}>{scene.sub}</div> : null}
        <div style={{width: 160, height: 3, background: ACCENT, ...b, opacity: 0.8 * b.opacity}} />
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 60, opacity, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: 'linear-gradient(180deg, rgba(11,11,13,.35), rgba(11,11,13,.7))'}}>
      <div style={{fontFamily: FONT, fontSize: size, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: INK, textAlign: 'center', textShadow: '0 6px 30px rgba(0,0,0,.6)', ...a}}>{scene.title}</div>
      {scene.sub ? <div style={{fontFamily: FONT, fontSize: 34, fontWeight: 600, color: ACCENT, letterSpacing: '0.04em', ...b}}>{scene.sub}</div> : null}
      <div style={{width: 160, height: 3, background: ACCENT, ...b, opacity: 0.8 * b.opacity}} />
    </div>
  );
};
