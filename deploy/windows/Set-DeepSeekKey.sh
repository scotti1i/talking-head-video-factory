#!/usr/bin/env bash
# 只写 DEEPSEEK_API_KEY 一行；Set-EnvKey.sh 是合并语义，不会抹掉同文件里的
# FACTORY_ROLE / FACTORY_JOBS_ROOT。
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/Set-EnvKey.sh" DEEPSEEK_API_KEY "DeepSeek API Key"
