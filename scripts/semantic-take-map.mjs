export function validateSemanticTakeMap(value, edl = [], options = {}) {
  const tolerance = Number(options.tolerance ?? 0.05);
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["完整表达选段记录必须是 JSON 对象"], coveredCount: 0 };
  }
  if (value.schemaVersion !== 1) errors.push("完整表达选段记录 schemaVersion 必须为 1");
  if (value.reviewComplete !== true) errors.push("reviewComplete 必须为 true");
  if (!String(value.recordingPattern || "").trim()) errors.push("必须说明本次录制中的重拍/重复表达模式");
  const ranges = Array.isArray(value.ranges) ? value.ranges : [];
  if (!ranges.length) errors.push("ranges 不能为空");
  const ids = new Set();
  const kept = [];

  for (const [index, item] of ranges.entries()) {
    const label = `ranges[${index}]`;
    const id = String(item?.id || "").trim();
    if (!id) errors.push(`${label} 缺少 id`);
    else if (ids.has(id)) errors.push(`${label} id 重复: ${id}`);
    else ids.add(id);
    if (!String(item?.source || "").trim()) errors.push(`${label} 缺少 source`);
    const start = Number(item?.sourceStart);
    const end = Number(item?.sourceEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      errors.push(`${label} 的 sourceStart/sourceEnd 无效`);
    }
    if (!['keep', 'reject'].includes(item?.decision)) errors.push(`${label} decision 必须是 keep/reject`);
    if (!String(item?.reason || "").trim()) errors.push(`${label} 缺少 reason`);
    if (item?.decision === "keep") {
      if (item.completeness !== "complete") errors.push(`${label} 保留段必须标为完整表达 complete`);
      if (!String(item.claim || "").trim()) errors.push(`${label} 保留段必须写明承载的完整观点`);
      kept.push(item);
    }
  }

  for (const [index, item] of ranges.entries()) {
    if (item?.decision !== "reject" || !item?.replacedBy) continue;
    if (!kept.some((candidate) => candidate.id === item.replacedBy)) {
      errors.push(`ranges[${index}].replacedBy 必须指向一个 keep 段`);
    }
  }

  let coveredCount = 0;
  for (const [index, segment] of edl.entries()) {
    const start = Number(segment?.sourceStart);
    const end = Number(segment?.sourceEnd);
    const covering = kept.find((item) => item.source === segment?.source
      && Number(item.sourceStart) <= start + tolerance
      && Number(item.sourceEnd) >= end - tolerance);
    if (!covering) {
      errors.push(`EDL 第 ${index + 1} 段未被任何 complete keep 段完整覆盖`);
    } else {
      coveredCount += 1;
    }
  }
  return { ok: errors.length === 0, errors, coveredCount };
}
