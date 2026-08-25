import fs from "node:fs";
import path from "node:path";

import { projectRoot, readJson } from "./lib.mjs";

export function loadWorkflowRegistry(root = projectRoot()) {
  const file = path.join(root, "profiles", "registry.json");
  const registry = readJson(file);
  validateRegistry(registry, file);
  return registry;
}

export function resolveWorkflowProfile(project, registry = loadWorkflowRegistry()) {
  const requested = String(project.profile || "").trim();
  const id = requested || registry.default;
  const profile = registry.profiles[id];
  if (!profile) {
    throw new Error(`未知内容 profile: ${id}（可用: ${Object.keys(registry.profiles).join(", ")}）`);
  }

  const policies = Array.isArray(project.policies) ? project.policies : [];
  const unknownPolicies = policies.filter((policy) => !registry.policies?.[policy]);
  if (unknownPolicies.length) {
    throw new Error(`未知平台 policy: ${unknownPolicies.join(", ")}`);
  }

  return {
    id,
    ...profile,
    policies,
    inferred: !requested
  };
}

export function profileIds(registry = loadWorkflowRegistry()) {
  return Object.keys(registry.profiles);
}

function validateRegistry(registry, file) {
  if (registry?.schemaVersion !== 1) throw new Error(`${file}: schemaVersion 必须为 1`);
  if (!registry.profiles || typeof registry.profiles !== "object") throw new Error(`${file}: 缺 profiles`);
  if (!registry.profiles[registry.default]) throw new Error(`${file}: default profile 不存在`);
  for (const [id, profile] of Object.entries(registry.profiles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`${file}: profile id 不合法 ${id}`);
    if (!profile.label || !profile.description) throw new Error(`${file}: ${id} 缺 label/description`);
    if (!Array.isArray(profile.requiredGates)) throw new Error(`${file}: ${id}.requiredGates 必须是数组`);
  }
  if (registry.policies && typeof registry.policies !== "object") throw new Error(`${file}: policies 必须是对象`);
}
