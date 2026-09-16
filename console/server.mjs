// ============================================================
// 口播工厂控制台 — 本地服务
// 一句话边界:全部在本机跑,素材和成片不出这台电脑;
// 判断类工序(精剪/字幕/排拍)生成任务卡交给 Claude Code。
// ============================================================
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  appendComponentBeat,
  importSource,
  jobDetail,
  listJobs,
  listThemes,
  saveDataFile,
  updateProject
} from "./jobs.mjs";
import { buildPrompt } from "./prompts.mjs";
import { cancelRun, listRuns, startRun, startVisualPreviewRun, streamRun } from "./runner.mjs";
import { getVisualAsset, listVisualLibrary, resolveVisualPreview } from "./visual-library.mjs";
import { approvalDetail, consolePort, pendingApprovals, resolveMediaPath, submitApproval, writeFeedbackInbox } from "./approve.mjs";
import { jobsRoot } from "../scripts/lib.mjs";

const PORT = consolePort();
const PUBLIC_DIR = path.join(ROOT, "console", "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      const rejected = rejectApiRequest(req);
      if (rejected) return sendJson(res, rejected.status, { error: rejected.error });
      return await api(req, res, url);
    }
    if (url.pathname.startsWith("/files/")) return serveFile(req, res, ROOT, decodeURIComponent(url.pathname.slice(7)));
    // 审批页的媒体（切点图 / 审片视频）：jobs 根目录可能在仓库外，单独一条只认 jobsRoot 之内的路由
    if (url.pathname.startsWith("/media/")) return serveFile(req, res, jobsRoot(), decodeURIComponent(url.pathname.slice(7)));
    if (url.pathname === "/approve" || url.pathname === "/approve/feedback") return await approve(req, res, url);
    return serveStatic(req, res, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1)));
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

// ============================================================
// /approve（v2.0.3 spec B）
//   GET  /approve[?job=<slug>]  → 审批页（静态 approve.html，页内 JS 读 /api/approve）
//   POST /approve               → {job, kind:"cuts"|"final", name, fullPlayback:true, watchedToEnd?, acousticReviewed?, revision?}
//   POST /approve/feedback      → {job, revision?, name?, note} 追加 review/Rn/feedback-inbox.md
// 数据面在 /api/approve，跟其它 API 一样受 loopback / JSON 门。
// ============================================================
async function approve(req, res, url) {
  if (req.method === "GET") return serveStatic(req, res, "approve.html");
  const rejected = rejectApiRequest(req);
  if (rejected) return sendJson(res, rejected.status, { error: rejected.error });
  if (req.method !== "POST") return sendJson(res, 405, { error: "只接受 GET / POST" });
  const body = await readBody(req);
  try {
    if (url.pathname === "/approve/feedback") return sendJson(res, 200, writeFeedbackInbox(body));
    const result = submitApproval({
      job: body.job,
      kind: body.kind,
      name: body.name,
      fullPlayback: body.fullPlayback === true,
      watchedToEnd: body.watchedToEnd === true,
      acousticReviewed: body.acousticReviewed === true,
      revision: body.revision
    });
    return sendJson(res, 200, { ...result, file: path.relative(jobsRoot(), result.file) });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const body = ["POST", "PUT"].includes(req.method) ? await readBody(req) : null;

  if (req.method === "GET" && url.pathname === "/api/approve") {
    const job = url.searchParams.get("job");
    try {
      return sendJson(res, 200, job ? approvalDetail(job) : { pending: pendingApprovals() });
    } catch (error) {
      return sendJson(res, 404, { error: error.message });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, { jobs: listJobs(), themes: listThemes(), runs: listRuns() });
  }
  if (req.method === "GET" && url.pathname === "/api/visual-library") {
    return sendJson(res, 200, listVisualLibrary());
  }
  if (req.method === "POST" && url.pathname === "/api/visual-library/previews") {
    const asset = getVisualAsset(String(body.component || body.assetId || ""));
    if (!asset) return sendJson(res, 404, { error: "视觉资产不存在" });
    if (asset.kind !== "component") return sendJson(res, 400, { error: "只有统一组件可以刷新真实预览" });
    const theme = getVisualAsset(String(body.theme || ""));
    if (!theme || theme.kind !== "theme") return sendJson(res, 400, { error: "主题不存在" });
    const format = normalizeVisualFormat(body.format);
    if (!format) return sendJson(res, 400, { error: "画幅必须是 vertical 或 horizontal" });
    if (!assetSupportsFormat(asset, format)) return sendJson(res, 400, { error: `组件不支持 ${format}` });
    const fixture = String(body.fixture || asset.defaultFixture || "");
    if (!asset.fixtures?.some((item) => item.id === fixture)) return sendJson(res, 400, { error: "测试场景不存在" });
    return sendJson(res, 202, startVisualPreviewRun({ component: asset.id, theme: theme.id, format, fixture }));
  }
  if (parts[1] === "visual-library" && parts[2] === "assets" && parts[3]) {
    const id = decodeURIComponent(parts[3]);
    const asset = getVisualAsset(id);
    if (!asset) return sendJson(res, 404, { error: "视觉资产不存在" });
    if (req.method === "GET" && parts.length === 4) {
      const preview = resolveVisualPreview(id, {
        theme: url.searchParams.get("theme"),
        format: url.searchParams.get("format"),
        fixture: url.searchParams.get("fixture")
      });
      return sendJson(res, 200, { ...asset, preview });
    }
    if (req.method === "POST" && parts[4] === "apply") {
      return applyVisualAsset(res, asset, body);
    }
  }
  if (req.method === "POST" && url.pathname === "/api/jobs") {
    const slug = String(body.slug || "").trim();
    if (!slug) return sendJson(res, 400, { error: "缺 slug" });
    const args = ["run", "new", "--", slug];
    if (body.title) args.push("--title", body.title);
    const result = spawnSync("npm", args, { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0) return sendJson(res, 500, { error: result.stderr || result.stdout });
    if (body.source) importSource(slug, String(body.source));
    return sendJson(res, 200, { job: jobDetail(slug), output: result.stdout });
  }
  if (parts[1] === "job" && parts[2]) {
    const slug = decodeURIComponent(parts[2]);
    if (req.method === "GET" && parts.length === 3) {
      const detail = jobDetail(slug);
      return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: "job 不存在" });
    }
    if (req.method === "PUT" && parts[3] === "project") return sendJson(res, 200, updateProject(slug, body));
    if (req.method === "PUT" && parts[3] === "data" && parts[4])
      return sendJson(res, 200, saveDataFile(slug, decodeURIComponent(parts[4]), body));
    if (req.method === "POST" && parts[3] === "import") return sendJson(res, 200, importSource(slug, String(body.path || "")));
    if (req.method === "POST" && parts[3] === "run")
      return sendJson(res, 200, startRun(slug, String(body.action || ""), body.params || {}));
    if (req.method === "GET" && parts[3] === "prompt" && parts[4])
      return sendJson(res, 200, { prompt: buildPrompt(slug, decodeURIComponent(parts[4])) });
    if (req.method === "GET" && parts[3] === "runs") return sendJson(res, 200, listRuns(slug));
  }
  if (req.method === "POST" && url.pathname === "/api/reveal") {
    const target = path.resolve(String(body.path || ""));
    const downloadsRoot = path.resolve(os.homedir(), "Downloads");
    if (target !== ROOT && !target.startsWith(ROOT + path.sep) && !target.startsWith(downloadsRoot + path.sep)) {
      return sendJson(res, 400, { error: "只允许打开工程目录或 Downloads 下的路径" });
    }
    if (!fs.existsSync(target)) return sendJson(res, 404, { error: `路径不存在: ${target}` });
    const isDir = fs.statSync(target).isDirectory();
    spawnSync("open", isDir ? [target] : ["-R", target]);
    return sendJson(res, 200, { opened: target });
  }
  if (parts[1] === "run" && parts[2]) {
    if (req.method === "GET" && parts[3] === "stream") {
      if (!streamRun(parts[2], res)) sendJson(res, 404, { error: "run 不存在" });
      return;
    }
    if (req.method === "POST" && parts[3] === "cancel") return sendJson(res, 200, cancelRun(parts[2]));
  }
  sendJson(res, 404, { error: `未知 API: ${req.method} ${url.pathname}` });
}

function applyVisualAsset(res, asset, body) {
  if (!asset.apply?.enabled || asset.apply.mode !== "beat" || asset.kind !== "component") {
    return sendJson(res, 400, { error: asset.apply?.reason || "该资产不能应用到视频" });
  }
  const slug = String(body.job || "").trim();
  if (!slug) return sendJson(res, 400, { error: "缺目标 job" });
  if (!jobDetail(slug)) return sendJson(res, 404, { error: "目标 job 不存在" });
  const format = normalizeVisualFormat(body.format);
  if (!format) return sendJson(res, 400, { error: "画幅必须是 vertical 或 horizontal" });
  if (!assetSupportsFormat(asset, format)) return sendJson(res, 400, { error: `组件不支持 ${format}` });
  const theme = body.theme ? listThemes().themes.find((item) => item.id === body.theme) : null;
  if (body.theme && !theme) return sendJson(res, 400, { error: "主题不存在" });
  const requestedFixture = body.fixture ? asset.fixtures?.find((item) => item.id === body.fixture) : null;
  if (body.fixture && !requestedFixture) return sendJson(res, 400, { error: "测试场景不存在" });
  const fixture = requestedFixture
    || asset.fixtures?.find((item) => item.id === asset.defaultFixture)
    || asset.fixtures?.[0];
  if (!fixture?.beat) return sendJson(res, 400, { error: "组件没有可应用的 fixture" });
  const result = appendComponentBeat(slug, {
    type: asset.apply.payload?.type || asset.id,
    beat: fixture.beat,
    format,
    duration: 4,
    start: body.start
  });
  if (theme) updateProject(slug, { theme: theme.id });
  return sendJson(res, 200, { ...result, job: slug, theme: theme?.id || null });
}

function normalizeVisualFormat(value) {
  return { portrait: "vertical", vertical: "vertical", landscape: "horizontal", horizontal: "horizontal" }[value] || null;
}

function assetSupportsFormat(asset, format) {
  return asset.formats?.some((item) => item.id === format && item.supported !== false);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) reject(new Error("请求体过大"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
  });
}

function rejectApiRequest(req) {
  const host = String(req.headers.host || "").split(":")[0].replace(/^\[|\]$/g, "");
  if (!isLoopbackHost(host)) return { status: 403, error: "本地 API 只接受 loopback Host" };
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return null;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!isLoopbackHost(parsed.hostname) || Number(parsed.port || 80) !== PORT) {
        return { status: 403, error: "拒绝跨站修改本地项目" };
      }
    } catch {
      return { status: 403, error: "Origin 不合法" };
    }
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "修改请求必须使用 application/json" };
  }
  return null;
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function safeResolve(base, rel) {
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error("路径越界");
  return target;
}

function serveStatic(req, res, rel) {
  const file = safeResolve(PUBLIC_DIR, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: "not found" });
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function serveFile(req, res, base, rel) {
  const file = safeResolve(path.resolve(base), rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: "not found" });
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const size = fs.statSync(file).size;
  const range = req.headers.range;
  const headers = fileHeaders(file, rel);
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}

function fileHeaders(file, rel) {
  const headers = { "X-Content-Type-Options": "nosniff" };
  if (rel.startsWith("out/visual-library/cache/") && path.extname(file).toLowerCase() === ".woff2") {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`口播工厂控制台: http://127.0.0.1:${PORT}`);
  console.log(`工程根目录: ${ROOT}`);
});
