# Third-party notices

## tscaps caption design references

The dynamic caption data model and motion treatment were informed by the open-source tscaps project, especially its Naya and Remi templates. The factory uses its own HyperFrames renderer and does not bundle the tscaps engine.

- Project: https://github.com/francozanardi/tscaps
- Copyright: Copyright (c) 2026 Franco Zanardi
- License: MIT

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Video Shotcraft（vendor/video-shotcraft）

叙事舞台引擎的 Remotion 工作区、场景动作与音效素材移植自 Video Shotcraft，随附其 Apache-2.0 许可证：`vendor/video-shotcraft/LICENSE`。移植来源与哈希记录在 `vendor/video-shotcraft/ink-press/PROVENANCE.json` 与 `visual-recipes/stage-motions.json`。

## 字体（themes/_shared/fonts）

- Inter（400 / 700 拉丁子集）：SIL Open Font License 1.1，https://github.com/rsms/inter
- 霞鹜文楷 LXGW WenKai TC（400 拉丁子集）：SIL Open Font License 1.1，https://github.com/lxgw/LxgwWenKai
- `sample-replica` 主题原本使用 Arial Black（Monotype 专有字体），公开版不随仓库分发；缺失时退回本机系统 "Arial Black"。

## HyperFrames / Remotion

`hyperframes` 通过 npm 依赖安装；Remotion 由 `vendor/video-shotcraft/ink-press/package.json` 声明，其许可条款见 https://www.remotion.dev/docs/license （个人与小团队免费，公司需商业许可）。
