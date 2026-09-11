import { escapeHtml } from "../../scripts/lib.mjs";

const TONES = new Set(["green", "yellow", "pink"]);

export function render(beat) {
  const tone = TONES.has(String(beat.tone)) ? String(beat.tone) : "green";
  const hitOffset = normalizedOffset(beat.hitOffset, 0.12);
  return `<div class="hook-stack-banner hook-stack-banner--${tone}" data-hook-stack-banner data-hit-offset="${hitOffset}" data-layout-allow-overflow>
    <div class="hook-stack-line hook-stack-kicker" data-hook-layer="kicker">${escapeHtml(beat.kicker)}</div>
    <div class="hook-stack-line hook-stack-title" data-hook-layer="title">${escapeHtml(beat.title)}</div>
    <div class="hook-stack-line hook-stack-value" data-hook-layer="value">${escapeHtml(beat.value)}</div>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  for (const field of ["kicker", "title", "value"]) {
    if (typeof beat[field] !== "string" || !beat[field].trim()) errors.push(`${field} 必须是非空字符串`);
  }
  if (beat.tone != null && !TONES.has(String(beat.tone))) errors.push("tone 必须是 green/yellow/pink");
  if (beat.hitOffset != null && (!Number.isFinite(beat.hitOffset) || beat.hitOffset < 0)) {
    errors.push("hitOffset 必须是大于等于 0 的有限秒数");
  }
  return errors;
}

function normalizedOffset(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? String(Number(value.toFixed(3)))
    : String(fallback);
}
