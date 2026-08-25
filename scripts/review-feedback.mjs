import fs from "node:fs";
import path from "node:path";

import { parseArgs, resolveJob, videoDuration } from "./lib.mjs";
import { createReviewRevision, renderFeedbackMarkdown, validateReviewFeedback } from "./review-feedback-lib.mjs";

const args = parseArgs();
const action = String(args._[0] || "validate");
const jobDir = resolveJob(args.job);
const revision = args.revision || args.r;

if (action === "init") {
  const video = String(args.video || "");
  const duration = Number(args.duration || videoDuration(path.join(jobDir, video)));
  const result = createReviewRevision({ jobDir, revision, video, duration });
  console.log(`Created review revision: ${result.reviewDir}`);
} else if (action === "validate") {
  const result = validateReviewFeedback({ jobDir, revision });
  console.log(`OK ${result.revision}: ${result.count} feedback · ${result.open} open · ${result.resolved} resolved`);
} else if (action === "report") {
  const reviewDir = path.join(jobDir, "review", String(revision || "").toUpperCase());
  const output = path.join(reviewDir, "feedback.md");
  fs.writeFileSync(output, renderFeedbackMarkdown({ jobDir, revision }));
  console.log(`Wrote ${output}`);
} else {
  throw new Error("Usage: npm run review -- <init|validate|report> --job jobs/<slug> --revision R0 [--video renders/review.mp4]");
}
