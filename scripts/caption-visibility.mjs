const EPSILON = 1e-9;

export function normalizeCaptionHideRanges(value, { totalDuration } = {}) {
  const duration = strictPositiveNumber(totalDuration, "caption.hideDuring: totalDuration");
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("caption.hideDuring 必须是数组");

  const ranges = value.map((range, index) => normalizeRange(range, index, duration));
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (current.start < previous.end - EPSILON) {
      throw new Error(`caption.hideDuring[${index - 1}] 与 [${index}] 不允许重叠`);
    }
  }
  return ranges;
}

function normalizeRange(range, index, totalDuration) {
  const label = `caption.hideDuring[${index}]`;
  if (!range || typeof range !== "object" || Array.isArray(range)) {
    throw new Error(`${label}: 必须是 {start,end}`);
  }
  const start = strictFiniteNumber(range.start, `${label}.start`);
  const end = strictFiniteNumber(range.end, `${label}.end`);
  if (start < 0) throw new Error(`${label}.start: 不能小于 0`);
  if (end <= start) throw new Error(`${label}: 需要 end > start`);
  if (end > totalDuration + EPSILON) {
    throw new Error(`${label}.end: ${end.toFixed(3)}s 超出成片 ${totalDuration.toFixed(3)}s`);
  }
  return { start, end };
}

function strictPositiveNumber(value, label) {
  const parsed = strictFiniteNumber(value, label);
  if (parsed <= 0) throw new Error(`${label}: 必须大于 0`);
  return parsed;
}

function strictFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}: 必须是有限数字`);
  }
  return value;
}
