import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, projectRoot } from "./lib.mjs";
import {
  assertPublicPaths,
  auditPublicRelease,
  loadPublicManifest,
} from "./public-release-policy.mjs";

export function assertSafeArchiveEntries(entries, manifest = loadPublicManifest()) {
  return assertPublicPaths(entries, manifest);
}

export function buildBundle({ root = projectRoot(), outputDir, allowDirty = false, spawn = spawnSync } = {}) {
  const status = run("git", ["status", "--porcelain", "--untracked-files=normal"], root, spawn).stdout.trim();
  if (status && !allowDirty) throw new Error("工作区有未提交变更；迁移包只从已提交快照生成");
  const { manifest } = auditPublicRelease({ root, spawn });
  const revision = run("git", ["rev-parse", "--short=12", "HEAD"], root, spawn).stdout.trim();
  const destination = path.resolve(outputDir || path.join(root, "dist"));
  fs.mkdirSync(destination, { recursive: true });
  const archive = path.join(destination, `talking-head-factory-windows-${revision}.tar.gz`);
  try {
    run("git", [
      "archive",
      "--format=tar.gz",
      "--prefix=talking-head-video-factory/",
      "--output", archive,
      "HEAD",
      ...manifest.rootFiles,
      ...manifest.roots
    ], root, spawn);
    const entries = run("tar", ["-tzf", archive], root, spawn).stdout.split(/\r?\n/).filter(Boolean);
    assertSafeArchiveEntries(entries, manifest);
    const sha256 = sha256File(archive);
    const checksum = `${sha256}  ${path.basename(archive)}\n`;
    fs.writeFileSync(`${archive}.sha256`, checksum);
    fs.writeFileSync(`${archive}.manifest.json`, `${JSON.stringify({
      schemaVersion: 1,
      revision,
      createdAt: new Date().toISOString(),
      archive: path.basename(archive),
      sha256,
      entries: entries.length,
      publicManifestSchemaVersion: manifest.schemaVersion,
      excludesAllJobs: true,
      excludesReportsAndFrozenEvidence: true,
      includesDependencies: false
    }, null, 2)}\n`);
    return { archive, revision, sha256, entries: entries.length };
  } catch (error) {
    fs.rmSync(archive, { force: true });
    fs.rmSync(`${archive}.sha256`, { force: true });
    fs.rmSync(`${archive}.manifest.json`, { force: true });
    throw error;
  }
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = buildBundle({
    outputDir: args.output,
    allowDirty: args.allowDirty === true || args["allow-dirty"] === true
  });
  console.log(`Windows/WSL 迁移包: ${result.archive}`);
  console.log(`Revision: ${result.revision} · ${result.entries} files · SHA-256 ${result.sha256}`);
  console.log("包内不含客户 job、原片、审片数据、node_modules 或密钥；目标机运行 npm ci。 ");
}

function run(command, args, cwd, spawn) {
  const result = spawn(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.error) throw new Error(`${command} 无法启动: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} 失败(exit ${result.status}):\n${result.stderr || result.stdout}`);
  return result;
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

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`迁移包生成失败: ${error.message}`);
    process.exitCode = 1;
  }
}
