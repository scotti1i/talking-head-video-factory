import { escapeHtml } from "../../scripts/lib.mjs";

export function render(beat) {
  const body = beat.body ? `<p>${escapeHtml(beat.body)}</p>` : "";
  const handle = beat.handle
    ? `<span class="cta-badge-handle" data-beat-item>${escapeHtml(beat.handle)}</span>`
    : "";
  return `<div class="cta-badge">
    <span class="cta-badge-mark" data-beat-item aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><path d="M12 36 36 12M19 12h17v17"/></svg></span>
    <div class="cta-badge-copy">
      <div class="kicker">${escapeHtml(beat.kicker)}</div>
      <h2>${escapeHtml(beat.title)}</h2>
      <strong data-beat-item>${escapeHtml(beat.action)}</strong>
      ${body}
    </div>
    ${handle}
  </div>`;
}

export function validate(beat) {
  const errors = [];
  if (typeof beat.action !== "string" || !beat.action.trim()) errors.push("action 必须是非空字符串");
  if (beat.handle != null && (typeof beat.handle !== "string" || !beat.handle.trim())) {
    errors.push("handle 必须是非空字符串");
  }
  if (beat.body != null && typeof beat.body !== "string") errors.push("body 必须是字符串");
  return errors;
}
