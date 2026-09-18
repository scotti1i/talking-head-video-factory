# Talking Head Video Factory · 口播视频工厂

把口播视频剪辑工程化的本地底座：模型做语义判断（该留哪句、切在哪、画面配什么），仓库做确定性执行（转录缓存、切片、字幕、叙事舞台渲染、门禁、审片、交付）。它是 Scott 自己每天出片用的那套，2026-09 起开源，包括「小Lin 式」叙事舞台模板和背后的判断手册。

> 定位：一个人用 Claude Code / Codex 把一条原片变成抖音竖屏 / YouTube 横屏成片。不是 GUI 剪辑软件，不是 SaaS。

## 一条事实链

```text
原片（assets/originals，永不改动）
  → 素材清单 + 按文件哈希缓存的词级转录（只跑一次 Whisper）
  → 完整 take 地图（重拍关系、哪次说完整了）
  → 内容计划（受众问题 / 论点 / 结构段）+ 独立复核
  → 语义 EDL（每段引用结构段和完整 take，不用静音检测剪）
  → 干净 A-roll + 逐切点带声审听
  → 同一缓存重映射字幕
  → 叙事舞台分镜（同一个知识对象在画面上持续生长，不是一页页换 PPT）
  → 样片 → 独立审片 → 人批准 → 成片 → 最终 MP4 检查 → 交付
```

数据合同：[docs/data-contract.md](docs/data-contract.md)。规划器合同：[docs/planner-contract.md](docs/planner-contract.md)。

## 叙事舞台模板（xiaolin）

- 说明书：[docs/narrative-stage.md](docs/narrative-stage.md)（22 种场景形态、人物形态、材质、动作注册表、门禁）
- **判断手册：[docs/xiaolin-taste.md](docs/xiaolin-taste.md)**。这是整套东西里最重要的文件：目标观感、拒绝清单（每条带日期和原话）、结构上限、编排判断、审片十条、停机规则。门禁只查结构，判断在这里。
- 三套皮肤：`stage3d` 横屏立体舞台 · `studio` 横屏「人是画面，信息是叠层」（[spec](docs/skin-studio-spec.md)）· `studio-portrait` 竖屏人物铺满（[spec](docs/skin-studio-portrait-spec.md)）
- 参照成片：[docs/exemplars/](docs/exemplars/)，五条已验收成片的分镜与抽帧条。新 job 必须声明模仿哪一条、哪里不同。
- 挑刺记录：[docs/reviews/](docs/reviews/)，每次看片的原话、处理、落在哪。规则是这样长出来的。

## 环境

| 需要 | 说明 |
|---|---|
| macOS / Linux，Node 22 | `npm install` 只装 hyperframes；叙事舞台的 Remotion 工作区在 `vendor/video-shotcraft/ink-press`，首次渲染时自动准备 |
| ffmpeg / ffprobe | 切片、处理、检查 |
| whisper-cli + `ggml-large-v3-turbo.bin` | 词级转录；模型放 `~/.cache/whisper-cpp/` |
| Chromium | Remotion 渲染与 hyperframes 抽帧自带下载，起不来就停（见手册 §7，不许自造后备渲染链） |
| Claude Code 或 Codex | 唯一日常入口是 skill `talkinghead-edit` |
| 可选 | 即梦 CLI（生成 B-roll）、APIMart（兜底）、能听音频的模型（审听通道） |

```bash
git clone https://github.com/scotti1i/talking-head-video-factory.git ~/talking-head-video-factory
cd ~/talking-head-video-factory
npm install
npm run doctor
npm test

# 装 skill（Claude Code 和 Codex 都认这个目录）
mkdir -p ~/.agents/skills
cp -R skills/talkinghead-edit ~/.agents/skills/
```

然后对 Claude Code / Codex 说：

> 用 xiaolin 模板把 `~/Downloads/xxx.mp4` 剪成抖音竖屏。

skill 会在本仓库建 `jobs/<slug>`，按 [skills/talkinghead-edit/SKILL.md](skills/talkinghead-edit/SKILL.md) 里的命令链走：转录 → 分镜 → 编译门禁 → 静帧自检 → 样片 → 独立审片 → 你说「过了」→ 成片。

## 硬规则（摘要，全文见 AGENTS.md）

- 人说话是主画面，包装服务理解，不抢主体。
- 原片只读；一份词级转录同时服务剪辑和字幕。
- 不用静音检测替代语义剪辑；每个切点带声音审听。
- 内容计划、切点、视觉引用、成片批准都绑定输入与媒体哈希，上游一变旧批准自动失效。
- 先样片后成片；没有审片记录和人批准，`--final` 直接拒绝。
- 门禁全绿不等于创作合格，汇报里分开写。

## 仓库结构

```text
skills/talkinghead-edit/     唯一入口 skill
docs/                        说明书、判断手册、参照成片、挑刺记录、数据合同
scripts/                     确定性执行：转录 / EDL / 切点 / 字幕 / 分镜编译 / 渲染 / 审片 / 交付
templates/shotcraft-direct-port/stage/   叙事舞台组件（Remotion）
vendor/video-shotcraft/      移植来源（Apache-2.0）：Remotion 工作区、场景配方、音效
themes/  components/  visual-assets/     旧 beats 链的主题与组件、共享物件库与背景板
jobs/                        只留 smoke / 回归 / 样例；真实 job 不进版本管理
console/                     本机可视化控制台（查看历史 job 与视觉库）
```

## 分支

- `main`：叙事舞台线（本 README）。
- `windows-deepseek-pilot`：2026-08 的 Windows + WSL + DeepSeek 外贸询单口播试点，独立部署合同，与本线无共同代码。

## 许可

MIT（见 LICENSE）。第三方组件与字体许可见 [docs/third-party-notices.md](docs/third-party-notices.md)。`sample-replica` 主题用到的 Arial Black 为 Monotype 专有字体，不随仓库分发。
