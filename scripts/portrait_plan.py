# ============================================================
# 竖屏分镜生成库（studio-portrait）：分镜用「原片秒」写，这里统一换算成成片秒 + 推导人物三态时间线 + 写 data/scene-plan.json
# 为什么抽出来：2026-09-07/08 三条片各自复制了一份 build-plan-portrait.py + srcmap.py，逻辑完全一样、只有场景表不同；
#   新会话找不到该复制哪份（2026-09-11 Scott 问「新开 session 还能达到剪辑效果吗」，这是三处缺口之一）。
# 用法（每个 job 只写内容文件 jobs/<slug>/data/scenes.py）：
#   import sys; sys.path.insert(0, "scripts"); from portrait_plan import PortraitPlan
#   p = PortraitPlan("jobs/<slug>", speed=1.1, canvas={"w":1080,"h":1920,"focusScale":1.0,"focusShift":330,"splitShift":440})
#   p.topic("topic-title", 2.3, 7.0, "OpenAI 的阳谋\n为什么偏偏演示三维建模")
#   p.panel("leo-panel", 19.8, 24.6, "x01-leo.mp4", "开场 hook", origin="third-party")
#   p.acc("score-accent", 40.6, 48.2, [(41.0, 44.4, "speaker-left", "代码写得多牛逼"), (44.7, 48.1, "speaker-right", "分数提高多少", "red")], "分数没感觉")
#   p.reminders("why3d", 28.6, 38.0, [("你不一定懂怎么做", 29.0), ("但你一定知道它难", 30.3, "accent")], "命题")
#   p.write(keywords=[...])
# 命令行查换算：python3 scripts/portrait_plan.py --job jobs/<slug> [--speed 1.1] 12.3 45.6
# 所有时间参数都是原片秒；f() 落在被删段里的点吸到最近保留段边界。
# ============================================================
import json
import os
import subprocess
import sys


class SrcMap:
    """原片秒 → 成片秒（按 EDL 累计 + 倍速）。"""

    def __init__(self, job, speed=1.1, total=None):
        self.job = job
        self.speed = speed
        self.edl = json.load(open(os.path.join(job, "data", "rough-cut-edl.json")))
        self.cum = []
        c = 0.0
        for s in self.edl:
            self.cum.append(c)
            c += s["sourceEnd"] - s["sourceStart"]
        self.total = total if total is not None else self._probe_total(c / speed)

    def _probe_total(self, fallback):
        aroll = os.path.join(self.job, "assets", "aroll.mp4")
        if os.path.exists(aroll):
            r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", aroll], capture_output=True, text=True)
            try:
                return round(float(r.stdout.strip()), 2)
            except ValueError:
                pass
        return round(fallback, 2)

    def f(self, tau):
        for i, s in enumerate(self.edl):
            if s["sourceStart"] - 0.001 <= tau <= s["sourceEnd"] + 0.001:
                return round((self.cum[i] + (tau - s["sourceStart"])) / self.speed, 2)
        best = min(self.edl, key=lambda s: min(abs(tau - s["sourceStart"]), abs(tau - s["sourceEnd"])))
        i = self.edl.index(best)
        edge = best["sourceStart"] if abs(tau - best["sourceStart"]) < abs(tau - best["sourceEnd"]) else best["sourceEnd"]
        return round((self.cum[i] + (edge - best["sourceStart"])) / self.speed, 2)


# ---- 人物三态推导参数（手册 §5-10 / spec）----
FOCUS_TYPES = {"reminders", "ladder", "compare", "leaderboard", "quote"}
FOCUS_LEAD = 1.1     # 下区板子出现前 1.1s 推近
SPLIT_LEAD = 0.6     # 第三方面板出现前 0.6s 上移
RETURN_LAG = 0.6     # 场景结束后 0.6s 回 full
MERGE_GAP = 1.3      # 两段同态间隔 <1.3s 合并；不同态则前者提前 0.7s 收
ACCENT_AFTER_FULL = 0.5   # 贴脸胶囊在回 full ≥0.5s 后出现
ACCENT_BEFORE_LEAVE = 0.6  # 胶囊在离开 full 前 ≥0.6s 收


def mode_of(sc):
    if sc["type"] in FOCUS_TYPES:
        return "focus"
    if sc["type"] == "title" and sc.get("layout") == "topic":
        return "focus"
    if sc["type"] in ("broll", "evidence"):
        return "split"
    return None


def derive_speaker(scenes, total):
    """从场景表推导 speaker 关键帧；返回 [{at, mode}]，并就地修正 accent 的 at/until。"""
    need = sorted([[sc["start"] - (SPLIT_LEAD if mode_of(sc) == "split" else FOCUS_LEAD), sc["end"], mode_of(sc)] for sc in scenes if mode_of(sc)])
    merged = []
    for a, b, m in need:
        if merged and a - merged[-1][1] < MERGE_GAP and merged[-1][2] == m:
            merged[-1][1] = max(merged[-1][1], b)
        elif merged and a - merged[-1][1] < MERGE_GAP:
            merged[-1][1] = a - 0.7
            merged.append([a, b, m])
        else:
            merged.append([a, b, m])
    kf = [{"at": 0, "mode": "full"}]
    for a, b, m in merged:
        at = round(max(0, a), 2)
        if at < 0.5:
            kf = [{"at": 0, "mode": m}]
        else:
            kf.append({"at": at, "mode": m})
        kf.append({"at": round(b + RETURN_LAG, 2), "mode": "full"})
    clean = []
    for k in kf:  # 去掉「回 full 后 <1.3s 又换态」的抖动
        if clean and k["at"] - clean[-1]["at"] < MERGE_GAP and clean[-1]["mode"] == "full" and len(clean) > 1:
            clean.pop()
        if clean and clean[-1]["at"] == k["at"]:
            clean.pop()
        clean.append(k)
    clean = [k for k in clean if k["at"] < total - 1.5]
    for sc in scenes:
        if sc["type"] != "accent":
            continue
        for it in sc["items"]:
            prev = [k for k in clean if k["at"] <= it["at"]]
            nxt = [k for k in clean if k["at"] > it["at"]]
            if prev and prev[-1]["mode"] == "full" and it["at"] - prev[-1]["at"] < ACCENT_AFTER_FULL:
                it["at"] = round(prev[-1]["at"] + ACCENT_AFTER_FULL, 2)
            if nxt and nxt[0]["mode"] != "full" and it["until"] > nxt[0]["at"] - ACCENT_BEFORE_LEAVE:
                it["until"] = round(max(it["at"] + 0.8, nxt[0]["at"] - ACCENT_BEFORE_LEAVE), 2)
    return clean


class PortraitPlan:
    def __init__(self, job, speed=1.1, canvas=None, total=None, objects="factory/objects/"):
        self.job = job.rstrip("/")
        self.slug = os.path.basename(self.job)
        self.map = SrcMap(self.job, speed, total)
        self.f = self.map.f
        self.total = self.map.total
        self.canvas = {"w": 1080, "h": 1920, **(canvas or {})}
        self.O = objects
        self.M = f"factory/{self.slug}/broll/"
        self.scenes = []

    # ---- 原语：dict 里的时间已是成片秒 ----
    def add(self, sc):
        if sc:
            self.scenes.append(sc)
        return sc

    def _tone(self, tup, i):
        return {"tone": tup[i]} if len(tup) > i and tup[i] else {}

    # ---- 场景写法：全部用原片秒 ----
    def topic(self, id, a, b, title, sub="创业思考", at=None, intent="开场主题"):
        return self.add({"id": id, "type": "title", "start": self.f(a), "end": self.f(b), "at": self.f(at if at is not None else a + 0.2), "title": title, "sub": sub, "layout": "topic", "intent": intent})

    def cta(self, id, a, title, sub, b=None, intent="收口"):
        return self.add({"id": id, "type": "title", "start": self.f(a), "end": self.f(b) if b is not None else self.total, "at": self.f(a + 0.5), "title": title, "sub": sub, "layout": "side", "intent": intent})

    def acc(self, id, a, b, items, intent):
        return self.add({"id": id, "type": "accent", "start": self.f(a), "end": self.f(b), "intent": intent, "items": [{"at": self.f(i[0]), "until": self.f(i[1]), "anchor": i[2], "text": i[3], **self._tone(i, 4)} for i in items]})

    def panel(self, id, a, b, media, intent, origin, caption=None):
        return self.add({"id": id, "type": "broll", "start": self.f(a), "end": self.f(b), "intent": intent, "media": self.M + media, "origin": origin, "layout": "panel", **({"caption": caption} if caption else {})})

    def reminders(self, id, a, b, items, intent):
        return self.add({"id": id, "type": "reminders", "start": self.f(a), "end": self.f(b), "intent": intent, "items": [{"text": i[0], "at": self.f(i[1]), **self._tone(i, 2)} for i in items]})

    def ladder(self, id, a, b, steps, intent, note=None):
        d = {"id": id, "type": "ladder", "start": self.f(a), "end": self.f(b), "intent": intent, "steps": [{"id": f"{id}-{j}", "label": s[0], "at": self.f(s[1]), "image": self.O + s[2], **self._tone(s, 3)} for j, s in enumerate(steps, 1)]}
        if note:
            d["note"] = {"text": note[0], "at": self.f(note[1]), "until": self.f(note[2]), **self._tone(note, 3)}
        return self.add(d)

    def compare(self, id, a, b, left, right, intent, verdict=None):
        side = lambda s: {"title": s[0], "at": self.f(s[1]), "lines": [{"text": l[0], "at": self.f(l[1]), **self._tone(l, 2)} for l in s[2]]}
        d = {"id": id, "type": "compare", "start": self.f(a), "end": self.f(b), "intent": intent, "left": side(left), "right": side(right)}
        if verdict:
            d["verdict"] = {"text": verdict[0], "at": self.f(verdict[1])}
        return self.add(d)

    def quote(self, id, a, b, text, intent, at=None, y=1070, w=800):
        return self.add({"id": id, "type": "quote", "start": self.f(a), "end": self.f(b), "at": self.f(at if at is not None else a + 0.3), "y": y, "w": w, "intent": intent, "text": text})

    # ---- 出 plan ----
    def build(self, keywords):
        speaker = derive_speaker(self.scenes, self.total)
        return {"schemaVersion": 1, "fps": 30, "duration": self.total, "skin": "studio", "canvas": dict(self.canvas), "source": {"media": "factory/aroll.mp4", "start": 0}, "keywords": list(keywords), "speaker": speaker, "scenes": sorted(self.scenes, key=lambda s: s["start"])}

    def write(self, keywords, out=None):
        plan = self.build(keywords)
        out = out or os.path.join(self.job, "data", "scene-plan.json")
        json.dump(plan, open(out, "w"), ensure_ascii=False, indent=2)
        print("speaker:", [(k["at"], k["mode"]) for k in plan["speaker"]])
        print("scenes", len(plan["scenes"]), "duration", plan["duration"], "→", out)
        return plan


if __name__ == "__main__":
    argv = sys.argv[1:]
    if "--job" not in argv:
        print(__doc__ or open(__file__).read().split("# ====", 2)[1])
        sys.exit(1)
    job = argv[argv.index("--job") + 1]
    speed = float(argv[argv.index("--speed") + 1]) if "--speed" in argv else 1.1
    m = SrcMap(job, speed)
    for a in argv:
        try:
            print(a, "→", m.f(float(a)))
        except ValueError:
            pass
    print("TOTAL", m.total)
