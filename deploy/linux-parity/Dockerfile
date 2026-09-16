# ============================================================
# Linux 对齐容器：和客户 WSL Ubuntu 24.04 同一套 apt ffmpeg(6.x) / Noto CJK / fonttools / Node 22
# 为什么：2026-09-16 v2.0.2 的字体 lint bug 在 Mac 上看不出来（Hiragino 存在、PingFang 存在），
#   客户 Gate 4 才炸。打 tag 前必须在这里跑一遍全量测试 + smoke。
# 用法：deploy/linux-parity/run.sh            （首次自动 build，lockfile 变了自动重建）
# 架构：由 run.sh 以 --platform linux/amd64 构建（客户机 / CI 都是 x86_64；Apple 芯片默认 arm64 没有 chrome-headless-shell）
# 不含：whisper.cpp、NVENC——转录与显卡编码只能靠客户机 doctor + 心跳兜底。
# ============================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip \
    FACTORY_CJK_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc

RUN apt-get -o Acquire::Retries=5 update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
      ca-certificates curl git unzip ffmpeg fonts-noto-cjk python3 fonttools python3-fonttools python3-brotli python3-numpy \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Node 22（与客户 nvm install 22 同大版本）
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version && ffmpeg -version | head -1

# 依赖按 lockfile 烘进镜像；源码运行时挂载
WORKDIR /deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# hyperframes inspect 需要 chrome-headless-shell：只认它自己 `browser ensure` 装到 ~/.cache/hyperframes/ 的那份（与 CI、客户机同一机制）
RUN cd /deps && npx hyperframes browser ensure 2>&1 | tail -3 && ls ~/.cache/hyperframes

WORKDIR /work
CMD ["bash"]
