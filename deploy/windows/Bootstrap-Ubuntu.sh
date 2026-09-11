#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_ROOT="${FACTORY_DATA_ROOT:-/mnt/d/AutoEdit}"
MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin"
MODEL_SHA256="1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"
HF_ENDPOINT="${FACTORY_HF_ENDPOINT:-https://huggingface.co}"
WHISPER_ROOT="$HOME/.local/src/whisper.cpp"
NVM_VERSION="v0.40.4"

if ! grep -qi microsoft /proc/version; then
  echo "FAIL: 本脚本只用于 WSL2 Ubuntu。" >&2
  exit 1
fi

available_kb="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"
if (( available_kb < 50 * 1024 * 1024 )); then
  echo "FAIL: WSL 仓库分区可用空间低于 50GiB。" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y git ffmpeg cmake build-essential curl unzip fonttools python3-fonttools fonts-noto-cjk ca-certificates

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

if [[ -x /usr/local/cuda/bin/nvcc ]]; then
  export PATH="/usr/local/cuda/bin:$PATH"
fi

cd "$ROOT"
# HyperFrames does not use ONNX Runtime's optional CUDA execution provider.
# Skipping that add-on avoids a separate large GitHub Releases download; GPU
# transcription and rendering are still provided by whisper.cpp and NVENC.
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci

mkdir -p "$HOME/.local/src" "$HOME/.local/bin" "$(dirname "$MODEL")"
if [[ ! -f "$WHISPER_ROOT/CMakeLists.txt" ]]; then
  whisper_archive="$(mktemp)"
  curl -fL --retry 5 --retry-all-errors --connect-timeout 20 \
    https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/heads/master \
    -o "$whisper_archive"
  mkdir -p "$WHISPER_ROOT"
  tar -xzf "$whisper_archive" --strip-components=1 -C "$WHISPER_ROOT"
  rm -f "$whisper_archive"
elif [[ -d "$WHISPER_ROOT/.git" ]]; then
  git -C "$WHISPER_ROOT" pull --ff-only
else
  echo "INFO: 使用已解压的 whisper.cpp 源码；如需升级请删除 $WHISPER_ROOT 后重跑。"
fi

build_dir="$WHISPER_ROOT/build-cpu"
cmake_args=(-DCMAKE_BUILD_TYPE=Release)
if command -v nvcc >/dev/null 2>&1 && command -v nvidia-smi >/dev/null 2>&1; then
  build_dir="$WHISPER_ROOT/build-cuda"
  cmake_args+=(-DGGML_CUDA=1)
  echo "INFO: 检测到 CUDA Toolkit，将构建 GPU Whisper。"
else
  echo "WARN: 未检测到 nvcc，先构建 CPU Whisper；安装 WSL CUDA Toolkit 后可重跑本脚本升级。"
fi
cmake -S "$WHISPER_ROOT" -B "$build_dir" "${cmake_args[@]}"
cmake --build "$build_dir" -j "$(nproc)" --target whisper-cli
ln -sfn "$build_dir/bin/whisper-cli" "$HOME/.local/bin/whisper-cli"

if [[ ! -f "$MODEL" ]]; then
  windows_model="$DATA_ROOT/Install/ggml-large-v3-turbo.bin"
  if [[ -f "$windows_model" ]]; then
    cp "$windows_model" "$MODEL"
  else
    model_part="${MODEL}.part"
    curl -fL --retry 10 --retry-all-errors --connect-timeout 20 \
      --continue-at - -o "$model_part" \
      "$HF_ENDPOINT/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
    printf '%s  %s\n' "$MODEL_SHA256" "$model_part" | sha256sum -c -
    mv "$model_part" "$MODEL"
  fi
fi
printf '%s  %s\n' "$MODEL_SHA256" "$MODEL" | sha256sum -c -

if ! grep -Fq '$HOME/.local/bin' "$HOME/.bashrc"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
if [[ -x /usr/local/cuda/bin/nvcc ]] && ! grep -Fq '/usr/local/cuda/bin' "$HOME/.bashrc"; then
  printf 'export PATH="/usr/local/cuda/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$DATA_ROOT/Inbox" "$DATA_ROOT/Outbox" "$HOME/.config/talking-head-factory"
config="$ROOT/deploy/windows/factory.config.psd1"
if [[ ! -f "$config" ]]; then
  sed \
    -e "s#/home/factory/#/home/$USER/#g" \
    -e "s#/mnt/d/AutoEdit/Outbox#$DATA_ROOT/Outbox#g" \
    "$ROOT/deploy/windows/factory.config.example.psd1" > "$config"
fi

npm run doctor:deployment
echo
echo "基础环境完成。"
echo "下一步：bash deploy/windows/Set-DeepSeekKey.sh"
echo "随后从 Windows PowerShell 运行 Invoke-Doctor.ps1 -RequireHdr 与 Start-Harness.ps1。"
