#!/usr/bin/env bash
set -euo pipefail

OUTBOX="${1:?缺少 WSL Outbox 路径}"
VERSION="${2:-0.1.1-rc.2}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:/usr/local/cuda/bin:$PATH"

export FACTORY_OUTBOX="$OUTBOX"
export NODE_OPTIONS="--max-old-space-size=6144"
if [[ -f "$HOME/.config/talking-head-factory/env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.config/talking-head-factory/env"
  set +a
fi

cd "$ROOT"
exec corepack pnpm dlx "@deepseek-ai/dsh@$VERSION" web --no-open
