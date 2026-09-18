# ============================================================
# 字幕：从成片 A-roll 的 whisper -ojf 转录（qa/aroll-turbo.json）建 data/captions.json
#   术语统一（scripts/caption-terms.json + job 私有 data/caption-terms.json）→ 合并孤字 → 超长行按标点 / 中点二分（≤18 字宽，英文算 0.55）
# 用法：python3 scripts/captions-from-turbo.py --job jobs/<slug> [--max-len 18] [--merge-len 26] [--quiet]
# 前置：ffmpeg -i assets/aroll.mp4 -ar 16000 -ac 1 qa/aroll16k.wav && whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin -l zh -f qa/aroll16k.wav -ojf -of qa/aroll-turbo -np
# 2026-09-11 从三条片的 data/tools/captions-from-turbo.py + shorts build.py 的二分逻辑合并而来
# ============================================================
import json, os, re, sys

argv = sys.argv[1:]
if "--job" not in argv:
    sys.exit("用法：--job jobs/<slug> [--max-len 18] [--merge-len 26]")
J = argv[argv.index("--job") + 1].rstrip("/")
MAX = float(argv[argv.index("--max-len") + 1]) if "--max-len" in argv else 18
MERGE = int(argv[argv.index("--merge-len") + 1]) if "--merge-len" in argv else 26
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

terms = json.load(open(os.path.join(ROOT, "scripts", "caption-terms.json")))["terms"]
local = os.path.join(J, "data", "caption-terms.json")
if os.path.exists(local):
    terms = terms + json.load(open(local))["terms"]

raw = open(os.path.join(J, "qa", "aroll-turbo.json"), "rb").read().decode("utf-8", "surrogateescape")
segs = json.loads(raw)["transcription"]
t = lambda s: int(s[3:5]) * 60 + int(s[6:8]) + int(s[9:12]) / 1000
L = lambda s: sum(0.55 if ord(ch) < 128 else 1 for ch in s)

rows = []
for s in segs:
    txt = s["text"].strip()
    for a, b in terms:
        txt = re.sub(a, b, txt)
    if not txt:
        continue
    a, b = t(s["timestamps"]["from"]), t(s["timestamps"]["to"])
    if rows and (len(txt) <= 2 or b - a < 0.6) and len(rows[-1]["t"]) + len(txt) <= MERGE:
        rows[-1]["t"] += txt
        rows[-1]["e"] = b
        continue
    rows.append({"s": round(a, 2), "e": round(b, 2), "t": txt})

out = []
for r in rows:
    txt = r["t"]
    if MAX <= 0 or L(txt) <= MAX:
        out.append(r)
        continue
    cands = [m.end() for m in re.finditer(r"[,，、 ]", txt)]
    mid = len(txt) / 2
    cut = min(cands, key=lambda i: abs(i - mid)) if cands else int(mid)
    if not cands or abs(cut - mid) > len(txt) * 0.3:
        cut = int(mid)
    a, b = txt[:cut].rstrip(",，、 "), txt[cut:].lstrip(",，、 ")
    if not a or not b:
        out.append(r)
        continue
    d = r["e"] - r["s"]
    k = len(a) / (len(a) + len(b))
    out.append({"s": r["s"], "e": round(r["s"] + d * k, 2), "t": a})
    out.append({"s": round(r["s"] + d * k, 2), "e": r["e"], "t": b})

json.dump(out, open(os.path.join(J, "data", "captions.json"), "w"), ensure_ascii=False, indent=2)
print(len(out), "rows → data/captions.json")
if "--quiet" not in argv:
    for r in out:
        print(f"{r['s']:7.2f} {r['t']}")
