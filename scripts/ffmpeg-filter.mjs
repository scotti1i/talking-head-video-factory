// ============================================================
// FFmpeg 滤镜图落盘 + 版本兼容 + 派生输入硬拒
// 为什么：`-filter_complex_script` 在 FFmpeg 8 起被删（客户机 apt 装的是 6.x，我们本机 9.x），
//   两边都要能跑；v2 还要求任何渲染命令拒绝拿 review/ renders/ 里的成片当输入（2026-09-11 审计：
//   客户 Codex 对上一轮审片成片反复打补丁，真源与产物脱钩）。
// ============================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let cachedMajor = null;

export function ffmpegMajorVersion() {
  if (cachedMajor != null) return cachedMajor;
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", stdio: "pipe" });
  const match = String(result.stdout || "").match(/ffmpeg version\s+(?:n)?(\d+)\./i);
  cachedMajor = match ? Number(match[1]) : 0;
  return cachedMajor;
}

// 返回把滤镜图文件交给 ffmpeg 的参数：FFmpeg ≥7 用 `-/filter_complex <file>`，旧版用 `-filter_complex_script <file>`
export function filterComplexFileArgs(filterPath) {
  return ffmpegMajorVersion() >= 7 ? ["-/filter_complex", filterPath] : ["-filter_complex_script", filterPath];
}

export function writeFilterFile(filterPath, filters) {
  fs.mkdirSync(path.dirname(filterPath), { recursive: true });
  fs.writeFileSync(filterPath, filters.join(";\n"));
  return filterPath;
}

// 视频段量化到整帧后不得长于音频段（concat 会给音频补静音 → 字幕累积漂移）。
// 返回追加在 `fps=` 之后的 trim 片段；duration 为段时长（秒）。
export function frameCapFilter(duration, fps) {
  const frames = Math.floor(duration * fps + 1e-6);
  return frames > 0 ? `,trim=end_frame=${frames}` : "";
}

const DERIVED_DIRS = ["review", "renders", "variants"];

// 任何渲染 / 处理命令的输入不得来自审片成片或渲染产物目录（除非命令显式声明自己的产物）。
export function assertNotDerivedInput(filePath, jobDir, commandName, { allow = [] } = {}) {
  const relative = path.relative(jobDir, path.resolve(filePath)).split(path.sep).join("/");
  if (relative.startsWith("..")) return;
  const top = relative.split("/")[0];
  if (allow.includes(relative) || allow.includes(top)) return;
  if (DERIVED_DIRS.includes(top)) {
    throw new Error(`${commandName}: 不得以 ${relative} 作输入。审片成片和渲染产物不是真源；请改 EDL / captions / beats 后从原片重渲。`);
  }
}
