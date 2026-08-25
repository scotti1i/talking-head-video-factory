// ============================================================
// 管线执行器:每个 job 同时只允许一条运行链,日志落盘 + SSE 直播
// ============================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, jobDir, readJsonSafe } from "./jobs.mjs";

const LOG_DIR = path.join(ROOT, "console", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const runs = new Map();
let counter = 0;

// ---- 动作 → 步骤链(唯一的编排真相) ----
export function buildSteps(slug, action, params = {}) {
  const job = `jobs/${slug}`;
  const dir = jobDir(slug);
  const npm = (args, cwd = ROOT) => ({ cmd: "npm", args, cwd });
  const targetSteps = {
    douyin: () => [
      { name: "构建抖音竖屏 variant", ...npm(["run", "build:variants", "--", "--job", job, "--variant", "douyin-vertical"]) },
      { name: "抖音结构检查", ...npm(["run", "check:variants", "--", "--job", job, "--variant", "douyin-vertical"]) },
      { name: "抖音渲染 + 规格/音频 QA", ...npm(["run", "render:variants", "--", "--job", job, "--variant", "douyin-vertical"]) },
      { name: "抖音交付", ...npm(["run", "deliver:variants", "--", "--job", job, "--variant", "douyin-vertical"]) }
    ],
    "youtube-horizontal": () => [
      { name: "构建 YouTube 横屏 variant", ...npm(["run", "build:variants", "--", "--job", job, "--variant", "youtube-horizontal"]) },
      { name: "横屏结构检查", ...npm(["run", "check:variants", "--", "--job", job, "--variant", "youtube-horizontal"]) },
      { name: "横屏渲染 + QA", ...npm(["run", "render:variants", "--", "--job", job, "--variant", "youtube-horizontal"]) },
      { name: "横屏交付", ...npm(["run", "deliver:variants", "--", "--job", job, "--variant", "youtube-horizontal"]) }
    ],
    shorts: () => [{ name: "切 Shorts(stream copy)", ...npm(["run", "cut:shorts", "--", "--job", job]) }]
  };
  const actions = {
    doctor: () => [{ name: "环境体检", ...npm(["run", "doctor"]) }],
    roughcut: () => [
      {
        name: "旧项目静音 EDL（仅兼容）",
        ...npm(["run", "legacy:roughcut:silence", "--", "--job", job, ...flag(params, "threshold"), ...flag(params, "minSilence")])
      }
    ],
    "apply-cuts": () => [{ name: "旧项目：应用 cuts（仅兼容）", ...npm(["run", "legacy:roughcut:apply", "--", "--job", job]) }],
    transcribe: () => [
      { name: "从哈希转录缓存重映射字幕", ...npm(["run", "captions:build", "--", "--job", job]) }
    ],
    "render-aroll": () => [
      {
        name: "从原片渲染母版 A-roll",
        ...npm([
          "run", "roughcut:render", "--",
          "--job", job,
          "--sourceKey", "original",
          "--fps", String(params.fps || 60),
          "--crf", String(params.crf || 18),
          "--output", params.output || "assets/aroll-master.mp4"
        ])
      }
    ],
    build: () => [targetSteps.douyin()[0]],
    check: () => [targetSteps.douyin()[1]],
    render: () => [targetSteps.douyin()[2]],
    qa: () => [{ name: "检查既有抖音成片（不重新渲染）", ...npm(["run", "qa:variants", "--", "--job", job, "--variant", "douyin-vertical"]) }],
    deliver: () => [targetSteps.douyin()[3]],
    shorts: () => targetSteps.shorts(),
    chain: () => {
      const targets = Array.isArray(params.targets) && params.targets.length ? params.targets : ["douyin"];
      const ordered = ["douyin", "youtube-horizontal", "shorts"].filter((t) => targets.includes(t));
      if (ordered.includes("shorts") && !ordered.includes("douyin")) {
        const finalRender = path.join(dir, "renders", "final-60fps.mp4");
        if (!fs.existsSync(finalRender)) throw new Error("切 Shorts 需要先有抖音竖屏成片(勾上抖音或先单独渲染)");
      }
      return ordered.flatMap((t) => targetSteps[t]());
    }
  };
  const make = actions[action];
  if (!make) throw new Error(`未知动作: ${action}`);
  return make();
}

function flag(params, key) {
  return params[key] != null ? [`--${key}`, String(params[key])] : [];
}

// ---- 运行管理 ----
export function startRun(slug, action, params) {
  const steps = buildSteps(slug, action, params);
  return startStepsRun(slug, action, steps);
}

export function startVisualPreviewRun(params = {}) {
  const component = safeCatalogId(params.component, "组件");
  const theme = safeCatalogId(params.theme, "主题");
  const format = { vertical: "portrait", portrait: "portrait", horizontal: "landscape", landscape: "landscape" }[params.format];
  const fixture = safeCatalogId(params.fixture, "测试场景");
  if (!component) throw new Error("刷新真实预览必须指定组件");
  if (!theme) throw new Error("刷新真实预览必须指定主题");
  if (!format) throw new Error("画幅必须是 vertical 或 horizontal");
  if (!fixture) throw new Error("刷新真实预览必须指定测试场景");
  const args = [
    "scripts/visual-preview-generate.mjs",
    "--component", component,
    "--theme", theme,
    "--format", format,
    "--fixture", fixture,
    "--force"
  ];
  const steps = [{ name: `刷新 ${component} · ${theme} · ${format} 真实预览`, cmd: "node", args, cwd: ROOT }];
  return startStepsRun("visual-library", "visual-preview", steps);
}

function safeCatalogId(value, label) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`${label} id 不合法`);
  return id;
}

function startStepsRun(job, action, steps) {
  assertRenderDiskSpace(steps);
  const active = [...runs.values()].find((run) => run.job === job && run.status === "running");
  if (active) throw new Error(`该任务已有运行中的链: ${active.label}(${active.id})`);
  const id = `run-${Date.now()}-${++counter}`;
  const run = {
    id,
    job,
    action,
    label: steps.map((step) => step.name).join(" → "),
    steps,
    stepIndex: -1,
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    listeners: new Set(),
    child: null,
    logFile: path.join(LOG_DIR, `${id}.log`)
  };
  runs.set(id, run);
  nextStep(run);
  return publicRun(run);
}

function assertRenderDiskSpace(steps) {
  const needsSpace = steps.some((step) => /渲染|render|snapshot|预览/i.test(`${step.name} ${step.args.join(" ")}`));
  if (!needsSpace) return;
  const stat = fs.statfsSync(ROOT);
  const free = Number(stat.bavail) * Number(stat.bsize);
  const minimum = 50 * 1024 ** 3;
  if (free < minimum) throw new Error(`磁盘剩余 ${(free / 1024 ** 3).toFixed(1)}G；渲染至少需要 50G`);
}

function nextStep(run) {
  run.stepIndex += 1;
  if (run.stepIndex >= run.steps.length) return finish(run, "done");
  const step = run.steps[run.stepIndex];
  emit(run, "step", { index: run.stepIndex, total: run.steps.length, name: step.name });
  append(run, `\n===== [${run.stepIndex + 1}/${run.steps.length}] ${step.name} =====\n$ ${step.cmd} ${step.args.join(" ")}\n`);
  const child = spawn(step.cmd, step.args, {
    cwd: step.cwd,
    env: { ...process.env, FORCE_COLOR: "0", PRODUCER_BROWSER_GPU_MODE: "hardware" }
  });
  run.child = child;
  child.stdout.on("data", (chunk) => append(run, chunk.toString()));
  child.stderr.on("data", (chunk) => append(run, chunk.toString()));
  child.on("close", (code) => {
    run.child = null;
    if (run.status === "canceled") return;
    if (code !== 0) {
      append(run, `\n[失败] ${step.name} 退出码 ${code}\n`);
      return finish(run, "failed");
    }
    nextStep(run);
  });
  child.on("error", (error) => {
    append(run, `\n[错误] ${error.message}\n`);
    finish(run, "failed");
  });
}

function finish(run, status) {
  run.status = status;
  run.endedAt = new Date().toISOString();
  append(run, `\n===== 运行${status === "done" ? "完成 ✓" : status === "failed" ? "失败 ✗" : "已取消"} =====\n`);
  emit(run, "end", { status });
  for (const res of run.listeners) res.end();
  run.listeners.clear();
  persistIndex();
}

export function cancelRun(id) {
  const run = runs.get(id);
  if (!run || run.status !== "running") throw new Error("没有可取消的运行");
  run.status = "canceled";
  if (run.child) run.child.kill("SIGTERM");
  finish(run, "canceled");
  return publicRun(run);
}

function append(run, text) {
  fs.appendFileSync(run.logFile, text);
  emit(run, "log", { text });
}

function emit(run, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of run.listeners) res.write(payload);
}

export function streamRun(id, res) {
  const run = runs.get(id);
  if (!run) return false;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  if (fs.existsSync(run.logFile)) {
    res.write(`event: log\ndata: ${JSON.stringify({ text: fs.readFileSync(run.logFile, "utf8") })}\n\n`);
  }
  const step = run.steps[run.stepIndex];
  if (run.status === "running" && step) {
    res.write(`event: step\ndata: ${JSON.stringify({ index: run.stepIndex, total: run.steps.length, name: step.name })}\n\n`);
    run.listeners.add(res);
    res.on("close", () => run.listeners.delete(res));
  } else {
    res.write(`event: end\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
    res.end();
  }
  return true;
}

export function publicRun(run) {
  const step = run.steps[run.stepIndex];
  return {
    id: run.id,
    job: run.job,
    action: run.action,
    status: run.status,
    stepIndex: run.stepIndex,
    stepTotal: run.steps.length,
    stepName: run.status === "running" && step ? step.name : null,
    startedAt: run.startedAt,
    endedAt: run.endedAt
  };
}

export function listRuns(slug) {
  const live = [...runs.values()].filter((run) => !slug || run.job === slug).map(publicRun);
  const persisted = readJsonSafe(path.join(LOG_DIR, "runs.json"), []).filter(
    (run) => (!slug || run.job === slug) && !runs.has(run.id)
  );
  return [...live, ...persisted].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

function persistIndex() {
  const file = path.join(LOG_DIR, "runs.json");
  const persisted = readJsonSafe(file, []);
  const finished = [...runs.values()].filter((run) => run.status !== "running").map(publicRun);
  const merged = [...finished, ...persisted.filter((old) => !runs.has(old.id))].slice(0, 200);
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
}
