// ============================================================
// Claude 任务卡:判断类工序(精剪/字幕/排拍/切片)交给 Claude Code,
// 这里生成自带路径与硬规则的完整提示词,复制即用。
// ============================================================
import path from "node:path";
import { ROOT, jobDir, readJsonSafe } from "./jobs.mjs";
import { loadComponentPromptCatalog, promptCatalogLines } from "../scripts/component-registry.mjs";

export function buildPrompt(slug, kind) {
  const dir = jobDir(slug);
  const config = readJsonSafe(path.join(dir, "project.json"), {});
  const context = {
    slug,
    dir,
    root: ROOT,
    title: config.title || slug,
    aroll: path.join(dir, config.sourceVideo || "assets/aroll.mp4"),
    theme: config.theme || "warm-glass",
    profile: config.profile || "clean-talkinghead",
    visualOperatingSystemVersion: Number(config.visual?.operatingSystemVersion || 0),
    scriptPath: config.editorial?.writtenScript?.path || null,
    scriptPolicy: config.editorial?.writtenScript?.policy || null
  };
  const generators = { cuts, captions, beats, shorts };
  const make = generators[kind];
  if (!make) throw new Error(`未知任务卡: ${kind}(可用: ${Object.keys(generators).join("/")})`);
  return make(context);
}

function cuts({ dir, root, slug }) {
  return `请调用 talkinghead-edit Skill 精剪这条口播；它是唯一日常入口。

工程目录:${root}
Job:${dir}

要做:
1. 读取 ${root}/skills/talkinghead-edit/SKILL.md、docs/data-contract.md 和本 Job 的 project.md。
2. 先 inventory，再按源文件 hash 复用或生成 data/transcripts/index.json；禁止用静音检测替代语义判断。
3. 通篇判断口误、失败重录、重复含义和废稿，写带 reason 的 data/rough-cut-edl.json；不重排叙事顺序。
4. 切点保留自然呼吸，不削字；渲染前 df -h 至少 50G，长任务走后台。
5. 渲染后执行 qa:cuts，逐刀检查画面和波形；没有真实检查不得 approve。
6. 通过后再生成母版 A-roll，并回报 EDL、QA 与母版路径。

铁律:原片保持在 assets/originals；不重复转录；不把旧静音 EDL 当主链。`;
}

function captions({ dir, root, slug, aroll, title, profile, scriptPath, scriptPolicy }) {
  return `帮我给这条口播生成并校准全量字幕。

工程目录:${root}
Job:${dir}
母版 A-roll:${aroll}
主题:《${title}》

要做:
1. 先运行 cd ${root} && npm run captions:build -- --job jobs/${slug}，从 data/transcripts/index.json 和语义 EDL 重映射；禁止对母版重复 Whisper。
2. 整理 ${dir}/data/captions.json,格式 [{"s":开始秒,"e":结束秒,"t":"字幕文本"}],按目标语言语义断句，不把 Whisper 子词直接当最终字幕。
3. 校准硬规则:必须先通篇审读,按整条视频的语义场统一术语;不得凭单个 ASR 片段或常识覆盖我确认过的核心词(拿不准的词列出来问我,不要自作主张改)。
4. 当前内容 profile:${profile}。${scriptPath ? `书面脚本:${path.join(dir, scriptPath)}，策略:${scriptPolicy || "reference"}；脚本优先于 ASR 拼写并检查语义完整性。` : "本 job 未声明书面脚本，ASR 不确定项必须显式列出。"}
5. 字幕必须全量覆盖,不允许"卡片和字幕二选一"——与卡片重叠的字幕由构建器自动上移,不用你处理。
6. 时间轴用母版 A-roll 的时间(就是最终成片时间)。

产出:data/captions.json + 一份"待确认术语清单"。`;
}

function beats({ dir, root, slug, title, theme, profile, visualOperatingSystemVersion }) {
  if (visualOperatingSystemVersion >= 1) {
    return visualPlan({ dir, root, slug, title, profile });
  }
  const captionsFile = path.join(dir, "data", "captions.json");
  const captionCount = (readJsonSafe(captionsFile, []) || []).length;
  const components = loadComponentPromptCatalog({ root });
  const catalog = promptCatalogLines(components).join("\n");
  return `帮我给这条口播排动态卡拍子(beats)。

工程目录:${root}
Job:${dir}
主题:《${title}》 当前视觉主题:${theme}
字幕:data/captions.json(${captionCount} 条,时间轴即成片时间轴)

要做:读通字幕,挑信息密度高、需要辅助理解的位置,写 ${dir}/data/beats.json。当前内容 profile:${profile}。${profile === "factory-acquisition" ? "工厂外贸只使用样片语言中的语义贴纸、真实证据、CTA 与少量冲击节点；不套通用科普卡。" : profile === "commercial-showcase" ? "商单以真实产品、实操和结果证据为主，卡片只补充对比或结论。" : "普通口播可以零卡片；没有必要辅助理解时保持空数组。"}

当前组件目录(${components.length} 种，所有卡都要 kicker + title + start + end):
${catalog}

排拍铁律:
1. 每拍 start 落在我开口讲该点的位置,end 在该论点讲完处;拍长约 6-20s。
2. 相邻拍换模板,不连用同一种;全片节奏 8min≈22 拍等比换算。
3. kicker 是中文短标签(如"核心比喻""现场案例"),title 是一句话论点。
4. 文案从字幕里提炼,不虚构我没讲的内容。
5. 不需要处理遮挡:构建器固定"底部安全区不挡脸 + 全字幕"方案。
6. 默认不写 formats，表示竖屏和横屏都使用；仅在内容只适合某个画幅时写 formats:["portrait"] 或 formats:["landscape"]。YouTube 横屏是重新排版，不是裁切竖屏。
7. 写完执行:cd ${root} && npm run build:beats -- --job jobs/${slug},然后 cd jobs/${slug} && npm run check,用 npx hyperframes@0.5.6 snapshot . --at <几个拍子中点> 抽帧确认排版。

产出:data/beats.json + snapshot 抽帧确认。`;
}

export function visualPlan({ dir, root, slug, title, profile }) {
  return `请调用 talkinghead-edit Skill，为这条口播制作视觉上下文与视觉计划；禁止直接凭字幕手写 beats.json。

工程目录:${root}
Job:${dir}
主题:《${title}》 内容 profile:${profile}

先读:
- ${root}/docs/visual-operating-system.md
- ${root}/visual-recipes/QUICKSTART.md
- ${root}/docs/planner-contract.md
- ${dir}/data/editorial-plan.json

流程:
1. 运行 cd ${root} && npm run visual:context -- --job jobs/${slug}；若文件已存在就读取并增量补充，禁止 --force 覆盖研究/用户输入。
2. 通读完整内容计划、字幕、A-roll 与本地素材。逐个解决 visual-context.json.gaps：工具分析自己做；公开事实与素材自己研究并存档；私有资料、战略解释、版权和用户审美才询问用户。
3. 每个视觉先定义 visualJob，再用 npm run visual:recipes -- search --query "<job> <内容关键词>" 查询生产武器；需要研究候选才加 --scope all，未移植候选不得生产使用。
4. 写 data/visual-plan.json。每镜必须有 storyBeatId/start/end/mode/visualJob/intent/reason/placement/speaker/contextEvidence/assetRefs；recipe 模式还要 recipe.id、variant、requirementCoverage 与 confidence。
5. 人物已经足够或上下文不足时写 mode=face；不得发明英文、金句、数据、截图或关系。
6. 依次运行:
   npm run visual:plan:check -- --job jobs/${slug}
   npm run visual:prepare -- --job jobs/${slug}
   npm run visual:render -- --job jobs/${slug}
   npm run visual:qa -- --job jobs/${slug}
   # 打开 qa/visual-recipes/review.md，逐镜检查后才允许执行：
   npm run visual:qa:approve -- --job jobs/${slug} --reviewer <name> --method four-phase-filmstrip --notes "<实际检查结果>"
   npm run visual:compile -- --job jobs/${slug}
   npm run visual:check -- --job jobs/${slug}
   npm run build:beats -- --job jobs/${slug}
7. visual:qa 已固定抽取入场、动作、稳定、退场四阶段电影条；必须实际打开审查页，确认内容、构图、人物碰撞和边界帧后再批准。最终仍要完整播放真实 MP4，不以电影条、JSON 或测试通过代替。

产出:visual-context.json + visual-plan.json + recipe-renders.json + qa/visual-recipes/report.json + approval.json + 编译后的 primary-clips.json + 最终 MP4 QA。`;
}

function shorts({ dir, root, slug, title }) {
  return `帮我从这条竖屏成片里选 Shorts 切片。

工程目录:${root}
Job:${dir}
主题:《${title}》
成片:renders/final-60fps.mp4(切片时间轴以它为准)
字幕:data/captions.json 拍子:data/beats.json

要做:
1. 读字幕和拍子,选 2-4 段各自成立的片段:开头 3 秒必须有钩子,结尾收得住,时长 45-110s(硬上限 120s)。
2. 片段边界落在句子边界 + 静音处,不切半句。
3. 写 ${dir}/data/shorts.json,格式 [{"id":"short-1","title":"标题","start":秒,"duration":秒}]。
4. 然后执行:cd ${root} && npm run cut:shorts -- --job jobs/${slug}(默认 stream copy 不重编码;源不合规不许静默转 encode,来问我)。
5. 检查 qa/shorts/report.md 全部通过。

产出:data/shorts.json + shorts/ 成片 + QA 报告。`;
}
