#!/usr/bin/env python3
"""时间线单源：从成片 A-roll 的 whisper 转录（large-v3-turbo，-ojf token 级时间）生成
   data/captions.json（沿用既有字幕文本，按 token 重新对时）和 data/words-timeline.json（字级 + ASCII 词）。

用法：
  ffmpeg -i jobs/<slug>/assets/aroll.mp4 -ar 16000 -ac 1 jobs/<slug>/qa/aroll16k.wav
  whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin -l zh -f jobs/<slug>/qa/aroll16k.wav -ojf -of jobs/<slug>/qa/aroll-turbo
  python3 scripts/timeline-from-aroll.py jobs/<slug> [--dry]

出处：2026-09-03——旧时间线（原始 take 的 base 模型 + 剪辑表映射）比真实语音早 0.5–1.3s，Scott 一眼看出；
      成片音轨只转一次，字幕和词表从同一来源出，不再有两套时间。"""
import json, re, sys, shutil, difflib, statistics

job = next((a for a in sys.argv[1:] if not a.startswith('--')), None)
assert job, '用法: python3 scripts/timeline-from-aroll.py jobs/<slug> [--dry]'
job = job.rstrip('/')
DRY = '--dry' in sys.argv

# ---- 1. 读 whisper token（-ojf 里 CJK 子词是残缺 UTF-8 字节，按字节拼回） ----
raw = open(f'{job}/qa/aroll-turbo.json', 'rb').read().decode('utf-8', 'surrogateescape')
segs = json.loads(raw)['transcription']
chars = []  # [{c, s, e}] 逐字符（ASCII 保留为独立字符，稍后合并成词）
for seg in segs:
    buf = b''; t0 = None
    for tok in seg.get('tokens', []):
        text = tok['text'].encode('utf-8', 'surrogateescape')
        if text.startswith(b'[_') and text.endswith(b']'):
            continue
        s, e = tok['offsets']['from'] / 1000, tok['offsets']['to'] / 1000
        buf += text
        if t0 is None: t0 = s
        try:
            piece = buf.decode('utf-8')
        except UnicodeDecodeError:
            continue  # 还没拼成完整字符，继续累积
        cs = [c for c in piece]
        # 多字符 token 在其时间段内线性摊开
        n = len(cs)
        for i, c in enumerate(cs):
            chars.append({'c': c, 's': round(t0 + (e - t0) * i / n, 3), 'e': round(t0 + (e - t0) * (i + 1) / n, 3)})
        buf = b''; t0 = None

# ---- 2. 字级序列 → 词表（ASCII 连续字符合并，CJK 单字） ----
words = []
for ch in chars:
    c = ch['c']
    if c.isspace(): continue
    if re.match(r'[A-Za-z0-9]', c) and words and re.match(r'[A-Za-z0-9]+$', words[-1]['t']) and ch['s'] - words[-1]['e'] < 0.25:
        words[-1]['t'] += c; words[-1]['e'] = ch['e']
    else:
        words.append({'t': c, 's': ch['s'], 'e': ch['e']})

# ---- 3. 既有字幕文本按字符对齐到 token 时间（difflib 逐字符） ----
norm = lambda x: re.sub(r'[\s，。、！？,.!?「」（）()：:；;"“”]', '', x).lower()
stream = [(ch['c'].lower(), ch['s'], ch['e']) for ch in chars if norm(ch['c'])]
stream_txt = ''.join(c for c, _, _ in stream)
caps = json.load(open(f'{job}/data/captions.json'))
cap_txt = ''.join(norm(c['t']) for c in caps)
sm = difflib.SequenceMatcher(None, cap_txt, stream_txt, autojunk=False)
map_idx = {}  # 字幕字符序号 → 流字符序号
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        for k in range(i2 - i1): map_idx[i1 + k] = j1 + k
pos = 0; old = []; new_caps = []
for c in caps:
    n = len(norm(c['t']))
    idx = [map_idx[k] for k in range(pos, pos + n) if k in map_idx]
    pos += n
    if idx:
        s = stream[min(idx)][1]; e = stream[max(idx)][2]
        new_caps.append({'s': round(s, 2), 'e': round(e, 2), 't': c['t'], '_matched': len(idx) / max(1, n)})
    else:
        new_caps.append({'s': None, 'e': None, 't': c['t'], '_matched': 0})
    old.append((c['s'], c['e']))
# 未对上的行：在邻居之间插值
for i, c in enumerate(new_caps):
    if c['s'] is None:
        prev_e = next((new_caps[k]['e'] for k in range(i - 1, -1, -1) if new_caps[k]['e'] is not None), 0)
        next_s = next((new_caps[k]['s'] for k in range(i + 1, len(new_caps)) if new_caps[k]['s'] is not None), prev_e + 2)
        c['s'], c['e'] = round(prev_e + 0.05, 2), round(next_s - 0.05, 2)
# 行与行不重叠、不倒退；末尾贴上一个字的结束
for i in range(1, len(new_caps)):
    if new_caps[i]['s'] < new_caps[i - 1]['e']: new_caps[i]['s'] = new_caps[i - 1]['e']
    if new_caps[i]['e'] <= new_caps[i]['s']: new_caps[i]['e'] = round(new_caps[i]['s'] + 0.6, 2)
shifts = [round(nc['s'] - o[0], 2) for nc, o in zip(new_caps, old)]
weak = [(nc['t'][:12], round(nc['_matched'], 2)) for nc in new_caps if nc['_matched'] < 0.6]
print(f'{job}: 字幕 {len(caps)} 行，起点偏移 中位 {statistics.median(shifts):+.2f}s 最小 {min(shifts):+.2f}s 最大 {max(shifts):+.2f}s；词 {len(words)} 个')
big = [(nc["t"][:10], sh) for nc, sh in zip(new_caps, shifts) if abs(sh) > 0.35]
for t, sh in big: print(f'  {sh:+.2f}s  {t}')
if weak: print('  对齐弱的行（<60% 字符匹配）：', weak)
if DRY: sys.exit()
for f in ('captions.json', 'words-timeline.json'):
    try: shutil.copy(f'{job}/data/{f}', f'{job}/data/{f}.pre-single-source.bak')
    except FileNotFoundError: pass
json.dump([{'s': c['s'], 'e': c['e'], 't': c['t']} for c in new_caps], open(f'{job}/data/captions.json', 'w'), ensure_ascii=False, indent=2)
json.dump({'source': 'aroll large-v3-turbo token timestamps', 'words': words}, open(f'{job}/data/words-timeline.json', 'w'), ensure_ascii=False, indent=2)
print('written: data/captions.json, data/words-timeline.json')
