// ============================================================
// job 状态推导与数据文件读写(全部从磁盘事实推导,不存冗余状态)
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { jobsRoot } from "../scripts/lib.mjs";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const DATA_FILES = ["captions.json", "beats.json", "shorts.json", "chapters.json", "overlays.json", "rough-cut-cuts.json"];

export function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function listThemes() {
  const registry = readJsonSafe(path.join(ROOT, "themes", "registry.json"), { default: null, themes: [] });
  const themes = registry.themes
    .map((id) => {
      const data = readJsonSafe(path.join(ROOT, "themes", id, "theme.json"));
      if (!data) return null;
      const preview = fs.existsSync(path.join(ROOT, "themes", id, "preview.jpg"))
        ? `/files/themes/${id}/preview.jpg`
        : null;
      return { id, label: data.label, description: data.description, tokens: data.tokens, preview };
    })
    .filter(Boolean);
  return { default: registry.default, themes };
}

export function listJobs() {
  const jobsDir = jobsRoot();
  if (!fs.existsSync(jobsDir)) return [];
  return fs
    .readdirSync(jobsDir)
    .filter((name) => !name.startsWith(".") && name !== "smoke" && fs.existsSync(path.join(jobsDir, name, "project.json")))
    .map((slug) => jobSummary(slug))
    .filter(Boolean)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

function jobKind(slug) {
  if (slug.startsWith("sample-")) return "sample";
  if (slug === "beats-regression") return "infra";
  return "normal";
}

export function jobDir(slug) {
  const dir = path.resolve(jobsRoot(), slug);
  if (!dir.startsWith(jobsRoot() + path.sep)) throw new Error("非法 job 路径");
  return dir;
}

export function jobSummary(slug) {
  const dir = jobDir(slug);
  const config = readJsonSafe(path.join(dir, "project.json"));
  if (!config) return null;
  const steps = deriveSteps(dir, config);
  return {
    slug,
    title: config.title || slug,
    theme: config.theme || null,
    kind: jobKind(slug),
    targets: config.console?.targets || ["douyin"],
    mtime: fs.statSync(dir).mtimeMs,
    steps,
    stage: currentStage(steps)
  };
}

export function jobDetail(slug) {
  const dir = jobDir(slug);
  const config = readJsonSafe(path.join(dir, "project.json"));
  if (!config) return null;
  const data = {};
  for (const name of DATA_FILES) {
    const file = path.join(dir, "data", name);
    data[name] = fs.existsSync(file) ? readJsonSafe(file, []) : null;
  }
  const edl = readJsonSafe(path.join(dir, "data", "rough-cut-edl.json"), null);
  return {
    ...jobSummary(slug),
    config,
    data,
    edl: edl ? { segments: edl.length, duration: edlDuration(edl) } : null,
    originals: listMedia(path.join(dir, "assets", "originals")),
    arollPath: config.sourceVideo || "assets/aroll.mp4",
    arollExists: fs.existsSync(path.join(dir, config.sourceVideo || "assets/aroll.mp4")),
    renders: listRenders(dir),
    qa: qaSummary(dir),
    shortsOut: listMedia(path.join(dir, "shorts")),
    variants: listVariants(dir),
    delivered: deliveredPath(config)
  };
}

function edlDuration(edl) {
  return edl.reduce((max, seg) => Math.max(max, Number(seg.outEnd) || 0), 0);
}

function listMedia(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(mp4|mov|m4v)$/i.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, mtime: stat.mtimeMs, rel: path.relative(ROOT, path.join(dir, name)) };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function listRenders(dir) {
  return listMedia(path.join(dir, "renders"));
}

function qaSummary(dir) {
  const report = readJsonSafe(path.join(dir, "qa", "report.json"));
  const qaDir = path.join(dir, "qa");
  const sheets = fs.existsSync(qaDir)
    ? fs
        .readdirSync(qaDir)
        .filter((name) => /\.(jpg|png)$/i.test(name))
        .map((name) => `/files/${path.relative(ROOT, path.join(qaDir, name))}`)
    : [];
  const frameDir = path.join(qaDir, "final-frames");
  const frames = fs.existsSync(frameDir)
    ? fs
        .readdirSync(frameDir)
        .filter((name) => name.endsWith(".jpg"))
        .sort()
        .map((name) => `/files/${path.relative(ROOT, path.join(frameDir, name))}`)
    : [];
  return report
    ? { checkedAt: report.checkedAt, failures: report.failures || [], sheets, frames }
    : { checkedAt: null, failures: null, sheets, frames };
}

function listVariants(dir) {
  const variantsDir = path.join(dir, "variants");
  if (!fs.existsSync(variantsDir)) return [];
  return fs
    .readdirSync(variantsDir)
    .filter((id) => fs.existsSync(path.join(variantsDir, id, "project.json")))
    .map((id) => {
      const config = readJsonSafe(path.join(variantsDir, id, "project.json"), {});
      return { id, label: config.variantLabel || id, renders: listMedia(path.join(variantsDir, id, "renders")) };
    });
}

function deliveredPath(config) {
  const root = config.delivery?.downloadsRoot || path.join(os.homedir(), "Downloads");
  const folder = config.downloadFolderName;
  if (!folder) return null;
  const dir = path.join(root, folder);
  return fs.existsSync(dir) ? dir : null;
}

function deriveSteps(dir, config) {
  const aroll = path.join(dir, config.sourceVideo || "assets/aroll.mp4");
  const captions = readJsonSafe(path.join(dir, "data", "captions.json"), []);
  const beats = readJsonSafe(path.join(dir, "data", "beats.json"), []);
  const renders = listRenders(dir);
  const qa = readJsonSafe(path.join(dir, "qa", "report.json"));
  return {
    source: listMedia(path.join(dir, "assets", "originals")).length > 0 || fs.existsSync(aroll),
    edl: fs.existsSync(path.join(dir, "data", "rough-cut-edl.json")),
    aroll: fs.existsSync(aroll),
    captions: Array.isArray(captions) && captions.length > 0,
    beats: Array.isArray(beats) && beats.length > 0,
    built: fs.existsSync(path.join(dir, "index.html")),
    rendered: renders.length > 0,
    qaPassed: Boolean(qa && Array.isArray(qa.failures) && qa.failures.length === 0),
    delivered: Boolean(deliveredPath(config))
  };
}

function currentStage(steps) {
  if (!steps.source) return "素材";
  if (!steps.aroll) return "剪辑";
  if (!steps.captions) return "字幕";
  if (!steps.beats) return "包装";
  if (!steps.rendered) return "出片";
  if (!steps.qaPassed) return "QA";
  if (!steps.delivered) return "交付";
  return "完成";
}

export function saveDataFile(slug, name, content) {
  if (!DATA_FILES.includes(name)) throw new Error(`不允许写入 ${name}`);
  if (!Array.isArray(content)) throw new Error("数据文件必须是 JSON 数组");
  const dir = jobDir(slug);
  const file = path.join(dir, "data", name);
  backupFile(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
  return { saved: name, count: content.length };
}

export function appendComponentBeat(slug, options) {
  const type = String(options.type || "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(type)) throw new Error("组件 type 不合法");
  if (!options.beat || typeof options.beat !== "object" || Array.isArray(options.beat)) {
    throw new Error("组件 fixture 必须是对象");
  }
  const format = { vertical: "portrait", portrait: "portrait", horizontal: "landscape", landscape: "landscape" }[options.format];
  if (!format) throw new Error("画幅必须是 vertical 或 horizontal");
  const dir = jobDir(slug);
  const config = readJsonSafe(path.join(dir, "project.json"));
  if (!config) throw new Error("project.json 不存在");
  const beatsFile = path.join(dir, "data", "beats.json");
  const beats = readJsonSafe(beatsFile, []);
  if (!Array.isArray(beats)) throw new Error("data/beats.json 必须是数组");
  const duration = Math.max(1, Number(options.duration) || 4);
  const total = Number(config.duration) > 0 ? Number(config.duration) : null;
  const start = Number.isFinite(Number(options.start))
    ? Number(options.start)
    : findBeatGap(beats, duration, total, format);
  if (start == null) throw new Error(`时间轴没有连续 ${duration} 秒空位，请先在视频项目中调整拍子`);
  if (start < 0) throw new Error("组件开始时间不能小于 0");
  const end = start + duration;
  if (total != null && end > total) throw new Error(`组件会超出视频总时长 ${total} 秒`);
  if (hasBeatConflict(beats, start, end, format)) throw new Error(`${format} 画幅的该时间段已有拍子`);
  const beat = {
    ...structuredClone(options.beat),
    type,
    start: roundTime(start),
    end: roundTime(end),
    formats: [format]
  };
  const next = [...beats, beat].sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  const saved = saveDataFile(slug, "beats.json", next);
  return { ...saved, beat, format };
}

export function findBeatGap(beats, duration, total, format) {
  let cursor = 0;
  const ordered = beats.filter((beat) => beatAppliesToFormat(beat, format))
    .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  for (const beat of ordered) {
    const start = Math.max(0, Number(beat.start) || 0);
    if (start - cursor >= duration) return cursor;
    cursor = Math.max(cursor, Number(beat.end) || start);
  }
  if (total == null || total - cursor >= duration) return cursor;
  return null;
}

function hasBeatConflict(beats, start, end, format) {
  return beats.some((beat) => beatAppliesToFormat(beat, format)
    && start < Number(beat.end || beat.start || 0)
    && end > Number(beat.start || 0));
}

function beatAppliesToFormat(beat, format) {
  if (!Array.isArray(beat.formats) || !beat.formats.length) return true;
  const aliases = format === "portrait" ? ["portrait", "vertical"] : ["landscape", "horizontal"];
  return beat.formats.some((item) => aliases.includes(item));
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

export function updateProject(slug, patch) {
  const allowed = ["title", "theme", "console", "duration", "sourceVideo"];
  const dir = jobDir(slug);
  const file = path.join(dir, "project.json");
  const config = readJsonSafe(file);
  if (!config) throw new Error("project.json 不存在");
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) throw new Error(`不允许修改字段 ${key}`);
  }
  backupFile(file);
  const next = { ...config, ...patch };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function backupFile(file) {
  if (!fs.existsSync(file)) return;
  const historyDir = path.join(path.dirname(file), ".history");
  fs.mkdirSync(historyDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  fs.copyFileSync(file, path.join(historyDir, `${path.basename(file)}.${stamp}`));
}

export function importSource(slug, sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error(`源文件不存在: ${sourcePath}`);
  const dir = path.join(jobDir(slug), "assets", "originals");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(sourcePath));
  if (fs.existsSync(dest)) throw new Error(`已存在同名素材: ${path.basename(sourcePath)}`);
  try {
    fs.linkSync(sourcePath, dest);
  } catch {
    fs.copyFileSync(sourcePath, dest);
  }
  return { imported: path.relative(ROOT, dest) };
}
