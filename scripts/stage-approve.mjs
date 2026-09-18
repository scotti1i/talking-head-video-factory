// ============================================================
// 记录 Scott 对样片的通过：qa/approval-<version>.json。stage-render --final 没有它 + 审片通过记录就拒绝渲染。
// 用法：node scripts/stage-approve.mjs --job jobs/<slug> --version vN --by Scott --notes "样片过了，渲成片"
// 只有 Scott 本人说了「过了 / 渲成片」才能写；代理不得代填（写入时记录来源会话与原话）。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter(Boolean));
if (!args.job || !args.version || !args.by || !args.notes) throw new Error("用法：--job jobs/<slug> --version vN --by Scott --notes \"原话\"");
const jobDir = path.resolve(root, args.job);
const version = String(args.version);
const review = path.join(jobDir, "qa", `review-${version}.json`);
if (!fs.existsSync(review)) throw new Error(`先跑独立审片：node scripts/stage-review.mjs --job ${args.job} --version ${version}`);
const rv = JSON.parse(fs.readFileSync(review, "utf8"));
if (rv.verdict !== "pass") throw new Error(`审片未过（${rv.items.filter((i) => i.ok === false).map((i) => "#" + i.n).join(",")}），先修再批`);
const proof = path.join(jobDir, "renders", `${path.basename(jobDir).replace(/-\d{8}$/, "")}-${version}-proof.mp4`);
if (!fs.existsSync(proof)) throw new Error(`没有样片 ${path.relative(root, proof)}：Scott 看的必须是样片，不是静帧`);
const rec = { version, by: String(args.by), notes: String(args.notes), at: new Date().toISOString(), reviewAt: rv.at, reviewer: rv.reviewer, proof: path.relative(root, proof) };
fs.writeFileSync(path.join(jobDir, "qa", `approval-${version}.json`), JSON.stringify(rec, null, 2));
console.log(`已记录 ${rec.by} 通过 ${version}：${rec.notes}`);
