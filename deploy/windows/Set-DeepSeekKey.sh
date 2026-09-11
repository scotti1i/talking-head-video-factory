#!/usr/bin/env bash
# ============================================================
# Set-DeepSeekKey.sh —— 把 DeepSeek Key 写进 WSL 私有 env 文件
# 只替换 DEEPSEEK_API_KEY 一行；同文件里的 FACTORY_ROLE / FACTORY_JOBS_ROOT
# 必须保留（v1 版整文件覆盖会把操作员角色和 jobs 根目录一起抹掉）。
# ============================================================
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
tmp="$(mktemp "${target}.XXXXXX")"
if [[ -f "$target" ]]; then
  grep -v '^DEEPSEEK_API_KEY=' "$target" > "$tmp" || true
fi
printf 'DEEPSEEK_API_KEY=%s\n' "$factory_key" >> "$tmp"
mv "$tmp" "$target"
unset factory_key
chmod 600 "$target"
echo "DeepSeek Key 已写入 WSL 私有配置；未写入仓库。"
