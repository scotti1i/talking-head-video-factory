# v2 Design Spec · 时间链单源 + 真门禁 + 客户端操作员模式

> 2026-09-11。出处：客户 2026-09-05 代码包全量审计（`docs/reviews/2026-09-11-client-audit.md`）。Scott 拍板：不打灰度补丁，一次完全解决；验收在客户机器上跑；代码只在本仓库改，客户机器只 `update`；旧 job 必须迁移；客户 Codex 只做操作员。本 spec 免审直接执行（Scott 2026-09-11 授权）。

## 1. 三个根因 → 三个设计决定

| 根因 | v1 做法 | v2 决定 |
|---|---|---|
| 字幕从原片时码映射到成片，任何改音轨长度的步骤都让映射失效 | 原片 whisper 缓存 → EDL 累加 → `captions-from-edl` | **成片音轨单源**：最终 A-roll（含倍速 / 处理）只转录一次（`-dtw` 词级），字幕、人声区、dialogue QA 全从它出。原片转录只服务剪辑决策。 |
| 粗剪 concat 视频量化到整帧、音频精确到采样，concat 给音频补静音，每切点 ≤1 帧累积 | `trim,fps` + `atrim` + `concat v=1:a=1` | 视频链 `fps` 后 `trim=end_frame=floor(dur·fps)`，视频永不长于音频；新增门禁：每个 EDL 段用原片音频在成片预期位置互相关，任一锚点 >1 帧失败。 |
| 数据模型表达不了（倍速、逐段增益、字幕修正）→ Codex 手写 ffmpeg 对上一轮成片打补丁 | 无 | 模型能表达的进合同（`project.json.aroll`）；脚本硬拒 `review/` 下文件做输入；skill 硬规则「做不到就 `npm run request`」。 |

## 2. 数据合同变更（`docs/data-contract.md` 同步）

### 2.1 `project.json.aroll`（新增，必填于 factory-acquisition）
```json
"aroll": {
  "playbackRate": 1.1,
  "treat": "social-fast-v1",
  "master": "assets/aroll.mp4",
  "edlHash": "<sha256 of data/rough-cut-edl.json at treat time>"
}
```
- `playbackRate` 由 `fine-cut/registry.json` 预设默认，可覆盖；只有 `treat-aroll` 读它，字幕与合成读 `master` 的实际时长并断言 `|Σ(E−S)/rate − duration(master)| < 0.1s`。
- `treat` 指向 `aroll-treat/registry.json` 的预设（倍速、磨皮、校色、降噪、响度），参数全部在注册表，job 不写滤镜。
- `edlHash` 不匹配 = 母版过期，所有下游命令拒绝执行并提示重跑 `aroll:treat`。

### 2.2 转录
- `data/transcripts/`（原片，剪辑用）不变；新增 `data/aroll-transcript.json`（成片 A-roll，`whisper-cli -dtw <model> -ojf`，词级 DTW 时码）。
- `data/captions.json` 只能由 `captions:build`（新实现，读 aroll-transcript + 文稿做词面校正）生成；文件头写 `"source": "aroll-transcript", "arollHash": ...`，hash 不匹配拒绝进入 build。
- `data/caption-voice.json` 由 `captions:build` 从 aroll-transcript 的语音区自动生成（不再手写、不再从 captions 复制），`expectedText` 来自文稿对齐结果。

### 2.3 审批
- `qa/**/approval.json` 新增 `"by": "human" | "agent"`；`deliver*` 与 `review init` 只接受 `by: human`。同一秒内出现两份以上 approval 视为批量盖章，`workflow-status` 标红。
- `data/editor-signals.json` 有 `severity: high` 且未在 EDL `resolvedSignals` 里声明处理的，`review init` 拒绝冻结 R0。

## 3. 命令（package.json）

| 命令 | 作用 | 失败即停 |
|---|---|---|
| `aroll:treat -- --job` | 粗剪 → 倍速 / 处理 / 响度 → `assets/aroll.mp4` + 写 `project.json.aroll` | 缺粗剪、预设未知 |
| `captions:build -- --job` | 转录成片 A-roll（一次，缓存按 hash）→ captions + caption-voice + words timeline | edlHash 不符 |
| `qa:alignment -- --job` | 逐 EDL 段原片↔成片互相关，≤1 帧通过；写 `qa/alignment-report.json` | 任一锚点超差 |
| `review:independent -- --job --revision Rn` | 独立上下文 Codex 按 `docs/factory-review-checklist.md` 看静帧板逐条打分，写 `review/Rn/independent-review.json` | 任一 ✗ |
| `acceptance -- --job` | 顺序跑 status / qa:alignment / captions voice QA / dialogue QA / review:independent，出 `qa/acceptance.{json,md}`，自动 `report:push` | 任一失败 |
| `request -- --title --detail` | 写 `requests/<date>-<slug>.md`，commit 到 `client/<host>` 并 push | — |
| `report:push` | 把当前 job 的 data / qa / review 文本（无媒体）commit 到 `client/<host>` 分支并 push | 无 remote 时只 commit |
| `update` | `git fetch` → checkout 最新 `v*` tag → `npm ci` → doctor → 回归样片；失败回滚上一个 tag | — |
| `migrate` | 把 `jobs/` 挪到 `FACTORY_JOBS_ROOT`（默认 `$DATA_ROOT/jobs`），校验旧 job 合同，写 `legacy: true` + 原因；幂等 | — |

已有命令保留名字；`legacy:*` 保留但 skill 不再引用。

## 4. 硬拒（脚本层）
- `roughcut:render`、`aroll:treat`、`build*`、`render*`：输入路径含 `review/` 或 `renders/` 且非本命令自己的产物 → 直接报错「不得以审片成片作输入，回到 EDL / captions 改」。
- git hook（`scripts/git-hooks/pre-commit`，`bootstrap` 安装）：客户机器上 commit 触及 `scripts/ components/ themes/ template-packs/ console/ deploy/ skills/ docs/` → 拒绝并提示 `npm run request`。仓库变量 `FACTORY_ROLE=operator` 时启用；开发机 `FACTORY_ROLE=developer` 不装。
- `jobs/` 不在仓库内；`report:push` 只提交 `data/ qa/ review/ delivery/*.md|json` 白名单。

## 5. Codex 操作员规则（`.agents/skills/factory-auto-edit/SKILL.md` 硬约束段）
1. 不写 ffmpeg / ffprobe 以外的任何处理命令；所有处理只用 `npm run` 命令。
2. 不改 `scripts/` 等代码目录；管线做不到的事 → `npm run request`，然后停下告诉用户「已提需求，等发布」。
3. 不以 `review/` 或 `renders/` 里的视频当输入做任何加工。
4. 审批文件里 `by` 只能写 `agent`；`human` 只能由用户亲自确认后由用户写入（或 `qa:*:approve --by human --name <人名>` 由用户在终端执行）。
5. 每条片收尾必跑 `npm run acceptance`，并把报告结论原样转述，不总结成「通过」。
6. 每次开工先 `npm run update --check`（只查不装），有新版先告诉用户。

## 6. 客户机器：重装 + 迁移（`deploy/windows/CODEX-REINSTALL.md`）
Gate 0 备份（zip 现有仓库目录到 `D:\AutoEdit\Backup\<date>`）→ Gate 1 在 WSL 用 deploy key 克隆 v2 tag 到 `~/talking-head-video-factory` → Gate 2 `bootstrap`（含 hook 安装、`FACTORY_ROLE=operator`）→ Gate 3 `npm run migrate -- --from <旧仓库路径>` → Gate 4 `doctor:deployment` + 回归样片 → Gate 5 用一条真片跑 `acceptance` 并 push。每个 gate 打印 `GATE n PASS/FAIL`，Codex 不得跳过。

## 7. 收编客户 2026-09-05 快照
- 应用 `working-tree.patch` + 未跟踪文件，排除：`exports/`、`tmp*/`、第三方音效包（许可证禁再分发）、`deploy/windows/factory.config.psd1`、jobs。
- 修：Install-TemplatePack.ps1（BOM / GetRelativePath → 改为 WSL 侧 node 脚本执行）、Install-Portable-Bundle 引用缺失文件（删除便携包路线，统一走 git）、Set-DeepSeekKey 截断、commerce-pop overrides.css 字号特异性、media-pop-sticker fixture 资产、版本号统一。
- commerce-pop 的 4 个 wav 不在包内，用 `generate-*-sfx` 同法合成原创替代，README 注明。
- 散文式 JSON（`*Policy`、`requiredWorkflow`、`sfxAssets`）删除或改成脚本真读的字段；规则文字移到 skill / docs。

## 8. 验收（本机 + 客户机）
- 本机：单元测试全绿；用真实口播跑通 intake → … → acceptance，`qa/alignment-report.json` 全部锚点 ≤1 帧；故意把 EDL 改错 / 手改 captions 时对应门禁必须报错（负向测试）。
- 客户机：8 条真片重跑，96 条历史反馈做回归清单（`docs/factory-review-checklist.md` 附录），acceptance 报告 push 后我们复核。

## 9. 不做
- 不把叙事舞台引擎（Remotion）移植进来；不动 hyperframes 组合器体系。
- 不做便携 zip 发布；发布 = 打 tag。
- 不为客户新写模板包；只收编、补测试、修 bug。
