import assert from "node:assert/strict";
import test from "node:test";

import { validateVisualPlan } from "./visual-plan-contract.mjs";
import { loadRecipeRegistry } from "./visual-recipe-registry.mjs";
import { loadProductionCatalog } from "./visual-recipes.mjs";

const editorialPlan = {
  schemaVersion: 1,
  audienceProblem: "观众不知道概念是什么",
  thesis: "先解释概念，再给证据",
  narrativeStrategy: "定义后证明",
  sourcePolicy: "preserve-order",
  createdBy: { name: "fixture", method: "human" },
  storyBeats: [{
    id: "story-001",
    role: "explanation",
    claim: "这是概念定义",
    purpose: "让观众先理解",
    takeIds: ["take-001"],
    visualRole: "explanation",
    visualReason: "需要一句可读定义"
  }],
  exclusions: []
};
const semanticTakeMap = {
  schemaVersion: 1,
  ranges: [{ id: "take-001", decision: "keep", source: "assets/originals/a.mp4", sourceStart: 0, sourceEnd: 6 }]
};
const edl = [{
  id: "edl-001",
  storyBeatId: "story-001",
  takeId: "take-001",
  source: "assets/originals/a.mp4",
  sourceStart: 0,
  sourceEnd: 6,
  reason: "保留完整定义"
}];
const context = {
  schemaVersion: 1,
  automatic: { assets: [], faceAnalysis: "data/face-analysis.json", format: "landscape" },
  storyBeats: [{ id: "story-001" }],
  analysis: [],
  research: [{ id: "definition", status: "verified", sources: ["https://example.com/source"], supports: ["approved-term", "plain-language-definition", "ordered-items"] }],
  userInputs: [],
  gaps: []
};
const paperTitleRecipe = () => ({
  id: "shotcraft/paper-title-card",
  variant: "paper-title-card",
  adaptation: { mode: "direct-port", props: { words: [{ text: "概念" }, { text: "定义", accent: true }] } }
});

test("视觉计划只允许生产配方且要求证据覆盖", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-001",
      storyBeatId: "story-001",
      start: 0.5,
      end: 5.5,
      mode: "recipe",
      visualJob: "definition",
      intent: "让概念可读",
      reason: "人物单说不如定义卡清楚",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: paperTitleRecipe(),
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: {
        "approved-term": "research:definition",
        "plain-language-definition": "research:definition"
      },
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.deepEqual(result.errors, []);
});

test("生产配方必须明确支持当前画幅，横屏移植不能被 Planner 硬塞进竖屏", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const portraitContext = {...context, automatic: {...context.automatic, format: "portrait"}};
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "portrait-rejected",
      storyBeatId: "story-001",
      start: 0.5,
      end: 2.3333333333,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "验证画幅边界",
      placement: "fullscreen",
      speaker: {mode: "pip"},
      recipe: paperTitleRecipe(),
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: {"approved-term": "research:definition", "plain-language-definition": "research:definition"},
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, {context: portraitContext, editorialPlan, semanticTakeMap, edl, registry, production});
  assert.equal(result.errors.some((error) => error.includes("未验证 portrait 画幅")), true);
});

test("未解决上下文缺口会阻止配方镜头", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const blockedContext = {
    ...context,
    gaps: [{
      id: "story-001-model",
      storyBeatId: "story-001",
      need: "定义依据",
      resolver: "agent-research",
      status: "unresolved",
      evidenceRef: null,
      requires: ["plain-language-definition"],
      blockingFor: ["recipe"],
      fallback: "face"
    }]
  };
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-001",
      storyBeatId: "story-001",
      start: 0.5,
      end: 5.5,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "补充理解",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: paperTitleRecipe(),
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: {
        "approved-term": "research:definition",
        "plain-language-definition": "research:definition"
      },
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, { context: blockedContext, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("未解决上下文缺口")), true);
});

test("直接移植只允许登记内容参数，拒绝 Planner 调色和改动画", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-direct-port",
      storyBeatId: "story-001",
      start: 0.5,
      end: 2.3333333333,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "使用上游定义卡",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: {
        id: "shotcraft/paper-title-card",
        variant: "paper-title-card",
        adaptation: {
          mode: "direct-port",
          props: {
            words: [{ text: "归因" }, { text: "增量", accent: true }],
            fontFamily: "Songti SC, STSong, serif",
            color: "#ff00ff"
          }
        }
      },
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: {
        "approved-term": "research:definition",
        "plain-language-definition": "research:definition"
      },
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("color 未获授权")), true);
});

test("上游原文只用于基准预览，不能带着示例英文进入生产计划", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-upstream-preview",
      storyBeatId: "story-001",
      start: 0.5,
      end: 2.3333333333,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "错误地复用示例原文",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: {
        id: "shotcraft/paper-title-card",
        variant: "paper-title-card",
        adaptation: { mode: "upstream-original" }
      },
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: { "approved-term": "research:definition", "plain-language-definition": "research:definition" },
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("只允许基准预览")), true);
});

test("列表压弹与行嵌入只开放结构化内容，不开放视觉参数", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const baseShot = {
    id: "visual-structured-port",
    storyBeatId: "story-001",
    start: 0.5,
    end: 4,
    mode: "recipe",
    visualJob: "sequence",
    intent: "展示有序信息",
    reason: "使用上游结构化动效",
    placement: "fullscreen",
    speaker: { mode: "pip" },
    contextEvidence: ["research:definition"],
    assetRefs: [],
    requirementCoverage: { "ordered-items": "research:definition" },
    confidence: 0.9
  };
  const listPlan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      ...baseShot,
      recipe: {
        id: "shotcraft/list-stack-press",
        variant: "list-stack-press",
        adaptation: { mode: "direct-port", props: { title: "全域输入", items: [{ title: "TikTok" }, { title: "Amazon" }], duration: 99 } }
      }
    }]
  };
  const listResult = validateVisualPlan(listPlan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(listResult.errors.some((error) => error.includes("duration 未获授权")), true);

  const rowPlan = {
    ...listPlan,
    shots: [{
      ...baseShot,
      id: "visual-row-port",
      end: 3.8333333333,
      recipe: {
        id: "shotcraft/row-embed",
        variant: "row-embed",
        adaptation: { mode: "direct-port", props: { title: "固定变量", rows: [{ label: "价格" }, { label: "优惠" }], easing: "spring" } }
      }
    }]
  };
  const rowResult = validateVisualPlan(rowPlan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(rowResult.errors.some((error) => error.includes("easing 未获授权")), true);
});

test("证据编号存在也不能越权；字幕不能冒充结构分析", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-untyped-evidence",
      storyBeatId: "story-001",
      start: 0.5,
      end: 4,
      mode: "recipe",
      visualJob: "sequence",
      intent: "展示顺序",
      reason: "验证证据能力",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: {
        id: "shotcraft/list-stack-press",
        variant: "list-stack-press",
        adaptation: { mode: "direct-port", props: { title: "顺序", items: [{title: "一"}, {title: "二"}, {title: "三"}] } }
      },
      contextEvidence: ["automatic:captions"],
      assetRefs: [],
      requirementCoverage: {"ordered-items": "automatic:captions"},
      confidence: 0.9
    }]
  };
  const result = validateVisualPlan(plan, { context, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("不具备该证据能力")), true);
});

test("缺口只能由声明的责任方解决", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const mismatchedContext = {
    ...context,
    gaps: [{
      id: "story-001-model",
      storyBeatId: "story-001",
      need: "定义依据",
      resolver: "agent-research",
      status: "resolved",
      evidenceRef: "automatic:captions",
      requires: ["plain-language-definition"],
      blockingFor: ["recipe"],
      fallback: "face"
    }]
  };
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "face-only",
      storyBeatId: "story-001",
      start: 0,
      end: 6,
      mode: "face",
      visualJob: "emphasis",
      intent: "保留人物",
      reason: "只验证上下文",
      placement: "fullscreen",
      speaker: {mode: "full"},
      contextEvidence: ["automatic:captions"],
      assetRefs: []
    }]
  };
  const result = validateVisualPlan(plan, { context: mismatchedContext, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("只能由 research:")), true);
});

test("B-roll 只接受一个已核权本地素材，并映射到既有执行轨", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const brollContext = {
    ...context,
    automatic: {
      ...context.automatic,
      assets: [{ id: "proof", path: "assets/broll/proof.mp4", type: "video", provenance: "user-provided", rights: "user-owned" }]
    }
  };
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "visual-broll",
      storyBeatId: "story-001",
      start: 3,
      end: 4.2,
      mode: "broll",
      visualJob: "evidence",
      intent: "展示真实操作",
      reason: "口播无法替代原始画面",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      contextEvidence: ["asset:proof"],
      assetRefs: ["proof"],
      confidence: 0.95,
      transition: { type: "cut" }
    }]
  };
  const passed = validateVisualPlan(plan, { context: brollContext, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.deepEqual(passed.errors, []);

  const unknownRights = {
    ...brollContext,
    automatic: { ...brollContext.automatic, assets: [{ ...brollContext.automatic.assets[0], rights: "unknown" }] }
  };
  const rejected = validateVisualPlan(plan, { context: unknownRights, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(rejected.errors.some((error) => error.includes("版权状态未知")), true);
});

test("配方与 B-roll 共用唯一视觉主轨，重叠时失败关闭", () => {
  const registry = loadRecipeRegistry();
  const production = loadProductionCatalog();
  const overlapContext = {
    ...context,
    automatic: { assets: [{ id: "proof", path: "assets/proof.jpg", type: "image", provenance: "user-provided", rights: "user-owned" }] }
  };
  const plan = {
    schemaVersion: 1,
    registry: { id: registry.id, revision: registry.source.revision },
    shots: [{
      id: "recipe",
      storyBeatId: "story-001",
      start: 1,
      end: 4,
      mode: "recipe",
      visualJob: "definition",
      intent: "解释概念",
      reason: "补充理解",
      placement: "fullscreen",
      speaker: { mode: "pip" },
      recipe: paperTitleRecipe(),
      contextEvidence: ["research:definition"],
      assetRefs: [],
      requirementCoverage: { "approved-term": "research:definition", "plain-language-definition": "research:definition" },
      confidence: 0.9
    }, {
      id: "broll",
      storyBeatId: "story-001",
      start: 3,
      end: 4.2,
      mode: "broll",
      visualJob: "evidence",
      intent: "展示证据",
      reason: "需要原图",
      placement: "split-left",
      speaker: { mode: "full" },
      contextEvidence: ["asset:proof"],
      assetRefs: ["proof"],
      confidence: 0.9,
      transition: { type: "morph" }
    }]
  };
  const result = validateVisualPlan(plan, { context: overlapContext, editorialPlan, semanticTakeMap, edl, registry, production });
  assert.equal(result.errors.some((error) => error.includes("视觉主轨重叠")), true);
});
