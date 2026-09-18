// ============================================================
// 参照成片回归：引擎 / 模板改动后，把 docs/exemplars/index.json 里每条参照片在固定时间点重渲静帧，与基线比 SSIM。
// 漂移即报——2026-09-06 一天里三次「改了模板渲出来还是旧的 / 改了 A 影响了 B」，没有回归只能靠人眼。
// 用法：node scripts/stage-regress.mjs            # 对比
//       node scripts/stage-regress.mjs --update   # 重建基线（只在 Scott 验收过新观感后）
//       node scripts/stage-regress.mjs --only gpt6-astra-fable-v3b
// 注意：会轮流切换渲染工作区到各参照 job；渲染进行中别跑。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter(Boolean));
const THRESHOLD = Number(args.threshold || 0.96);
const index = JSON.parse(fs.readFileSync(path.join(root, "docs", "exemplars", "index.json"), "utf8"));
const list = index.exemplars.filter((e) => !args.only || e.id === args.only);
const scratch = path.join(root, "renders", "regress");
let failed = 0;
for (const ex of list) {
  const refDir = path.join(root, "docs", "exemplars", ex.id);
  const jobDir = path.resolve(root, ex.job);
  if (!fs.existsSync(path.join(jobDir, "data", "scene-plan.json"))) { console.warn(`跳过 ${ex.id}：job 不在本机`); continue; }
  if (!fs.existsSync(path.join(jobDir, "assets", "aroll.mp4"))) { console.warn(`跳过 ${ex.id}：缺 assets/aroll.mp4（jobs/*/assets 不进 git；2026-09-05 被外部清理过，需从备份恢复）`); continue; }
  // 参照 job 的分镜以 docs/exemplars 里的快照为准（job 目录可能已被后续版本改动）
  const snap = path.join(refDir, "scene-plan.json"); const live = path.join(jobDir, "data", "scene-plan.json");
  const liveBak = fs.readFileSync(live); const same = Buffer.compare(liveBak, fs.readFileSync(snap)) === 0;
  if (!same) fs.copyFileSync(snap, live);
  const out = path.join(scratch, ex.id); fs.rmSync(out, { recursive: true, force: true });
  const r = spawnSync("node", [path.join(root, "scripts", "stage-stills.mjs"), "--job", ex.job, "--times", ex.times.join(","), "--out", path.relative(jobDir, out)], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  if (!same) fs.writeFileSync(live, liveBak);
  if (r.status !== 0) { console.error(r.stderr.slice(-2000)); console.error(`✗ ${ex.id} 静帧失败`); failed += 1; continue; }
  for (const t of ex.times) {
    const cur = path.join(out, `s-${Number(t).toFixed(1)}.png`);
    const ref = path.join(refDir, `ref-${t}.jpg`);
    if (!fs.existsSync(cur)) { console.error(`✗ ${ex.id} 缺 ${path.basename(cur)}`); failed += 1; continue; }
    if (args.update || !fs.existsSync(ref)) {
      spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", cur, "-q:v", "2", ref]);
      console.log(`基线 ${ex.id} @${t}s 已写入`);
      continue;
    }
    const s = spawnSync("ffmpeg", ["-hide_banner", "-i", cur, "-i", ref, "-lavfi", "ssim", "-f", "null", "-"], { encoding: "utf8" });
    const m = (s.stderr || "").match(/All:([\d.]+)/);
    const ssim = m ? Number(m[1]) : 0;
    const ok = ssim >= THRESHOLD;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${ex.id} @${t}s SSIM ${ssim.toFixed(4)}${ok ? "" : ` < ${THRESHOLD}（漂移：${path.relative(root, cur)} vs ${path.relative(root, ref)}）`}`);
  }
}
if (failed) { console.error(`回归失败 ${failed} 项。若是有意改观感，让 Scott 看过后 --update 重建基线。`); process.exit(2); }
console.log(args.update ? "基线已更新" : "回归通过");
