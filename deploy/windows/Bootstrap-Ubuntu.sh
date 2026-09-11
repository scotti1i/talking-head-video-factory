#!/usr/bin/env bash
# ============================================================
# Bootstrap-Ubuntu.sh —— 客户 WSL2 基础环境（CODEX-REINSTALL.md 的 Gate 2）
# 结尾打印 GATE 2 PASS；任何一步失败由 trap 打印 GATE 2 FAIL。
# 除装依赖外还做两件治理动作：写 FACTORY_ROLE=operator、装 git hooks。
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_ROOT="${FACTORY_DATA_ROOT:-/mnt/d/AutoEdit}"
MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin"
WHISPER_ROOT="$HOME/.local/src/whisper.cpp"
NVM_VERSION="v0.40.4"
CONFIG_DIR="$HOME/.config/talking-head-factory"
ENV_FILE="$CONFIG_DIR/env"

trap 'status=$?; if [[ $status -ne 0 ]]; then echo; echo "GATE 2 FAIL"; fi' EXIT

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
sudo apt-get install -y git ffmpeg cmake build-essential curl python3-fonttools ca-certificates

export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
nvm use 22

cd "$ROOT"
npm ci

mkdir -p "$HOME/.local/src" "$HOME/.local/bin" "$(dirname "$MODEL")"
if [[ ! -d "$WHISPER_ROOT/.git" ]]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$WHISPER_ROOT"
else
  git -C "$WHISPER_ROOT" pull --ff-only
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
    bash "$WHISPER_ROOT/models/download-ggml-model.sh" large-v3-turbo
    cp "$WHISPER_ROOT/models/ggml-large-v3-turbo.bin" "$MODEL"
  fi
fi

if ! grep -Fq '$HOME/.local/bin' "$HOME/.bashrc"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$DATA_ROOT/Inbox" "$DATA_ROOT/Outbox" "$CONFIG_DIR"
config="$ROOT/deploy/windows/factory.config.psd1"
if [[ ! -f "$config" ]]; then
  sed \
    -e "s#/home/factory/#/home/$USER/#g" \
    -e "s#/mnt/d/AutoEdit/Outbox#$DATA_ROOT/Outbox#g" \
    "$ROOT/deploy/windows/factory.config.example.psd1" > "$config"
fi

# 操作员角色 + git hook：客户机不改代码，只 update / request
umask 077
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if ! grep -q '^FACTORY_ROLE=' "$ENV_FILE"; then
  printf 'FACTORY_ROLE=operator\n' >> "$ENV_FILE"
fi
node "$ROOT/scripts/install-git-hooks.mjs"

npm run doctor:deployment
echo
echo "基础环境完成。"
echo "下一步：bash deploy/windows/Set-DeepSeekKey.sh，然后按 deploy/windows/CODEX-REINSTALL.md 的 Gate 3 迁移旧 job。"
echo "随后从 Windows PowerShell 运行 Invoke-Doctor.ps1 -RequireHdr 与 Start-Harness.ps1。"
echo
echo "GATE 2 PASS"
