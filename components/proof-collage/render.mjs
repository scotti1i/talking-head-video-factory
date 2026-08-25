import { escapeHtml } from "../../scripts/lib.mjs";

const FOCUS_VALUES = new Set(["center", "top", "bottom", "left", "right"]);
const IMAGE_PATTERN = /\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/i;

export function render(beat) {
  const photos = beat.photos.map(normalizePhoto);
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  const photoHtml = photos.map((photo, index) => {
    const label = photo.label ? `<figcaption>${escapeHtml(photo.label)}</figcaption>` : "";
    const alt = photo.alt || `真实证明照片 ${index + 1}`;
    return `<figure class="proof-photo" role="listitem" data-proof-index="${index + 1}" data-focus="${photo.focus}" data-beat-item>
      <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(alt)}" decoding="sync" draggable="false" />
      ${label}
    </figure>`;
  }).join("");

  return `<div class="proof-collage proof-collage--${photos.length}" data-proof-count="${photos.length}">
    <header class="proof-collage-copy">
      <div class="kicker">${escapeHtml(beat.kicker)}</div>
      <h2>${escapeHtml(beat.title)}</h2>
      ${body}
    </header>
    <div class="proof-collage-grid" role="list" aria-label="${escapeHtml(beat.title)}">
      ${photoHtml}
    </div>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (!Array.isArray(beat.photos)) return ["photos 必须是数组"];
  if (beat.photos.length < 3 || beat.photos.length > 4) errors.push("photos 只允许 3–4 张");
  beat.photos.forEach((input, index) => {
    const photo = normalizePhoto(input);
    const label = `photos[${index}]`;
    if (!photo.src) errors.push(`${label}.src 不能为空`);
    if (photo.src && /^(?:https?:)?\/\//i.test(photo.src)) errors.push(`${label}.src 必须是冻结的本地素材`);
    if (photo.src && !IMAGE_PATTERN.test(photo.src)) errors.push(`${label}.src 必须是 png/jpg/webp/avif 图片`);
    if (!FOCUS_VALUES.has(photo.focus)) errors.push(`${label}.focus 必须是 center/top/bottom/left/right`);
    if (input && typeof input === "object" && !Array.isArray(input)) {
      if (input.alt != null && typeof input.alt !== "string") errors.push(`${label}.alt 必须是字符串`);
      if (input.label != null && typeof input.label !== "string") errors.push(`${label}.label 必须是字符串`);
    }
  });
  if (beat.body != null && typeof beat.body !== "string") errors.push("body 必须是字符串");
  return errors;
}

function normalizePhoto(input) {
  if (typeof input === "string") return { src: input.trim(), alt: "", label: "", focus: "center" };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { src: "", alt: "", label: "", focus: "center" };
  }
  return {
    src: String(input.src || "").trim(),
    alt: String(input.alt || "").trim(),
    label: String(input.label || "").trim(),
    focus: String(input.focus || "center").trim()
  };
}
