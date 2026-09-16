# ============================================================
# Linux 对齐容器：和客户 WSL Ubuntu 24.04 同一套 apt ffmpeg(6.x) / Noto CJK / fonttools / Node 22
# 为什么：2026-09-16 v2.0.2 的字体 lint bug 在 Mac 上看不出来（Hiragino 存在、PingFang 存在），
#   客户 Gate 4 才炸。打 tag 前必须在这里跑一遍全量测试 + smoke。
# 用法：deploy/linux-parity/run.sh            （首次自动 build，lockfile 变了自动重建）
# 不含：whisper.cpp、NVENC——转录与显卡编码只能靠客户机 doctor + 心跳兜底。
# ============================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    FACTORY_CJK_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc

# ports.ubuntu.com 经 TUN 常 503，换清华镜像（http：装 ca-certificates 之前 https 索引会被忽略）+ 重试（只影响本容器，客户机仍用官方源）
RUN sed -i 's#http://ports.ubuntu.com/ubuntu-ports#http://mirrors.tuna.tsinghua.edu.cn/ubuntu-ports#g; s#http://archive.ubuntu.com/ubuntu#http://mirrors.tuna.tsinghua.edu.cn/ubuntu#g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get -o Acquire::Retries=5 update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
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

# hyperframes inspect 需要 chrome-headless-shell
RUN npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /opt/puppeteer >/tmp/browser.txt \
    && cat /tmp/browser.txt

WORKDIR /work
CMD ["bash"]
