import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot, readJson, writeJson } from "./lib.mjs";

const DEFAULT_SOURCE = (process.env.SHOTCRAFT_SOURCE || (process.env.HOME || "") + "/.codex/skills/video-shotcraft");
const VENDOR_RELATIVE = "vendor/video-shotcraft/ink-press";

export function vendorShotcraft({ source = DEFAULT_SOURCE, root = projectRoot() } = {}) {
  const sourceRoot = path.resolve(source);
  const sourceTemplate = path.join(sourceRoot, "template");
  const target = path.join(root, VENDOR_RELATIVE);
  if (!fs.existsSync(path.join(sourceTemplate, "TEMPLATE.md"))) {
    throw new Error(`不是可用的 Shotcraft 模板目录: ${sourceTemplate}`);
  }
  if (fs.existsSync(target)) {
    throw new Error(`目标已存在，拒绝覆盖只读上游基线: ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(sourceTemplate, target, {
    recursive: true,
    filter: (file) => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}out${path.sep}`)
  });
  fs.copyFileSync(path.join(sourceRoot, "LICENSE"), path.join(root, "vendor", "video-shotcraft", "LICENSE"));
  const library = readJson(path.join(sourceRoot, "gallery", "api", "library.json"));
  const provenance = {
    schemaVersion: 1,
    source: "https://github.com/Vincentwei1021/video-shotcraft",
    revision: library.revision,
    libraryGeneratedAt: library.generatedAt,
    license: "Apache-2.0",
    licenseFile: "../LICENSE",
    family: "Ink Press / AiflPromo",
    policy: "pristine-upstream-baseline-do-not-edit",
    files: hashFiles(target)
  };
  writeJson(path.join(target, "PROVENANCE.json"), provenance);
  return { target, provenance };
}

export function verifyVendoredShotcraft({ root = projectRoot() } = {}) {
  const target = path.join(root, VENDOR_RELATIVE);
  const provenancePath = path.join(target, "PROVENANCE.json");
  if (!fs.existsSync(provenancePath)) return { ok: false, failures: [`缺少 ${provenancePath}`] };
  const provenance = readJson(provenancePath);
  const current = new Map(hashFiles(target).map((item) => [item.path, item.sha256]));
  const expected = new Map((provenance.files || []).map((item) => [item.path, item.sha256]));
  const failures = [];
  for (const [file, hash] of expected) {
    if (!current.has(file)) failures.push(`上游文件被删除: ${file}`);
    else if (current.get(file) !== hash) failures.push(`上游文件被修改: ${file}`);
  }
  for (const file of current.keys()) if (!expected.has(file)) failures.push(`上游目录出现未登记文件: ${file}`);
  const license = path.join(root, "vendor", "video-shotcraft", "LICENSE");
  if (!fs.existsSync(license)) failures.push("缺少 Apache-2.0 LICENSE");
  return { ok: failures.length === 0, failures, fileCount: expected.size, revision: provenance.revision };
}

function hashFiles(dir) {
  return walk(dir)
    .filter((file) => path.basename(file) !== "PROVENANCE.json")
    .map((file) => ({
      path: path.relative(dir, file).split(path.sep).join(path.posix.sep),
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function main(argv = process.argv.slice(2)) {
  const [command = "verify", ...rest] = argv;
  const args = parseArgs(rest);
  if (command === "sync") {
    const result = vendorShotcraft({ source: args.source || DEFAULT_SOURCE });
    console.log(`已直接移植 Shotcraft ${result.provenance.family}: ${result.target}`);
    console.log(`上游 revision ${result.provenance.revision} · ${result.provenance.files.length} 个文件已锁定`);
    return;
  }
  if (command !== "verify") throw new Error(`未知命令 ${command}；可用 sync/verify`);
  const result = verifyVendoredShotcraft();
  if (!result.ok) {
    console.error(`Shotcraft 上游基线校验失败:\n- ${result.failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Shotcraft 上游基线通过: revision ${result.revision} · ${result.fileCount} 文件`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
