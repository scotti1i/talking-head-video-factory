import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { SCENE_TYPES, applyIdleCentering, auditStructure, checkWordAnchors, compilePlan, sceneBoxes, validateLayout, validatePlan } from "./narrative-stage-plan.mjs";

const captions = [
  { s: 0, e: 2, t: "第一句" },
  { s: 2, e: 4, t: "第二句" }
];

const basePlan = () => ({
  schemaVersion: 1,
  fps: 30,
  duration: 12,
  source: { media: "factory/aroll.mp4", start: 0 },
  speaker: [
    { at: 0, mode: "hero" },
    { at: 3, mode: "dock" }
  ],
  scenes: [
    {
      id: "g",
      type: "graph",
      start: 1,
      end: 8,
      nodes: [
        { id: "a", label: "甲", kind: "creator", at: 1.5, x: 1000, y: 400, highlight: [[2, 4]] },
        { id: "b", label: "乙", kind: "order", at: 3, x: 900, y: 400, states: [{ at: 5, x: 1200, y: 400 }] }
      ],
      edges: [{ from: "a", to: "b", at: 3, highlight: [[3, 6]] }]
    }
  ]
});

test("秒→帧换算覆盖 at / until / *At 与 highlight/dim 时间窗", () => {
  const compiled = compilePlan(basePlan(), captions);
  assert.equal(compiled.durationInFrames, 360);
  assert.deepEqual(compiled.speaker, [{ at: 0, mode: "hero" }, { at: 90, mode: "dock" }]);
  const scene = compiled.scenes[0];
  assert.equal(scene.start, 30);
  assert.equal(scene.nodes[0].at, 45);
  assert.deepEqual(scene.nodes[0].highlight, [[60, 120]]);
  assert.equal(scene.nodes[1].states[0].at, 150);
  assert.equal(scene.nodes[1].x, 900, "非时间字段不能被换算");
  assert.deepEqual(compiled.captions[1], { s: 60, e: 120, t: "第二句" });
});

test("连线引用不存在的节点、状态早于创建、未登记类型都失败关闭", () => {
  const plan = basePlan();
  plan.scenes[0].edges.push({ from: "a", to: "zzz", at: 4 });
  plan.scenes[0].nodes[1].states[0].at = 2;
  plan.scenes.push({ id: "x", type: "hologram", start: 8, end: 9 });
  const errors = validatePlan(plan, captions);
  assert.ok(errors.some((e) => e.includes("不存在的节点")));
  assert.ok(errors.some((e) => e.includes("早于创建")));
  assert.ok(errors.some((e) => e.includes("未登记的场景类型")));
});

test("人物形态关键帧间隔不足 35 帧时拒绝，避免换位互相打断", () => {
  const plan = basePlan();
  plan.speaker.push({ at: 3.5, mode: "hidden" }); // hidden 无框，不触发几何门禁，只测间隔
  assert.throws(() => compilePlan(plan, captions), /少于 35f/);
});

test("解释场景超过 6 秒没有语义状态变化时拒绝，缩成提醒后不再要求变化", () => {
  const plan = basePlan();
  plan.scenes[0].end = 11;
  plan.scenes[0].nodes[1].states[0].at = 4;
  assert.throws(() => compilePlan(plan, captions), /超过 6 秒/);
  const demoted = basePlan();
  demoted.scenes.push({ id: "c", type: "concept", start: 1, end: 12, term: "术语", phrases: [{ text: "定义", at: 2 }], demoteAt: 3 });
  assert.doesNotThrow(() => compilePlan(demoted, captions));
});

test("带坐标的元素进入字幕安全区时拒绝", () => {
  const plan = basePlan();
  plan.scenes.push({ id: "l", type: "label", start: 1, end: 3, items: [{ text: "太低了", at: 1.2, x: 700, y: 870 }] });
  const errors = validatePlan(plan, captions);
  assert.ok(errors.some((e) => e.includes("字幕安全区")));
});

test("词级锚点核对列出偏离口播词首的时间点", () => {
  const plan = basePlan();
  plan.scenes[0].edges[0].at = 2.2; // 没有词在 2.2s 开始
  const words = [{ t: "甲", s: 1.5, e: 1.8 }, { t: "乙", s: 3.0, e: 3.3 }, { t: "丙", s: 5.0, e: 5.2 }];
  const offenders = checkWordAnchors(plan, words);
  assert.equal(offenders.length, 1, offenders.join("\n"));
  assert.match(offenders[0], /edges\[0\]\.at=2\.2/);
});

test("人物空闲居中：内容出现前空闲 ≥1.2s 的段先居中，内容前 0.6s 切回；空闲不足 0.4s 则原样", () => {
  const plan = {
    duration: 30,
    speaker: [{ at: 0, mode: "hero" }, { at: 10, mode: "dock" }, { at: 20, mode: "orb-left" }],
    scenes: [
      { id: "l", type: "label", start: 0, end: 9, items: [{ text: "甲", at: 5, until: 9, x: 0, y: 0 }] },
      { id: "g", type: "graph", start: 10, end: 19, nodes: [{ id: "a", at: 10.5, x: 0, y: 0, kind: "order", label: "乙" }], edges: [] }
    ]
  };
  const notes = applyIdleCentering(plan);
  assert.deepEqual(plan.speaker, [
    { at: 0, mode: "hero-center" },
    { at: 4.4, mode: "hero" },
    { at: 10, mode: "dock" },
    { at: 20, mode: "orb-left" }
  ]);
  assert.equal(notes.length, 1);
});

test("几何门禁：元素压到人物框时拒绝，形变窗口内不采样", () => {
  const plan = basePlan();
  plan.scenes[0].nodes[0].x = 600; // 压到 hero 人像（x 54..638）
  const errors = validateLayout(plan);
  assert.ok(errors.some((e) => /重叠/.test(e)), errors.join("\n"));
  plan.scenes[0].nodes[0].x = 1000;
  assert.deepEqual(validateLayout(plan), []);
});

test("目录 job 覆盖全部已登记场景类型，且每种类型都有几何登记（新增模板五步的自动检查）", () => {
  const plan = JSON.parse(fs.readFileSync(new URL("../jobs/stage-catalog-20260903/data/scene-plan.json", import.meta.url), "utf8"));
  const inCatalog = new Set(plan.scenes.map((s) => s.type));
  const missing = [...SCENE_TYPES].filter((t) => !inCatalog.has(t) && t !== "reference" && t !== "reminders" && t !== "data");
  assert.deepEqual(missing, [], "目录 job 缺少这些类型的 demo");
  for (const scene of plan.scenes) {
    const boxes = sceneBoxes(scene, scene.end - 0.1, "dock");
    assert.ok(Array.isArray(boxes), `${scene.type} 没有几何登记`);
  }
});

test("结构审计：换位过频拒绝、长时间无视觉休息拒绝、正常片只警告或通过", () => {
  const frantic = { duration: 60, speaker: Array.from({ length: 8 }, (_, i) => ({ at: i * 2, mode: i % 2 ? "dock" : "hero" })), scenes: [{ id: "t", type: "title", start: 0, end: 2, title: "x" }] };
  assert.ok(auditStructure(frantic).errors.some((e) => /换位过频/.test(e)));
  const noRest = { duration: 100, speaker: [{ at: 0, mode: "hero" }], scenes: [{ id: "g", type: "graph", start: 0, end: 100, nodes: [], edges: [] }] };
  assert.ok(auditStructure(noRest).errors.some((e) => /视觉休息/.test(e)));
  const fine = { duration: 95, speaker: [{ at: 0, mode: "hero" }, { at: 7, mode: "dock" }, { at: 60, mode: "orb-right" }], scenes: [
    { id: "t", type: "title", start: 0, end: 2.6, title: "x" }, { id: "b", type: "broll", start: 3.4, end: 7, media: "x" },
    { id: "g", type: "graph", start: 7, end: 35, nodes: [], edges: [] }, { id: "b2", type: "broll", start: 35, end: 40, media: "x" },
    { id: "l", type: "ladder", start: 40, end: 84 }, { id: "b3", type: "broll", start: 85, end: 91, media: "x" } ] };
  const r = auditStructure(fine, { platform: "douyin" });
  assert.deepEqual(r.errors, []);
  assert.ok(!r.lines.some((l) => /换位/.test(l) && /警告/.test(l)));
});
