import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const PREVIEW_SCHEMA_VERSION = 1;
export const PREVIEW_DURATION = 4;
export const PREVIEW_STATUSES = new Set([
  "ready",
  "missing",
  "stale",
  "rendering",
  "failed",
  "unsupported"
]);

export const PREVIEW_FORMATS = {
  portrait: { width: 1080, height: 1920, layout: "vertical" },
  landscape: { width: 1920, height: 1080, layout: "horizontal" }
};

// -----------------------------------------------------------------------------
// 确定性哈希
// -----------------------------------------------------------------------------

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function hashFiles(files) {
  const inputs = files.map((file) => ({
    file: path.basename(file),
    hash: fs.existsSync(file) ? hashFile(file) : "missing"
  }));
  return hashValue(inputs);
}

export function makeCellHash(inputs) {
  const required = ["component", "fixture", "theme", "format", "builder", "runtime", "proxy"];
  for (const key of required) {
    if (!inputs[key]) throw new Error(`cell hash 缺少 ${key}`);
  }
  return hashValue(inputs);
}

// -----------------------------------------------------------------------------
// CLI 选择与状态
// -----------------------------------------------------------------------------

export function parseCsv(value, defaults) {
  if (value == null || value === true || value === "all") return [...defaults];
  const values = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export function selectFixtureIds(fixtures, requested = null) {
  if (requested !== null) return [...requested];
  const ids = fixtures.map((fixture) => fixture?.id).filter(Boolean);
  return ids.length ? ids : ["default"];
}

export function cellKey(component, fixture, theme, format) {
  return [component, fixture, theme, format].map((item) => encodeURIComponent(item)).join("/");
}

export function legacyCellKey(component, theme, format) {
  return `${component}/${theme}/${format}`;
}

export function lastGoodHash(previous) {
  if (previous?.status === "ready") return previous.hash || null;
  return previous?.lastGoodHash || null;
}

export function initialCellStatus(previous, hash) {
  if (!previous) return "missing";
  if (previous.hash !== hash) return "stale";
  if (previous.status === "rendering") return "stale";
  return previous.status || "missing";
}

export function cacheIsReady(cacheDir, needsPoster) {
  const result = readJsonSafe(path.join(cacheDir, "result.json"));
  if (result?.status !== "ready") return false;
  if (!fs.existsSync(path.join(cacheDir, "index.html"))) return false;
  return !needsPoster || fs.existsSync(path.join(cacheDir, "poster.webp"));
}

export function injectPreviewShell(html) {
  const marker = "visual-preview-shell";
  if (html.includes(`id="${marker}"`)) return html;
  const style = `<style id="${marker}">
      html, body { width: 100%; height: 100%; overflow: hidden; }
      body { position: relative; }
      #main { position: absolute !important; transform-origin: top left !important; }
    </style>`;
  const script = `<script id="${marker}-script">
      (() => {
        const main = document.getElementById("main");
        if (!main) return;
        const duration = Math.max(0.1, Number(main.dataset.duration) || 4);
        const media = [...main.querySelectorAll("video, audio")];
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        let frame = 0;
        let startedAt = performance.now();
        const fit = () => {
          const width = Number(main.dataset.width) || main.offsetWidth;
          const height = Number(main.dataset.height) || main.offsetHeight;
          const scale = Math.min(innerWidth / width, innerHeight / height);
          main.style.left = ((innerWidth - width * scale) / 2) + "px";
          main.style.top = ((innerHeight - height * scale) / 2) + "px";
          main.style.transform = "scale(" + scale + ")";
        };
        const seek = (time) => {
          const timeline = window.__timelines && window.__timelines.main;
          if (timeline) timeline.time(time, false).pause();
          for (const item of media) {
            item.muted = true;
            try { item.currentTime = time; } catch {}
          }
        };
        const tick = () => {
          const time = ((performance.now() - startedAt) / 1000) % duration;
          const timeline = window.__timelines && window.__timelines.main;
          if (timeline) timeline.time(time, false).pause();
          for (const item of media) {
            item.muted = true;
            if (item.currentTime >= duration - 0.04 || Math.abs(item.currentTime - time) > 0.2) {
              try { item.currentTime = time; } catch {}
            }
            item.play().catch(() => {});
          }
          frame = requestAnimationFrame(tick);
        };
        const restart = () => {
          cancelAnimationFrame(frame);
          startedAt = performance.now();
          if (reducedMotion) return seek(Math.min(2, duration - 0.01));
          seek(0);
          frame = requestAnimationFrame(tick);
        };
        addEventListener("resize", fit, { passive: true });
        addEventListener("message", (event) => {
          if (event.source === parent && event.data?.type === "visual-preview:restart") restart();
        });
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) {
            cancelAnimationFrame(frame);
            media.forEach((item) => item.pause());
          } else restart();
        });
        requestAnimationFrame(() => { fit(); restart(); });
      })();
    </script>`;
  if (!html.includes("</head>") || !html.includes("</body>")) {
    throw new Error("preview HTML 缺少 head/body 闭合标签");
  }
  return html.replace("</head>", `${style}\n  </head>`).replace("</body>", `${script}\n  </body>`);
}

// -----------------------------------------------------------------------------
// 原子文件系统操作
// -----------------------------------------------------------------------------

export function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

export function atomicReplaceDir(stageDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  const backup = `${targetDir}.last-good-${process.pid}-${crypto.randomUUID()}`;
  const hadTarget = fs.existsSync(targetDir);
  if (hadTarget) fs.renameSync(targetDir, backup);
  try {
    fs.renameSync(stageDir, targetDir);
    if (hadTarget) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    if (hadTarget && fs.existsSync(backup)) fs.renameSync(backup, targetDir);
    throw error;
  }
}

export function makeStageDir(stagingRoot, hash) {
  fs.mkdirSync(stagingRoot, { recursive: true });
  return fs.mkdtempSync(path.join(stagingRoot, `${hash.slice(0, 12)}-`));
}

export function linkOrCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

export function rootRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

// -----------------------------------------------------------------------------
// 进程与资源门禁
// -----------------------------------------------------------------------------

export function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    stdio: "pipe"
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: options.quiet ? "pipe" : "inherit"
    });
    let stderr = "";
    if (child.stderr) child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} 失败(${code})${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

export function assertDiskSpace(target, minimumBytes = 50 * 1024 ** 3) {
  const human = spawnSync("df", ["-h", target], { encoding: "utf8" });
  if (human.status !== 0) throw new Error(`df -h ${target} 失败`);
  process.stdout.write(human.stdout);
  const machine = spawnSync("df", ["-Pk", target], { encoding: "utf8" });
  const line = machine.stdout.trim().split(/\r?\n/).at(-1) || "";
  const availableKb = Number(line.trim().split(/\s+/).at(-3));
  const available = availableKb * 1024;
  if (!Number.isFinite(available)) throw new Error("无法解析 df 可用空间");
  if (available < minimumBytes) {
    throw new Error(`可用空间 ${(available / 1024 ** 3).toFixed(1)}GiB，不足 50GiB，停止生成 poster`);
  }
  return available;
}

export async function runPool(items, limit, worker) {
  const width = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: width }, next));
}

export function tempTestDir(prefix = "visual-preview-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
