#!/bin/bash
# ============================================================
# 在 Linux 对齐容器里跑：npm test + smoke + 叙事舞台静帧（与学员 WSL 环境同 apt ffmpeg / 字体 / Node 22）
# 用法：deploy/linux-parity/run.sh [--rebuild] [--build-only] [--shell]
#   发版前必跑；lockfile / Dockerfile 变化自动重建镜像；--shell 进容器排查；--build-only 只建镜像
#   产物：deploy/linux-parity/out/（run.log、stills-linux/*.png、smoke 的 index.html），不进 git
# 环境变量：
#   FACTORY_PARITY_PROXY   构建期代理（默认 http://host.docker.internal:1082；设为空串 = 直连）
#   PARITY_STILL_TIMES     静帧取点秒数（默认 2,12,30,60,100,150；amd64 模拟下每张约十几秒，别用 --auto 的 48 张）
# 出处：v2 分支的 run.sh 改跑叙事舞台线（2026-09-18）
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="thvf-narrative-linux-parity"
STAMP="$ROOT/deploy/linux-parity/.lock-sha"
OUT="$ROOT/deploy/linux-parity/out"
want="$(shasum -a 256 "$ROOT/package-lock.json" "$ROOT/vendor/video-shotcraft/ink-press/package-lock.json" "$ROOT/deploy/linux-parity/Dockerfile" | shasum -a 256 | cut -c1-16)"
have="$(cat "$STAMP" 2>/dev/null || true)"

if [[ "${1:-}" == "--rebuild" || "$want" != "$have" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "== build ${IMAGE}（lockfile / Dockerfile 变化或镜像不存在）"
  # Docker Desktop 会把宿主系统代理 127.0.0.1:1082 原样注入容器，容器里那是它自己；TUN 直连又会中途掉线。
  # 显式走 host.docker.internal:1082（Docker Desktop 转发到宿主 loopback）。不通就 FACTORY_PARITY_PROXY= 直连。
  PROXY="${FACTORY_PARITY_PROXY-http://host.docker.internal:1082}"
  proxy_args=()
  if [[ -n "$PROXY" ]]; then
    proxy_args=(--build-arg HTTP_PROXY="$PROXY" --build-arg HTTPS_PROXY="$PROXY" --build-arg http_proxy="$PROXY" --build-arg https_proxy="$PROXY" --build-arg NO_PROXY=localhost,127.0.0.1)
  fi
  # 学员机与 CI 都是 x86_64；Apple 芯片上默认会建 arm64 镜像，而 chrome-headless-shell 没有 Linux ARM64 版
  docker build --platform linux/amd64 "${proxy_args[@]}" \
    -t "$IMAGE" -f "$ROOT/deploy/linux-parity/Dockerfile" "$ROOT"
  echo "$want" > "$STAMP"
  [[ "${1:-}" == "--rebuild" ]] && shift || true
fi
[[ "${1:-}" == "--build-only" ]] && { echo "镜像已就绪：$IMAGE"; exit 0; }

mkdir -p "$OUT"
# 容器内公共前置：源码拷到 /work（挂载是只读的，smoke / 静帧要写盘），两处 node_modules 软链镜像里烘好的
# 宿主的 node_modules（arm64 二进制）与 renders/（本机 Remotion 工作区，可能正在被别的进程写）不带进容器
PRELUDE='
  tar -C /src --exclude=./node_modules --exclude=./renders --exclude=./deploy/linux-parity/out -cf - . | tar -C /work -xf -
  ln -s /deps/node_modules /work/node_modules && cd /work
  git config --global --add safe.directory /work >/dev/null 2>&1 || true
'
if [[ "${1:-}" == "--shell" ]]; then
  exec docker run --rm -it --platform linux/amd64 -e HTTP_PROXY= -e HTTPS_PROXY= -e http_proxy= -e https_proxy= \
    -v "$ROOT":/src:ro -v "$OUT":/out "$IMAGE" bash -c "$PRELUDE exec bash"
fi

docker run --rm --platform linux/amd64 -e HTTP_PROXY= -e HTTPS_PROXY= -e http_proxy= -e https_proxy= \
  -e PARITY_STILL_TIMES="${PARITY_STILL_TIMES:-2,12,30,60,100,150}" \
  -v "$ROOT":/src:ro -v "$OUT":/out "$IMAGE" bash -c "$PRELUDE"'
  set -uo pipefail
  fail=0
  step() { echo; echo "== $*"; }
  step "环境"; uname -m; node --version; ffmpeg -version | head -1; fc-list :lang=zh | wc -l | sed "s/^/CJK 字体条目: /"
  step "doctor（信息，不计入结果）"; npm run -s doctor || true

  step "npm test"
  if npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖|not ok" ; then :; fi
  if npm test >/tmp/npm-test.log 2>&1; then echo "npm test: PASS"; else echo "npm test: FAIL（见 /out/npm-test.log）"; fail=1; fi
  cp /tmp/npm-test.log /out/

  step "smoke（hyperframes lint / validate / inspect）"
  if npm run -s smoke > /tmp/smoke.log 2>&1; then echo "smoke: PASS"; tail -5 /tmp/smoke.log; else echo "smoke: FAIL（见 /out/smoke.log）"; tail -20 /tmp/smoke.log; fail=1; fi
  cp /tmp/smoke.log /out/; cp jobs/smoke/index.html /out/smoke-index.html 2>/dev/null || true
  grep -c -i "pingfang\|hiragino\|courier\|sf mono\|arial" jobs/smoke/index.html 2>/dev/null | sed "s/^/smoke HTML 系统字体命中: /" || true

  step "叙事舞台静帧：jobs/stage-catalog-20260903（型录 job 没有 A-roll，用 ffmpeg 合成的纯色测试 A-roll 顶位，只验渲染链不验画面）"
  JOB=jobs/stage-catalog-20260903
  mkdir -p $JOB/assets
  ffmpeg -loglevel error -y -f lavfi -i "color=c=0x223344:s=1920x1080:r=30:d=186" -f lavfi -i "anullsrc=r=48000:cl=stereo" -shortest -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac $JOB/assets/aroll.mp4 \
    && echo "合成 A-roll: $(ffprobe -v error -show_entries format=duration -of csv=p=0 $JOB/assets/aroll.mp4)s"
  # 型录 job 的 CLI 结构门禁（手册 §4「连续 70s 无视觉休息」）在 Mac 上同样不过——那是型录内容不是 Linux 差异，这一步只记录不计入结果；
  # 工作区准备与静帧走的是 compilePlan（含布局几何门禁），照常计入
  if ALLOW_MISSING_MEDIA=1 node scripts/narrative-stage-plan.mjs --job $JOB > /tmp/stage-plan.log 2>&1; then echo "narrative-stage-plan: PASS"; else echo "narrative-stage-plan: FAIL（信息，不计入；与 Mac 对照）"; grep -E "^- |^Error" /tmp/stage-plan.log | head -5; fi
  cp /tmp/stage-plan.log /out/
  # 型录 job 的 B-roll / 证据图也不在仓库里，compilePlan 的素材检查同样要放行
  if ALLOW_MISSING_MEDIA=1 NARRATIVE_JOB=$JOB node -e "import(\"./scripts/shotcraft-direct-port.mjs\").then(m=>m.prepareInkPressWorkspace())" > /tmp/stage-prepare.log 2>&1; then echo "prepareInkPressWorkspace: PASS"; else echo "prepareInkPressWorkspace: FAIL"; tail -20 /tmp/stage-prepare.log; fail=1; fi
  cp /tmp/stage-prepare.log /out/
  rm -rf renders/work-shotcraft/ink-press/node_modules && ln -s /deps/ink-press/node_modules renders/work-shotcraft/ink-press/node_modules
  if ALLOW_MISSING_MEDIA=1 NARRATIVE_JOB=$JOB node scripts/stage-stills.mjs --job $JOB --times "$PARITY_STILL_TIMES" --out qa/stills-linux > /tmp/stage-stills.log 2>&1; then
    echo "stage-stills: PASS"; tail -3 /tmp/stage-stills.log
    rm -rf /out/stills-linux; cp -r $JOB/qa/stills-linux /out/stills-linux; ls /out/stills-linux
  else
    echo "stage-stills: FAIL（见 /out/stage-stills.log）"; tail -30 /tmp/stage-stills.log; fail=1
  fi
  cp /tmp/stage-stills.log /out/

  echo
  if [[ $fail -eq 0 ]]; then echo "LINUX PARITY PASS"; else echo "LINUX PARITY FAIL"; fi
  exit $fail
' 2>&1 | tee "$OUT/run.log"
exit "${PIPESTATUS[0]}"
