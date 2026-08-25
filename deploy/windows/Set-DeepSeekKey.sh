#!/usr/bin/env bash
set -euo pipefail

target="$HOME/.config/talking-head-factory/env"
mkdir -p "$(dirname "$target")"
read -r -s -p "DeepSeek API Key: " factory_key
echo
if [[ -z "$factory_key" ]]; then
  echo "FAIL: Key 不能为空。" >&2
  exit 1
fi
umask 077
printf 'DEEPSEEK_API_KEY=%s\n' "$factory_key" > "$target"
unset factory_key
chmod 600 "$target"
echo "DeepSeek Key 已写入 WSL 私有配置；未写入仓库。"
