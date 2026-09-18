import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { prepareInkPressWorkspace, verifyInkPressWorkspace } from "./shotcraft-direct-port.mjs";

test("Shotcraft 适配层保持 58 个上游文件原样，只开放中文字体与内容入口", () => {
  const prepared = prepareInkPressWorkspace();
  assert.equal(prepared.report.ok, true, prepared.report.failures.join("\n"));
  const result = verifyInkPressWorkspace();
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.localizedSourceFiles, 1);
  assert.equal(result.unchangedSourceFiles >= 58, true);
  assert.equal(result.generatedAdapterFiles, 45);
  const planModule = fs.readFileSync(path.join(prepared.workRoot, "src/factory/NarrativePlan.ts"), "utf8");
  assert.match(planModule, /NARRATIVE_PLAN: NarrativePlan/);
  assert.match(planModule, /"type": "graph"/);
  const routeModule = fs.readFileSync(path.join(prepared.workRoot, "src/factory/VisualRoute.ts"), "utf8");
  assert.match(routeModule, /semantic-intent-to-approved-scene-v1/);
  assert.match(routeModule, /diagram-cascade-build/);
  assert.match(routeModule, /bezier-source-converge-merge/);
  assert.equal(
    fs.readFileSync(path.join(prepared.workRoot, "src/factory/Motion.tsx"), "utf8"),
    fs.readFileSync(path.join(path.dirname(prepared.sourceRoot), "scene-recipes/_fixtures/Motion.tsx"), "utf8")
  );
});

test("列表计数器只在已落地数量之间切换，不复用全局帧数字轮", () => {
  const prepared = prepareInkPressWorkspace();
  const source = fs.readFileSync(path.join(prepared.workRoot, "src/factory/ListStack.tsx"), "utf8");
  assert.match(source, /StableLandedCounter/);
  assert.doesNotMatch(source, /import \{DigitRoll\}/);
  assert.match(source, /previous = Math\.max\(0, count - 1\)/);
});

test("行嵌入与列表压弹必须直接挂载上游 PageCam 和原始页面坐标", () => {
  const prepared = prepareInkPressWorkspace();
  const row = fs.readFileSync(path.join(prepared.workRoot, "src/factory/RowEmbed.tsx"), "utf8");
  const list = fs.readFileSync(path.join(prepared.workRoot, "src/factory/ListStack.tsx"), "utf8");

  for (const [label, source] of [["row", row], ["list", list]]) {
    assert.match(source, /import \{CamKey, PageCam\} from '\.\.\/aifl\/live\/PageCam'/, `${label} 未导入上游 PageCam`);
    assert.match(source, /<PageCam/, `${label} 未挂载上游 PageCam`);
    assert.match(source, /from '\.\.\/aifl\/live-layout\.json'/, `${label} 未读取上游页面坐标`);
  }
  assert.match(row, /const DETAIL_CAM: CamKey\[\]/);
  assert.match(row, /layout\.detail\.rows/);
  assert.match(row, /\{frame: 0, cx: 960, cy: 300, zoom: 1\.1\}/);
  assert.match(row, /\{frame: 75, cx: 960, cy: 760, zoom: 1\.0\}/);
  assert.match(row, /Easing\.bezier\(0\.3, 0, 0\.25, 1\)/);
  assert.match(row, /const cue = 12 \+ i \* 9/);
  assert.match(row, /rotateX\(\$\{16 \* air\}deg\)/);
  assert.match(list, /const CAMERA_KEYS: CamKey\[\]/);
  assert.match(list, /layout\.papers\.cards/);
  assert.match(list, /const CUES = \[18, 30, 42, 54, 66\]/);
  assert.match(list, /const DUR = 22/);
  assert.match(list, /const TILTS = \[2, -2, 2, -2, 2\]/);
  assert.match(list, /Easing\.bezier\(0\.45, 0\.05, 0\.25, 1\.12\)/);
  assert.match(list, /\{frame: 100, cx: 960, cy: 860, zoom: 0\.9\}/);
  assert.match(list, /\[82, 96\], \[-700, 2600\]/);
});

test("舞台组件不写死落在强调面上的文字色（统一走 ON_ACCENT）", () => {
  const dir = new URL("../templates/shotcraft-direct-port/stage/", import.meta.url);
  const offenders = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx") && !["DataFocus.tsx", "Gallery.tsx"].includes(f)).filter((f) => fs.readFileSync(new URL(f, dir), "utf8").includes("'#141416'"));
  assert.deepEqual(offenders, []);
});
