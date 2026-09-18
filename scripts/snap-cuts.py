# ============================================================
# 切点吸附：把 EDL 每个 in/out 点挪到源音频邻近的能量谷（车内底噪高，silencedetect -38dB 找不到静音，
# 改用相对能量：10ms RMS 包络，窗口内取最低点）。出点只允许向后找谷（词尾之后的停顿），入点只允许向前找谷（词首之前）。
# 用法：python3 scripts/snap-cuts.py data/rough-cut-edl.json qa/source16k.wav → 覆写 EDL，打印每个切点位移
# ============================================================
import json, sys, wave, numpy as np
edl_path, wav_path = sys.argv[1], sys.argv[2]
w = wave.open(wav_path); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
hop = int(sr * 0.010); n = len(x) // hop
rms = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
rms = np.convolve(rms, np.ones(3) / 3, mode="same")  # 30ms 平滑
def trough(t0, t1):
    a, b = max(0, int(t0 / 0.010)), min(n - 1, int(t1 / 0.010))
    i = a + int(np.argmin(rms[a:b + 1])); return round(i * 0.010, 3), float(rms[i])
edl = json.load(open(edl_path)); total = 0
# 源里本来连续的两段（上段 end == 下段 start）之间不是切点：两边都不吸，否则各吸一次会重叠重放半个字（2026-09-07 独立复核抓到 6 处）
contiguous_start = {i for i in range(1, len(edl)) if abs(edl[i]["sourceStart"] - edl[i - 1]["sourceEnd"]) < 0.02}
contiguous_end = {i - 1 for i in contiguous_start}
for idx, seg in enumerate(edl):
    s, e = seg["sourceStart"], seg["sourceEnd"]
    ns, rs = (s, 0) if (s <= 0 or idx in contiguous_start) else trough(s - 0.20, s + 0.03)
    ne, re_ = (e, 0) if idx in contiguous_end else trough(e - 0.03, e + 0.20)
    print(f'{seg["takeId"]:22s} in {s:7.2f}→{ns:7.2f} ({ns-s:+.2f}, rms {rs:.4f})   out {e:7.2f}→{ne:7.2f} ({ne-e:+.2f}, rms {re_:.4f})')
    seg["sourceStart"], seg["sourceEnd"] = ns, ne; total += (ne - ns) - (e - s)
# 兜底：吸附后相邻段仍重叠 → 退回中点
for i in range(1, len(edl)):
    if edl[i]["sourceStart"] < edl[i - 1]["sourceEnd"]:
        mid = round((edl[i]["sourceStart"] + edl[i - 1]["sourceEnd"]) / 2, 3); edl[i]["sourceStart"] = edl[i - 1]["sourceEnd"] = mid
json.dump(edl, open(edl_path, "w"), ensure_ascii=False, indent=2)
print("总时长变化 %+.2fs" % total)
