import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./color-management.mjs";
import { collectEditorialHashes, hashesMatch } from "./editorial-contract.mjs";
import { parseArgs, projectRoot, readJson, resolveJob } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const config = readJson(path.join(jobDir, "project.json"));
const videoPath = resolveVideoPath(args.video || path.join("renders", config.outputName || "final-60fps.mp4"));

if (!fs.existsSync(videoPath)) {
  console.error(`Missing final video: ${videoPath}`);
  process.exit(1);
}
verifyFinalApproval();

const downloadsRoot = config.delivery?.downloadsRoot || path.join(process.env.HOME || "", "Downloads");
const folderName = config.downloadFolderName || `${new Date().toISOString().slice(0, 10)}-${config.slug || "talking-head"}-抖音成片`;
const destDir = path.join(downloadsRoot, folderName);
fs.mkdirSync(destDir, { recursive: true });

const destVideo = path.join(destDir, config.outputName || path.basename(videoPath));
fs.copyFileSync(videoPath, destVideo);

let coverCopied = false;
const includeCover = config.delivery?.includeCover !== false;
const coverFile = config.delivery?.coverFile || "cover/cover.png";
const coverSrc = path.join(jobDir, coverFile);

if (includeCover && fs.existsSync(coverSrc)) {
  const ext = path.extname(coverSrc) || ".png";
  const coverDest = path.join(destDir, `封面图${ext}`);
  if (!fs.existsSync(coverDest)) {
    fs.copyFileSync(coverSrc, coverDest);
    coverCopied = true;
  } else {
    console.log(`Cover already exists, preserved: ${coverDest}`);
  }
}

console.log(`Delivered video: ${destVideo}`);
if (coverCopied) console.log("Delivered cover: 封面图");
console.log(`Folder: ${destDir}`);
console.log("Note: deliver never deletes user files in the target folder.");

function verifyFinalApproval() {
  if (Number(config.editorial?.contractVersion || 0) < 1) return;
  const approvalPath = path.join(jobDir, "qa", "approval.json");
  const reportPath = path.join(jobDir, "qa", "report.json");
  if (!fs.existsSync(approvalPath) || !fs.existsSync(reportPath)) {
    throw new Error("新合同 job 未完成最终 QA 批准，不能交付");
  }
  const approval = readJson(approvalPath);
  const rootJobDir = path.basename(path.dirname(jobDir)) === "variants"
    ? path.dirname(path.dirname(jobDir))
    : jobDir;
  const visualReportPath = path.join(rootJobDir, "qa", "visual", "report.json");
  const currentHashes = collectEditorialHashes(jobDir, "visual");
  const valid = approval.schemaVersion === 2
    && approval.status === "publish_ready"
    && approval.fullPlayback === true
    && approval.reportHash === sha256File(reportPath)
    && approval.videoHash === sha256File(videoPath)
    && hashesMatch(approval.editorialHashes, currentHashes)
    && fs.existsSync(visualReportPath)
    && approval.visualReportHash === sha256File(visualReportPath);
  if (!valid) throw new Error("最终 MP4、内容/视觉数据或批准状态已变化；重新 QA 并完整播放后才能交付");
}

function resolveVideoPath(input) {
  if (path.isAbsolute(input)) return input;
  const rootCandidate = path.join(projectRoot(), input);
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  return path.join(jobDir, input);
}
