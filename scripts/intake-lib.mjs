import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const SCRIPT_EXTENSIONS = new Set([".txt", ".md"]);
const REFERENCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function planIntake({ sourceDir, scriptPath }) {
  if (typeof sourceDir !== "string" || !sourceDir.trim()) throw new Error("必须提供收件箱目录 --source");
  const root = path.resolve(String(sourceDir || ""));
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`收件箱目录不存在: ${sourceDir}`);
  const originalsDir = existingDirectory(path.join(root, "originals")) || root;
  const brollDir = existingDirectory(path.join(root, "broll"));
  const referencesDir = existingDirectory(path.join(root, "references"));
  const originals = listFiles(originalsDir, VIDEO_EXTENSIONS);
  if (!originals.length) throw new Error(`收件箱没有口播视频: ${originalsDir}`);

  const explicitScript = scriptPath ? path.resolve(scriptPath) : null;
  const scriptCandidates = explicitScript
    ? [explicitScript]
    : uniqueFiles([
        ...listFiles(root, SCRIPT_EXTENSIONS),
        ...(originalsDir === root ? [] : listFiles(originalsDir, SCRIPT_EXTENSIONS))
      ]);
  if (scriptCandidates.length !== 1) {
    throw new Error(`需要且只能有一份 .txt/.md 文稿，当前 ${scriptCandidates.length} 份；可用 --script 明确指定`);
  }
  if (!fs.existsSync(scriptCandidates[0]) || !SCRIPT_EXTENSIONS.has(path.extname(scriptCandidates[0]).toLowerCase())) {
    throw new Error(`不支持的文稿: ${scriptCandidates[0]}`);
  }

  const broll = brollDir ? listFiles(brollDir, VIDEO_EXTENSIONS) : [];
  const references = referencesDir
    ? listFiles(referencesDir, REFERENCE_EXTENSIONS)
    : originalsDir === root
      ? listFiles(root, REFERENCE_EXTENSIONS)
      : [];
  return {
    sourceDir: root,
    script: scriptCandidates[0],
    originals,
    broll,
    references
  };
}

export function executeIntakeCopy({ plan, jobDir, now = new Date() }) {
  const target = path.resolve(jobDir);
  if (!fs.existsSync(target)) throw new Error(`目标 job 不存在: ${target}`);
  const entries = [];
  copyGroup(plan.originals, path.join(target, "assets", "originals"), "original", entries);
  copyGroup(plan.broll, path.join(target, "assets", "broll"), "broll", entries);
  copyGroup(plan.references, path.join(target, "assets", "references"), "reference", entries);
  const scriptExtension = path.extname(plan.script).toLowerCase();
  const scriptTarget = path.join(target, "assets", "originals", `original-script${scriptExtension}`);
  copyOne(plan.script, scriptTarget, "script", entries);
  return {
    schemaVersion: 1,
    importedAt: now.toISOString(),
    sourceReadOnly: true,
    sourceDir: plan.sourceDir,
    writtenScript: path.relative(target, scriptTarget).replaceAll(path.sep, "/"),
    entries
  };
}

function copyGroup(files, destination, kind, entries) {
  for (const file of files) copyOne(file, path.join(destination, path.basename(file)), kind, entries);
}

function copyOne(source, destination, kind, entries) {
  if (fs.existsSync(destination)) throw new Error(`导入目标已存在，拒绝覆盖: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const sourceHash = sha256File(source);
  const destinationHash = sha256File(destination);
  if (sourceHash !== destinationHash) throw new Error(`导入校验失败: ${source}`);
  entries.push({
    kind,
    source,
    target: destination,
    sha256: sourceHash,
    bytes: fs.statSync(destination).size
  });
}

function listFiles(directory, extensions) {
  if (!directory) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function uniqueFiles(files) {
  return [...new Set(files.map((file) => path.resolve(file)))];
}

function existingDirectory(directory) {
  return fs.existsSync(directory) && fs.statSync(directory).isDirectory() ? directory : null;
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
    return hash.digest("hex");
  } finally {
    fs.closeSync(descriptor);
  }
}
