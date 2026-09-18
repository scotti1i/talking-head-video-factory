import { fmtTime } from "../lib.mjs";

export const TRANSITION_TYPES = Object.freeze([
  "cut",
  "focus-dissolve",
  "whip-blur",
  "flash"
]);

const WHIP_DIRECTIONS = Object.freeze(["left", "right", "up", "down"]);
const EPSILON = 0.01;

const PRESETS = Object.freeze({
  "focus-dissolve": Object.freeze({ enter: 0.46, exit: 0.36, min: 0.15, max: 0.8 }),
  "whip-blur": Object.freeze({ enter: 0.17, exit: 0.17, min: 0.13, max: 0.2 }),
  flash: Object.freeze({ enter: 0.2, exit: 0, min: 0.15, max: 0.25 })
});

export function normalizeTransitionPreset(value, options = {}) {
  const label = String(options.label || "transition");
  const clipDuration = positiveNumber(options.clipDuration, `${label}: clipDuration`);
  if (value == null) return { type: "cut", enter: 0, exit: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: transition 必须是对象`);
  }

  const type = String(value.type || "cut");
  if (!TRANSITION_TYPES.includes(type)) {
    throw new Error(`${label}: transition.type 只能是 ${TRANSITION_TYPES.join("/")}`);
  }
  if (type === "cut") return { type, enter: 0, exit: 0 };

  const preset = PRESETS[type];
  const enterSource = value.enter ?? value.duration ?? preset.enter;
  const enterLabel = value.enter == null && value.duration != null
    ? `${label}.transition.duration`
    : `${label}.transition.enter`;
  const enter = transitionDuration(enterSource, enterLabel, preset);
  const exit = optionalTransitionDuration(
    value.exit ?? preset.exit,
    `${label}.transition.exit`,
    preset
  );
  if (enter + exit >= clipDuration - EPSILON) {
    throw new Error(`${label}: transition.enter + exit 必须小于 clip duration`);
  }

  if (type !== "whip-blur") return { type, enter, exit };
  const direction = String(value.direction || "left");
  if (!WHIP_DIRECTIONS.includes(direction)) {
    throw new Error(`${label}: transition.direction 只能是 ${WHIP_DIRECTIONS.join("/")}`);
  }
  return { type, enter, exit, direction };
}

export function renderTransitionPresetTimeline(item) {
  switch (item.transition.type) {
    case "focus-dissolve":
      return focusDissolveTimeline(item);
    case "whip-blur":
      return whipBlurTimeline(item);
    case "flash":
      return flashTimeline(item);
    default:
      return cutTimeline(item);
  }
}

export function needsFlashOverlay(transition) {
  return transition?.type === "flash";
}

export function renderTransitionPresetCss() {
  return `.primary-transition-flash { position: absolute; inset: 0; z-index: 12; opacity: 0; visibility: hidden; pointer-events: none; background: #fff; mix-blend-mode: screen; will-change: opacity; }`;
}

function cutTimeline(item) {
  return [
    `tl.set(videoWrap, { opacity: 0 }, ${fmtTime(item.start)});`,
    `tl.set(videoWrap, { opacity: 1 }, ${fmtTime(item.end)});`
  ].join("\n      ");
}

function focusDissolveTimeline(item) {
  const media = mediaSelector(item);
  const pip = pipSelector(item);
  const enter = item.transition.enter;
  const exit = item.transition.exit;
  const exitStart = item.end - exit;
  const pipEnter = Math.max(0.15, enter - 0.06);
  const lines = [
    `tl.set("${media}", { opacity: 0, scale: 1.018 }, 0);`,
    `tl.to(videoWrap, { opacity: 0, duration: ${fmtTime(enter)}, ease: "sine.inOut" }, ${fmtTime(item.start)});`,
    `tl.to("${media}", { opacity: 1, scale: 1, duration: ${fmtTime(enter)}, ease: "power3.out" }, ${fmtTime(item.start)});`
  ];
  if (item.speakerPip) {
    lines.push(`tl.set("${pip}", { opacity: 0, scale: 0.965 }, 0);`);
    lines.push(`tl.to("${pip}", { opacity: 1, scale: 1, duration: ${fmtTime(pipEnter)}, ease: "power3.out" }, ${fmtTime(item.start + 0.06)});`);
  }
  if (exit > 0) {
    lines.push(`tl.to("${media}", { opacity: 0, scale: 0.992, duration: ${fmtTime(exit)}, ease: "power2.inOut" }, ${fmtTime(exitStart)});`);
    if (item.speakerPip) {
      lines.push(`tl.to("${pip}", { opacity: 0, scale: 0.985, duration: ${fmtTime(exit)}, ease: "power2.inOut" }, ${fmtTime(exitStart)});`);
    }
    lines.push(`tl.to(videoWrap, { opacity: 1, duration: ${fmtTime(exit)}, ease: "sine.inOut" }, ${fmtTime(exitStart)});`);
  } else {
    lines.push(`tl.set(videoWrap, { opacity: 1 }, ${fmtTime(item.end)});`);
  }
  lines.push(`tl.set("${media}", { opacity: 0 }, ${fmtTime(item.end)});`);
  if (item.speakerPip) lines.push(`tl.set("${pip}", { opacity: 0 }, ${fmtTime(item.end)});`);
  return lines.join("\n      ");
}

function whipBlurTimeline(item) {
  const media = mediaSelector(item);
  const pip = pipSelector(item);
  const enter = item.transition.enter;
  const exit = item.transition.exit;
  const exitStart = item.end - exit;
  const motion = directionalMotion(item.transition.direction);
  const pipEnter = Math.max(0.13, enter - 0.04);
  const lines = [
    `tl.set("${media}", { opacity: 0, xPercent: ${motion.incomingX}, yPercent: ${motion.incomingY}, filter: "blur(18px)" }, 0);`,
    `tl.to(videoWrap, { opacity: 0, xPercent: ${motion.outgoingX}, yPercent: ${motion.outgoingY}, filter: "blur(16px)", duration: ${fmtTime(enter)}, ease: "power3.in" }, ${fmtTime(item.start)});`,
    `tl.to("${media}", { opacity: 1, xPercent: 0, yPercent: 0, filter: "blur(0px)", duration: ${fmtTime(enter)}, ease: "power3.out" }, ${fmtTime(item.start)});`,
    `tl.set(videoWrap, { xPercent: 0, yPercent: 0, filter: "none" }, ${fmtTime(item.start + enter)});`,
    `tl.set("${media}", { xPercent: 0, yPercent: 0, filter: "none" }, ${fmtTime(item.start + enter)});`
  ];
  if (item.speakerPip) {
    lines.push(`tl.set("${pip}", { opacity: 0, scale: 0.97 }, 0);`);
    lines.push(`tl.to("${pip}", { opacity: 1, scale: 1, duration: ${fmtTime(pipEnter)}, ease: "power3.out" }, ${fmtTime(item.start + 0.04)});`);
  }
  if (exit > 0) {
    lines.push(`tl.set(videoWrap, { opacity: 0, xPercent: ${motion.incomingX}, yPercent: ${motion.incomingY}, filter: "blur(16px)" }, ${fmtTime(exitStart)});`);
    lines.push(`tl.to("${media}", { opacity: 0, xPercent: ${motion.outgoingX}, yPercent: ${motion.outgoingY}, filter: "blur(18px)", duration: ${fmtTime(exit)}, ease: "power3.in" }, ${fmtTime(exitStart)});`);
    lines.push(`tl.to(videoWrap, { opacity: 1, xPercent: 0, yPercent: 0, filter: "blur(0px)", duration: ${fmtTime(exit)}, ease: "power3.out" }, ${fmtTime(exitStart)});`);
    if (item.speakerPip) {
      lines.push(`tl.to("${pip}", { opacity: 0, scale: 0.97, duration: ${fmtTime(exit)}, ease: "power2.in" }, ${fmtTime(exitStart)});`);
    }
  } else {
    lines.push(`tl.set(videoWrap, { opacity: 1 }, ${fmtTime(item.end)});`);
  }
  lines.push(`tl.set("${media}", { opacity: 0, xPercent: 0, yPercent: 0, filter: "none" }, ${fmtTime(item.end)});`);
  lines.push(`tl.set(videoWrap, { opacity: 1, xPercent: 0, yPercent: 0, filter: "none" }, ${fmtTime(item.end)});`);
  if (item.speakerPip) lines.push(`tl.set("${pip}", { opacity: 0, scale: 1 }, ${fmtTime(item.end)});`);
  return lines.join("\n      ");
}

function flashTimeline(item) {
  const media = mediaSelector(item);
  const pip = pipSelector(item);
  const flash = flashSelector(item);
  const lines = [
    `tl.set("${media}", { opacity: 0, filter: "none" }, 0);`,
    `tl.set("${flash}", { autoAlpha: 0 }, 0);`
  ];
  if (item.speakerPip) lines.push(`tl.set("${pip}", { opacity: 0, scale: 0.98 }, 0);`);
  lines.push(...flashEdge({
    from: "videoWrap",
    to: `"${media}"`,
    flash: `"${flash}"`,
    start: item.start,
    duration: item.transition.enter
  }));
  if (item.speakerPip) {
    lines.push(`tl.to("${pip}", { opacity: 1, scale: 1, duration: ${fmtTime(item.transition.enter * 0.6)}, ease: "power3.out" }, ${fmtTime(item.start + item.transition.enter * 0.4)});`);
  }
  if (item.transition.exit > 0) {
    const exitStart = item.end - item.transition.exit;
    lines.push(...flashEdge({
      from: `"${media}"`,
      to: "videoWrap",
      flash: `"${flash}"`,
      start: exitStart,
      duration: item.transition.exit
    }));
    if (item.speakerPip) {
      lines.push(`tl.to("${pip}", { opacity: 0, scale: 0.98, duration: ${fmtTime(item.transition.exit * 0.4)}, ease: "power2.in" }, ${fmtTime(exitStart)});`);
    }
  }
  lines.push(`tl.set("${media}", { opacity: 0, filter: "none" }, ${fmtTime(item.end)});`);
  lines.push(`tl.set(videoWrap, { opacity: 1, filter: "none" }, ${fmtTime(item.end)});`);
  lines.push(`tl.set("${flash}", { autoAlpha: 0 }, ${fmtTime(item.end)});`);
  if (item.speakerPip) lines.push(`tl.set("${pip}", { opacity: 0, scale: 1 }, ${fmtTime(item.end)});`);
  return lines.join("\n      ");
}

function flashEdge({ from, to, flash, start, duration }) {
  const rise = duration * 0.4;
  const fall = duration - rise;
  const switchAt = start + rise;
  return [
    `tl.to(${from}, { filter: "brightness(1.35)", duration: ${fmtTime(rise)}, ease: "power2.in" }, ${fmtTime(start)});`,
    `tl.to(${flash}, { autoAlpha: 0.96, duration: ${fmtTime(rise)}, ease: "power2.in" }, ${fmtTime(start)});`,
    `tl.set(${from}, { opacity: 0, filter: "none" }, ${fmtTime(switchAt)});`,
    `tl.set(${to}, { opacity: 1, filter: "brightness(1.25)" }, ${fmtTime(switchAt)});`,
    `tl.to(${to}, { filter: "brightness(1)", duration: ${fmtTime(fall)}, ease: "power2.out" }, ${fmtTime(switchAt)});`,
    `tl.to(${flash}, { autoAlpha: 0, duration: ${fmtTime(fall)}, ease: "power2.out" }, ${fmtTime(switchAt)});`,
    `tl.set(${to}, { filter: "none" }, ${fmtTime(start + duration)});`,
    `tl.set(${flash}, { autoAlpha: 0 }, ${fmtTime(start + duration)});`
  ];
}

function mediaSelector(item) {
  return `#primary-demo-${item.id}`;
}

function pipSelector(item) {
  return `#primary-demo-pip-${item.id}`;
}

function flashSelector(item) {
  return `#primary-transition-flash-${item.id}`;
}

function directionalMotion(direction) {
  switch (direction) {
    case "right":
      return { incomingX: -6, incomingY: 0, outgoingX: 4, outgoingY: 0 };
    case "up":
      return { incomingX: 0, incomingY: 6, outgoingX: 0, outgoingY: -4 };
    case "down":
      return { incomingX: 0, incomingY: -6, outgoingX: 0, outgoingY: 4 };
    default:
      return { incomingX: 6, incomingY: 0, outgoingX: -4, outgoingY: 0 };
  }
}

function transitionDuration(value, label, preset) {
  const number = positiveNumber(value, label);
  if (number < preset.min || number > preset.max) {
    throw new Error(`${label}: 必须在 ${preset.min}..${preset.max} 秒`);
  }
  return number;
}

function optionalTransitionDuration(value, label, preset) {
  const number = finiteNumber(value, label);
  if (number === 0) return 0;
  return transitionDuration(number, label, preset);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}: 必须是有限数字`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new Error(`${label}: 必须大于 0`);
  return number;
}
