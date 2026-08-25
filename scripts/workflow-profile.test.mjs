import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkflowRegistry, resolveWorkflowProfile } from "./workflow-profile.mjs";

test("内容 profile 与平台 targets / policies 相互独立", () => {
  const registry = loadWorkflowRegistry();
  const project = {
    profile: "factory-acquisition",
    policies: ["douyin-compliance"],
    variants: [
      { id: "douyin-vertical", platform: "douyin" },
      { id: "youtube-horizontal", platform: "youtube" }
    ]
  };
  const profile = resolveWorkflowProfile(project, registry);
  assert.equal(profile.id, "factory-acquisition");
  assert.deepEqual(profile.policies, ["douyin-compliance"]);
  assert.deepEqual(project.variants.map((item) => item.platform), ["douyin", "youtube"]);
});

test("未声明 profile 的旧 job 使用普通口播并标记为推断", () => {
  const profile = resolveWorkflowProfile({}, loadWorkflowRegistry());
  assert.equal(profile.id, "clean-talkinghead");
  assert.equal(profile.inferred, true);
});

test("未知 profile 和 policy 必须失败关闭", () => {
  const registry = loadWorkflowRegistry();
  assert.throws(() => resolveWorkflowProfile({ profile: "factory" }, registry), /未知内容 profile/);
  assert.throws(
    () => resolveWorkflowProfile({ profile: "clean-talkinghead", policies: ["youtube"] }, registry),
    /未知平台 policy/
  );
});
