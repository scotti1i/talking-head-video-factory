import fs from "node:fs";
import path from "node:path";

import { projectRoot, readJsonArray, writeJson } from "./lib.mjs";

const root = projectRoot();
const sourceJob = path.join(root, "jobs", "gmv-max-attribution-20260831");
const sampleJob = path.join(root, "jobs", "gmv-max-shotcraft-direct-port-sample-20260902");
const requestedJob = process.argv[2];
const jobDir = requestedJob
  ? path.resolve(root, requestedJob)
  : path.join(root, "jobs", "gmv-max-shotcraft-direct-port-full-20260902");
const duration = 189.066667;

const sections = [
  {
    id: "hook-real-roi",
    start: 0,
    end: 13.94,
    role: "hook",
    claim: "把自然单和广告单硬拆，算不出真实 ROI。",
    purpose: "用从业者判断打破常见算法的可信感。",
    visualRole: "face"
  },
  {
    id: "last-click-formula",
    start: 13.94,
    end: 29.47,
    role: "explanation",
    claim: "常见算法用点击、转化率和订单差额计算广告单、自然单与 ROI。",
    purpose: "让观众先看懂被质疑的计算过程。",
    visualRole: "explanation",
    visualReason: "三步计算适合行级嵌入，帮助观众顺序读取。"
  },
  {
    id: "multi-touch-order",
    start: 29.47,
    end: 48.25,
    role: "example",
    claim: "一张订单可能先经过达人视频、品牌搜索，最后才点击广告。",
    purpose: "说明最后点击并不等于广告创造了整张订单。",
    visualRole: "explanation",
    visualReason: "有序触点适合列表依次落下，建立时间关系。"
  },
  {
    id: "ad-assisted-organic-order",
    start: 48.25,
    end: 59.77,
    role: "example",
    claim: "消费者可能看过广告未点击，后来因自然视频下单。",
    purpose: "说明自然单也可能受广告影响。",
    visualRole: "face"
  },
  {
    id: "attribution-vs-incrementality",
    start: 59.77,
    end: 79.57,
    role: "explanation",
    claim: "归因回答订单从哪里进来，增量回答不投广告还会不会买。",
    purpose: "建立整条视频最关键的概念边界。",
    visualRole: "explanation",
    visualReason: "定义卡在概念命名处形成短促记忆点。"
  },
  {
    id: "tiktok-evaluation-method",
    start: 79.57,
    end: 108.67,
    role: "evidence",
    claim: "TikTok 建议比较 GMV Max 开启前后的商品非直播 GMV，并避开促销期。",
    purpose: "用平台自己的评估方法支持增量视角。",
    visualRole: "face"
  },
  {
    id: "seller-test-controls",
    start: 108.67,
    end: 127.21,
    role: "explanation",
    claim: "普通卖家应在稳定时段控制价格、优惠和达人内容，再比较整体销售变化。",
    purpose: "给出可执行的简化测试方法。",
    visualRole: "explanation",
    visualReason: "控制变量逐行嵌入比复述字幕更容易执行。"
  },
  {
    id: "agent-whole-business",
    start: 127.21,
    end: 161.21,
    role: "payoff",
    claim: "AI agent 应把跨平台、库存、成本、退款和达人内容放在一起，估算基线并分配下一笔预算。",
    purpose: "把单平台报表升级为全局预算决策。",
    visualRole: "explanation",
    visualReason: "多来源输入需要一次性建立完整武器清单，再落到下一笔预算。"
  },
  {
    id: "cross-platform-bias",
    start: 161.21,
    end: 177.38,
    role: "counterpoint",
    claim: "三个平台各看一份报表，只会得到三个都说自己更好的答案。",
    purpose: "说明必须用同一算法横向比较。",
    visualRole: "explanation",
    visualReason: "三个后台按同一运动语法落下，直观表现口径割裂。"
  },
  {
    id: "allocation-decision",
    start: 177.38,
    end: duration,
    role: "payoff",
    claim: "GMV Max 决定钱进入 TikTok 后怎么花，AI 决定是否进入、进入多少及其他平台分多少。",
    purpose: "用决策层级差异完成收束。",
    visualRole: "explanation",
    visualReason: "三个决策问题逐行嵌入，形成清晰收尾。"
  }
];

function ensureJob() {
  fs.mkdirSync(path.join(jobDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "data"), { recursive: true });
  const sourceVideo = path.join(sourceJob, "assets", "aroll.mp4");
  const targetVideo = path.join(jobDir, "assets", "aroll.mp4");
  if (!fs.existsSync(targetVideo)) fs.linkSync(sourceVideo, targetVideo);
  const faceSource = path.join(sampleJob, "data", "face-analysis.json");
  const faceTarget = path.join(jobDir, "data", "face-analysis.json");
  if (!fs.existsSync(faceTarget)) fs.copyFileSync(faceSource, faceTarget);
}

function sectionForTime(time) {
  return sections.find((section) => time >= section.start - 0.001 && time < section.end - 0.001) || sections.at(-1);
}

function writeBaseContracts() {
  writeJson(path.join(jobDir, "project.json"), {
    title: "GMV Max：归因不等于增量",
    slug: path.basename(jobDir),
    profile: "clean-talkinghead",
    platform: "review",
    width: 1920,
    height: 1080,
    layout: "shotcraft-speaker-stage",
    duration,
    sourceVideo: "assets/aroll.mp4",
    outputName: "gmv-max-shotcraft-full.mp4",
    theme: "warm-minimal",
    presenterStage: {
      cues: [
        { start: 0, end: 13.94, copy: "这东西怎么可能算出真实的 ROI？", emphasis: "真实的 ROI" },
        { start: 13.94, end: 29.47, copy: "现在最常见的算法是什么呢", emphasis: "最常见的算法" },
        { start: 29.47, end: 59.77, copy: "一张真实的订单可能是什么样？", emphasis: "真实的订单" },
        { start: 59.77, end: 79.57, copy: "归因和增量，它算的不是同一件事", emphasis: "不是同一件事" },
        { start: 79.57, end: 108.67, copy: "TikTok 自己给卖家的评估方法", emphasis: "TikTok" },
        { start: 108.67, end: 127.21, copy: "普通的卖家可以先这么干", emphasis: "先这么干" },
        { start: 127.21, end: 161.21, copy: "AI agent 专门干这件事", emphasis: "AI agent" },
        { start: 161.21, end: 177.38, copy: "三个平台全都开店，然后每天看三份报表", emphasis: "三份报表" },
        { start: 177.38, end: duration, copy: "钱进了 TikTok 之后，你的钱该怎么花", emphasis: "怎么花" }
      ]
    },
    caption: {
      enabled: true,
      maxCharsPerLine: 20,
      singleLine: true,
      mode: "static",
      bottom: 70,
      fontSize: 38,
      hideDuring: [
        { start: 18, end: 21.3333333333 },
        { start: 36, end: 39.5 },
        { start: 73.53, end: 75.3633333333 },
        { start: 112.49, end: 115.8233333333 },
        { start: 140, end: 143.5 },
        { start: 149.35, end: 151.1833333333 },
        { start: 164.79, end: 168.29 },
        { start: 184.68, end: 188.0133333333 }
      ]
    },
    editorial: { contractVersion: 1, editingMode: "semantic-edl" },
    visual: {
      operatingSystemVersion: 1,
      referenceApproved: true,
      reference: "Shotcraft Ink Press 原版渲染；用户于本会话确认直接移植"
    },
    qa: {
      sampleTimes: [5, 18.2, 19.4, 20.8, 36.4, 37.7, 39.2, 74.3, 75.1, 113.1, 114.8, 141.1, 142.8, 150.2, 166.2, 167.8, 185.2, 187.4, 188.8]
    },
    render: { fps: 30, quality: "standard", workers: 4, videoBitrate: "16M" }
  });

  const storyBeats = sections.map((section) => ({
    id: `story-${section.id}`,
    role: section.role,
    claim: section.claim,
    purpose: section.purpose,
    takeIds: [`take-${section.id}`],
    visualRole: section.visualRole,
    ...(section.visualReason ? { visualReason: section.visualReason } : {})
  }));
  writeJson(path.join(jobDir, "data", "editorial-plan.json"), {
    schemaVersion: 1,
    audienceProblem: "卖家容易把平台归因口径误当成广告真实增量效果。",
    thesis: "归因回答转化功劳如何记录；增量回答没有这笔广告时结果是否仍会发生。",
    narrativeStrategy: "先拆常见算法，再用两个真实路径暴露错误，给出平台评估方法，最后升级到跨平台预算决策。",
    sourcePolicy: "preserve-order",
    createdBy: { name: "Codex", method: "agent", model: "GPT-5", skill: "talkinghead-edit" },
    storyBeats,
    exclusions: []
  });
  const ranges = sections.map((section) => ({
    id: `take-${section.id}`,
    source: "assets/aroll.mp4",
    sourceStart: section.start,
    sourceEnd: section.end,
    decision: "keep",
    completeness: "complete",
    claim: section.claim,
    reason: "复用已完成语义粗剪的 A-roll 母版，不新增删词或重排。"
  }));
  writeJson(path.join(jobDir, "data", "semantic-take-map.json"), {
    schemaVersion: 1,
    reviewComplete: true,
    recordingPattern: "本 job 以已完成语义粗剪和切点检查的 A-roll 为母版，只新增视觉包装，不重新裁切口播。",
    ranges
  });
  writeJson(path.join(jobDir, "data", "rough-cut-edl.json"), sections.map((section) => ({
    id: `edl-${section.id}`,
    storyBeatId: `story-${section.id}`,
    takeId: `take-${section.id}`,
    source: "assets/aroll.mp4",
    sourceStart: section.start,
    sourceEnd: section.end,
    reason: "保留已批准母版中的完整语义段。"
  })));

  const sourceCaptions = readJsonArray(path.join(sourceJob, "data", "captions.json"));
  writeJson(path.join(jobDir, "data", "captions.json"), sourceCaptions.map((caption, index) => {
    const section = sectionForTime(Number(caption.s));
    return {
      ...caption,
      id: `caption-${String(index + 1).padStart(3, "0")}`,
      storyBeatId: `story-${section.id}`,
      edlSegmentId: `edl-${section.id}`
    };
  }));
  for (const name of ["beats", "broll", "primary-clips", "audio-cues", "aroll-cues", "camera-cues"]) {
    writeJson(path.join(jobDir, "data", `${name}.json`), []);
  }
}

function writeVisualContext() {
  const analysis = [
    ["last-click-formula-structure", "完整表达明确给出广告点击量乘转化率、总订单减广告单、广告单 GMV 除广告费的顺序关系。"],
    ["multi-touch-order-structure", "完整表达按时间先后列出达人视频、品牌搜索和最后一次广告点击三个触点。"],
    ["seller-controls-structure", "完整表达列出稳定期内需要控制的价格、优惠和达人发布内容三个变量。"],
    ["agent-inputs-structure", "完整表达将平台交易、库存、成本退款、达人内容和跨平台结果列为同一决策系统的输入。"],
    ["platform-reports-structure", "完整表达并列 TikTok、Amazon 和独立站三套后台报表，用于说明口径割裂。"],
    ["allocation-questions-structure", "完整表达依次提出是否进入 TikTok、进入多少以及其他平台分配多少三个决策问题。"]
  ].map(([id, finding]) => ({
    id,
    status: "verified",
    finding,
    basis: ["automatic:captions"],
    supports: ["semantic-model", "ordered-items"]
  }));
  const gapEvidence = {
    "last-click-formula": "analysis:last-click-formula-structure",
    "multi-touch-order": "analysis:multi-touch-order-structure",
    "attribution-vs-incrementality": "research:measurement-definitions",
    "seller-test-controls": "analysis:seller-controls-structure",
    "agent-whole-business": "analysis:agent-inputs-structure",
    "cross-platform-bias": "analysis:platform-reports-structure",
    "allocation-decision": "analysis:allocation-questions-structure"
  };
  writeJson(path.join(jobDir, "data", "visual-context.json"), {
    schemaVersion: 1,
    job: path.basename(jobDir),
    createdAt: new Date().toISOString(),
    policy: { transcriptIsContextNotVisualTruth: true, unresolvedFallback: "face", fabricatedEvidence: "forbidden" },
    automatic: {
      title: "GMV Max：归因不等于增量",
      profile: "clean-talkinghead",
      format: "landscape",
      sourceVideo: "assets/aroll.mp4",
      writtenScript: null,
      transcriptIndex: null,
      sourceInventory: null,
      faceAnalysis: "data/face-analysis.json",
      assets: [{ id: "local-001", path: "assets/aroll.mp4", type: "video", bytes: fs.statSync(path.join(jobDir, "assets", "aroll.mp4")).size, provenance: "existing-approved-roughcut", rights: "user-provided" }]
    },
    storyBeats: sections.map((section) => ({
      id: `story-${section.id}`,
      role: section.role,
      claim: section.claim,
      purpose: section.purpose,
      visualRole: section.visualRole,
      visualReason: section.visualReason || null,
      captionRefs: readJsonArray(path.join(jobDir, "data", "captions.json")).filter((caption) => caption.storyBeatId === `story-${section.id}`).map((caption) => caption.id)
    })),
    analysis,
    research: [
      {
        id: "measurement-definitions",
        status: "verified",
        checkedAt: "2026-09-02",
        finding: "归因是在转化路径中分配功劳；增量衡量广告相对于未投放反事实所造成的因果提升。",
        sources: [{ title: "Get a grip on marketing incrementality", url: "https://business.google.com/ca-en/think/marketing-strategies/marketing-incrementality/", publisher: "Google" }],
        supports: ["semantic-model", "approved-term", "plain-language-definition", "source-provenance"]
      },
      {
        id: "tiktok-gmv-evaluation",
        status: "verified",
        checkedAt: "2026-09-02",
        finding: "TikTok 官方建议比较 Product GMV Max 启用前后的商品非直播 GMV，并在非促销期评估，以减少季节与自然流量波动的干扰。",
        sources: [{ title: "How to evaluate the performance of Product GMV Max", url: "https://ads.tiktok.com/resources/help/article/how-to-evaluate-the-performance-of-product-gmv-max?lang=en", publisher: "TikTok" }],
        supports: ["semantic-model", "ordered-steps", "causal-or-sequential-basis", "source-provenance"]
      }
    ],
    userInputs: [{
      id: "ink-press-baseline",
      status: "approved",
      finding: "直接使用 Shotcraft Ink Press 原工程，不按截图重新绘制。",
      source: "本会话用户确认",
      supports: ["visual-style-approval"]
    }],
    gaps: sections.filter((section) => section.visualRole === "explanation").map((section) => ({
      id: `story-${section.id}-model`,
      storyBeatId: `story-${section.id}`,
      need: "经核对的概念、关系、步骤或数据模型",
      resolver: section.id === "attribution-vs-incrementality" ? "agent-research" : "tool-analysis",
      status: "resolved",
      evidenceRef: gapEvidence[section.id],
      requires: ["semantic-model"],
      blockingFor: ["recipe"],
      fallback: "face"
    }))
  });
}

function recipeShot({id, story, start, end, visualJob, intent, reason, recipeId, props, placement = "bottom-right", requirements}) {
  const contextEvidence = [...new Set([
    "automatic:captions",
    ...Object.values(requirements),
    "user:ink-press-baseline"
  ])];
  return {
    id,
    storyBeatId: `story-${story}`,
    mode: "recipe",
    visualJob,
    start,
    end,
    intent,
    reason,
    placement: "fullscreen",
    speaker: { mode: "pip", placement },
    confidence: 0.95,
    contextEvidence,
    assetRefs: [],
    requirementCoverage: requirements,
    recipe: {
      id: recipeId,
      variant: recipeId.split("/").at(-1),
      adaptation: { mode: "direct-port", props: { ...props, fontFamily: "Songti SC, STSong, serif" } }
    },
    transition: { type: "cut" }
  };
}

function writeVisualPlan() {
  const verbatim = { "verbatim-or-approved-claim": "automatic:captions" };
  writeJson(path.join(jobDir, "data", "visual-plan.json"), {
    schemaVersion: 1,
    registry: { id: "video-shotcraft", revision: "bdd94be16d60fa8f" },
    planningPolicy: { selection: "production-approved-only", missingContext: "fallback-to-face", style: "upstream-source-is-authoritative" },
    shots: [
      recipeShot({
        id: "last-click-formula-rows", story: "last-click-formula", start: 18, end: 21.3333333333, visualJob: "sequence",
        intent: "把常见归因算法压成三个连续计算步骤。", reason: "此处口播按顺序讲点击、广告单、自然单和 ROI，行嵌入与语义顺序一致。",
        recipeId: "shotcraft/row-embed", requirements: { "ordered-items": "analysis:last-click-formula-structure" },
        props: { kicker: "最常见的算法", title: "它怎么算出所谓真实 ROI", rows: [{ label: "广告点击量 × 转化率", value: "广告单" }, { label: "总订单 − 广告单", value: "自然单" }, { label: "广告单 GMV ÷ 广告费", value: "ROI" }] }
      }),
      recipeShot({
        id: "multi-touch-order-stack", story: "multi-touch-order", start: 36, end: 39.5, visualJob: "sequence",
        intent: "让一张订单的三个触点按时间顺序落下。", reason: "人物在此讲到最后点击，完整触点栈能暴露最后一跳遗漏的前序影响。",
        recipeId: "shotcraft/list-stack-press", requirements: { "ordered-items": "analysis:multi-touch-order-structure" }, placement: "bottom-right",
        props: { kicker: "一张真实的订单", title: "这个人可能经历了什么", counterLabel: "个触点", items: [{ title: "昨天刷到达人视频" }, { title: "今天搜索你的品牌" }, { title: "下单前点击一次广告" }] }
      }),
      recipeShot({
        id: "definition-attribution-incrementality-full", story: "attribution-vs-incrementality", start: 73.53, end: 75.3633333333, visualJob: "definition",
        intent: "在概念第一次被命名时建立边界。", reason: "这是全片需要记住的唯一定义，使用原生纸墨字卡形成呼吸位。",
        recipeId: "shotcraft/paper-title-card", requirements: { "approved-term": "research:measurement-definitions", "plain-language-definition": "research:measurement-definitions" }, placement: "top-left",
        props: { words: [{ text: "订单从哪里进来，" }, { text: "叫归因；" }, { text: "如果不投还会不会买，" }, { text: "叫增量。", accent: true }] }
      }),
      recipeShot({
        id: "seller-test-control-rows", story: "seller-test-controls", start: 112.49, end: 115.8233333333, visualJob: "sequence",
        intent: "把简化测试需要固定的变量逐项落下。", reason: "这三项是观众执行测试时必须控制的条件，行嵌入强化清单感。",
        recipeId: "shotcraft/row-embed", requirements: { "ordered-items": "analysis:seller-controls-structure" }, placement: "bottom-right",
        props: { kicker: "普通卖家可以先这么干", title: "先找一段生意稳定的时间", rows: [{ label: "价格", value: "尽量别动" }, { label: "优惠", value: "尽量别动" }, { label: "达人发布内容", value: "尽量别动" }] }
      }),
      recipeShot({
        id: "agent-inputs-stack", story: "agent-whole-business", start: 140, end: 143.5, visualJob: "sequence",
        intent: "展示 AI agent 需要同时读取的经营输入。", reason: "口播列举多来源数据，列表压弹能让观众感到信息被持续纳入同一个系统。",
        recipeId: "shotcraft/list-stack-press", requirements: { "ordered-items": "analysis:agent-inputs-structure" }, placement: "bottom-right",
        props: { kicker: "AI agent 的输入", title: "全都放在一起看", counterLabel: "类经营信息", items: [{ title: "TikTok · Amazon · 独立站" }, { title: "ERP 与库存" }, { title: "成本与退款" }, { title: "达人内容" }, { title: "跨平台销售结果" }] }
      }),
      recipeShot({
        id: "next-thousand-question", story: "agent-whole-business", start: 149.35, end: 151.1833333333, visualJob: "emphasis",
        intent: "把 AI agent 的工作压成下一笔预算问题。", reason: "原口播在此从数据输入切到决策，原生字卡适合作为语义转折。",
        recipeId: "shotcraft/paper-title-card", requirements: verbatim, placement: "top-left",
        props: { words: [{ text: "下一千块钱，" }, { text: "放到哪里" }, { text: "可能多赚一点？", accent: true }] }
      }),
      recipeShot({
        id: "three-platform-reports-stack", story: "cross-platform-bias", start: 164.79, end: 168.29, visualJob: "sequence",
        intent: "让三个平台后台按同一视觉语法出现。", reason: "相同外观与不同来源形成对照，为后面的口径偏差铺垫。",
        recipeId: "shotcraft/list-stack-press", requirements: { "ordered-items": "analysis:platform-reports-structure" }, placement: "bottom-right",
        props: { kicker: "所谓全域电商", title: "三个平台，三份报表", counterLabel: "份平台答案", items: [{ title: "TikTok 后台" }, { title: "Amazon 后台" }, { title: "独立站后台" }] }
      }),
      recipeShot({
        id: "allocation-decision-rows", story: "allocation-decision", start: 184.68, end: 188.0133333333, visualJob: "sequence",
        intent: "把 AI 最终需要回答的三个预算问题逐行落定。", reason: "与口播结尾逐句同步，形成清晰可复述的收束。",
        recipeId: "shotcraft/row-embed", requirements: { "ordered-items": "analysis:allocation-questions-structure" }, placement: "bottom-right",
        props: { kicker: "钱要不要进 TikTok", title: "你的 AI 需要决定什么", rows: [{ label: "今天要不要进 TikTok" }, { label: "如果要进，进多少" }, { label: "其他平台分多少" }] }
      })
    ]
  });
}

ensureJob();
writeBaseContracts();
writeVisualContext();
writeVisualPlan();
console.log(jobDir);
