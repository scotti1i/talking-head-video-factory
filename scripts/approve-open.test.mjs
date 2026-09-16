import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { approveUrl, ensureConsole, jobSlug, pickOpener } from "./approve-open.mjs";

function withEnv(overrides, fn) {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
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

test("开浏览器命令按 wslview → explorer.exe → xdg-open → open 顺序挑第一个存在的", () => {
  const only = (...names) => (name) => names.includes(name);
  assert.equal(pickOpener({ commandExists: only("open", "xdg-open") }), "xdg-open");
  assert.equal(pickOpener({ commandExists: only("explorer.exe", "wslview") }), "wslview");
  assert.equal(pickOpener({ commandExists: only("explorer.exe") }), "explorer.exe");
  assert.equal(pickOpener({ commandExists: only("open") }), "open");
  assert.equal(pickOpener({ commandExists: () => false }), null);
});

test("审批页 URL 与 job slug：jobs/<slug> 解析到 jobsRoot 内，越界拒绝", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "approve-open-jobs-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "approve-open-cfg-"));
  withEnv({ FACTORY_JOBS_ROOT: root, FACTORY_CONFIG_DIR: configDir }, () => {
    assert.equal(jobSlug("jobs/demo-片"), "demo-片");
    assert.equal(jobSlug(path.join(root, "demo")), "demo");
    assert.throws(() => jobSlug("/somewhere/else"), /不在 jobs 根目录内/);
  });
  assert.equal(approveUrl(4870, "demo 片"), "http://127.0.0.1:4870/approve?job=demo%20%E7%89%87");
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(configDir, { recursive: true, force: true });
});

test("ensureConsole：已在听就不拉起；没在听拉起后轮询到通为止；超时报错", async () => {
  let started = 0;
  const start = () => { started += 1; };
  assert.deepEqual(await ensureConsole({ port: 1, probe: async () => true, start }), { started: false });
  assert.equal(started, 0);
  let probes = 0;
  const lateProbe = async () => { probes += 1; return probes > 2; };
  assert.deepEqual(await ensureConsole({ port: 1, probe: lateProbe, start, sleep: async () => {} }), { started: true });
  assert.equal(started, 1);
  await assert.rejects(ensureConsole({ port: 1, probe: async () => false, start, waitMs: 1, sleep: async () => {} }), /没有在 127\.0\.0\.1:1 起来/);
});
