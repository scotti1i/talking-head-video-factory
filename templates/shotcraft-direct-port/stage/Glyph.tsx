// ============================================================
// 可识别对象图标：线性、单色（墨 / 强调色），72×72
// 关系节点必须是“可识别物体”，不是抽象方框——这里是工厂通用的物件词汇表
// ============================================================
import React from 'react';
import {Img, staticFile} from 'remotion';
import type {GlyphKind} from './Plan';
import {ACCENT, INK} from './theme';

// 真实物件插画：有 image 就用图（理解档生成物件），否则退回线性图标
export const Object3: React.FC<{image?: string; kind: GlyphKind; active?: boolean; size?: number}> = ({image, kind, active, size = 72}) =>
  image ? <Img src={staticFile(image)} style={{width: size * 1.8, height: size * 1.8, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.45))'}} /> : <Glyph kind={kind} active={active} size={size} />;

export const Glyph: React.FC<{kind: GlyphKind; active?: boolean; size?: number}> = ({kind, active = false, size = 72}) => {
  const stroke = active ? ACCENT : INK;
  const fill = active ? ACCENT : INK;
  const c = {fill: 'none', stroke, strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const wrap = (children: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 72 72">
      {children}
    </svg>
  );
  switch (kind) {
    case 'creator':
    case 'organic':
      return wrap(
        <>
          <rect x="12" y="8" width="48" height="56" rx="10" {...c} />
          <path d="M30 25 L48 36 L30 47 Z" fill={fill} stroke="none" />
          {kind === 'organic' ? <path d="M47 13 C55 15 58 21 57 28 C50 27 45 22 47 13 Z" fill={ACCENT} stroke="none" /> : null}
        </>,
      );
    case 'search':
      return wrap(
        <>
          <circle cx="31" cy="31" r="19" {...c} />
          <path d="M45 45 L61 61" {...c} />
        </>,
      );
    case 'click':
      return wrap(<path d="M18 10 L54 38 L38 42 L48 60 L38 65 L28 46 L16 57 Z" {...c} />);
    case 'ad':
      return wrap(
        <>
          <path d="M14 29 L44 17 L44 55 L14 43 Z" {...c} />
          <path d="M44 27 C55 30 58 42 44 46" {...c} />
          <path d="M19 44 L24 59 L35 56 L31 48" {...c} />
        </>,
      );
    case 'order':
      return wrap(
        <>
          <path d="M17 26 H55 L52 61 H20 Z" {...c} />
          <path d="M27 27 C27 10 45 10 45 27" {...c} />
          <path d="M29 43 L35 49 L46 37" {...c} />
        </>,
      );
    case 'tiktok':
      return wrap(
        <>
          <path d="M39 10 V46 C39 54 32 59 25 58 C18 57 14 51 15 45 C16 39 22 35 29 37" {...c} />
          <path d="M39 10 C41 20 47 25 56 26" {...c} />
        </>,
      );
    case 'amazon':
      return wrap(
        <>
          <path d="M22 16 H50 L54 30 H18 Z" {...c} />
          <path d="M18 30 H54 V58 H18 Z" {...c} />
          <path d="M28 44 C32 50 40 50 44 44" {...c} />
        </>,
      );
    case 'site':
      return wrap(
        <>
          <circle cx="36" cy="36" r="24" {...c} />
          <path d="M12 36 H60 M36 12 C26 22 26 50 36 60 M36 12 C46 22 46 50 36 60" {...c} />
        </>,
      );
    case 'erp':
      return wrap(
        <>
          <rect x="12" y="14" width="48" height="12" rx="4" {...c} />
          <rect x="12" y="30" width="48" height="12" rx="4" {...c} />
          <rect x="12" y="46" width="48" height="12" rx="4" {...c} />
        </>,
      );
    case 'stock':
      return wrap(
        <>
          <path d="M12 28 L36 16 L60 28 V56 H12 Z" {...c} />
          <path d="M12 28 L36 40 L60 28 M36 40 V56" {...c} />
        </>,
      );
    case 'cost':
      return wrap(
        <>
          <circle cx="36" cy="36" r="24" {...c} />
          <path d="M36 20 V52 M28 28 H40 C44 28 44 36 40 36 H32 C28 36 28 44 32 44 H44" {...c} />
        </>,
      );
    case 'refund':
      return wrap(
        <>
          <path d="M22 26 H50 C56 26 58 32 58 36 C58 40 56 46 50 46 H24" {...c} />
          <path d="M30 18 L22 26 L30 34" {...c} />
          <path d="M18 54 H54" {...c} />
        </>,
      );
    case 'content':
      return wrap(
        <>
          <rect x="14" y="12" width="44" height="48" rx="8" {...c} />
          <path d="M24 26 H48 M24 36 H48 M24 46 H38" {...c} />
        </>,
      );
    case 'agent':
      return wrap(
        <>
          <rect x="14" y="22" width="44" height="34" rx="10" {...c} />
          <circle cx="28" cy="38" r="4" fill={fill} stroke="none" />
          <circle cx="44" cy="38" r="4" fill={fill} stroke="none" />
          <path d="M36 10 V22 M26 56 V62 M46 56 V62" {...c} />
        </>,
      );
    case 'report':
      return wrap(
        <>
          <rect x="14" y="12" width="44" height="48" rx="6" {...c} />
          <path d="M24 48 V36 M36 48 V26 M48 48 V40" {...c} />
        </>,
      );
    case 'formula':
      return wrap(
        <>
          <path d="M16 24 H36 M16 48 H36" {...c} />
          <path d="M44 24 L58 48 M58 24 L44 48" {...c} />
        </>,
      );
    case 'money':
      return wrap(
        <>
          <rect x="10" y="20" width="52" height="32" rx="6" {...c} />
          <circle cx="36" cy="36" r="8" {...c} />
        </>,
      );
    default:
      return null;
  }
};
