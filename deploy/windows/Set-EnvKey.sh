#!/usr/bin/env bash
# ============================================================
# 写入一条 API Key 到 WSL 私有 env 文件（合并语义，不覆盖其他 Key）
#   用法：bash deploy/windows/Set-EnvKey.sh <ENV_NAME> <提示文字>
#   由 Set-DeepSeekKey.sh / Set-GeminiKey.sh 调用；密钥不进仓库、不进日志。
# ============================================================
set -euo pipefail

key_name="${1:?用法: Set-EnvKey.sh <ENV_NAME> <提示文字>}"
prompt="${2:-$key_name}"
if [[ ! "$key_name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
  echo "FAIL: 环境变量名不合法: $key_name" >&2
  exit 1
fi

target="$HOME/.config/talking-head-factory/env"
mkdir -p "$(dirname "$target")"
read -r -s -p "$prompt: " factory_key
echo
if [[ -z "$factory_key" ]]; then
  echo "FAIL: Key 不能为空。" >&2
  exit 1
fi

umask 077
temp_file="$(mktemp "${target}.tmp.XXXXXX")"
trap 'rm -f "$temp_file"' EXIT
if [[ -f "$target" ]]; then
  grep -v "^${key_name}=" "$target" > "$temp_file" || true
fi
printf '%s=%s\n' "$key_name" "$factory_key" >> "$temp_file"
chmod 600 "$temp_file"
mv "$temp_file" "$target"
trap - EXIT
unset factory_key
echo "$key_name 已写入 WSL 私有配置；未写入仓库。"
