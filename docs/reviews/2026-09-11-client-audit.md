# 客户工厂口播剪辑系统 · 全量审计报告（2026-09-11）

审计对象：客户 2026-09-05 打包的 `01-code-logs.zip`（Windows/WSL 部署，公开仓库 `scotti1i/talking-head-video-factory` @ 18d9594 + 2059 行未提交补丁 + 大量未跟踪新文件，12 个 job）。
方法：只读。逐行读代码；用相同 ffmpeg 滤镜图做合成实验复现；通读 12 个 job 的审片记录、QA、交付物；跑通客户树的单元测试（120 条过 117，3 条失败是音效 wav 在另一个包里）。

---

## 0. 一句话结论

字幕漂移不是一个 bug，是三层叠在一起：**粗剪 concat 的帧量化累积误差（代码级，已实验复现）** + **whisper token 时码当词时码用（转录级）** + **1.1 倍速在仓库脚本之外手工做（流程级）**。而系统「不稳定」的根源是：客户的 Codex 在数据模型表达不了的需求面前，改成直接对上一轮成片打 ffmpeg 补丁，真源（EDL / captions.json）与产物脱钩，所有门禁变成自证。修代码只能解决第一层，另外两层要改管线和 Codex 的操作规则。

---

## 1. 客户系统现状

| 项 | 事实 |
|---|---|
| 代码基线 | 公开仓库 8/25 版（我们这边 `talking-head-video-factory-public`，此后零提交）。内部仓库同日分叉走叙事舞台引擎，两边共享的 60 个脚本全部不同，**不能整体覆盖升级**。 |
| 客户本地改动 | 2059 行未提交补丁（social-fast 预设、face-zoom、caption-voice / dialogue QA、字幕排版参数化、Windows 路径修复）+ 未跟踪：6 个新组件、3 个新模板包、2 个新主题、11 个部署脚本、便携安装包、两套第三方音效库。**没有任何一版进过 git。** |
| 运行环境 | WSL2 Ubuntu + Windows PowerShell 混用；仓库同时存在 `/home/factory/…-codex` 和 `/mnt/d/Program Files/…` 两个工作副本（后者违反自家「禁止在 /mnt/d 渲染」规则）；NVENC；whisper.cpp large-v3-turbo（CUDA Blackwell）；编排是 Codex（DeepSeek Harness 实际未用）。 |
| 产出 | 8 条真片（西/葡语 B2B）。典型耗时：31 秒葡语片 10 轮审片 6h44m；53 秒进口服务片 9 轮 7.7h；三条测试片的审批在 260ms 内批量盖章。 |

---

## 2. 字幕漂移根因（按贡献排序）

### 2.1 粗剪 concat 帧量化 → 累积漂移（代码级，已复现）

- `scripts/render-rough-cut-edl.mjs:63-71`：视频 `trim → fps=F`，段帧数 = ceil(E·fps) − ceil(S·fps)，量化到整帧；音频 `atrim` 采样级精确；`concat v=1:a=1` 取较长者，视频长时给音频**补静音**。只增不减 → 语音越来越晚，字幕表现为**越往后越提前**，每个切点最多 1 帧。
- 实验（40 个非帧对齐切点）：60fps 末尾 +101ms；30fps 末尾 +241ms；60fps 源渲 30fps（legacy proxy 路径）超 ±400ms。与公式预测完全一致。
- 客户 job 佐证：`data/color-managed-sources.json` 实际−预期全部为正，随切点数增大（test4 16 段 +46ms）。
- 门禁为何漏：只比总时长，容差 80ms；`render-single-input-edl.mjs` 无任何时长门禁。
- **最小修复（已验证归零到 0.02ms）**：视频链 `fps=${fps}` 后加 `,trim=end_frame=${Math.floor(duration*fps)}`，让视频永远不长于音频。两个脚本各一行。
- **注意：我们内部仓库 `render-rough-cut-edl.mjs:67-75` 是同一结构，同样有这个 bug**，只是我们的字幕改成从成片音轨重转录，所以没暴露。这次一起修。

### 2.2 whisper token 时码当词时码（转录级，非累积、每条乱跳）

- `transcribe-editor.mjs:58` 调 `whisper-cli -ojf`，没开 `-dtw`；`:102` 直接拿 token 的 `offsets` 当词起止。无 DTW 时是能量启发式，误差 100–500ms，段首几个词起点相同、尾词被拉到静音里（缓存里单词时长最长 12.29s，`stretched_alignment` 标记每 job 6–38 条）。
- 缓存本身是 token 级：`Al/ib/aba`、`prod/utos`、标点 `?` 和 `.` 各占 200ms 时长。`captions-from-edl.mjs` 拿组首 token start / 组末 token end 定字幕入出点，尾词拖尾直接进字幕。
- 这就是葡语片 R0–R4 连续 5 轮「全片重校」不收敛、最后退化到 tmp 里手搓音频互相关 + 波形谷脚本才稳的原因。
- 修法：`-dtw large.v3.turbo` 开真正的词级对齐；或把每条字幕的 e 钳到下一词 start，不允许跨静音。

### 2.3 倍速在仓库之外手工做（流程级，一漏就是线性 10%）

- `social-fast` 预设写了 `playbackRate: 1.1`，但仓库没有任何脚本执行倍速。实际是 Codex 每条片手写 `setpts=PTS/1.1` + `atempo=1.1`（6 个 job，参数版本各不相同），字幕靠手工传 `captions:build --playback-rate 1.1` 才对得上。这个参数在 workflow.md / data-contract / skill 里全无记载，project.json 不记倍率，EDL 无速度字段。
- 当前 5 个 job 核对是一致的，但 test1 磁盘上的 EDL（36.9s）与已交付 R2 成片（34.8s×1.1）已不是同一份——真源可以静默错位。
- 修法：倍速进管线（`treat-aroll`），`project.json` 记 `aroll.playbackRate` + EDL hash，字幕和合成读同一来源并断言 `|ΣEDL/rate − A-roll 时长| < 0.1s`。

### 2.4 现有 QA 为什么全部抓不到

- `qa-audio-alignment.py`：把最终混音与「干净 A-roll」互相关，A-roll 本身已含 2.1 的偏移，6 个锚点全 0 也不说明字幕对齐。
- `qa-caption-voice.mjs`：拿 `caption-voice.json` 校验 `captions.json`，而太阳能片和 test1 的 caption-voice.json 是从 captions.json 复制的（tolerance=0，条数相等）——**用字幕校验字幕**。太阳能片 R2/R3 连续 4 条漏词投诉与此一致。
- 该加的门禁：以原片各 EDL 段音频为参考，在 A-roll 的 ΣEDL 预期位置做互相关，任一锚点 >1 帧即失败。能同时暴露 2.1 和 2.3。

---

## 3. 「不稳定」的流程根源（比字幕更严重）

1. **真源与产物脱钩**：太阳能片 R2→R3→R4 每轮以上一轮 `review/Rn/video.mp4` 为底打 ffmpeg 补丁（trim/concat 再切、xfade 贴干净画面、`subtitles=` 烧 .ass、`delogo` 抹旧字幕、`tpad` 定格），三代重编码；音频另从原片重建，画面与声音血统不同。`rough-cut-edl.json` 事后改写但从未驱动渲染。
2. **手工 ffmpeg 普查**：6 个 job 24 个手写滤镜文件，11 类操作（倍速、逐段增益最高 ×17、dynaudnorm/压缩/限幅链、成片再切、amix 混音、纯 JS 合成 BGM、字幕烧录、overlay 补丁、delogo、tpad、重复编码参数）。其中只有 2 类仓库有对应脚本。**这就是「Codex 结合 AI 修复」目前的真实形态：需求超出数据模型就绕过管线。**
3. **审批全是自证**：三个 job 无一有人类签字；approval 时间戳与 manifest 冻结相差 <200ms（脚本自动盖章）；china-store R1 交付包用 R0 的抽帧审批；进口服务片 R3 的审批沿用到 R8；三条测试片 cut/frames/delivery 审批 260ms 内批量写入；reviewer 字段 7 种写法含拼错的 "Codx"；`qa/report.json` 三个 job 都是 `review_required` 却照样交付；两条测试片 feedback 停在 `planned` 仍交付。
4. **预警被放行**：`editor-signals.md` 标 high 的切点（china-store「origen」、solar「proceso」、葡语片 3.30s）从未处理，随后都被用户投诉；所有 cut approval 带 acousticBoundaryWarnings 1–3 照批。
5. **重复 Whisper**：china-store R1 一轮内 6 次整片转录 + 3 次小片段转录，违反自家「一次词级缓存」规则。
6. **反复横跳**：进口服务片音效 R3 太软→R4 回调→R5 仍强→R6 换音色→R7 再加大；葡语片音效 R6 加→R7 加强→R8「刺耳杂音」删——没有审美基线，每轮只响应最后一句话。
7. **零版本控制**：所有改动未提交，便携包由手工拼装（`build-windows-bundle.mjs` 拒绝脏树，生成的 tar.gz 没有安装器要的 manifest / Verify 脚本），发布不可复现。

---

## 4. 客户 Codex 新增代码质量（挑会出事的）

| 级别 | 问题 | 位置 |
|---|---|---|
| A 会崩 | 模板包安装脚本在 PowerShell 5.1 下用 `Set-Content -Encoding utf8` 写 BOM，Node `JSON.parse` 直接抛错 → 之后所有加载 registry 的命令全挂；且用了 .NET Framework 没有的 `GetRelativePath` | `template-packs/factory-b2b-leadgen/portable/Install-TemplatePack.ps1:58,112,119` |
| A 会崩 | 便携安装器引用不存在的 `Verify-Package.ps1` / `bundle-manifest.json`，仓库里没有生成它们的代码 | `deploy/windows/Install-Portable-Bundle.ps1:13,45` |
| B 静默错 | commerce-pop 主题 `overrides.css` 用高特异性选择器盖掉模板包和 job 的字幕字号（声明 64，README 62，实渲 66）；无横屏 guard | `themes/commerce-pop/overrides.css:210-230` |
| B 静默错 | `Set-DeepSeekKey.sh` 用 `>` 截断 env 文件，会把 Gemini key 冲掉；文件还是 CRLF | `deploy/windows/Set-DeepSeekKey.sh:13` |
| B 静默错 | pack.json 里 `sfxAssets`、各种 `*Policy`、`requiredWorkflow` 没有任何脚本读——大段规则是「散文写成 JSON」，不执行 | `template-packs/factory-b2b-leadgen/pack.json` |
| C 法务 | 两套第三方音效库明确禁止再分发，却放在公开根目录 `template-packs/`，一旦提交随便携包外发 | `template-packs/video-editing-sfx-free-pack-v1/LICENSE-SOURCE.md:12-14` |
| C 兼容 | `-filter_complex_script` 在 ffmpeg 8+ 已删，客户一升级 ffmpeg 粗剪即断（我们 9/7 已踩过） | `render-rough-cut-edl.mjs:87`、`render-single-input-edl.mjs:52` |
| D 无测试 | 4 个新组件、rapid-proof 模板/主题、11 个部署脚本零测试；有测试的 QA 门禁测的是「文件存在」不是「能抓到错」 | — |

正面：6 个新组件在注册表下都能加载、渲染、校验；密钥脚本处理合格（read -s、600、原子写）；单元测试 117/120。

---

## 5. 与我们内部系统对比：哪些能直接给，哪些不能

| 客户的痛 | 我们 9 月已有的解 | 可移植性 |
|---|---|---|
| 字幕从源时码映射，不收敛 | `timeline-from-aroll.py`：成片 A-roll 只转录一次，字幕和词表从同一音轨出，不存在两套时间（9/3 因同样问题改的） | **直接可移**，不依赖叙事舞台 |
| 切点落在没气口的地方 | `snap-cuts.py`：EDL 入出点吸附到源音频能量谷 | 直接可移 |
| 倍速 / 磨皮 / 降噪 / 响度靠手写 ffmpeg | `treat-aroll.sh`：一个脚本、固定参数、job 必填 | 直接可移（参数按他们的 social-fast 校） |
| 审批自证 | `stage-review.mjs`：独立上下文模型按手册清单逐条打分，任一 ✗ 成片拒渲；`stage-chain.sh` 失败即停 | 机制可移，清单要按工厂片重写 |
| 每轮只响应最后一句话 | `docs/xiaolin-taste.md` + `docs/exemplars/`：判断进仓库，审片人对着参照成片打分 | 方法可移，内容全部要为工厂 B2B 片重写 |
| 更丰富的剪辑 | 叙事舞台引擎（Remotion、studio / studio-portrait 皮肤、三态人物、split 面板） | **不可整体移植**：他们是 hyperframes 组合器 + 模板包体系，是另一条产品线；只能挑视觉语言和规则借鉴 |

---

## 6. 升级方案（分档，供讨论，未动手）

**T0 · 止血（1 天，纯代码，可让客户 Codex 自己打）**
1. concat 帧量化修复（两个脚本各一行）+ 时长门禁改为逐段音频互相关。
2. whisper 开 `-dtw`，字幕出点钳到下一词。
3. `-filter_complex_script` → `-/filter_complex`。
4. 倍速进管线：`treat-aroll` 移植 + `project.json.aroll.playbackRate` + 断言。
5. 修 Install-TemplatePack.ps1 的 BOM / GetRelativePath；Set-DeepSeekKey.sh 改合并写；第三方音效库移出仓库 + 加 forbiddenPathPatterns。

**T1 · 让管线吸收手工操作（1 周）**
- 把普查出的 11 类手工操作里该有的做成脚本：倍速+响度链、逐段增益包络（读 EDL 段或 dialogue-continuity.json，不再手写 `volume=if(...)`）、B-roll 工作副本派生（60fps/709/无音轨）、BGM+SFX 混音走 composition 而不是 amix 再 remux。
- 字幕改「成片音轨单源」：粗剪 → 处理 → 对最终 A-roll 转录一次 → 字幕、caption-voice、dialogue QA 全从它出。caption-voice 改成从波形声区生成而不是复制字幕。
- 禁止对 `review/Rn/video.mp4` 二次加工：审片改动必须回到 EDL / captions / beats 再渲。写进 skill 硬规则 + 脚本拒绝以 review 视频作输入。

**T2 · 流程与治理（与 T1 并行）**
- 全部改动进 git，便携包由脚本生成（修 build-windows-bundle 或换成 `git archive` + manifest）。
- 审批必须区分「Codex 自检」和「人类签字」：approval.json 加 `by: human` 字段，成片交付脚本只认人类签字；批量盖章直接拒绝（同秒多份）。
- editor-signals 的 high 项未清零不允许冻结 R0。
- 独立审片（stage-review 机制）移植，清单按工厂 B2B 片写：段首口令、尾词保护、字幕漏词、B-roll 闪回、音效强度——这些都是客户反复投诉过的，可以直接从 34+62 条反馈里提炼成 10 条。

**T3 · 剪辑更好更丰富（T1 稳定后再谈）**
- 客户 Codex 做的 6 个组件、face-zoom、commerce-pop / b2b-leadgen 模板包是有价值的积累，先补测试再当资产。
- 视觉语言可以借鉴 studio 皮肤的「一种强调色、玻璃、人物为主」，但载体还是他们的模板包。
- 参照成片机制：每种模板包放一条客户验收过的成片当 exemplar，审片对着它打分。

---

## 7. 建议推翻

- **「让客户 Codex 结合 AI 自己修」这个前提要收窄**：审计显示他们的 Codex 恰恰是把系统改乱的主体（手工 ffmpeg、自证审批、散文式 JSON）。T0 可以让它打补丁，T1/T2 的规则和门禁必须我们出，否则它会再次绕过。
- **「升级」不等于把我们的叙事舞台给他们**：两条产品线，硬合会把两边都拖垮。给的是修法、脚本和治理机制。

## 8. 需要 Scott 决定的

1. T0 由谁执行：我们出 patch 给客户 Codex 打，还是我们直接在公开仓库提交、让客户 pull？（后者要求客户先把本地改动提交或放弃。）
2. 客户本地那 2059 行 + 新文件要不要收编进公开仓库？收编 = 我们背维护；不收 = 客户永远在分叉上。
3. 交付形式：给客户一份「Codex 执行清单」（含验收命令），还是我们远程接管一轮做完 T0+T1 再交回？
