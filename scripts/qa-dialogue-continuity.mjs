import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, readJson, resolveJob, writeJson } from "./lib.mjs";

export const FACTORY_DIALOGUE_LIMITS = Object.freeze({
  maxLeadInSeconds: 0.08,
  minTailGuardSeconds: 0.08,
  maxTailGuardSeconds: 0.25,
  maxAdjacentSpeechWindowJumpDb: 4
});

export function validateDialogueContinuity(contract, options = {}) {
  const limits = { ...FACTORY_DIALOGUE_LIMITS, ...(options.limits || {}) };
  const errors = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return result(["dialogue-continuity 必须是对象"], limits, {});
  }
  if (contract.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");

  const takeStarts = requireArray(contract.takeStarts, "takeStarts", errors);
  for (const [index, take] of takeStarts.entries()) {
    const label = `takeStarts[${index}]`;
    requireId(take, label, errors);
    const timelineStart = number(take?.timelineStart, `${label}.timelineStart`, errors);
    const speechStart = number(take?.speechStart, `${label}.speechStart`, errors);
    if (Number.isFinite(timelineStart) && Number.isFinite(speechStart)) {
      const leadIn = speechStart - timelineStart;
      if (leadIn < -0.001) errors.push(`${label}: speechStart 不得早于 timelineStart`);
      if (leadIn > limits.maxLeadInSeconds + 0.001) {
        errors.push(`${label}: 段首气口 ${leadIn.toFixed(3)}s 超过 ${limits.maxLeadInSeconds.toFixed(3)}s`);
      }
    }
    requireTrue(take?.operatorCueReviewed, `${label}.operatorCueReviewed`, errors);
    requireTrue(take?.waveformReviewed, `${label}.waveformReviewed`, errors);
    requireTrue(take?.pictureReviewed, `${label}.pictureReviewed`, errors);
  }

  const phraseEnds = requireArray(contract.protectedPhraseEnds, "protectedPhraseEnds", errors);
  for (const [index, ending] of phraseEnds.entries()) {
    const label = `protectedPhraseEnds[${index}]`;
    requireId(ending, label, errors);
    if (!String(ending?.text || "").trim()) errors.push(`${label}.text 不能为空`);
    const speechEnd = number(ending?.speechEnd, `${label}.speechEnd`, errors);
    const cutEnd = number(ending?.cutEnd, `${label}.cutEnd`, errors);
    if (Number.isFinite(speechEnd) && Number.isFinite(cutEnd)) {
      const guard = cutEnd - speechEnd;
      if (guard < limits.minTailGuardSeconds - 0.001 || guard > limits.maxTailGuardSeconds + 0.001) {
        errors.push(`${label}: 尾音保护 ${guard.toFixed(3)}s 不在 ${limits.minTailGuardSeconds.toFixed(3)}..${limits.maxTailGuardSeconds.toFixed(3)}s`);
      }
    }
    requireTrue(ending?.audibleComplete, `${label}.audibleComplete`, errors);
    requireTrue(ending?.waveformReviewed, `${label}.waveformReviewed`, errors);
    requireTrue(ending?.mouthClosureReviewed, `${label}.mouthClosureReviewed`, errors);
  }

  const leveling = requireArray(contract.levelingChecks, "levelingChecks", errors);
  for (const [index, check] of leveling.entries()) {
    const label = `levelingChecks[${index}]`;
    requireId(check, label, errors);
    const before = number(check?.beforeJumpDb, `${label}.beforeJumpDb`, errors);
    const after = number(check?.afterJumpDb, `${label}.afterJumpDb`, errors);
    if (Number.isFinite(after) && after > limits.maxAdjacentSpeechWindowJumpDb + 0.001) {
      errors.push(`${label}: 修正后相邻人声窗口跳变 ${after.toFixed(2)}dB 超过 ${limits.maxAdjacentSpeechWindowJumpDb.toFixed(2)}dB`);
    }
    const method = String(check?.method || "");
    if (Number.isFinite(before) && before > limits.maxAdjacentSpeechWindowJumpDb && !["gain-envelope", "compressor", "gain-envelope+compressor"].includes(method)) {
      errors.push(`${label}.method: 强跳变必须使用增益包络或压缩器修正`);
    }
    requireTrue(check?.waveformReviewed, `${label}.waveformReviewed`, errors);
    requireTrue(check?.listened, `${label}.listened`, errors);
  }

  const primaryClipIds = Array.isArray(options.primaryClips) ? options.primaryClips.map((item) => item.id) : [];
  const brollChecks = Array.isArray(contract.brollChecks) ? contract.brollChecks : [];
  const byId = new Map(brollChecks.map((item) => [item?.id, item]));
  for (const id of primaryClipIds) {
    const check = byId.get(id);
    if (!check) {
      errors.push(`brollChecks 缺少主空镜 ${id}`);
      continue;
    }
    if (!["voice-aligned", "after-two-seconds"].includes(check.entryPolicy)) {
      errors.push(`brollChecks(${id}).entryPolicy 只能是 voice-aligned/after-two-seconds`);
    }
    requireTrue(check.noMaskedSilence, `brollChecks(${id}).noMaskedSilence`, errors);
    requireTrue(check.noShortArollFlash, `brollChecks(${id}).noShortArollFlash`, errors);
    requireTrue(check.nearbyTakeCutsCovered, `brollChecks(${id}).nearbyTakeCutsCovered`, errors);
  }

  return result(errors, limits, {
    takeStarts: takeStarts.length,
    protectedPhraseEnds: phraseEnds.length,
    levelingChecks: leveling.length,
    brollChecks: brollChecks.length
  });
}

function result(errors, limits, summary) {
  return { status: errors.length ? "failed" : "passed", failures: errors, limits, summary };
}

function requireArray(value, label, errors) {
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${label} 必须是非空数组`);
    return [];
  }
  return value;
}

function requireId(value, label, errors) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(value?.id || ""))) errors.push(`${label}.id 非法`);
}

function requireTrue(value, label, errors) {
  if (value !== true) errors.push(`${label} 必须明确为 true`);
}

function number(value, label, errors) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) errors.push(`${label} 必须是有限数`);
  return parsed;
}

function renderMarkdown(report) {
  return `# Dialogue Continuity QA\n\n- Status: **${report.status}**\n- Take starts: ${report.summary.takeStarts || 0}\n- Protected phrase ends: ${report.summary.protectedPhraseEnds || 0}\n- Leveling checks: ${report.summary.levelingChecks || 0}\n- B-roll checks: ${report.summary.brollChecks || 0}\n- Maximum lead-in: ${report.limits.maxLeadInSeconds.toFixed(2)}s\n- Maximum adjacent speech jump: ${report.limits.maxAdjacentSpeechWindowJumpDb.toFixed(1)}dB\n- Failures: ${report.failures.length ? report.failures.join("; ") : "none"}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jobDir = resolveJob(args.job);
  const contract = readJson(path.join(jobDir, "data", "dialogue-continuity.json"));
  const primaryFile = path.join(jobDir, "data", "primary-clips.json");
  const primaryClips = fs.existsSync(primaryFile) ? readJson(primaryFile) : [];
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    ...validateDialogueContinuity(contract, { primaryClips })
  };
  const qaDir = path.join(jobDir, "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  writeJson(path.join(qaDir, "dialogue-continuity-report.json"), report);
  fs.writeFileSync(path.join(qaDir, "dialogue-continuity-report.md"), renderMarkdown(report));
  console.log(`Dialogue continuity QA: ${report.status}`);
  if (report.failures.length) {
    for (const failure of report.failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
