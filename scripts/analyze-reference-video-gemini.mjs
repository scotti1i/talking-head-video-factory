import fs from "node:fs";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const videoPath = args.video;
const model = args.model || "gemini-2.5-pro";
if (!videoPath) throw new Error("用法: node scripts/analyze-reference-video-gemini.mjs --video <mp4> [--model gemini-2.5-pro]");
if (!fs.existsSync(videoPath)) throw new Error(`视频不存在: ${videoPath}`);

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
  body: JSON.stringify({ file: { display_name: "talking-head-template-reference" } })
});
await assertOk(uploadStart, "启动 Gemini 文件上传");
const uploadUrl = uploadStart.headers.get("x-goog-upload-url");
if (!uploadUrl) throw new Error("Gemini 未返回 x-goog-upload-url");

const uploadFinish = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    "Content-Length": String(bytes.length),
    "X-Goog-Upload-Offset": "0",
    "X-Goog-Upload-Command": "upload, finalize"
  },
  body: bytes
});
await assertOk(uploadFinish, "上传 Gemini 视频");
let file = (await uploadFinish.json()).file;
if (!file?.name || !file?.uri) throw new Error("Gemini 文件响应缺少 name 或 uri");

for (let attempt = 0; attempt < 60 && file.state === "PROCESSING"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
    headers: { "x-goog-api-key": apiKey }
  });
  await assertOk(status, "查询 Gemini 文件状态");
  file = await status.json();
}
if (file.state !== "ACTIVE") throw new Error(`Gemini 文件未激活: ${file.state || "unknown"}`);

const prompts = [
  {
    id: "forensic-timeline",
    text: `你是一名资深 TikTok 口播剪辑导演。请对这条参考视频做取证式拆解，目标是后续复刻它的剪辑手法，而不是复述内容。

请用中文输出，并且：
1. 按时间顺序列出所有 A-roll、B-roll、转场、字幕形态、贴纸/图形、机位或数字推拉变化、音乐和音效事件；时间尽量精确到 0.1 秒。
2. 每个时间段说明：画面主体、景别、运动、B-roll 素材类型、进入/退出方式、字幕内容形态与强调色、它服务的口播语义。
3. 分开标注“视频中直接观察到的事实”和“基于画面推断的剪辑意图”。
4. 识别开头 Hook、正文节奏、证据段、CTA 段的结构。
5. 不确定的切点或小于 1 秒的快速效果必须标为 uncertain，不要假装精确。

输出 JSON，顶层字段固定为 summary、timeline、caption_system、broll_system、transitions、audio_system、hook_structure、cta_structure、uncertainties。timeline 每项至少包含 start、end、layer、observation、editing_function、confidence。`
  },
  {
    id: "template-blueprint",
    text: `基于同一条参考视频，把它抽象成一套可复用的 9:16 外贸工厂口播模板。重点不是复制人物、品牌、原文或 logo，而是复刻剪辑语法。

请用中文输出 JSON，并完成：
1. 给出模板的状态机/节奏规则：什么时候保留真人，什么时候切 B-roll，B-roll 连续多久，何时回真人。
2. 给出字幕 design tokens：大致字号占画面宽度、字重、大小写、行数、每条词数、垂直位置、白色与黄色强调的规则、描边/阴影、出现节奏。
3. 给出 B-roll 资产清单与拍摄清单，区分地点证明、产品证明、客户证明、操作证明。
4. 给出转场 preset、动效时长范围、镜头平均长度、每 10 秒视觉变化次数。
5. 给出音乐和 SFX 的使用方式，以及哪些声音是必要、可选、禁止。
6. 映射到 HyperFrames 数据：哪些应该进入 captions、broll、primary-clips、beats、audio-cues、aroll-cues。
7. 给出逐条 QA 验收标准和 5 个最容易“形似但神不似”的失败模式。
8. 明确哪些结论受 Gemini 视频约 1fps 采样限制，需要本地逐帧复核。

顶层字段固定为 creative_principle、rhythm_rules、caption_tokens、broll_rules、asset_shotlist、transition_presets、audio_rules、hyperframes_mapping、qa_checklist、failure_modes、needs_frame_review。`
  }
];

const analyses = [];
for (const prompt of prompts) {
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } },
            { text: prompt.text }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 32768
        }
      })
    });
    if (response.status !== 503 || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 10000 * (attempt + 1)));
  }
  await assertOk(response, `Gemini 分析 ${prompt.id}`);
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!text) throw new Error(`Gemini 分析 ${prompt.id} 未返回文本`);
  analyses.push({ id: prompt.id, result: JSON.parse(text) });
  if (args.output) writeOutput(args.output, model, file, analyses);
}

if (args.output) {
  console.log(`Gemini 分析已写入 ${args.output}`);
} else {
  console.log(formatOutput(model, file, analyses));
}

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

async function assertOk(response, label) {
  if (response.ok) return;
  const body = await response.text();
  throw new Error(`${label}失败 (${response.status}): ${body.slice(0, 1200)}`);
}

function writeOutput(outputPath, selectedModel, uploadedFile, completedAnalyses) {
  fs.writeFileSync(outputPath, `${formatOutput(selectedModel, uploadedFile, completedAnalyses)}\n`, "utf8");
}

function formatOutput(selectedModel, uploadedFile, completedAnalyses) {
  return JSON.stringify({
    model: selectedModel,
    file: {
      name: uploadedFile.name,
      uri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType,
      state: uploadedFile.state,
      sizeBytes: uploadedFile.sizeBytes
    },
    analyses: completedAnalyses
  }, null, 2);
}
