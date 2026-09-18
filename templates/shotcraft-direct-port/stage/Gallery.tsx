// ============================================================
// 组件变体总览（给 Scott 看的"零件盘"）：所有可复用的小件在同一帧上并排，
// 用于前端审美对齐，不进入成片。
// ============================================================
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Glyph} from './Glyph';
import {ACCENT, ACCENT_SOFT, FONT, INK, REMINDER_SLOTS, accentPill, surface} from './theme';
import {Background} from './Chrome';

const Section: React.FC<{title: string; x: number; y: number; w: number; children: React.ReactNode}> = ({title, x, y, w, children}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w}}>
    <div style={{fontFamily: FONT, fontSize: 20, fontWeight: 500, color: 'rgba(245,245,247,.5)', letterSpacing: '0.08em', marginBottom: 14}}>{title}</div>
    <div style={{display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap'}}>{children}</div>
  </div>
);

const Node: React.FC<{shape: 'card' | 'circle' | 'pill'; form: 'glass' | 'fill' | 'outline'; label: string; kind: any; badge?: string; red?: boolean}> = ({shape, form, label, kind, badge, red}) => {
  const size = shape === 'card' ? {w: 200, h: 140, r: 24} : shape === 'circle' ? {w: 150, h: 150, r: 999} : {w: 190, h: 64, r: 999};
  const active = form === 'fill' ? 1 : 0;
  return (
    <div style={{position: 'relative', width: size.w, height: size.h, ...surface(form, {radius: size.r, active}), display: 'flex', flexDirection: shape === 'pill' ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: shape === 'pill' ? 10 : 6, color: INK, opacity: form === 'outline' ? 0.55 : 1}}>
      <Glyph kind={kind} active={active > 0} size={shape === 'pill' ? 34 : shape === 'circle' ? 50 : 56} />
      <div style={{fontFamily: FONT, fontSize: shape === 'pill' ? 24 : 25, fontWeight: 600}}>{label}</div>
      {badge ? <div style={{position: 'absolute', right: -14, top: shape === 'pill' ? -22 : undefined, bottom: shape === 'pill' ? undefined : -14, padding: '6px 14px', ...accentPill(red ? 'red' : 'accent'), fontFamily: FONT, fontSize: 20, fontWeight: 700}}>{badge}</div> : null}
    </div>
  );
};

const Pill: React.FC<{form: 'glass' | 'fill' | 'outline'; size: 's' | 'm' | 'l'; text: string; accent?: boolean}> = ({form, size, text, accent}) => {
  const fontSize = size === 's' ? 24 : size === 'l' ? 36 : 30;
  const pad = size === 's' ? '8px 16px' : size === 'l' ? '14px 30px' : '11px 22px';
  const styled = accent && form === 'fill' ? accentPill('accent') : surface(form, {radius: 999});
  return <div style={{padding: pad, ...styled, color: accent && form === 'fill' ? '#141416' : accent ? ACCENT : INK, fontFamily: FONT, fontSize, fontWeight: 600, whiteSpace: 'nowrap'}}>{text}</div>;
};

export const StageGallery: React.FC = () => (
  <AbsoluteFill style={{background: '#0A0A0C', overflow: 'hidden'}}>
    <Background frame={200} durationInFrames={1000} media="factory/aroll.mp4" startFrom={900} />
    <div style={{position: 'absolute', left: 60, top: 40, fontFamily: FONT, fontSize: 30, fontWeight: 600, color: INK, letterSpacing: '-0.02em'}}>叙事舞台 · 组件变体总览（v3 材质）</div>
    <div style={{position: 'absolute', left: 60, top: 82, fontFamily: FONT, fontSize: 20, color: 'rgba(245,245,247,.5)'}}>玻璃面 = 普通 · 填充面 = 当前焦点 · 描边面 = 降权 / 旧路径 · 强调色只落在正在讲的东西上</div>

    <Section title="关系图节点 · 三种形态 × 三种材质" x={60} y={150} w={1240}>
      <Node shape="card" form="glass" label="达人视频" kind="creator" />
      <Node shape="card" form="fill" label="广告点击" kind="click" badge="全算广告的" />
      <Node shape="card" form="outline" label="品牌搜索" kind="search" />
      <Node shape="circle" form="glass" label="TikTok" kind="tiktok" />
      <Node shape="circle" form="fill" label="订单" kind="order" badge="没点" red />
      <Node shape="pill" form="glass" label="报表" kind="report" badge="效果更好" />
    </Section>

    <Section title="标签 · 三种材质 × 三档尺寸" x={60} y={380} w={1240}>
      <Pill form="glass" size="s" text="自然单" />
      <Pill form="outline" size="s" text="广告单" />
      <Pill form="glass" size="m" text="价格变了" />
      <Pill form="outline" size="m" text="促销变了" />
      <Pill form="fill" size="m" text="所谓「真实的 ROI」" accent />
      <Pill form="fill" size="l" text="最后一跳" accent />
      <Pill form="outline" size="s" text="库存" />
    </Section>

    <Section title="公式项 · 普通项 / 运算符 / 结果项" x={60} y={520} w={1240}>
      <div style={{padding: '0 24px', height: 76, display: 'flex', alignItems: 'center', ...surface('outline', {radius: 16}), color: INK, fontFamily: FONT, fontSize: 40, fontWeight: 600}}>广告点击量</div>
      <div style={{color: ACCENT, fontFamily: FONT, fontSize: 50, fontWeight: 500}}>×</div>
      <div style={{padding: '0 24px', height: 76, display: 'flex', alignItems: 'center', ...surface('outline', {radius: 16}), color: INK, fontFamily: FONT, fontSize: 40, fontWeight: 600}}>转化率</div>
      <div style={{color: ACCENT, fontFamily: FONT, fontSize: 50, fontWeight: 500}}>=</div>
      <div style={{padding: '0 24px', height: 76, display: 'flex', alignItems: 'center', ...surface('fill', {radius: 16, accent: true, active: 1}), background: ACCENT_SOFT, color: ACCENT, fontFamily: FONT, fontSize: 40, fontWeight: 600}}>广告单</div>
    </Section>

    <Section title="提醒卡 · 当前 / 已降权" x={60} y={660} w={1240}>
      <div style={{width: 520, height: 120, ...surface('fill', {radius: 22, accent: true}), display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', color: INK, fontFamily: FONT}}>
        <div style={{padding: '5px 14px', ...accentPill('accent'), fontSize: 24, fontWeight: 700}}>增量</div>
        <div style={{fontSize: 24, fontWeight: 600}}>没有这笔广告费他还会不会买</div>
      </div>
      <div style={{width: 520, height: 120, ...surface('glass', {radius: 22}), display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', color: INK, fontFamily: FONT, opacity: 0.62}}>
        <div style={{padding: '5px 14px', ...accentPill('accent'), fontSize: 24, fontWeight: 700}}>归因</div>
        <div style={{fontSize: 24, fontWeight: 600}}>订单最后从哪里进来</div>
      </div>
    </Section>

    <Section title="示意封面（理解档引用卡）" x={1320} y={150} w={540}>
      <div style={{position: 'relative', width: 520, height: 292, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #1B1B22 0%, #0E0E12 60%, #16161C 100%)', boxShadow: '0 0 0 3px rgba(255,255,255,.94), 0 28px 70px rgba(0,0,0,.5)'}}>
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 78% 28%, rgba(230,232,147,.22), rgba(230,232,147,0) 48%)'}} />
        <div style={{position: 'absolute', left: 24, top: 20, padding: '5px 14px', ...accentPill('accent'), fontFamily: FONT, fontSize: 19, fontWeight: 700}}>教程</div>
        <div style={{position: 'absolute', left: 28, right: 28, bottom: 30, color: INK, fontFamily: FONT}}>
          <div style={{fontSize: 44, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.035em', whiteSpace: 'pre-line'}}>{'GMV Max\n自然单 / 广告单\n怎么拆'}</div>
          <div style={{marginTop: 8, fontSize: 20, fontWeight: 500, color: 'rgba(245,245,247,.7)'}}>常见教程封面</div>
        </div>
        <div style={{position: 'absolute', right: 24, top: 20, width: 50, height: 50, borderRadius: 25, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <svg width="20" height="20" viewBox="0 0 22 22"><path d="M6 3 L19 11 L6 19 Z" fill={ACCENT} /></svg>
        </div>
      </div>
    </Section>

    <Section title="概念卡 · 术语 + 逐短语揭示" x={1320} y={520} w={540}>
      <div style={{position: 'relative', width: 520, height: 300, ...surface('glass', {radius: 26, soft: true, active: 0.3}), overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10}}>
          <div style={{padding: '7px 20px', ...surface('outline', {radius: 999, accent: true}), color: ACCENT, fontFamily: FONT, fontSize: 22, fontWeight: 600, letterSpacing: '0.04em'}}>GMV Max 能决定的</div>
          <div style={{width: 64, height: 1, background: 'rgba(230,232,147,.4)'}} />
        </div>
        <div style={{position: 'absolute', left: 30, right: 30, top: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, fontFamily: FONT, fontWeight: 700, fontSize: 30}}>
          <div style={{color: INK, opacity: 0.55}}>钱进了 TikTok 之后</div>
          <div style={{color: ACCENT}}>这笔钱该怎么花</div>
        </div>
      </div>
    </Section>

    <div style={{position: 'absolute', left: 60, bottom: 40, fontFamily: FONT, fontSize: 18, color: 'rgba(245,245,247,.4)'}}>提醒槽位：右上 {REMINDER_SLOTS[0].w}×{REMINDER_SLOTS[0].h} · 字幕安全区 y ≥ 900 · 人物框发丝线 + 深柔影，不发光</div>
  </AbsoluteFill>
);
