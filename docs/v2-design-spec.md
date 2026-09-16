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
| `migrate` | 把 `jobs/` 挪到 `FACTORY_JOBS_ROOT`（默认 `~/factory-jobs`，在 WSL ext4 内；`/mnt/d` 是 NTFS 不能渲染，2026-09-11 实现时推翻原 `$DATA_ROOT/jobs`），校验旧 job 合同，写 `legacy: true` + 原因；幂等 | — |

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

---

# v2.0.3 增补 · 零代码客户、全自动（2026-09-16，Scott 拍板「全都干掉」）

> 前提修正：客户完全没有代码基础。人只做四件事——拖素材进 Inbox、跟 Codex 说话、看审片视频、点「通过」。其余全自动。运行系统永远是「tag」或「tag + 一个开着的 PR」。

## A. 入口：根目录 `AGENTS.md` 角色路由（替代贴话术）
- Codex 桌面版打开工作区自动读根 `AGENTS.md`。顶部加「角色路由」：`~/.config/talking-head-factory/env` 里 `FACTORY_ROLE=operator` → 只按「操作员手册」段执行；否则按原开发规范。
- 操作员手册用人话词汇触发：「做这条片」= 走 SKILL 全流程到 R0 并弹审片；「审片」= 打开审批页；「升级」= `npm run update`；「怎么了 / 出问题了」= 读最近事件 + 跑 doctor 并汇报；「提需求」= `npm run request`；「修一下」= `npm run propose`。
- 六条硬规则保留（只用 npm run、不改运行 tag 上的代码、不拿成片当输入、审批 by 只能 agent、收尾必跑 acceptance、开工先 update --check）。

## B. 网页一键审批（唯一必须留人的地方，但零终端）
- `npm run console` 增加 `/approve` 页：列出待审批 job——切点（`qa/cuts/report.json` 存在且无 `by:human` approval）与终审（`review/Rn/video.mp4` 存在且无 `by:human` final approval）。内嵌播放审片视频 / 展示切点图，输入姓名 + 勾「我完整看完了」→ POST 写 approval.json `{ by:"human", name, reviewedAt, videoHash, fullPlayback:true, via:"console" }`。
- `npm run approve:open -- --job jobs/<slug>`：起 console（若未起）并自动开浏览器到该 job 的审批页（WSL 里用 `wslview` / `explorer.exe`，Mac 用 `open`）。Codex 在 R0 生成后自动调它。

## C. 独立审片 Gemini 后端
- `review:independent --reviewer gemini`：REST `generateContent`，静帧板 PNG inline base64，提示词不变。模型取 `FACTORY_GEMINI_MODEL`，未设则调 ListModels 选最新支持 generateContent 的 `gemini-*-pro`。
- 默认审片人自动选择：有 `codex` 命令 → codex；否则有 `GEMINI_API_KEY` → gemini；都没有 → 明确报错「缺审片后端」。

## D. whisper `-dtw` 回退
- `-dtw` 跑失败（非零退出或输出无 JSON）→ 自动重跑不带 `-dtw`，转录记录 `dtwFallback: <stderr 尾>`。

## E. 出错上报 + 心跳 + 自动升级
- `scripts/run-with-beacon.mjs <script> [args]`：pipeline 命令统一经它运行（package.json 里 SKILL 用到的命令改成走它）；持 `~/.config/talking-head-factory/running.lock`；非零退出 → 写事件 `~/.config/talking-head-factory/events/<ts>.json`（命令、退出码、末 80 行、job、tag、doctor 摘要）→ best-effort `report:push --events`（失败不影响退出码）。
- `npm run heartbeat`：doctor 摘要 + `update --check` + 盘位 + 未上报事件 → `ops/<host>/heartbeat/<date>.json` push；无 lock 且有新 tag → 自动 `npm run update`（失败回滚已存在）。
- Windows 计划任务：`deploy/windows/Install-Scheduled-Task.ps1` 注册每日一次 `wsl -d Ubuntu -- bash <repo>/deploy/windows/Run-Heartbeat.sh`；`CODEX-REINSTALL.md` Gate 2 末尾由 Codex 通过 `powershell.exe -ExecutionPolicy Bypass -File` 调用它。

## F. `propose` + PR 流程（他们自己修，走 PR，不直接进主干）
- `npm run propose -- --title "..."`：从当前 tag 建分支 `client/<host>/fix-<slug>`，hook 在 `client/*/fix-*` 分支上放行代码目录，但仍拒绝 `scripts/gate-protected.json` 列表内文件（qa-*.mjs 阈值、approve-*.mjs、governance-lib.mjs、review-feedback-lib.mjs、deliver*.mjs、aroll-treat/registry.json 的 playbackRate）——改这些走 `request`。
- `npm run propose -- --submit`：本地 `npm test`（全部套件 + `test:timing` + `test:governance`）必须全绿 → commit → push → GitHub REST 开 PR 到 `v2`（token 取 git credential store 或 `FACTORY_GITHUB_TOKEN`；token 需 Contents RW + Pull requests RW）→ 打印 PR 链接。`--status` 查 PR 状态。
- `update` 在 fix 分支上的行为：PR open → 不动，提示等待；PR merged → checkout 最新 tag；PR closed 未合并 → `git format-patch` 存档到 `ops/<host>/rejected/<branch>/` 并 push，再 checkout 最新 tag。运行状态永远是 tag 或 tag+开着的 PR。
- 我们这边承诺：PR 一个工作日内审完；打 tag 前先处理完所有客户 PR；冲突由我们 rebase。

## G. CI 与 Linux 对齐
- `ci.yml` 加 `smoke-ubuntu` job：apt `ffmpeg fonts-noto-cjk python3-fonttools`，`FACTORY_JOBS_ROOT=$RUNNER_TEMP/jobs npm run smoke`；unit job 加 `test:timing`、`test:governance`。PR 与 push 都跑。
- `deploy/linux-parity/`：Ubuntu 24.04 Docker（apt ffmpeg 6.x、fonts-noto-cjk、node 22、whisper.cpp CPU）+ `run.sh` 跑全量测试与 smoke；打 tag 前必跑。出处：2026-09-16 v2.0.2 的字体 bug 本机 Mac 看不出来。

## H. 我们这边
- 每日定时读 `client/*` 分支：有事件、48h 无心跳、有 open PR → 飞书通知 Scott（另行配置）。
