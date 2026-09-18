# 口播工厂 Console 收口与存储页 Design Spec

## 目标

Console 从“另一个生产入口”收口为本地只读工作台：看 profile、发布 targets、真实门禁、成片与存储占用；语义剪辑和正式生产仍由 `talkinghead-edit` + 确定性脚本执行。

## 对标截图

- 当前已批准 Codex light 项目页：`docs/assets/design-references/codex-color-refresh-projects-1440x900.jpg`
- 视觉库同系统页：`docs/assets/design-references/codex-color-refresh-library-1440x900.jpg`

不另造一套后台风格；沿用现有浅色、克制、真实项目数据为主的工作台语言。

## 页面结构

1. 项目页保留“素材 → 剪辑 → 字幕 → 包装 → 出片”阅读顺序，但不再出现重复 Whisper、静音 EDL和一键生产按钮。
2. 顶层新增“存储”视图：顶部只显示总占用、原片、工作中间件、成片、QA、安全可释放、需人工确认七个真实数字。
3. 主体是一张可排序项目表：项目名、profile、发布 targets、总占用、原片、中间件、成片、QA、安全可释放、人工确认。
4. 项目展开后显示真实最大文件及分类理由；只提供“Finder 打开”“打开 Markdown 报告”“复制 Claude 清理 context”。
5. 不提供删除按钮。清理动作仍在终端按 dry-run 清单和显式范围执行。

## 色板

- 页面底：`#F7F8FA`
- 主表面：`#FFFFFF`
- 主文字：`#17191C`
- 次文字：`#667085`
- 分隔线：`#E4E7EC`
- 交互主色：海军蓝 `#2457D6`
- 安全可释放：只用中性蓝标签，不用绿色庆祝色
- 风险提示：克制暖橙 `#B54708`；仅危险说明使用红色 `#B42318`

## 字体

- `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif`
- 数字使用系统等宽数字特性；不引入新字体文件。

## 密度与响应式

- 1440：完整十列表格，默认按总占用降序。
- 390：每个 job 变为两行摘要；第一行名称/profile，第二行总量/安全/人工确认，详情渐进展开。
- 首屏只呈现真实数字和项目，不放解释性大段文案。

## 三个禁止项

1. 禁止饼图、仪表盘装饰和“存储健康分”之类的虚构指标。
2. 禁止红色“一键清理”、批量勾选删除或任何绕过 dry-run 的动作。
3. 禁止把 profile 与平台混为同一标签；必须分别展示“内容类型”和“抖音/YouTube targets”。

## 验收

- 当前项目和视觉库仍与批准截图同一设计系统。
- 30 秒能看出哪个 job 最大、空间花在原片还是中间件、目前能安全释放多少。
- UI 不再提供与 Skill 冲突的生产路径。
- 1440 与 390 真实渲染检查，所有数字来自 `reports/storage/storage-report.json`。
