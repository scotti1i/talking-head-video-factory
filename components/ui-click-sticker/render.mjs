import { escapeHtml } from "../../scripts/lib.mjs";

const VARIANTS = new Set(["save", "follow"]);

const ICONS = {
  save: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 7h24v35L24 34 12 42V7Z"/></svg>`,
  follow: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="17" r="8"/><path d="M5 41c1-10 6-15 14-15s13 5 14 15M37 11v14M30 18h14"/></svg>`
};

export function render(beat) {
  const variant = String(beat.variant || "follow");
  const pressOffset = normalizedOffset(beat.pressOffset, 0.72);
  const kicker = typeof beat.kicker === "string" ? beat.kicker.trim() : "";
  const minimalClass = kicker ? "" : " ui-click-sticker--minimal";
  return `<div class="ui-click-sticker ui-click-sticker--${variant}${minimalClass}" data-ui-click-sticker data-variant="${variant}" data-press-offset="${pressOffset}" data-layout-allow-overflow>
    <div class="ui-click-surface" data-ui-click-motion>
      <span class="ui-click-icon" data-beat-item>${ICONS[variant]}</span>
      <span class="ui-click-copy">
        ${kicker ? `<small data-beat-item>${escapeHtml(kicker)}</small>` : ""}
        <strong class="ui-click-before" data-ui-before>${escapeHtml(beat.title)}</strong>
        <strong class="ui-click-after" data-ui-after>${escapeHtml(beat.afterText)}</strong>
      </span>
    </div>
    <svg class="ui-click-pointer" data-ui-pointer viewBox="0 0 92 112" aria-hidden="true"><path d="M12 8v79l20-20 15 36 20-9-16-34h28L12 8Z"/></svg>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (!VARIANTS.has(String(beat.variant || ""))) errors.push("variant 必须是 save/follow");
  if (beat.kicker != null && (typeof beat.kicker !== "string" || !beat.kicker.trim())) errors.push("kicker 提供时必须是非空字符串");
  if (typeof beat.title !== "string" || !beat.title.trim()) errors.push("title 必须是非空字符串");
  if (typeof beat.afterText !== "string" || !beat.afterText.trim()) errors.push("afterText 必须是非空字符串");
  if (beat.pressOffset != null) {
    if (typeof beat.pressOffset !== "number" || !Number.isFinite(beat.pressOffset) || beat.pressOffset < 0) {
      errors.push("pressOffset 必须是大于等于 0 的有限秒数");
    } else {
      const duration = Number(beat.end) - Number(beat.start);
      if (Number.isFinite(duration) && duration > 0 && beat.pressOffset >= duration) errors.push("pressOffset 必须小于 beat 时长");
    }
  }
  return errors;
}

function normalizedOffset(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(Number(value.toFixed(3))) : String(fallback);
}
