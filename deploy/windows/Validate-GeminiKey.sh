#!/usr/bin/env bash
set -euo pipefail

target="$HOME/.config/talking-head-factory/env"
if [[ ! -f "$target" ]]; then
  echo "configured=no"
  exit 1
fi

# shellcheck source=/dev/null
source "$target"
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "configured=no"
  exit 1
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
http_status="$(curl -sS --noproxy '*' --connect-timeout 15 --max-time 30 \
  -o "$response_file" \
  -w '%{http_code}' \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  'https://generativelanguage.googleapis.com/v1beta/models')"
api_status="$(grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]+"' "$response_file" \
  | head -1 \
  | sed -E 's/.*"([^"]+)"$/\1/' || true)"

case "$GEMINI_API_KEY" in
  AIza*) plausible_prefix=yes ;;
  *) plausible_prefix=no ;;
esac

printf 'configured=yes\n'
printf 'file_mode=%s\n' "$(stat -c %a "$target")"
printf 'key_length=%s\n' "${#GEMINI_API_KEY}"
printf 'key_prefix_plausible=%s\n' "$plausible_prefix"
printf 'http_status=%s\n' "$http_status"
printf 'api_status=%s\n' "${api_status:-OK}"
if [[ "$http_status" == 200 ]]; then
  echo 'valid=yes'
else
  echo 'valid=no'
  exit 2
fi
