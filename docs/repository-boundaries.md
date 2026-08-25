# 仓库边界

这个仓库把代码、客户生产数据和历史实验分成三层。边界由 `release/public-manifest.json` 与 `npm run audit:public` 执行，不依赖人工清理。

## 1. Public runtime

可以进入 GitHub 和 Windows 迁移包：

- 当前数据合同、fine-cut policy、profiles 与 template packs；
- 确定性构建、QA、反馈、交付脚本；
- 通用组件、主题令牌、可再分发字体与冻结前端依赖；
- Windows/WSL 部署脚本、Agent skill、文档与测试。

新增顶层目录或根文件时，必须显式加入 `release/public-manifest.json`，否则 CI 失败。

## 2. Local production state

只存在于执行机器，永不进入 GitHub 或迁移包：

- `jobs/`、原片、转录、EDL、审片反馈、QA 帧和成片；
- `reports/`、本地配置、API key、Whisper 模型与缓存；
- 无法确认再分发权的参考帧、人物、logo、地图、音视频和预览图。

这些数据通过 Windows Inbox/Outbox 与 WSL 本地 job 流转，不以 git 同步。

## 3. Private history

旧项目专用 builder、campaign 脚本、重复转录实现和历史证据不进入公开仓库。需要复盘时保留在私有历史仓库；需要恢复能力时，先迁移到当前数据合同和通用 builder，不能把旧文件直接复制回来。

## 发布门禁

```bash
npm run audit:public
npm run test:contracts
npm run test:workflow
npm run test:visual-library
npm run smoke
```

`npm run deploy:bundle` 只从已提交、通过审计的公开白名单生成归档，并再次检查包内路径。任何客户 job、密钥、本机绝对路径或丢失的脚本入口都会让发布失败。
