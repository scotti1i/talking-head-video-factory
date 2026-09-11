import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNotDerivedInput,
  factoryEnvValue,
  hyperframesCli,
  jobsRoot,
  projectRoot,
  readFactoryEnv,
  resolveJob,
  writeFactoryEnvValue
} from "./lib.mjs";

export function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("未设置 FACTORY_JOBS_ROOT 时 jobs/<slug> 仍落在仓库内", () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cfg-"));
  withEnv({ FACTORY_JOBS_ROOT: undefined, FACTORY_CONFIG_DIR: configDir }, () => {
    assert.equal(jobsRoot(), path.join(projectRoot(), "jobs"));
    assert.equal(resolveJob("jobs/demo"), path.join(projectRoot(), "jobs", "demo"));
    assert.equal(resolveJob(), path.join(projectRoot(), "jobs", "current"));
    assert.equal(resolveJob("/abs/job"), "/abs/job");
    assert.equal(resolveJob("scripts"), path.join(projectRoot(), "scripts"));
  });
});

test("FACTORY_JOBS_ROOT 生效时 jobs/<slug> 与裸 slug 都解析到外部根目录", () => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "factory-jobs-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cfg-"));
  withEnv({ FACTORY_JOBS_ROOT: external, FACTORY_CONFIG_DIR: configDir }, () => {
    assert.equal(jobsRoot(), external);
    assert.equal(resolveJob("jobs/demo"), path.join(external, "demo"));
    assert.equal(resolveJob("jobs/demo/variants/douyin"), path.join(external, "demo", "variants", "douyin"));
    assert.equal(resolveJob("demo"), path.join(external, "demo"));
    assert.equal(resolveJob("jobs"), external);
    assert.equal(hyperframesCli(path.join(external, "demo")), path.join(projectRoot(), "node_modules", ".bin", "hyperframes"));
    assert.equal(hyperframesCli(path.join(projectRoot(), "jobs", "demo")), "../../node_modules/.bin/hyperframes");
  });
});

test("env 文件是第二事实源：写一个 key 不覆盖其他行", () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cfg-"));
  withEnv({ FACTORY_JOBS_ROOT: undefined, FACTORY_CONFIG_DIR: configDir }, () => {
    fs.writeFileSync(path.join(configDir, "env"), "DEEPSEEK_API_KEY=secret\n");
    writeFactoryEnvValue("FACTORY_JOBS_ROOT", "/data/jobs");
    writeFactoryEnvValue("FACTORY_ROLE", "operator");
    writeFactoryEnvValue("FACTORY_ROLE", "developer");
    assert.deepEqual(readFactoryEnv(), { DEEPSEEK_API_KEY: "secret", FACTORY_JOBS_ROOT: "/data/jobs", FACTORY_ROLE: "developer" });
    assert.equal(factoryEnvValue("FACTORY_JOBS_ROOT"), "/data/jobs");
    assert.equal(jobsRoot(), path.resolve("/data/jobs"));
    assert.equal(resolveJob("jobs/x"), path.resolve("/data/jobs", "x"));
    assert.equal(fs.statSync(path.join(configDir, "env")).mode & 0o777, 0o600);
  });
});

test("review/ 与 renders/ 下的文件一律不得当输入", () => {
  const job = "/data/jobs/demo";
  assert.throws(() => assertNotDerivedInput("/data/jobs/demo/review/R1/video.mp4", job, "build:beats"), /不得以审片成片/);
  assert.throws(() => assertNotDerivedInput("/data/jobs/demo/renders/final.mp4", job, "build:beats"), /renders/);
  assert.throws(() => assertNotDerivedInput("/data/jobs/other/variants/x/renders/y.mp4", job, "intake"), /不得以审片成片/);
  assert.equal(assertNotDerivedInput("/data/jobs/demo/assets/aroll.mp4", job, "build:beats"), "/data/jobs/demo/assets/aroll.mp4");
  assert.equal(assertNotDerivedInput("/data/jobs/demo/assets/originals/review-take.mp4", job, "x"), "/data/jobs/demo/assets/originals/review-take.mp4");
});
