// ============================================================
// 静帧自检 runner：一次打包，批量出关键帧 + 拼板。
// 用法：node scripts/stage-stills.mjs --job jobs/<slug> [--times 2,8,20] [--out qa/stills-vN] [--auto]
//   --auto：不传 times 时按分镜自动取点（每个场景 start+1.2s，加每个 at 事件后 0.5s，去重）
// 出处：2026-09-03——此前 `npx remotion still` 每张都重新打包，25 张要 4 分钟；Node API 一次打包约 1 分钟。
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
// 静帧前同步工作区（模板 / 分镜改了就重建），否则看到的是旧代码（2026-09-06：改了三处模板静帧全是旧的）
process.env.NARRATIVE_JOB = path.relative(root, jobDir);
{ const { prepareInkPressWorkspace } = await import("./shotcraft-direct-port.mjs"); const ws = prepareInkPressWorkspace({ root }); console.log(`[工作区] ${ws.reused ? "签名未变，复用" : "签名变化，已重建"}`); }
const outDir = path.resolve(jobDir, args.out || "qa/stills-auto");
fs.mkdirSync(outDir, { recursive: true });

const plan = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8"));
const fps = plan.fps || 30;
let times = [];
if (args.times) times = String(args.times).split(",").map(Number);
else {
  const collect = (v, out) => { if (Array.isArray(v)) v.forEach((x) => collect(x, out)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (typeof x === "number" && (k === "at" || k.endsWith("At"))) out.push(x); else collect(x, out); } return out; };
  for (const scene of plan.scenes) {
    times.push(scene.start + 1.2);
    const events = collect(scene, []).filter((t) => t > scene.start && t < scene.end - 0.3);
    for (const t of events) times.push(t + 0.5);
  }
  times = [...new Set(times.map((t) => Math.round(t * 10) / 10))].filter((t) => t < plan.duration - 0.2).sort((a, b) => a - b);
  // 相邻过密的点合并（<1.5s 只留前一个），控制在 ~40 张内
  const thinned = [];
  for (const t of times) if (!thinned.length || t - thinned[thinned.length - 1] >= 1.5) thinned.push(t);
  times = thinned;
  // 画面变化在 A-roll 里、分镜只有一两个场景时（课程录屏 lecture 版式），按场景取点只出 1 张板，
  // 审片人整条片看不见，十条里有六条只能判「看不清」。补一轮每 6s 的均匀采样。（2026-09-12）
  const every = 6;
  for (let t = 1.2; t < plan.duration - 0.3; t += every) times.push(Math.round(t * 10) / 10);
  times = [...new Set(times)].sort((a, b) => a - b);
  const thinned2 = [];
  for (const t of times) if (!thinned2.length || t - thinned2[thinned2.length - 1] >= 1.5) thinned2.push(t);
  times = thinned2;
  if (times.length > 48) { const step = times.length / 48; times = Array.from({ length: 48 }, (_, i) => times[Math.floor(i * step)]); }
}

const { bundle } = await import(path.join(work, "node_modules", "@remotion", "bundler", "dist", "index.js"));
const { renderStill, selectComposition } = await import(path.join(work, "node_modules", "@remotion", "renderer", "dist", "index.js"));
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(work, "src", "factory-index.ts"), publicDir: path.join(work, "public"), onProgress: () => {} });
const composition = await selectComposition({ serveUrl, id: "NarrativeStage", chromiumOptions: { gl: "angle" } });
console.log(`打包 ${Math.round((Date.now() - t0) / 1000)}s，出 ${times.length} 张`);
const files = [];
for (const t of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * fps));
  const output = path.join(outDir, `s-${t.toFixed(1)}.png`);
  await renderStill({ composition, serveUrl, output, frame, imageFormat: "png", chromiumOptions: { gl: "angle" } });
  files.push(output);
}
console.log(`静帧 ${files.length} 张，${Math.round((Date.now() - t0) / 1000)}s → ${path.relative(root, outDir)}`);
// 拼板（每张 640×360，4 列）
const py = `
from PIL import Image; import sys
fs=sys.argv[2:]; W,H=640,360; cols=4
for part in range(0,len(fs),12):
    chunk=fs[part:part+12]; r=(len(chunk)+cols-1)//cols
    b=Image.new('RGB',(cols*W,r*H),(0,0,0))
    for i,f in enumerate(chunk): b.paste(Image.open(f).resize((W,H)),((i%cols)*W,(i//cols)*H))
    b.save(sys.argv[1]+f'/board-{part//12+1}.png')
print('boards', (len(fs)+11)//12)
`;
const r = spawnSync("python3", ["-c", py, outDir, ...files], { encoding: "utf8" });
process.stdout.write(r.stdout || ""); if (r.status) console.error(r.stderr);
