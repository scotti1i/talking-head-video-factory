// ============================================================
// 生成样例 job「模板巡礼」:82s 合成背景 + 10 种拍型逐一亮相。
// 样例即文档:每张卡的文案解释该拍型的用途。可反复重建。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { projectRoot, run, writeJson } from "./lib.mjs";

const root = projectRoot();
const jobDir = path.join(root, "jobs", "sample-template-tour");
const DURATION = 82;

fs.rmSync(jobDir, { recursive: true, force: true });
for (const dir of ["assets", "data", "cover", "renders", "qa"]) {
  fs.mkdirSync(path.join(jobDir, dir), { recursive: true });
}

const videoPath = path.join(jobDir, "assets", "aroll.mp4");
console.log("生成合成 A-roll(渐变背景 + 轻环境音)…");
run("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "lavfi", "-i", `gradients=s=1080x1920:d=${DURATION}:r=30:c0=#1d130c:c1=#3a2415:c2=#14100d:c3=#241207:speed=0.012`,
  "-f", "lavfi", "-i", `sine=frequency=196:duration=${DURATION}`,
  "-filter_complex", "[1:a]volume=0.05,atempo=1.0[a]",
  "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
  videoPath
]);

const beats = [
  { type: "statement", start: 0.8, end: 8.4, kicker: "开场判断", title: "十种拍型,一条样例走完", body: "statement 用在金句和定调判断,一句话立住论点。", accent: "模板巡礼" },
  { type: "hero", start: 8.8, end: 16.4, kicker: "大数字时刻", title: "一套拍型语言,十种表达", body: "hero 用在数字冲击:市场规模、序号、倍数。", number: "10" },
  { type: "panel", start: 16.8, end: 24.4, kicker: "要点清单", title: "panel 把口播要点结构化", items: ["观点先行", "证据跟上", "一拍一论点"], body: "适合三五个并列要点,别塞满。" },
  { type: "chips", start: 24.8, end: 32.4, kicker: "工具与名词", title: "chips 陈列工具名和关键词", chips: ["Claude", "HyperFrames", "whisper", "ffmpeg"], body: "提到一串专有名词时,让观众看见拼写。" },
  { type: "split", start: 32.8, end: 40.4, kicker: "对比结构", title: "split 摆出两边,让差距自己说话", left: { label: "以前", title: "手工剪", lines: ["每条重来", "风格漂移", "全靠记忆"] }, right: { label: "现在", title: "流水线", lines: ["主题冻结", "数据驱动", "QA 兜底"] } },
  { type: "duel", start: 40.8, end: 48.4, kicker: "取舍时刻", title: "duel 划掉错的,压实对的", bad: "每条视频重新发明", good: "一套模板反复复利", body: "适合非此即彼的决策点。" },
  { type: "pipeline", start: 48.8, end: 56.4, kicker: "流程链路", title: "pipeline 拆四步流程", steps: ["素材", "剪辑", "包装", "出片"], body: "讲工作流、方法论时用它。" },
  { type: "trio", start: 56.8, end: 64.4, kicker: "三要素", title: "trio 归纳三根支柱", columns: ["工具", "流程", "判断"], body: "总结段落的黄金结构。" },
  { type: "diagram", start: 64.8, end: 72.4, kicker: "关系图", title: "diagram 画中心辐射关系", nodes: ["字幕", "拍子", "主题", "QA"], center: "控制台", body: "一个核心概念带四个关联项。" },
  { type: "cta", start: 72.8, end: 81.4, kicker: "行动号召", title: "cta 收尾,给观众下一步", body: "结尾固定给一个明确动作。", primary: "一键处理", secondary: "换个主题再看" }
];

const captions = [
  [0.2, 4.2, "这是模板巡礼样例"],
  [4.2, 8.4, "十种拍型逐一亮相"],
  [8.8, 12.6, "大数字时刻用 hero"],
  [12.6, 16.4, "冲击力交给数字本身"],
  [16.8, 20.6, "要点清单用 panel"],
  [20.6, 24.4, "一拍只讲一个论点"],
  [24.8, 28.6, "工具名词用 chips"],
  [28.6, 32.4, "让观众看见拼写"],
  [32.8, 36.6, "对比结构用 split"],
  [36.6, 40.4, "差距让画面自己说"],
  [40.8, 44.6, "取舍时刻用 duel"],
  [44.6, 48.4, "划掉错的压实对的"],
  [48.8, 52.6, "流程链路用 pipeline"],
  [52.6, 56.4, "四步讲清方法论"],
  [56.8, 60.6, "三要素归纳用 trio"],
  [60.6, 64.4, "总结段的黄金结构"],
  [64.8, 68.6, "关系图用 diagram"],
  [68.6, 72.4, "一个核心四个关联"],
  [72.8, 77.0, "结尾行动号召用 cta"],
  [77.0, 81.4, "给观众一个明确动作"]
].map(([s, e, t]) => ({ s, e, t }));

writeJson(path.join(jobDir, "data", "beats.json"), beats);
writeJson(path.join(jobDir, "data", "captions.json"), captions);
writeJson(path.join(jobDir, "data", "shorts.json"), [
  { id: "tour-open", title: "模板巡礼·前半", start: 0, duration: 40.4 },
  { id: "tour-close", title: "模板巡礼·后半", start: 40.4, duration: 41.0 }
]);
writeJson(path.join(jobDir, "project.json"), {
  title: "样例 · 模板巡礼(10 种拍型)",
  slug: "sample-template-tour",
  platform: "douyin",
  theme: "warm-glass",
  width: 1080,
  height: 1920,
  duration: DURATION,
  sourceVideo: "assets/aroll.mp4",
  outputName: "final-60fps.mp4",
  downloadFolderName: "样例-模板巡礼",
  caption: { enabled: true, maxCharsPerLine: 18 },
  qa: { sampleTimes: [4, 12, 20, 28, 36, 44, 52, 60, 68, 77] },
  delivery: { includeCover: false, downloadsRoot: path.join(root, "out") }
});
fs.copyFileSync(path.join(root, "templates", "job", "package.json"), path.join(jobDir, "package.json"));

console.log(`样例 job 就绪: ${jobDir}`);
console.log("构建: npm run build:beats -- --job jobs/sample-template-tour");
