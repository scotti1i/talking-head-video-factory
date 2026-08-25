import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileIntro } from "./index.mjs";

const SQUARE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6iooorUyP/9k=",
  "base64"
);

const TOKENS = {
  pageBg: "#0d141c", text: "#f7f7f4", textBody: "#cdd7df", accent: "#e8542f",
  kicker: "#85d4ce", cardBg: "#18222dcc", cardBorder: "#9fc2d655",
  chipBg: "#243341", chipBorder: "#9fc2d633", mutedBg: "#415363",
  radius: "16px", cardShadow: "0 18px 42px rgba(0,0,0,.35)",
  vignette: "radial-gradient(circle, transparent, rgba(0,0,0,.38))"
};

function context(jobDir, overrides = {}) {
  return {
    jobDir,
    width: 1080,
    height: 1920,
    totalDuration: 100,
    configTitle: "Arctic White 上市物料",
    sourceVideo: "assets/aroll.mp4",
    theme: { tokens: TOKENS },
    ...overrides
  };
}

function galleryFixture(t, overrides = {}) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "intro-gallery-"));
  t.after(() => fs.rmSync(jobDir, { recursive: true, force: true }));
  const assetDir = path.join(jobDir, "assets", "intro-gallery");
  fs.mkdirSync(assetDir, { recursive: true });
  const assets = Array.from({ length: 16 }, (_, index) => `assets/intro-gallery/${pad(index + 1)}.jpg`);
  for (const asset of assets) fs.writeFileSync(path.join(jobDir, asset), SQUARE_JPEG);
  return {
    jobDir,
    value: {
      enabled: true,
      mode: "gallery",
      duration: 8,
      title: "一句话，十几分钟，整套交付",
      assets,
      heroIndex: 0,
      focusIndices: [5, 10, 12],
      speakerPip: true,
      ...overrides
    }
  };
}

function nonSquareJpeg(width, height) {
  const buffer = Buffer.from(SQUARE_JPEG);
  const marker = buffer.indexOf(Buffer.from([0xff, 0xc0]));
  assert.notEqual(marker, -1);
  buffer.writeUInt16BE(height, marker + 5);
  buffer.writeUInt16BE(width, marker + 7);
  return buffer;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

test("disabled intro returns null without requiring context", () => {
  assert.equal(compileIntro({ enabled: false }), null);
  assert.equal(compileIntro(null), null);
});

test("title-slam preserves the legacy intro contract", () => {
  const result = compileIntro({
    enabled: true, mode: "title-slam", duration: 5.2,
    number: "50", series: "天 · 50个AI应用", episode: "DAY 01 / 50",
    title: "品牌物料", flow: ["提需求", "等成品"]
  }, context("."));
  assert.deepEqual(Object.keys(result), ["data", "headHtml", "bodyHtml", "cssText", "timelineJs", "motionSpec"]);
  assert.equal(result.data.duration, 5.2);
  assert.match(result.bodyHtml, /id="intro-series-number">50<\/span>/);
  assert.match(result.bodyHtml, /提需求<\/span><i class="intro-flow-arrow">→<\/i>/);
  assert.match(result.cssText, /#intro-progress-fill/);
  assert.match(result.timelineJs, /tl\.set\(videoWrap/);
  assert.deepEqual(result.motionSpec.assertions.at(-1), { kind: "staysInFrame", selector: "#day-anchor" });
});

test("floating-object preserves defaults and finite drift", () => {
  const result = compileIntro({ enabled: true, mode: "floating-object", title: "品牌物料" }, context("."));
  assert.equal(result.data.duration, 1.45);
  assert.match(result.bodyHtml, /src="data:image\/svg\+xml;charset=utf-8,/);
  assert.match(result.timelineJs, /repeat: 1, yoyo: true/);
  assert.match(result.timelineJs, /tl\.set\("#intro-object-wrap", \{ autoAlpha: 0 \}, 1\.42\)/);
  assert.equal(result.motionSpec.duration, 1.45);
});

test("gallery compiles one deterministic 16-card 8-second scene", (t) => {
  const fixture = galleryFixture(t);
  const result = compileIntro(fixture.value, context(fixture.jobDir));
  assert.deepEqual(Object.keys(result), ["data", "headHtml", "bodyHtml", "cssText", "timelineJs", "motionSpec"]);
  assert.equal(result.data.duration, 8);
  assert.equal(result.data.assets.length, 16);
  assert.equal(result.data.focusIndices.length, 3);
  assert.equal(countMatches(result.headHtml, /<link /g), 16);
  assert.equal(countMatches(result.bodyHtml, /class="gallery-card"/g), 16);
  assert.equal(countMatches(result.bodyHtml, /<img /g), 16);
  assert.equal(countMatches(result.bodyHtml, /<video /g), 1);
  assert.match(result.bodyHtml, /id="intro-speaker-pip"[^>]+data-media-start="0"/);
  assert.match(result.bodyHtml, /id="intro-speaker-ring" class="clip"[^>]+data-manual-timeline="true"[^>]+data-track-index="8"/);
  assert.match(result.bodyHtml, /role="img" aria-label="一句话，十几分钟，整套交付，16 张品牌物料展示"/);
  assert.match(result.cssText, /perspective: 1600px/);
  assert.match(result.cssText, /width: 768px; height: 768px/);
  assert.doesNotMatch(result.cssText, /filter: blur\(var\(--gallery-dof\)\)/);
  assert.match(result.timelineJs, /addLabel\("gallery-lock", 7\.20\)/);
  assert.match(result.timelineJs, /galleryRasterScale = 0\.222656/);
  assert.match(result.timelineJs, /scale: 4\.55 \* galleryRasterScale/);
  assert.match(result.timelineJs, /galleryDetailStarts = \[1\.55, 2\.62, 3\.69\]/);
  assert.match(result.timelineJs, /clipPath: "circle\(1380px at 540px 960px\)"/);
  assert.doesNotThrow(() => new Function(result.timelineJs));
});

test("gallery output is seek-safe and byte-for-byte deterministic", (t) => {
  const fixture = galleryFixture(t);
  const first = compileIntro(fixture.value, context(fixture.jobDir));
  const second = compileIntro(structuredClone(fixture.value), context(fixture.jobDir));
  assert.deepEqual(second, first);
  assert.doesNotMatch(first.timelineJs, /Math\.random|Date\.now|performance\.now/);
  assert.doesNotMatch(first.timelineJs, /setTimeout|setInterval|requestAnimationFrame/);
  assert.doesNotMatch(first.timelineJs, /\.play\s*\(|repeat\s*:\s*-1/);
});

test("gallery rejects invalid duration, count, indices, and frame", async (t) => {
  await t.test("duration must be exactly eight", (child) => {
    const fixture = galleryFixture(child, { duration: 7.99 });
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), /严格等于 8/);
  });
  await t.test("asset count must be exactly sixteen", (child) => {
    const fixture = galleryFixture(child);
    fixture.value.assets.pop();
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), /恰好包含 16/);
  });
  await t.test("hero and focus indices must be distinct", (child) => {
    const fixture = galleryFixture(child, { focusIndices: [0, 5, 10] });
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), /三张不同图片/);
  });
  await t.test("only portrait 9:16 is accepted", (child) => {
    const fixture = galleryFixture(child);
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir, { width: 1920, height: 1080 })), /只支持 9:16/);
  });
});

test("gallery legacy two focus indices deterministically derives a third detail", (t) => {
  const fixture = galleryFixture(t, { heroIndex: 0, focusIndices: [5, 10] });
  const result = compileIntro(fixture.value, context(fixture.jobDir));
  assert.deepEqual(result.data.focusIndices, [5, 10, 1]);
});

test("gallery rejects unsafe, duplicate, missing, and non-square assets", async (t) => {
  await t.test("network path", (child) => assertAssetError(child, "https://example.com/a.jpg", /本地路径/));
  await t.test("path traversal", (child) => assertAssetError(child, "../outside.jpg", /job\/assets/));
  await t.test("non JPEG extension", (child) => assertAssetError(child, "assets/intro-gallery/01.png", /只允许/));
  await t.test("missing JPEG", (child) => assertAssetError(child, "assets/intro-gallery/missing.jpg", /不存在/));
  await t.test("duplicate JPEG", (child) => {
    const fixture = galleryFixture(child);
    fixture.value.assets[1] = fixture.value.assets[0];
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), /不允许重复/);
  });
  await t.test("non-square JPEG", (child) => {
    const fixture = galleryFixture(child);
    fs.writeFileSync(path.join(fixture.jobDir, fixture.value.assets[3]), nonSquareJpeg(16, 8));
    assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), /必须为方图，实际 16x8/);
  });
});

function assertAssetError(t, badAsset, pattern) {
  const fixture = galleryFixture(t);
  fixture.value.assets[0] = badAsset;
  assert.throws(() => compileIntro(fixture.value, context(fixture.jobDir)), pattern);
}
