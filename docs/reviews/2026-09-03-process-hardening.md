# 流程加固清单（2026-09-03 夜间闭环后定稿）

原则（Scott 原话）：**快、稳、准；能流程的流程，必须 AI 的才 AI。** 划分：位置 / 时间 / 存在性 / 格式 → 脚本门禁；内容 / 镜头 / 措辞 / 形态选择 → AI 判断，但出静帧给人看。

## 一、今晚落地的机制

| # | 机制 | 解决的事故 | 落在哪 |
|---|---|---|---|
| 1 | **时间线单源**：成片音轨 turbo 转录一次，字幕按 token 重对时，词表同源 | 字幕比语音早 0.5–1.3s（两套来源叠加误差） | `scripts/timeline-from-aroll.py` |
| 2 | **几何门禁**：人物框 vs 每个场景元素包围盒，0.5s 采样求交，重叠即错；形变窗口不采样；新场景类型必须登记包围盒 | 三次"遮挡"靠眼看才发现 | `validateLayout` / `sceneBoxes` + 测试 |
| 3 | **静帧 runner**：一次打包，按分镜自动取点，出拼板 | 25 张 4 分钟 → 36–48 张 30–40 秒 | `scripts/stage-stills.mjs` |
| 4 | **渲染 runner**：锁 → 8 并发（`--timeout=120000`，失败降半重试）→ Rec.709 → 六项门禁 → 抽帧板 → 720p 预览 → Downloads 交付 → JSON 报告 | 两条渲染同写一个文件；渲完手跑门禁；8 并发下图片加载超时 | `scripts/stage-render.mjs` |
| 5 | **APIMart 客户端**：60s 超时 + 指数退避 6 次；`ping` 子命令做改后自检 | 断连半小时靠人工 loop；改客户端引入递归炸掉两批 | `scripts/apimart-media.mjs` |
| 6 | **素材缺失可编译**：`ALLOW_MISSING_MEDIA=1` 让分镜在素材生成前就能过门禁 | 写分镜要等素材 | 编译器 |
| 7 | 物件 / 背景板 / logo 共享库自动铺进工作区 | 每条片重生成 | `visual-assets/{objects,plates,logos}` |
| 8 | job 粘性 + node_modules 保护 + 换 job 一次绑定 | 测试把工作区换回默认；重建删依赖 | 治理脚本 |

## 二、今晚新增的事故 → 待固化

| 事故 | 处理 | 建议固化 |
|---|---|---|
| whisper `-ojf` 的 CJK 子词是残缺 UTF-8，`json.load` 崩 | 字节级拼回 | 已内置在时间线工具 |
| 即梦 CLI 排队位 1.6 万 / 25 万，10 分钟不动 | 全部走 APIMart | 提交前先 `dreamina list_task` 看队列；>2000 直接兜底 |
| APIMart 余额耗尽（402），6 条 B-roll 只出 3 条 | 缺片槽位改物件 / 标签，分镜标「待补」 | 生成前 `ping` + 余额提醒；B-roll 槽位在分镜里写成可降级（`fallback: label`） |
| 场景内元素互压（二分卡说明文字压物件） | 缩短文案 | 几何门禁扩到场景内元素两两求交，或二分卡按可用宽度自动缩字 |
| 同一命令里 `cd` 后相对路径跑 runner | 绝对路径 | runner 文档只给绝对路径示例 |
| 分镜 id 打错导致漏删场景 | 编译门禁抓住 | 已有门禁覆盖 |
| 8 并发下 `<Img>` 加载 >28s | `--timeout=120000` + 降并发重试 | 已内置 runner |

## 三、还没做、但该做的（按价值）

1. B-roll 槽位可降级：分镜 `broll` 加 `fallback`（label / object），素材缺失时自动降级而不是手改分镜。
2. 场景内元素互压门禁（二分卡 / 关系图 note vs 节点）。
3. 一条命令跑完整流程：`npm run stage -- --job <slug> --deliver <name>`（时间线 → 编译 → 素材缺口清单 → 静帧 → 渲染），素材生成仍是独立步骤。
4. 横屏开场 2 秒标题卡（YouTube 需要），做成 `title` 场景类型。
5. 目录页 artifact 自动从各 job 的 `qa/final` 拼新章节。
6. 60 帧输出只在原片 60 帧时开；否则 30 帧。

## 四、第二轮（2026-09-03 下午，Scott 看片后「八股」反馈）

| 机制 | 解决的问题 | 落在哪 |
|---|---|---|
| 真实网页证据抓取（Remotion 自带 Chrome Headless Shell，零依赖） | 真实信息太少；OpenAI / Amazon 页面反爬则换官方开发者页 / 替代页 | `scripts/web-evidence.sh` |
| 点缀层：`accent` 场景 + `plan.keywords` 字幕关键词金色 | 大段口播时画面没有一点在动 | `Accent.tsx` / `Chrome.tsx` |
| `quote` 引用体、`broll:strip` 通栏、`giant` 巨字、`close` 推近、`hero-right` 镜像 | 尺度与位置无跳跃 | 各组件 + 几何门禁登记 |
| 型录签名 + 跨 job 三元组重合审计（`visual-recipes/stage-usage.json`） | 模板复用多、顺序雷同，三条片长一样 | 编译器 `auditVariety` |
| 每条片独立签名：背景板 / 开场手法 / 默认人物侧 | 同上 | 分镜 `background.plate` + 编排规则 |
| 工作区半成品失败自清理 | 编译失败留下无标记目录（今天第三次） | `prepareInkPressWorkspace` |
| 6 秒语义门禁保留为硬门禁 | 我误判成"节奏问题"降过级，Scott 纠正 | 编译器 |

判断纠正记录：我把八股归因于"节奏太密"，Scott 的判断是密度没错、缺的是真实感与点缀。规则层面的教训——**先问用户心智（观众看到什么）再动门禁**。

## 五、第三轮（2026-09-03 晚，Scott 九条 + 选型页 18 条评论）

| 机制 | 解决的问题 | 落在哪 |
|---|---|---|
| `stage3d` 皮肤（透视黑板 / 网点纹理 / 彩色实底 / » 箭头 / 双语小字） | 背景不统一不立体、黑卡黑底 | `Skin.ts` 按 `plan.skin` 写入；`theme.toneTile`、`Graph chevron`、`NarrativeStage` 透视层 |
| `timeline` / `compare` | 流程表达单调、汇流连用 | 新组件 + 几何登记 |
| 证据聚焦句 `note` 中文译注 | 英文页看不懂 | `Evidence.tsx` |
| 开场正脸审计、同类模板轮替审计、短空闲延后切换、提醒 / 公式按元素出现计 | 开场先飞走、多对一连用、人在左右边空 | 编译器 |
| 点缀贴人物两侧肩高；引用按标点断行 | 点缀占半屏、引用一行两句穿模 | `Accent.tsx` / `Quote.tsx` |
| `MATERIAL-REQUEST.md` 四类判定（第一人称事实必须 Scott 给） | 拿相关公开页顶替他的 GitHub 仓库 | 每个 job |

待做（Scott 已勾）：手机模拟器、录屏容器、排行榜 / 柱状、剪报、地图、标题卡、翻牌、表盘、双机位；覆盖率审计（大半边空白 / 孤立小字）；同类模板 8 场内预警、连续即拦；去掉跨 job 比对；「舞台模式」允许动效叠在全屏人物上。

## 六、第四轮（2026-09-03 深夜，定名 xiaolin 模板 + 先样片后成片）

| 机制 | 解决的问题 | 落在哪 |
|---|---|---|
| `stage-render.mjs --proof / --final` | 没审就渲 1080p 浪费；成片要 60fps 高码率并打包 | runner：样片 540p 不进 Downloads；成片 1080p60 crf15 自动建 `~/Downloads/<日期-片名-YouTube横屏-xiaolin>/` 只留最新 |
| 60fps 输出 = 合成帧率提升 + 逻辑帧插值 | 组件帧常量按 30fps 写死，直接改 fps 会让动效快一倍 | `Root.tsx` 读 `REMOTION_RENDER_FPS`；`NarrativeStage` 逻辑帧 = 物理帧 / ratio；媒体 startFrom / SFX Sequence 按 ratio 缩放 |
| 22 种形态全部可路由 + 路由覆盖测试 | "文档里有、引擎里没有"的假模板 | 目录 job 必须含全部类型；`sceneBoxes` 必须有登记 |
| 新增模板五步 | 以后加模板漏一处门禁就失效 | 说明书 + 测试计数 |
| 覆盖率门禁只在 stage3d 硬拦 | 合成夹具 / 样张 job 被拦 | 编译器 |

实测：样片 540p 渲 186s 用 400s，和全分辨率差不多——瓶颈是每帧的浏览器合成不是像素数，样片的价值是"先审再定"，不是省时间。

## 七、第五轮（2026-09-03 深夜，两条片正式成片，Scott 出门全权闭环）

| 机制 / 事故 | 处理 | 落在哪 |
|---|---|---|
| 第一人称素材先翻本机：`~/Documents/code` 里找到 Scott 自己的 GMV Max 仓库（origin 指向公开 GitHub），抓页替换 TikTok 帮助页 | 素材需求单「必须你给」一栏，等不到人时先查本机仓库 / Vault，公开的自家页面可直接抓 | 员工片 v9；`MATERIAL-REQUEST.md` 标已解决 |
| 自家店铺 agelex.us 是密码墙「Opening soon」 | 抓到的图不能用，删掉；店铺证据只能等后台截图 | 购物片 REVIEW |
| 人物居中时贴脸文字点缀钻进人物卡底下 | 文字胶囊按内侧边缘对齐；编译器几何门禁此前对 anchor 点缀不算包围盒（x 为空 → NaN），补成与组件同一套算法 | `Accent.tsx` / `sceneBoxes` |
| 「左边人右边空」再现（购物片 26–33s，黑板上只有一枚小胶囊） | 人物居中正脸 + 两侧点缀，再让位给 xl 实底 | 购物片 v6 |
| 成片 60fps 实测：102s 片 429s（8 并发），门禁全绿，9.7 Mbps BT.709 | 60fps 成本约为 30fps 的 1.8 倍，可接受 | runner 报告 |
| 等渲染用 `grep "成片 "` 会被首行「成片 1080p60」秒中 | 等进程退出（`kill -0 <pid>`）或等「已交付」 | 操作习惯 |
| **B-roll 全部冻在最后一帧**：`Broll.tsx` 的 `OffthreadVideo` 没包 `Sequence`，按合成时间取帧，20s 处的 5s 素材早已播完；v8 成片 20.0s 与 22.3s 面板均差 0.76（几乎静止），此前三条成片（AI 剪辑 v3 / 员工 v8 / 购物 v5）都带这个缺陷，全片冻结门禁抓不到（人物在动） | `Sequence from=(scene.start-12)*ratio` 包住视频；渲染门禁新增「B-roll 面板必须在动」（每个 broll 场景首尾两帧面板区灰度均差 <1.5 即拦） | `Broll.tsx` / `stage-render.mjs` |
| Scott 出门前把两段 Screen Studio 录屏放进 `~/Documents/`（`gmvmax-github-record.mp4` / `tiktokshopandshopify-record.mp4`） | 复制进各 job `assets/broll/`（gitignore 内），`broll:panel` + `origin:own` + 角标；Screen Studio 自带壁纸和窗口框，用 panel 不用 screen 容器（免双层框） | 员工片 v10 / 购物片 v7 |

## 八、第六轮（2026-09-04 凌晨，Scott 看 v7/v10 成片挑刺六条）

| 事故 | 处理 | 落在哪 |
|---|---|---|
| 开场 / 5s 右边一块空黑板，内容过很久才出现（「不可接受」） | 面板不再跟人物形态走，只在编译器算出的「面板有内容」区间存在（内容前 10 帧淡入、结束后 12 帧淡出）；阶梯 / 循环 / 时间线 / 汇流的内容起点改为第一个元素而不是场景起点；短空闲（0.4–1.8s）上一形态是大脸时把切换延后到内容前 0.5s | `NarrativeStage` `plan.content`；编译器 `contentIntervals` / `applyIdleCentering` |
| 16s 右上角莫名色块 | 二分卡右上题头图标撤掉（只是一块看不出含义的实底） | `Split.tsx` |
| 元素弹出时面板跟着大幅弹，密集时鬼畜 | 节拍相机压到 0.4% 推 / 0.25° 摆，基本不可见；面板只留慢摆慢推 | `NarrativeStage` |
| 「我的录屏」角标没必要 | 两条片的 B-roll 角标全删 | 分镜 |
| 1m30 时间线卡文字溢出 | 卡宽按文字自适应（中 1 / 拉丁 0.55 单位 × 字号 + 图标 + 内边距 + 32 松量），几何登记同算法；导轨随第一个里程碑出现 | `Timeline.tsx` / `sceneBoxes` |
| 时间线首卡在人物缩小途中压脸——几何门禁整个形态切换窗口不采样，是个漏洞 | 切换窗口前 0.5s 按起止两框并集查，之后按终点框查；三处分镜把人物切换提前 0.5s 或元素延后 | 编译器 `speakerAt` |
| APIMart 不充值，改即梦 CLI VIP | `dreamina text2video --model_version=seedance2.5 --video_resolution=720p`，maestro 账号排队 0、每条 100 积分、约 2 分钟返回；三条缺片全部补齐 | 两 job `assets/broll/` |

## 九、第七轮（2026-09-06，接手 Codex 做砸的 GPT-6 Astra 片）

| 事故 / 机制 | 处理 | 落在哪 |
|---|---|---|
| Codex 版把结论硬提到开头、空板子孤胶囊、第三方推文带头像上屏、只有封面图没有演示画面，且已公开发 YouTube | 全部重做：保留原叙事顺序的新 EDL（独立审片过）、官方三条片截演示段、官方数据上屏；YouTube 那条留给 Scott 决定 | job `gpt6-astra-future-20260905`，`REVIEW-fable-v1.md` |
| yt-dlp 直接拉 YouTube 403；mobile client 只给 360p | `--cookies-from-browser chrome` 拉到 1080p（Scott 已授权登录态）；视频 id 以 `-` 开头要用完整 URL | 操作习惯 |
| 官方演示片里有讲解人画中画 / 员工正脸 | 只取屏幕演示段，`crop` 裁掉画中画和角标文字，人物只留背影；每段抽帧核对一次再入库 | `assets/broll-official/` |
| Remotion 内置 Chrome 被 Codex 重建工作区清掉，`web-evidence.sh` 静默失败；系统 Chrome headless 对 openai.com 出白页且挂住 | 脚本加系统 Chrome 兜底 + 找不到就报错；`npx remotion browser ensure` 重新下载；openai.com 这种重 JS 页用 `#:~:text=` 文本片段也拿不到表格，改用发布页数据做排行榜 + 开发者文档页 / ARC Prize / Artificial Analysis 真页 | `scripts/web-evidence.sh` |
| `timeline-from-aroll.py` 沿用既有字幕文本，换了粗剪后会把旧字幕硬对到新音轨（大段缺失、错位） | 换粗剪必须先删 `qa/aroll-turbo.json`、按新转录重建 `captions.json`（中文断句、术语统一）再跑对时 | 操作习惯（该进脚本：字幕缺口 >3s 就报错） |
| 公式板从场景起点算包围盒，空板期人物居中被误判重叠 | `sceneBoxes` 公式板改从第一个项出现算 | 编译器 |

## 十、第八轮（2026-09-07，harness 重构：判断进仓库、审片进流程）

起因：Codex（gpt-5.6-sol，2026-09-05 会话）用同一仓库、同一 skill、过了全部门禁，剪出的 GPT-6 Astra 片被 Scott 判「从脚本到渲染都达不到」。读完那次会话 124 条回复后的诊断：门禁只查结构（元素别撞、板别空），剪辑判断只在我的会话上下文和 Claude 记忆里，Codex 读不到；它还在起不了 Chromium 时自造 FFmpeg 后备版、门禁全绿直接发 YouTube。按 Fowler 的 guides / sensors 框架补齐：

| 层 | 机制 | 落在哪 |
|---|---|---|
| Guides | 判断手册：目标观感 / 参照成片 / 拒绝清单（带日期原话）/ 结构上限 / 编排判断 / 审片清单 / 停机规则 / 回路 | `docs/xiaolin-taste.md`，skill 开工必读 |
| Guides | 参照成片三条（分镜快照 + 抽帧条），新 job 必须声明模仿哪条 | `docs/exemplars/` |
| Sensor 计算型 | 结构门禁：20s 内换位 >4 警告 / >6 拒绝；无视觉休息 >45s 警告 / >70s 拒绝；前 8s 无钩子材料；抖音 >100s / >150s；B-roll >25% | 编译器 `auditStructure` + 测试 |
| Sensor 推理型 | 独立审片：静帧板 + 手册 §6 十条 + 格子↔时间对照 + 元素事件表 → 全新上下文的 claude / codex 打分 → `qa/review-<v>.json` | `scripts/stage-review.mjs` |
| 硬门 | `--final` 没有审片通过 + Scott 通过记录（`stage-approve.mjs`）直接拒绝；`--force-final "原因"` 写进报告 | `scripts/stage-render.mjs` |
| 回归 | 参照成片固定时间点静帧 SSIM ≥0.96，漂移即报；`--update` 只在 Scott 验收后 | `scripts/stage-regress.mjs` |
| 停机 | 环境阻断先报告、禁止自造后备链 | CLAUDE.md 硬约束 9 + skill + 手册 §7 |
| 回路 | 挑刺当场落 `docs/reviews/<日期>-<job>-feedback.md`；晋升即合并（Claude 记忆 `feedback_talkinghead_visual_taste` 已删、`project_narrative_stage` 改指针） | 手册 §8 |

第一次跑独立审片就抓到两处我自己没看出来的：equation 场景自带玻璃板从场景起点就画（空板 2.8s）、汇流首源独占 3.5s。前者是模板 bug（`Equation.tsx` 改为从第一个项起），后者是分镜时序。**证明「写分镜的人自己看图会看见自己想看的」是真的。**

换脑测试：`jobs/harness-test-astra-long-20260907`（长版 A-roll + 字幕 + 素材就绪，只测分镜→样片→审片），`codex exec` 全新会话按 skill 跑，结果见该 job `qa/REPORT.md`。

已知缺口：员工片 / 购物片的 `assets/aroll.mp4` 在 09-05 被外部清理后不在本机，回归只能覆盖 GPT-6 Astra 这条；恢复后 `stage-regress --update --only <id>` 补基线。
