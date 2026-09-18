#!/bin/zsh
# ============================================================
# 舞台链路：绑定工作区 → 样片 → 独立审片 → 批准 → 成片。任一环节失败即停，不会带着旧状态往下跑。
# 用法：scripts/stage-chain.sh jobs/<slug> vN "批准备注（Scott 原话 + 授权）" [--proof-only]
# 为什么不复制 job 里的 chain.sh：2026-09-08 sed 复制改 J 没命中，样片失败后审片 / 批准 / 成片继续对着上一条已交付的 job 跑，差点覆盖 Downloads 成片。
#   这里 J 是必填位置参数、成片前打印目标文件夹现状；后台跑请 `nohup scripts/stage-chain.sh ... > jobs/<slug>/tmp/chain-vN.log 2>&1 &`
# ============================================================
set -o pipefail
cd "$(dirname "$0")/.."
J=${1:?用法：stage-chain.sh jobs/<slug> vN "备注" [--proof-only]}; V=${2:?缺版本号 vN}; NOTES=${3:?缺批准备注}
[[ -f $J/data/scene-plan-compiled.json ]] || { echo "✗ $J 未编译（先 node scripts/narrative-stage-plan.mjs --job $J）"; exit 1; }
echo "=== $J $V  $(date '+%H:%M:%S')"
NARRATIVE_JOB=$J node -e "import('./scripts/shotcraft-direct-port.mjs').then(m=>m.prepareInkPressWorkspace())" 2>&1 | tail -1
node scripts/stage-render.mjs --job $J --proof --version $V --concurrency 2 2>&1 | tail -4; rc=${pipestatus[1]}; echo "proof-exit=$rc"
[[ $rc -ne 0 ]] && { echo "✗ 样片失败，停"; exit 2; }
[[ "$4" == "--proof-only" ]] && { echo "样片完成（--proof-only）"; exit 0; }
node scripts/stage-review.mjs --job $J --version $V --reviewer ${STAGE_REVIEWER:-claude} 2>&1 | tail -6; rc=${pipestatus[1]}; echo "review-exit=$rc"
[[ $rc -ne 0 ]] && { echo "✗ 审片未过，停（看 $J/qa/review-$V.json）"; exit 3; }
node scripts/stage-approve.mjs --job $J --version $V --by "Scott（授权代审）" --notes "$NOTES" 2>&1 | tail -2 || exit 4
echo "--- 成片目标文件夹现状（成片会删同文件夹里旧 mp4）："; ls -1 ~/Downloads | grep -E "^$(date +%Y-%m-%d).*xiaolin$" || echo "（今天还没有交付文件夹）"
node scripts/stage-render.mjs --job $J --final --version $V --concurrency 3 2>&1 | tail -6; rc=${pipestatus[1]}; echo "final-exit=$rc"
exit $rc
