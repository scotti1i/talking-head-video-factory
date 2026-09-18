# ============================================================
# Linux 对齐容器：和学员 WSL Ubuntu 24.04 同一套 apt ffmpeg / Noto CJK / fonttools / Node 22
# 为什么：Mac 上 PingFang / Hiragino 都在、Homebrew ffmpeg-full 都在，很多 Linux 才会炸的问题
#   （字体栈落到 sans-serif、ffmpeg 路径写死 /opt/homebrew、Chromium 缺共享库）在本机看不出来。
#   发版前必须在这里跑一遍 npm test + smoke + 叙事舞台静帧。
# 用法：deploy/linux-parity/run.sh            （首次自动 build，lockfile / Dockerfile 变了自动重建）
# 架构：由 run.sh 以 --platform linux/amd64 构建（学员机 / CI 都是 x86_64；Apple 芯片默认 arm64 没有 chrome-headless-shell）
# 不含：whisper.cpp——转录只能靠学员机 Bootstrap-Ubuntu.sh + doctor 兜底。
# 出处：从分支 v2 的 deploy/linux-parity 搬来，改跑叙事舞台线（Remotion 工作区依赖与浏览器一起烘进镜像，容器运行时不需要联网）
# ============================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip \
    FACTORY_CJK_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc

# 基础工具 + ffmpeg + CJK 字体 + fonttools + Chromium（chrome-headless-shell）运行所需共享库
RUN apt-get -o Acquire::Retries=5 update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
      ca-certificates curl git unzip fontconfig ffmpeg fonts-noto-cjk \
      python3 fonttools python3-fonttools python3-brotli python3-numpy python3-pil \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 \
      libpango-1.0-0 libcairo2 libx11-6 libx11-xcb1 libxcb1 libxext6 libglib2.0-0 libexpat1 \
    && rm -rf /var/lib/apt/lists/*

# Node 22（与学员 nvm install 22 同大版本）
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version && ffmpeg -version | head -1

# 仓库根依赖按 lockfile 烘进镜像；源码运行时挂载
WORKDIR /deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# hyperframes inspect 需要 chrome-headless-shell：只认它自己 `browser ensure` 装到 ~/.cache/hyperframes/ 的那份（与学员机同一机制）
RUN cd /deps && npx hyperframes browser ensure 2>&1 | tail -3 && ls ~/.cache/hyperframes

# 叙事舞台的 Remotion 工作区依赖：prepareInkPressWorkspace 只拷源码不装依赖，
# 这里按 vendor 的 lockfile 装到 /deps/ink-press，run.sh 再软链进 renders/work-shotcraft/ink-press/node_modules。
# Remotion 自己的 chrome-headless-shell 也一并下载（落在 node_modules/.remotion/），容器运行时不用联网。
WORKDIR /deps/ink-press
COPY vendor/video-shotcraft/ink-press/package.json vendor/video-shotcraft/ink-press/package-lock.json ./
RUN npm ci --no-audit --no-fund \
    && npx remotion browser ensure 2>&1 | tail -3 \
    && ls node_modules/.remotion/chrome-headless-shell

WORKDIR /work
CMD ["bash"]
