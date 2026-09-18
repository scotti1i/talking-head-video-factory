import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectRoot, readJson, writeJson } from "./lib.mjs";
import { buildVisualRoute, visualRouteModuleSource } from "./visual-scene-router.mjs";
import { applyMotionDefaults, compilePlan, planModuleSource } from "./narrative-stage-plan.mjs";

const FAMILY_ROOT = "vendor/video-shotcraft/ink-press";
const WORK_ROOT = "renders/work-shotcraft/ink-press";
const MARKER = ".factory-shotcraft-workspace.json";
// 叙事舞台引擎（数据驱动的小Lin式连续场景）：源码真相在 templates/shotcraft-direct-port/stage
const STAGE_FILES = [
  "Accent.tsx", "Broll.tsx", "Chrome.tsx", "Concept.tsx", "Converge.tsx", "DataFocus.tsx", "Equation.tsx", "Evidence.tsx", "Fx.tsx",
  "Chat.tsx", "Clipping.tsx", "Cycle.tsx", "Flip.tsx", "Gauge.tsx", "Gallery.tsx", "Glyph.tsx", "Graph.tsx", "Label.tsx", "Ladder.tsx", "Leaderboard.tsx", "MapScene.tsx", "NarrativeStage.tsx", "Plan.ts", "Quote.tsx", "Reference.tsx", "Reminders.tsx", "Sfx.tsx",
  "Skin.ts", "Canvas.ts", "Speaker.tsx", "Split.tsx", "Styleframe.tsx", "Timeline.tsx", "Compare.tsx", "Title.tsx", "motions.ts", "theme.ts"
];
const GENERATED_FILES = new Set([
  MARKER,
  "src/factory-index.ts",
  "src/factory/Root.tsx",
  "src/factory/ListStack.tsx",
  "src/factory/RowEmbed.tsx",
  "src/factory/ContinuousRelationScene.tsx",
  "src/factory/Motion.tsx",
  "src/factory/VisualRoute.ts",
  "src/factory/NarrativePlan.ts",
  ...STAGE_FILES.map((file) => `src/factory/stage/${file}`),
  "public/factory/aroll.mp4"
]);
const LOCALIZATION_PATCH_FILE = "src/aifl/PaperTitleCard.tsx";
const CONTINUOUS_SCENE_AROLL = "jobs/gmv-max-shotcraft-direct-port-full-20260902/assets/aroll.mp4";
const CONTINUOUS_ROUTE_INPUT = "jobs/gmv-max-shotcraft-direct-port-full-20260902/data/visual-route-input.json";
const CONTINUOUS_ROUTE_OUTPUT = "jobs/gmv-max-shotcraft-direct-port-full-20260902/data/visual-route.json";
// 上面三个是内部参照样片 job，没有导出到公开仓库；缺席时连续场景路由校验整体跳过，VisualRoute.ts 写空路由（2026-09-18 公开仓库一帧渲不出来的根因）
let warnedMissingReference = false;
function readContinuousRouteInput(root) {
  const file = path.join(root, CONTINUOUS_ROUTE_INPUT);
  if (fs.existsSync(file)) return readJson(file);
  if (!warnedMissingReference) {
    warnedMissingReference = true;
    console.warn(`未找到内部参照 job（${path.dirname(path.dirname(CONTINUOUS_ROUTE_INPUT))}），跳过连续场景路由校验`);
  }
  return null;
}
// 参照 job 缺席时的空路由：ContinuousRelationScene 只做 VISUAL_ROUTE.scenes.find，空数组即可
function continuousRouteModule(root) {
  const input = readContinuousRouteInput(root);
  return input ? visualRouteModuleSource(buildVisualRoute(input)) : visualRouteModuleSource({ schemaVersion: 1, source: "absent", scenes: [] });
}
// 叙事舞台当前绑定的 job（换视频 = 换这里 + 该 job 的 data/scene-plan.json）
// 当前 job 有粘性：环境变量 > 上次准备工作区时记下的 job > 默认样片。
// 出处：2026-09-02 事故——测试套件在未设环境变量的 shell 里跑 prepare，把正在渲染的工作区换回了默认 job。
const JOB_STICKY_FILE = path.join(projectRoot(), "renders", "work-shotcraft", ".narrative-job");
function readStickyJob() {
  try { return fs.readFileSync(JOB_STICKY_FILE, "utf8").trim() || null; } catch { return null; }
}
export const NARRATIVE_JOB = process.env.NARRATIVE_JOB || readStickyJob() || "jobs/gmv-max-xiaolin-stage-20260902"; // 换视频：NARRATIVE_JOB=jobs/<slug> 前缀运行

export function prepareInkPressWorkspace({ root = projectRoot() } = {}) {
  const sourceRoot = path.join(root, FAMILY_ROOT);
  const workRoot = path.join(root, WORK_ROOT);
  const provenance = readJson(path.join(sourceRoot, "PROVENANCE.json"));
  const desired = workspaceSignature(provenance, root);

  if (fs.existsSync(workRoot)) {
    const markerPath = path.join(workRoot, MARKER);
    if (!fs.existsSync(markerPath)) {
      // narrative-stage-plan CLI 会在工作区还没准备时就把 NarrativePlan.ts 写进 src/factory/，留下一个没有标记也没有 package.json 的半目录；
      // 那不是别人的工作区，是本工厂自己的残留，清掉重来（2026-09-18 Linux 对齐容器与 Mac 首次准备都被它挡死）。有 package.json 的仍拒绝覆盖
      if (fs.existsSync(path.join(workRoot, "package.json"))) throw new Error(`拒绝覆盖没有工厂标记的目录: ${workRoot}`);
      console.warn(`清理无标记的半成品工作区（仅含计划模块残留）: ${workRoot}`);
      fs.rmSync(workRoot, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(workRoot)) {
    const markerPath = path.join(workRoot, MARKER);
    const current = readJson(markerPath);
    if (current.signature === desired) {
      // 复用工作区也必须重挂素材：A-roll 是硬链接，重剪后是新 inode，旧链接指着上一版画面
      // （2026-09-12：改了人脸裁切重出 A-roll，静帧板还是旧的白墙那版，查了才发现签名不含素材）
      writeGeneratedAdapter(workRoot, root);
      const checked = verifyInkPressWorkspace({ root });
      if (!checked.ok) throw new Error(`Shotcraft 适配工作区漂移:\n- ${checked.failures.join("\n- ")}`);
      return { sourceRoot, workRoot, provenance, reused: true, report: checked };
    }
    // 换 job / 换模板只重建源码，node_modules 挪到旁边保住（2026-09-02 事故：签名变化把依赖一起删了）
    const keptModules = path.join(path.dirname(workRoot), ".ink-press-node_modules-keep");
    if (fs.existsSync(path.join(workRoot, "node_modules"))) fs.renameSync(path.join(workRoot, "node_modules"), keptModules);
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(workRoot), { recursive: true });
  fs.cpSync(sourceRoot, workRoot, { recursive: true });
  const keptModules = path.join(path.dirname(workRoot), ".ink-press-node_modules-keep");
  if (fs.existsSync(keptModules)) fs.renameSync(keptModules, path.join(workRoot, "node_modules"));
  applyChineseFontPort(path.join(workRoot, LOCALIZATION_PATCH_FILE));
  try {
    writeGeneratedAdapter(workRoot, root);
  } catch (err) {
    // 半成品工作区没有标记会拒绝下一次重建（2026-09-03 两次踩到）：失败时把依赖挪回旁边、删掉半成品，让下次能干净重来
    if (fs.existsSync(path.join(workRoot, "node_modules"))) fs.renameSync(path.join(workRoot, "node_modules"), keptModules);
    fs.rmSync(workRoot, { recursive: true, force: true });
    throw err;
  }
  fs.writeFileSync(JOB_STICKY_FILE, NARRATIVE_JOB + "\n");
  writeJson(path.join(workRoot, MARKER), {
    schemaVersion: 1,
    signature: desired,
    family: "shotcraft/ink-press",
    upstreamRevision: provenance.revision,
    source: provenance.source,
    license: provenance.license,
    policy: {
      implementation: "direct-import-upstream-components",
      generatedFiles: [...GENERATED_FILES].sort(),
      allowedModifiedFiles: [LOCALIZATION_PATCH_FILE],
      allowedChanges: [
        "add optional fontFamily prop for CJK localization",
        "register factory wrapper composition",
        "replace content through Remotion input props"
      ],
      forbiddenChanges: ["timing", "easing", "color", "shadow", "camera", "transition", "sfx"]
    }
  });
  const checked = verifyInkPressWorkspace({ root });
  if (!checked.ok) throw new Error(`Shotcraft 适配工作区创建失败:\n- ${checked.failures.join("\n- ")}`);
  return { sourceRoot, workRoot, provenance, reused: false, report: checked };
}

export function verifyInkPressWorkspace({ root = projectRoot() } = {}) {
  const sourceRoot = path.join(root, FAMILY_ROOT);
  const workRoot = path.join(root, WORK_ROOT);
  const failures = [];
  if (!fs.existsSync(workRoot)) return { ok: false, failures: [`缺少 ${workRoot}`] };
  const markerPath = path.join(workRoot, MARKER);
  if (!fs.existsSync(markerPath)) failures.push(`缺少工厂标记: ${markerPath}`);
  else {
    const marker = readJson(markerPath);
    const provenance = readJson(path.join(sourceRoot, "PROVENANCE.json"));
    if (marker.signature !== workspaceSignature(provenance, root)) failures.push("工厂工作区签名已过期；模板或视觉路由输入发生变化");
  }
  const sourceFiles = fileMap(sourceRoot, { ignore: new Set(["PROVENANCE.json"]) });
  const workFiles = fileMap(workRoot, {
    ignore: new Set(["PROVENANCE.json"]),
    ignorePrefixes: ["node_modules/", "out/", "public/factory/"]
  });

  for (const [relative, hash] of sourceFiles) {
    if (!workFiles.has(relative)) {
      failures.push(`直接移植文件缺失: ${relative}`);
      continue;
    }
    if (relative === LOCALIZATION_PATCH_FILE) {
      verifyLocalizationPatch(
        fs.readFileSync(path.join(sourceRoot, relative), "utf8"),
        fs.readFileSync(path.join(workRoot, relative), "utf8"),
        failures
      );
    } else if (workFiles.get(relative) !== hash) {
      failures.push(`未授权改动上游文件: ${relative}`);
    }
  }
  for (const relative of workFiles.keys()) {
    if (sourceFiles.has(relative) || GENERATED_FILES.has(relative)) continue;
    failures.push(`适配工作区出现未登记文件: ${relative}`);
  }
  // 连续场景 A-roll 是可选挂载（参照 job 与当前 job 都没有时跳过），不算缺文件
  const arollOptional = !fs.existsSync(path.join(root, CONTINUOUS_SCENE_AROLL)) && !fs.existsSync(path.join(root, NARRATIVE_JOB, "assets", "aroll.mp4"));
  for (const relative of GENERATED_FILES) {
    if (arollOptional && relative === "public/factory/aroll.mp4") continue;
    if (!fs.existsSync(path.join(workRoot, relative))) failures.push(`缺少适配器文件: ${relative}`);
  }
  const expectedRouteModule = continuousRouteModule(root);
  const routeModule = path.join(workRoot, "src", "factory", "VisualRoute.ts");
  if (fs.existsSync(routeModule) && fs.readFileSync(routeModule, "utf8") !== expectedRouteModule) {
    failures.push("VisualRoute.ts 与当前语义路由输入不一致");
  }
  const planModule = path.join(workRoot, "src", "factory", "NarrativePlan.ts");
  if (fs.existsSync(planModule) && fs.readFileSync(planModule, "utf8") !== compileNarrativeModule(root)) {
    failures.push("NarrativePlan.ts 与当前 job 场景计划不一致");
  }
  return {
    ok: failures.length === 0,
    failures,
    sourceFileCount: sourceFiles.size,
    unchangedSourceFiles: sourceFiles.size - 1,
    localizedSourceFiles: 1,
    generatedAdapterFiles: GENERATED_FILES.size - 1
  };
}

function applyChineseFontPort(file) {
  const source = fs.readFileSync(file, "utf8");
  const signature = "  subDigits?: string;\n}> = ({ duration, words, sub, subDigits }) => {";
  const replacement = "  subDigits?: string;\n  fontFamily?: string;\n}> = ({ duration, words, sub, subDigits, fontFamily }) => {";
  const fontSignature = "            fontFamily: SERIF, fontSize: 116, fontWeight: 600, lineHeight: 1.14,";
  const fontReplacement = "            fontFamily: fontFamily || SERIF, fontSize: 116, fontWeight: 600, lineHeight: 1.14,";
  if (!source.includes(signature) || !source.includes(fontSignature)) {
    throw new Error("上游 PaperTitleCard.tsx 已变化，拒绝猜测式打补丁");
  }
  fs.writeFileSync(file, source.replace(signature, replacement).replace(fontSignature, fontReplacement));
}

function writeGeneratedAdapter(workRoot, root) {
  const factoryDir = path.join(workRoot, "src", "factory");
  fs.mkdirSync(factoryDir, { recursive: true });
  const templateRoot = path.join(root, "templates", "shotcraft-direct-port");
  const copies = [
    ["factory-index.ts", path.join(workRoot, "src", "factory-index.ts")],
    ["Root.tsx", path.join(factoryDir, "Root.tsx")],
    ["ListStack.tsx", path.join(factoryDir, "ListStack.tsx")],
    ["RowEmbed.tsx", path.join(factoryDir, "RowEmbed.tsx")],
    ["ContinuousRelationScene.tsx", path.join(factoryDir, "ContinuousRelationScene.tsx")]
  ];
  for (const [source, target] of copies) {
    const sourceFile = path.join(templateRoot, source);
    if (!fs.existsSync(sourceFile)) throw new Error(`缺少 Shotcraft 适配模板: ${sourceFile}`);
    fs.copyFileSync(sourceFile, target);
  }
  fs.copyFileSync(
    path.join(root, "vendor/video-shotcraft/scene-recipes/_fixtures/Motion.tsx"),
    path.join(factoryDir, "Motion.tsx")
  );
  const routeInput = readContinuousRouteInput(root);
  if (routeInput) writeJson(path.join(root, CONTINUOUS_ROUTE_OUTPUT), buildVisualRoute(routeInput));
  fs.writeFileSync(path.join(factoryDir, "VisualRoute.ts"), continuousRouteModule(root));
  const stageDir = path.join(factoryDir, "stage");
  fs.mkdirSync(stageDir, { recursive: true });
  for (const file of STAGE_FILES) {
    const sourceFile = path.join(templateRoot, "stage", file);
    if (!fs.existsSync(sourceFile)) throw new Error(`缺少叙事舞台模板: ${sourceFile}`);
    fs.copyFileSync(sourceFile, path.join(stageDir, file));
  }
  const evidenceSource = path.join(root, NARRATIVE_JOB, "assets", "evidence");
  const evidenceTarget = path.join(workRoot, "public", "factory", "evidence");
  fs.mkdirSync(evidenceTarget, { recursive: true });
  if (fs.existsSync(evidenceSource)) {
    for (const file of fs.readdirSync(evidenceSource)) fs.copyFileSync(path.join(evidenceSource, file), path.join(evidenceTarget, file));
  }
  // 当前 job 的 A-roll 与物件按 slug 分目录放进 public/factory/<slug>/，多条视频共存
  const slug = path.basename(NARRATIVE_JOB);
  const jobAroll = path.join(root, NARRATIVE_JOB, "assets", "aroll.mp4");
  const jobMediaDir = path.join(workRoot, "public", "factory", slug);
  fs.mkdirSync(jobMediaDir, { recursive: true });
  if (fs.existsSync(jobAroll)) {
    const target = path.join(jobMediaDir, "aroll.mp4");
    if (fs.existsSync(target)) fs.rmSync(target);
    fs.linkSync(jobAroll, target);
  }
  for (const sub of ["evidence", "broll", "logos"]) {
    const src = path.join(root, NARRATIVE_JOB, "assets", sub);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(jobMediaDir, sub);
    fs.mkdirSync(dst, { recursive: true });
    for (const file of fs.readdirSync(src)) if (!file.endsWith(".json") && !file.endsWith(".log")) fs.copyFileSync(path.join(src, file), path.join(dst, file));
  }
  // 背景板：共享库 visual-assets/plates → public/factory/plates
  const platesSource = path.join(root, "visual-assets", "plates");
  const platesTarget = path.join(workRoot, "public", "factory", "plates");
  fs.mkdirSync(platesTarget, { recursive: true });
  if (fs.existsSync(platesSource)) for (const file of fs.readdirSync(platesSource)) if (file.endsWith(".png") || file.endsWith(".jpg")) fs.copyFileSync(path.join(platesSource, file), path.join(platesTarget, file));
  // 物件：先铺共享库 visual-assets/objects，再用本 job 的 keyed 覆盖（同 id 以 job 为准）
  const objectsTarget = path.join(workRoot, "public", "factory", "objects");
  fs.mkdirSync(objectsTarget, { recursive: true });
  for (const objectsSource of [path.join(root, "visual-assets", "objects"), path.join(root, NARRATIVE_JOB, "assets", "objects", "keyed")]) {
    if (!fs.existsSync(objectsSource)) continue;
    for (const file of fs.readdirSync(objectsSource)) if (file.endsWith(".png")) fs.copyFileSync(path.join(objectsSource, file), path.join(objectsTarget, file));
  }
  // 皮肤：按 plan.skin 写 Skin.ts（默认 glass；stage3d = 小Lin 式立体舞台）
  try {
    const planJson = JSON.parse(fs.readFileSync(path.join(root, NARRATIVE_JOB, "data", "scene-plan.json"), "utf8"));
    const skin = ["glass", "blueprint", "paper", "stage3d", "studio"].includes(planJson.skin) ? planJson.skin : "glass";
    const skinFile = path.join(factoryDir, "stage", "Skin.ts");
    fs.writeFileSync(skinFile, fs.readFileSync(skinFile, "utf8").replace(/= '(glass|blueprint|paper|stage3d|studio)';/, `= '${skin}';`));
    // 画布：按 plan.canvas 写 Canvas.ts（默认 1920×1080；竖屏 1080×1920）
    const cv = planJson.canvas && planJson.canvas.w > 0 && planJson.canvas.h > 0 ? planJson.canvas : { w: 1920, h: 1080 };
    const canvasFile = path.join(factoryDir, "stage", "Canvas.ts");
    const fs_ = Number(cv.focusScale) || 1.1, fsh = Number(cv.focusShift) || 270, ssh = Number(cv.splitShift) || 300;
    fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, "utf8").replace(/CANVAS = \{w: \d+, h: \d+\}/, `CANVAS = {w: ${cv.w}, h: ${cv.h}}`).replace(/FOCUS = \{scale: [\d.]+, shift: \d+\}/, `FOCUS = {scale: ${fs_}, shift: ${fsh}}`).replace(/SPLIT_SHIFT = \d+/, `SPLIT_SHIFT = ${ssh}`));
  } catch {}
  fs.writeFileSync(path.join(factoryDir, "NarrativePlan.ts"), compileNarrativeModule(root));
  // 旧 ContinuousRelationScene 只是型录兼容入口，不能让它绑死的样片
  // 阻塞当前 NarrativeStage job。历史样片被安全清理后，回退到当前 job A-roll。
  const legacyMediaSource = path.join(root, CONTINUOUS_SCENE_AROLL);
  const mediaSource = fs.existsSync(legacyMediaSource) ? legacyMediaSource : jobAroll;
  if (!fs.existsSync(mediaSource)) {
    // 参照样片与当前 job 都没有 A-roll（型录 job / 公开仓库）：工作区照常准备，缺片由渲染那一步自己报
    console.warn(`未找到连续场景 A-roll（参照 job 与当前 job 都没有），跳过挂载: ${jobAroll}`);
    return;
  }
  const mediaDir = path.join(workRoot, "public", "factory");
  const mediaTarget = path.join(mediaDir, "aroll.mp4");
  fs.mkdirSync(mediaDir, { recursive: true });
  if (fs.existsSync(mediaTarget)) fs.rmSync(mediaTarget);
  fs.linkSync(mediaSource, mediaTarget);
}

export function compileNarrativeModule(root = projectRoot()) {
  const jobDir = path.join(root, NARRATIVE_JOB);
  const plan = readJson(path.join(jobDir, "data", "scene-plan.json"));
  const captions = readJson(path.join(jobDir, "data", "captions.json"));
  const wordsFile = path.join(jobDir, "data", "words-timeline.json");
  applyMotionDefaults(plan, fs.existsSync(wordsFile) ? readJson(wordsFile).words : []);
  return planModuleSource(compilePlan(plan, captions));
}

// 只刷新工厂标记（源文件已按新模板同步时使用），不重建工作区
export function refreshInkPressMarker({ root = projectRoot() } = {}) {
  const sourceRoot = path.join(root, FAMILY_ROOT);
  const workRoot = path.join(root, WORK_ROOT);
  const provenance = readJson(path.join(sourceRoot, "PROVENANCE.json"));
  const markerPath = path.join(workRoot, MARKER);
  const current = fs.existsSync(markerPath) ? readJson(markerPath) : {};
  writeJson(markerPath, { ...current, signature: workspaceSignature(provenance, root), policy: { ...(current.policy || {}), generatedFiles: [...GENERATED_FILES].sort() } });
  return verifyInkPressWorkspace({ root });
}

function verifyLocalizationPatch(source, adapted, failures) {
  const reconstructed = adapted
    .replace("  subDigits?: string;\n  fontFamily?: string;\n}> = ({ duration, words, sub, subDigits, fontFamily }) => {", "  subDigits?: string;\n}> = ({ duration, words, sub, subDigits }) => {")
    .replace("            fontFamily: fontFamily || SERIF, fontSize: 116, fontWeight: 600, lineHeight: 1.14,", "            fontFamily: SERIF, fontSize: 116, fontWeight: 600, lineHeight: 1.14,");
  if (reconstructed !== source) failures.push(`${LOCALIZATION_PATCH_FILE} 含超出中文字体入口的改动`);
}

function fileMap(dir, { ignore = new Set(), ignorePrefixes = [] } = {}) {
  const entries = walk(dir).map((file) => path.relative(dir, file).split(path.sep).join(path.posix.sep));
  return new Map(entries
    .filter((relative) => !ignore.has(relative))
    .filter((relative) => !ignorePrefixes.some((prefix) => relative.startsWith(prefix)))
    .map((relative) => [relative, sha256(path.join(dir, relative))]));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function workspaceSignature(provenance, root) {
  const templateRoot = path.join(root, "templates", "shotcraft-direct-port");
  const templates = [...fileMap(templateRoot)].sort(([a], [b]) => a.localeCompare(b));
  return crypto.createHash("sha256").update(JSON.stringify({
    adapterVersion: 15,
    upstreamRevision: provenance.revision,
    files: provenance.files,
    templates,
    routeInput: fs.existsSync(path.join(root, CONTINUOUS_ROUTE_INPUT)) ? sha256(path.join(root, CONTINUOUS_ROUTE_INPUT)) : "absent",
    narrativeJob: NARRATIVE_JOB,
    narrativePlan: sha256(path.join(root, NARRATIVE_JOB, "data", "scene-plan.json")),
    narrativeCaptions: sha256(path.join(root, NARRATIVE_JOB, "data", "captions.json")),
    sceneRecipeProvenance: sha256(path.join(root, "vendor/video-shotcraft/scene-recipes/PROVENANCE.json")),
    stageMotions: sha256(path.join(root, "visual-recipes/stage-motions.json"))
  })).digest("hex");
}
