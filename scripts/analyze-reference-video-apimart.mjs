import fs from "node:fs";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const videoPath = args.video;
const outputPath = args.output;
const model = args.model || "gemini-3-pro-preview";
if (!videoPath || !outputPath) {
  throw new Error("用法: node scripts/analyze-reference-video-apimart.mjs --video <mp4> --output <json>");
}
if (!fs.existsSync(videoPath)) throw new Error(`视频不存在: ${videoPath}`);

const apiKey = execFileSync("secret", ["get", "apiplaza/APIMART_API_KEY"], { encoding: "utf8" }).trim();
const baseUrl = execFileSync("secret", ["get", "apiplaza/APIMART_BASE_URL"], { encoding: "utf8" }).trim().replace(/\/$/, "");
if (!apiKey || !baseUrl) throw new Error("APIMart 个人中转密钥或 base URL 缺失");

const prompt = `你是一名资深 TikTok 口播剪辑导演和视频模板工程师。请完整观看这条 33.019 秒、1080×1920、60fps 的外贸口播参考视频，并做“可复刻级逆向工程”。目标不是复述内容，也不是复制人物、品牌、原文或 logo，而是抽象它的剪辑语法，后续用在另一条外贸工厂口播上。

本地 FFmpeg 的高阈值画面变化候选为：0.100、0.850、3.683、5.933、12.433、13.567、14.417、15.200、16.967、23.533、28.417 秒。它们只是候选，可能包含闪白、推拉或画面运动；请根据视频核实，不要机械认作硬切。

请严格用中文输出一个合法 JSON 对象，包含这些顶层字段：

1. overview：一句话剪辑定位、Hook、正文、证据段、CTA 的结构。
2. transcript：按时间码整理口播英文原文，听不清处标 uncertain。
3. timeline：按时间顺序列出所有 A-roll、B-roll、转场、数字推拉、字幕形态、定位图标/评论贴纸、音乐和音效事件。每项包含 start、end、layer、observation、editing_function、speech_semantics、transition_in、transition_out、confidence。时间尽量到 0.1 秒；不确定的快速效果明确标 uncertain。
4. edit_grammar：真人何时保留、何时切 B-roll、B-roll 连续多久、何时回真人、镜头平均长度、每 10 秒视觉变化次数。
5. caption_tokens：字号相对画布、字重、大小写、行数、每条词数、水平/垂直位置、白黄强调规则、描边阴影、逐词或逐短语出现节奏。
6. broll_rules：地点证明、产品证明、客户证明、操作证明分别如何选，哪些画面只是装饰性素材所以不该使用。
7. asset_shotlist：复刻所需的真实素材拍摄清单，每项给景别、动作、时长和所支撑的口播含义。
8. transition_presets：可复用转场名称、进入/退出时长范围、运动方式、适用语义和禁用条件。
9. audio_rules：BGM、whoosh、impact、pop 等声音的出现位置、相对响度作用，以及必要/可选/禁止项。
10. hyperframes_mapping：把结论映射到 captions、broll、primary-clips、beats、audio-cues、aroll-cues；指出当前合同若不足需要新增什么确定性字段。
11. qa_checklist：可逐条验收的复刻标准。
12. failure_modes：至少 5 个“形似但神不似”的失败模式。
13. observed_vs_inferred：分开列出视频直接观察事实和你的剪辑意图推断。
14. needs_frame_review：受模型视频采样限制、必须回到本地 60fps 逐帧确认的事项。

不要输出 Markdown，不要省略字段，不要把推断写成事实。`;

const videoData = fs.readFileSync(videoPath).toString("base64");
const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "video/mp4", data: videoData } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 4096 }
    }
  })
});
const body = await response.text();
if (!response.ok) throw new Error(`APIMart Gemini 分析失败 (${response.status}): ${body.slice(0, 1600)}`);
const payload = JSON.parse(body);
const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
if (!content) {
  fs.writeFileSync(`${outputPath}.raw.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  throw new Error(`APIMart Gemini 未返回分析文本；原始响应已写入 ${outputPath}.raw.json`);
}
const result = {
  provider: "apimart",
  model,
  usageMetadata: payload.usageMetadata || null,
  analysis: parseJsonContent(content)
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`APIMart Gemini 分析已写入 ${outputPath}`);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    out[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error(`APIMart Gemini 返回内容不是 JSON: ${content.slice(0, 800)}`);
    return JSON.parse(content.slice(start, end + 1));
  }
}
