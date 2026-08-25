import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const head = `<div class="kicker">${escapeHtml(beat.kicker)}</div><h2>${escapeHtml(beat.title)}</h2>`;
  return `${head}<div class="split-grid">${side(beat.left, "left")}<div class="vs">VS</div>${side(beat.right, "right")}</div>`;
}

export function validate(beat) {
  return ["left", "right"].flatMap((name) => {
    const value = beat[name];
    return value?.label && value?.title && Array.isArray(value?.lines)
      ? []
      : [`${name} 需要 {label, title, lines[]}`];
  });
}

function side(value, name) {
  const lines = value.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  return `<div class="split-side ${name}" data-beat-item><small>${escapeHtml(value.label)}</small><b>${escapeHtml(value.title)}</b>${lines}</div>`;
}
