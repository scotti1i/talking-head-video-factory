#!/bin/bash
# ============================================================
# 在 Linux 对齐容器里跑：全量单元测试 + smoke（与客户 WSL 环境同 apt ffmpeg / 字体 / Node 22）
# 用法：deploy/linux-parity/run.sh [--rebuild] [--shell]
#   打 tag 前必跑；lockfile 变化自动重建镜像；--shell 进容器排查
# 出处：2026-09-16 v2.0.2 字体 lint bug 只在 Linux 上出现
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="thvf-linux-parity"
STAMP="$ROOT/deploy/linux-parity/.lock-sha"
want="$(shasum -a 256 "$ROOT/package-lock.json" "$ROOT/deploy/linux-parity/Dockerfile" | shasum -a 256 | cut -c1-16)"
have="$(cat "$STAMP" 2>/dev/null || true)"

if [[ "${1:-}" == "--rebuild" || "$want" != "$have" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "== build ${IMAGE}（lockfile / Dockerfile 变化或镜像不存在）"
  # Docker Desktop 会把宿主系统代理 127.0.0.1:1082 原样注入容器，容器里那是它自己；TUN 直连又会中途掉线。
  # 改成显式走 host.docker.internal:1082（Docker Desktop 把它转发到宿主 loopback），2026-09-16 实测 apt 与 curl 都通。
  PROXY="${FACTORY_PARITY_PROXY:-http://host.docker.internal:1082}"
  # 客户机与 CI 都是 x86_64；Apple 芯片上默认会建 arm64 镜像，而 chrome-headless-shell 没有 Linux ARM64 版（2026-09-16 踩到）
  docker build --platform linux/amd64 --build-arg HTTP_PROXY="$PROXY" --build-arg HTTPS_PROXY="$PROXY" --build-arg http_proxy="$PROXY" --build-arg https_proxy="$PROXY" --build-arg NO_PROXY=localhost,127.0.0.1 \
    -t "$IMAGE" -f "$ROOT/deploy/linux-parity/Dockerfile" "$ROOT"
  echo "$want" > "$STAMP"
  [[ "${1:-}" == "--rebuild" ]] && shift || true
fi

if [[ "${1:-}" == "--shell" ]]; then
  exec docker run --rm -it --platform linux/amd64 -e HTTP_PROXY= -e HTTPS_PROXY= -e http_proxy= -e https_proxy= -v "$ROOT":/src:ro "$IMAGE" bash -c 'cp -r /src/. /work && rm -rf /work/node_modules && ln -s /deps/node_modules /work/node_modules && cd /work && exec bash'
fi

docker run --rm --platform linux/amd64 -e HTTP_PROXY= -e HTTPS_PROXY= -e http_proxy= -e https_proxy= -v "$ROOT":/src:ro "$IMAGE" bash -c '
  set -euo pipefail
  cp -r /src/. /work && rm -rf /work/node_modules && ln -s /deps/node_modules /work/node_modules && cd /work
  git config --global --add safe.directory /work || true
  echo "== 环境"; node --version; ffmpeg -version | head -1; fc-list | grep -ci "noto sans cjk" | sed "s/^/Noto CJK faces: /"
  echo "== 单元测试"
  node --test scripts/*.test.mjs scripts/timeline/*.test.mjs console/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" || true
  node --test scripts/*.test.mjs scripts/timeline/*.test.mjs console/*.test.mjs >/dev/null 2>&1 || { echo "✗ 单元测试失败"; exit 1; }
  echo "== smoke"
  export FACTORY_JOBS_ROOT=/tmp/jobs; mkdir -p "$FACTORY_JOBS_ROOT"
  npm run -s smoke 2>&1 | tail -12
  echo "== 生成 HTML 系统字体扫描"
  grep -c -i "pingfang\|hiragino\|courier\|sf mono\|arial" /tmp/jobs/smoke/index.html | sed "s/^/系统字体命中: /"
  echo "LINUX PARITY PASS"
'
