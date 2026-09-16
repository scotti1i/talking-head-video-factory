#!/usr/bin/env bash
# ============================================================
# Run-Heartbeat.sh —— Windows 计划任务每日调用的 WSL 入口
# 为什么：计划任务里的 wsl.exe 是非登录 shell，没有 nvm、没有 ~/.local/bin、
# 没有 env 文件里的变量；这里全部补齐后再 npm run heartbeat，
# 输出追加到 ~/.config/talking-head-factory/logs/heartbeat.log。
# 用法：bash deploy/windows/Run-Heartbeat.sh（Install-Scheduled-Task.ps1 注册）
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_DIR="${FACTORY_CONFIG_DIR:-$HOME/.config/talking-head-factory}"
LOG="$CONFIG_DIR/logs/heartbeat.log"
mkdir -p "$CONFIG_DIR/logs"

# 日志超过 1MB 只留末 2000 行
if [[ -f "$LOG" ]] && (( $(stat -c %s "$LOG" 2>/dev/null || echo 0) > 1048576 )); then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/bin:$PATH"
[[ -x /usr/local/cuda/bin/nvcc ]] && export PATH="/usr/local/cuda/bin:$PATH"

# env 文件逐行 export（不走 source：值里可能有 $ 或空格）
if [[ -f "$CONFIG_DIR/env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" == *=* ]] && export "${line?}"
  done < "$CONFIG_DIR/env"
fi

cd "$ROOT" || exit 1
{
  echo "=== $(date -Is) · $ROOT"
  npm run heartbeat
  echo "=== exit $?"
} >> "$LOG" 2>&1
