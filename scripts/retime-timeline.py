#!/usr/bin/env python3
"""按成片 A-roll 的 large-v3-turbo 分段时间，重新对时字幕 / 词级时间戳 / 分镜所有时间点。
原因（2026-09-03）：旧时间线来自原始 take 的 base 模型 + EDL 映射，14–30s 一带比真实语音早 0.5–1.3s。
做法：字幕行 ↔ turbo 分段按文本相似度配对得到控制点 (旧 s → 新 from)，分段线性映射整个时间轴。"""
import json, re, shutil, difflib, sys
J=sys.argv[1].rstrip('/') if len(sys.argv)>1 and not sys.argv[1].startswith('--') else None
assert J, '用法: python3 scripts/retime-timeline.py jobs/<slug> [--dry]  （需先有 qa/aroll-turbo.json：whisper-cli -m ggml-large-v3-turbo.bin -l zh -f qa/aroll16k.wav -oj -of qa/aroll-turbo）'
def t(s):
    h,m,rest=s.split(':'); return int(h)*3600+int(m)*60+float(rest.replace(',','.'))
norm=lambda x: re.sub(r'[，。、！？,.!?\s「」]','',x).lower()
turbo=[(t(x['timestamps']['from']), t(x['timestamps']['to']), norm(x['text'])) for x in json.load(open(f'{J}/qa/aroll-turbo.json'))['transcription'] if norm(x['text'])]
caps=json.load(open(f'{J}/data/captions.json'))
words=json.load(open(f'{J}/data/words-timeline.json'))
plan=json.load(open(f'{J}/data/scene-plan.json'))
duration=plan['duration']
# ---- 控制点：每条字幕在 ±3s 内找文本最像的 turbo 分段 ----
ctrl=[(0.0,0.0)]
j0=0
for c in caps:
    best=None
    for j in range(j0, len(turbo)):
        f,to,tx=turbo[j]
        if f>c['s']+3.5: break
        if to<c['s']-3.5: continue
        r=difflib.SequenceMatcher(None, norm(c['t']), tx).ratio()
        # 字幕行可能是分段的前半/后半：也比较前 4 字
        head = 1.0 if norm(c['t'])[:4] and tx.startswith(norm(c['t'])[:4]) else 0
        score=max(r, head*0.95)
        if score>=0.6 and (best is None or score>best[0]): best=(score,j,f)
    if best:
        j0=best[1]
        if best[2]>ctrl[-1][1] and c['s']>ctrl[-1][0]: ctrl.append((c['s'],best[2]))
# 离群控制点剔除：与相邻 ±2 个点的偏移中位数差超过 0.7s 视为误配（短句 / 英文名易错配）
import statistics
inner=ctrl[1:]
keep=[]
for i,(a_,b_) in enumerate(inner):
    nb=[inner[k][1]-inner[k][0] for k in range(max(0,i-2),min(len(inner),i+3)) if k!=i]
    med=statistics.median(nb) if nb else 0
    if abs((b_-a_)-med)<=0.7: keep.append((a_,b_))
    else: print(f'  剔除误配控制点 {a_:.2f}s（偏移 {b_-a_:+.2f}s，邻域 {med:+.2f}s）')
ctrl=[ctrl[0]]+keep
ctrl.append((duration,duration))
def fmap(x):
    for (a0,b0),(a1,b1) in zip(ctrl,ctrl[1:]):
        if x<=a1: return b0+(x-a0)*(b1-b0)/(a1-a0) if a1>a0 else b0
    return x
shifts=[(a,b-a) for a,b in ctrl[1:-1]]
print(f'控制点 {len(ctrl)}；偏移 最小 {min(s for _,s in shifts):+.2f}s 最大 {max(s for _,s in shifts):+.2f}s')
for a,s in shifts:
    if abs(s)>0.35: print(f'  {a:7.2f}s  {s:+.2f}s')
if '--dry' in sys.argv: sys.exit()
for f in ('captions.json','words-timeline.json','scene-plan.json'): shutil.copy(f'{J}/data/{f}', f'{J}/data/{f}.pre-retime.bak')
r=lambda v: round(v,2)
for c in caps: c['s'],c['e']=r(fmap(c['s'])),r(fmap(c['e']))
for w in words['words']: w['s'],w['e']=r(fmap(w['s'])),r(fmap(w['e']))
TIME=re.compile(r'^(at|until|start|end|.*At)$'); WIN={'highlight','dim'}
def walk(v,key=None):
    if isinstance(v,list):
        if key in WIN: return [[r(fmap(a)),r(fmap(b))] for a,b in v]
        return [walk(x,key) for x in v]
    if isinstance(v,dict): return {k:walk(x,k) for k,x in v.items()}
    if isinstance(v,(int,float)) and key and TIME.match(key) and key not in ('mediaStart',): return r(fmap(v))
    return v
plan['scenes']=[walk(s) for s in plan['scenes']]
plan['speaker']=[{**k,'at':r(fmap(k['at']))} for k in plan['speaker']]
plan['source']['start']=0
json.dump(caps,open(f'{J}/data/captions.json','w'),ensure_ascii=False,indent=2)
json.dump(words,open(f'{J}/data/words-timeline.json','w'),ensure_ascii=False,indent=2)
json.dump(plan,open(f'{J}/data/scene-plan.json','w'),ensure_ascii=False,indent=2)
print('retimed: captions / words / plan（备份 *.pre-retime.bak）')
