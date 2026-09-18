// ============================================================
// APIMart 媒体生成客户端（图像 / 视频，异步任务制）
//   node scripts/apimart-media.mjs image --model gpt-image-2 --prompt "..." --out x.png [--size 1024x1024]
//   node scripts/apimart-media.mjs video --model doubao-seedance-2.0 --prompt "..." --out x.mp4 [--duration 5] [--size 1280x720]
//   node scripts/apimart-media.mjs batch --spec jobs/<slug>/assets/broll/spec.json   // 并行提交 + 轮询 + 落盘
// 密钥只从 secret 取，不进任何文件。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const apiKey = () => execFileSync("secret", ["get", "apiplaza/APIMART_API_KEY"], { encoding: "utf8" }).trim();
const baseUrl = () => execFileSync("secret", ["get", "apiplaza/APIMART_BASE_URL"], { encoding: "utf8" }).trim().replace(/\/$/, "");

// 网络健壮性：单次超时 + 指数退避重试（2026-09-03 事故：APIMart 断连半小时，人工循环才恢复）
async function fetchWithRetry(url, init = {}, { tries = 6, timeoutMs = 60000, baseDelay = 15000, label = url } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status >= 500 || res.status === 429) throw new Error(`${label}: HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const delay = baseDelay * 2 ** i;
      console.warn(`retry ${i + 1}/${tries} ${label}: ${err.message}; ${Math.round(delay / 1000)}s 后重试`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function submit(kind, body) {
  const res = await fetchWithRetry(`${baseUrl()}/v1/${kind === "video" ? "videos" : "images"}/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.[0]?.task_id) throw new Error(`APIMart 提交失败: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data.data[0].task_id;
}

async function waitTask(taskId, { intervalMs = 5000, timeoutMs = 15 * 60 * 1000 } = {}) {
  const started = Date.now();
  for (;;) {
    const res = await fetchWithRetry(`${baseUrl()}/v1/tasks/${taskId}`, { headers: { authorization: `Bearer ${apiKey()}` } });
    const data = (await res.json())?.data;
    if (data?.status === "completed") return data;
    if (data?.status === "failed" || data?.status === "error") throw new Error(`APIMart 任务失败: ${JSON.stringify(data).slice(0, 300)}`);
    if (Date.now() - started > timeoutMs) throw new Error(`APIMart 任务超时: ${taskId}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function firstUrl(result) {
  const images = result?.images?.[0]?.url;
  const videos = result?.videos?.[0]?.url ?? result?.video?.url ?? result?.videos?.[0];
  const pick = (v) => (Array.isArray(v) ? v[0] : v);
  return pick(images) || pick(videos) || (typeof result?.url === "string" ? result.url : null);
}

async function download(url, out) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

export async function generate({ kind, model, prompt, out, size, duration, extra = {} }) {
  const body = kind === "video"
    ? { model, prompt, duration: duration ?? 5, ratio: extra.ratio ?? "16:9", resolution: extra.resolution ?? "720p", ...extra }
    : { model, prompt, n: 1, size: size ?? "1024x1024", ...extra };
  const taskId = await submit(kind, body);
  const task = await waitTask(taskId);
  const url = firstUrl(task.result);
  if (!url) throw new Error(`任务完成但没有产物: ${JSON.stringify(task).slice(0, 400)}`);
  await download(url, out);
  return { taskId, out, cost: task.cost, seconds: task.actual_time, result: task.result };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  return args;
}

async function main() {
  if (process.argv[2] === "ping") {
    const res = await fetchWithRetry(`${baseUrl()}/v1/models`, { headers: { authorization: `Bearer ${apiKey()}` } }, { tries: 2, timeoutMs: 15000, baseDelay: 2000, label: "ping" });
    console.log(`ping ${res.status} ${baseUrl()}`); return;
  }
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "image" || command === "video") {
    const r = await generate({ kind: command, model: args.model, prompt: args.prompt, out: args.out, size: args.size, duration: args.duration ? Number(args.duration) : undefined });
    console.log(JSON.stringify({ ok: true, ...r, result: undefined }));
    return;
  }
  if (command === "batch") {
    const spec = JSON.parse(fs.readFileSync(args.spec, "utf8"));
    const dir = path.dirname(path.resolve(args.spec));
    const jobs = spec.items.filter((it) => !fs.existsSync(path.join(dir, it.out)));
    const results = await Promise.allSettled(jobs.map((it) => generate({ kind: it.kind || spec.kind, model: it.model || spec.model, prompt: `${it.prompt}${spec.style ? "。" + spec.style : ""}`, out: path.join(dir, it.out), size: it.size || spec.size, duration: it.duration || spec.duration, extra: { ...(spec.extra || {}), ...(it.extra || {}) } })));
    results.forEach((r, i) => console.log(r.status === "fulfilled" ? `ok ${jobs[i].id} ${r.value.seconds}s ¥${r.value.cost}` : `FAIL ${jobs[i].id}: ${r.reason.message}`));
    return;
  }
  throw new Error("用法: apimart-media.mjs image|video|batch ...");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().catch((e) => { console.error(e.message); process.exit(1); });
