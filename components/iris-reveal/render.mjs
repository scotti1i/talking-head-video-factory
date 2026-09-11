export function render(beat) {
  const centerX = bounded(beat.centerX, 0.5, 0, 1);
  const centerY = bounded(beat.centerY, 0.5, 0, 1);
  const revealDuration = bounded(beat.revealDuration, 0.22, 0.08, 0.5);
  const startScale = bounded(beat.startScale, 0.04, 0.01, 0.5);
  return `<div class="iris-reveal" data-iris-reveal data-reveal-duration="${revealDuration}" data-start-scale="${startScale}" style="--iris-x:${centerX * 100}%;--iris-y:${centerY * 100}%" data-layout-allow-overflow>
    <span class="iris-reveal-hole" data-iris-hole aria-hidden="true"></span>
  </div>`;
}

export function validate(beat) {
  const errors = [];
  for (const field of ["centerX", "centerY"]) {
    if (!Number.isFinite(beat[field]) || beat[field] < 0 || beat[field] > 1) errors.push(`${field} 必须是 0..1 的有限数字`);
  }
  if (beat.revealDuration != null && (!Number.isFinite(beat.revealDuration) || beat.revealDuration < 0.08 || beat.revealDuration > 0.5)) {
    errors.push("revealDuration 必须在 0.08..0.5 秒之间");
  }
  if (beat.startScale != null && (!Number.isFinite(beat.startScale) || beat.startScale < 0.01 || beat.startScale > 0.5)) {
    errors.push("startScale 必须在 0.01..0.5 之间");
  }
  return errors;
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
