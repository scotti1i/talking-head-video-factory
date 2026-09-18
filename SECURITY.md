# Security

本仓库不得包含任何原片、转录、审片 job、API key、凭据、本机环境文件、Whisper 模型或机器专属配置。`jobs/` 下只保留可复现的 smoke / 回归 / 样例 job；真实视频 job 一律在本机，不进版本管理。

如果在 git 历史里发现凭据或私人素材，不要在公开 issue 里贴出内容：先吊销凭据，再通过 GitHub 私信仓库所有者。

运行时密钥（即梦 / APIMart / 审片模型等）放在本机环境变量或 `~/.config/talking-head-factory/env`（权限 600），脚本只读 `process.env`。
