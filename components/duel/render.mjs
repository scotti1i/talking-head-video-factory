import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  const choices = `<div class="duel-row"><div class="duel-bad" data-beat-item>${escapeHtml(beat.bad)}</div><div class="duel-good" data-beat-item>${escapeHtml(beat.good)}</div></div>`;
  return `${head}${choices}${body}`;
}
