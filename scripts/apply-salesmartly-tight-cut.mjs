import fs from "node:fs";
import path from "node:path";
import { projectRoot, readJson, videoDuration, writeJson } from "./lib.mjs";

const root = projectRoot();
const job = path.join(root, "jobs", "salesmartly-20260625-refresh");
const source = "assets/aroll.mp4";
const duration = videoDuration(path.join(job, source));

const cuts = [
  { id: "tight-001-logic-filler", start: 56.10, end: 58.02, reason: "删掉空转起句: 你想想这是个什么逻辑啊" },
  { id: "tight-002-duiba", start: 73.18, end: 73.48, reason: "删口头禅: 对吧" },
  { id: "tight-003-why-filler", start: 82.32, end: 82.80, reason: "删口头垫句: 为什么呢" },
  { id: "tight-004-region-cat-filler", start: 98.54, end: 109.70, reason: "删低密度举例和好猫坏猫重复段" },
  { id: "tight-005-language-stumble", start: 140.72, end: 142.36, reason: "删口误/口头禅: 还有呢呢 对吧" },
  { id: "tight-006-chat-transition-filler", start: 145.08, end: 148.06, reason: "删低密度转场: 但是我告诉你啊" },
  { id: "tight-007-solution-transition-filler", start: 155.52, end: 157.52, reason: "删低密度转场: 这个事我是怎么解决的呢" },
  { id: "tight-008-b2b-example-and-repeat", start: 215.66, end: 234.72, reason: "删不完整离职句、B2B 样本跳转和好猫坏猫重复段" },
  { id: "tight-009-platform-list", start: 241.86, end: 248.54, reason: "删平台枚举废话: TK/亚马逊/独立站到底好不好做" },
  { id: "tight-010-tail-filler", start: 253.36, end: 256.16, reason: "删结尾弱收束: 那你不看看..." }
];

const kept = [];
let cursor = 0;
let out = 0;
for (const cut of cuts) {
  if (cut.start > cursor) {
    kept.push(segment(cursor, cut.start, out));
    out += cut.start - cursor;
  }
  cursor = Math.max(cursor, cut.end);
}
if (cursor < duration) kept.push(segment(cursor, duration, out));

function segment(start, end, outStart) {
  return {
    id: `tight-seg-${String(kept.length + 1).padStart(3, "0")}`,
    source,
    sourceStart: round(start),
    sourceEnd: round(end),
    outStart: round(outStart),
    outEnd: round(outStart + end - start),
    duration: round(end - start),
    reason: "salesmartly tight cut"
  };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function mapPoint(time, mode = "start") {
  for (const seg of kept) {
    if (time >= seg.sourceStart && time <= seg.sourceEnd) {
      return round(seg.outStart + (time - seg.sourceStart));
    }
  }
  const next = kept.find((seg) => seg.sourceStart > time);
  if (mode === "start" && next) return round(next.outStart);
  const prev = [...kept].reverse().find((seg) => seg.sourceEnd < time);
  if (prev) return round(prev.outEnd);
  return 0;
}

function remapSpan(item, minDuration = 0.25) {
  const start = mapPoint(Number(item.start), "start");
  const end = mapPoint(Number(item.end), "end");
  if (end - start < minDuration) return null;
  return { ...item, start, end };
}

function remapCaptions(captions) {
  const outCaptions = [];
  for (const item of captions) {
    const start = Number(item.s ?? item.start);
    const end = Number(item.e ?? item.end ?? start + Number(item.duration || 0));
    const text = fixTerms(String(item.t ?? item.text ?? "").trim());
    if (!text) continue;
    for (const seg of kept) {
      const a = Math.max(start, seg.sourceStart);
      const b = Math.min(end, seg.sourceEnd);
      if (b - a < 0.08) continue;
      outCaptions.push({
        ...item,
        s: round(seg.outStart + (a - seg.sourceStart)),
        e: round(seg.outStart + (b - seg.sourceStart)),
        t: text
      });
    }
  }
  return outCaptions;
}

function fixTerms(text) {
  return text
    .replaceAll("SellSmart类", "SaleSmartly")
    .replaceAll("SellSmartly", "SaleSmartly")
    .replaceAll("AEI", "AI")
    .replaceAll("跨界电商", "跨境电商")
    .replaceAll("TEMO", "Temu")
    .replaceAll("T木", "Temu")
    .replaceAll("外衣流量", "外溢流量")
    .replaceAll("搁你们", "割你们")
    .replaceAll("中端消费者", "终端消费者")
    .replaceAll("中端的这个经销商", "终端的经销商")
    .replaceAll("俄罗斯语", "俄语")
    .replaceAll("正号IcoFlow", "正浩 EcoFlow")
    .replace(/BB\s*端/g, "B2B")
    .replace(/BC\s*端/g, "B2C")
    .replace(/B\s*端/g, "B2B")
    .replace(/C\s*端/g, "B2C")
    .replace(/卖给2C/g, "卖给 B2C")
    .replace(/卖给2B/g, "卖给 B2B")
    .replace(/在BB/g, "在 B2B")
    .replace(/在BC/g, "在 B2C")
    .replace(/做BB/g, "做 B2B")
    .replace(/做BC/g, "做 B2C");
}

writeJson(path.join(job, "data", "tight-cut-cuts.json"), cuts);
writeJson(path.join(job, "data", "tight-cut-edl.json"), kept);
writeJson(path.join(job, "data", "tight-cut-map.json"), { source, duration, outputDuration: round(out), cuts, kept });
writeJson(path.join(job, "data", "captions-tight.json"), remapCaptions(readJson(path.join(job, "data", "captions.json"))));

const currentProject = readJson(path.join(job, "project.json"));
writeJson(path.join(job, "project.json"), {
  ...currentProject,
  duration: round(out),
  sourceVideo: "assets/aroll-tight.mp4",
  outputName: "salesmartly-commercial-tight-final-60fps.mp4",
  downloadFolderName: "2026-07-08-SaleSmartly商单-新流程重剪-tight"
});

console.log(`Tight cut: ${duration.toFixed(3)}s -> ${out.toFixed(3)}s`);
