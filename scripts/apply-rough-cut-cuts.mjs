import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, readJsonArray, resolveJob, seconds, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const inputPath = path.resolve(jobDir, args.input || "data/rough-cut-edl.json");
const cutsPath = path.resolve(jobDir, args.cuts || "data/rough-cut-cuts.json");
const outputPath = path.resolve(jobDir, args.output || "data/rough-cut-edl.json");

const edl = readJsonArray(inputPath);
const cuts = readCuts(cutsPath);
const next = applyCuts(edl, cuts);

writeJson(outputPath, next);

const removed = cuts.reduce((total, cut) => total + (cut.end - cut.start), 0);
const duration = next.reduce((max, segment) => Math.max(max, segment.outEnd), 0);

console.log(`Input: ${inputPath}`);
console.log(`Cuts: ${cutsPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Segments: ${edl.length} -> ${next.length}`);
console.log(`Removed: ${round(removed)}s`);
console.log(`Duration: ${round(duration)}s`);

function readCuts(file) {
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : raw.cuts;
  if (!Array.isArray(list)) throw new Error(`Expected cuts array in ${file}`);
  return list
    .map((cut, index) => ({
      id: cut.id || `cut-${String(index + 1).padStart(3, "0")}`,
      start: seconds(cut.start),
      end: seconds(cut.end),
      reason: cut.reason || ""
    }))
    .filter((cut) => cut.end > cut.start)
    .sort((a, b) => a.start - b.start);
}

function applyCuts(segments, cuts) {
  let cursor = 0;
  const result = [];

  for (const segment of segments) {
    const pieces = keepPieces(segment, cuts);
    for (const piece of pieces) {
      const duration = round(piece.sourceEnd - piece.sourceStart);
      if (duration <= 0) continue;
      const id = `seg-${String(result.length + 1).padStart(3, "0")}`;
      result.push({
        ...segment,
        id,
        sourceStart: round(piece.sourceStart),
        sourceEnd: round(piece.sourceEnd),
        outStart: round(cursor),
        outEnd: round(cursor + duration),
        duration,
        reason: piece.reason || segment.reason
      });
      cursor += duration;
    }
  }

  return result;
}

function keepPieces(segment, cuts) {
  let ranges = [[seconds(segment.outStart), seconds(segment.outEnd)]];
  for (const cut of cuts) {
    ranges = ranges.flatMap(([start, end]) => subtractRange(start, end, cut.start, cut.end));
  }

  return ranges.map(([outStart, outEnd]) => {
    const sourceStart = seconds(segment.sourceStart) + (outStart - seconds(segment.outStart));
    const sourceEnd = sourceStart + (outEnd - outStart);
    return {
      sourceStart,
      sourceEnd,
      reason: outStart !== seconds(segment.outStart) || outEnd !== seconds(segment.outEnd)
        ? "manual review cut"
        : segment.reason
    };
  });
}

function subtractRange(start, end, cutStart, cutEnd) {
  if (cutEnd <= start || cutStart >= end) return [[start, end]];
  const parts = [];
  if (cutStart > start) parts.push([start, Math.min(cutStart, end)]);
  if (cutEnd < end) parts.push([Math.max(cutEnd, start), end]);
  return parts;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
