import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const videoPath = path.resolve(args.video || "");
const outputPath = path.resolve(args.output || "");
const contextPath = args.context ? path.resolve(args.context) : null;
const provider = args.provider || "google";
const model = args.model || (provider === "apimart" ? "gemini-3-pro-preview" : "gemini-2.5-pro");
const platform = args.platform || "YouTube 横屏";

if (!args.video || !args.output) {
  throw new Error("用法: node scripts/review-final-video-gemini.mjs --video <mp4> --output <json> [--context <md>] [--model gemini-2.5-pro]");
}
if (!fs.existsSync(videoPath)) throw new Error(`视频不存在: ${videoPath}`);
if (contextPath && !fs.existsSync(contextPath)) throw new Error(`审核上下文不存在: ${contextPath}`);

const editorialContext = contextPath ? fs.readFileSync(contextPath, "utf8").slice(0, 50000) : "未提供书面上下文";
const prompt = `你是一名极其严格的口播成片终审导演。目标发布平台是 ${platform}。请直接审核随附的最终 MP4，不要总结成“整体不错”，也不要因为问题很小就略过。

审核目标：判断这条视频是否已经可以交付发布，并为本地逐帧复核提供精确的问题清单。

重点检查：
1. 口误、重说、半句、吞字、错误专有名词、字幕与口播不一致；
2. 切点前后的呼吸、音色、嘴型、姿态和语义是否连贯，是否有突兀跳切或气口过紧/过松；
3. 字幕是否漏字、错字、标点异常、显示时间不够、长句难读、遮脸，及是否保持稳定的单行白字样式；
4. 画幅是否真实填满 16:9，是否有柱状黑边；人物、字幕、3D 舞台、解释层与动态 B-roll 是否互相遮挡或出现明显空板；
5. 黑帧、冻帧、重复帧、曝光或色彩突变、音画不同步、异常静音、爆音和底噪；
6. 前 3 秒是否直接进入未来组织变化这一主题，整条节奏是否适合移动端观看，是否存在明确可删的拖沓；
7. 内容逻辑是否自洽，是否清楚区分当前已展示的能力、第三方实测和作者对未来组织形态的推演。

规则：
- 按严重程度输出 blocker、major、minor、note；没有证据就不要报问题。
- 每个问题必须包含时间点或时间段、可观察证据、为何影响发布、置信度，以及本地应如何复核。
- Gemini 视频采样有限；小于 1 秒的切点、逐帧嘴型和精确字幕边界必须标记 needs_local_recheck=true。
- 不得把书面上下文中的 front matter、标题或内部说明当成应该出现在口播里的内容。
- 如果未发现 blocker/major，也要明确列出你实际检查过的维度和仍无法由 Gemini 可靠判断的项目。

书面上下文如下，仅用于核对核心观点与术语：
---
${editorialContext}
---

只输出 JSON。顶层字段固定为 verdict、publish_readiness、summary、issues、checked_dimensions、local_recheck_required、content_logic、caption_review、cut_review、audio_visual_review、sampling_limitations。verdict 只能是 pass、needs_local_review、fail。issues 必须是数组。`;

if (provider === "apimart") {
  await reviewViaApimart({ videoPath, outputPath, contextPath, model, prompt });
  process.exit(0);
}
if (provider !== "google") throw new Error(`不支持的 Gemini provider: ${provider}`);

const apiKey = execFileSync("secret", ["get", "gemini/api-key"], { encoding: "utf8" }).trim();
if (!apiKey) throw new Error("密钥库中的 gemini/api-key 为空");

const bytes = fs.readFileSync(videoPath);
const mimeType = "video/mp4";
const uploadStart = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
  method: "POST",
  headers: {
    "x-goog-api-key": apiKey,
    "X-Goog-Upload-Protocol": "resumable",
    "X-Goog-Upload-Command": "start",
    "X-Goog-Upload-Header-Content-Length": String(bytes.length),
    "X-Goog-Upload-Header-Content-Type": mimeType,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ file: { display_name: path.basename(videoPath) } })
});
await assertOk(uploadStart, "启动 Gemini 文件上传");
const uploadUrl = uploadStart.headers.get("x-goog-upload-url");
if (!uploadUrl) throw new Error("Gemini 未返回 x-goog-upload-url");

// undici 在较大的 resumable upload 上偶发被代理提前断开；curl 的重试与
// --data-binary 对本地媒体更稳，且不会把临时上传 URL 或密钥写进日志。
const uploadBody = execFileSync("curl", [
  "--silent", "--show-error", "--fail-with-body",
  "--retry", "4", "--retry-all-errors", "--retry-delay", "2",
  "-X", "POST",
  "-H", `Content-Length: ${bytes.length}`,
  "-H", "X-Goog-Upload-Offset: 0",
  "-H", "X-Goog-Upload-Command: upload, finalize",
  "--data-binary", `@${videoPath}`,
  uploadUrl
], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
let file = JSON.parse(uploadBody).file;
if (!file?.name || !file?.uri) throw new Error("Gemini 文件响应缺少 name 或 uri");

for (let attempt = 0; attempt < 80 && file.state === "PROCESSING"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
    headers: { "x-goog-api-key": apiKey }
  });
  await assertOk(status, "查询 Gemini 文件状态");
  file = await status.json();
}
if (file.state !== "ACTIVE") throw new Error(`Gemini 文件未激活: ${file.state || "unknown"}`);

const generateBody = JSON.stringify({
  contents: [{
    role: "user",
    parts: [
      { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } },
      { text: prompt }
    ]
  }],
  generationConfig: {
    temperature: 0.05,
    responseMimeType: "application/json",
    maxOutputTokens: 32768
  }
});
// 生成请求体较小，直接用 fetch；避免 curl 失败时把含密钥的命令参数写入异常堆栈。
const generateResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: "POST",
  headers: {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: generateBody,
});
await assertOk(generateResponse, "Gemini 成片审核");
const payload = await generateResponse.json();
const resultText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
if (!resultText) throw new Error("Gemini 成片审核未返回文本");
const result = JSON.parse(resultText);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  reviewedAt: new Date().toISOString(),
  model,
  video: videoPath,
  context: contextPath,
  result
}, null, 2)}\n`, "utf8");
console.log(`Gemini 成片审核已写入 ${outputPath}`);

const cleanup = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
  method: "DELETE",
  headers: { "x-goog-api-key": apiKey }
});
if (!cleanup.ok) console.warn(`Gemini 临时文件清理失败: ${cleanup.status}`);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

async function assertOk(responseValue, label) {
  if (responseValue.ok) return;
  const body = await responseValue.text();
  throw new Error(`${label}失败 (${responseValue.status}): ${body.slice(0, 1200)}`);
}

async function reviewViaApimart({ videoPath: inputVideo, outputPath: output, contextPath: context, model: selectedModel, prompt: reviewPrompt }) {
  const apiKey = execFileSync("secret", ["get", "apiplaza/APIMART_API_KEY"], { encoding: "utf8" }).trim();
  const baseUrl = execFileSync("secret", ["get", "apiplaza/APIMART_BASE_URL"], { encoding: "utf8" }).trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error("APIMart 个人中转密钥或 base URL 缺失");

  const videoData = fs.readFileSync(inputVideo).toString("base64");
  const response = await fetch(`${baseUrl}/v1beta/models/${selectedModel}:generateContent`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: reviewPrompt },
          { inline_data: { mime_type: "video/mp4", data: videoData } }
        ]
      }],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 }
      }
    })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`APIMart Gemini 成片审核失败 (${response.status}): ${body.slice(0, 1600)}`);
  const payload = JSON.parse(body);
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!content) throw new Error("APIMart Gemini 成片审核未返回文本");

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({
    reviewedAt: new Date().toISOString(),
    provider: "apimart",
    model: selectedModel,
    video: inputVideo,
    context,
    usageMetadata: payload.usageMetadata || null,
    result: parseJsonContent(content)
  }, null, 2)}\n`, "utf8");
  console.log(`APIMart Gemini 成片审核已写入 ${output}`);
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error(`Gemini 返回内容不是 JSON: ${content.slice(0, 800)}`);
    return JSON.parse(content.slice(start, end + 1));
  }
}
