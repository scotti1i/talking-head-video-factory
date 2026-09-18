const REVIEW_METHODS = new Set(["user", "human", "media-model"]);

export function buildListeningReviewTemplate(report) {
  return {
    schemaVersion: 1,
    status: "review_required",
    generatedAt: new Date().toISOString(),
    reviewer: "",
    method: "",
    roughCut: {
      path: report.video,
      sha256: report.videoHash,
      verdict: null,
      notes: ""
    },
    clips: report.cuts.map((cut) => ({
      index: cut.index,
      path: cut.reviewClip,
      sha256: cut.reviewClipHash,
      verdict: null,
      notes: ""
    })),
    sequenceVerdict: null,
    notes: ""
  };
}

export function validateListeningReview(review, report) {
  const errors = [];
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return { ok: false, errors: ["审听记录必须是 JSON 对象"] };
  }
  if (review.schemaVersion !== 1) errors.push("审听记录 schemaVersion 必须为 1");
  if (review.status !== "passed") errors.push("审听记录 status 必须为 passed");
  if (!String(review.reviewer || "").trim()) errors.push("审听记录缺少 reviewer");
  if (!REVIEW_METHODS.has(review.method)) errors.push("审听 method 必须是 user / human / media-model");

  validateEvidence(review.roughCut, {
    path: report.video,
    sha256: report.videoHash,
    label: "完整粗剪"
  }, errors);

  const clips = Array.isArray(review.clips) ? review.clips : [];
  if (clips.length !== report.cuts.length) {
    errors.push(`审听切点数 ${clips.length} 与报告 ${report.cuts.length} 不一致`);
  }
  for (const cut of report.cuts) {
    const item = clips.find((clip) => Number(clip.index) === Number(cut.index));
    if (!item) {
      errors.push(`缺少切点 ${cut.index} 的审听记录`);
      continue;
    }
    validateEvidence(item, {
      path: cut.reviewClip,
      sha256: cut.reviewClipHash,
      label: `切点 ${cut.index}`
    }, errors);
  }
  if (review.sequenceVerdict !== "pass") errors.push("sequenceVerdict 必须为 pass");
  return { ok: errors.length === 0, errors };
}

function validateEvidence(item, expected, errors) {
  if (!item || typeof item !== "object") {
    errors.push(`${expected.label}缺少审听证据`);
    return;
  }
  if (item.path !== expected.path) errors.push(`${expected.label}路径与当前报告不一致`);
  if (item.sha256 !== expected.sha256) errors.push(`${expected.label}哈希与当前报告不一致`);
  if (item.verdict !== "pass") errors.push(`${expected.label} verdict 必须为 pass`);
  if (!String(item.notes || "").trim()) errors.push(`${expected.label}必须记录实际听到的内容或边界说明`);
}
