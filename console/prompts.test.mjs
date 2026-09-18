import assert from "node:assert/strict";
import test from "node:test";

import { visualPlan } from "./prompts.mjs";

test("视觉 Planner 任务卡先实际审查四阶段电影条，再允许编译", () => {
  const prompt = visualPlan({
    dir: "/factory/jobs/demo",
    root: "/factory",
    slug: "demo",
    title: "演示",
    profile: "clean-talkinghead"
  });
  const render = prompt.indexOf("npm run visual:render");
  const qa = prompt.indexOf("npm run visual:qa --");
  const approve = prompt.indexOf("npm run visual:qa:approve");
  const compile = prompt.indexOf("npm run visual:compile");
  assert.equal(render >= 0 && render < qa && qa < approve && approve < compile, true);
  assert.match(prompt, /必须实际打开审查页/);
  assert.match(prompt, /完整播放真实 MP4/);
});
