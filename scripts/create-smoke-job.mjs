import fs from "node:fs";
import path from "node:path";
import { copyDir, projectRoot, run, writeJson } from "./lib.mjs";

const root = projectRoot();
const jobDir = path.join(root, "jobs", "smoke");
const templateDir = path.join(root, "templates", "job");

fs.rmSync(jobDir, { recursive: true, force: true });
copyDir(templateDir, jobDir);

const videoPath = path.join(jobDir, "assets", "aroll.mp4");
run("ffmpeg", [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=#20302b:s=1080x1920:d=6:r=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=6",
  "-shortest",
  "-c:v",
  "libx264",
  "-g",
  "30",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  videoPath
]);

writeJson(path.join(jobDir, "project.json"), {
  title: "Smoke Test Talking Head",
  slug: "smoke",
  platform: "douyin",
  width: 1080,
  height: 1920,
  layout: "vertical",
  duration: 6,
  sourceVideo: "assets/aroll.mp4",
  outputName: "smoke-final.mp4",
  downloadFolderName: "smoke-抖音成片",
  caption: {
    enabled: true,
    maxCharsPerLine: 14,
    hideDuring: []
  },
  qa: {
    sampleTimes: [0.5, 2.2, 4.5, 5.5]
  },
  delivery: {
    includeCover: true,
    coverFile: "cover/cover.png",
    downloadsRoot: path.join(root, "out")
  },
  variants: [
    {
      id: "douyin-vertical",
      label: "抖音竖屏",
      platform: "douyin",
      width: 1080,
      height: 1920,
      layout: "vertical",
      outputName: "smoke-douyin-vertical.mp4",
      downloadFolderName: "smoke-抖音竖屏",
      render: {
        fps: 60,
        quality: "standard",
        workers: 8,
        videoBitrate: "24M"
      }
    },
    {
      id: "youtube-horizontal",
      label: "YouTube 横屏",
      platform: "youtube",
      width: 1920,
      height: 1080,
      layout: "horizontal",
      outputName: "smoke-youtube-horizontal.mp4",
      downloadFolderName: "smoke-YouTube横屏",
      caption: {
        maxCharsPerLine: 22
      },
      render: {
        fps: 60,
        quality: "standard",
        workers: 8,
        videoBitrate: "24M"
      }
    }
  ]
});

writeJson(path.join(jobDir, "data", "captions.json"), [
  { s: 0.2, e: 1.8, t: "这是一条口播测试字幕" },
  { s: 1.8, e: 3.0, t: "字幕是静态 clip" },
  { s: 4.8, e: 5.8, t: "最终要抽 MP4 帧检查" }
]);

writeJson(path.join(jobDir, "data", "beats.json"), [
  {
    type: "statement",
    start: 1.0,
    end: 5.4,
    kicker: "SMOKE TEST",
    title: "同一 builder 覆盖字幕与解释卡",
    body: "用于快速确认 HyperFrames 合同与布局。",
    accent: "确定性回归"
  }
]);
writeJson(path.join(jobDir, "data", "broll.json"), []);

writeJson(path.join(jobDir, "data", "chapters.json"), [
  { start: 2.0, duration: 1.2, num: "01", title: "章节测试" }
]);

writeJson(path.join(jobDir, "data", "overlays.json"), [
  {
    id: "qa",
    start: 3.3,
    duration: 1.2,
    kicker: "QA",
    title: "解释层测试",
    body: "这里会隐藏重叠字幕。",
    bullets: ["静态时间轴", "最终抽帧"],
    hideCaptions: true
  }
]);

console.log(`Created smoke job: ${jobDir}`);
