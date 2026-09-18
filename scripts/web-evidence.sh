#!/bin/bash
# 真实网页证据抓取：用 Remotion 自带的 Chrome Headless Shell 整页截图（无需额外依赖）
# 用法：scripts/web-evidence.sh <url> <out.png> [width=1440] [height=1600]
# 出处：2026-09-03 Scott review——真实信息（截图/录屏/网页）太少，片子没有真实感
set -euo pipefail
URL="$1"; OUT="$2"; W="${3:-1440}"; H="${4:-1600}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Remotion 内置 Chrome 在工作区重建时可能被清掉（2026-09-06 Codex 重建后就没了），退到系统 Chrome
CHROME="$(ls -d "$ROOT"/renders/work-shotcraft/ink-press/node_modules/.remotion/chrome-headless-shell/mac-arm64/*/chrome-headless-shell 2>/dev/null | head -1)"
[ -x "$CHROME" ] || CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "找不到 Chrome：Remotion 内置的没了，系统 Chrome 也没有" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox --lang=en-US \
  --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" \
  --window-size="${W},${H}" --virtual-time-budget=8000 --timeout=30000 \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1
python3 -c "from PIL import Image;im=Image.open('$OUT');print('$OUT',im.size)"
