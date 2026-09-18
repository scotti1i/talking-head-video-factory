import {AbsoluteFill, Audio, Composition, staticFile} from 'remotion';
import {PaperTitleCard} from '../aifl/PaperTitleCard';
import {FactoryListStack, ListStackProps} from './ListStack';
import {FactoryRowEmbed, RowEmbedProps} from './RowEmbed';
import {CONTINUOUS_RELATION_DURATION, ContinuousRelationScene} from './ContinuousRelationScene';
import {NarrativeStage} from './stage/NarrativeStage';
import {StageGallery} from './stage/Gallery';
import {Styleframe} from './stage/Styleframe';
import {NARRATIVE_PLAN} from './NarrativePlan';

// 成片可用 REMOTION_RENDER_FPS=60 提升输出帧率：动效按逻辑帧插值变顺滑，A-roll 仍是源帧率；分镜与组件的帧常量不变
const RENDER_FPS = Number((globalThis as unknown as {process?: {env?: Record<string, string>}}).process?.env?.REMOTION_RENDER_FPS) || NARRATIVE_PLAN.fps;
const NarrativeStageComposition: React.FC = () => <NarrativeStage plan={NARRATIVE_PLAN} />;

type Word = {text: string; accent?: boolean};
type PaperTitleProps = {words: Word[]; sub?: string; subDigits?: string; fontFamily?: string};

const FactoryPaperTitle: React.FC<PaperTitleProps> = ({words, sub, subDigits, fontFamily}) => (
  <AbsoluteFill style={{backgroundColor: '#f2eee6'}}>
    <Audio src={staticFile('audio/swoosh-quick.mp3')} volume={0.4}/>
    <PaperTitleCard duration={55} words={words} sub={sub} subDigits={subDigits} fontFamily={fontFamily}/>
  </AbsoluteFill>
);

export const FactoryRoot: React.FC = () => (
  <>
    <Composition id="Styleframe" component={Styleframe} durationInFrames={60} fps={30} width={1920} height={1080} />
    <Composition id="StageGallery" component={StageGallery} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition
      id="NarrativeStage"
      component={NarrativeStageComposition}
      durationInFrames={Math.round(NARRATIVE_PLAN.durationInFrames * (RENDER_FPS / NARRATIVE_PLAN.fps))}
      fps={RENDER_FPS}
      width={NARRATIVE_PLAN.canvas?.w ?? 1920}
      height={NARRATIVE_PLAN.canvas?.h ?? 1080}
    />
    <Composition
      id="ContinuousRelationScene"
      component={ContinuousRelationScene}
      durationInFrames={CONTINUOUS_RELATION_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="FactoryPaperTitle"
      component={FactoryPaperTitle}
      durationInFrames={55}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        words: [{text: '归因'}, {text: '不等于', accent: true}, {text: '增量'}],
        fontFamily: 'Songti SC, STSong, serif',
      }}
    />
    <Composition
      id="FactoryListStack"
      component={FactoryListStack}
      durationInFrames={105}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: '同一套算法看全域',
        items: [{title: 'TikTok'}, {title: 'Amazon'}, {title: '独立站'}, {title: 'ERP'}, {title: '退款与达人内容'}],
        fontFamily: 'Songti SC, STSong, serif',
      } satisfies ListStackProps}
    />
    <Composition
      id="FactoryRowEmbed"
      component={FactoryRowEmbed}
      durationInFrames={100}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: '先把变量固定下来',
        rows: [{label: '价格', value: '保持稳定'}, {label: '优惠', value: '保持稳定'}, {label: '达人内容', value: '避免突变'}],
        fontFamily: 'Songti SC, STSong, serif',
      } satisfies RowEmbedProps}
    />
  </>
);
