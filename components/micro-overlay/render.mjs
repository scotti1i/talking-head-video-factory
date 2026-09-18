import { escapeHtml } from "../../scripts/lib.mjs";

const VARIANTS = new Set(["locator", "action", "question"]);
const ICONS = new Set(["pin", "package", "inspect", "track", "question"]);
const DEFAULT_ICON = {
  locator: "pin",
  action: "track",
  question: "question"
};

const ICON_MARKUP = {
  pin: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 43s13-12.1 13-25A13 13 0 0 0 11 18c0 12.9 13 25 13 25Z"/><circle cx="24" cy="18" r="5"/></svg>`,
  package: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="m8 15 16-8 16 8v19l-16 8-16-8V15Z"/><path d="m8 15 16 8 16-8M24 23v19M16 11l16 8"/></svg>`,
  inspect: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="21" cy="21" r="12"/><path d="m30 30 11 11M16 21l4 4 7-8"/></svg>`,
  track: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M7 13h25M7 24h34M7 35h25"/><path d="m28 7 7 6-7 6M28 29l7 6-7 6"/></svg>`,
  question: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="18"/><path d="M18.5 18.5a6 6 0 1 1 8.7 5.4c-2.1 1.2-3.2 2.4-3.2 5.1M24 35h.01"/></svg>`
};

export function render(beat) {
  const variant = String(beat.variant || "action");
  const icon = String(beat.icon || DEFAULT_ICON[variant] || "track");
  const body = beat.body
    ? `<p data-beat-item>${escapeHtml(beat.body)}</p>`
    : "";
  const items = Array.isArray(beat.items)
    ? `<div class="micro-question-stack">${beat.items
      .map((item, index) => `<span data-beat-item data-question-index="${index + 1}">${escapeHtml(item)}</span>`)
      .join("")}</div>`
    : "";

  return `<div class="micro-overlay micro-overlay--${variant}" data-variant="${variant}">
    <span class="micro-overlay-mark" data-beat-item data-layout-allow-overflow>${ICON_MARKUP[icon]}</span>
    <div class="micro-overlay-copy">
      <div class="kicker">${escapeHtml(beat.kicker)}</div>
      <h2>${escapeHtml(beat.title)}</h2>
      ${body}
      ${items}
    </div>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  const variant = String(beat.variant || "");
  if (!VARIANTS.has(variant)) errors.push("variant 必须是 locator/action/question");
  if (beat.icon != null && !ICONS.has(String(beat.icon))) {
    errors.push("icon 必须是 pin/package/inspect/track/question");
  }
  if (beat.body != null && typeof beat.body !== "string") errors.push("body 必须是字符串");
  if (beat.items != null) {
    if (!Array.isArray(beat.items)) {
      errors.push("items 必须是字符串数组");
    } else {
      if (beat.items.length < 2 || beat.items.length > 3) errors.push("items 只允许 2–3 个问题");
      if (beat.items.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push("items 只能包含非空字符串");
      }
      if (variant !== "question") errors.push("items 只用于 question variant");
    }
  }
  return errors;
}
