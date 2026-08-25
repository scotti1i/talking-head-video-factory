import fs from "node:fs";
import path from "node:path";

import { escapeHtml, fmtTime } from "./lib.mjs";

const BED_ID = /^[a-z0-9][a-z0-9_-]*$/i;

export function loadMusicBed({ jobDir, totalDuration }) {
  const file = path.join(jobDir, "data", "music-bed.json");
  if (!fs.existsSync(file)) return null;
  if (!(Number.isFinite(totalDuration) && totalDuration > 0)) {
    throw new Error("music-bed: totalDuration 必须是大于 0 的有限数字");
  }
  return validateMusicBed(JSON.parse(fs.readFileSync(file, "utf8")), { jobDir, totalDuration });
}

export function validateMusicBed(value, { jobDir, totalDuration }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("music-bed.json 必须是单个对象");
  }
  const id = value.id;
  const asset = value.asset;
  const start = value.start ?? 0;
  const duration = value.duration;
  const volume = value.volume;
  const errors = [];
  if (typeof id !== "string" || !BED_ID.test(id)) errors.push("id 只允许字母、数字、下划线和连字符");
  if (!(typeof start === "number" && Number.isFinite(start) && start >= 0)) errors.push("start 必须是大于等于 0 的有限数字");
  if (!(typeof duration === "number" && Number.isFinite(duration) && duration > 0)) errors.push("duration 必须是大于 0 的有限数字");
  if (!(typeof volume === "number" && Number.isFinite(volume) && volume >= 0 && volume <= 1)) errors.push("volume 必须是 0..1 的有限数字");
  const assetPath = resolveJobAsset(jobDir, asset);
  if (!assetPath || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    errors.push(`asset 必须是 job 内现存文件: ${asset || "_"}`);
  }
  if (Number.isFinite(start) && Number.isFinite(duration) && start + duration > totalDuration + 1e-9) {
    errors.push(`结束时间 ${(start + duration).toFixed(3)}s 超出成片 ${totalDuration.toFixed(3)}s`);
  }
  if (errors.length) throw new Error(`music-bed.json 校验失败:\n- ${errors.join("\n- ")}`);
  return { id, asset, start, duration, volume };
}

export function renderMusicBed(bed, { trackIndex = 720 } = {}) {
  if (!bed) return "";
  return `<audio id="music-bed-${escapeHtml(bed.id)}" src="${escapeHtml(bed.asset)}" data-start="${fmtTime(bed.start)}" data-duration="${fmtTime(bed.duration)}" data-track-index="${trackIndex}" data-volume="${bed.volume}" preload="auto"></audio>`;
}

function resolveJobAsset(jobDir, asset) {
  if (typeof asset !== "string" || !asset.trim() || path.isAbsolute(asset)) return null;
  const root = path.resolve(jobDir);
  const resolved = path.resolve(root, asset);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}
