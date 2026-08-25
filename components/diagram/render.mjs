import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  const center = `<div class="center">${escapeHtml(beat.center || "Agent")}</div>`;
  const nodes = beat.nodes.map((node, index) => nodeMarkup(node, index)).join("");
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  return `${head}<div class="diagram">${center}${nodes}</div>${body}`;
}

export function validate(beat) {
  return Array.isArray(beat.nodes) ? [] : ["nodes 必须是数组"];
}

function nodeMarkup(node, index) {
  return `<span class="node node-${index}" data-beat-item>${escapeHtml(node)}</span>`;
}
