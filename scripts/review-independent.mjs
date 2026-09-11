// ============================================================
// 独立审片：把审片成片抽成静帧板 + 门禁报告 + docs/factory-review-checklist.md 的清单原文，
//   交给一个没有剪辑上下文的模型逐条打分，写 review/Rn/independent-review.json；任一 ✗ 退出码 2。
// 为什么：2026-09-11 审计——客户 8 条片的审批全是自证（approval 与冻结相差 <200ms、"publish_ready" 在 QA 后 2m42s 写下），
//   每轮只响应最后一句话，同一缺陷被投诉 2–5 轮。审片人必须与写分镜的人不是同一个上下文。
// 用法：node scripts/review-independent.mjs --job jobs/<slug> --revision R1 [--video review/R1/video.mp4]
//        [--reviewer codex|claude] [--model <id>] [--stills-only]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, parseArgs, projectRoot, readJson, resolveJob, run, videoDuration } from "./lib.mjs";

const root = projectRoot();

export function pickStillTimes({ duration, captions = [], cutTimes = [], max = 36 }) {
  const times = new Set();
  for (const cut of cutTimes) { times.add(Math.max(0, cut - 0.05)); times.add(cut + 0.05); }
  for (const caption of captions) times.add(Number(caption.s) + 0.15);
  times.add(0.05);
  times.add(Math.max(0, duration - 1.5));
  times.add(Math.max(0, duration - 0.2));
  let list = [...times].filter((t) => t >= 0 && t < duration).sort((a, b) => a - b);
  if (list.length > max) {
    const step = list.length / max;
    list = Array.from({ length: max }, (_, index) => list[Math.floor(index * step)]);
  }
  return list.map((t) => Math.round(t * 100) / 100);
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
    run("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=360:-2,drawtext=text='%{eif\\:trunc(t)\\:d}':x=0:y=0:fontsize=1:fontcolor=white@0", "-q:v", "3", file], { stdio: "pipe" });
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

function callReviewer({ reviewer, model, prompt, boards, outDir }) {
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
  throw new Error(`未知审片人 ${reviewer}（codex|claude）`);
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

function main() {
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
  const reviewer = String(args.reviewer || process.env.FACTORY_REVIEWER || "codex");
  const raw = callReviewer({ reviewer, model: args.model || process.env.FACTORY_REVIEW_MODEL, prompt, boards, outDir });
  fs.writeFileSync(path.join(outDir, "raw.txt"), raw);
  const { verdict, items, failed, notes } = parseVerdict(raw);
  const report = { revision, reviewer, at: new Date().toISOString(), video: path.relative(jobDir, video), boards: boards.map((board) => path.relative(jobDir, board.file)), verdict, items, notes, checklistSource: "docs/factory-review-checklist.md" };
  atomicWriteJson(path.join(jobDir, "review", revision, "independent-review.json"), report);
  console.log(`独立审片 ${verdict === "pass" ? "通过" : "未过"}（${reviewer}）：${items.length} 条，✗ ${failed.length}${failed.length ? "\n- " + failed.map((item) => `#${item.n} ${item.evidence}`).join("\n- ") : ""}`);
  if (verdict !== "pass") process.exit(2);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
