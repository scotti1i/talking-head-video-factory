#!/bin/bash
# ============================================================
# A-roll 处理：粗剪 → 倍速（atempo 保音高）+ 轻磨皮 + 轻校色（暖光略压红）+ 降噪 + 响度 -13 LUFS → assets/aroll.mp4（30fps，bt709）
# 用法：scripts/treat-aroll.sh jobs/<slug> [speed=1.1] [input=assets/derived/roughcut.mp4]
# 然后：ffmpeg -i $J/assets/aroll.mp4 -ar 16000 -ac 1 $J/qa/aroll16k.wav && whisper-cli ... -ojf -of $J/qa/aroll-turbo
# 2026-09-11 从三条片的 data/tools/treat.sh 合并（参数完全相同）
# ============================================================
set -euo pipefail
J=${1:?用法：treat-aroll.sh jobs/<slug> [speed] [input]}
SPEED=${2:-1.1}
IN=${3:-assets/derived/roughcut.mp4}
[[ -f "$J/$IN" ]] || { echo "缺粗剪：$J/$IN（先 npm run roughcut:render -- --job $J --output $IN --width 1080 --height 1920）"; exit 1; }
ffmpeg -v error -y -i "$J/$IN" \
  -vf "setpts=PTS/${SPEED},smartblur=lr=0.6:ls=0.25:lt=10:cr=0.3:cs=0.08:ct=10,huesaturation=colors=r+m:saturation=-0.12:strength=1:lightness=1,eq=contrast=1.02:saturation=0.98,format=yuv420p" \
  -af "atempo=${SPEED},highpass=f=70,afftdn=nr=4:nf=-45:tn=1:gs=5,loudnorm=I=-13:LRA=7:TP=-1.2" \
  -r 30 -c:v libx264 -crf 18 -preset medium -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -map_metadata -1 "$J/assets/aroll.mp4"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=nw=1 "$J/assets/aroll.mp4"
