import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, readJsonArray, resolveJob, run, writeJson } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const indexPath = path.join(jobDir, "data", "transcripts", "index.json");
const edlPath = path.join(jobDir, "data", "rough-cut-edl.json");
const outputJson = path.join(jobDir, "data", "editor-signals.json");
const outputMarkdown = path.join(jobDir, "data", "editor-signals.md");
const threshold = Number(args.threshold || -38);
const minSilence = Number(args.minSilence || 0.12);

if (!fs.existsSync(indexPath)) throw new Error(`缺少转录索引: ${indexPath}`);

const index = readJson(indexPath);
const edl = fs.existsSync(edlPath) ? readJsonArray(edlPath) : [];
const sources = index.sources.map(auditSource);
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    silenceThresholdDb: threshold,
    minSilenceSeconds: minSilence,
    lowConfidence: 0.8,
    internalPauseSeconds: 0.18,
    cutPauseToleranceSeconds: 0.3
  },
  sources
};

writeJson(outputJson, report);
fs.writeFileSync(outputMarkdown, renderMarkdown(report));
console.log(`编辑声学审计完成 → ${outputMarkdown}`);

function auditSource(item) {
  const sourcePath = path.join(jobDir, item.source);
  const transcript = readJson(path.join(jobDir, item.transcript));
  const silences = detectSilences(sourcePath);
  return {
    source: item.source,
    transcript: item.transcript,
    silences,
    disfluencySignals: findDisfluencySignals(transcript, silences),
    pauseCandidates: findPauseCandidates(transcript, silences),
    cutBoundarySignals: auditCutBoundaries(item.source, transcript, silences)
  };
}

function detectSilences(sourcePath) {
  const result = run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", sourcePath, "-vn",
    "-af", `silencedetect=n=${threshold}dB:d=${minSilence}`,
    "-f", "null", "-"
  ], { capture: true });
  return parseSilences(result.stderr || "");
}

function parseSilences(log) {
  const events = [];
  let start = null;
  for (const line of log.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) start = Number(startMatch[1]);
    const endMatch = line.match(/silence_end:\s*([0-9.]+).*silence_duration:\s*([0-9.]+)/);
    if (endMatch && start !== null) {
      events.push({ start: round(start), end: round(endMatch[1]), duration: round(endMatch[2]) });
      start = null;
    }
  }
  return events;
}

function findDisfluencySignals(transcript, silences) {
  const signals = [];
  for (const word of transcript.words) {
    if (Number(word.confidence) < 0.8) signals.push(wordSignal("low_confidence", word));
    if (Number(word.end) - Number(word.start) >= 0.65) signals.push(wordSignal("stretched_alignment", word));
  }
  const wordSignals = [...signals];
  for (const segment of transcript.segments) {
    for (const silence of silences.filter((item) => isInternal(item, segment))) {
      signals.push({
        type: "pause_inside_segment",
        severity: pauseSeverity(silence, wordSignals),
        start: silence.start,
        end: silence.end,
        duration: silence.duration,
        segment: segment.text,
        reason: "同一转录句内部出现明显低能量停顿，可能是卡壳、口误或 ASR 自动补顺"
      });
    }
    const repeated = adjacentRepeat(segment.text);
    if (repeated) {
      signals.push({
        type: "adjacent_repeat",
        severity: "high",
        start: segment.start,
        end: segment.end,
        text: repeated,
        segment: segment.text,
        reason: "同一表达连续重复"
      });
    }
  }
  return signals.sort((a, b) => a.start - b.start);
}

function pauseSeverity(silence, wordSignals) {
  if (silence.duration >= 0.8) return "high";
  const nearWordAnomaly = wordSignals.some((item) =>
    item.start <= silence.end + 0.25 && item.end >= silence.start - 0.25
  );
  return nearWordAnomaly && silence.duration >= 0.35 ? "high" : "review";
}

function findPauseCandidates(transcript, silences) {
  return silences.map((silence) => {
    const before = transcript.words.filter((word) => word.end <= silence.start).at(-1);
    const after = transcript.words.find((word) => word.start >= silence.end);
    const internal = transcript.segments.find((segment) => isInternal(silence, segment));
    return {
      ...silence,
      kind: internal ? "internal_hesitation" : "breath_or_sentence_gap",
      before: before?.text || "",
      after: after?.text || "",
      safeCutCandidate: !internal && silence.duration >= 0.18
    };
  });
}

function auditCutBoundaries(source, transcript, silences) {
  const ranges = edl.filter((item) => item.source === source);
  return ranges.flatMap((range, index) => [
    boundarySignal(index, "in", Number(range.sourceStart), transcript, silences),
    boundarySignal(index, "out", Number(range.sourceEnd), transcript, silences)
  ]);
}

function boundarySignal(index, side, time, transcript, silences) {
  const silenceEdges = silences.flatMap((item) => [item.start, item.end]);
  const wordEdges = transcript.words.flatMap((item) => [item.start, item.end]);
  const silenceDistance = nearestDistance(time, silenceEdges);
  const wordDistance = nearestDistance(time, wordEdges);
  const hasPause = silenceDistance <= 0.3;
  const onWordEdge = wordDistance <= 0.09;
  const severity = hasPause ? "ok" : onWordEdge ? "review" : "high";
  return {
    range: index + 1,
    side,
    time: round(time),
    hasNearbyPause: hasPause,
    onWordEdge,
    silenceDistance: round(silenceDistance),
    wordDistance: round(wordDistance),
    severity,
    reason: boundaryReason(hasPause, onWordEdge)
  };
}

function boundaryReason(hasPause, onWordEdge) {
  if (hasPause) return "切点附近存在真实低能量停顿";
  if (onWordEdge) return "只贴合词边界，但附近没有可靠气口，需要听审";
  return "附近没有可靠气口，也没有贴合词边界";
}

function wordSignal(type, word) {
  return {
    type,
    severity: "review",
    start: word.start,
    end: word.end,
    text: word.text,
    confidence: word.confidence,
    reason: type === "low_confidence" ? "ASR 置信度偏低" : "词时间被异常拉长，可能是强制对齐失真"
  };
}

function isInternal(silence, segment) {
  return silence.start > segment.start + 0.08 && silence.end < segment.end - 0.08 && silence.duration >= 0.18;
}

function adjacentRepeat(text) {
  const clean = String(text || "").replace(/[\s，。！？、]/g, "");
  for (let size = Math.min(10, Math.floor(clean.length / 2)); size >= 2; size -= 1) {
    for (let start = 0; start + size * 2 <= clean.length; start += 1) {
      const phrase = clean.slice(start, start + size);
      if (phrase === clean.slice(start + size, start + size * 2)) return phrase;
    }
  }
  return "";
}

function nearestDistance(value, candidates) {
  if (!candidates.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates.map((candidate) => Math.abs(value - candidate)));
}

function renderMarkdown(report) {
  const sections = report.sources.map(renderSource).join("\n\n");
  return `# 编辑声学审计\n\n该报告只标记风险，不自动决定剪辑。\n\n${sections}\n`;
}

function renderSource(source) {
  const high = source.disfluencySignals.filter((item) => item.severity === "high");
  const review = source.disfluencySignals.filter((item) => item.severity === "review");
  const reviewCuts = source.cutBoundarySignals.filter((item) => item.severity !== "ok");
  return [
    `## ${source.source}`,
    `- 检测到停顿: ${source.silences.length}`,
    `- 高风险口误/卡壳: ${high.length}`,
    `- 需要复核的 EDL 边界: ${reviewCuts.length}`,
    "",
    "### 高风险口误/卡壳",
    high.length ? high.map(formatSignal).join("\n") : "- 无",
    "",
    "### 其他声学红旗",
    review.length ? review.map(formatSignal).join("\n") : "- 无",
    "",
    "### 气口与停顿候选",
    source.pauseCandidates.map(formatPause).join("\n"),
    "",
    "### EDL 边界",
    source.cutBoundarySignals.map(formatBoundary).join("\n")
  ].join("\n");
}

function formatSignal(item) {
  const detail = item.segment || item.text || "";
  return `- **${clock(item.start)}–${clock(item.end)}** ${item.type}: ${detail} — ${item.reason}`;
}

function formatPause(item) {
  const mark = item.safeCutCandidate ? "可审片气口" : "段内异常停顿";
  return `- ${clock(item.start)}–${clock(item.end)} (${item.duration.toFixed(3)}s) ${mark}: ${item.before} → ${item.after}`.trimEnd();
}

function formatBoundary(item) {
  return `- Range ${item.range} ${item.side} @ ${clock(item.time)} — **${item.severity}**; ${item.reason}`;
}

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 999;
  return Math.round(number * 1000) / 1000;
}
