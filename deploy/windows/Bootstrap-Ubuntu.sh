#!/usr/bin/env bash
# ============================================================
# Bootstrap-Ubuntu.sh —— 学员 WSL2 Ubuntu 一键装环境（在 Ubuntu 里跑）
# 用法：
#   git clone https://github.com/scotti1i/talking-head-video-factory.git ~/talking-head-video-factory
#   bash ~/talking-head-video-factory/deploy/windows/Bootstrap-Ubuntu.sh
# 幂等：重复跑只更新；结尾打印 SETUP PASS，任何一步失败打印 SETUP FAIL。
# 装什么：apt 依赖（ffmpeg / Noto CJK / fonttools / Chromium 共享库）→ nvm + Node 22 → 仓库 npm install
#   → hyperframes 浏览器 → Remotion 工作区依赖 → 编 whisper.cpp → 下 whisper 模型 → npm run doctor → npm test
# 可调环境变量：
#   FACTORY_HF_ENDPOINT   whisper 模型下载源，默认 https://huggingface.co；国内慢就 export FACTORY_HF_ENDPOINT=https://hf-mirror.com
#   FACTORY_REPO_DIR      仓库位置，默认 ~/talking-head-video-factory（必须在 WSL 家目录，别放 /mnt/c）
# 出处：从分支 v2 精简——去掉 DeepSeek Harness / Inbox / Outbox / DataRoot / 计划任务 / Gemini key（2026-09-18）
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/scotti1i/talking-head-video-factory.git"
REPO_DIR="${FACTORY_REPO_DIR:-$HOME/talking-head-video-factory}"
MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin"
MODEL_SHA256="1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"
HF_ENDPOINT="${FACTORY_HF_ENDPOINT:-https://huggingface.co}"
WHISPER_ROOT="$HOME/.local/src/whisper.cpp"
NVM_VERSION="v0.40.4"

trap 'status=$?; if [[ $status -ne 0 ]]; then echo; echo "SETUP FAIL（上面最后一条报错就是原因；修好后重跑本脚本即可，已装好的步骤会跳过）"; fi' EXIT
step() { echo; echo "==== $*"; }

# ---------- 0. 环境门槛
if ! grep -qi microsoft /proc/version; then
  echo "FAIL: 本脚本只用于 WSL2 Ubuntu（Windows 上打开「Ubuntu」再跑）。" >&2
  exit 1
fi
case "$REPO_DIR" in /mnt/*) echo "FAIL: 仓库不能放在 /mnt/ 下的 Windows 盘（渲染会慢 10 倍且硬链接失败），请放 WSL 家目录，例如 ~/talking-head-video-factory" >&2; exit 1;; esac
available_kb="$(df -Pk "$HOME" | awk 'NR==2 {print $4}')"
if (( available_kb < 20 * 1024 * 1024 )); then
  echo "FAIL: WSL 分区可用空间低于 20GiB（依赖 + 模型约 8GB，再加原片和成片）。" >&2
  exit 1
fi

# ---------- 1. apt：ffmpeg、CJK 字体、fonttools、编译器，以及 Chromium（chrome-headless-shell）需要的共享库
step "apt 依赖"
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  git curl unzip ca-certificates cmake build-essential \
  ffmpeg fontconfig fonts-noto-cjk fonttools python3-fonttools python3-brotli python3-pil \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 \
  libpango-1.0-0 libcairo2 libx11-6 libx11-xcb1 libxcb1 libxext6 libglib2.0-0 libexpat1
fc-cache -f >/dev/null || true

# ---------- 2. nvm + Node 22（与仓库 engines 一致；apt 的 node 太旧别用）
step "Node 22（nvm）"
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL --retry 5 --retry-all-errors --connect-timeout 20 \
    "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | \
    PROFILE=/dev/null METHOD=script bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
nvm use 22
if ! grep -Fq 'NVM_DIR' "$HOME/.bashrc"; then
  printf '\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' >> "$HOME/.bashrc"
fi

# ---------- 3. 仓库：没有就克隆，有就更新
step "仓库 $REPO_DIR"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" pull --ff-only || echo "WARN: git pull 失败（本地有改动或断网），继续用当前版本"
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

# ---------- 4. 仓库依赖 + hyperframes 浏览器
step "npm install + hyperframes 浏览器"
# hyperframes 不用 ONNX 的 CUDA 插件，跳过能省一个几百 MB 的下载
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install --no-audit --no-fund
# hyperframes 的 inspect / render 只认它自己下载到 ~/.cache/hyperframes/ 的 chrome-headless-shell；幂等
npx hyperframes browser ensure

# ---------- 5. 叙事舞台的 Remotion 工作区依赖：prepareInkPressWorkspace 只拷源码不装依赖，
# 它会把 renders/work-shotcraft/.ink-press-node_modules-keep 挪进工作区当 node_modules，这里提前装好放那儿
step "Remotion 工作区依赖（vendor/video-shotcraft/ink-press）"
KEEP="$REPO_DIR/renders/work-shotcraft/.ink-press-node_modules-keep"
WORK_MODULES="$REPO_DIR/renders/work-shotcraft/ink-press/node_modules"
if [[ -d "$WORK_MODULES/remotion" || -d "$KEEP/remotion" ]]; then
  echo "已有 Remotion 依赖，跳过"
else
  DEPS_TMP="$REPO_DIR/renders/work-shotcraft/.ink-press-deps"
  mkdir -p "$DEPS_TMP"
  cp vendor/video-shotcraft/ink-press/package.json vendor/video-shotcraft/ink-press/package-lock.json "$DEPS_TMP/"
  (cd "$DEPS_TMP" && npm ci --no-audit --no-fund && npx remotion browser ensure)
  mv "$DEPS_TMP/node_modules" "$KEEP"
  rm -rf "$DEPS_TMP"
fi

# ---------- 6. whisper.cpp → ~/.local/bin/whisper-cli（有 CUDA Toolkit 就编 GPU 版，否则 CPU 版）
step "whisper.cpp"
mkdir -p "$HOME/.local/src" "$HOME/.local/bin" "$(dirname "$MODEL")"
if [[ ! -f "$WHISPER_ROOT/CMakeLists.txt" ]]; then
  whisper_archive="$(mktemp)"
  curl -fL --retry 5 --retry-all-errors --connect-timeout 20 \
    https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/heads/master \
    -o "$whisper_archive"
  mkdir -p "$WHISPER_ROOT"
  tar -xzf "$whisper_archive" --strip-components=1 -C "$WHISPER_ROOT"
  rm -f "$whisper_archive"
else
  echo "INFO: 已有 whisper.cpp 源码；要升级就删掉 $WHISPER_ROOT 重跑。"
fi
if [[ -x /usr/local/cuda/bin/nvcc ]]; then export PATH="/usr/local/cuda/bin:$PATH"; fi
build_dir="$WHISPER_ROOT/build-cpu"
cmake_args=(-DCMAKE_BUILD_TYPE=Release)
if command -v nvcc >/dev/null 2>&1 && command -v nvidia-smi >/dev/null 2>&1; then
  build_dir="$WHISPER_ROOT/build-cuda"
  cmake_args+=(-DGGML_CUDA=1)
  echo "INFO: 检测到 CUDA Toolkit，编 GPU 版 whisper（转录快 5-10 倍）。"
else
  echo "INFO: 没有 CUDA Toolkit，编 CPU 版 whisper（能用，10 分钟原片转录约 3-6 分钟）。有 NVIDIA 卡的以后装了 CUDA 重跑本脚本即可升级。"
fi
if [[ ! -x "$build_dir/bin/whisper-cli" ]]; then
  cmake -S "$WHISPER_ROOT" -B "$build_dir" "${cmake_args[@]}"
  cmake --build "$build_dir" -j "$(nproc)" --target whisper-cli
fi
ln -sfn "$build_dir/bin/whisper-cli" "$HOME/.local/bin/whisper-cli"
if ! grep -Fq '$HOME/.local/bin' "$HOME/.bashrc"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
export PATH="$HOME/.local/bin:$PATH"

# ---------- 7. whisper 模型（1.6GB，支持断点续传；国内慢就 export FACTORY_HF_ENDPOINT=https://hf-mirror.com 再跑）
step "whisper 模型 ggml-large-v3-turbo"
if [[ ! -f "$MODEL" ]]; then
  model_part="${MODEL}.part"
  curl -fL --retry 10 --retry-all-errors --connect-timeout 20 --continue-at - -o "$model_part" \
    "$HF_ENDPOINT/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
  printf '%s  %s\n' "$MODEL_SHA256" "$model_part" | sha256sum -c -
  mv "$model_part" "$MODEL"
fi
printf '%s  %s\n' "$MODEL_SHA256" "$MODEL" | sha256sum -c -

# ---------- 8. 体检 + 单元测试
step "npm run doctor"
npm run doctor
step "npm test"
npm test

echo
echo "环境装好了。仓库在 $REPO_DIR；原片放到 WSL 家目录（如 ~/videos/），成片在 ~/Downloads，"
echo "Windows 资源管理器地址栏输入  \\\\wsl\$\\Ubuntu\\home\\$USER\\Downloads  就能拿到。"
echo "下一步：在 Ubuntu 里装 Claude Code 或 Codex，然后按仓库 README「装 skill」那一段把 skills/talkinghead-edit 复制到 ~/.agents/skills/。"
echo
echo "SETUP PASS"
