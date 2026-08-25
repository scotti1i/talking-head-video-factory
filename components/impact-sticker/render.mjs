import { escapeHtml } from "../../scripts/lib.mjs";

const VARIANTS = new Set(["question", "reject", "pivot", "action", "identity", "cta"]);
const ICONS = new Set(["package", "shipping", "clock", "source", "track", "lift", "message", "none"]);
const DEFAULT_ICON = {
  question: "none",
  reject: "none",
  pivot: "clock",
  action: "track",
  identity: "source",
  cta: "message"
};

const ICON_MARKUP = {
  package: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="m8 15 16-8 16 8v19l-16 8-16-8V15Z"/><path d="m8 15 16 8 16-8M24 23v19M16 11l16 8"/></svg>`,
  shipping: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M5 13h25v22H5V13Zm25 8h7l6 8v6H30V21Z"/><path d="M34 25h5M9 35h30"/><circle cx="13" cy="36" r="4"/><circle cx="36" cy="36" r="4"/></svg>`,
  clock: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="18"/><path d="M24 13v12l8 5M16 5l-5 5M32 5l5 5"/></svg>`,
  source: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="7"/><path d="M24 2v9M24 37v9M2 24h9M37 24h9"/></svg>`,
  track: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M7 13h25M7 24h34M7 35h25"/><path d="m28 7 7 6-7 6M28 29l7 6-7 6"/></svg>`,
  lift: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M9 38h30M15 32h18v6H15zM24 31V9"/><path d="m17 16 7-7 7 7M11 24v8M37 24v8"/></svg>`,
  message: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M7 9h34v25H20L10 42v-8H7V9Z"/><path d="M15 18h18M15 25h12"/></svg>`
};

export function render(beat) {
  const variant = String(beat.variant || "action");
  const icon = String(beat.icon || DEFAULT_ICON[variant] || "none");
  const hitOffset = normalizedHitOffset(beat.hitOffset);
  const strike = beat.strike === true;
  const iconClass = icon === "none" ? " impact-sticker--iconless" : "";
  const strikeClass = strike ? " impact-sticker--struck" : "";
  const compactTitleClass = Array.from(String(beat.title || "").trim()).length > 24
    ? " impact-sticker--compact-title"
    : "";
  const mark = icon === "none"
    ? ""
    : `<span class="impact-sticker-mark" data-beat-item aria-hidden="true">${ICON_MARKUP[icon]}</span>`;
  const strikeMarkup = strike
    ? `<span class="impact-sticker-strike" data-impact-strike data-beat-item aria-hidden="true"></span>`
    : "";

  return `<div class="impact-sticker impact-sticker--${variant}${iconClass}${strikeClass}${compactTitleClass}" data-variant="${variant}" data-icon="${icon}" data-hit-offset="${hitOffset}" data-landing-frames="5" data-layout-allow-overflow>
    <div class="impact-sticker-surface" data-impact-motion>
      ${mark}
      <div class="impact-sticker-copy">
        <div class="kicker impact-sticker-kicker" data-beat-item>${escapeHtml(beat.kicker)}</div>
        <h2 class="impact-sticker-title">${escapeHtml(beat.title)}${strikeMarkup}</h2>
      </div>
    </div>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  const variant = String(beat.variant || "");
  if (!VARIANTS.has(variant)) errors.push("variant 必须是 question/reject/pivot/action/identity/cta");
  if (typeof beat.kicker !== "string" || !beat.kicker.trim()) errors.push("kicker 必须是非空字符串");
  if (typeof beat.title !== "string" || !beat.title.trim()) errors.push("title 必须是非空字符串");
  if (beat.icon != null && !ICONS.has(String(beat.icon))) {
    errors.push("icon 必须是 package/shipping/clock/source/track/lift/message/none");
  }
  if (beat.strike != null && typeof beat.strike !== "boolean") errors.push("strike 必须是布尔值");
  if (beat.strike === true && variant !== "reject") errors.push("strike 只用于 reject variant");
  if (beat.hitOffset != null) {
    if (typeof beat.hitOffset !== "number" || !Number.isFinite(beat.hitOffset) || beat.hitOffset < 0) {
      errors.push("hitOffset 必须是大于等于 0 的有限秒数");
    } else {
      const duration = Number(beat.end) - Number(beat.start);
      if (Number.isFinite(duration) && duration > 0 && beat.hitOffset >= duration) {
        errors.push("hitOffset 必须小于 beat 时长");
      }
    }
  }
  return errors;
}

function normalizedHitOffset(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "0";
  return String(Number(value.toFixed(3)));
}
