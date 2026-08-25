import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./lib.mjs";

const ARCHIVE_PREFIX = "talking-head-video-factory/";

const SENSITIVE_CONTENT_PATTERNS = Object.freeze([
  ["GitHub token", /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["API key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["macOS home path", /\/Users\/[A-Za-z0-9._-]+\//],
  ["Windows home path", /[A-Z]:\\Users\\[^\\\r\n]+\\/i],
]);

export function loadPublicManifest(root = projectRoot()) {
  const manifestPath = path.join(root, "release", "public-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error(`不支持的公开清单版本: ${manifest.schemaVersion}`);
  if (!Array.isArray(manifest.rootFiles) || !Array.isArray(manifest.roots)) {
    throw new Error("公开清单必须声明 rootFiles 和 roots");
  }
  return manifest;
}

export function normalizeReleasePath(entry) {
  const normalized = entry.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized.startsWith(ARCHIVE_PREFIX)
    ? normalized.slice(ARCHIVE_PREFIX.length)
    : normalized;
}

export function assertPublicPaths(entries, manifest) {
  const forbidden = manifest.forbiddenPathPatterns.map((pattern) => new RegExp(pattern, "i"));
  const violations = [];
  for (const entry of entries) {
    const candidate = normalizeReleasePath(entry).replace(/\/$/, "");
    if (!candidate) continue;
    const allowed = manifest.rootFiles.includes(candidate)
      || manifest.roots.some((root) => candidate === root || candidate.startsWith(`${root}/`));
    if (!allowed) violations.push(`${candidate}: 不在公开白名单`);
    if (forbidden.some((pattern) => pattern.test(candidate))) {
      violations.push(`${candidate}: 命中禁止路径`);
    }
  }
  if (violations.length) throw new Error(`公开发布路径审计失败:\n${violations.join("\n")}`);
  return true;
}

export function findSensitiveLabels(content) {
  return SENSITIVE_CONTENT_PATTERNS
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => label);
}

export function assertPackageScriptTargets(packageJson, trackedFiles) {
  const tracked = new Set(trackedFiles.map(normalizeReleasePath));
  const missing = [];
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const targets = command.match(/(?:scripts|console|deploy)\/[A-Za-z0-9_./-]+\.(?:mjs|js|py|sh|ps1)/g) || [];
    for (const target of targets) {
      if (!tracked.has(target)) missing.push(`${name} -> ${target}`);
    }
  }
  if (missing.length) throw new Error(`package.json 引用了未发布文件:\n${missing.join("\n")}`);
  return true;
}

export function listTrackedFiles(root = projectRoot(), spawn = spawnSync) {
  const result = spawn("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer", stdio: "pipe" });
  if (result.error) throw new Error(`git 无法启动: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ls-files 失败: ${result.stderr?.toString("utf8") || "unknown"}`);
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

export function auditPublicRelease({ root = projectRoot(), spawn = spawnSync } = {}) {
  const manifest = loadPublicManifest(root);
  const files = listTrackedFiles(root, spawn);
  assertPublicPaths(files, manifest);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assertPackageScriptTargets(packageJson, files);

  const sensitive = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    const buffer = fs.readFileSync(absolute);
    if (buffer.includes(0)) continue;
    const labels = findSensitiveLabels(buffer.toString("utf8"));
    if (labels.length) sensitive.push(`${file}: ${labels.join(", ")}`);
  }
  if (sensitive.length) throw new Error(`公开发布内容审计失败:\n${sensitive.join("\n")}`);
  return { files: files.length, manifest };
}

export function main() {
  const result = auditPublicRelease();
  console.log(`公开发布审计通过: ${result.files} 个受控文件，0 个越界路径，0 个敏感内容命中。`);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
