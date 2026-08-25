import { parseArgs, resolveJob } from "./lib.mjs";
import { evaluateWorkflowStatus } from "./workflow-status.mjs";

const args = parseArgs();
const status = evaluateWorkflowStatus(resolveJob(args.job));

if (args.json) {
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(`\n口播工厂状态 · ${status.title}`);
  console.log(`内容 profile · ${status.profile.label} (${status.profile.id})${status.profile.inferred ? " · 旧 job 推断值" : ""}`);
  console.log(`发布目标 · ${status.targets.map((item) => `${item.label}/${item.platform}${item.policies.length ? `[${item.policies.join("+")}]` : ""}`).join("、")}`);
  if (status.policies.length) console.log(`平台 policy · ${status.policies.join("、")}`);
  console.log("");
  for (const item of status.checks) {
    const mark = item.ok ? "✓" : item.required ? "✗" : "·";
    const requirement = item.required ? "" : "（按需）";
    console.log(`${mark} ${item.name}${requirement}${item.detail ? ` · ${item.detail}` : ""}`);
  }
  console.log(`\n${status.ready ? "当前 profile 的确定性工序已齐全" : "仍有当前 profile 的必需工序未完成"}`);
}

if (!status.ready && args.strict) process.exitCode = 1;
