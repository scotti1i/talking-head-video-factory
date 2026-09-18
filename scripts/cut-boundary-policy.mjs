export const DEFAULT_AUDIO_EDGE_FADE_SECONDS = 0.005;
export const DEFAULT_PAUSE_GUARD_SECONDS = 0.03;
export const DEFAULT_WORD_EDGE_TOLERANCE_SECONDS = 0.04;

export function audioEdgeFadeSeconds(duration) {
  return Math.min(DEFAULT_AUDIO_EDGE_FADE_SECONDS, Math.max(0, Number(duration) || 0) / 4);
}

export function classifyCutBoundary({
  time,
  silences = [],
  words = [],
  pauseGuardSeconds = DEFAULT_PAUSE_GUARD_SECONDS,
  wordEdgeToleranceSeconds = DEFAULT_WORD_EDGE_TOLERANCE_SECONDS
}) {
  const point = Number(time);
  const containingPause = silences.find((item) => point >= Number(item.start) && point <= Number(item.end));
  const pauseMargin = containingPause
    ? Math.min(point - Number(containingPause.start), Number(containingPause.end) - point)
    : 0;
  const insidePause = Boolean(containingPause);
  const hasSafePause = insidePause && pauseMargin >= pauseGuardSeconds;
  const pauseDistance = distanceToIntervals(point, silences);
  const wordDistance = nearestDistance(point, words.flatMap((item) => [item.start, item.end]));
  const onWordEdge = wordDistance <= wordEdgeToleranceSeconds;
  const severity = hasSafePause ? "ok" : insidePause || onWordEdge ? "review" : "high";

  return {
    insidePause,
    hasSafePause,
    pauseMargin: round(pauseMargin),
    pauseDistance: round(pauseDistance),
    wordDistance: round(wordDistance),
    onWordEdge,
    severity,
    reason: boundaryReason({ hasSafePause, insidePause, onWordEdge })
  };
}

export function selectCutReviewWindow({
  cutTime,
  duration,
  silences = [],
  minContextSeconds = 2,
  maxContextSeconds = 8,
  fallbackContextSeconds = 5
}) {
  const cut = Number(cutTime);
  const total = Number(duration);
  const previous = silences
    .filter((item) => Number(item.end) <= cut - minContextSeconds && Number(item.end) >= cut - maxContextSeconds)
    .sort((a, b) => Number(b.end) - Number(a.end))[0];
  const next = silences
    .filter((item) => Number(item.start) >= cut + minContextSeconds && Number(item.start) <= cut + maxContextSeconds)
    .sort((a, b) => Number(a.start) - Number(b.start))[0];
  const start = previous ? Number(previous.start) : Math.max(0, cut - fallbackContextSeconds);
  const end = next ? Number(next.end) : Math.min(total, cut + fallbackContextSeconds);
  const warnings = [];
  if (!previous && start > 0) warnings.push("切点前未找到自然停顿，审听片使用固定上下文");
  if (!next && end < total) warnings.push("切点后未找到自然停顿，审听片使用固定上下文");

  return {
    start: round(start),
    end: round(end),
    duration: round(end - start),
    cutOffset: round(cut - start),
    warnings
  };
}

export function parseSilenceLog(log) {
  const events = [];
  let start = null;
  for (const line of String(log || "").split("\n")) {
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

function boundaryReason({ hasSafePause, insidePause, onWordEdge }) {
  if (hasSafePause) return "切点位于真实低能量区内部，并与两侧语音保留安全距离";
  if (insidePause) return "切点虽在低能量区内，但过于贴近语音边缘，需要带声音复核";
  if (onWordEdge) return "只贴合词边界，未落入真实低能量区，需要带声音复核";
  return "切点既不在真实低能量区内，也未可靠贴合词边界";
}

function distanceToIntervals(value, intervals) {
  if (!intervals.length) return Number.POSITIVE_INFINITY;
  return Math.min(...intervals.map((item) => {
    const start = Number(item.start);
    const end = Number(item.end);
    if (value >= start && value <= end) return 0;
    return Math.min(Math.abs(value - start), Math.abs(value - end));
  }));
}

function nearestDistance(value, candidates) {
  if (!candidates.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates.map((candidate) => Math.abs(value - Number(candidate))));
}

function round(value) {
  if (!Number.isFinite(Number(value))) return 999;
  return Math.round(Number(value) * 1000) / 1000;
}
