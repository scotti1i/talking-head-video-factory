import { escapeHtml } from "../../scripts/lib.mjs";

const IMAGE_PATTERN = /\.(?:png|jpe?g|webp|avif|svg)$/i;
const PLACEMENTS = new Set(["top-left", "top-right", "top-left-low", "top-right-low", "top-center", "center-lower"]);
const SIZES = new Set(["small", "medium", "large", "wide"]);
const SHAPES = new Set(["square", "rounded", "circle"]);

export function render(beat) {
  const placement = String(beat.placement || "top-center");
  const size = SIZES.has(String(beat.size || "")) ? String(beat.size) : "medium";
  const shape = SHAPES.has(String(beat.shape || "")) ? String(beat.shape) : "rounded";
  const hitOffset = normalizedOffset(beat.hitOffset);
  const alt = String(beat.alt || beat.title || beat.kicker || "解释图标").trim();
  return `<figure class="media-pop-sticker media-pop-sticker--${escapeHtml(placement)} media-pop-sticker--${escapeHtml(size)} media-pop-sticker--${escapeHtml(shape)}" data-media-pop-sticker data-placement="${escapeHtml(placement)}" data-hit-offset="${hitOffset}" data-layout-allow-overflow aria-hidden="true">
    <div class="media-pop-sticker-visual" data-media-pop-motion>
      <img src="${escapeHtml(beat.src)}" alt="${escapeHtml(alt)}" decoding="sync" draggable="false" />
    </div>
  </figure>`;
}

export function validate(beat) {
  const errors = [];
  const src = String(beat.src || "").trim();
  if (!src) errors.push("src 必须是非空本地图片路径");
  else {
    if (/^(?:https?:|data:|file:|\/\/)/i.test(src)) errors.push("src 必须是冻结在 job 内的本地图片");
    if (!IMAGE_PATTERN.test(src)) errors.push("src 必须是 png/jpg/webp/avif/svg 图片");
    if (src.includes("..") || !src.replaceAll("\\", "/").startsWith("assets/")) errors.push("src 必须位于 job assets/ 内");
  }
  if (!PLACEMENTS.has(String(beat.placement || ""))) errors.push("placement 必须是 top-left/top-right/top-left-low/top-right-low/top-center/center-lower");
  if (beat.size != null && !SIZES.has(String(beat.size))) errors.push("size 必须是 small/medium/large/wide");
  if (beat.shape != null && !SHAPES.has(String(beat.shape))) errors.push("shape 必须是 square/rounded/circle");
  if (beat.hitOffset != null) {
    if (typeof beat.hitOffset !== "number" || !Number.isFinite(beat.hitOffset) || beat.hitOffset < 0) {
      errors.push("hitOffset 必须是大于等于 0 的有限秒数");
    } else if (beat.hitOffset >= Number(beat.end) - Number(beat.start)) {
      errors.push("hitOffset 必须小于 beat 时长");
    }
  }
  return errors;
}

function normalizedOffset(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? String(Number(value.toFixed(3)))
    : "0";
}
