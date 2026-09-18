import React from 'react';
import {Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CamKey, PageCam} from '../aifl/live/PageCam';
import layout from '../aifl/live-layout.json';

export type RowEmbedItem = {label: string; value?: string};
export type RowEmbedProps = {title: string; kicker?: string; rows: RowEmbedItem[]; fontFamily?: string};

const DETAIL_H = layout.detail.pageH;
const ROWS = layout.detail.rows;
const DETAIL_CAM: CamKey[] = [
  {frame: 0, cx: 960, cy: 300, zoom: 1.1},
  {frame: 75, cx: 960, cy: 760, zoom: 1.0},
];
const CAMERA_EASE = Easing.bezier(0.33, 0, 0.15, 1);
const FLY_EASE = Easing.bezier(0.3, 0, 0.25, 1);
const AMBER = 'oklch(58% 0.13 65)';
const INK = 'oklch(18% 0.006 82)';
const MUTED = 'oklch(50% 0.006 82)';
const PAPER = '#faf7f2';

// SceneDetail 的直接内容移植：PageCam、页面尺寸、行坐标、镜头关键帧、
// 9f 错峰、12f 飞入、16° 倾角、压入回弹和 8f 琥珀落位缝均来自上游。
// 唯一替换的是原截图中烘焙死的文字内容。
export const FactoryRowEmbed: React.FC<RowEmbedProps> = ({title, kicker = '计算过程', rows, fontFamily}) => {
  const frame = useCurrentFrame();
  const visibleRows = rows.slice(0, 5);
  const serif = fontFamily || 'Songti SC, STSong, serif';

  return (
    <>
      <Sequence from={10}><Audio src={staticFile('audio/transition-soft.mp3')} volume={0.45}/></Sequence>
      <PageCam
        src="textures/live/detail-full.png"
        pageH={DETAIL_H}
        keys={DETAIL_CAM}
        ease={CAMERA_EASE}
      >
        {/* 覆盖上游截图中的固定英文；相机与页面坐标仍由上游 PageCam 驱动。 */}
        <div style={{position: 'absolute', inset: 0, background: PAPER}}/>

        <div style={{position: 'absolute', left: 408, top: 86, width: 1104, color: INK}}>
          <div style={{fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, letterSpacing: '0.14em', color: MUTED}}>
            {kicker}
          </div>
          <div style={{marginTop: 16, fontFamily: serif, fontSize: 54, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15}}>
            {title}
          </div>
          <div style={{marginTop: 24, width: 90, height: 2, background: AMBER}}/>
        </div>

        <div style={{position: 'absolute', left: 408, top: 594, width: 1104, height: 1, background: 'rgba(78,58,32,.14)'}}/>
        {visibleRows.map((row, i) => {
          const r = ROWS[i];
          const cue = 12 + i * 9;
          const land = cue + 12;
          const patchOpacity = interpolate(frame, [land, land + 2], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const p = interpolate(frame, [cue, cue + 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: FLY_EASE,
          });
          const appear = interpolate(frame, [cue, cue + 3], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const scale = frame < land
            ? 1.06 - 0.065 * p
            : interpolate(frame, [land, land + 4], [0.995, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.quad),
              });
          const air = 1 - p;
          const spread = interpolate(frame, [land, land + 5], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const seamOpacity = interpolate(frame, [land, land + 2, land + 8], [1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const seamW = r.w * spread;

          const rowSurface = (
            <div style={{position: 'absolute', inset: 0, borderBottom: '1px solid rgba(78,58,32,.12)', background: '#fff'}}>
              <div style={{position: 'absolute', left: 18, top: 37, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, color: AMBER}}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{position: 'absolute', left: 78, top: 25, maxWidth: row.value ? 730 : 980, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: serif, fontSize: 30, fontWeight: 600, color: INK}}>
                {row.label}
              </div>
              {row.value ? (
                <div style={{position: 'absolute', right: 22, top: 31, maxWidth: 250, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: serif, fontSize: 23, color: MUTED}}>
                  {row.value}
                </div>
              ) : null}
            </div>
          );

          return (
            <React.Fragment key={`${row.label}-${i}`}>
              {/* 落地后保留动态内容；飞入时由纸色补片暂时遮住。 */}
              <div style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h}}>{rowSurface}</div>
              {patchOpacity > 0 ? (
                <div style={{position: 'absolute', left: r.x - 8, top: r.y - 4, width: r.w + 24, height: r.h + 8, background: PAPER, opacity: patchOpacity, zIndex: 1, pointerEvents: 'none'}}/>
              ) : null}
              {frame >= cue && frame < cue + 16 ? (
                <div style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 8, opacity: appear, transform: `perspective(900px) translateY(${-120 * air}px) rotateX(${16 * air}deg) scale(${scale})`, boxShadow: `0 ${30 * air}px ${60 * air}px rgba(30,25,18,${0.22 * air}), 0 ${8 * air}px ${16 * air}px rgba(30,25,18,${0.12 * air})`, zIndex: 3, overflow: 'hidden', pointerEvents: 'none'}}>
                  {rowSurface}
                </div>
              ) : null}
              {frame >= land && frame < land + 8 ? (
                <div style={{position: 'absolute', left: r.x + (r.w - seamW) / 2, top: r.y + r.h - 2, width: seamW, height: 2, background: AMBER, boxShadow: '0 0 6px rgba(180,120,50,.35)', opacity: seamOpacity, zIndex: 4, pointerEvents: 'none'}}/>
              ) : null}
            </React.Fragment>
          );
        })}
      </PageCam>
    </>
  );
};
