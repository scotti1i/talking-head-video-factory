import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylePath = new URL("./public/style.css", import.meta.url);
const libraryPath = new URL("./public/library.css", import.meta.url);
const [styleCss, libraryCss] = await Promise.all([
  readFile(stylePath, "utf8"),
  readFile(libraryPath, "utf8"),
]);
const uiCss = `${styleCss}\n${libraryCss}`;

function token(name) {
  const match = styleCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `missing --${name}`);
  return match[1].trim();
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(value) {
  const hex = value.slice(1);
  const full = hex.length === 3
    ? [...hex].map((char) => `${char}${char}`).join("")
    : hex;
  const channels = full.match(/.{2}/g).map((part) => parseInt(part, 16));
  return channels.map(srgbToLinear);
}

function oklchToLinear(value) {
  const match = value.match(/oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)/);
  assert.ok(match, `unsupported color: ${value}`);
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const chroma = Number(match[3]);
  const hue = Number(match[4]) * Math.PI / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

function luminance(value) {
  const rgb = value.startsWith("#")
    ? hexToLinear(value)
    : oklchToLinear(value);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)]
    .sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function assertContrast(foreground, background, label, minimum = 4.5) {
  const ratio = contrast(token(foreground), token(background));
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1`);
}

function assertShadowCeiling(css, ceiling) {
  for (const match of css.matchAll(/box-shadow\s*:\s*([^;]+);/g)) {
    if (match[1].trim() === "none") continue;
    for (const layer of match[1].split(",")) {
      const lengths = [...layer.matchAll(/-?[\d.]+px/g)]
        .map((item) => Math.abs(Number(item[0].slice(0, -2))));
      const blur = lengths[2] ?? 0;
      assert.ok(blur <= ceiling, `shadow blur ${blur}px exceeds ${ceiling}px`);
    }
  }
}

test("Codex light tokens remain the single App palette", () => {
  assert.equal(token("dim"), "#68696f");
  assert.equal(token("warn"), "#925b00");
  assert.equal(token("info"), "#205dd8");
  assert.match(token("accent"), /^oklch\(0\.22\s/);
  assert.doesNotMatch(uiCss, /#f6c07f|#5f351c|0\.83\s+0\.09\s+70|0\.17\s+0\.014\s+65/i);
  assert.doesNotMatch(libraryCss, /#[0-9a-f]{3,8}|rgba?\(|oklch\(/i);
});

test("text and semantic colors meet WCAG AA", () => {
  assertContrast("text", "bg", "text on main");
  assertContrast("text-2", "surface", "secondary text on surface");
  assertContrast("dim", "inset", "placeholder on inset");
  assertContrast("accent-ink", "accent", "primary action");
  assertContrast("ok", "ok-soft", "success state");
  assertContrast("warn", "warn-soft", "warning state");
  assertContrast("bad", "bad-soft", "error state");
  assertContrast("info", "bg", "information link");
  assertContrast("control-line", "inset", "form control boundary", 3);
});

test("App chrome stays flat and restrained", () => {
  assert.doesNotMatch(uiCss, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(uiCss, /backdrop-filter\s*:/i);
  assertShadowCeiling(uiCss, 8);
  assert.ok(styleCss.split("\n").length <= 800);
  assert.ok(libraryCss.split("\n").length <= 800);
});
