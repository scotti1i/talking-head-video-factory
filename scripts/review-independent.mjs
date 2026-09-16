// ============================================================
// 独立审片：把审片成片抽成静帧板 + 门禁报告 + docs/factory-review-checklist.md 的清单原文，
//   交给一个没有剪辑上下文的模型逐条打分，写 review/Rn/independent-review.json；任一 ✗ 退出码 2。
// 为什么：2026-09-11 审计——客户 8 条片的审批全是自证（approval 与冻结相差 <200ms、"publish_ready" 在 QA 后 2m42s 写下），
//   每轮只响应最后一句话，同一缺陷被投诉 2–5 轮。审片人必须与写分镜的人不是同一个上下文。
// 用法：node scripts/review-independent.mjs --job jobs/<slug> --revision R1 [--video review/R1/video.mp4]
//        [--reviewer codex|claude|gemini] [--model <id>] [--stills-only]
// 审片人选择（v2.0.3 spec C）：--reviewer > FACTORY_REVIEWER > 有 codex 命令用 codex > 有 GEMINI_API_KEY 用 gemini > 报错。
//   gemini 走 REST generateContent，静帧板 PNG 以 inline_data 随提示词一起发；模型取 FACTORY_GEMINI_MODEL，
//   未设则 ListModels 选最新 gemini-*-pro 并缓存到 ~/.config/talking-head-factory/gemini-model。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, commandExists, factoryConfigDir, factoryEnvValue, parseArgs, projectRoot, readJson, resolveJob, run, videoDuration } from "./lib.mjs";

const root = projectRoot();
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_TIMEOUT_MS = 180_000;
const REVIEWERS = Object.freeze(["codex", "claude", "gemini"]);

export function pickStillTimes({ duration, captions = [], cutTimes = [], max = 36 }) {
  // 必看：每个切点前后 0.05s、开头、结尾 3s 内三帧（收尾 CTA）；可选：字幕入点。只对可选项抽稀。
  const must = new Set([0.05, Math.max(0, duration - 2.5), Math.max(0, duration - 1.2), Math.max(0, duration - 0.2)]);
  for (const cut of cutTimes) { must.add(Math.max(0, cut - 0.05)); must.add(cut + 0.05); }
  const optional = [...new Set(captions.map((caption) => Number(caption.s) + 0.15))].filter((t) => !must.has(t));
  const room = Math.max(0, max - must.size);
  let picked = optional;
  if (optional.length > room && room > 0) {
    const step = optional.length / room;
    picked = Array.from({ length: room }, (_, index) => optional[Math.floor(index * step)]);
  } else if (room === 0) picked = [];
  return [...new Set([...must, ...picked])].filter((t) => t >= 0 && t < duration).sort((a, b) => a - b).map((t) => Math.round(t * 100) / 100);
}

export function cutTimesFromEdl(segments, rate) {
  let cursor = 0;
  const cuts = [];
  for (const segment of segments.slice(0, -1)) {
    cursor += (Number(segment.sourceEnd) - Number(segment.sourceStart)) / rate;
    cuts.push(Math.round(cursor * 1000) / 1000);
  }
  return cuts;
}

function renderBoards(video, times, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const stills = times.map((t, index) => {
    const file = path.join(outDir, `s-${String(index + 1).padStart(3, "0")}.jpg`);
    run("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "3", file], { stdio: "pipe" });
    return { t, file };
  });
  const boards = [];
  for (let start = 0; start < stills.length; start += 12) {
    const chunk = stills.slice(start, start + 12);
    const boardIndex = boards.length + 1;
    const pattern = path.join(outDir, `b${boardIndex}-%03d.jpg`);
    chunk.forEach((item, index) => fs.copyFileSync(item.file, pattern.replace("%03d", String(index + 1).padStart(3, "0"))));
    const board = path.join(outDir, `board-${boardIndex}.png`);
    run("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", pattern, "-vf", `tile=4x${Math.ceil(chunk.length / 4)}:padding=6:color=black`, "-frames:v", "1", board], { stdio: "pipe" });
    boards.push({ file: board, tiles: chunk.map((item, index) => ({ tile: index + 1, t: item.t })) });
  }
  return boards;
}

function readIfExists(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function summarizeReport(label, report, pick) {
  if (!report) return `- ${label}：缺失（按清单规则 = ✗）`;
  return `- ${label}：${pick(report)}`;
}

function buildPrompt({ checklist, boards, dataSummary, duration, jobName, revision }) {
  const tileMap = boards.map((board) => `${path.basename(board.file)}：${board.tiles.map((tile) => `格${tile.tile}=${tile.t}s`).join("，")}（从左到右、从上到下，每行 4 格）`).join("\n");
  return `你是独立审片人，上下文里没有写分镜和剪辑的人的任何想法。只看图和下面的规则、报告，逐条打分。

## 审片清单（docs/factory-review-checklist.md 原文）
${checklist.trim()}

## 这条片
- job ${jobName} · 修订 ${revision} · 片长 ${duration}s

## 门禁报告（第 2、3、4、9 条只认这些报告，看不到就是 ✗）
${dataSummary}

## 静帧板（每格对应的时间）
${tileMap}
图片文件：
${boards.map((board) => `- ${board.file}`).join("\n")}

## 输出
只输出一个 JSON 对象，不要任何别的文字：
{"verdict":"pass"|"fail","items":[{"n":1,"ok":true|false,"evidence":"一句话 + 帧时间或报告字段"},...共 10 条],"notes":"两句以内的总体判断"}
规则：任一条 ok=false 则 verdict=fail；看不清就写 ok=false 并说明看不清；不要给建议，只给判断。`;
}

// ---- 审片后端选择 ----
// explicit（--reviewer）> env.FACTORY_REVIEWER > 自动：codex 命令在 → codex；GEMINI_API_KEY 在 → gemini；否则报错。
export function selectReviewer({ explicit, env = {}, commandExists: exists = commandExists } = {}) {
  const chosen = String(explicit || env.FACTORY_REVIEWER || "").trim();
  if (chosen) {
    if (!REVIEWERS.includes(chosen)) throw new Error(`未知审片人 ${chosen}（${REVIEWERS.join("|")}）`);
    return chosen;
  }
  if (exists("codex")) return "codex";
  if (env.GEMINI_API_KEY) return "gemini";
  throw new Error("缺审片后端：装 codex 或配置 GEMINI_API_KEY");
}

// ---- Gemini ----
// 静帧板 PNG → inline_data；temperature 0 保证同一批板子多次审片结论稳定。
export function buildGeminiRequest({ prompt, boards, readFile = (file) => fs.readFileSync(file) }) {
  const parts = [{ text: prompt }];
  for (const board of boards) {
    parts.push({ inline_data: { mime_type: "image/png", data: Buffer.from(readFile(board.file)).toString("base64") } });
  }
  return { contents: [{ role: "user", parts }], generationConfig: { temperature: 0 } };
}

// ListModels 里挑最新的 gemini-*-pro：版本号大者优先，同版本正式版（无 preview/exp/latest）优先，再短名优先。
export function pickGeminiModel(listResponse) {
  const models = (listResponse?.models || []).filter((model) =>
    /^models\/gemini-.*-pro/.test(String(model.name || "")) &&
    (model.supportedGenerationMethods || []).includes("generateContent"));
  if (!models.length) throw new Error("ListModels 里没有支持 generateContent 的 gemini-*-pro 模型；请设置 FACTORY_GEMINI_MODEL");
  const version = (name) => Number((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const isPreview = (name) => /preview|exp|latest/.test(name);
  models.sort((a, b) => version(b.name) - version(a.name) || Number(isPreview(a.name)) - Number(isPreview(b.name)) || a.name.length - b.name.length);
  return models[0].name.replace(/^models\//, "");
}

export async function resolveGeminiModel({ apiKey, env = process.env, fetchImpl = globalThis.fetch, cacheFile = path.join(factoryConfigDir(), "gemini-model") } = {}) {
  if (env.FACTORY_GEMINI_MODEL) return env.FACTORY_GEMINI_MODEL;
  if (fs.existsSync(cacheFile)) {
    const cached = fs.readFileSync(cacheFile, "utf8").trim();
    if (cached) return cached;
  }
  const response = await fetchWithTimeout(fetchImpl, `${GEMINI_API_BASE}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`, {}, GEMINI_TIMEOUT_MS);
  const model = pickGeminiModel(await response.json());
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(cacheFile, `${model}\n`);
  return model;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini HTTP ${response.status}：${body.slice(0, 300)}`);
  }
  return response;
}

export async function callGemini({ apiKey, model, prompt, boards, fetchImpl = globalThis.fetch, timeoutMs = GEMINI_TIMEOUT_MS }) {
  if (!apiKey) throw new Error("缺 GEMINI_API_KEY（环境变量或 ~/.config/talking-head-factory/env）");
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify(buildGeminiRequest({ prompt, boards }));
  const response = await fetchWithTimeout(fetchImpl, url, { method: "POST", headers: { "Content-Type": "application/json" }, body }, timeoutMs);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  if (!text.trim()) throw new Error(`Gemini 没有返回文本：${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

async function callReviewer({ reviewer, model, prompt, boards, outDir }) {
  if (reviewer === "codex") {
    const last = path.join(outDir, "codex-last.md");
    const args = ["exec", "--skip-git-repo-check", "-s", "read-only", "-C", root, ...(model ? ["-m", model] : []), "-o", last, ...boards.flatMap((board) => ["-i", board.file]), "--", prompt];
    const result = spawnSync("codex", args, { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error(`codex exec 审片失败：${(result.stderr || "").slice(-1500)}`);
    return fs.existsSync(last) ? fs.readFileSync(last, "utf8") : result.stdout;
  }
  if (reviewer === "claude") {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const result = spawnSync("claude", ["-p", prompt, "--allowedTools", "Read", "--permission-mode", "dontAsk", ...(model ? ["--model", model] : [])], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, env });
    if (result.status !== 0) throw new Error(`claude -p 审片失败：${(result.stderr || "").slice(-1500)}`);
    return result.stdout;
  }
  if (reviewer === "gemini") {
    const apiKey = factoryEnvValue("GEMINI_API_KEY");
    const resolvedModel = model || await resolveGeminiModel({ apiKey, env: { FACTORY_GEMINI_MODEL: factoryEnvValue("FACTORY_GEMINI_MODEL") } });
    console.log(`Gemini 模型：${resolvedModel}`);
    return callGemini({ apiKey, model: resolvedModel, prompt, boards });
  }
  throw new Error(`未知审片人 ${reviewer}（${REVIEWERS.join("|")}）`);
}

export function parseVerdict(raw) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`审片输出不是 JSON：${String(raw).slice(0, 300)}`);
  const parsed = JSON.parse(match[0]);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const failed = items.filter((item) => item && item.ok === false);
  const verdict = items.length >= 10 && failed.length === 0 && parsed.verdict !== "fail" ? "pass" : "fail";
  return { verdict, items, failed, notes: parsed.notes || "" };
}

async function main() {
  const args = parseArgs();
  const jobDir = resolveJob(args.job);
  const revision = String(args.revision || "R0");
  const video = path.resolve(jobDir, args.video || path.join("review", revision, "video.mp4"));
  if (!fs.existsSync(video)) throw new Error(`审片成片不存在：${path.relative(jobDir, video)}（先 npm run review -- init）`);
  const project = readJson(path.join(jobDir, "project.json"));
  const rate = Number(project.aroll?.playbackRate || 1);
  const duration = Math.round(videoDuration(video) * 100) / 100;
  const captions = readIfExists(path.join(jobDir, "data", "captions.json")) || [];
  const edl = readIfExists(path.join(jobDir, "data", "rough-cut-edl.json")) || [];
  const outDir = path.join(jobDir, "review", revision, "independent");
  const times = pickStillTimes({ duration, captions, cutTimes: cutTimesFromEdl(edl, rate) });
  const boards = renderBoards(video, times, outDir);
  console.log(`静帧 ${times.length} 张 → ${boards.length} 块板 ${path.relative(jobDir, outDir)}`);
  if (args["stills-only"]) return;

  const checklistDoc = fs.readFileSync(path.join(root, "docs", "factory-review-checklist.md"), "utf8");
  const checklist = checklistDoc.split("## 审片清单")[1]?.split("## 附录")[0] || "";
  if (!checklist.trim()) throw new Error("docs/factory-review-checklist.md 缺「审片清单」一节");
  const alignment = readIfExists(path.join(jobDir, "qa", "alignment-report.json"));
  const voice = readIfExists(path.join(jobDir, "qa", "caption-voice-report.json"));
  const dialogue = readIfExists(path.join(jobDir, "qa", "dialogue-continuity-report.json"));
  const audio = readIfExists(path.join(jobDir, "qa", "audio-report.json"));
  const dataSummary = [
    summarizeReport("qa/alignment-report.json（字幕同步）", alignment, (r) => `${r.status}，${r.checked} 个锚点，最大偏差 ${r.maxAbsOffsetFrames} 帧`),
    summarizeReport("qa/caption-voice-report.json（字幕覆盖与词面）", voice, (r) => `${r.ok === false || r.status === "failed" ? "failed" : "passed"}${r.errors?.length ? `：${r.errors.slice(0, 5).join("；")}` : ""}`),
    summarizeReport("qa/dialogue-continuity-report.json（段首 / 尾词 / 响度）", dialogue, (r) => JSON.stringify(r.summary || r.status || r).slice(0, 400)),
    summarizeReport("qa/audio-report.json（响度 / 峰值）", audio, (r) => JSON.stringify(r.summary || r.measured || r.status || r).slice(0, 300)),
    `- 字幕 ${captions.length} 条；EDL ${edl.length} 段；倍速 ${rate}`
  ].join("\n");
  const prompt = buildPrompt({ checklist, boards, dataSummary, duration, jobName: path.basename(jobDir), revision });
  fs.writeFileSync(path.join(outDir, "prompt.md"), prompt);
  const reviewer = selectReviewer({ explicit: args.reviewer, env: { FACTORY_REVIEWER: factoryEnvValue("FACTORY_REVIEWER"), GEMINI_API_KEY: factoryEnvValue("GEMINI_API_KEY") } });
  const raw = await callReviewer({ reviewer, model: args.model || process.env.FACTORY_REVIEW_MODEL, prompt, boards, outDir });
  fs.writeFileSync(path.join(outDir, "raw.txt"), raw);
  const { verdict, items, failed, notes } = parseVerdict(raw);
  const report = { revision, reviewer, at: new Date().toISOString(), video: path.relative(jobDir, video), boards: boards.map((board) => path.relative(jobDir, board.file)), verdict, items, notes, checklistSource: "docs/factory-review-checklist.md" };
  atomicWriteJson(path.join(jobDir, "review", revision, "independent-review.json"), report);
  console.log(`独立审片 ${verdict === "pass" ? "通过" : "未过"}（${reviewer}）：${items.length} 条，✗ ${failed.length}${failed.length ? "\n- " + failed.map((item) => `#${item.n} ${item.evidence}`).join("\n- ") : ""}`);
  if (verdict !== "pass") process.exit(2);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error.message); process.exit(1); });
