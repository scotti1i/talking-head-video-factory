import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  return `<div class="topline-label" data-layout-allow-overflow>
    <span class="topline-label-kicker">${escapeHtml(beat.kicker)}</span>
    <strong class="topline-label-title">${escapeHtml(beat.title)}</strong>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (typeof beat.kicker !== "string" || !beat.kicker.trim()) errors.push("kicker 必须是非空字符串");
  if (typeof beat.title !== "string" || !beat.title.trim()) errors.push("title 必须是非空字符串");
  return errors;
}
