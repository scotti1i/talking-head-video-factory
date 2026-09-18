import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, resolveCjkFontSource } from "./lib.mjs";
import { inspectComponentPackages } from "./component-registry.mjs";
import {
  PREVIEW_DURATION,
  PREVIEW_FORMATS,
  PREVIEW_SCHEMA_VERSION,
  assertDiskSpace,
  atomicReplaceDir,
  atomicWriteJson,
  cacheIsReady,
  cellKey,
  commandExists,
  hashFile,
  hashValue,
  initialCellStatus,
  injectPreviewShell,
  lastGoodHash,
  legacyCellKey,
  linkOrCopy,
  makeCellHash,
  makeStageDir,
  parseCsv,
  readJsonSafe,
  rootRelative,
  runCommand,
  runPool,
  selectFixtureIds
} from "./visual-preview-lib.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const args = parseArgs();
const outputRoot = path.join(root, "out", "visual-library");
const cacheRoot = path.join(outputRoot, "cache");
const stagingRoot = path.join(outputRoot, ".staging");
const errorsRoot = path.join(outputRoot, "errors");
const manifestPath = path.join(outputRoot, "manifest.json");
const builderPath = path.join(root, "scripts", "build-beats-composition.mjs");
const registryPath = path.join(root, "themes", "registry.json");
const sharedFontsDir = path.join(root, "themes", "_shared", "fonts");
const sharedGsapPath = path.join(root, "themes", "_shared", "vendor", "gsap.min.js");
const systemCjkFontPath = resolveCjkFontSource(); // 平台字体源，与 build-beats-composition 同一解析
const defaultSource = path.join(root, "jobs", "beats-regression", "assets", "aroll-front-focus.mp4");
const htmlOnly = Boolean(args["html-only"] || args.htmlOnly);

if (args.help) {
  printHelp();
  process.exit(0);
}

const context = await loadContext();
const cells = planCells(context);
if (!htmlOnly && cells.some((cell) => cell.supported && cell.available)) assertDiskSpace(outputRoot);
await generateAll(context, cells);

function printHelp() {
  console.log(`真实视觉组件预览缓存

用法:
  node scripts/visual-preview-generate.mjs [选项]

选项:
  --component <id[,id]>       默认全部 current 组件
  --fixture <id[,id]>         默认每个组件的全部 fixture
  --theme <id[,id]>           默认 themes/registry.json 全部主题
  --format <portrait|landscape[,..]>  默认两种画幅
  --html-only                 只生成 4 秒 HTML，不抓 poster
  --source <video>            指定真实 A-roll 来源
  --force                     忽略 ready cache 重新生成
  --help                      显示帮助
`);
}

// -----------------------------------------------------------------------------
// 上下文与计划
// -----------------------------------------------------------------------------

async function loadContext() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const registry = readJsonSafe(registryPath, { themes: [] });
  const inspected = inspectComponentPackages({ root });
  if (inspected.errors.length) {
    throw new Error(`组件目录校验失败:\n${inspected.errors.map((item) => `- ${item.id}: ${item.message}`).join("\n")}`);
  }
  const packages = inspected.components.filter((component) =>
    component.lifecycle !== "archived" && component.compatibility !== "unsupported");
  const components = packages.map((component) => component.id);
  const componentById = new Map(packages.map((component) => [component.id, component]));
  const fixtures = loadFixtures(packages);
  const themes = Array.isArray(registry.themes) ? registry.themes : [];
  const requested = {
    components: parseCsv(args.component, components),
    fixtures: fixtureFilter(args.fixture),
    themes: parseCsv(args.theme, themes),
    formats: parseCsv(args.format, Object.keys(PREVIEW_FORMATS))
  };
  const builder = builderFingerprint();
  const runtime = runtimeFingerprint();
  const componentFingerprints = fingerprintComponents(packages);
  const themeFingerprints = fingerprintThemes(themes);
  const proxy = await ensureProxy(path.resolve(args.source || defaultSource));
  const manifest = readJsonSafe(manifestPath, emptyManifest(builder, runtime, proxy));
  return {
    registry,
    fixtures,
    components,
    componentById,
    componentFingerprints,
    themes,
    themeFingerprints,
    requested,
    builder,
    runtime,
    proxy,
    manifest
  };
}

function loadFixtures(components) {
  const map = new Map();
  for (const component of components) {
    const fixtures = component.fixtures
      .filter((item) => item?.id && item?.beat)
      .map((item) => ({
        id: item.id,
        label: item.label,
        assets: Array.isArray(item.assets) ? item.assets.map((asset) => ({ ...asset })) : [],
        beat: { ...item.beat, type: component.id, start: 0, end: PREVIEW_DURATION }
      }));
    map.set(component.id, fixtures);
  }
  return map;
}

function fixtureFilter(value) {
  if (value == null || value === true || value === "all") return null;
  return parseCsv(value, []);
}

function builderFingerprint() {
  const code = fingerprintFiles([
    builderPath,
    path.join(root, "scripts", "lib.mjs"),
    path.join(root, "scripts", "component-registry.mjs"),
    path.join(root, "scripts", "visual-preview-lib.mjs"),
    path.join(root, "scripts", "visual-preview-generate.mjs")
  ]);
  const inputs = {
    code,
    sharedFonts: fingerprintFiles(treeFiles(sharedFontsDir)),
    jobVendorGsap: {
      destination: "vendor/gsap.min.js",
      ...fingerprintFiles([sharedGsapPath])
    },
    systemCjkFont: fingerprintFiles([systemCjkFontPath])
  };
  return { path: rootRelative(root, builderPath), inputs, hash: hashValue(inputs) };
}

function runtimeFingerprint() {
  const hyperframes = readJsonSafe(path.join(root, "node_modules", "hyperframes", "package.json"), {});
  const puppeteerCore = readJsonSafe(path.join(root, "node_modules", "puppeteer-core", "package.json"), {});
  const value = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    hyperframes: hyperframes.version || "missing",
    puppeteerCore: puppeteerCore.version || "missing",
    chrome: detectChromeRuntime(),
    captureEnv: {
      browserGpuMode: process.env.PRODUCER_BROWSER_GPU_MODE || "default",
      headlessShellPath: process.env.PRODUCER_HEADLESS_SHELL_PATH || "auto",
      expectedChromiumMajor: process.env.PRODUCER_EXPECTED_CHROMIUM_MAJOR || "default"
    },
    pyftsubset: commandVersion("python3", [
      "-c",
      "import fontTools; print('fonttools ' + fontTools.__version__)"
    ]),
    pillow: commandVersion("python3", ["-c", "import PIL; print(PIL.__version__)"])
  };
  return { ...value, hash: hashValue(value) };
}

function detectChromeRuntime() {
  const cli = path.join(root, "node_modules", ".bin", "hyperframes");
  if (!fs.existsSync(cli)) return { status: "unresolved", reason: "HyperFrames CLI missing" };
  const resolved = spawnSync(cli, ["browser", "path"], { encoding: "utf8", timeout: 10_000 });
  const executable = resolved.status === 0 ? resolved.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) : "";
  if (!executable || !fs.existsSync(executable)) {
    return { status: "unresolved", reason: String(resolved.stderr || "Chrome path missing").trim() };
  }
  const stat = fs.statSync(executable);
  return {
    status: "ready",
    executable,
    version: commandVersion(executable, ["--version"]),
    binarySize: stat.size
  };
}

function commandVersion(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) return "unavailable";
  return String(result.stdout || result.stderr || "unknown").trim() || "unknown";
}

function fingerprintComponents(components) {
  return new Map(components.map((component) => {
    const files = [component.files.manifest, component.files.render, component.files.style];
    return [component.id, fingerprintFiles(files).hash];
  }));
}

function fingerprintThemes(themes) {
  return new Map(themes.map((theme) => {
    const dir = path.join(root, "themes", theme);
    return [theme, fingerprintFiles([path.join(dir, "theme.json"), path.join(dir, "overrides.css")]).hash];
  }));
}

function fingerprintFiles(files) {
  const entries = [...new Set(files)].sort().map((file) => ({
    path: inputPath(file),
    hash: fs.existsSync(file) ? hashFile(file) : "missing"
  }));
  return { files: entries, hash: hashValue(entries) };
}

function inputPath(file) {
  const relative = path.relative(root, file);
  return relative.startsWith("..") ? file : rootRelative(root, file);
}

function treeFiles(dir) {
  if (!fs.existsSync(dir)) return [dir];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...treeFiles(target));
    else if (entry.isFile()) out.push(target);
  }
  return out.sort();
}

function emptyManifest(builder, runtime, proxy) {
  return {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    generatedAt: null,
    builder,
    runtime,
    proxy,
    cells: {}
  };
}

function planCells(context) {
  const out = [];
  for (const component of context.requested.components) {
    for (const fixture of fixtureIdsFor(context, component)) {
      for (const theme of context.requested.themes) {
        for (const format of context.requested.formats) {
          out.push(planCell(context, component, fixture, theme, format));
        }
      }
    }
  }
  return out;
}

function fixtureIdsFor(context, component) {
  return selectFixtureIds(context.fixtures.get(component) || [], context.requested.fixtures);
}

function planCell(context, component, fixtureId, theme, format) {
  const fixture = (context.fixtures.get(component) || []).find((item) => item.id === fixtureId);
  const componentPackage = context.componentById.get(component);
  const formatConfig = PREVIEW_FORMATS[format];
  const themeFile = path.join(root, "themes", theme, "theme.json");
  const fixtureFormats = fixture?.beat?.formats || Object.keys(PREVIEW_FORMATS);
  const supported = Boolean(componentPackage && formatConfig
    && componentPackage.formats.includes(format) && fixtureFormats.includes(format));
  const available = Boolean(fixture) && context.themes.includes(theme)
    && fs.existsSync(themeFile) && context.proxy.status === "ready";
  const inputs = {
    component: context.componentFingerprints.get(component) || `missing:${component}`,
    fixture: fixture ? hashValue({
      id: fixture.id,
      beat: fixture.beat,
      assets: fixture.assets.map((asset) => fixtureAssetFingerprint(asset))
    }) : `missing:${component}/${fixtureId}`,
    theme: context.themeFingerprints.get(theme) || `missing:${theme}`,
    format: formatConfig ? hashValue(formatConfig) : `unsupported:${format}`,
    builder: context.builder.hash,
    runtime: context.runtime.hash,
    proxy: context.proxy.hash || `missing:${context.proxy.path}`
  };
  const hash = makeCellHash(inputs);
  return {
    component,
    fixtureId,
    fixture: fixture?.beat || null,
    fixtureAssets: fixture?.assets || [],
    theme,
    format,
    formatConfig,
    supported,
    available,
    inputs,
    hash
  };
}

// -----------------------------------------------------------------------------
// 共享真实 A-roll proxy
// -----------------------------------------------------------------------------

async function ensureProxy(source) {
  const assetsDir = path.join(outputRoot, "assets");
  const proxyPath = path.join(assetsDir, "aroll-proxy-v1.mp4");
  const metadataPath = path.join(assetsDir, "aroll-proxy-v1.json");
  const spec = { version: 1, start: 0.3, duration: 4.25, width: 540, height: 960, fps: 30, crf: 24 };
  if (!fs.existsSync(source)) return missingProxy(source, proxyPath, "真实 A-roll 来源不存在");
  if (!commandExists("ffmpeg")) return missingProxy(source, proxyPath, "ffmpeg 不可用");
  const sourceHash = hashFile(source);
  const metadata = readJsonSafe(metadataPath, {});
  const proxyExists = fs.existsSync(proxyPath);
  const actualHash = proxyExists ? hashFile(proxyPath) : null;
  const reusable = proxyExists && metadata.sourceHash === sourceHash
    && metadata.specHash === hashValue(spec) && metadata.proxyHash === actualHash;
  if (!reusable) await buildProxy({ source, sourceHash, proxyPath, metadataPath, spec });
  const hash = hashFile(proxyPath);
  return {
    status: "ready",
    path: rootRelative(root, proxyPath),
    source: rootRelative(root, source),
    sourceHash,
    hash,
    spec
  };
}

function missingProxy(source, proxyPath, error) {
  return {
    status: "missing",
    path: rootRelative(root, proxyPath),
    source: rootRelative(root, source),
    hash: null,
    error
  };
}

async function buildProxy({ source, sourceHash, proxyPath, metadataPath, spec }) {
  assertDiskSpace(outputRoot);
  fs.mkdirSync(path.dirname(proxyPath), { recursive: true });
  const temp = `${proxyPath}.tmp-${process.pid}-${crypto.randomUUID()}.mp4`;
  const filter = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},fps=${spec.fps}`;
  const ffmpegArgs = [
    "-y", "-hide_banner", "-loglevel", "error", "-ss", String(spec.start), "-i", source,
    "-t", String(spec.duration), "-vf", filter, "-an", "-c:v", "libx264", "-preset", "veryfast",
    "-crf", String(spec.crf), "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30",
    "-sc_threshold", "0", "-movflags", "+faststart", temp
  ];
  try {
    await runCommand("ffmpeg", ffmpegArgs);
    fs.renameSync(temp, proxyPath);
    const metadata = { schemaVersion: 1, sourceHash, specHash: hashValue(spec), proxyHash: hashFile(proxyPath), spec };
    atomicWriteJson(metadataPath, metadata);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

// -----------------------------------------------------------------------------
// 批量生成与状态落盘
// -----------------------------------------------------------------------------

async function generateAll(context, cells) {
  fs.mkdirSync(cacheRoot, { recursive: true });
  context.manifest.builder = context.builder;
  context.manifest.runtime = context.runtime;
  context.manifest.proxy = context.proxy;
  context.manifest.cells ||= {};
  prepareManifest(context, cells);
  await runPool(cells, 2, async (cell) => generateCell(context, cell));
  context.manifest.generatedAt = new Date().toISOString();
  writeManifest(context.manifest);
  printSummary(cells, context.manifest);
}

function prepareManifest(context, cells) {
  for (const cell of cells) {
    const key = keyFor(cell);
    const previous = takePreviousCell(context, cell);
    context.manifest.cells[key] = cellEntry(cell, {
      status: initialCellStatus(previous, cell.hash),
      lastGoodHash: lastGoodHash(previous)
    });
  }
  context.manifest.generatedAt = new Date().toISOString();
  writeManifest(context.manifest);
}

async function generateCell(context, cell) {
  const key = keyFor(cell);
  const previous = context.manifest.cells[key];
  if (!cell.supported) return publishTerminal(context, cell, "unsupported", "组件或画幅不受 current builder 支持");
  if (!cell.available) return publishTerminal(context, cell, "missing", missingReason(context, cell));
  const target = path.join(cacheRoot, cell.hash);
  if (!args.force && cacheIsReady(target, !htmlOnly)) {
    context.manifest.cells[key] = cellEntry(cell, { status: "ready", lastGoodHash: cell.hash });
    writeManifest(context.manifest);
    return;
  }
  context.manifest.cells[key] = cellEntry(cell, {
    status: "rendering",
    lastGoodHash: previous.lastGoodHash,
    startedAt: new Date().toISOString()
  });
  writeManifest(context.manifest);
  await buildCell(context, cell, previous.lastGoodHash);
}

function takePreviousCell(context, cell) {
  const component = context.componentById.get(cell.component);
  const isDefault = cell.fixtureId === component?.preview.defaultFixture;
  const oldKey = legacyCellKey(cell.component, cell.theme, cell.format);
  const current = context.manifest.cells[keyFor(cell)];
  if (current) {
    if (isDefault) delete context.manifest.cells[oldKey];
    return current;
  }
  if (!isDefault) return null;
  const legacy = context.manifest.cells[oldKey];
  if (legacy) delete context.manifest.cells[oldKey];
  return legacy || null;
}

function keyFor(cell) {
  return cellKey(cell.component, cell.fixtureId, cell.theme, cell.format);
}

function missingReason(context, cell) {
  if (context.proxy.status !== "ready") return context.proxy.error || "共享 A-roll proxy 缺失";
  if (!cell.fixture) return `fixture 缺失: ${cell.component}/${cell.fixtureId}`;
  if (!context.themes.includes(cell.theme)) return `主题未注册: ${cell.theme}`;
  return `主题文件缺失: ${cell.theme}`;
}

async function buildCell(context, cell, priorGoodHash) {
  const stage = makeStageDir(stagingRoot, cell.hash);
  const startedAt = new Date().toISOString();
  try {
    prepareJob(stage, context, cell);
    await runCommand(process.execPath, [builderPath, "--job", stage, "--theme", cell.theme]);
    if (!htmlOnly) await createPoster(stage);
    addPreviewShell(stage);
    pruneJob(stage);
    const result = resultPayload(context, cell, "ready", { startedAt, finishedAt: new Date().toISOString() });
    atomicWriteJson(path.join(stage, "result.json"), result);
    atomicReplaceDir(stage, path.join(cacheRoot, cell.hash));
    finishCell(context, cell, "ready", cell.hash);
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    await publishFailure(context, cell, priorGoodHash, error, startedAt);
  }
}

function prepareJob(stage, context, cell) {
  const project = {
    title: `视觉组件预览 · ${cell.component} · ${cell.fixtureId}`,
    slug: `visual-preview-${cell.component}-${cell.fixtureId}-${cell.theme}-${cell.format}`,
    theme: cell.theme,
    layout: cell.formatConfig.layout,
    width: cell.formatConfig.width,
    height: cell.formatConfig.height,
    duration: PREVIEW_DURATION,
    sourceVideo: "assets/aroll.mp4",
    caption: { enabled: true }
  };
  writeJobJson(stage, "project.json", project);
  writeJobJson(stage, "data/beats.json", [cell.fixture]);
  writeJobJson(stage, "data/captions.json", [{ s: 0.45, e: 3.55, t: "真实口播字幕 · 与组件同时展示" }]);
  writeJobJson(stage, "data/broll.json", []);
  const proxy = path.join(root, context.proxy.path);
  linkOrCopy(proxy, path.join(stage, "assets", "aroll.mp4"));
  stageFixtureAssets(stage, cell.fixtureAssets);
}

function fixtureAssetFingerprint(asset) {
  const source = resolveFixtureSource(asset.source);
  return { source: asset.source, target: asset.target, hash: hashFile(source) };
}

function stageFixtureAssets(stage, assets) {
  for (const asset of assets) {
    const source = resolveFixtureSource(asset.source);
    const target = resolveFixtureTarget(stage, asset.target);
    linkOrCopy(source, target);
  }
}

function resolveFixtureSource(source) {
  const resolved = path.resolve(root, String(source || ""));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`fixture asset source 必须位于仓库内: ${source}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`fixture asset source 不存在: ${source}`);
  }
  const real = fs.realpathSync(resolved);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`fixture asset source 的真实路径越出仓库: ${source}`);
  }
  return resolved;
}

function resolveFixtureTarget(stage, target) {
  const assetsRoot = path.resolve(stage, "assets");
  const resolved = path.resolve(stage, String(target || ""));
  const relative = path.relative(assetsRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`fixture asset target 必须位于 job assets/ 内: ${target}`);
  }
  return resolved;
}

function writeJobJson(stage, relative, value) {
  const file = path.join(stage, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function createPoster(stage) {
  const cli = path.join(root, "node_modules", ".bin", "hyperframes");
  if (!fs.existsSync(cli)) throw new Error("缺少本地 HyperFrames CLI");
  await runCommand(cli, ["snapshot", "--at", "2", stage]);
  const snapshotDir = path.join(stage, "snapshots");
  const png = fs.readdirSync(snapshotDir).find((file) => file.endsWith(".png"));
  if (!png) throw new Error("HyperFrames snapshot 未生成 PNG");
  if (!commandExists("python3")) throw new Error("缺少 python3，无法生成 WebP poster");
  const code = [
    "from PIL import Image",
    "import sys",
    "image = Image.open(sys.argv[1])",
    "image.save(sys.argv[2], 'WEBP', quality=82, method=6)"
  ].join("\n");
  await runCommand("python3", [
    "-c", code, path.join(snapshotDir, png), path.join(stage, "poster.webp")
  ]);
}

function addPreviewShell(stage) {
  const indexPath = path.join(stage, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  fs.writeFileSync(indexPath, injectPreviewShell(html));
}

function pruneJob(stage) {
  for (const name of ["data", "project.json", "qa", "renders", "snapshots", "tmp", "vendor"]) {
    fs.rmSync(path.join(stage, name), { recursive: true, force: true });
  }
}

async function publishFailure(context, cell, priorGoodHash, error, startedAt) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = resultPayload(context, cell, "failed", {
    startedAt,
    finishedAt: new Date().toISOString(),
    error: { message }
  });
  fs.mkdirSync(errorsRoot, { recursive: true });
  atomicWriteJson(path.join(errorsRoot, `${cell.hash}.json`), payload);
  if (!fs.existsSync(path.join(cacheRoot, cell.hash))) publishResultOnly(cell, payload);
  finishCell(context, cell, "failed", priorGoodHash, message);
}

function publishTerminal(context, cell, status, error) {
  const payload = resultPayload(context, cell, status, {
    finishedAt: new Date().toISOString(),
    error: error ? { message: error } : null
  });
  publishResultOnly(cell, payload);
  finishCell(context, cell, status, context.manifest.cells[keyFor(cell)]?.lastGoodHash, error);
}

function publishResultOnly(cell, payload) {
  const stage = makeStageDir(stagingRoot, cell.hash);
  atomicWriteJson(path.join(stage, "result.json"), payload);
  atomicReplaceDir(stage, path.join(cacheRoot, cell.hash));
}

function finishCell(context, cell, status, goodHash, error = null) {
  const key = keyFor(cell);
  context.manifest.cells[key] = cellEntry(cell, {
    status,
    lastGoodHash: goodHash || null,
    error: error ? { message: error } : null,
    finishedAt: new Date().toISOString()
  });
  writeManifest(context.manifest);
}

// -----------------------------------------------------------------------------
// 合同输出
// -----------------------------------------------------------------------------

function resultPayload(context, cell, status, extras = {}) {
  return {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    key: keyFor(cell),
    hash: cell.hash,
    status,
    component: cell.component,
    fixture: cell.fixtureId,
    theme: cell.theme,
    format: cell.format,
    duration: PREVIEW_DURATION,
    dimensions: cell.formatConfig || null,
    inputs: cell.inputs,
    runtime: context.runtime,
    artifacts: {
      html: status === "ready" ? "index.html" : null,
      poster: status === "ready" && !htmlOnly ? "poster.webp" : null,
      assets: status === "ready" ? "assets" : null
    },
    ...extras
  };
}

function cellEntry(cell, extras = {}) {
  const target = path.join(cacheRoot, cell.hash);
  return {
    assetId: cell.component,
    component: cell.component,
    fixture: cell.fixtureId,
    theme: cell.theme,
    format: cell.format,
    hash: cell.hash,
    status: extras.status || "missing",
    cachePath: rootRelative(root, target),
    htmlPath: rootRelative(root, path.join(target, "index.html")),
    posterPath: rootRelative(root, path.join(target, "poster.webp")),
    resultPath: rootRelative(root, path.join(target, "result.json")),
    lastGoodHash: extras.lastGoodHash || null,
    error: extras.error || null,
    startedAt: extras.startedAt || null,
    finishedAt: extras.finishedAt || null,
    updatedAt: new Date().toISOString()
  };
}

function writeManifest(manifest) {
  manifest.generatedAt = new Date().toISOString();
  atomicWriteJson(manifestPath, manifest);
}

function printSummary(cells, manifest) {
  const counts = {};
  for (const cell of cells) {
    const status = manifest.cells[keyFor(cell)]?.status || "missing";
    counts[status] = (counts[status] || 0) + 1;
  }
  console.log(`视觉预览完成: ${JSON.stringify(counts)}`);
  console.log(`Manifest: ${manifestPath}`);
}
