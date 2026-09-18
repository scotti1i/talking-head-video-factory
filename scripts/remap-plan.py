# ============================================================
# 分镜时间重映射：EDL 切点挪动后，把 scene-plan.json 里所有时间字段从旧成片时间轴映射到新成片时间轴。
# 映射按取段分段线性：t_old → 源时码 τ → 新成片时间。速度因子 speed（treat-short.sh 的倍速）。
# 用法：python3 scripts/remap-plan.py <old-edl.json> <new-edl.json> <scene-plan.json> <speed>
# ============================================================
import json, sys
old_edl, new_edl, plan_path, speed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
old = json.load(open(old_edl)); new = json.load(open(new_edl)); assert len(old) == len(new)
def cum(edl):
    out, c = [], 0.0
    for s in edl: out.append(c); c += s["sourceEnd"] - s["sourceStart"]
    return out
oc, nc = cum(old), cum(new)
def f(t):
    src = t * speed
    for i in range(len(old)):
        if i == len(old) - 1 or src < oc[i + 1]:
            tau = old[i]["sourceStart"] + (src - oc[i])
            return round((nc[i] + (tau - new[i]["sourceStart"])) / speed, 2)
KEYS = {"at", "until", "start", "end", "convergeAt", "eraseAt", "demoteAt"}
PAIRS = {"highlight", "dim"}
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in KEYS and isinstance(v, (int, float)): o[k] = f(v)
            elif k in PAIRS and isinstance(v, list): o[k] = [[f(a), f(b)] for a, b in v]
            else: walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
p = json.load(open(plan_path)); walk(p)
json.dump(p, open(plan_path, "w"), ensure_ascii=False, indent=2)
print("重映射完成，最后一场 end =", max(s["end"] for s in p["scenes"]), "示例 f(30)=", f(30), "f(90)=", f(90))
