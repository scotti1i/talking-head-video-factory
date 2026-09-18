import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot, writeJson } from "./lib.mjs";

const SOURCE_ROOT = (process.env.SHOTCRAFT_SOURCE || (process.env.HOME || "") + "/.codex/skills/video-shotcraft");
const TARGET_RELATIVE = "vendor/video-shotcraft/scene-recipes";
const FILES = [
  ["demos/interaction/canvas-materialize-moves/DiagramCascadeBuild.tsx", "DiagramCascadeBuild.tsx"],
  ["demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.tsx", "BezierSourceConvergeMerge.tsx"],
  ["demos/transition/transition-travel/SharedElementMorph.tsx", "SharedElementMorph.tsx"],
  ["demos/_fixtures/Motion.tsx", "_fixtures/Motion.tsx"],
  ["demos/_fixtures/Fixtures.tsx", "_fixtures/Fixtures.tsx"],
  // 2026-09-02 叙事舞台第二批：按全片剪辑暴露的缺口选入（文字 / 物件 / 判定 / 证据 / 数据 / 关系 / 交接 / 背景）
  ["demos/typography/blur-slide/BlurSlide.tsx", "BlurSlide.tsx"],
  ["demos/typography/type-rhythm-sync/KaraokeFillSync.tsx", "KaraokeFillSync.tsx"],
  ["demos/typography/marker-underline-title/MarkerUnderlineTitle.tsx", "MarkerUnderlineTitle.tsx"],
  ["demos/ui-entrance/element-body-moves/ContactShadowLift.tsx", "ContactShadowLift.tsx"],
  ["demos/ui-entrance/morph-from-primitive/MorphFromPrimitive.tsx", "MorphFromPrimitive.tsx"],
  ["demos/effects/slam-entrance-moves/ScoreSlam.tsx", "ScoreSlam.tsx"],
  ["demos/effects/icon-performance-moves/PopBurstConfirm.tsx", "PopBurstConfirm.tsx"],
  ["demos/effects/scanline-annotate-focus/ScanlineAnnotateFocus.tsx", "ScanlineAnnotateFocus.tsx"],
  ["demos/camera/crash-zoom-punch/CrashZoomReal.tsx", "CrashZoomReal.tsx"],
  ["demos/data/odometer-digit-roll/OdometerDigitRoll.tsx", "OdometerDigitRoll.tsx"],
  ["demos/data/before-after-slider-scrub/BeforeAfterSliderScrub.tsx", "BeforeAfterSliderScrub.tsx"],
  ["demos/data/hatch-depth/HatchDepth.tsx", "HatchDepth.tsx"],
  ["demos/ui-entrance/integration-hub-map/IntegrationHubMap.tsx", "IntegrationHubMap.tsx"],
  ["demos/effects/glow-flyline-moves/FlylineArc.tsx", "FlylineArc.tsx"],
  ["demos/transition/line-carry-transition/LineCarryTransition.tsx", "LineCarryTransition.tsx"],
  ["demos/transition/circle-match-iris/CircleMatchIris.tsx", "CircleMatchIris.tsx"],
  ["demos/camera/depth-layer-moves/MultiplaneReal.tsx", "MultiplaneReal.tsx"],
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function syncShotcraftSceneRecipes({root = projectRoot(), sourceRoot = SOURCE_ROOT} = {}) {
  const targetRoot = path.join(root, TARGET_RELATIVE);
  if (fs.existsSync(targetRoot)) {
    const current = verifyShotcraftSceneRecipes({root, sourceRoot});
    if (current.ok) return {...current, targetRoot, reused: true};
    // 只允许"补齐缺失文件"；已有文件若与上游不一致，仍然拒绝
    const drift = current.failures.filter((line) => !line.startsWith("缺少 vendored 文件"));
    if (drift.length) throw new Error(`Shotcraft scene recipes 已存在但发生漂移:\n- ${drift.join("\n- ")}`);
  }

  fs.mkdirSync(targetRoot, {recursive: true});
  const records = FILES.map(([sourceRelative, targetRelative]) => {
    const source = path.join(sourceRoot, sourceRelative);
    const target = path.join(targetRoot, targetRelative);
    if (!fs.existsSync(source)) throw new Error(`缺少 Shotcraft 源文件: ${source}`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target);
    return {source: sourceRelative, target: targetRelative, sha256: sha256(source)};
  });
  writeJson(path.join(targetRoot, "PROVENANCE.json"), {
    schemaVersion: 1,
    source: "https://github.com/Vincentwei1021/video-shotcraft",
    license: "Apache-2.0",
    licenseFile: "../LICENSE",
    policy: "pristine-upstream-motion-recipes-do-not-edit",
    files: records,
  });
  return {ok: true, failures: [], targetRoot, files: records, reused: false};
}

export function verifyShotcraftSceneRecipes({root = projectRoot(), sourceRoot = SOURCE_ROOT} = {}) {
  const targetRoot = path.join(root, TARGET_RELATIVE);
  const failures = [];
  if (!fs.existsSync(targetRoot)) return {ok: false, failures: [`缺少 ${targetRoot}`], files: []};
  const records = FILES.map(([sourceRelative, targetRelative]) => {
    const source = path.join(sourceRoot, sourceRelative);
    const target = path.join(targetRoot, targetRelative);
    if (!fs.existsSync(source)) failures.push(`缺少上游源文件: ${sourceRelative}`);
    if (!fs.existsSync(target)) failures.push(`缺少 vendored 文件: ${targetRelative}`);
    const sourceHash = fs.existsSync(source) ? sha256(source) : null;
    const targetHash = fs.existsSync(target) ? sha256(target) : null;
    if (sourceHash && targetHash && sourceHash !== targetHash) failures.push(`vendored 文件不是逐字节原件: ${targetRelative}`);
    return {source: sourceRelative, target: targetRelative, sha256: sourceHash};
  });
  return {ok: failures.length === 0, failures, files: records};
}

function main() {
  const command = process.argv[2] || "verify";
  const result = command === "sync" ? syncShotcraftSceneRecipes() : verifyShotcraftSceneRecipes();
  if (!result.ok) {
    console.error(`Shotcraft scene recipes 校验失败:\n- ${result.failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Shotcraft scene recipes 通过: ${result.files.length} 个逐字节上游文件${result.reused ? "（复用）" : ""}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
