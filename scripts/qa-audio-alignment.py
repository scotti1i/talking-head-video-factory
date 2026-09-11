#!/usr/bin/env python3
"""Estimate A-roll voice timing drift after music/SFX mixing.

Both inputs must be mono 16-bit PCM WAV files with the same sample rate.
The script takes short reference windows from the clean A-roll and searches
for the matching waveform around the same timestamp in the final mix.
"""

import argparse
import json
import wave

import numpy as np


def read_pcm16(path):
    with wave.open(path, "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError(f"{path}: expected mono 16-bit PCM WAV")
        rate = wav.getframerate()
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
    return rate, audio / 32768.0


def normalize(signal):
    signal = np.diff(signal, prepend=signal[0])
    signal -= signal.mean()
    scale = np.linalg.norm(signal)
    return signal / scale if scale else signal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("clean")
    parser.add_argument("mixed")
    parser.add_argument("--anchors", default="2,12,20,30,40,44")
    parser.add_argument("--window", type=float, default=2.0)
    parser.add_argument("--radius", type=float, default=1.0)
    parser.add_argument("--analysis-rate", type=int, default=1000)
    args = parser.parse_args()

    clean_rate, clean = read_pcm16(args.clean)
    mixed_rate, mixed = read_pcm16(args.mixed)
    if clean_rate != mixed_rate:
        raise ValueError("sample rates differ")
    stride = max(1, clean_rate // args.analysis_rate)
    analysis_rate = clean_rate / stride
    rows = []
    for anchor in (float(item) for item in args.anchors.split(",")):
        ref_start = int(anchor * clean_rate)
        ref_end = int((anchor + args.window) * clean_rate)
        search_start_s = max(0.0, anchor - args.radius)
        search_end_s = min(len(mixed) / mixed_rate, anchor + args.window + args.radius)
        reference = normalize(clean[ref_start:ref_end:stride])
        search = normalize(mixed[int(search_start_s * mixed_rate):int(search_end_s * mixed_rate):stride])
        if len(search) < len(reference) or not len(reference):
            continue
        correlation = np.correlate(search, reference, mode="valid")
        best = int(np.argmax(np.abs(correlation)))
        offset = search_start_s + best / analysis_rate - anchor
        rows.append({
            "anchorSeconds": anchor,
            "offsetSeconds": round(offset, 4),
            "absoluteCorrelation": round(float(abs(correlation[best])), 4),
        })
    offsets = np.array([row["offsetSeconds"] for row in rows], dtype=float)
    result = {
        "windows": rows,
        "medianOffsetSeconds": round(float(np.median(offsets)), 4) if len(offsets) else None,
        "maxAbsoluteOffsetSeconds": round(float(np.max(np.abs(offsets))), 4) if len(offsets) else None,
        "pass": bool(len(offsets) and np.max(np.abs(offsets)) <= 0.05),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
