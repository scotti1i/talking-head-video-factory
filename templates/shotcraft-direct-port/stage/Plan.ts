// ============================================================
// 叙事舞台计划合同（NarrativePlan）
// 由 scripts/narrative-stage-plan.mjs 从 job/data/scene-plan.json 编译生成。
// 所有时间字段在这里都是帧（fps 固定），秒→帧换算只在编译器里发生。
// ============================================================

// close = 人物特写推近（hero 框内 1.45×）；hero-right = 镜像布局（人物在右、内容在左）——2026-09-03 反八股：尺度与位置要有跳跃
export type SpeakerMode = 'hero-center' | 'hero' | 'hero-right' | 'close' | 'close-right' | 'stage' | 'dock' | 'focus' | 'orb-right' | 'orb-left' | 'hidden' | 'full' | 'wide' | 'pip' | 'split' | 'lecture'; // split = 竖屏：原片上移 300，脸在上半区，下半区放 16:9 第三方面板（2026-09-08） // full / wide / pip = studio 皮肤的 16:9 三态（2026-09-07 Scott：横屏素材别裁竖） // stage = 人物全屏（舞台模式）；close-right = 右侧第二机位 // lecture = 课程录屏 Short：A-roll 已合成为 1080×1920（黑底 + 幻灯片 + 人脸），整幅铺满（2026-09-12）

export type SpeakerKeyframe = {at: number; mode: SpeakerMode; cut?: boolean}; // cut = 硬切不形变（双机位）

export type Tone = 'ink' | 'accent' | 'red';

export type GlyphKind =
  | 'creator' | 'search' | 'click' | 'order' | 'ad' | 'organic'
  | 'tiktok' | 'amazon' | 'site' | 'erp' | 'stock' | 'cost' | 'refund' | 'content'
  | 'agent' | 'report' | 'formula' | 'money' | 'none';

export type Window = [number, number];
export type NodeShape = 'card' | 'circle' | 'pill';
export type NodeEnter = 'pop' | 'slam';
export type BadgeFx = 'impact' | 'burst';
export type EdgeStyle = 'line' | 'flyline' | 'chevron'; // chevron = 小Lin 式 » 箭头
export type TextReveal = 'blur-slide' | 'karaoke';
export type FocusStyle = 'box' | 'brackets';
export type FocusZoom = 'shared' | 'crash';
export type KaraokeWord = {t: string; at: number; until: number};
export type PillForm = 'glass' | 'fill' | 'outline';

// ---------- 场景：真人 + 单个概念标签 ----------
export type LabelItem = {text: string; at: number; until?: number; x: number; y: number; tone?: Tone; form?: PillForm; size?: 's' | 'm' | 'l' | 'xl' | 'giant'; odometer?: boolean; underline?: boolean; anchor?: 'left' | 'center'};
export type LabelScene = {id: string; type: 'label'; intent?: string; start: number; end: number; items: LabelItem[]};

// ---------- 场景：公式按口播顺序建立 ----------
export type EquationTerm = {text: string; at: number; kind?: 'term' | 'op' | 'result'};
export type EquationScene = {
  id: string;
  type: 'equation';
  intent?: string;
  start: number;
  end: number;
  rows: {terms: EquationTerm[]}[];
  collapseAt?: number; // 缩成真人前的公式提醒卡
};

// ---------- 场景：持续生长的关系图 ----------
export type NodeState = {
  at: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string; // 有 text 时为文字卡（问题态），否则为图标 + 标签
};
export type GraphNode = {
  id: string;
  label: string;
  kind: GlyphKind;
  at: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string;
  small?: boolean;
  shape?: NodeShape;
  image?: string; // 真实物件插画（public/ 下路径），有则替代线性图标
  tone?: 'red' | 'purple' | 'lime' | 'ink'; // stage3d 彩色实底
  depth?: number; // 立体舞台里的深度（px，越大越靠前；缺省按 id 分三档）
  en?: string; // 双语小字（小Lin 式）
  enter?: NodeEnter; // 建立方式：pop（级联弹簧）/ slam（砸落）
  states?: NodeState[];
  highlight?: Window[];
  dim?: Window[];
  badge?: {at: number; until?: number; text: string; tone?: Tone; fx?: BadgeFx};
  remove?: {at: number; mode?: 'lift' | 'fade'};
  fx?: boolean;
};
export type GraphEdge = {
  from: string;
  to: string;
  at: number;
  dashed?: boolean;
  bend?: number;
  style?: EdgeStyle; // line / flyline（亮头暗尾飞线）
  highlight?: Window[];
  dim?: Window[];
  remove?: {at: number};
};
export type GraphNote = {text: string; at: number; until?: number; x: number; y: number; w?: number; size?: number; tone?: Tone; pill?: boolean};
export type GraphScene = {
  id: string;
  type: 'graph';
  intent?: string;
  start: number;
  end: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  notes?: GraphNote[];
};

// ---------- 场景：多来源沿贝塞尔汇流到同一结果 ----------
export type ConvergeScene = {
  id: string;
  type: 'converge';
  intent?: string;
  start: number;
  end: number;
  sources: {label: string; at?: number}[];
  sink: {label: string; kind: GlyphKind; at: number; image?: string};
  handoff?: 'circle-iris'; // 从上一场景的同心圆以光圈揭开
  irisFrom?: {x: number; y: number; r: number};
  convergeAt: number;
  eraseAt?: number;
  caption?: {text: string; at: number};
  note?: {text: string; at: number};
};

// ---------- 场景：共享对象拆成两个概念（可缩成堆叠提醒） ----------
export type SplitCard = {
  text: string;
  glyph: GlyphKind;
  image?: string;
  glyphLeaveAt?: number; // 图标离场变成问号
  tag?: {text: string; at: number; underline?: boolean};
  accent?: boolean;
  pulseAt?: number; // 口播点到这张卡时轻微呼吸一拍
};
export type SplitScene = {
  id: string;
  type: 'split';
  intent?: string;
  start: number;
  end: number;
  header: {glyph: GlyphKind};
  cards: [SplitCard, SplitCard];
  shiftAt?: number; // 人物回到 dock，卡片右移
  collapseAt?: number; // 两张卡缩成右上角堆叠提醒
};

// ---------- 场景：概念大卡（逐短语揭示）→ 缩成提醒 ----------
export type ConceptScene = {
  id: string;
  type: 'concept';
  intent?: string;
  start: number;
  end: number;
  term: string;
  underline?: boolean; // 术语落定后马克笔下划线
  phrases: {text: string; at: number; reveal?: TextReveal; words?: KaraokeWord[]}[];
  glyph?: GlyphKind; // 右侧有体积的物件
  image?: string; // 真实物件插画，有则替代 glyph
  demoteAt?: number;
  slot?: 0 | 1; // 缩小后落在右上角第几格
};

// ---------- 场景：理解档引用卡（示意封面，不冒充真实来源） ----------
export type ReferenceScene = {
  id: string;
  type: 'reference';
  intent?: string;
  start: number;
  end: number;
  kind: 'mock-cover';
  title: string;
  subtitle?: string;
  tag?: string;
  at: number;
  x: number;
  y: number;
  w: number;
};

// ---------- 场景：B-roll（生成片段 / 第三方视频 / 真实素材），把抽象名词落到现实物件 ----------
export type BrollScene = {
  id: string;
  type: 'broll';
  intent?: string;
  start: number;
  end: number;
  media: string; // public/ 下相对路径
  origin: 'generated' | 'third-party' | 'own'; // 理解档来源类型，只记录不上屏
  caption?: string; // 可选中文角标（如“示意”或来源名）
  layout?: 'panel' | 'full' | 'strip' | 'screen'; // strip = 通栏；screen = 录屏容器（设备框，给 Screen Studio 录屏）
  mediaStart?: number; // 片段起始帧
};

// ---------- 场景：真人前的小提醒堆叠 ----------
export type RemindersScene = {
  id: string;
  type: 'reminders';
  intent?: string;
  start: number;
  end: number;
  items: {text: string; at: number; tone?: Tone}[];
};

// ---------- 场景：引用卡 → 升级为证据页 ----------
export type EvidenceFocus = {at: number; box: {x: number; y: number; w: number; h: number}; scale?: number; style?: FocusStyle; zoom?: FocusZoom; note?: string}; // note = 聚焦句旁的中文译注（2026-09-03 Scott：英文页要给翻译）
export type EvidenceScene = {
  id: string;
  type: 'evidence';
  intent?: string;
  start: number;
  end: number;
  image: string; // public/ 下相对路径
  imageSize: {w: number; h: number};
  thumbCrop: {x: number; y: number; w: number; h: number}; // 引用卡展示区域（截图像素）
  expandAt?: number; // 引用卡升级成证据页
  focus?: EvidenceFocus[];
  source: string; // 中文来源说明
};

// ---------- 场景：左人右图，局部高亮 ----------
export type DataScene = {
  id: string;
  type: 'data';
  intent?: string;
  start: number;
  end: number;
  title: string;
  subtitle?: string;
  series: number[]; // 0..1 归一化
  marker?: {at: number; xFrac: number; label: string};
  highlights?: {at: number; until?: number; range: [number, number]; label: string; tone?: Tone}[];
  chips?: {text: string; at: number; tone?: Tone}[];
  delta?: {at: number; until?: number; text: string};
  spikes?: {at: number; index: number; value: number; label: string}[];
  verdict?: {at: number; text: string; tone?: Tone};
  escapeAt?: number; // 白卡撤走，曲线留在真人画面上
};

// ---------- 场景：递进阶梯（步骤沿对角线逐级抬升，导轨随口播点亮） ----------
export type LadderStep = {id: string; label: string; at: number; image?: string; glyph?: GlyphKind; sub?: string};
export type LadderScene = {
  id: string;
  type: 'ladder';
  intent?: string;
  start: number;
  end: number;
  steps: LadderStep[];
  verdict?: {at: number; text: string; tone?: Tone}; // 最后一级上的判定徽章
  note?: {text: string; at: number; until?: number; tone?: Tone}; // 底部说明 pill
};

// ---------- 场景：循环（节点沿圆环逐个出现，弧线箭头首尾相接，可有中心枢纽） ----------
export type CycleNode = {id: string; label: string; at: number; image?: string; glyph?: GlyphKind};
export type CycleScene = {
  id: string;
  type: 'cycle';
  intent?: string;
  start: number;
  end: number;
  nodes: CycleNode[];
  hub?: {label: string; at: number; image?: string; glyph?: GlyphKind};
  closeAt?: number; // 最后一段弧回到起点的时刻（默认最后节点 at + 0.6s）
  note?: {text: string; at: number; until?: number; tone?: Tone};
};

// ---------- 场景：点缀（口播关键词旁弹出小物件 / 小标签，1.2s 即走） ----------
export type AccentItem = {at: number; until?: number; x?: number; y?: number; anchor?: 'speaker-left' | 'speaker-right'; text?: string; image?: string; glyph?: GlyphKind; size?: number; tone?: Tone}; // anchor = 贴人物两侧肩高（2026-09-03 Scott）
export type AccentScene = {id: string; type: 'accent'; intent?: string; start: number; end: number; items: AccentItem[]};

// ---------- 场景：引用（别人的原话，大引号 + 大字 + 署名） ----------
export type QuoteScene = {id: string; type: 'quote'; intent?: string; start: number; end: number; at: number; text: string; by?: string; y?: number; w?: number};

// ---------- 场景：时间线（横向导轨 + 里程碑上下交错，导轨随口播填充） ----------
export type Milestone = {id: string; label: string; at: number; sub?: string; image?: string; glyph?: GlyphKind; tone?: Tone};
export type TimelineScene = {id: string; type: 'timeline'; intent?: string; start: number; end: number; milestones: Milestone[]; note?: {text: string; at: number; until?: number; tone?: Tone}};

// ---------- 场景：前后对比（左「以前」右「以后」两块面板，逐行揭示，可落判定） ----------
export type ComparePanel = {title: string; at: number; lines: {text: string; at: number}[]; image?: string; glyph?: GlyphKind; tone?: Tone};
export type CompareScene = {id: string; type: 'compare'; intent?: string; start: number; end: number; left: ComparePanel; right: ComparePanel; verdict?: {text: string; at: number; tone?: Tone}};

// ---------- 场景：标题卡（YouTube 横屏开场 2 秒，整屏） ----------
export type TitleScene = {id: string; type: 'title'; intent?: string; start: number; end: number; at?: number; title: string; sub?: string; layout?: 'full' | 'side' | 'topic' | 'banner'}; // topic = 竖屏开场主题卡：下区玻璃面板，眉题 + 大标题 + 冰蓝线（2026-09-08 Scott：开头把 topic show 出来，要高级） // side：人物 hero 在左、标题落右侧内容区（2026-09-06 Scott：叠在大脸上看不清也不好看） // banner：竖屏课程 Short 顶部常驻大字，整条不动（2026-09-12 Scott：上面大字常驻，一句话概括这条讲什么）

// ---------- 场景：手机模拟器（聊天气泡对话） ----------
export type ChatMessage = {from: 'customer' | 'me' | 'ai'; text: string; at: number};
export type ChatScene = {id: string; type: 'chat'; intent?: string; start: number; end: number; side?: 'left' | 'right'; title?: string; messages: ChatMessage[]};

// ---------- 场景：排行榜 / 柱状对比 ----------
export type LeaderboardRow = {label: string; value: number; display?: string; at: number; tone?: Tone; image?: string};
export type LeaderboardScene = {id: string; type: 'leaderboard'; intent?: string; start: number; end: number; title?: string; rows: LeaderboardRow[]; highlight?: number};

// ---------- 场景：计数表盘 ----------
export type GaugeScene = {id: string; type: 'gauge'; intent?: string; start: number; end: number; at: number; value: number; max?: number; unit?: string; display?: string; label?: string; tone?: Tone};

// ---------- 场景：翻牌卡（正面悬念 → 背面答案） ----------
export type FlipScene = {id: string; type: 'flip'; intent?: string; start: number; end: number; flipAt: number; front: {text: string; image?: string}; back: {text: string; sub?: string}};

// ---------- 场景：地图定位（真实地图截图可选；无图用抽象经纬网格，不伪造地理） ----------
export type MapMarker = {id: string; label: string; at: number; x: number; y: number; tone?: Tone};
export type MapSceneType = {id: string; type: 'map'; intent?: string; start: number; end: number; image?: string; markers: MapMarker[]; arcs?: {from: string; to: string; at: number}[]};

// ---------- 场景：剪报（新闻 / 公告一句话级引用，纸质剪片） ----------
export type ClippingScene = {id: string; type: 'clipping'; intent?: string; start: number; end: number; at: number; kicker?: string; headline: string; body?: string; source: string; highlight?: string; rotate?: number};

export type Scene =
  | LabelScene | EquationScene | GraphScene | ConvergeScene | SplitScene
  | ConceptScene | RemindersScene | EvidenceScene | DataScene | ReferenceScene | BrollScene
  | LadderScene | CycleScene | AccentScene | QuoteScene | TimelineScene | CompareScene | TitleScene | ChatScene
  | LeaderboardScene | GaugeScene | FlipScene | MapSceneType | ClippingScene;

export type CaptionLine = {s: number; e: number; t: string};

export type NarrativePlan = {
  schemaVersion: 1;
  fps: number;
  durationInFrames: number;
  source: {media: string; startFrame: number};
  background?: {plate?: string}; // 常驻背景板（public/ 下路径），无则用原片模糊层
  keywords?: string[]; // 字幕里金色加重的关键词（2026-09-03 点缀层）
  content?: [number, number][]; // 编译器算出的「面板上有内容」区间（帧），面板只在这些区间存在（2026-09-04）
  skin?: 'glass' | 'blueprint' | 'paper' | 'stage3d' | 'studio';
  canvas?: {w: number; h: number}; // 画布（默认 1920×1080；竖屏 1080×1920，2026-09-07）
  speaker: SpeakerKeyframe[];
  sfx?: boolean;
  captions: CaptionLine[];
  captionBottom?: number; // 字幕距底（px）；lecture 版式要落到胸口不压五官（2026-09-12）
  scenes: Scene[];
};
