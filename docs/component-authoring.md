# 组件包作者合同

新增信息结构只建 `components/<id>/`，固定四件套：

```text
components/my-card/
├── component.json
├── fixtures.json
├── render.mjs
└── style.css
```

不要改 App 名单、builder 白名单或任务卡。目录扫描器会自动发现第 11 个及后续组件；下一次目录请求即出现。

## component.json

必填字段：

- `schemaVersion: 1`
- `id`：小写 kebab-case，且与目录名一致
- `order`：非负整数；`label`、`category`、`description`、`version`、`source`、`promptHint`：非空文本
- `kind: "component"`
- `lifecycle`：`draft | published | archived`
- `compatibility`：`supported | preview-only | unsupported`
- `formats`：非空数组，只允许 `portrait` / `landscape`
- `requiredFields`、`optionalFields`、`tags`：字符串数组，必填与可选字段不得重叠
- `apply: { "mode": "beat", "type": "<id>" }`
- `preview: { "duration": 4, "defaultFixture": "default" }`；默认 fixture 必须真实存在

可直接复制 [statement/component.json](../components/statement/component.json) 起步。

## fixtures.json

必须是非空数组。每项为 `{ id, label, beat }`；`beat` 至少包含 `kicker`、`title` 和 manifest 的全部 `requiredFields`。可在 beat 中用 `formats` 将样例限制为某一画幅。

每个 fixture 都是独立预览维度，不只是测试数据：默认预览矩阵会渲染组件的全部 fixture。`preview.defaultFixture` 只决定默认选择。

## render.mjs 与 style.css

`render.mjs` 必须导出 `render(beat)` 并返回非空 HTML；可选导出 `validate(beat)`，返回错误字符串数组。用户文案先走 `escapeHtml`，不能直接拼进 HTML。

`style.css` 不能为空。主题值用 `{{tokenName}}`，未知 token 会让构建失败；新增选择器应收口在 `.beat-<id>` 下，避免污染其他组件。HTML 动画交给统一 builder，不在组件里写运行时计时器。

## 最短验证

```bash
npm run test:visual-library
node scripts/visual-preview-generate.mjs \
  --component my-card --fixture default --theme warm-glass \
  --format portrait,landscape --html-only
```

需要真实 poster 时，先 `df -h .` 确认可用空间至少 50G，再去掉 `--html-only`。改 builder 或主题后仍须用 `jobs/beats-regression` 构建并执行该 job 的 `npm run check`。
