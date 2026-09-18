#!/usr/bin/env python3
"""Render native YouTube Shorts from planned cut points.

Rules:
- No title cards, captions, CTA overlays, animation, or decorative wrappers.
- If the source is already 1080x1920 with audio, cut with stream copy.
- Otherwise do the minimum needed to make a Shorts-native 1080x1920 file.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLAN = ROOT / "reports/youtube-shorts-2026-07-02/shorts-plan.json"
DEFAULT_OUT = ROOT / "reports/youtube-shorts-2026-07-02"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--plan", default=str(DEFAULT_PLAN))
    p.add_argument("--out-dir", default=str(DEFAULT_OUT))
    p.add_argument("--limit", type=int)
    p.add_argument("--only", action="append", default=[])
    p.add_argument("--force", action="store_true")
    return p.parse_args()


def run(cmd: list[str], capture: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{result.stderr}")
    if not capture:
        print(result.stderr, end="")
    return result


def ffprobe(path: Path) -> dict:
    result = run([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,duration",
        "-show_entries",
        "format=duration,size,bit_rate",
        "-of",
        "json",
        str(path),
    ], capture=True)
    return json.loads(result.stdout)


def fps_value(raw: str | None) -> float:
    if not raw:
        return 0.0
    num, den = (str(raw).split("/") + ["1"])[:2]
    den_v = float(den)
    return float(num) / den_v if den_v else 0.0


def is_copy_safe(source: Path) -> bool:
    probe = ffprobe(source)
    video = next((s for s in probe["streams"] if s.get("codec_type") == "video"), {})
    audio = next((s for s in probe["streams"] if s.get("codec_type") == "audio"), None)
    fps = fps_value(video.get("avg_frame_rate") or video.get("r_frame_rate"))
    return video.get("width") == 1080 and video.get("height") == 1920 and 20 <= fps <= 60.5 and audio is not None


def write_description(item: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    text = f"""{item["summary"]}

#Shorts #AI工作流 #跨境电商 #TikTokShop
"""
    out.write_text(text, encoding="utf-8")


def to_utc(value: str) -> str:
    dt = datetime.fromisoformat(value)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def render_short(item: dict, dirs: dict[str, Path], force: bool) -> dict:
    source = Path(item["source"])
    if not source.exists():
        raise FileNotFoundError(source)

    video_out = dirs["renders"] / f"{item['id']}.mp4"
    desc_file = dirs["metadata"] / f"{item['id']}.description.txt"
    write_description(item, desc_file)

    mode = "copy" if is_copy_safe(source) else "native-crop"
    if force or not video_out.exists():
        if mode == "copy":
            run([
                "ffmpeg",
                "-y",
                "-ss",
                str(item["start"]),
                "-i",
                str(source),
                "-t",
                str(item["duration"]),
                "-map",
                "0:v:0",
                "-map",
                "0:a:0?",
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "-movflags",
                "+faststart",
                str(video_out),
            ])
        else:
            vf = "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1"
            run([
                "ffmpeg",
                "-y",
                "-ss",
                str(item["start"]),
                "-i",
                str(source),
                "-t",
                str(item["duration"]),
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(video_out),
            ])

    report = validate(video_out)
    make_qa_frames(video_out, dirs["qa"] / item["id"], item["duration"])
    return {
        **item,
        "mode": mode,
        "video": str(video_out),
        "descriptionFile": str(desc_file),
        "publishAtUtc": to_utc(item["publishAtLocal"]),
        "probe": report,
    }


def validate(video: Path) -> dict:
    data = ffprobe(video)
    video_stream = next((s for s in data["streams"] if s.get("codec_type") == "video"), {})
    audio = next((s for s in data["streams"] if s.get("codec_type") == "audio"), None)
    fps = fps_value(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"))
    failures = []
    if video_stream.get("width") != 1080:
        failures.append(f"width={video_stream.get('width')}")
    if video_stream.get("height") != 1920:
        failures.append(f"height={video_stream.get('height')}")
    if not 20 <= fps <= 60.5:
        failures.append(f"fps={fps:.3f}")
    if audio is None:
        failures.append("missing audio")
    if failures:
        raise RuntimeError(f"{video} failed QA: {', '.join(failures)}")
    return data


def make_qa_frames(video: Path, out_dir: Path, duration: float) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for idx, t in enumerate([0.5, duration / 2, max(0.5, duration - 0.5)], start=1):
        run([
            "ffmpeg",
            "-y",
            "-ss",
            f"{t:.2f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out_dir / f"frame-{idx}.jpg"),
        ], capture=True)


def main() -> None:
    args = parse_args()
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir)
    dirs = {
        "renders": out_dir / "shorts-native-renders",
        "metadata": out_dir / "shorts-native-metadata",
        "qa": out_dir / "shorts-native-qa",
    }
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)

    items = plan["items"]
    if args.only:
        wanted = set(args.only)
        items = [item for item in items if item["id"] in wanted]
    if args.limit:
        items = items[: args.limit]

    rendered = []
    default_tags = plan.get("defaults", {}).get("tags", [])
    for index, raw_item in enumerate(items, start=1):
        item = {**raw_item, "tags": [*default_tags, *raw_item.get("tags", [])]}
        print(f"[{index}/{len(items)}] render native {item['id']}", flush=True)
        rendered.append(render_short(item, dirs, args.force))

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": rendered,
    }
    manifest_path = out_dir / "shorts-native-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest={manifest_path}")


if __name__ == "__main__":
    main()
