// ============================================================
// 叙事舞台渲染 runner：一条命令 = 锁 → 渲染 → Rec.709 规范化 → 门禁 → 抽帧板 → 720p 预览 → （可选）交付到 Downloads。
// 用法：node scripts/stage-render.mjs --job jobs/<slug> [--proof | --final] [--version v2] [--concurrency 8] [--deliver "文件夹名"]
//   --proof（默认）：540p 样片，快编码，只出预览给 Scott 审，不进 Downloads
//   --final：1080p 60fps 高码率（crf 15）+ Rec.709 规范化，打包到 ~/Downloads/<日期-片名-YouTube横屏-xiaolin>/
// 出处：2026-09-03 Scott——没明说要成片就先出样片审，通过后再渲成片
// 出处：2026-09-03——此前人工起渲染两次同写一个文件、渲完再手跑门禁；渲染是流程不是判断，全部脚本化。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, "renders", "work-shotcraft", "ink-press");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter(Boolean));
if (!args.job) throw new Error("--job jobs/<slug> 必填");
const jobDir = path.resolve(root, args.job);
const slug = path.basename(jobDir);
const rendersDir = path.join(jobDir, "renders");
const qaDir = path.join(jobDir, "qa", "final");
fs.mkdirSync(rendersDir, { recursive: true }); fs.mkdirSync(qaDir, { recursive: true });
const sh = (cmd, argv, opts = {}) => { const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts }); if (r.status !== 0 && !opts.allowFail) { console.error(r.stderr || r.stdout); throw new Error(`${cmd} ${argv.slice(0, 3).join(" ")} 失败`); } return r; };
const log = (m) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${m}`);

// ---- 0. 当前 job 必须就是工作区绑定的 job（防止渲成别的片） ----
const sticky = fs.existsSync(path.join(root, "renders", "work-shotcraft", ".narrative-job")) ? fs.readFileSync(path.join(root, "renders", "work-shotcraft", ".narrative-job"), "utf8").trim() : "";
const gatesOnly = Boolean(args["gates-only"]); // 只重跑门禁（门禁本身改了、或成片已在）：--gates-only --version vN；不碰工作区
if (!gatesOnly && sticky && path.resolve(root, sticky) !== jobDir) throw new Error(`工作区当前绑定 ${sticky}，不是 ${args.job}；先 NARRATIVE_JOB=${args.job} 跑 prepareInkPressWorkspace`);
// 模板 / 分镜 / 字幕改了工作区签名就重建，否则复用——此前渲染不同步工作区，模板修完渲出来还是旧代码（2026-09-06 Accent 同色字事故，白渲一轮）
if (!gatesOnly) { process.env.NARRATIVE_JOB = path.relative(root, jobDir); const { prepareInkPressWorkspace } = await import("./shotcraft-direct-port.mjs"); const ws = prepareInkPressWorkspace({ root }); console.log(`[工作区] ${ws.reused ? "签名未变，复用" : "签名变化，已重建"}`); }
// ---- 1. 锁 ----
const lock = path.join(rendersDir, ".render.lock");
if (fs.existsSync(lock)) { const pid = Number(fs.readFileSync(lock, "utf8")); let alive = false; try { process.kill(pid, 0); alive = true; } catch {} if (alive) throw new Error(`已有渲染在跑（pid ${pid}）：${lock}`); fs.rmSync(lock); }
fs.writeFileSync(lock, String(process.pid));
process.on("exit", () => { try { fs.rmSync(lock); } catch {} });
const mode = args.final ? "final" : "proof";
const concurrency = String(args.concurrency || 8);
const scale = String(args.scale || (mode === "proof" ? 0.5 : 1));
const renderFps = mode === "final" ? String(args.fps || 60) : String(args.fps || 30);
const isPortrait = (() => { try { const c = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8")).canvas; return !!(c && c.h > c.w); } catch { return false; } })();
const projectTitle = (() => { try { return JSON.parse(fs.readFileSync(path.join(jobDir, "project.json"), "utf8")).title || slug; } catch { return slug; } })();
// ---- 2. 版本号 ----
let version = args.version;
if (!version) { const n = fs.readdirSync(rendersDir).map((f) => f.match(/-v(\d+)\.mp4$/)).filter(Boolean).map((m) => Number(m[1])); version = `v${(n.length ? Math.max(...n) : 0) + 1}`; }
const base = `${slug.replace(/-\d{8}$/, "")}-${version}${mode === "proof" ? "-proof" : ""}`;
const source = path.join(rendersDir, `${base}-source.mp4`);
const final = path.join(rendersDir, `${base}.mp4`);
const preview = path.join(rendersDir, `${base}-preview.mp4`);

// ---- 0.5 成片硬门：没有独立审片通过 + Scott 通过记录，不渲 1080p（docs/xiaolin-taste.md §7；2026-09-05 Codex 门禁全绿直接上传 YouTube 的教训）----
if (mode === "final" && !gatesOnly) {
  const reviewFile = path.join(jobDir, "qa", `review-${version}.json`);
  const approvalFile = path.join(jobDir, "qa", `approval-${version}.json`);
  const force = args["force-final"] && args["force-final"] !== true ? String(args["force-final"]) : "";
  const rv = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, "utf8")) : null;
  const ap = fs.existsSync(approvalFile) ? JSON.parse(fs.readFileSync(approvalFile, "utf8")) : null;
  if (!(rv && rv.verdict === "pass" && ap)) {
    if (!force) throw new Error(`成片被拒：${rv ? (rv.verdict === "pass" ? "" : "独立审片未过；") : "没有独立审片记录（node scripts/stage-review.mjs）；"}${ap ? "" : "没有 Scott 通过记录（node scripts/stage-approve.mjs）"}。紧急情况用 --force-final \"原因\"，原因会写进渲染报告`);
    console.warn(`[警告] --force-final 绕过审片 / 批准门：${force}`);
  }
}
// ---- 3. 渲染 ----
const t0 = Date.now();
if (gatesOnly && !fs.existsSync(final)) throw new Error(`--gates-only 需要已有成片 ${final}`);
if (!gatesOnly) log(`渲染 ${base}（${mode === "proof" ? "样片 540p" : `成片 1080p${renderFps}`}）并发 ${concurrency} scale ${scale}`);
// delayRender 超时放宽到 120s（2026-09-03：8 并发下物件图加载偶发 >28s 直接炸），失败后自动降并发重试一次
const renderOnce = (conc) => spawnSync("npx", ["remotion", "render", "src/factory-index.ts", "NarrativeStage", source, `--concurrency=${conc}`, `--scale=${scale}`, "--timeout=120000", "--log=error"], { cwd: work, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, REMOTION_RENDER_FPS: renderFps } });
let r = gatesOnly ? { status: 0 } : renderOnce(concurrency);
if (r.status !== 0) {
  const fallback = String(Math.max(2, Math.floor(Number(concurrency) / 2)));
  console.error(r.stderr.slice(-1500));
  log(`渲染失败，降到并发 ${fallback} 重试一次`);
  r = renderOnce(fallback);
  if (r.status !== 0) { console.error(r.stderr.slice(-4000)); throw new Error("Remotion 渲染失败"); }
}
if (!gatesOnly) log(`渲染完成 ${Math.round((Date.now() - t0) / 1000)}s`);
// ---- 4. Rec.709 规范化 ----
const vf = "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709";
// A-roll 已按 -14 LUFS / -1 dBTP 处理，但舞台 SFX 混入后可能出现 true peak 超 0 dBTP；最终混音必须再次统一响度与峰值。
// AAC 编码会产生约 0.5–0.8 dB 的 inter-sample overshoot，目标留到 -2 dBTP 才能保证交付文件仍低于 -1 dBTP。
const af = "loudnorm=I=-14:TP=-2:LRA=7,alimiter=limit=0.794:level=disabled";
if (gatesOnly) { /* 成片已在 */ }
else if (mode === "final") sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", vf, "-af", af, "-ar", "48000", "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-maxrate", "24M", "-bufsize", "48M", "-g", renderFps, "-keyint_min", renderFps, "-sc_threshold", "0", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", final]);
else sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", vf, "-af", af, "-ar", "48000", "-c:v", "libx264", "-preset", "fast", "-crf", "24", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", final]);
// ---- 5. 门禁 ----
const gates = {};
const probe = sh("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,pix_fmt,color_space,color_transfer,color_primaries:format=duration", "-of", "default=nw=1", final]).stdout;
gates.probe = probe.trim().replace(/\n/g, " ");
gates.decodeErrors = sh("ffmpeg", ["-v", "error", "-i", final, "-f", "null", "-"], { allowFail: true }).stderr.trim().split("\n").filter(Boolean).length;
gates.black = (sh("ffmpeg", ["-hide_banner", "-i", final, "-vf", "blackdetect=d=0.3:pic_th=0.98", "-an", "-f", "null", "-"], { allowFail: true }).stderr.match(/black_start/g) || []).length;
// 冻结门禁测「该动的区域」，不是整帧：主体是角落小窗时（课程录屏 lecture 版式，人脸只占画面 3%），
// 整帧均差必然低于 n=0.001，好好的活画面会被判成冻结（2026-09-14 七条全中，抽帧实测小窗帧间差 5–10）。
// 分镜可声明 motionBox（画布坐标）圈出主体；不声明就沿用整帧，既有 job 行为不变。
const motionBox = (() => {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8"));
    const b = p.motionBox; if (!b) return null;
    const cw = (p.canvas && p.canvas.w) || 1920, ch = (p.canvas && p.canvas.h) || 1080;
    const ow = Number((probe.match(/width=(\d+)/) || [])[1]) || cw;
    const oh = Number((probe.match(/height=(\d+)/) || [])[1]) || ch;
    return `crop=${Math.round(b.w * ow / cw)}:${Math.round(b.h * oh / ch)}:${Math.round(b.x * ow / cw)}:${Math.round(b.y * oh / ch)},`;
  } catch { return null; }
})();
gates.freeze = (sh("ffmpeg", ["-hide_banner", "-i", final, "-vf", `${motionBox || ""}freezedetect=n=0.001:d=1.5`, "-an", "-f", "null", "-"], { allowFail: true }).stderr.match(/freeze_start/g) || []).length;
gates.silence = (sh("ffmpeg", ["-hide_banner", "-i", final, "-af", "silencedetect=n=-45dB:d=0.8", "-vn", "-f", "null", "-"], { allowFail: true }).stderr.match(/silence_start/g) || []).length;
const vol = sh("ffmpeg", ["-hide_banner", "-i", final, "-af", "volumedetect", "-vn", "-f", "null", "-"], { allowFail: true }).stderr;
gates.meanVolume = (vol.match(/mean_volume: ([-\d.]+)/) || [])[1]; gates.maxVolume = (vol.match(/max_volume: ([-\d.]+)/) || [])[1];
gates.sceneCuts = (sh("ffmpeg", ["-hide_banner", "-i", final, "-vf", "select='gt(scene,0.35)',showinfo", "-an", "-f", "null", "-"], { allowFail: true }).stderr.match(/pts_time:([\d.]+)/g) || []).map((m) => Number(m.split(":")[1]).toFixed(2));
// B-roll 面板必须在动：每个 broll 场景取首尾两帧（面板区域，灰度 240px 宽）比均差；阈值相对素材自身动态（min(1.5, max(0.5, 源片均差×0.6))），静态镜头不误拦
// 出处：2026-09-03 深夜发现 OffthreadVideo 没包 Sequence，三条成片的 B-roll 全停在最后一帧，全片冻结门禁抓不到（人物在动）
const BROLL_BOX = { panel: [700, 70, 1166, 810], screen: [700, 70, 1166, 810], full: [0, 0, 1920, 1080], strip: [0, 250, 1920, 600] };
gates.brollFrozen = [];
try {
  const plan = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8"));
  // BROLL_BOX 以 1920×1080 母版坐标定义；proof 是 960×540，必须按实际输出尺寸缩放，否则 crop 越界会被误判成素材冻结。
  const outputWidth = Number((probe.match(/width=(\d+)/) || [])[1]) || 1920;
  const outputHeight = Number((probe.match(/height=(\d+)/) || [])[1]) || 1080;
  const scaleBox = (box) => [
    Math.round(box[0] * outputWidth / 1920),
    Math.round(box[1] * outputHeight / 1080),
    Math.round(box[2] * outputWidth / 1920),
    Math.round(box[3] * outputHeight / 1080),
  ];
  const grab = (t, box) => { const [x, y, w, h] = scaleBox(box); const r = sh("ffmpeg", ["-v", "error", "-ss", String(t), "-i", final, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y},scale=240:-1,format=gray`, "-f", "rawvideo", "-"], { allowFail: true, encoding: "buffer" }); return r.stdout; };
  for (const sc of plan.scenes.filter((s) => s.type === "broll" && s.end - s.start >= 1.2)) {
    const box = BROLL_BOX[sc.layout || "panel"]; const a = grab(sc.start + 0.5, box), b = grab(sc.end - 0.3, box);
    if (!a?.length || a.length !== b?.length) { gates.brollFrozen.push(`${sc.id}:抓帧失败`); continue; }
    const meanDiff = (x, y) => { let sum = 0; for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]); return sum / x.length; };
    const mean = meanDiff(a, b);
    // 源片同一段的自身动态（媒体路径 factory/<slug>/... → jobs/<slug>/assets/...）
    let threshold = 1.5;
    const srcPath = path.join(jobDir, "assets", String(sc.media).replace(new RegExp(`^factory/${slug}/`), ""));
    if (fs.existsSync(srcPath)) {
      const grabSrc = (t) => { const r = sh("ffmpeg", ["-v", "error", "-ss", String(t), "-i", srcPath, "-frames:v", "1", "-vf", "scale=240:-1,format=gray", "-f", "rawvideo", "-"], { allowFail: true, encoding: "buffer" }); return r.stdout; };
      const m0 = sc.mediaStart ?? 0; const c = grabSrc(m0 + 0.5), d = grabSrc(m0 + (sc.end - sc.start) - 0.3);
      if (c?.length && c.length === d?.length) threshold = Math.min(1.5, Math.max(0.5, meanDiff(c, d) * 0.6));
    }
    if (mean < threshold) gates.brollFrozen.push(`${sc.id}:${mean.toFixed(2)}<${threshold.toFixed(2)}`);
  }
} catch (e) { gates.brollFrozen.push(`门禁自身失败:${e.message}`); }
const ok = gates.decodeErrors === 0 && gates.black === 0 && gates.freeze === 0 && gates.silence === 0 && gates.brollFrozen.length === 0 && /yuv420p/.test(gates.probe) && /bt709/.test(gates.probe);
// ---- 6. 抽帧板 + 全片抽帧条 ----
const plan = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8"));
const caps = plan.scenes.map((s) => Math.round((s.start + Math.min(1.2, (s.end - s.start) / 2)) * 10) / 10).slice(0, 16);
const capFiles = caps.map((t, i) => { const f = path.join(qaDir, `cap-${String(i + 1).padStart(2, "0")}-${t}s.png`); sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(t), "-i", final, "-frames:v", "1", f]); return f; });
const py = `
from PIL import Image; import sys
fs=sys.argv[2:]; W,H=960,540; cols=2
for part in range(0,len(fs),8):
    chunk=fs[part:part+8]; r=(len(chunk)+cols-1)//cols
    b=Image.new('RGB',(cols*W,r*H),(0,0,0))
    for i,f in enumerate(chunk): b.paste(Image.open(f).resize((W,H)),((i%cols)*W,(i//cols)*H))
    b.save(sys.argv[1]+f'/capability-board-{chr(97+part//8)}.png')
`;
sh("python3", ["-c", py, qaDir, ...capFiles]);
sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", final, "-vf", "fps=1/6,scale=480:270,tile=6x6", "-frames:v", "1", path.join(qaDir, "filmstrip.jpg")]);
// ---- 7. 预览 ----
if (mode === "final") sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", final, "-vf", "scale=1280:720", "-c:v", "libx264", "-preset", "fast", "-crf", "24", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", preview]); else fs.copyFileSync(final, preview);
// ---- 8. 交付 ----
let delivered = null;
if (mode === "final") {
  const folder = args.deliver && args.deliver !== true ? String(args.deliver) : `${new Date().toISOString().slice(0, 10)}-${projectTitle.replace(/[\/\\:*?"<>|\s]+/g, "")}-${isPortrait ? "抖音竖屏" : "YouTube横屏"}-xiaolin`;
  const dir = path.join(process.env.HOME, "Downloads", folder); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".mp4")) fs.rmSync(path.join(dir, f)); // 文件夹里只留最新成片
  const dst = path.join(dir, `${base}-1080p${renderFps}.mp4`); fs.copyFileSync(final, dst); fs.copyFileSync(path.join(qaDir, "filmstrip.jpg"), path.join(dir, `抽帧条-${version}.jpg`)); delivered = dst;
}
const report = { version, mode, forcedFinal: args["force-final"] && args["force-final"] !== true ? String(args["force-final"]) : null, renderFps: Number(renderFps), final: path.relative(root, final), preview: path.relative(root, preview), renderSeconds: Math.round((Date.now() - t0) / 1000), concurrency, gates, ok, delivered };
fs.writeFileSync(path.join(qaDir, `render-report-${version}.json`), JSON.stringify(report, null, 2));
log(`门禁 ${ok ? "全绿" : "有问题"}：黑帧 ${gates.black} 冻结 ${gates.freeze} 静音 ${gates.silence} 解码错 ${gates.decodeErrors} B-roll冻结 ${gates.brollFrozen.length ? gates.brollFrozen.join(",") : 0} 突变 ${gates.sceneCuts.join(",") || "无"} 音量 ${gates.meanVolume}/${gates.maxVolume} dB`);
log(`${mode === "proof" ? "样片" : "成片"} ${report.final}；预览 ${report.preview}${delivered ? `；已交付 ${delivered}` : "（样片不进 Downloads）"}`);
if (!ok) process.exit(2);
