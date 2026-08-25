#!/usr/bin/env python3
"""Render a cut-local filmstrip and waveform for visual edit review."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def run(*args: str) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def video_duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def words_near(path: str | None, start: float, end: float) -> list[dict]:
    if not path:
        return []
    payload = json.loads(Path(path).read_text())
    return [word for word in payload.get("words", []) if word["end"] >= start and word["start"] <= end]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--center", type=float, required=True)
    parser.add_argument("--window", type=float, default=3.0)
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--transcript")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    duration = video_duration(args.video)
    view_window = min(args.window, duration)
    start = min(max(0.0, args.center - view_window / 2), max(0.0, duration - view_window))
    end = start + view_window
    width, frame_height, wave_height = 1920, 270, 250
    frame_width = width // args.frames

    with tempfile.TemporaryDirectory(prefix="timeline-view-") as tmp:
        tmp_dir = Path(tmp)
        frames: list[Image.Image] = []
        for index in range(args.frames):
            timestamp = min(duration - 0.001, start + view_window * (index + 0.5) / args.frames)
            target = tmp_dir / f"frame-{index:02d}.jpg"
            run("ffmpeg", "-y", "-ss", f"{timestamp:.3f}", "-i", args.video, "-frames:v", "1", "-q:v", "2", str(target))
            image = Image.open(target).convert("RGB")
            image.thumbnail((frame_width, frame_height), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (frame_width, frame_height), "#0b0e14")
            canvas.paste(image, ((frame_width - image.width) // 2, (frame_height - image.height) // 2))
            frames.append(canvas)

        waveform = tmp_dir / "wave.png"
        run(
            "ffmpeg", "-y", "-ss", f"{start:.3f}", "-t", f"{view_window:.3f}", "-i", args.video,
            "-filter_complex", f"aformat=channel_layouts=mono,showwavespic=s={width}x{wave_height}:colors=0x48E5C2",
            "-frames:v", "1", str(waveform),
        )

        output = Image.new("RGB", (width, frame_height + wave_height + 170), "#090b10")
        for index, image in enumerate(frames):
            output.paste(image, (index * frame_width, 0))
        output.paste(Image.open(waveform).convert("RGB"), (0, frame_height))

        draw = ImageDraw.Draw(output)
        cut_x = round((args.center - start) / view_window * width)
        draw.line((cut_x, 0, cut_x, frame_height + wave_height), fill="#ff4d6d", width=6)
        draw.text((28, frame_height + wave_height + 18), f"CUT {args.center:.3f}s  |  VIEW {start:.3f}s–{end:.3f}s", fill="#f3f5f7", font=font(30))
        words = words_near(args.transcript, start, end)
        label = " ".join(f"[{word['start']:.2f}] {word['text']}" for word in words) or "No aligned words supplied"
        draw.text((28, frame_height + wave_height + 72), label[:110], fill="#aeb6c5", font=font(24))

        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        output.save(target, quality=94)


if __name__ == "__main__":
    main()
