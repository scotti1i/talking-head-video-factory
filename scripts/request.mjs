// ============================================================
// request —— 管线做不到的事，操作员提需求单，不改代码
// 为什么：spec §5 规则 2——客户机 Codex 不改 scripts/；写清需求、
// 带上当前 tag 与工具版本，commit 到 client/<host> 并 push，等发布。
// 用法：npm run request -- --title "..." --detail "..." [--job jobs/<slug>]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { commandOk, parseArgs, projectRoot, readJson, resolveJob, sanitizeSlug } from "./lib.mjs";
import { clientHost, describeHead, publishToClientBranch } from "./ops-git-lib.mjs";

export function toolVersions() {
  const first = (text) => String(text || "").split("\n")[0].trim();
  return {
    node: process.version,
    npm: first(commandOk("npm", ["--version"]).output) || "缺失",
    ffmpeg: (first(commandOk("ffmpeg", ["-version"]).output).match(/ffmpeg version (\S+)/) || [])[1] || "缺失",
    "whisper-cli": commandOk("whisper-cli", ["--help"]).ok ? "present" : "缺失"
  };
}

export function renderRequest({ title, detail, host, job, head, versions, now }) {
  const lines = [
    `# ${title}`,
    "",
    `- 日期：${now.toISOString()}`,
    `- 主机：${host}`,
    `- job：${job ? `${job.slug}（${job.dir}）` : "无"}`,
    `- 仓库版本：${head.tag || head.branch || "detached"} @ ${head.sha}`,
    `- 版本号：${versions.factory}`,
    `- 工具：${Object.entries(versions.tools).map(([name, value]) => `${name}=${value}`).join(" · ")}`,
    "",
    "## 需求",
    "",
    detail.trim(),
    "",
    "## 处理记录",
    "",
    "- [ ] 开发确认",
    "- [ ] 发布 tag",
    ""
  ];
  return `${lines.join("\n")}`;
}

export function writeRequest({ title, detail, jobDir = null, repoDir = projectRoot(), host = clientHost(), push = true, now = new Date() }) {
  const cleanTitle = String(title || "").trim();
  const cleanDetail = String(detail || "").trim();
  if (!cleanTitle) throw new Error("必须提供 --title");
  if (!cleanDetail) throw new Error("必须提供 --detail：写清做不到的事、期望结果、涉及的 job");
  const slug = sanitizeSlug(cleanTitle).slice(0, 60) || "request";
  const date = now.toISOString().slice(0, 10);
  const fileName = `${date}-${slug}.md`;
  const relativePath = path.posix.join("requests", fileName);
  const file = path.join(repoDir, relativePath);
  if (fs.existsSync(file)) throw new Error(`需求单已存在: ${file}；换个标题或补充到已有文件后重新 report:push`);

  const job = jobDir ? { slug: path.basename(jobDir), dir: jobDir } : null;
  const pkg = readJson(path.join(repoDir, "package.json"));
  const content = renderRequest({
    title: cleanTitle,
    detail: cleanDetail,
    host,
    job,
    head: describeHead(repoDir),
    versions: { factory: pkg.version || "unknown", tools: toolVersions() },
    now
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);

  const result = publishToClientBranch({
    repoDir,
    host,
    push,
    message: `request(${host}): ${cleanTitle}`,
    stage: (worktree) => {
      const dest = path.join(worktree, relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
      return [relativePath];
    }
  });
  return { ...result, file, relativePath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const result = writeRequest({
    title: args.title,
    detail: args.detail,
    jobDir: args.job ? resolveJob(args.job) : null,
    push: !args["no-push"]
  });
  console.log(`需求单已写入: ${result.file}`);
  console.log(`已 commit 到 ${result.branch}（${result.sha}）· ${result.pushed ? "已 push，等发布" : "未 push"}`);
  if (result.warning) console.warn(`WARN: ${result.warning}`);
  console.log("下一步：停下，告诉用户「已提需求，等发布」；不要自己改代码或手写 ffmpeg 顶上。");
}
