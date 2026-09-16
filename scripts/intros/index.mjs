import fs from "node:fs";
import path from "node:path";

import { escapeHtml, fmtTime } from "../lib.mjs";

const GALLERY_COUNT = 16;
const GALLERY_DURATION = 8;
const GALLERY_RASTER_CARD = 768;
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const INTRO_COMPILERS = new Map([
  ["title-slam", compileTitleSlam],
  ["floating-object", compileFloatingObject],
  ["gallery", compileGallery]
]);

export function compileIntro(value, context = {}) {
  if (!value?.enabled) return null;
  const normalizedContext = normalizeContext(context);
  const mode = String(value.mode || "title-slam");
  const compiler = INTRO_COMPILERS.get(mode);
  if (!compiler) throw new Error(`intro.mode 不支持 ${mode}`);
  return compiler(value, normalizedContext);
}

function normalizeContext(context) {
  const width = Number(context.width || 1080);
  const height = Number(context.height || 1920);
  const totalDuration = Number(context.totalDuration);
  if (!(width > 0) || !(height > 0)) throw new Error("intro context 需要有效 width/height");
  if (!(totalDuration > 0)) throw new Error("intro context 需要有效 totalDuration");
  if (!context.theme?.tokens) throw new Error("intro context 需要 theme.tokens");
  return {
    ...context,
    width,
    height,
    totalDuration,
    jobDir: path.resolve(context.jobDir || "."),
    configTitle: String(context.configTitle || "")
  };
}

function compileTitleSlam(value, context) {
  const data = normalizeLegacyData(value, context, "title-slam");
  if (!data.flow.length) throw new Error("title-slam intro 需要至少一个 flow 项");
  return artifact({
    data,
    bodyHtml: titleSlamBodyHtml(data),
    cssText: titleSlamCssText(context.theme.tokens),
    timelineJs: titleSlamTimelineJs(context),
    motionSpec: titleSlamMotionSpec(data)
  });
}

function compileFloatingObject(value, context) {
  const data = normalizeLegacyData(value, context, "floating-object");
  const objectSrc = data.asset || introObjectDataUri(data, context.theme.tokens);
  return artifact({
    data,
    bodyHtml: floatingObjectBodyHtml(data, objectSrc),
    cssText: floatingObjectCssText(),
    timelineJs: floatingObjectTimelineJs(data),
    motionSpec: floatingObjectMotionSpec(data)
  });
}

function normalizeLegacyData(value, context, mode) {
  const floating = mode === "floating-object";
  const minimumDuration = floating ? 1.4 : 4.2;
  const defaultDuration = floating ? 1.45 : 5.2;
  const flow = Array.isArray(value.flow) ? value.flow.map(String).filter(Boolean).slice(0, 5) : [];
  const data = {
    mode,
    duration: Math.min(Math.max(minimumDuration, Number(value.duration) || defaultDuration), context.totalDuration),
    asset: value.asset ? String(value.asset) : null,
    number: String(value.number || "50"),
    series: String(value.series || "天 · 50个AI应用"),
    episode: String(value.episode || "DAY 01 / 50"),
    title: String(value.title || context.configTitle || ""),
    flow
  };
  if (!data.title) throw new Error("intro 需要 title");
  return data;
}

function artifact({ data, headHtml = "", bodyHtml, cssText, timelineJs, motionSpec }) {
  return { data, headHtml, bodyHtml, cssText, timelineJs, motionSpec };
}

function titleSlamBodyHtml(data) {
  const flow = data.flow
    .map((item, index) => `<span class="intro-flow-item" data-intro-flow="${index + 1}">${escapeHtml(item)}</span>`)
    .join('<i class="intro-flow-arrow">→</i>');
  return `<div id="intro-host" ${clipAttrs(data)} aria-hidden="true">
    <div id="intro-surface"></div><div id="intro-glow" data-layout-allow-overflow></div>
    <div id="intro-rule-x"></div><div id="intro-rule-y"></div>
    <div id="intro-copy">
      <div id="intro-series"><span id="intro-series-number">${escapeHtml(data.number)}</span><span id="intro-series-rest">${escapeHtml(data.series)}</span></div>
      <h1 id="intro-main-title">${escapeHtml(data.title)}</h1><div id="intro-flow">${flow}</div>
      <div id="intro-progress"><b id="intro-progress-fill"></b></div>
      <div id="intro-meta">OPEN SOURCE · PRODUCT SYSTEM · 2026</div>
    </div>
    <div id="day-anchor"><span>${escapeHtml(data.episode)}</span><i></i></div>
  </div>`;
}

function floatingObjectBodyHtml(data, objectSrc) {
  return `<div id="intro-host" ${clipAttrs(data)} aria-hidden="true">
    <div id="intro-object-wrap" data-layout-allow-overflow>
      <img id="intro-object" src="${escapeHtml(objectSrc)}" alt="" />
    </div>
  </div>`;
}

function clipAttrs(data) {
  return `class="clip intro-overlay" data-start="0" data-duration="${fmtTime(data.duration)}" data-track-index="6"`;
}

function introObjectDataUri(data, tokens) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="438" height="582" viewBox="0 0 438 582">
    <defs><filter id="shadow" x="-30%" y="-20%" width="160%" height="170%"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#12100c" flood-opacity="0.30"/></filter></defs>
    <g filter="url(#shadow)"><rect x="2" y="2" width="434" height="578" rx="34" fill="${tokens.cardBg}" stroke="${tokens.cardBorder}" stroke-width="2"/>
      <rect x="24" y="24" width="390" height="326" rx="25" fill="${tokens.chipBg}" stroke="${tokens.chipBorder}"/><rect x="333" y="42" width="67" height="32" rx="9" fill="${tokens.mutedBg}"/>
      <text x="366.5" y="64" text-anchor="middle" fill="${tokens.textBody}" font-family="Inter, FactoryCJK, sans-serif" font-size="18" font-weight="700" letter-spacing="0.7">${escapeHtml(data.episode)}</text>
      <text x="213" y="292" text-anchor="middle" fill="${tokens.text}" font-family="Inter, FactoryCJK, sans-serif" font-size="188" font-weight="700" letter-spacing="-12">${escapeHtml(data.number)}</text>
      <text x="31" y="392" fill="${tokens.textBody}" font-family="FactoryCJK, sans-serif" font-size="29" font-weight="700" letter-spacing="-0.7">${escapeHtml(data.series)}</text>
      <text x="31" y="451" fill="${tokens.text}" font-family="FactoryCJK, sans-serif" font-size="36" font-weight="700" letter-spacing="-1">${escapeHtml(data.title)}</text>
    </g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function floatingObjectCssText() {
  return `#intro-host { position: absolute; inset: 0; z-index: 6; overflow: hidden; pointer-events: none; }
    #intro-object-wrap { position: absolute; left: 142px; top: 166px; width: 438px; height: 582px; transform-origin: 46% 54%; will-change: transform, opacity; }
    #intro-object { display: block; width: 100%; height: 100%; }`;
}

function titleSlamCssText(tokens) {
  return `#intro-host { position: absolute; inset: 0; z-index: 6; overflow: hidden; pointer-events: none; }
    #intro-surface { position: absolute; inset: 0; background: ${tokens.pageBg}; opacity: 0; }
    #intro-glow { position: absolute; left: -180px; top: -220px; width: 1120px; height: 1120px; border-radius: 50%; opacity: 0; transform-origin: 42% 48%; background: radial-gradient(circle, rgba(159, 194, 214, 0.24) 0%, rgba(159, 194, 214, 0.08) 38%, rgba(13, 20, 28, 0) 70%); }
    #intro-rule-x { position: absolute; left: 0; right: 0; top: 116px; height: 2px; background: rgba(159, 194, 214, 0.28); transform-origin: left center; }
    #intro-rule-y { position: absolute; left: 88px; top: 0; bottom: 0; width: 2px; background: rgba(159, 194, 214, 0.22); transform-origin: center top; }
    #intro-copy { position: absolute; left: 120px; right: 96px; top: 188px; color: ${tokens.text}; }
    #intro-series { display: flex; align-items: baseline; min-height: 250px; white-space: nowrap; overflow: visible; }
    #intro-series-number { display: inline-block; color: ${tokens.text}; font-family: Inter, FactoryCJK, sans-serif; font-size: 260px; line-height: 0.82; font-weight: 700; letter-spacing: -0.04em; transform-origin: left center; will-change: transform, filter, opacity; }
    #intro-series-rest { display: inline-block; margin-left: 30px; color: ${tokens.text}; font-family: Inter, FactoryCJK, sans-serif; font-size: 106px; line-height: 0.92; font-weight: 700; letter-spacing: -0.035em; will-change: transform, filter, opacity; }
    #intro-main-title { display: block; width: 100%; margin: 30px 0 0; color: ${tokens.text}; font-size: 76px; line-height: 1.02; font-weight: 700; letter-spacing: -0.03em; will-change: transform, opacity; }
    #intro-flow { display: flex; align-items: center; gap: 18px; margin-top: 42px; color: ${tokens.textBody}; font-size: 31px; line-height: 1; font-weight: 700; }
    .intro-flow-item, .intro-flow-arrow { display: inline-block; will-change: transform, opacity; }
    .intro-flow-arrow { color: ${tokens.accent}; font-style: normal; }
    #intro-progress { width: 760px; height: 4px; margin-top: 38px; background: rgba(159, 194, 214, 0.18); overflow: hidden; }
    #intro-progress-fill { display: block; width: 100%; height: 100%; background: ${tokens.accent}; transform-origin: left center; }
    #intro-meta { margin-top: 20px; color: ${tokens.kicker}; font-family: Inter, sans-serif; font-size: 20px; line-height: 1; letter-spacing: 0.12em; }
    #day-anchor { position: absolute; left: 120px; top: 96px; width: 230px; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; color: ${tokens.text}; background: rgba(22, 30, 40, 0.94); border: 1px solid rgba(159, 194, 214, 0.42); border-radius: 14px; transform-origin: left top; will-change: transform, opacity; }
    #day-anchor span { font-family: Inter, sans-serif; font-size: 21px; font-weight: 700; letter-spacing: 0.04em; }
    #day-anchor i { display: block; width: 9px; height: 9px; border-radius: 50%; background: ${tokens.accent}; box-shadow: 0 0 0 5px rgba(232, 84, 47, 0.16); }`;
}

function floatingObjectTimelineJs(data) {
  const exitStart = Math.max(0.9, data.duration - 0.34);
  const exitEnd = Math.max(exitStart + 0.2, data.duration - 0.03);
  return `tl.fromTo("#intro-object-wrap", { x: -104, y: 14, scale: 1.20, rotation: -4.4, opacity: 0 }, { x: 0, y: 0, scale: 1, rotation: -1.2, opacity: 1, duration: 0.36, ease: "expo.out" }, 0.06);
    tl.to("#intro-object-wrap", { y: -6, rotation: -0.7, duration: 1.9, repeat: 1, yoyo: true, ease: "sine.inOut" }, 0.50);
    tl.to("#intro-object-wrap", { x: -620, duration: 0.31, ease: "expo.in" }, ${fmtTime(exitStart)});
    tl.set("#intro-object-wrap", { autoAlpha: 0 }, ${fmtTime(exitEnd)});`;
}

function titleSlamTimelineJs(context) {
  const anchorScale = 0.78;
  const anchorX = Math.round(context.width - 56 - 230 * anchorScale - 120);
  const anchorY = 52 - 96;
  return `tl.fromTo("#intro-surface", { opacity: 0 }, { opacity: 0.96, duration: 0.22, ease: "power2.out" }, 0.08);
    tl.fromTo("#intro-glow", { opacity: 0, scale: 0.74 }, { opacity: 1, scale: 1, duration: 1.10, ease: "sine.out" }, 0.16);
    tl.fromTo("#intro-rule-x", { scaleX: 0 }, { scaleX: 1, duration: 0.64, ease: "expo.out" }, 0.22);
    tl.fromTo("#intro-rule-y", { scaleY: 0 }, { scaleY: 1, duration: 0.88, ease: "circ.out" }, 0.34);
    tl.fromTo("#intro-series-number", { scale: 1.72, filter: "blur(14px)", opacity: 0 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.46, ease: "power4.out" }, 0.18);
    tl.fromTo("#intro-series-rest", { x: -190, filter: "blur(7px)", opacity: 0 }, { x: 0, filter: "blur(0px)", opacity: 1, duration: 0.52, ease: "expo.out" }, 0.52);
    tl.fromTo("#intro-main-title", { y: 92, opacity: 0 }, { y: 0, opacity: 1, duration: 0.72, ease: "circ.out" }, 0.94);
    tl.fromTo("#intro-flow .intro-flow-item, #intro-flow .intro-flow-arrow", { x: 28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, stagger: 0.055, ease: "power3.out" }, 1.34);
    tl.fromTo("#intro-progress-fill", { scaleX: 0 }, { scaleX: 1, duration: 2.10, ease: "expo.out" }, 1.28);
    tl.fromTo("#intro-meta", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.46, ease: "power2.out" }, 1.58);
    tl.fromTo("#day-anchor", { y: 16, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.58, ease: "power4.out" }, 1.02);
    tl.set(videoWrap, { scale: 1.045, filter: "blur(7px)", opacity: 0.64 }, 0);
    tl.to("#intro-flow", { x: 18, opacity: 0, duration: 0.20, ease: "power3.in" }, 3.46);
    tl.to("#intro-meta", { y: -10, opacity: 0, duration: 0.18, ease: "power3.in" }, 3.48);
    tl.to("#intro-main-title", { y: -24, scale: 0.985, opacity: 0, duration: 0.28, ease: "power3.in" }, 3.58);
    tl.to("#intro-series", { scale: 0.96, filter: "blur(4px)", opacity: 0, duration: 0.32, ease: "power3.in" }, 3.64);
    tl.to("#intro-progress", { scaleX: 0, opacity: 0, duration: 0.22, ease: "power3.in", transformOrigin: "right center" }, 3.56);
    tl.to("#intro-rule-x, #intro-rule-y", { opacity: 0, duration: 0.32, ease: "sine.in" }, 3.58);
    tl.to("#intro-glow", { opacity: 0, scale: 1.08, duration: 0.54, ease: "sine.in" }, 3.62);
    tl.to("#intro-surface", { opacity: 0, duration: 0.82, ease: "sine.inOut" }, 3.72);
    tl.to(videoWrap, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.96, ease: "expo.inOut" }, 3.68);
    tl.to("#day-anchor", { x: ${anchorX}, y: ${anchorY}, scale: ${anchorScale}, duration: 0.92, ease: "expo.inOut" }, 3.66);
    tl.set("#intro-copy, #intro-rule-x, #intro-rule-y, #intro-glow", { autoAlpha: 0 }, 4.05);`;
}

function floatingObjectMotionSpec(data) {
  return {
    duration: data.duration,
    assertions: [
      { kind: "appearsBy", selector: "#intro-object-wrap", bySec: 0.48 },
      { kind: "staysInFrame", selector: "#intro-object-wrap" }
    ]
  };
}

function titleSlamMotionSpec(data) {
  return {
    duration: data.duration,
    assertions: [
      { kind: "appearsBy", selector: "#intro-series-number", bySec: 0.72 },
      { kind: "appearsBy", selector: "#intro-series-rest", bySec: 1.12 },
      { kind: "appearsBy", selector: "#intro-main-title", bySec: 1.78 },
      { kind: "before", a: "#intro-series-number", b: "#intro-main-title" },
      { kind: "staysInFrame", selector: "#day-anchor" }
    ]
  };
}

function compileGallery(value, context) {
  const data = normalizeGalleryData(value, context);
  return artifact({
    data,
    headHtml: galleryHeadHtml(data),
    bodyHtml: galleryBodyHtml(data, context),
    cssText: galleryCssText(context),
    timelineJs: galleryTimelineJs(data, context),
    motionSpec: galleryMotionSpec(data)
  });
}

function normalizeGalleryData(value, context) {
  if (Number(value.duration) !== GALLERY_DURATION) throw new Error("gallery intro.duration 必须严格等于 8");
  if (context.totalDuration < GALLERY_DURATION) throw new Error("gallery intro 需要至少 8 秒成片时长");
  if (Math.abs(context.width * 16 - context.height * 9) > 1) throw new Error("gallery intro v1 只支持 9:16 画幅");
  if (!Array.isArray(value.assets) || value.assets.length !== GALLERY_COUNT) {
    throw new Error(`gallery intro.assets 必须恰好包含 ${GALLERY_COUNT} 张 JPEG`);
  }
  const assets = value.assets.map((asset, index) => validateGalleryAsset(asset, index, context));
  assertUniqueAssets(assets);
  const heroIndex = validateIndex(value.heroIndex, "heroIndex");
  const focusIndices = validateFocusIndices(value.focusIndices, heroIndex);
  const speakerPip = Boolean(value.speakerPip);
  if (speakerPip && !context.sourceVideo) throw new Error("gallery intro.speakerPip 需要 sourceVideo");
  const title = String(value.title || context.configTitle || "").trim();
  if (!title) throw new Error("gallery intro 需要 title");
  return { mode: "gallery", duration: GALLERY_DURATION, title, assets, heroIndex, focusIndices, speakerPip };
}

function validateGalleryAsset(value, index, context) {
  const label = `gallery assets[${index}]`;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须是非空路径`);
  const source = value.trim().replaceAll("\\", "/");
  if (/^(?:[a-z]+:)?\/\//i.test(source) || path.isAbsolute(source)) throw new Error(`${label} 必须是 job 内本地路径`);
  const absolute = path.resolve(context.jobDir, source);
  const relative = path.relative(context.jobDir, absolute).split(path.sep).join("/");
  if (!relative.startsWith("assets/") || relative.includes("../")) throw new Error(`${label} 必须位于 job/assets/ 内`);
  if (!/\.jpe?g$/i.test(relative)) throw new Error(`${label} 只允许 .jpg/.jpeg`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${label} 素材不存在: ${source}`);
  const dimensions = jpegDimensions(fs.readFileSync(absolute), label);
  if (dimensions.width !== dimensions.height) {
    throw new Error(`${label} 必须为方图，实际 ${dimensions.width}x${dimensions.height}`);
  }
  return relative;
}

function assertUniqueAssets(assets) {
  const normalized = assets.map((asset) => asset.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) throw new Error("gallery intro.assets 不允许重复");
}

function validateIndex(value, field) {
  if (!Number.isInteger(value) || value < 0 || value >= GALLERY_COUNT) {
    throw new Error(`gallery intro.${field} 必须是 0-${GALLERY_COUNT - 1} 的整数`);
  }
  return value;
}

function validateFocusIndices(value, heroIndex) {
  if (!Array.isArray(value) || ![2, 3].includes(value.length)) {
    throw new Error("gallery intro.focusIndices 必须包含两个或三个索引");
  }
  const indices = value.map((item, index) => validateIndex(item, `focusIndices[${index}]`));
  if (new Set(indices).size !== indices.length) throw new Error("gallery intro.focusIndices 不允许重复");
  if (indices.includes(heroIndex)) throw new Error("gallery intro 的 hero 与 focus 必须使用三张不同图片");
  if (indices.length === 2) {
    const fallback = Array.from({ length: GALLERY_COUNT }, (_, index) => index)
      .find((index) => index !== heroIndex && !indices.includes(index));
    indices.push(fallback);
  }
  return indices;
}

function jpegDimensions(buffer, label) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error(`${label} 不是合法 JPEG`);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda || marker == null) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error(`${label} 缺少 JPEG 尺寸信息`);
}

function galleryHeadHtml(data) {
  return data.assets
    .map((asset) => `<link rel="preload" href="${escapeHtml(asset)}" as="image" type="image/jpeg" />`)
    .join("\n");
}

function galleryBodyHtml(data, context) {
  const geometry = galleryGeometry(context);
  const cards = data.assets.map((asset, index) => galleryCardHtml(asset, index, data, geometry)).join("\n");
  const label = escapeHtml(`${data.title}，16 张品牌物料展示`);
  const speaker = data.speakerPip
    ? `<video id="intro-speaker-pip" class="intro-speaker-pip" src="${escapeHtml(context.sourceVideo)}" data-kind="speaker-pip" data-start="0" data-duration="8.00" data-media-start="0" data-track-index="7" muted playsinline preload="auto"></video><div id="intro-speaker-ring" class="clip" data-manual-timeline="true" data-start="0" data-duration="8.00" data-track-index="8" aria-hidden="true"></div>`
    : "";
  return `<section id="intro-gallery" class="clip intro-overlay intro-gallery" data-start="0" data-duration="8.00" data-track-index="6" role="img" aria-label="${label}">
    <div class="gallery-bg" aria-hidden="true"></div>
    <div class="gallery-camera" data-layout-allow-overflow aria-hidden="true"><div class="gallery-world">${cards}</div></div>
  </section>${speaker}`;
}

function galleryCardHtml(asset, index, data, geometry) {
  const wall = wallPosition(index, geometry);
  const roles = [index === data.heroIndex ? "hero" : "", data.focusIndices.includes(index) ? "focus" : "", "wall"]
    .filter(Boolean)
    .join(" ");
  const id = galleryCardId(index);
  return `<figure id="${id}" class="gallery-card" data-gallery-index="${index}" data-gallery-role="${roles}" data-wall-x="${wall.x}" data-wall-y="${wall.y}" data-layout-allow-overflow>
      <div class="gallery-media"><img id="gallery-image-${pad(index + 1)}" src="${escapeHtml(asset)}" alt="" loading="eager" decoding="sync" /></div>
    </figure>`;
}

function galleryGeometry(context) {
  const scale = context.width / 1080;
  const card = round(171 * scale);
  const rasterCard = round(GALLERY_RASTER_CARD * scale);
  return {
    scale,
    card,
    rasterCard,
    rasterScale: card / rasterCard,
    gap: round(12 * scale),
    left: round(180 * scale),
    top: round(560 * scale),
    worldX: round(540 * scale),
    worldY: round(920 * scale),
    perspective: round(1600 * scale)
  };
}

function wallPosition(index, geometry) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const centerX = geometry.left + geometry.card / 2 + column * (geometry.card + geometry.gap);
  const centerY = geometry.top + geometry.card / 2 + row * (geometry.card + geometry.gap);
  return { x: round(centerX - geometry.worldX), y: round(centerY - geometry.worldY) };
}

function galleryCssText(context) {
  const tokens = context.theme.tokens;
  const geometry = galleryGeometry(context);
  const rasterRadius = scaledPixelLength(tokens.radius, geometry.rasterScale, "8px");
  const rasterBorder = round(1 / geometry.rasterScale);
  const heroScale = (4.45 * geometry.rasterScale).toFixed(6);
  return `#intro-gallery { position: absolute; inset: 0; z-index: 4; overflow: hidden; pointer-events: none; isolation: isolate; opacity: 1; visibility: visible; }
    #intro-gallery .gallery-bg { position: absolute; inset: 0; background: ${tokens.pageBg}; }
    #intro-gallery .gallery-bg::after { content: ""; position: absolute; inset: 0; background: ${tokens.vignette}; }
    #intro-gallery .gallery-camera { position: absolute; inset: 0; perspective: ${geometry.perspective}px; perspective-origin: 50% 49%; transform-style: preserve-3d; will-change: transform; }
    #intro-gallery .gallery-world { position: absolute; left: ${geometry.worldX}px; top: ${geometry.worldY}px; width: 0; height: 0; transform-style: preserve-3d; }
    #intro-gallery .gallery-card { position: absolute; left: ${round(-geometry.rasterCard / 2)}px; top: ${round(-geometry.rasterCard / 2)}px; width: ${geometry.rasterCard}px; height: ${geometry.rasterCard}px; margin: 0; opacity: 0; transform-style: preserve-3d; transform-origin: center; backface-visibility: hidden; will-change: transform, opacity; }
    #intro-gallery .gallery-card[data-gallery-role~="hero"] { opacity: 1; transform: translate3d(0, 0, ${round(90 * geometry.scale)}px) rotateY(-1.2deg) scale(${heroScale}); }
    #intro-gallery .gallery-media { width: 100%; height: 100%; overflow: hidden; border: ${rasterBorder}px solid ${tokens.cardBorder}; border-radius: ${rasterRadius}; background: ${tokens.cardBg}; box-shadow: ${tokens.cardShadow}; backface-visibility: hidden; will-change: transform, opacity; }
    #intro-gallery img { display: block; width: 100%; height: 100%; object-fit: cover; backface-visibility: hidden; }
    #intro-speaker-pip { position: absolute; inset: 0; z-index: 6; width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; transform-origin: 50% 50%; filter: drop-shadow(0 ${round(18 * geometry.scale)}px ${round(36 * geometry.scale)}px rgba(0, 0, 0, .46)); will-change: transform, opacity, clip-path; }
    #intro-speaker-ring { position: absolute; left: ${round(64 * geometry.scale)}px; top: ${round(296 * geometry.scale)}px; z-index: 7; width: ${round(224 * geometry.scale)}px; height: ${round(224 * geometry.scale)}px; border: ${Math.max(3, round(4 * geometry.scale))}px solid var(--primary-pip-border, #f3f0ea); border-radius: 50%; box-shadow: 0 ${round(18 * geometry.scale)}px ${round(46 * geometry.scale)}px rgba(0, 0, 0, .46); will-change: transform, opacity; }
    #card-host { z-index: 7; }`;
}

function galleryTimelineJs(data, context) {
  return [
    galleryBaseTimelineJs(data, context),
    galleryDetailsTimelineJs(),
    galleryWallTimelineJs(),
    gallerySpeakerTimelineJs(data)
  ].join("\n");
}

function galleryBaseTimelineJs(data, context) {
  const geometry = galleryGeometry(context);
  const scale = round(context.width / 1080);
  return `const galleryCards = gsap.utils.toArray("#intro-gallery .gallery-card");
    const galleryMedia = gsap.utils.toArray("#intro-gallery .gallery-media");
    const galleryCamera = document.querySelector("#intro-gallery .gallery-camera");
    const galleryHero = galleryCards[${data.heroIndex}];
    const galleryDetailIndices = ${JSON.stringify(data.focusIndices)};
    const galleryDetails = galleryDetailIndices.map((index) => galleryCards[index]);
    const galleryDetailMedia = galleryDetailIndices.map((index) => galleryMedia[index]);
    const galleryScale = ${scale};
    const galleryRasterScale = ${geometry.rasterScale.toFixed(6)};
    tl.addLabel("gallery-hero", 0).addLabel("gallery-detail-a", 1.55).addLabel("gallery-detail-b", 2.62).addLabel("gallery-detail-c", 3.69).addLabel("gallery-wall", 4.84).addLabel("gallery-lock", 7.20).addLabel("gallery-handoff", 7.58);
    tl.set(galleryCamera, { x: 0, y: 0, scale: 1 }, 0);
    tl.set(galleryCards, { x: 0, y: 0, z: -480 * galleryScale, rotationX: 0, rotationY: 0, scale: 0.82 * galleryRasterScale, opacity: 0 }, 0);
    tl.set(galleryMedia, { x: 0, y: 0, scale: 1, opacity: 1 }, 0);
    tl.set(galleryHero, { x: 0, y: 0, z: 90 * galleryScale, rotationY: -1.2, scale: 4.45 * galleryRasterScale, opacity: 1 }, 0);
    tl.to(galleryHero, { z: 118 * galleryScale, rotationY: 0, scale: 4.55 * galleryRasterScale, duration: 1.34, ease: "sine.inOut" }, 0.12);
    tl.to(galleryCamera, { scale: 1.018, y: -4 * galleryScale, duration: 1.34, ease: "sine.inOut" }, 0.12);
    tl.to(galleryHero, { x: -210 * galleryScale, y: -34 * galleryScale, z: -300 * galleryScale, rotationY: 8, scale: 2.25 * galleryRasterScale, opacity: 0.12, duration: 0.46, ease: "power3.inOut" }, 1.55);`;
}

function galleryDetailsTimelineJs() {
  return `const galleryDetailStarts = [1.55, 2.62, 3.69];
    galleryDetails.forEach((card, order) => {
      const at = galleryDetailStarts[order];
      const direction = order % 2 === 0 ? 1 : -1;
      tl.fromTo(card,
        { x: direction * 330 * galleryScale, y: (order - 1) * 22 * galleryScale, z: -170 * galleryScale, rotationY: direction * -12, scale: 1.72 * galleryRasterScale, opacity: 0 },
        { x: 0, y: 0, z: 145 * galleryScale, rotationY: 0, scale: 3.95 * galleryRasterScale, opacity: 1, duration: 0.62, ease: "expo.out", immediateRender: false }, at);
      tl.to(galleryDetailMedia[order], { x: direction * -7 * galleryScale, y: -6 * galleryScale, scale: 1.07, duration: 0.92, ease: "sine.inOut" }, at + 0.16);
      tl.to(galleryCamera, { x: direction * -6 * galleryScale, y: -4 * galleryScale, scale: 1.018, duration: 0.62, ease: "expo.inOut" }, at);
      if (order < galleryDetails.length - 1) {
        tl.to(card, { x: direction * -265 * galleryScale, z: -210 * galleryScale, rotationY: direction * 10, scale: 1.9 * galleryRasterScale, opacity: 0.10, duration: 0.38, ease: "power3.in" }, at + 1.02);
      }
    });`;
}

function galleryWallTimelineJs() {
  return `tl.to(galleryCamera, { x: 0, y: 0, scale: 1, duration: 1.08, ease: "expo.inOut" }, 4.84);
    tl.to(galleryMedia, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.72, ease: "power2.inOut" }, 4.84);
    tl.to(galleryCards, {
      x: (_, card) => Number(card.dataset.wallX), y: (_, card) => Number(card.dataset.wallY),
      z: 0, rotationX: 0, rotationY: 0, scale: galleryRasterScale, opacity: 1,
      duration: 1.18, stagger: { amount: 0.32, from: "center" }, ease: "expo.inOut"
    }, 4.84);
    tl.to(galleryCamera, { y: -8 * galleryScale, scale: 1.018, duration: 1.32, ease: "sine.inOut" }, 6.10);
    tl.to("#intro-gallery", { opacity: 0, duration: 0.24, ease: "sine.inOut" }, 7.74);`;
}

function gallerySpeakerTimelineJs(data) {
  if (!data.speakerPip) return "";
  return `tl.set("#intro-speaker-pip", { x: -364 * galleryScale, y: -521 * galleryScale, scale: 0.20, opacity: 0, clipPath: "circle(500px at 540px 820px)" }, 0);
    tl.set("#intro-speaker-ring", { autoAlpha: 0, scale: 0.92 }, 0);
    tl.to("#intro-speaker-pip", { scale: 0.22, opacity: 1, duration: 0.58, ease: "power3.out" }, 0.16);
    tl.to("#intro-speaker-ring", { autoAlpha: 1, scale: 1, duration: 0.52, ease: "power3.out" }, 0.20);
    tl.to("#intro-speaker-pip", { y: -526 * galleryScale, duration: 3.36, repeat: 1, yoyo: true, ease: "sine.inOut" }, 0.78);
    tl.to("#intro-speaker-ring", { autoAlpha: 0, scale: 1.08, duration: 0.22, ease: "power3.in" }, 7.58);
    tl.to("#intro-speaker-pip", { x: 0, y: 0, scale: 1, clipPath: "circle(1380px at 540px 960px)", filter: "drop-shadow(0 0 0 rgba(0,0,0,0))", duration: 0.42, ease: "expo.inOut" }, 7.58);`;
}

function galleryMotionSpec(data) {
  return {
    duration: GALLERY_DURATION,
    assertions: [
      { kind: "appearsBy", selector: `#${galleryCardId(data.heroIndex)}`, bySec: 0.15 },
      { kind: "appearsBy", selector: `#${galleryCardId(data.focusIndices[0])}`, bySec: 2.20 },
      { kind: "appearsBy", selector: `#${galleryCardId(data.focusIndices[1])}`, bySec: 3.27 },
      { kind: "appearsBy", selector: `#${galleryCardId(data.focusIndices[2])}`, bySec: 4.34 },
      { kind: "before", a: `#${galleryCardId(data.heroIndex)}`, b: `#${galleryCardId(data.focusIndices[0])}` }
    ].concat(data.speakerPip ? [{ kind: "appearsBy", selector: "#intro-speaker-pip", bySec: 0.75 }] : [])
  };
}

function galleryCardId(index) {
  return `gallery-card-${pad(index + 1)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function round(value) {
  return Number(value.toFixed(2));
}

function scaledPixelLength(value, scale, fallback) {
  const normalized = String(value || fallback).trim();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)px$/);
  return match ? `${round(Number(match[1]) / scale)}px` : normalized;
}
