import path from "node:path";

import { projectRoot, readJson } from "./lib.mjs";

export function loadFineCutRegistry(root = projectRoot()) {
  const file = path.join(root, "fine-cut", "registry.json");
  const registry = readJson(file);
  validateRegistry(registry, file);
  return registry;
}

export function resolveFineCutPreset(project, registry = loadFineCutRegistry()) {
  const requested = String(project?.editorial?.fineCutPreset || registry.default).trim();
  const preset = registry.presets[requested];
  if (!preset) {
    throw new Error(`未知精剪预设: ${requested}（可用: ${Object.keys(registry.presets).join(", ")}）`);
  }
  return { id: requested, ...preset };
}

function validateRegistry(registry, file) {
  if (registry?.schemaVersion !== 1) throw new Error(`${file}: schemaVersion 必须为 1`);
  if (!registry.presets || typeof registry.presets !== "object") throw new Error(`${file}: 缺 presets`);
  if (!registry.presets[registry.default]) throw new Error(`${file}: default preset 不存在`);
  for (const [id, preset] of Object.entries(registry.presets)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`${file}: preset id 不合法 ${id}`);
    if (!preset.label || !preset.description) throw new Error(`${file}: ${id} 缺 label/description`);
    const minimum = Number(preset.breathSeconds?.min);
    const maximum = Number(preset.breathSeconds?.max);
    if (!(minimum >= 0 && maximum >= minimum)) throw new Error(`${file}: ${id}.breathSeconds 非法`);
    if (preset.allowSentenceReorder !== false || preset.allowUniqueScriptDeletion !== false) {
      throw new Error(`${file}: ${id} 不得允许重排句子或删除原稿独有内容`);
    }
  }
}
