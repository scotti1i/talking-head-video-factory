# 成片之后：封面 · 抖音定时 · YouTube Shorts 批次（操作手册）

> 2026-09-11 从 Claude 会话记忆搬进仓库。此前这三段只在我的上下文里，Codex 端看不见、Claude 新会话要重摸。每条都是跑通过的做法，改了就更新这里。

## 1. 封面：只能走 skill `video-cover-factory`

- Scott 2026-09-07 否掉本地 HTML / Pillow 拼版：「咱们是要用 cover 生成的 skill」。成品只能由 Codex 内置 `image_gen__imagegen` 生成，本地不修图、不拼图。
- 准备：从成片抽三张真帧做身份参考，放 `jobs/<slug>/cover/work/refs/identity-01-primary.jpg`（正脸）/ `identity-02-angle.jpg`（侧脸）/ `identity-03-expression.jpg`（另一表情）。skill 里写的 `scripts/prepare_references.py` 仓库里不存在，用 ffmpeg 抽帧 + 联系表自选：
  ```bash
  ffmpeg -v error -y -ss 4 -i <成片.mp4> -frames:v 1 -q:v 2 jobs/<slug>/cover/work/refs/identity-01-primary.jpg
  ```
- 提示词模板：`jobs/openai-demo-strategy-20260908/cover/work/codex-prompt.md`（系列「创业思考」母版已批准，直接 Step 3 出 3:4 / 4:3 / 16:9，不出 9:16；可见文字逐字给定；每张 view_image QA，最多重试 2 次）。改 slug、三行可见文字、输出路径即可。
- 调用（**stdin 必须接 /dev/null**，后台跑会卡在 "Reading additional input from stdin"）：
  ```bash
  codex exec --skip-git-repo-check -s workspace-write -C ~/Documents/talking-head-video-factory -m gpt-5.6-sol -o jobs/<slug>/cover/work/codex-last.md -- "$(cat jobs/<slug>/cover/work/codex-prompt.md)" < /dev/null > jobs/<slug>/cover/work/codex-run.log 2>&1 &
  ```
  三画幅约 6 分钟；生成图落 `~/.codex/generated_images/<session>/`，Codex 自己 cp 到 `jobs/<slug>/cover/`，QA 写 `cover/work/qa/REPORT.md`。
- 交付：PNG 转 JPG 一起放进成片的 Downloads 文件夹（抖音只收 JPG）：
  ```bash
  ffmpeg -v error -y -i jobs/<slug>/cover/<slug>-entrepreneurship-thinking-3x4.png -q:v 2 ~/Downloads/<成片文件夹>/cover-3x4.jpg
  ```

## 2. 抖音创作者中心定时发布（Scott 的 Chrome 登录态，Chrome MCP）

前提：Scott 明确说「帮我上抖音 / 定时」。红线：不删他已发布的作品；替换我自己的未发布定时稿可以（他要求换版本时）。

1. 起本机静态服务（页面 JS 只能 fetch 到 http 地址）：`python3 scripts/cors-static-server.py ~/Downloads 8766 &`
2. Chrome 打开 `https://creator.douyin.com/creator-micro/content/upload`，页面上第一个 `input[type=file]` 是视频入口，用 JS 灌文件：
   ```js
   const inp=document.querySelector('input[type=file]');
   const url='http://127.0.0.1:8766/'+encodeURIComponent('<成片文件夹>')+'/<成片>.mp4';
   const blob=await (await fetch(url)).blob(); const f=new File([blob],'<成片>.mp4',{type:'video/mp4'});
   const dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); blob.size
   ```
3. 上传完成后填：标题 ≤30 字；话题在正文框逐个敲 `#xxx `（空格收尾，上限 5 个）；「自主声明」→ 内容由 AI 生成；「同时发布到」开今日头条。
4. 封面：点「选择封面」→ 上传 → 弹窗里的 file input 是 `.semi-upload-hidden-input` 且父元素 class 含 `upload-BvM5FF`（页面上有多个 file input，按索引选会错）；只收 JPG：
   ```js
   const inp=[...document.querySelectorAll('input[type=file]')].find(i=>i.className==='semi-upload-hidden-input'&&i.parentElement.className.includes('upload-BvM5FF'));
   // 之后同上 fetch → File → DataTransfer → change；竖版 3:4 和横版 4:3 各传一次
   ```
5. 「定时发布」→ 时间框直接敲 `YYYY-MM-DD HH:MM`（Scott 习惯中午 12:00）→ 发布 → 回到内容管理列表确认状态：先「审核中」再「定时发布中」；列表不刷新是缓存，reload。
6. 记录写 `jobs/<slug>/delivery/douyin-publish-result.md`（成片路径 / 标题 / 话题 / 封面 / 声明 / 定时时间 / 审片版本），样例 `jobs/gpt6-astra-games-20260907/delivery/douyin-publish-result.md`。
7. 冷处理观察：发布后 1–2 小时播放 <50、DOU+ 列表不出现 = 作品级机器标记（手册 §2 / §5-7 的素材红线）；别删别隐藏，报 Scott。

## 3. YouTube Shorts 批次（从竖拍长片切单话题）

- 规则（Scott 2026-09-08）：一条只说一个话题、更直接、≤60s、开场 0.3s 主题卡、无 CTA、每天一条中午 12:00（北京）。横拍片裁 9:16 后脸占满画面放不下卡片，Shorts 只从竖拍片切。
- 模板：`jobs/shorts-batch-20260910/`。复制整个目录改名，`specs.py` 里改父 job、原片路径 / 时长 / 取景参数、每条的 keeps（原片秒保留段）与 scenes；`build.py` 阶段 1（克隆转录 → 剪辑合同 → 吸附切点 → 批准 → 粗剪 → 处理 → 字幕 → 分镜 → 编译）；`chain-all.sh` 阶段 2（每条 rebind 工作区 → 样片 → 审片 → 批准 → 成片）；`upload/upload-all.sh dry|go` 定时上传。
  ```bash
  python3 jobs/<batch>/build.py            # 或 build.py 2 4 只跑第 2、4 条
  nohup zsh jobs/<batch>/chain-all.sh > jobs/<batch>/chain.log 2>&1 &
  zsh jobs/<batch>/upload/upload-all.sh dry && zsh jobs/<batch>/upload/upload-all.sh go
  ```
- 上传器：`~/Documents/code/youtube-upload/publish_single.py --video --title --description-file --tags --privacy private --publish-at <RFC3339Z>`（北京 12:00 = `T04:00:00Z`），含即梦画面的加 `--contains-synthetic-media`。频道 Scott-出海生活（`scottli4business@gmail.com`）。
- OAuth：token 过期且刷新被拒时 `BROWSER=none PYTHONUNBUFFERED=1 .venv/bin/python auth.py` 拿 URL，在 Scott 的 Chrome 里选账号 → 未验证应用「继续」→ 权限全选 → 完成；**只在 Scott 明说「你来点授权」时代点，绝不输密码 / 验证码**（2026-09-08 已做过一次，token 已续）。
- 上传后用 API 核对：privacyStatus=private、publishAt 正确、uploadStatus 从 uploaded 变 processed。结果表样例 `jobs/shorts-batch-20260910/upload/RESULT.md`。
