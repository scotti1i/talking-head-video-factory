#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:/usr/local/cuda/bin:$PATH"

if [[ -f "$HOME/.config/talking-head-factory/env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.config/talking-head-factory/env"
  set +a
fi

cd "$ROOT"
npm run doctor:deployment -- --production "$@"
