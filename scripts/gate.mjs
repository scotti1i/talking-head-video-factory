// ============================================================
// gate —— 给重装 / 迁移的每个门打确定性的 PASS / FAIL 标记
// 为什么：deploy/windows/CODEX-REINSTALL.md 要求每个 gate 打印
// `GATE n PASS` 才能进下一步；Codex 不得自己判断「差不多过了」。
// 用法：node scripts/gate.mjs <n> -- <命令> [参数...]
//   子命令退出码 0 → 打印 GATE n PASS，退出 0；否则 GATE n FAIL，退出同码
// ============================================================
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function gateLine(number, ok) {
  return `GATE ${number} ${ok ? "PASS" : "FAIL"}`;
}

export function runGate(number, command, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  const ok = result.status === 0;
  console.log(`\n${gateLine(number, ok)}`);
  return { ok, status: result.status ?? 1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const number = argv[0];
  const separator = argv.indexOf("--");
  if (!/^\d+$/.test(number || "") || separator < 0 || separator === argv.length - 1) {
    console.error("用法: node scripts/gate.mjs <n> -- <命令> [参数...]");
    process.exit(64);
  }
  const [command, ...args] = argv.slice(separator + 1);
  const result = runGate(number, command, args);
  process.exit(result.ok ? 0 : result.status || 1);
}
