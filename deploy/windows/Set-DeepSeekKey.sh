#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/Set-EnvKey.sh" DEEPSEEK_API_KEY "DeepSeek API Key"
