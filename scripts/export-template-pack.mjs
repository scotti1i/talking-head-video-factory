import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs, projectRoot, readJson, writeJson } from "./lib.mjs";
import { loadTemplatePack } from "./template-pack.mjs";

const args = parseArgs();
const root = projectRoot();
const packId = String(args.pack || "").trim();
if (!packId) throw new Error("用法: node scripts/export-template-pack.mjs --pack <id>");

const pack = loadTemplatePack(packId, root);
const bundleName = `${pack.id}-${pack.version}`;
const exportRoot = path.join(root, "exports", "template-packs", bundleName);
if (fs.existsSync(exportRoot)) throw new Error(`导出目录已存在，拒绝覆盖: ${exportRoot}`);

const payloadRoot = path.join(exportRoot, "payload");
fs.mkdirSync(payloadRoot, { recursive: true });

copyTree(
  path.join(root, "template-packs", pack.id),
  path.join(payloadRoot, "template-packs", pack.id)
);

const themeRoot = path.join(root, "themes", pack.theme);
const theme = readJson(path.join(themeRoot, "theme.json"));
for (const file of ["theme.json", "overrides.css", "preview.jpg"]) {
  const source = path.join(themeRoot, file);
  if (fs.existsSync(source)) copyFile(source, path.join(payloadRoot, "themes", pack.theme, file));
}

for (const font of theme.fonts || []) {
  copyFile(
    path.join(root, "themes", "_shared", "fonts", font.file),
    path.join(payloadRoot, "themes", "_shared", "fonts", font.file)
  );
}

for (const component of pack.components || []) {
  copyTree(
    path.join(root, "components", component),
    path.join(payloadRoot, "components", component)
  );
}

const portableRoot = path.join(root, "template-packs", pack.id, "portable");
for (const file of ["Install-TemplatePack.ps1", "Verify-Bundle.ps1"]) {
  copyFile(path.join(portableRoot, file), path.join(exportRoot, file));
}
copyFile(path.join(root, "template-packs", pack.id, "README.md"), path.join(exportRoot, "README.md"));

const manifest = {
  bundleSchemaVersion: 1,
  id: pack.id,
  version: pack.version,
  createdAt: new Date().toISOString(),
  label: `${pack.label}便携模板包`,
  target: "talking-head-video-factory",
  presetMapping: pack.requiredWorkflow,
  requires: {
    node: ">=22",
    profile: "factory-acquisition",
    fineCutPreset: "social-fast",
    beautyPreset: "factory-neutral-skin-v1",
    capabilities: ["caption-voice-qa", "dialogue-continuity-qa", "face-zoom-attack-release", "template-asset-staging"]
  },
  payload: {
    templatePack: `template-packs/${pack.id}`,
    theme: `themes/${pack.theme}`,
    components: (pack.components || []).map((id) => `components/${id}`),
    fonts: (theme.fonts || []).map((font) => `themes/_shared/fonts/${font.file}`)
  },
  originalAssets: {
    synthesizedSfx: 8,
    genericSvgStickers: 2,
    containsThirdPartyBgm: false,
    containsRedistributedThirdPartySfx: false
  },
  privacy: {
    containsCustomerMedia: false,
    containsOriginalVideo: false,
    containsScriptOrTranscript: false,
    containsDeliveryVideo: false,
    containsCredentials: false
  }
};
writeJson(path.join(exportRoot, "manifest.json"), manifest);

const files = listFiles(exportRoot)
  .filter((file) => path.basename(file) !== "SHA256SUMS.txt")
  .sort((a, b) => a.localeCompare(b, "en"));
const sums = files.map((file) => {
  const relative = path.relative(exportRoot, file).replaceAll(path.sep, "/");
  return `${sha256(file)}\t${relative}`;
});
fs.writeFileSync(path.join(exportRoot, "SHA256SUMS.txt"), `${sums.join("\n")}\n`, "utf8");

console.log(`Exported ${pack.id} ${pack.version}`);
console.log(`Files: ${files.length}`);
console.log(`Bundle: ${exportRoot}`);

function copyTree(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`缺少目录: ${source}`);
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (["reference", "portable"].includes(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFile(from, to);
  }
}

function copyFile(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`缺少文件: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(resolved));
    else if (entry.isFile()) files.push(resolved);
  }
  return files;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
