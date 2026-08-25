import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  const actions = `<div class="cta-row"><span data-beat-item>${escapeHtml(beat.primary)}</span><span data-beat-item>${escapeHtml(beat.secondary)}</span></div>`;
  return `${head}${body}${actions}`;
}
