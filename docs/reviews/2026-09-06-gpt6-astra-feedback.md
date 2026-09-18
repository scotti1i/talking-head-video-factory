# 2026-09-06 · GPT-6 Astra 短版（fable-v3 → v3b/v3c）· Scott 挑刺记录

| 原话 | 处理 | 落在哪 |
|---|---|---|
| 「会有重叠」（承上标签压算式行；汇流圆里 Codex + GPT-6 Astra 溢出） | 标签上移；汇流标签移到圆下方 | 分镜 / `Converge.tsx` |
| 「60 × 60 后面的字好像图层有问题看不清」 | 结果格激活后字色改 ON_ACCENT | `Equation.tsx`（同类 bug `Accent.tsx` 同日修） |
| 「开头我的大脸那么大，上面出现字看不清而且也不好看」 | `Title` 新增 `layout: side`，人物 hero 在左、标题落右侧 | `Title.tsx` / `Plan.ts` |
| 「类似 42s 这种没切干净有声音一点点残留的很多」 | 24 个切点全在词边界、无一落在低能量区 → 吸附能量谷脚本 + 分镜时间重映射 | `scripts/snap-cuts.py` / `scripts/remap-plan.py` |
| 「第三方测试 GPT-6 震撼的视频没放进来…B-roll 让大家休息一下看一下视觉震撼」 | 子任务找 8 条第三方实测片段（裁画中画）；插 3 处；编译器加「≤45s 一次视觉休息」 | `assets/broll-third/MANIFEST.md` / `auditStructure` |
| （独立审片代理补抓）24s / 73s 板上孤元素 ≥2s | 承上句与「以前：小领导」改贴脸点缀，板子等第一个实元素再开 | 分镜 v3c |

晋升：全部已进 `docs/xiaolin-taste.md` §2 / §4；模板 bug 进组件；流程漏洞（模板改完工作区不同步）进 `stage-render` / `stage-stills` 自动同步。
