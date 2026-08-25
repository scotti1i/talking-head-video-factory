import fs from "node:fs";
import path from "node:path";

import { escapeHtml, fmtTime } from "./lib.mjs";

const CUE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

export function loadAudioCues({ jobDir, totalDuration }) {
  if (!(Number.isFinite(totalDuration) && totalDuration > 0)) {
    throw new Error("audio-cues: totalDuration 必须是大于 0 的有限数字");
  }

  const file = path.join(jobDir, "data", "audio-cues.json");
  if (!fs.existsSync(file)) return [];

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("audio-cues.json 必须是数组");
  return validateAudioCues(parsed, { jobDir, totalDuration });
}

export function validateAudioCues(items, { jobDir, totalDuration }) {
  const errors = [];
  const ids = new Set();

  items.forEach((cue, index) => {
    const label = `audio-cues[${index}]`;
    if (!cue || typeof cue !== "object" || Array.isArray(cue)) {
      errors.push(`${label}: 必须是对象`);
      return;
    }

    const id = cue.id;
    const start = cue.start;
    const duration = cue.duration;
    const asset = cue.asset;
    const volume = cue.volume;

    if (typeof id !== "string" || !CUE_ID.test(id)) {
      errors.push(`${label}.id: 必须是非空字符串，只允许字母、数字、下划线和连字符`);
    } else if (ids.has(id)) {
      errors.push(`${label}.id: 不允许重复 ${id}`);
    } else {
      ids.add(id);
    }

    if (!(typeof start === "number" && Number.isFinite(start) && start >= 0)) {
      errors.push(`${label}.start: 必须是大于等于 0 的有限数字`);
    }
    if (!(typeof duration === "number" && Number.isFinite(duration) && duration > 0)) {
      errors.push(`${label}.duration: 必须是大于 0 的有限数字`);
    }
    if (!(typeof volume === "number" && Number.isFinite(volume) && volume >= 0 && volume <= 1)) {
      errors.push(`${label}.volume: 必须是 0..1 的有限数字`);
    }

    if (typeof asset !== "string" || !asset.trim()) {
      errors.push(`${label}.asset: 必须是非空的 job 相对路径`);
    } else {
      const assetPath = resolveJobAsset(jobDir, asset);
      if (!assetPath) {
        errors.push(`${label}.asset: 必须位于 job 目录内 ${asset}`);
      } else if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
        errors.push(`${label}.asset: 文件不存在 ${asset}`);
      }
    }

    if (
      typeof start === "number"
      && Number.isFinite(start)
      && typeof duration === "number"
      && Number.isFinite(duration)
      && start + duration > totalDuration + 1e-9
    ) {
      errors.push(`${label}: 结束时间 ${(start + duration).toFixed(3)}s 超出成片 ${totalDuration.toFixed(3)}s`);
    }
  });

  if (errors.length) throw new Error(`audio-cues.json 校验失败:\n- ${errors.join("\n- ")}`);
  return items.map((cue) => ({
    id: cue.id,
    start: cue.start,
    duration: cue.duration,
    asset: cue.asset,
    volume: cue.volume
  }));
}

export function renderAudioCues(cues, { trackStart = 760 } = {}) {
  return cues
    .map((cue, index) => `<audio id="audio-cue-${escapeHtml(cue.id)}" src="${escapeHtml(cue.asset)}" data-start="${fmtTime(cue.start)}" data-duration="${fmtTime(cue.duration)}" data-track-index="${trackStart + index}" data-volume="${cue.volume}" preload="auto"></audio>`)
    .join("\n      ");
}

function resolveJobAsset(jobDir, asset) {
  if (path.isAbsolute(asset)) return null;
  const root = path.resolve(jobDir);
  const resolved = path.resolve(root, asset);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}
