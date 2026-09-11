import { escapeHtml } from "../../scripts/lib.mjs";

const IMAGE_PATTERN = /\.(?:png|jpe?g|webp|avif|svg)$/i;
const VISUAL_SIZES = new Set(["default", "compact", "large"]);

export function render(beat) {
  const hitOffset = normalizedOffset(beat.hitOffset);
  const kicker = typeof beat.kicker === "string" ? beat.kicker.trim() : "";
  const visualSize = VISUAL_SIZES.has(String(beat.visualSize || "")) ? String(beat.visualSize) : "default";
  const crossedOut = beat.crossedOut === true;
  const alt = String(beat.alt || kicker || beat.title || "产品示意图").trim();
  const rootClasses = [
    "product-domain-pop",
    `product-domain-pop--${visualSize}`,
    kicker ? "" : "product-domain-pop--domain-only",
    crossedOut ? "product-domain-pop--crossed" : ""
  ].filter(Boolean).join(" ");
  return `<div class="${rootClasses}" data-product-domain-pop data-hit-offset="${hitOffset}" data-layout-allow-overflow>
    <div class="product-domain-banner" data-domain-motion>
      ${kicker ? `<span class="product-domain-kicker" data-beat-item>${escapeHtml(kicker)}</span>` : ""}
      <strong>${escapeHtml(beat.title)}</strong>
    </div>
    <figure class="product-domain-product" data-product-motion>
      <img src="${escapeHtml(beat.src)}" alt="${escapeHtml(alt)}" decoding="sync" draggable="false" />
      ${crossedOut ? `<span class="product-domain-cross" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="51"/><path d="M31 31 89 89M89 31 31 89"/></svg></span>` : ""}
    </figure>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (beat.kicker != null && (typeof beat.kicker !== "string" || !beat.kicker.trim())) errors.push("kicker 提供时必须是非空品类标签");
  if (typeof beat.title !== "string" || !beat.title.trim()) errors.push("title 必须是非空网址");
  if (typeof beat.src !== "string" || !beat.src.trim()) {
    errors.push("src 必须是非空本地图片路径");
  } else {
    const src = beat.src.trim();
    if (/^(?:https?:|data:|file:|\/\/)/i.test(src)) errors.push("src 必须是冻结在 job 内的本地图片");
    if (!IMAGE_PATTERN.test(src)) errors.push("src 必须是 png/jpg/webp/avif/svg 图片");
    if (src.includes("..") || !src.replaceAll("\\", "/").startsWith("assets/")) errors.push("src 必须位于 job assets/ 内");
  }
  if (beat.visualSize != null && !VISUAL_SIZES.has(String(beat.visualSize))) errors.push("visualSize 必须是 default/compact/large");
  if (beat.crossedOut != null && typeof beat.crossedOut !== "boolean") errors.push("crossedOut 必须是布尔值");
  validateOffset(beat, errors);
  return errors;
}

function validateOffset(beat, errors) {
  if (beat.hitOffset == null) return;
  if (typeof beat.hitOffset !== "number" || !Number.isFinite(beat.hitOffset) || beat.hitOffset < 0) {
    errors.push("hitOffset 必须是大于等于 0 的有限秒数");
    return;
  }
  const duration = Number(beat.end) - Number(beat.start);
  if (Number.isFinite(duration) && duration > 0 && beat.hitOffset >= duration) errors.push("hitOffset 必须小于 beat 时长");
}

function normalizedOffset(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(Number(value.toFixed(3))) : "0";
}
