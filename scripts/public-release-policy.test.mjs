import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPackageScriptTargets,
  assertPublicPaths,
  findSensitiveLabels,
} from "./public-release-policy.mjs";

const manifest = {
  rootFiles: ["README.md", "package.json"],
  roots: ["scripts", "deploy/windows"],
  forbiddenPathPatterns: ["(^|/)jobs(?:/|$)", "(^|/)\\.env(?:\\.|$)"],
};

test("公开白名单允许 runtime，拒绝未知顶层目录和本地状态", () => {
  assert.equal(assertPublicPaths([
    "talking-head-video-factory/README.md",
    "talking-head-video-factory/scripts/a.mjs",
    "deploy/windows/start.ps1",
  ], manifest), true);
  assert.throws(() => assertPublicPaths(["notes/private.md"], manifest), /不在公开白名单/);
  assert.throws(() => assertPublicPaths(["scripts/jobs/client.json"], manifest), /命中禁止路径/);
});

test("内容扫描识别真实凭据与本机绝对路径，不拦截环境变量名", () => {
  assert.deepEqual(findSensitiveLabels("export DEEPSEEK_API_KEY=\"${DEEPSEEK_API_KEY}\""), []);
  const homePath = ["", "Users", "example", "private", "video.mp4"].join("/");
  const privateKey = `-----BEGIN ${"PRIVATE KEY"}-----\nabc`;
  assert.deepEqual(findSensitiveLabels(`source=${homePath}`), ["macOS home path"]);
  assert.deepEqual(findSensitiveLabels(privateKey), ["private key"]);
});

test("package scripts 不能引用未进入公开发布的文件", () => {
  const packageJson = { scripts: { start: "node scripts/start.mjs", test: "node --test console/app.test.mjs" } };
  assert.equal(assertPackageScriptTargets(packageJson, ["scripts/start.mjs", "console/app.test.mjs"]), true);
  assert.throws(
    () => assertPackageScriptTargets(packageJson, ["scripts/start.mjs"]),
    /console\/app\.test\.mjs/,
  );
});
