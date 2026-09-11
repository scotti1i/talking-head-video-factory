import fs from "node:fs";
import path from "node:path";

import { projectRoot, readJson } from "./lib.mjs";

export function loadArollBeautyRegistry(root = projectRoot()) {
  const file = path.join(root, "aroll-beauty", "registry.json");
  if (!fs.existsSync(file)) throw new Error(`缺少 A-roll 美颜预设注册表: ${file}`);
  const registry = readJson(file);
  if (!registry?.presets || typeof registry.presets !== "object") {
    throw new Error("A-roll 美颜预设注册表缺少 presets");
  }
  return registry;
}

export function resolveArollBeautyPreset(id, registry = loadArollBeautyRegistry()) {
  const presetId = String(id || registry.default || "").trim();
  const preset = registry.presets[presetId];
  if (!preset) throw new Error(`未知 A-roll 美颜预设: ${presetId}`);
  validatePreset(preset, presetId);
  return { id: presetId, ...preset };
}

export function buildArollBeautyFilter(preset) {
  validatePreset(preset, preset.id || "preset");
  const c = preset.colorBalance;
  const t = preset.tone;
  const b = preset.bilateral;
  const u = preset.unsharp;
  return [
    `colorbalance=rm=${c.redMidtones}:gm=${c.greenMidtones}:bm=${c.blueMidtones}:rh=${c.redHighlights}:bh=${c.blueHighlights}:pl=${c.preserveLightness ? 1 : 0}`,
    `eq=brightness=${t.brightness}:contrast=${t.contrast}:saturation=${t.saturation}:gamma=${t.gamma}:gamma_weight=${t.gammaWeight}`,
    `bilateral=sigmaS=${b.sigmaS}:sigmaR=${b.sigmaR}:planes=${b.planes}`,
    `unsharp=${u.lumaMatrixX}:${u.lumaMatrixY}:${u.lumaAmount}:${u.chromaMatrixX}:${u.chromaMatrixY}:${u.chromaAmount}`
  ].join(",");
}

function validatePreset(preset, label) {
  if (!preset || typeof preset !== "object") throw new Error(`${label}: preset 必须是对象`);
  requireNumbers(preset.colorBalance, ["redMidtones", "greenMidtones", "blueMidtones", "redHighlights", "blueHighlights"], `${label}.colorBalance`);
  requireNumbers(preset.tone, ["brightness", "contrast", "saturation", "gamma", "gammaWeight"], `${label}.tone`);
  requireNumbers(preset.bilateral, ["sigmaS", "sigmaR", "planes"], `${label}.bilateral`);
  requireNumbers(preset.unsharp, ["lumaMatrixX", "lumaMatrixY", "lumaAmount", "chromaMatrixX", "chromaMatrixY", "chromaAmount"], `${label}.unsharp`);
}

function requireNumbers(value, keys, label) {
  if (!value || typeof value !== "object") throw new Error(`${label}: 必须是对象`);
  for (const key of keys) {
    if (!Number.isFinite(Number(value[key]))) throw new Error(`${label}.${key}: 必须是数字`);
  }
}
