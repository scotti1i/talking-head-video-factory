import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const items = beat.items.map((item) => `<span data-beat-item>${escapeHtml(item)}</span>`).join("");
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  return `${head}<div class="panel-list">${items}</div>${body}`;
}

export function validate(beat) {
  return Array.isArray(beat.items) ? [] : ["items 必须是数组"];
}
