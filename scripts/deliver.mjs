import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, projectRoot, readJson, resolveJob } from "./lib.mjs";

const args = parseArgs();
const jobDir = resolveJob(args.job);
const config = readJson(path.join(jobDir, "project.json"));
const videoPath = resolveVideoPath(args.video || path.join("renders", config.outputName || "final-60fps.mp4"));

if (!fs.existsSync(videoPath)) {
  console.error(`Missing final video: ${videoPath}`);
  process.exit(1);
}

const downloadsRoot = process.env.FACTORY_OUTBOX || config.delivery?.downloadsRoot || path.join(os.homedir(), "Downloads");
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

function resolveVideoPath(input) {
  if (path.isAbsolute(input)) return input;
  const rootCandidate = path.join(projectRoot(), input);
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  return path.join(jobDir, input);
}
