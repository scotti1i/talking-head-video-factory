import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const steps = beat.steps.map((step, index) => stepMarkup(step, index)).join("");
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  return `${head}<div class="pipeline">${steps}</div>${body}`;
}

export function validate(beat) {
  return Array.isArray(beat.steps) ? [] : ["steps 必须是数组"];
}

function stepMarkup(step, index) {
  const number = String(index + 1).padStart(2, "0");
  return `<div data-beat-item><b>${number}</b><span>${escapeHtml(step)}</span></div>`;
}
