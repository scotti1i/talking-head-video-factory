#!/usr/bin/env bash
set -euo pipefail

target="$HOME/.config/talking-head-factory/env"
mkdir -p "$(dirname "$target")"
read -r -s -p "Gemini API Key: " factory_key
echo
if [[ -z "$factory_key" ]]; then
  echo "FAIL: Key 不能为空。" >&2
  exit 1
fi

umask 077
temp_file="$(mktemp "${target}.tmp.XXXXXX")"
trap 'rm -f "$temp_file"' EXIT
if [[ -f "$target" ]]; then
  grep -v '^GEMINI_API_KEY=' "$target" > "$temp_file" || true
fi
printf 'GEMINI_API_KEY=%s\n' "$factory_key" >> "$temp_file"
chmod 600 "$temp_file"
mv "$temp_file" "$target"
trap - EXIT
unset factory_key
echo "Gemini Key 已写入 WSL 私有配置；未写入仓库。"
