#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/Set-EnvKey.sh" GEMINI_API_KEY "Gemini API Key"
