import { escapeHtml } from "../../scripts/lib.mjs";

const IMAGE_PATTERN = /\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/i;

export function render(beat) {
  const items = beat.items.map((item, index) => normalizeItem(item, index));
  const cards = items.map((item, index) => `<figure class="result-grid-card" role="listitem" data-result-index="${index + 1}">
    <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" decoding="sync" draggable="false" />
  </figure>`).join("");
  return `<div class="result-grid-surface" data-result-count="${items.length}">
    <div class="result-grid-board" role="list" aria-label="${escapeHtml(beat.title)}">
      ${cards}
    </div>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (!Array.isArray(beat.items)) return ["items 必须是数组"];
  if (beat.items.length < 6 || beat.items.length > 9) errors.push("items 只允许 6–9 项");
  beat.items.forEach((input, index) => {
    const item = normalizeItem(input, index);
    const label = `items[${index}]`;
    if (!item.src) errors.push(`${label}.src 不能为空`);
    if (item.src && /^(?:https?:)?\/\//i.test(item.src)) errors.push(`${label}.src 必须是冻结的本地素材`);
    if (item.src && !IMAGE_PATTERN.test(item.src)) errors.push(`${label}.src 必须是 png/jpg/webp/avif 图片`);
    if (!item.label) errors.push(`${label}.label 不能为空`);
  });
  return errors;
}

function normalizeItem(input, index) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { src: "", label: "", alt: `生成结果 ${index + 1}` };
  }
  return {
    src: String(input.src || "").trim(),
    label: String(input.label || "").trim(),
    alt: String(input.alt || input.label || `生成结果 ${index + 1}`).trim()
  };
}
