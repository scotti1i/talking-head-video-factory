# 客户直接贴给 Codex 的话（v2.0.3 版，2026-09-16）

> v2.0.3 起根目录 `AGENTS.md` 自带角色路由与操作员手册，Codex 桌面版打开仓库文件夹就会自动读到，不再需要长话术。
> 分隔线之间的内容原样发给客户；客户在 Codex 桌面版里打开 WSL 里的仓库文件夹（`\\wsl$\Ubuntu\home\<用户>\talking-head-video-factory-v2`），然后贴这几行。

---

你是这台机器的剪辑操作员。仓库根目录的 `AGENTS.md` 是你的手册，先读它，按里面的「操作员手册」执行；我不懂代码，你把每一步的结果原文告诉我就行。

只有第一次安装才做这件事：在 WSL Ubuntu 终端里取重装手册并按 Gate 0～5 执行——`curl -fsSL https://raw.githubusercontent.com/scotti1i/talking-head-video-factory/v2/deploy/windows/CODEX-REINSTALL.md`（安装 tag 见我另发的消息；GitHub token 由我自己输入，不要让我发进对话）。

装好之后的日常就是：我把素材放进 `D:\AutoEdit\Inbox\<项目名>`，跟你说「做这条片」；审片在你打开的网页上点通过；出问题你读事件文件告诉我怎么了。

---

## 你（Scott）需要知道的

- 客户 GitHub token 权限：Fine-grained，仅此仓库，**Contents 读写 + Pull requests 读写**（v2.0.3 起 `npm run propose` 要开 PR），有效期 90 天。
- 邀请仍未接受：https://github.com/scotti1i/talking-head-video-factory/invitations
- 手册地址指向 `v2` 分支，客户每次取到的都是最新版；`AGENTS.md` 随 tag 分发，改手册 = 发新 tag。
