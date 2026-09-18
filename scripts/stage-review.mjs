// ============================================================
// 独立审片（推理型传感器）：渲静帧板 → 交给一个全新上下文的模型按 docs/xiaolin-taste.md §6 清单逐条打分 → qa/review-<version>.json
// 为什么要独立上下文：写分镜的人自己看图会「看见自己想看的」；Codex 2026-09-05 那版 30 条进度播报、零条看图。
// 用法：node scripts/stage-review.mjs --job jobs/<slug> --version vN [--reviewer claude|codex] [--stills-only]
//   通过标准：10 条全 ✓ 才 pass；任一 ✗ 写进 items，stage-render --final 会拒绝。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter(Boolean));
if (!args.job || !args.version) throw new Error("用法：--job jobs/<slug> --version vN [--reviewer claude|codex]");
const jobDir = path.resolve(root, args.job);
const version = String(args.version);
const outDir = path.join(jobDir, "qa", `review-${version}`);
const reportFile = path.join(jobDir, "qa", `review-${version}.json`);
const log = (m) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${m}`);

// ---- 1. 静帧板（--auto 按分镜自动取点） ----
fs.rmSync(outDir, { recursive: true, force: true });
const stills = spawnSync("node", [path.join(root, "scripts", "stage-stills.mjs"), "--job", args.job, "--auto", "--out", path.relative(jobDir, outDir)], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
if (stills.status !== 0) { console.error(stills.stderr.slice(-3000)); throw new Error("静帧渲染失败，审片中止（不许跳过看图）"); }
const boards = fs.readdirSync(outDir).filter((f) => /^board-\d+\.png$/.test(f)).sort().map((f) => path.join(outDir, f));
if (!boards.length) throw new Error(`没有静帧板：${outDir}`);
log(`静帧板 ${boards.length} 张 → ${path.relative(root, outDir)}`);
if (args["stills-only"]) process.exit(0);

// ---- 2. 审片提示词：手册 §6 原文 + 分镜摘要 ----
const taste = fs.readFileSync(path.join(root, "docs", "xiaolin-taste.md"), "utf8");
const checklist = taste.split("## 6. 审片清单")[1]?.split("## 7.")[0] ?? "";
if (!checklist.trim()) throw new Error("docs/xiaolin-taste.md 缺 §6 审片清单");
const plan = JSON.parse(fs.readFileSync(path.join(jobDir, "data", "scene-plan.json"), "utf8"));
const platform = (() => { try { const pj = JSON.parse(fs.readFileSync(path.join(jobDir, "project.json"), "utf8")); return [pj.platform, ...(pj.platforms || []), pj.target].filter(Boolean).join(",") || "未标"; } catch { return "未标"; } })();
const structureNote = "";
const summary = plan.scenes.map((s) => `${s.start}–${s.end}s ${s.type} ${s.id}`).join("\n");
// 每张板的格子 ↔ 时间对照（stage-stills 按时间排序、每板 12 格、4 列），审片人靠这个报帧时间、判断孤元素持续多久
const stillTimes = fs.readdirSync(outDir).filter((f) => /^s-[\d.]+\.png$/.test(f)).map((f) => Number(f.slice(2, -4))).sort((a, b) => a - b);
const tileMap = boards.map((b, bi) => `${path.basename(b)}：${stillTimes.slice(bi * 12, bi * 12 + 12).map((t, i) => `格${i + 1}=${t}s`).join("，")}（从左到右、从上到下，每行 4 格）`).join("\n");
// 事件表：每个元素出现的时间，用来算「一个元素独占板子多久」
const collect = (v, out, key = "") => { if (Array.isArray(v)) v.forEach((x) => collect(x, out, key)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (typeof x === "number" && ["at", "until", "convergeAt", "eraseAt", "demoteAt"].includes(k)) out.push(`${k}=${x}`); else collect(x, out, k); } return out; };
const events = plan.scenes.filter((s) => !["title", "broll", "accent"].includes(s.type)).map((s) => `${s.id}: ${collect(s, []).join(" ")}`).join("\n");
const exemplarLine = (() => { try { const idx = JSON.parse(fs.readFileSync(path.join(root, "docs", "exemplars", "index.json"), "utf8")); const pm = fs.existsSync(path.join(jobDir, "project.md")) ? fs.readFileSync(path.join(jobDir, "project.md"), "utf8") : ""; const hit = idx.exemplars.find((e) => pm.includes(e.id)) || idx.exemplars[idx.exemplars.length - 1]; return `- ${hit.id}：${path.join(root, "docs", "exemplars", hit.id, "filmstrip.jpg")}`; } catch { return "- （无）"; } })();
const prompt = `你是独立审片人，上下文里没有写分镜的人的任何想法。只看图和下面的规则，逐条打分。

## 审片清单（docs/xiaolin-taste.md §6，原文）
${checklist.trim()}

## 这条片
- 片长 ${plan.duration}s，平台 ${platform}，皮肤 ${plan.skin || "默认"}${structureNote}
- 场景表：
${summary}

## 静帧板（每格对应的时间）
${tileMap}
图片文件：
${boards.map((b) => `- ${b}`).join("\n")}

## 元素出现时间（判断「一个元素独占板子多久」用；孤元素状态持续 <1.5s 是正常的入场过程，不算 ✗）
${events}

## 参照成片（第 10 条用；这是已验收的成片抽帧条，本片要有自己的签名而不是复制它）
${exemplarLine}

## 三条不要误判（2026-09-07 第一次上岗的误判）
- 画面角落的小竖版人像 / 圆形小头像是主播本人的角标（人物形态 orb / dock），不是第三方画中画；第 4 条只针对 B-roll 素材内部出现的他人脸、账号头像、创作者摄像头。
- 背景板（background.plate，摄影棚顶光 / 幕布 / 渐变底）允许有光效和明暗过渡；第 8 条「纯色面 + 发丝线」针对卡片、节点、胶囊等元素材质。
- 侧排大标题（人物在左、标题在右）是模板的合法形态，不算「文字压脸」。
${(plan.speaker || []).some((k) => k.mode === 'lecture') ? '- 竖屏 lecture（课程录屏 Short，2026-09-12）：画面是直播录屏合成的三段——顶部黑底常驻大字标题、中间幻灯片通栏、下方主播人脸放大。中间那一块是**课件截屏原件**。第 7 条（只用口播原话）只检查分镜叠加的文字层，也就是顶部黑底大字标题和底部字幕这两样；课件截屏**内部**的任何文字——标题句、对仗句、小标签、页脚——都是讲师自己做的课件，不在第 7 条范围内，**不要因为在采样字幕里找不到对应口播就判 ✗**，也不要要求出示逐字稿。人脸小窗左下的「Scott」是会议软件的姓名牌，属于原始录屏，不是第三方账号头像，第 4 条不针对它。幻灯片与人脸之间的黑条是专用字幕带，字幕落在那里不算压脸。第 2 条「板子不空」不适用：本版式没有舞台面板。第 6 条视觉休息与第 9 条尿点：本版式的新信息由三层共同承担——幻灯片推进、字幕内容推进、主播表情与手势，按清单第 9 条原文「连续 8s 以上没有新信息、新画面或新情绪」判，三层同时停滞才算尿点；讲师停在同一页讲解、而字幕一直在推进，不算尿点。静帧板按时间均匀采样。' : (plan.canvas && plan.canvas.h > plan.canvas.w ? '- 竖屏 studio-portrait：人物永远铺满画布，focus 态是推近（脸更大、上移）不是裁成卡片；下区卡片（y 990–1300）压在胸口衣服上、贴脸胶囊在脸两侧，都是设计内的，只有元素盖住五官才算压脸。场景表里 origin=own 的 broll 面板是主播自己的成片 / 录屏，里面出现的脸是主播本人，不算第三方人脸。第 6 条「视觉休息」在竖屏里 = 人物处于 full 态（原片铺满，脸两侧可以有贴脸胶囊，胶囊不算打断休息）≥4s，判断依据是场景表里 reminders / ladder / compare / quote 这类下区板子之间的空档，不按「B-roll / 通栏 / 标题」判；第 9 条尿点按「连续 8s 以上没有新信息、新画面或新情绪」判，纯脸口播段有字幕和内容推进不算尿点。' : '')}

## 输出
只输出一个 JSON 对象，不要任何别的文字：
{"verdict":"pass"|"fail","items":[{"n":1,"ok":true|false,"evidence":"一句话 + 帧时间"},...共 10 条],"notes":"两句以内的总体判断"}
规则：任一条 ok=false 则 verdict=fail；看不清就写 ok=false 并说明看不清；不要给建议，只给判断。`;
fs.writeFileSync(path.join(outDir, "prompt.md"), prompt);

// ---- 3. 调独立模型（默认 claude；codex 可选）----
const reviewer = String(args.reviewer || (process.env.STAGE_REVIEWER || "claude"));
let raw = "";
if (reviewer === "codex") {
  const last = path.join(outDir, "codex-last.md");
  const r = spawnSync("codex", ["exec", "--skip-git-repo-check", "-s", "read-only", "-C", root, "-m", process.env.STAGE_REVIEW_CODEX_MODEL || "gpt-5.6-sol", "-o", last, ...boards.flatMap((b) => ["-i", b]), "--", prompt], { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env } });
  if (r.status !== 0) { console.error(r.stderr.slice(-2000)); throw new Error("codex exec 审片失败"); }
  raw = fs.existsSync(last) ? fs.readFileSync(last, "utf8") : r.stdout;
} else {
  // 嵌套在 Claude Code 里跑要清掉 CLAUDECODE 标记；只给 Read 工具，读图不改文件
  const env = { ...process.env }; delete env.CLAUDECODE;
  const r = spawnSync("claude", ["-p", prompt, "--allowedTools", "Read", "--permission-mode", "dontAsk"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, env });
  if (r.status !== 0) { console.error(r.stderr.slice(-2000)); throw new Error("claude -p 审片失败"); }
  raw = r.stdout;
}
fs.writeFileSync(path.join(outDir, "raw.txt"), raw);
const m = raw.match(/\{[\s\S]*\}/);
if (!m) throw new Error(`审片输出不是 JSON：${raw.slice(0, 300)}`);
let parsed;
try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error(`审片 JSON 解析失败：${e.message}\n${m[0].slice(0, 500)}`); }
const items = Array.isArray(parsed.items) ? parsed.items : [];
const failed = items.filter((it) => it && it.ok === false);
const verdict = items.length >= 10 && failed.length === 0 && parsed.verdict !== "fail" ? "pass" : "fail";
const report = { version, reviewer, at: new Date().toISOString(), boards: boards.map((b) => path.relative(root, b)), verdict, items, notes: parsed.notes || "", checklistSource: "docs/xiaolin-taste.md §6" };
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
log(`审片 ${verdict === "pass" ? "通过" : "未过"}（${reviewer}）：${items.length} 条，✗ ${failed.length}${failed.length ? "\n- " + failed.map((f) => `#${f.n} ${f.evidence}`).join("\n- ") : ""}`);
log(`记录 ${path.relative(root, reportFile)}`);
if (verdict !== "pass") process.exit(2);
