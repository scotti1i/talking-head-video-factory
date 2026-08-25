import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  return `${head}<div class="hero-number">${escapeHtml(beat.number)}</div>${body}`;
}
