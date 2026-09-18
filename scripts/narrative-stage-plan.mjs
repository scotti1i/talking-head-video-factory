// ============================================================
// 叙事舞台计划编译器
// job/data/scene-plan.json（秒，Planner 可读）→ data/scene-plan-compiled.json（帧）
// → Remotion 工作区 src/factory/NarrativePlan.ts（只读模块）
// 只做确定性换算与合同校验，不做任何审美或选型判断。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, resolveJob, writeJson } from "./lib.mjs";

export const SCENE_TYPES = new Set(["label", "equation", "graph", "converge", "split", "concept", "reminders", "evidence", "data", "reference", "broll", "ladder", "cycle", "accent", "quote", "timeline", "compare", "title", "chat", "leaderboard", "gauge", "flip", "map", "clipping"]);
const CAPTION_SAFE_Y = 840; // 任何舞台元素的顶边不得低于此（字幕安全区从 900 起，元素本身至少 60px 高）
const WORD_TOLERANCE = 0.12; // 词级锚点容差（秒）
const MOTION_REGISTRY = "visual-recipes/stage-motions.json";
// 计划字段 → 注册表 stageId（只允许已移植的动作被引用）
const MOTION_FIELDS = {
  "node.enter": { pop: "graph.cascade", slam: "node.enter.slam" },
  "badge.fx": { impact: "badge.impact", burst: "badge.pop-burst" },
  "edge.style": { line: null, flyline: "edge.flyline", chevron: "edge.chevron" },
  "phrase.reveal": { "blur-slide": "reveal.blur-slide", karaoke: "reveal.karaoke" },
  "focus.style": { box: null, brackets: "evidence.brackets" },
  "focus.zoom": { shared: "handoff.shared-element", crash: "evidence.crash-zoom" },
  "converge.handoff": { "circle-iris": "handoff.circle-iris" },
  "label.odometer": { true: "data.odometer" },
  "underline": { true: "emphasis.marker-underline" }
};
export const SPEAKER_MODES = new Set(["hero-center", "hero", "hero-right", "close", "close-right", "stage", "dock", "focus", "orb-right", "orb-left", "hidden", "full", "wide", "pip", "split"]);
const TIME_KEY = /^(start|end|at|until)$|At$/;
const WINDOW_KEYS = new Set(["highlight", "dim"]);
const MIN_SPEAKER_GAP = 35; // SharedElementMorph 25f + 10f 回落


// ------------------------------------------------------------
// 几何门禁（2026-09-03）：人物框 vs 场景元素包围盒按 0.5s 采样求交，重叠即报错。
// 出处：两天内三次"遮挡"（概念卡 / 二分大字 / B-roll 面板）都是同一根因——位置靠眼看。
// 位置、时间、存在性、格式一律脚本拦；内容判断才交给 AI。
// 各场景的包围盒是组件布局的近似镜像；新增场景类型必须在这里登记自己的包围盒。
// ------------------------------------------------------------
const SPEAKER_BOXES = {
  "hero-center": { x: 668, y: 58, w: 584, h: 830 },
  hero: { x: 54, y: 58, w: 584, h: 830 },
  "hero-right": { x: 1282, y: 58, w: 584, h: 830 },
  close: { x: 54, y: 58, w: 584, h: 830 },
  "close-right": { x: 1282, y: 58, w: 584, h: 830 },
  stage: { x: 0, y: 0, w: 1920, h: 1080 },
  dock: { x: 54, y: 118, w: 410, h: 712 },
  focus: { x: 54, y: 86, w: 520, h: 800 },
  "orb-right": { x: 1690, y: 54, w: 176, h: 292 },
  "orb-left": { x: 54, y: 54, w: 176, h: 292 },
  full: { x: 0, y: 0, w: 1920, h: 1080 },
  wide: { x: 60, y: 100, w: 1200, h: 675 },
  pip: { x: 54, y: 54, w: 466, h: 262 },
  hidden: null
};
// 竖屏（studio-portrait，2026-09-07）：人物永远铺满画布，这里的「人物框」是脸 + 上身的占位（不是画布），用来查叠层压脸
// full：原片；focus：放大 1.1 上移 270，整个头在画面里、下巴约 y 1040，以下（y≥990）留给内容
const SPEAKER_BOXES_P = { full: { x: 390, y: 230, w: 420, h: 1000 }, focus: { x: 200, y: 0, w: 680, h: 970 }, split: { x: 300, y: 0, w: 600, h: 870 }, hidden: null };
// 取景参数（plan.canvas.focusScale / focusShift / splitShift）：下巴基准 1130，人物框高 = 下巴换算后的位置
const setPortraitFraming = (cv) => { const sc = Number(cv?.focusScale) || 1.1, fsh = Number(cv?.focusShift) || 270, ssh = Number(cv?.splitShift) || 300; SPEAKER_BOXES_P.focus = { x: 200, y: 0, w: 680, h: Math.round(1130 * sc - fsh) }; SPEAKER_BOXES_P.split = { x: 300, y: 0, w: 600, h: Math.round(1130 - ssh) }; };
const CONTENT_RECT_P = { x: 60, y: 990, w: 840, h: 310 };
const CONTENT_RECT_P_SPLIT = { x: 60, y: 890, w: 860, h: 484 }; // 竖屏 split 态：16:9 第三方面板
const REMINDER_SLOTS_P = [{ x: 60, y: 990, w: 840, h: 94 }, { x: 60, y: 1098, w: 840, h: 94 }, { x: 60, y: 1206, w: 840, h: 94 }];
let PORTRAIT = false;
const setCanvas = (plan) => { PORTRAIT = !!(plan && plan.canvas && plan.canvas.h > plan.canvas.w); if (PORTRAIT) setPortraitFraming(plan.canvas); };
const speakerBox = (mode) => (PORTRAIT ? SPEAKER_BOXES_P[mode] : SPEAKER_BOXES[mode]) ?? null;
const reminderSlots = () => (PORTRAIT ? REMINDER_SLOTS_P : REMINDER_SLOTS);
const CONTENT_RECT = { full: { x: 1360, y: 120, w: 520, h: 700 }, wide: { x: 1300, y: 100, w: 566, h: 675 }, pip: { x: 60, y: 340, w: 1800, h: 560 }, "hero-center": { x: 1300, y: 60, w: 566, h: 840 }, hero: { x: 700, y: 60, w: 1166, h: 840 }, close: { x: 700, y: 60, w: 1166, h: 840 }, "close-right": { x: 54, y: 60, w: 1166, h: 840 }, stage: { x: 1360, y: 120, w: 520, h: 700 }, "hero-right": { x: 54, y: 60, w: 1166, h: 840 }, dock: { x: 524, y: 60, w: 1342, h: 840 }, focus: { x: 634, y: 60, w: 1232, h: 840 } };
const contentRectOf = (mode) => PORTRAIT ? (mode === "split" ? CONTENT_RECT_P_SPLIT : CONTENT_RECT_P) : CONTENT_RECT[mode] || { x: 120, y: 60, w: 1680, h: 840 };
const REMINDER_SLOTS = [{ x: 1326, y: 58, w: 540, h: 132 }, { x: 1326, y: 210, w: 540, h: 132 }, { x: 1326, y: 362, w: 540, h: 132 }];
const SPEAKER_MORPH = 35 / 30; // 秒：形态切换中不采样
// 舞台模式（人物全屏）允许动效落的区：左带 / 右带 / 下三分之一（2026-09-03 Scott：小Lin 常有人物全屏 + 叠动效）
const STAGE_ZONES = [{ x: 40, y: 120, w: 520, h: 700 }, { x: 1360, y: 120, w: 520, h: 700 }, { x: 160, y: 700, w: 1600, h: 180 }];
const LABEL_FONT = { s: 28, m: 34, l: 48, xl: 120, giant: 240 };
const LABEL_PAD = { s: 40, m: 52, l: 72, xl: 0, giant: 0 };
const textUnits = (t) => [...String(t)].reduce((n, ch) => n + (ch === " " ? 0.3 : /[　-鿿＀-￯]/.test(ch) ? 1 : 0.6), 0);
const center = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const nodeBox = (node) => {
  if (node.text) return { w: node.w ?? 720, h: node.h ?? 230 };
  if (node.shape === "circle") return { w: node.w ?? (node.small ? 150 : 186), h: node.h ?? (node.small ? 150 : 186) };
  if (node.shape === "pill") return { w: node.w ?? 230, h: node.h ?? 76 };
  if (node.small) return { w: node.w ?? 214, h: node.h ?? (node.image ? 176 : 150) };
  return { w: node.w ?? 246, h: node.h ?? (node.image ? 216 : 172) };
};
const unionBox = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });
function speakerAt(t, keyframes) {
  let kf = keyframes[0], prev = null;
  for (const k of keyframes) if (k.at <= t) { prev = kf === k ? prev : kf; kf = k; }
  // 形态切换窗口：前 0.5s 人物还在起点附近，按起止两框并集查；之后按终点框查（内容前 0.6s 切换是设计内的，那时人已基本到位）
  // 出处：2026-09-04 时间线首卡在人物缩小途中压脸，此前整个窗口不采样
  if (!kf.cut && t - kf.at < SPEAKER_MORPH && kf !== keyframes[0]) { const dest = speakerBox(kf.mode); return { mode: kf.mode, box: t - kf.at < 0.5 ? unionBox(prev ? speakerBox(prev.mode) : null, dest) : dest, morphing: true }; }
  return { mode: kf.mode, box: speakerBox(kf.mode), morphing: false };
}
// 场景在 t 时刻的可见元素包围盒（像素）；mode 为当时人物形态
export function sceneBoxes(scene, t, mode) {
  const out = [];
  const on = (a, b) => t >= a && t < (b ?? scene.end);
  if (!on(scene.start, scene.end)) return out;
  switch (scene.type) {
    case "label":
      for (const it of scene.items || []) if (on(it.at, it.until)) {
        const fs = LABEL_FONT[it.size || "m"]; const w = textUnits(it.text) * fs * 0.98 + LABEL_PAD[it.size || "m"]; const h = it.size === "xl" || it.size === "giant" ? fs * 1.15 : fs * 1.75;
        out.push({ id: it.text, ...(it.anchor === "center" ? center(it.x, it.y, w, h) : { x: it.x, y: it.y - h / 2, w, h }) });
      }
      break;
    case "graph":
      for (const n of scene.nodes || []) {
        if (t < n.at || (n.remove && t >= n.remove.at + 0.9)) continue;
        let st = n; for (const s of n.states || []) if (t >= s.at) st = { ...n, ...s, text: s.text };
        const sz = nodeBox(st); out.push({ id: n.id, ...center(st.x, st.y, st.w ?? sz.w, st.h ?? sz.h) });
      }
      for (const nt of scene.notes || []) if (on(nt.at, nt.until)) out.push({ id: nt.text, x: nt.x, y: nt.y, w: nt.w ?? 640, h: nt.pill ? 60 : 140 });
      break;
    case "ladder": {
      const rect = contentRectOf("dock"); const n = scene.steps.length; const hasImage = scene.steps.some((s) => s.image); const tileH = hasImage ? 216 : 172;
      const dx = Math.min(330, (rect.w - 120 - 246) / Math.max(1, n - 1)); const dy = Math.min(150, 420 / Math.max(1, n - 1));
      const x0 = rect.x + (rect.w - (246 + dx * (n - 1))) / 2 + 123;
      // 竖屏：一行一步（与 Ladder.tsx 同一套：tile 72 高、间距 84、从 rect.y+36 起）
      if (PORTRAIT) { scene.steps.forEach((s, i) => { if (t >= s.at) out.push({ id: s.id, ...center(rect.x + rect.w / 2, rect.y + 36 + i * 76, rect.w, 72) }); }); if (scene.note && on(scene.note.at, scene.note.until)) out.push({ id: scene.note.text, ...center(rect.x + rect.w / 2, rect.y + rect.h - 24, textUnits(scene.note.text) * 28 + 44, 60) }); break; }
      scene.steps.forEach((s, i) => { if (t >= s.at) out.push({ id: s.id, ...center(x0 + i * dx, 700 - i * dy, 246, tileH) }); });
      if (scene.note && on(scene.note.at, scene.note.until)) out.push({ id: scene.note.text, ...center(rect.x + rect.w / 2, 790, textUnits(scene.note.text) * 28 + 44, 60) });
      break;
    }
    case "cycle": {
      const rect = contentRectOf("dock"); const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2 - 10; const n = scene.nodes.length;
      scene.nodes.forEach((nd, i) => { if (t >= nd.at) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; out.push({ id: nd.id, ...center(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250, 168, 168) }); } });
      if (scene.hub && t >= scene.hub.at) out.push({ id: scene.hub.label, ...center(cx, cy, 220, 200) });
      break;
    }
    case "split":
      if (scene.collapseAt && t >= scene.collapseAt + 1.2) out.push({ id: "split-reminders", x: 1326, y: 58, w: 540, h: 436 });
      else if (scene.shiftAt && t >= scene.shiftAt) out.push({ id: "split-rows", x: 560, y: 60, w: 1306, h: 780 });
      else out.push({ id: "split-rows", x: 700, y: 60, w: 1166, h: 780 });
      break;
    case "concept": {
      if (scene.demoteAt && t >= scene.demoteAt + 1.2) { out.push({ id: "concept-reminder", ...reminderSlots()[scene.slot ?? 0] }); break; }
      const rect = contentRectOf(mode); const w = Math.min(1200, rect.w); out.push({ id: "concept-stage", x: rect.x + (rect.w - w) / 2, y: 150, w, h: 640 });
      break;
    }
    case "evidence":
      if (PORTRAIT) { out.push({ id: "evidence-thumb", ...CONTENT_RECT_P_SPLIT }); break; }
      out.push(scene.expandAt && t >= scene.expandAt ? { id: "evidence-stage", x: 330, y: 70, w: 1536, h: 820 } : { id: "evidence-thumb", x: 900, y: 300, w: 880, h: 495 });
      break;
    case "broll":
      if (PORTRAIT) { out.push({ id: "broll-panel", ...CONTENT_RECT_P_SPLIT }); break; }
      out.push(scene.layout === "full" ? { id: "broll-full", x: 0, y: 0, w: 1920, h: 1080 } : scene.layout === "strip" ? { id: "broll-strip", x: 0, y: 250, w: 1920, h: 600 } : { id: "broll-panel", x: 700, y: 70, w: 1166, h: 810 });
      break;
    case "accent":
      // 贴人物两侧（anchor）的位置与 Accent.tsx 同一套算法：物件按中心、文字胶囊按内侧边缘对齐
      (scene.items || []).forEach((it, i) => {
        if (!on(it.at, it.until ?? it.at + 1.2)) return;
        const sz = it.size ?? (it.anchor ? 72 : 104);
        const sb = speakerBox(mode) ?? SPEAKER_BOXES.hero;
        const onStage = mode === "stage";
        const w = it.text ? textUnits(it.text) * 26 + 36 : sz, h = it.text ? 44 : sz;
        let cx = it.x ?? 1283, cy = it.y ?? 470;
        if (PORTRAIT && it.anchor) { cy = 500 + (i % 2) * 110; cx = it.text ? (it.anchor === "speaker-left" ? 360 - w / 2 : 840 + w / 2) : (it.anchor === "speaker-left" ? 360 - sz / 2 : 840 + sz / 2); }
        else if (onStage) { cx = it.anchor === "speaker-left" ? 300 : 1620; cy = 380 + (i % 3) * 130; }
        else if (it.anchor) {
          cy = sb.y + sb.h * 0.38 + (i % 2) * 120;
          if (it.text) cx = it.anchor === "speaker-left" ? sb.x - 40 - w / 2 : sb.x + sb.w + 40 + w / 2;
          else cx = it.anchor === "speaker-left" ? sb.x - 60 - sz / 2 : sb.x + sb.w + 60 + sz / 2;
        }
        out.push({ id: `accent:${it.text || it.image || it.glyph}`, x: cx - w / 2, y: cy - h / 2, w, h });
      });
      break;
    case "title":
      if (t >= (scene.at ?? scene.start)) out.push(PORTRAIT && scene.layout === "topic" ? { id: "title", ...CONTENT_RECT_P } : { id: "title", x: 0, y: 0, w: 1920, h: 1080, fullscreen: true });
      break;
    case "chat": {
      const first = Math.min(...(scene.messages || []).map((m) => m.at));
      if (t >= first) { const rect = CONTENT_RECT[mode] ?? CONTENT_RECT.default; const x = scene.side === "left" ? rect.x + 60 : scene.side === "right" ? rect.x + rect.w - 60 - 420 : rect.x + (rect.w - 420) / 2; out.push({ id: "chat-phone", x, y: 90, w: 420, h: 760 }); }
      break;
    }
    case "leaderboard": {
      const rows = scene.rows || []; const first = Math.min(...rows.map((r) => r.at));
      if (t >= first) { const rect = CONTENT_RECT.dock; const n = rows.length; const rowH = Math.min(120, (rect.h - 200) / n); const shown = rows.filter((r) => t >= r.at).length; out.push({ id: "leaderboard", x: rect.x + 60, y: rect.y + 120, w: rect.w - 120, h: rowH * shown }); }
      break;
    }
    case "gauge":
      if (t >= scene.at) { const rect = CONTENT_RECT.dock; out.push({ id: "gauge", x: rect.x + rect.w / 2 - 300, y: rect.y + rect.h / 2 - 260, w: 600, h: 520 }); }
      break;
    case "flip":
      if (t >= scene.start) { const rect = CONTENT_RECT.dock; out.push({ id: "flip", x: rect.x + (rect.w - 720) / 2, y: rect.y + (rect.h - 430) / 2 - 20, w: 720, h: 430 }); }
      break;
    case "map": {
      const first = Math.min(...(scene.markers || []).map((m) => m.at));
      if (t >= first) { const rect = CONTENT_RECT.dock; out.push({ id: "map", x: rect.x + 30, y: rect.y + 40, w: rect.w - 60, h: rect.h - 80 }); }
      break;
    }
    case "clipping":
      if (t >= scene.at) { const rect = CONTENT_RECT["hero-right"]; const w = Math.min(880, rect.w - 120); out.push({ id: "clipping", x: rect.x + (rect.w - w) / 2 - 20, y: 190, w: w + 40, h: 560 }); }
      break;
    case "timeline": {
      const rect = CONTENT_RECT.dock; const ms = scene.milestones || []; const n = ms.length; const x0 = rect.x + 200, x1 = rect.x + rect.w - 200;
      // 卡宽与 Timeline.tsx 同一套自适应算法；导轨随第一个里程碑出现（2026-09-04）
      ms.forEach((m, i) => { if (t >= m.at) { const cx = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1); const above = i % 2 === 0; const w = Math.max(300, Math.ceil(Math.max(textUnits(m.label) * 28, m.sub ? textUnits(m.sub) * 20 : 0) + (m.image || m.glyph ? (m.image ? 44 : 40) + 14 : 0) + 68)); out.push({ id: `ms:${m.id}`, x: cx - w / 2, y: above ? 470 - 60 - 150 : 470 + 60, w, h: 150 }); } });
      if (n && t >= Math.min(...ms.map((m) => m.at))) out.push({ id: "timeline-rail", x: x0, y: 450, w: x1 - x0, h: 40 });
      break;
    }
    case "compare": {
      const rect = contentRectOf("dock"); const gap = PORTRAIT ? 70 : 110; const w = (rect.w - 40 - gap) / 2; const cy = PORTRAIT ? rect.y : 210; const ch = PORTRAIT ? rect.h - 70 : 480;
      if (t >= scene.left.at) out.push({ id: "compare-left", x: rect.x + 20, y: cy, w, h: ch });
      if (t >= scene.right.at) out.push({ id: "compare-right", x: rect.x + 20 + w + gap, y: cy, w, h: ch });
      break;
    }
    case "quote": {
      if (t >= scene.at) { const rect = CONTENT_RECT[mode] ?? { x: 120, y: 60, w: 1680, h: 840 }; const w = Math.min(scene.w ?? 980, rect.w - 80); out.push({ id: "quote", x: rect.x + (rect.w - w) / 2 - 30, y: (scene.y ?? 300) - 80, w: w + 30, h: 360 }); }
      break;
    }
    case "converge":
      if (t >= Math.min(scene.sink?.at ?? scene.start, ...(scene.sources || []).map((src) => src.at ?? scene.start))) out.push({ id: "converge", x: 880, y: 60, w: 760, h: 780 });
      break;
    case "equation": {
      // 公式板从第一个项出现算起，不从场景起点算（2026-09-06：空板期人物居中被误判重叠）
      const firstTerm = Math.min(Infinity, ...(scene.rows || []).flatMap((r) => (r.terms || []).map((x) => x.at)));
      if (t >= (Number.isFinite(firstTerm) ? firstTerm : scene.start)) out.push(scene.collapseAt && t >= scene.collapseAt + 1.2 ? { id: "equation-mini", x: 1326, y: 58, w: 540, h: 250 } : { id: "equation-board", x: 540, y: 190, w: 1326, h: 660 });
      break;
    }
    case "data":
      out.push({ id: "data-card", x: 520, y: 70, w: 1346, h: 810 });
      break;
    case "reminders":
      (scene.items || []).forEach((it, i) => { if (t >= it.at) out.push({ id: it.text, ...reminderSlots()[Math.min(2, i)] }); });
      break;
    case "reference":
      if (t >= scene.at) out.push({ id: scene.title, x: scene.x, y: scene.y, w: scene.w, h: 300 });
      break;
    default:
      break;
  }
  return out;
}
const overlapRatio = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0; return (w * h) / (a.w * a.h);
};
export function validateLayout(plan, { step = 0.5, threshold = 0.02 } = {}) {
  setCanvas(plan);
  const errors = []; const seen = new Set();
  const keyframes = [...plan.speaker].sort((a, b) => a.at - b.at);
  for (const scene of plan.scenes) {
    if (scene.layout === "unchecked") continue;
    // 场景自身的形变窗口（收缩 / 右移 / 降格 / 展开 / 擦除后 1.2s）不采样：元素在飞行中，与人物换位同时发生
    const morphAts = [scene.shiftAt, scene.collapseAt, scene.demoteAt, scene.expandAt, scene.eraseAt, scene.convergeAt].filter(Number.isFinite);
    for (let t = scene.start; t < scene.end; t += step) {
      if (morphAts.some((a) => t >= a && t < a + 1.2)) continue;
      const sp = speakerAt(t, keyframes);
      if (!sp.box) continue;
      if (sp.mode === "stage") {
        for (const box of sceneBoxes(scene, t, sp.mode)) {
          if (box.fullscreen) continue; // 标题卡等整屏覆盖层是设计内的
          const inZone = STAGE_ZONES.some((z) => box.x >= z.x - 8 && box.y >= z.y - 8 && box.x + box.w <= z.x + z.w + 8 && box.y + box.h <= z.y + z.h + 8);
          if (!inZone) { const key = `${scene.id}:${box.id}:stage`; if (!seen.has(key)) { seen.add(key); errors.push(`scene ${scene.id}: ${t.toFixed(1)}s 元素「${box.id}」不在舞台模式允许区（左带 / 右带 / 下三分之一）`); } }
        }
        continue;
      }
      for (const box of sceneBoxes(scene, t, sp.mode)) {
        if (box.fullscreen) continue;
        const r = overlapRatio(box, sp.box);
        if (r > threshold) {
          const key = `${scene.id}:${box.id}:${sp.mode}`;
          if (seen.has(key)) continue; seen.add(key);
          errors.push(`scene ${scene.id}: ${t.toFixed(1)}s 元素「${box.id}」与人物（${sp.mode}）重叠 ${Math.round(r * 100)}%`);
        }
      }
    }
  }
  return errors;
}

export function compilePlan(plan, captions) {
  setCanvas(plan);
  const errors = validatePlan(plan, captions);
  if (errors.length) throw new Error(`场景计划无效:\n- ${errors.join("\n- ")}`);
  const layoutErrors = validateLayout(plan);
  const containerErrors = validateContainer(plan);
  if (containerErrors.length) throw new Error(`容器门禁:\n- ${containerErrors.join("\n- ")}`);
  const coverage = validateCoverage(plan);
  for (const w of coverage.warns) console.warn(`覆盖率警告 ${w}`);
  // stage3d（成片皮肤）下硬拦；其它皮肤降为警告（合成夹具 / 样张 job 不受阻）
  if (coverage.errors.length) {
    if (plan.skin === "stage3d") throw new Error(`覆盖率门禁:\n- ${coverage.errors.join("\n- ")}`);
    for (const e of coverage.errors) console.warn(`覆盖率警告(未启用硬拦) ${e}`);
  }
  if (layoutErrors.length) throw new Error(`布局几何门禁未过（人物与元素重叠）:\n- ${layoutErrors.join("\n- ")}`);
  const fps = plan.fps;
  const toFrame = (seconds) => Math.round(seconds * fps);
  const convert = (value, key) => {
    if (Array.isArray(value)) {
      if (WINDOW_KEYS.has(key)) return value.map((pair) => pair.map(toFrame));
      return value.map((item) => convert(item, key));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v, k)]));
    }
    if (typeof value === "number" && key !== undefined && TIME_KEY.test(key)) return toFrame(value);
    return value;
  };
  const compiled = {
    schemaVersion: 1,
    fps,
    durationInFrames: Math.round(plan.duration * fps),
    source: { media: plan.source.media, startFrame: toFrame(plan.source.start ?? 0) },
    ...(plan.background ? { background: plan.background } : {}),
    ...(plan.keywords ? { keywords: plan.keywords } : {}),
    ...(plan.skin ? { skin: plan.skin } : {}),
    ...(plan.canvas ? { canvas: { ...plan.canvas } } : {}),
    // 面板上「有内容」的区间（帧）：自带边框的证据 / B-roll / 数据卡、贴人物的点缀、全屏标题不算；面板只在这些区间存在（2026-09-04 Scott：空板子一秒都不行）
    content: mergeIntervals(plan.scenes.filter((sc) => !["evidence", "broll", "data", "title", "accent"].includes(sc.type)).flatMap(contentIntervals).map(([a, b]) => [toFrame(a), toFrame(b)])),
    speaker: plan.speaker.map((kf) => ({ at: toFrame(kf.at), mode: kf.mode })),
    captions: captions.map((c) => ({ s: toFrame(c.s), e: toFrame(c.e), t: c.t })),
    scenes: plan.scenes.map((scene) => convert(scene))
  };
  const compiledErrors = validateCompiled(compiled);
  if (compiledErrors.length) throw new Error(`编译后计划无效:\n- ${compiledErrors.join("\n- ")}`);
  return compiled;
}

export function loadMotionRegistry(root = projectRoot()) {
  return readJson(path.join(root, MOTION_REGISTRY));
}

// 动作路由：字段缺省时按注册表 defaultRule 的确定性规则填上；显式写了就校验
export function applyMotionDefaults(plan, words = []) {
  const notes = [];
  for (const scene of plan.scenes) {
    if (scene.type === "graph") {
      const span = scene.end - scene.start;
      const lastCreated = Math.max(...(scene.nodes || []).map((n) => n.at));
      for (const node of scene.nodes || []) {
        if (node.enter === undefined) {
          const holdsToEnd = (node.highlight || []).some(([, to]) => to >= scene.end - 0.05);
          node.enter = holdsToEnd && node.at === lastCreated && node.at > scene.start + span * 0.6 && !node.text && !node.badge ? "slam" : "pop";
          if (node.enter === "slam") notes.push(`${scene.id}.${node.id}: 结论型节点 → slam`);
        }
        if (node.badge && node.badge.fx === undefined) {
          node.badge.fx = /[✓✕×√]/.test(node.badge.text) || node.badge.tone === "red" ? "burst" : "impact";
        }
      }
      for (const edge of scene.edges || []) {
        if (edge.style === undefined) edge.style = edge.highlight?.length ? "flyline" : "line";
      }
    }
    if (scene.type === "evidence") {
      for (const f of scene.focus || []) {
        if (f.style === undefined) f.style = f.box.h < 80 ? "brackets" : "box";
        if (f.zoom === undefined) f.zoom = "shared";
      }
    }
    if (scene.type === "concept") {
      for (const phrase of scene.phrases || []) {
        if (phrase.reveal !== undefined) continue;
        const matched = matchPhraseWords(phrase.text, phrase.at, words);
        if (matched) {
          phrase.reveal = "karaoke";
          phrase.words = matched;
          notes.push(`${scene.id}: "${phrase.text}" 逐字对上 ${matched.length} 个词 → karaoke`);
        } else {
          phrase.reveal = "blur-slide";
        }
      }
    }
  }
  notes.push(...applyIdleCentering(plan));
  return notes;
}

// ------------------------------------------------------------
// 人物空闲居中（2026-09-02 Scott：右边没东西时人不该缩在左边，只有内容马上要出来才切左人右图）
// 规则：hero / dock / focus 段内，内容出现前空闲 ≥ IDLE_MIN 秒 → 该段先 hero-center，
// 内容出现前 IDLE_LEAD 秒切回原形态；内容结束后到下一关键帧仍空闲 ≥ IDLE_MIN+0.4 秒 → 再居中。
// ------------------------------------------------------------
const IDLE_MODES = new Set(["hero", "hero-right", "dock", "focus"]);
const IDLE_MIN = 1.8; // 居中再切回要两次形态切换（各 35f），空闲不足 1.8s 装不下；更短的空闲靠「切换延后」+ 面板只随内容出现（2026-09-04）
const BIG_FACE = new Set(["hero", "hero-center", "hero-right", "close", "close-right", "dock", "focus", "wide", "full", "pip"]);
const IDLE_LEAD = 0.6;
const r2 = (v) => Math.round(v * 100) / 100;
export function mergeIntervals(list) {
  const out = [];
  for (const [a, b] of [...list].filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
export function contentIntervals(scene) {
  if (scene.type === "label") return (scene.items || []).map((it) => [it.at, it.until ?? scene.end]);
  if (scene.type === "accent") return (scene.items || []).map((it) => [it.at, it.until ?? it.at + 1.2]);
  if (scene.type === "quote") return [[scene.at, scene.end]];
  if (scene.type === "title") return [[scene.at ?? scene.start, scene.end]];
  if (scene.type === "chat") return [[Math.min(...scene.messages.map((m) => m.at)), scene.end]];
  if (scene.type === "leaderboard") return [[Math.min(...scene.rows.map((r) => r.at)), scene.end]];
  if (scene.type === "gauge" || scene.type === "clipping") return [[scene.at, scene.end]];
  if (scene.type === "flip") return [[scene.start, scene.end]];
  if (scene.type === "map") return [[Math.min(...scene.markers.map((m) => m.at)), scene.end]];
  // 阶梯 / 循环 / 时间线 / 汇流：内容从第一个元素出现算起，不从场景起点算（2026-09-04 Scott：场景开了 1.4s 板子还是空的）
  if (scene.type === "timeline") return [[Math.min(...scene.milestones.map((m) => m.at)), scene.end]];
  if (scene.type === "compare") return [[Math.min(scene.left.at, scene.right.at), scene.end]];
  if (scene.type === "reminders") return (scene.items || []).map((it) => [it.at, scene.end]);
  if (scene.type === "equation") { const ats = (scene.rows || []).flatMap((r) => (r.terms || []).map((x) => x.at)); return ats.length ? [[Math.min(...ats), scene.end]] : [[scene.start, scene.end]]; }
  if (scene.type === "graph") {
    const ats = (scene.nodes || []).map((n) => n.at);
    return ats.length ? [[Math.min(...ats), scene.end]] : [];
  }
  if (scene.type === "converge") {
    const ats = (scene.sources || []).map((src) => src.at ?? scene.start);
    return [[Math.min(scene.sink?.at ?? scene.start, ...ats), scene.end]];
  }
  if (scene.type === "ladder") return [[Math.min(scene.note?.at ?? Infinity, ...scene.steps.map((st) => st.at)), scene.end]];
  if (scene.type === "cycle") return [[Math.min(...scene.nodes.map((n) => n.at)), scene.end]];
  return [[scene.start, scene.end]];
}
export function applyIdleCentering(plan, _opts = {}) {
  // studio：人物三态由分镜显式指定（全画幅本身就是默认态），不做自动居中（2026-09-07：自动切 full 会压住面板）
  if (plan.skin === "studio") return [];
  return applyIdleCenteringImpl(plan, "hero-center");
}
function applyIdleCenteringImpl(plan, CENTER) {
  const notes = [];
  // 点缀贴在人物身上，不算「面板内容」，不影响居中判断（2026-09-04）
  const intervals = plan.scenes.filter((sc) => sc.type !== "accent").flatMap(contentIntervals).sort((a, b) => a[0] - b[0]);
  const keyframes = [...plan.speaker].sort((a, b) => a.at - b.at);
  const out = [];
  const push = (at, mode) => out.push({ at: r2(at), mode });
  for (let i = 0; i < keyframes.length; i += 1) {
    const kf = keyframes[i];
    const segEnd = keyframes[i + 1]?.at ?? plan.duration;
    if (!IDLE_MODES.has(kf.mode)) { out.push(kf); continue; }
    const inSeg = intervals.filter(([a, b]) => b > kf.at && a < segEnd);
    let cursor = kf.at;
    let first = true;
    for (const [a, b] of inSeg) {
      const idle = a - cursor;
      // 短空闲：上一形态是大脸时把切换延后到内容前 0.5s（人先留在原位）；上一形态是小圆卡 / 隐藏则立刻切（别让人缩在角落对着空场）
      if (first && idle >= 0.4 && idle < IDLE_MIN && i > 0 && BIG_FACE.has(out[out.length - 1].mode) && (a - 0.5) - kf.at >= 0.2 && (a - 0.5) - out[out.length - 1].at >= 1.2) {
        push(a - 0.5, kf.mode); notes.push(`人物 ${kf.at}s 空闲 ${r2(idle)}s → 切换延后到 ${r2(a - 0.5)}s`);
      } else if (first && idle >= IDLE_MIN) {
        push(kf.at, CENTER); push(a - IDLE_LEAD, kf.mode);
        notes.push(`人物 ${kf.at}s 起空闲 ${r2(idle)}s → 居中，${r2(a - IDLE_LEAD)}s 切回 ${kf.mode}`);
      } else if (!first && idle >= IDLE_MIN + 0.4) {
        push(cursor + 0.25, CENTER); push(a - IDLE_LEAD, kf.mode);
        notes.push(`人物 ${r2(cursor)}s 起空闲 ${r2(idle)}s → 居中，${r2(a - IDLE_LEAD)}s 切回 ${kf.mode}`);
      } else if (first) out.push(kf);
      first = false;
      cursor = Math.max(cursor, b);
    }
    if (first) {
      if (segEnd - kf.at >= IDLE_MIN) { push(kf.at, CENTER); notes.push(`人物 ${kf.at}s 段内无内容 → 居中`); }
      else out.push(kf);
    } else if (segEnd - cursor >= IDLE_MIN + 0.4) {
      push(cursor + 0.25, CENTER);
      notes.push(`人物 ${r2(cursor)}s 之后空闲 ${r2(segEnd - cursor)}s → 居中`);
    }
  }
  plan.speaker = out;
  return notes;
}

// 在词表里从 at 附近找到与短语逐字相同的连续词序列
export function matchPhraseWords(text, at, words) {
  const norm = (s) => s.replace(/[\s，。、？！,.?!·「」（）()：:]/g, "");
  const target = norm(text);
  if (!target) return null;
  const startIndex = words.findIndex((w) => w.s >= at - 0.6);
  if (startIndex < 0) return null;
  for (let i = startIndex; i < words.length && words[i].s <= at + 6; i += 1) {
    let acc = "";
    const picked = [];
    for (let j = i; j < words.length && acc.length < target.length; j += 1) {
      const t = norm(words[j].t);
      if (!t) continue;
      if (!target.startsWith(acc + t)) break;
      acc += t;
      picked.push({ t: words[j].t, at: words[j].s, until: Math.max(words[j].e, words[j].s + 0.12) });
    }
    if (acc === target) return mergeAsciiTokens(picked);
  }
  return null;
}

// whisper 会把英文词拆成 "T / ik / Tok" 这类碎片：相邻 ASCII 碎片合并成一个词
function mergeAsciiTokens(words) {
  const out = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && /^[A-Za-z0-9]+$/.test(prev.t) && /^[A-Za-z0-9]+$/.test(w.t) && w.at - prev.until < 0.2) {
      prev.t += w.t;
      prev.until = w.until;
    } else out.push({ ...w });
  }
  return out;
}

export function validateMotions(plan, registry) {
  const errors = [];
  const ported = new Set(registry.motions.filter((m) => m.status === "ported").map((m) => m.stageId));
  const check = (field, value, where) => {
    if (value === undefined || value === false) return;
    const table = MOTION_FIELDS[field];
    if (!table || !(String(value) in table)) { errors.push(`${where}: ${field}=${value} 不是已登记的动作`); return; }
    const stageId = table[String(value)];
    if (stageId && !ported.has(stageId)) errors.push(`${where}: ${field}=${value} 对应 ${stageId} 尚未移植（status 不是 ported）`);
  };
  for (const scene of plan.scenes) {
    for (const node of scene.nodes || []) {
      check("node.enter", node.enter, `${scene.id}.${node.id}`);
      if (node.badge) check("badge.fx", node.badge.fx, `${scene.id}.${node.id}.badge`);
    }
    for (const edge of scene.edges || []) check("edge.style", edge.style, `${scene.id}.${edge.from}→${edge.to}`);
    for (const f of scene.focus || []) { check("focus.style", f.style, `${scene.id}.focus`); check("focus.zoom", f.zoom, `${scene.id}.focus`); }
    if (scene.type === "converge") check("converge.handoff", scene.handoff, scene.id);
    for (const phrase of scene.phrases || []) check("phrase.reveal", phrase.reveal, `${scene.id}.phrase`);
    if (scene.type === "concept") check("underline", scene.underline, `${scene.id}.term`);
    for (const item of scene.items || []) { check("label.odometer", item.odometer, `${scene.id}.${item.text}`); check("underline", item.underline, `${scene.id}.${item.text}`); }
    for (const card of scene.cards || []) if (card.tag) check("underline", card.tag.underline, `${scene.id}.${card.tag.text}`);
  }
  return errors;
}

export function validatePlan(plan, captions) {
  const errors = [];
  if (plan?.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Number.isInteger(plan?.fps) || plan.fps <= 0) errors.push("fps 必须是正整数");
  if (!(plan?.duration > 0)) errors.push("duration 必须为正数（秒）");
  if (plan?.canvas && !(plan.canvas.w > 0 && plan.canvas.h > 0)) errors.push("canvas 必须是 {w,h} 正数");
  if (!plan?.source?.media) errors.push("source.media 不能为空");
  if (!Array.isArray(plan?.speaker) || !plan.speaker.length) errors.push("speaker 关键帧不能为空");
  else {
    if (plan.speaker[0].at !== 0) errors.push("speaker 第一帧必须从 0 秒开始");
    for (const kf of plan.speaker) if (!SPEAKER_MODES.has(kf.mode)) errors.push(`speaker 模式无效: ${kf.mode}`);
  }
  if (!Array.isArray(captions) || !captions.length) errors.push("captions 不能为空");
  if (!Array.isArray(plan?.scenes) || !plan.scenes.length) {
    errors.push("scenes 不能为空");
    return errors;
  }
  const ids = new Set();
  for (const scene of plan.scenes) {
    const label = `scene ${scene.id || "_"}`;
    if (!scene.id || ids.has(scene.id)) errors.push(`${label}: id 为空或重复`);
    ids.add(scene.id);
    if (!SCENE_TYPES.has(scene.type)) errors.push(`${label}: 未登记的场景类型 ${scene.type}`);
    if (!(scene.start >= 0) || !(scene.end > scene.start)) errors.push(`${label}: start/end 无效`);
    if (scene.end > plan.duration + 0.001) errors.push(`${label}: 超出视频时长`);
    if (scene.type === "graph") {
      const nodeIds = new Set((scene.nodes || []).map((n) => n.id));
      for (const edge of scene.edges || []) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`${label}: 连线引用了不存在的节点 ${edge.from}→${edge.to}`);
      }
      for (const node of scene.nodes || []) {
        if (!node.text && !node.image && node.shape !== "pill" && node.kind === "none") errors.push(`${label}: 节点 ${node.id} 既没有图标也没有文字`);
        for (const state of node.states || []) if (state.at < node.at) errors.push(`${label}: 节点 ${node.id} 的状态早于创建`);
      }
    }
    if (scene.type === "broll") {
      const media = path.join(projectRoot(), "renders/work-shotcraft/ink-press/public", scene.media);
      if (!fs.existsSync(media)) (process.env.ALLOW_MISSING_MEDIA ? console.warn(`警告 ${label}: B-roll 素材尚不存在 ${scene.media}`) : errors.push(`${label}: B-roll 素材不存在 ${scene.media}`));
      if (!["generated", "third-party", "own"].includes(scene.origin)) errors.push(`${label}: origin 必须是 generated / third-party / own`);
      if (scene.end - scene.start > 7) errors.push(`${label}: 单段 B-roll 不得超过 7 秒（把抽象词落到物件，不是插片）`);
    }
    if (scene.type === "evidence") {
      const image = path.join(projectRoot(), "renders/work-shotcraft/ink-press/public", scene.image);
      if (!fs.existsSync(image)) (process.env.ALLOW_MISSING_MEDIA ? console.warn(`警告 ${label}: 证据图片尚不存在 ${scene.image}`) : errors.push(`${label}: 证据图片不存在 ${scene.image}`));
    }
    if (scene.type === "data" && (!Array.isArray(scene.series) || scene.series.length < 4)) errors.push(`${label}: series 至少 4 个点`);
    if (scene.type === "split" && scene.cards?.length !== 2) errors.push(`${label}: split 必须恰好两张卡`);
    if (scene.type === "ladder" && !(scene.steps?.length >= 2)) errors.push(`${label}: ladder 至少两级`);
    if (scene.type === "cycle" && !(scene.nodes?.length >= 3)) errors.push(`${label}: cycle 至少三个节点`);
    if (scene.type === "accent" && !(scene.items?.length >= 1)) errors.push(`${label}: accent 至少一个点缀`);
    if (scene.type === "quote" && !(scene.text && scene.at >= scene.start)) errors.push(`${label}: quote 需要 text 与 at`);
    if (scene.type === "timeline" && !(scene.milestones?.length >= 2)) errors.push(`${label}: timeline 至少两个里程碑`);
    if (scene.type === "compare" && !(scene.left?.lines?.length && scene.right?.lines?.length)) errors.push(`${label}: compare 左右面板都要有行`);
    if (scene.type === "title" && !scene.title) errors.push(`${label}: title 需要 title`);
    if (scene.type === "chat" && !(scene.messages?.length >= 2)) errors.push(`${label}: chat 至少两条消息`);
    if (scene.type === "leaderboard" && !(scene.rows?.length >= 2)) errors.push(`${label}: leaderboard 至少两行`);
    if (scene.type === "gauge" && !(scene.value >= 0 && scene.at >= scene.start)) errors.push(`${label}: gauge 需要 value 与 at`);
    if (scene.type === "flip" && !(scene.front?.text && scene.back?.text && scene.flipAt > scene.start)) errors.push(`${label}: flip 需要 front/back/flipAt`);
    if (scene.type === "map") { const ids = new Set((scene.markers || []).map((m) => m.id)); if (!(scene.markers?.length >= 1)) errors.push(`${label}: map 至少一个标记`); for (const arc of scene.arcs || []) if (!ids.has(arc.from) || !ids.has(arc.to)) errors.push(`${label}: 航线引用了不存在的标记 ${arc.from}→${arc.to}`); }
    if (scene.type === "clipping" && !(scene.headline && scene.source)) errors.push(`${label}: clipping 需要 headline 与 source`);
    // 字幕安全区：带坐标的元素不得压到字幕
    const positioned = [...(scene.items || []), ...(scene.notes || []), ...(scene.nodes || [])];
    for (const el of positioned) {
      const top = scene.type === "graph" && el.id ? el.y - (el.h ?? 172) / 2 : el.y;
      if (top > CAPTION_SAFE_Y) errors.push(`${label}: "${el.text || el.label || el.id}" y=${el.y} 进入字幕安全区（顶边须 ≤ ${CAPTION_SAFE_Y}）`);
    }
  }
  return errors;
}

// 词级锚点核对：所有 at / *At 必须落在某个口播词的开始时刻附近；返回偏离清单（警告）
export function checkWordAnchors(plan, words, tolerance = WORD_TOLERANCE) {
  const starts = words.map((w) => w.s).sort((a, b) => a - b);
  const nearest = (t) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const cands = [starts[lo], starts[lo - 1]].filter((v) => v !== undefined);
    return Math.min(...cands.map((v) => Math.abs(v - t)));
  };
  const offenders = [];
  const walk = (value, trail) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${trail}[${i}]`));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "number" && (k === "at" || k.endsWith("At")) && k !== "eraseAt" && nearest(v) > tolerance) offenders.push(`${trail}.${k}=${v} 偏离最近词 ${nearest(v).toFixed(2)}s`);
        else walk(v, `${trail}.${k}`);
      }
    }
  };
  plan.scenes.forEach((scene) => walk(scene, scene.id));
  plan.speaker.forEach((kf, i) => { if (kf.at > 0 && nearest(kf.at) > tolerance) offenders.push(`speaker[${i}].at=${kf.at} 偏离最近词 ${nearest(kf.at).toFixed(2)}s`); });
  return offenders;
}

// 覆盖率审计（2026-09-03 Scott："屏幕不能有大半边空着或空着纸有小字"）
// 每 0.5s 采样：把画面（字幕区以上）分左右两半，一半连续 ≥2.5s 没有任何元素或人物 → 错误；1.5–2.5s → 警告；
// 一半只剩一个 s/m 号标签 ≥1.5s → 警告（孤立小字）
export function validateCoverage(plan, step = 0.5) {
  const errors = [], warns = [];
  const halves = [{ id: "左半边", x: 0, w: 960 }, { id: "右半边", x: 960, w: 960 }];
  const runs = { 左半边: 0, 右半边: 0 }, lone = { 左半边: 0, 右半边: 0 };
  const flagged = new Set();
  for (let t = 0; t < plan.duration; t += step) {
    const sp = speakerAt(t, plan.speaker);
    const boxes = [];
    if (sp.box && !sp.morphing) boxes.push({ id: "speaker", ...sp.box });
    for (const scene of plan.scenes) if (t >= scene.start && t < scene.end) boxes.push(...sceneBoxes(scene, t, sp.mode).map((b) => ({ ...b, small: /^(label|accent):/.test(b.id) && b.h < 70 })));
    if (sp.morphing) continue;
    for (const h of halves) {
      const inHalf = boxes.filter((b) => b.x < h.x + h.w && b.x + b.w > h.x && b.y < 880);
      if (!inHalf.length) runs[h.id] += step; else runs[h.id] = 0;
      if (inHalf.length === 1 && inHalf[0].small) lone[h.id] += step; else lone[h.id] = 0;
      if (runs[h.id] >= 2.5 && !flagged.has(`${h.id}:${Math.floor(t / 10)}`)) { flagged.add(`${h.id}:${Math.floor(t / 10)}`); errors.push(`${h.id}在 ${(t - runs[h.id]).toFixed(1)}–${t.toFixed(1)}s 连续空白 ${runs[h.id].toFixed(1)}s`); }
      else if (runs[h.id] >= 1.5 && runs[h.id] < 1.5 + step) warns.push(`${h.id}在 ${t.toFixed(1)}s 前后空白 1.5s+`);
      if (lone[h.id] >= 1.5 && lone[h.id] < 1.5 + step) warns.push(`${h.id}在 ${t.toFixed(1)}s 只有一个小字标签孤立在空白里`);
    }
  }
  return { errors, warns };
}

// 容器门禁（stage3d）：任何元素的包围盒必须落在面板矩形内（人物居中 / 隐藏时无面板，整屏 / 通栏 B-roll 在面板外，免检）
// 出处：2026-09-03 Scott——"卡片没起到容器作用，有溢出的"
export function validateContainer(plan, step = 0.5) {
  if (plan.skin !== "stage3d") return [];
  const errors = [];
  const seen = new Set();
  const boardFor = (mode) => (mode === "orb-left" || mode === "orb-right") ? { x: 96 - 48, y: 60 - 24, w: 1794 + 96, h: 840 + 36 } : (() => { const r = CONTENT_RECT[mode] ?? CONTENT_RECT.default; return { x: r.x - 48, y: r.y - 24, w: r.w + 96, h: r.h + 36 }; })();
  for (const scene of plan.scenes) {
    if (scene.type === "broll" || scene.type === "evidence" || scene.type === "data" || scene.type === "title" || scene.type === "clipping" || scene.type === "chat") continue; // 自带边框 / 整屏，不进面板
    for (let t = scene.start; t < scene.end; t += step) {
      const sp = speakerAt(t, plan.speaker);
      if (sp.morphing || sp.mode === "hero-center" || sp.mode === "hidden" || sp.mode === "stage" || sp.mode === "full") continue;
      const board = boardFor(sp.mode);
      for (const b of sceneBoxes(scene, t, sp.mode)) {
        const over = Math.max(board.x - b.x, board.y - b.y, (b.x + b.w) - (board.x + board.w), (b.y + b.h) - (board.y + board.h));
        if (over > 8) { const key = `${scene.id}:${b.id}`; if (!seen.has(key)) { seen.add(key); errors.push(`scene ${scene.id}: "${b.id}" 在 ${t.toFixed(1)}s 超出面板 ${Math.round(over)}px（人物 ${sp.mode}）`); } }
      }
    }
  }
  return errors;
}

export function validateCompiled(compiled) {
  const errors = [];
  for (let i = 1; i < compiled.speaker.length; i += 1) {
    const gap = compiled.speaker[i].at - compiled.speaker[i - 1].at;
    if (gap < MIN_SPEAKER_GAP) errors.push(`speaker 关键帧 ${i} 与上一帧间隔 ${gap}f，少于 ${MIN_SPEAKER_GAP}f，形态变化会互相打断`);
  }
  // 解释场景内超过 4 秒没有状态变化 → 警告；超过 6 秒 → 错误（人物画面段不受此约束）
  const warnGap = compiled.fps * 4;
  const maxGap = compiled.fps * 6;
  for (const scene of compiled.scenes) {
    if (["label", "reference", "broll", "accent", "quote", "title", "gauge", "clipping", "flip"].includes(scene.type)) continue; // 展示保持型：入场后静置是设计内的
    const events = collectEvents(scene).sort((a, b) => a - b);
    // 缩成提醒卡之后进入静止保留态，不再要求状态变化
    const effectiveEnd = Math.min(scene.end, scene.demoteAt ?? scene.collapseAt ?? scene.end);
    let last = scene.start;
    for (const at of [...events.filter((f) => f <= effectiveEnd), effectiveEnd]) {
      if (at - last > maxGap) errors.push(`scene ${scene.id}: ${last}f→${at}f 之间超过 6 秒没有语义状态变化`);
      else if (at - last > warnGap) console.warn(`警告 scene ${scene.id}: ${last}f→${at}f 之间超过 4 秒没有语义状态变化`);
      last = Math.max(last, at);
    }
  }
  return errors;
}

function collectEvents(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => collectEvents(item, out));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "number" && (key === "at" || key.endsWith("At"))) out.push(v);
      else collectEvents(v, out);
    }
  }
  return out;
}

export function planModuleSource(compiled) {
  return `// 由 scripts/narrative-stage-plan.mjs 从 job/data/scene-plan.json 确定性生成，禁止手改。\nimport type {NarrativePlan} from './stage/Plan';\n\nexport const NARRATIVE_PLAN: NarrativePlan = ${JSON.stringify(compiled, null, 2)};\n`;
}

// ------------------------------------------------------------
// 型录签名与重复度审计：每场记「类型:变体」，与其他 job 的签名比三元组重合度；
// >35% 或开头四场相同 → 警告（八股预警）。签名落 visual-recipes/stage-usage.json。
// ------------------------------------------------------------
export function sceneSignature(scene) {
  switch (scene.type) {
    case "label": { const sizes = (scene.items || []).map((i) => i.size || "m"); const top = sizes.includes("giant") ? "giant" : sizes.includes("xl") ? "xl" : sizes.includes("l") ? "l" : "m"; return `label:${top}`; }
    case "graph": { const n = (scene.nodes || []).length; const shape = (scene.nodes || []).every((x) => x.shape === "pill") ? "pill" : "tile"; return `graph:${n <= 3 ? "flow" : n <= 6 ? "web" : "tree"}:${shape}`; }
    case "broll": return `broll:${scene.layout || "panel"}`;
    case "split": return `split:${scene.cards?.some((c) => c.image) ? "obj" : "text"}`;
    case "ladder": return `ladder:${scene.steps?.length}`;
    case "cycle": return `cycle:${scene.nodes?.length}`;
    case "timeline": return `timeline:${scene.milestones?.length}`;
    case "compare": return "compare";
    case "title": return "title";
    case "chat": return `chat:${scene.messages?.length}`;
    case "leaderboard": return `leaderboard:${scene.rows?.length}`;
    case "map": return `map:${scene.markers?.length}`;
    default: return scene.type;
  }
}
export function auditVariety(plan, jobDir, root = projectRoot()) {
  const sig = plan.scenes.map(sceneSignature);
  const usageFile = path.join(root, "visual-recipes", "stage-usage.json");
  const usage = fs.existsSync(usageFile) ? readJson(usageFile) : { jobs: {} };
  const slug = path.basename(jobDir);
  const tri = (arr) => new Set(arr.slice(0, -2).map((_, i) => arr.slice(i, i + 3).join(">")));
  const mine = tri(sig);
  const hist = {};
  for (const x of sig) hist[x.split(":")[0]] = (hist[x.split(":")[0]] || 0) + 1;
  const lines = [`型录 ${sig.join(" › ")}`, `类型分布 ${Object.entries(hist).map(([k, v]) => `${k}×${v}`).join(" ")}（${Object.keys(hist).length} 种 / ${sig.length} 场）`];
  let warn = false;
  // 跨 job 比对已去掉（Scott 2026-09-03：不要做跨 job 工作），签名仍记录供查看

  // 同类模板轮替：同一类型 5 场内再次出现 → 预警；连续两场同类型 → 强预警（2026-09-03 Scott：多对一连着出现两遍）
  const kindsFull = plan.scenes.filter((sc) => !["accent", "label", "broll"].includes(sc.type)).map(sceneSignature);
  const kinds = kindsFull.map((k) => k.split(":")[0]);
  const hard = [];
  for (let i = 0; i < kinds.length; i += 1) for (let j = i + 1; j < Math.min(kinds.length, i + 8); j += 1) if (kinds[i] === kinds[j]) { warn = true; const msg = `同类模板 ${kinds[i]} 在 ${j - i} 场内重复（第 ${i + 1} 与第 ${j + 1} 场）${j - i === 1 ? "，连续出现" : ""}`; lines.push(msg); if (j - i === 1 && kinds[i] !== "evidence" && kindsFull[i] === kindsFull[j]) hard.push(msg); break; }
  if (hard.length) throw new Error(`同类模板连续出现（Scott 2026-09-03：连续即拦）:\n- ${hard.join("\n- ")}`);
  // 开场 1.5 秒必须是正脸（2026-09-03 Scott：先让人看清是真人在说，再飞到别的地方）
  const first = [...plan.speaker].sort((a, b) => a.at - b.at)[0];
  if (first && !["hero", "hero-center", "close", "hero-right", "full", "wide"].includes(first.mode)) { warn = true; lines.push(`开场人物形态是 ${first.mode}：前 1.5 秒应是正脸（hero / hero-center / close）`); }
  const second = [...plan.speaker].sort((a, b) => a.at - b.at)[1];
  if (second && second.at < 1.5) { warn = true; lines.push(`第二个人物关键帧在 ${second.at}s：正脸至少保持 1.5 秒`); }
  usage.jobs[slug] = { signature: sig, at: new Date().toISOString().slice(0, 10) };
  writeJson(usageFile, usage);
  return { lines, warn, signature: sig };
}

// ============================================================
// 结构审计（docs/xiaolin-taste.md §4 的数字）：门禁只查「元素别撞、板别空」抓不到 Codex 2026-09-05 那种
// 「145s 换位 19 次、9 场黑板连排、没有一次视觉休息」的片子——它过了全部门禁仍被 Scott 判不合格。
// 警告 = 打印；拒绝 = 抛错。数字改动必须同步改手册 §4 并带出处。
// ============================================================
const REST_TYPES = new Set(["broll"]); // 标题卡不算休息（2026-09-07：Codex 换脑测试用 7 张章节标题凑「休息」，观感成了教程分章）；开场 / 收口标题另计
const HOOK_TYPES = new Set(["title", "leaderboard", "evidence", "broll", "data", "quote"]);
export function auditStructure(plan, { platform = "" } = {}) {
  setCanvas(plan);
  const lines = []; const errors = []; let warn = false;
  const W = (m) => { warn = true; lines.push(`结构警告 ${m}`); };
  const E = (m) => { errors.push(m); };
  const duration = Number(plan.duration) || 0;
  // 1. 人物换位密度：任意 20s 窗口内关键帧数 >4 警告、>6 拒绝
  const kf = [...(plan.speaker || [])].map((k) => k.at).sort((a, b) => a - b);
  let worst = 0, worstAt = 0;
  for (let i = 0; i < kf.length; i += 1) { let n = 0; for (let j = i; j < kf.length && kf[j] - kf[i] <= 20; j += 1) n += 1; if (n > worst) { worst = n; worstAt = kf[i]; } }
  if (worst > 6) E(`人物换位过频：${worstAt}s 起 20s 内 ${worst} 个关键帧（上限 6；手册 §4）`);
  else if (worst > 4) W(`人物换位偏频：${worstAt}s 起 20s 内 ${worst} 个关键帧（>4 即警告）`);
  // 2. 无视觉休息的最长连续段：休息 = broll，或 ≥2s 没有任何非点缀场景（标题卡不算）
  const titles = plan.scenes.filter((sc) => sc.type === "title" && sc.start > 3 && sc.end < duration - 5).length;
  if (titles > Math.ceil(duration / 100) * 2) W(`章节标题卡 ${titles} 张（每 100s 上限 2 张，开场 / 收口除外）：标题卡不是视觉休息`);
  const busy = mergeIntervals(plan.scenes.filter((sc) => !REST_TYPES.has(sc.type) && sc.type !== "accent").map((sc) => [sc.start, sc.end]));
  const rests = mergeIntervals(plan.scenes.filter((sc) => REST_TYPES.has(sc.type)).map((sc) => [sc.start, sc.end]));
  // 把 busy 段按 rests 和 ≥2s 空档切开，取最长
  let longest = 0, longestFrom = 0;
  const cutPoints = [0, duration, ...rests.flat()];
  for (let i = 0; i < busy.length; i += 1) {
    if (i > 0 && busy[i][0] - busy[i - 1][1] >= 2) cutPoints.push(busy[i][0]);
  }
  const pts = [...new Set(cutPoints)].sort((a, b) => a - b);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i], b = pts[i + 1];
    const covered = busy.reduce((acc, [s, e]) => acc + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
    if (covered > longest) { longest = covered; longestFrom = a; }
  }
  if (longest > 70) E(`连续 ${Math.round(longest)}s（${longestFrom}s 起）没有一次视觉休息（B-roll / 通栏 / 标题），上限 70s；手册 §4`);
  else if (longest > 45) W(`${longestFrom}s 起连续 ${Math.round(longest)}s 没有视觉休息（>45s 即警告，2026-09-06 Scott：B-roll 让大家休息一下）`);
  // 3. 前 8s 钩子材料
  if (!plan.scenes.some((sc) => HOOK_TYPES.has(sc.type) && sc.start < 8)) W("前 8s 没有钩子材料（title / leaderboard / evidence / broll / data / quote）：开头要有话题 + 可信度");
  // 4. 片长：不设数字门（2026-09-07 Scott 删掉「抖音 ≤100s」规则，片长由注意力决定，见手册 §5-3 / §6-9）
  // 4b. 相邻舞台场景间隔：模板入场提前 18f、退场拖后 18f（stageOpacity），间隔 <0.6s 必交叠（2026-09-07 v10 成片 89.4–89.8s 对比卡压目录面板）
  // broll→broll 是有意的蒙太奇叠化、点缀 / 标题贴人物不占舞台，都不算
  const staged = plan.scenes.filter((sc) => sc.type !== "accent" && sc.type !== "title").sort((a, b) => a.start - b.start);
  for (let i = 1; i < staged.length; i += 1) {
    const a = staged[i - 1], b = staged[i]; const gap = b.start - a.end;
    if (a.type === "broll" && b.type === "broll") continue;
    if (gap >= 0 && gap < 0.6) W(`${a.id} → ${b.id} 间隔 ${gap.toFixed(2)}s（<0.6s：前者退场淡出与后者入场淡入交叠，手册 §5）`);
  }
  // 5. B-roll 占比
  const broll = plan.scenes.filter((sc) => sc.type === "broll").reduce((a, sc) => a + (sc.end - sc.start), 0);
  if (duration && broll / duration > 0.25) W(`B-roll 占比 ${Math.round((broll / duration) * 100)}%（>25%：它是落地名词的工具不是壁纸）`);
  // 6. 人物出镜占比（studio：full + wide；其他皮肤：大脸形态）——2026-09-07 Scott「增加口播出镜」
  const kfs = [...(plan.speaker || [])].sort((a, b) => a.at - b.at); let faceSec = 0;
  const FACE = plan.skin === "studio" ? new Set(PORTRAIT ? ["full", "focus", "split"] : ["full", "wide"]) : new Set(["hero", "hero-center", "hero-right", "close", "close-right", "stage", "focus"]);
  for (let i = 0; i < kfs.length; i += 1) { const end = i + 1 < kfs.length ? kfs[i + 1].at : duration; if (FACE.has(kfs[i].mode)) faceSec += Math.max(0, end - kfs[i].at); }
  const facePct = duration ? Math.round((faceSec / duration) * 100) : 0;
  if (plan.skin === "studio" && facePct < 40) W(`人物出镜（full + wide）只占 ${facePct}%（目标 ≥40%，手册 §5-8）`);
  lines.unshift(`结构 换位最密 ${worst}/20s · 最长无休息 ${Math.round(longest)}s · B-roll ${duration ? Math.round((broll / duration) * 100) : 0}% · 人物出镜 ${facePct}%`);
  return { lines, warn, errors };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const plan = readJson(path.join(jobDir, "data", "scene-plan.json"));
  const captions = readJson(path.join(jobDir, "data", "captions.json"));
  const wordsFile = path.join(jobDir, "data", "words-timeline.json");
  const words = fs.existsSync(wordsFile) ? readJson(wordsFile).words : [];
  const routed = applyMotionDefaults(plan, words);
  for (const line of routed) console.log(`动作路由 ${line}`);
  const motionErrors = validateMotions(plan, loadMotionRegistry());
  if (motionErrors.length) throw new Error(`动作引用无效:\n- ${motionErrors.join("\n- ")}`);
  const compiled = compilePlan(plan, captions);
  if (fs.existsSync(wordsFile)) {
    const offenders = checkWordAnchors(plan, words);
    for (const line of offenders) console.warn(`词锚警告 ${line}`);
    if (offenders.length) console.warn(`共 ${offenders.length} 个时间点没有落在口播词上`);
  }
  writeJson(path.join(jobDir, "data", "scene-plan-compiled.json"), compiled);
  const moduleFile = path.resolve(projectRoot(), String(args.module || "renders/work-shotcraft/ink-press/src/factory/NarrativePlan.ts"));
  fs.mkdirSync(path.dirname(moduleFile), { recursive: true });
  fs.writeFileSync(moduleFile, planModuleSource(compiled));
  const usage = auditVariety(plan, jobDir);
  for (const line of usage.lines) console[usage.warn ? "warn" : "log"](line);
  const platform = (() => { try { const pj = readJson(path.join(jobDir, "project.json")); return [pj.platform, ...(pj.platforms || []), pj.target].filter(Boolean).join(","); } catch { return ""; } })();
  const structure = auditStructure(plan, { platform });
  for (const line of structure.lines) console[structure.warn ? "warn" : "log"](line);
  if (structure.errors.length) throw new Error(`结构门禁未过（docs/xiaolin-taste.md §4）:\n- ${structure.errors.join("\n- ")}`);
  console.log(`场景计划已编译: ${compiled.scenes.length} 个场景, ${compiled.speaker.length} 个人物关键帧, ${compiled.durationInFrames} 帧`);
  for (const scene of compiled.scenes) {
    console.log(`  ${String(scene.start).padStart(5)}–${String(scene.end).padEnd(5)} ${scene.type.padEnd(9)} ${scene.id}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
