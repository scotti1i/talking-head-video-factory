import { escapeHtml } from "../../scripts/lib.mjs";

const PLACEMENTS = new Set(["top-center", "center", "bottom-center"]);
const TONES = new Set(["green", "yellow", "white"]);

export function render(beat) {
  const placement = PLACEMENTS.has(String(beat.placement)) ? String(beat.placement) : "top-center";
  const tone = TONES.has(String(beat.tone)) ? String(beat.tone) : "green";
  const hitOffset = normalized(beat.hitOffset, 0.1);
  const staggerFrames = Math.round(bounded(beat.staggerFrames, 2, 1, 6));
  const title = String(beat.title || "").trim();
  const quoted = beat.quoted === true;
  const glyphs = Array.from(quoted ? `“${title}”` : title)
    .map((glyph, index) => glyph === " "
      ? `<span class="keyword-burst-space" aria-hidden="true">&nbsp;</span>`
      : `<span class="keyword-burst-glyph" data-keyword-glyph style="--glyph-index:${index}">${escapeHtml(glyph)}</span>`)
    .join("");
  const kicker = typeof beat.kicker === "string" && beat.kicker.trim()
    ? `<small class="keyword-burst-kicker" data-keyword-kicker data-layout-allow-overlap>${escapeHtml(beat.kicker)}</small>`
    : "";
  return `<div class="keyword-burst keyword-burst--${placement} keyword-burst--${tone}" data-keyword-burst data-hit-offset="${hitOffset}" data-stagger-frames="${staggerFrames}" data-layout-allow-overflow data-layout-allow-overlap>
    ${kicker}
    <strong class="keyword-burst-word" aria-label="${escapeHtml(title)}" data-layout-allow-overlap>${glyphs}</strong>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (typeof beat.title !== "string" || !beat.title.trim()) errors.push("title 必须是非空字符串");
  if (!PLACEMENTS.has(String(beat.placement || ""))) errors.push("placement 必须是 top-center/center/bottom-center");
  if (beat.tone != null && !TONES.has(String(beat.tone))) errors.push("tone 必须是 green/yellow/white");
  if (beat.quoted != null && typeof beat.quoted !== "boolean") errors.push("quoted 必须是布尔值");
  if (beat.hitOffset != null && (!Number.isFinite(beat.hitOffset) || beat.hitOffset < 0)) errors.push("hitOffset 必须是大于等于 0 的有限秒数");
  if (beat.staggerFrames != null && (!Number.isInteger(beat.staggerFrames) || beat.staggerFrames < 1 || beat.staggerFrames > 6)) {
    errors.push("staggerFrames 必须是 1..6 的整数");
  }
  return errors;
}

function normalized(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(Number(value.toFixed(3))) : String(fallback);
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
