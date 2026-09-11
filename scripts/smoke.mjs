// ============================================================
// smoke —— 无隐私回归样片：建 smoke job → build:beats → hyperframes check
// 为什么：原来的 npm script 写死 `cd jobs/smoke`，FACTORY_JOBS_ROOT 外置后
// 路径不对；改成按 jobsRoot() 解析，update 回归也走这里。
// ============================================================
import path from "node:path";

import { jobsRoot, projectRoot, run } from "./lib.mjs";

const root = projectRoot();
const jobDir = path.join(jobsRoot(), "smoke");

run("node", [path.join(root, "scripts", "create-smoke-job.mjs")]);
run("node", [path.join(root, "scripts", "build-beats-composition.mjs"), "--job", jobDir]);
run("npm", ["run", "check"], { cwd: jobDir });
console.log(`smoke 通过: ${jobDir}`);
