import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  atomicReplaceDir,
  cacheIsReady,
  cellKey,
  hashValue,
  initialCellStatus,
  injectPreviewShell,
  legacyCellKey,
  makeCellHash,
  parseCsv,
  selectFixtureIds,
  stableStringify,
  tempTestDir
} from "./visual-preview-lib.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("stableStringify 不受对象 key 顺序影响", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(hashValue({ b: 2, a: 1 }), hashValue({ a: 1, b: 2 }));
});

test("cell hash 覆盖七类强制输入", () => {
  const base = {
    component: "c1",
    fixture: "x1",
    theme: "t1",
    format: "f1",
    builder: "b1",
    runtime: "r1",
    proxy: "p1"
  };
  const original = makeCellHash(base);
  for (const key of Object.keys(base)) {
    assert.notEqual(makeCellHash({ ...base, [key]: `${base[key]}-changed` }), original, key);
  }
  assert.throws(() => makeCellHash({ ...base, proxy: "" }), /proxy/);
});

test("cell key 把 fixture 作为独立维度并保留旧 key 读取入口", () => {
  assert.equal(cellKey("statement", "long", "warm-glass", "portrait"), "statement/long/warm-glass/portrait");
  assert.equal(legacyCellKey("statement", "warm-glass", "portrait"), "statement/warm-glass/portrait");
});

test("CSV 过滤去重并支持 all", () => {
  assert.deepEqual(parseCsv("a,b,a", ["x"]), ["a", "b"]);
  assert.deepEqual(parseCsv("all", ["x", "y"]), ["x", "y"]);
});

test("fixture 默认全选，显式过滤时只保留请求项", () => {
  const fixtures = [{ id: "default" }, { id: "long" }];
  assert.deepEqual(selectFixtureIds(fixtures), ["default", "long"]);
  assert.deepEqual(selectFixtureIds(fixtures, ["long"]), ["long"]);
  assert.deepEqual(selectFixtureIds([]), ["default"]);
});

test("generator fingerprint 明确覆盖视觉代码、字体、GSAP、主题、fixture 与 Chrome", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "visual-preview-generate.mjs"), "utf8");
  for (const marker of [
    "build-beats-composition.mjs",
    "visual-preview-generate.mjs",
    "visual-preview-lib.mjs",
    '"_shared", "fonts"',
    '"_shared", "vendor", "gsap.min.js"',
    '"theme.json"',
    '"overrides.css"',
    "fixture: fixture ? hashValue",
    "detectChromeRuntime()",
    "runtime: context.runtime"
  ]) assert.ok(source.includes(marker), marker);
});

test("中断的 rendering 与输入变化都会转 stale", () => {
  assert.equal(initialCellStatus({ hash: "same", status: "rendering" }, "same"), "stale");
  assert.equal(initialCellStatus({ hash: "old", status: "ready" }, "new"), "stale");
  assert.equal(initialCellStatus({ hash: "same", status: "ready" }, "same"), "ready");
});

test("原子替换失败前保留 last-good 目录语义", () => {
  const root = tempTestDir();
  const stage = path.join(root, "stage");
  const target = path.join(root, "target");
  fs.mkdirSync(stage);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(stage, "value"), "new");
  fs.writeFileSync(path.join(target, "value"), "old");
  atomicReplaceDir(stage, target);
  assert.equal(fs.readFileSync(path.join(target, "value"), "utf8"), "new");
  fs.rmSync(root, { recursive: true, force: true });
});

test("cache ready 会按 poster 门禁区分 html-only", () => {
  const root = tempTestDir();
  fs.writeFileSync(path.join(root, "index.html"), "ok");
  fs.writeFileSync(path.join(root, "result.json"), JSON.stringify({ status: "ready" }));
  assert.equal(cacheIsReady(root, false), true);
  assert.equal(cacheIsReady(root, true), false);
  fs.writeFileSync(path.join(root, "poster.webp"), "ok");
  assert.equal(cacheIsReady(root, true), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("preview shell 只注入一次并保留 production timeline", () => {
  const html = '<html><head></head><body><div id="main" data-width="1080" data-height="1920"></div><script>window.__timelines["main"] = tl;</script></body></html>';
  const injected = injectPreviewShell(html);
  assert.match(injected, /id="visual-preview-shell"/);
  assert.match(injected, /Math\.min\(innerWidth \/ width, innerHeight \/ height\)/);
  assert.match(injected, /main\.style\.left/);
  assert.match(injected, /main\.style\.top/);
  assert.match(injected, /addEventListener\("resize", fit/);
  assert.match(injected, /timeline\.time\(time, false\)\.pause/);
  assert.match(injected, /item\.play\(\)\.catch/);
  assert.match(injected, /visual-preview:restart/);
  assert.match(injected, /event\.source === parent/);
  assert.match(injected, /prefers-reduced-motion/);
  assert.match(injected, /window\.__timelines\["main"\] = tl/);
  assert.equal(injectPreviewShell(injected), injected);
});
