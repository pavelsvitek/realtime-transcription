#!/usr/bin/env python3
"""Merge mic + system segment dumps into one conversation transcript.

Reads `mic.segments.json` and `system.segments.json` from a DEBUG_SAVE session
directory and writes them in start-time order.

Usage:
  ./scripts/merge-session-transcript.py
  ./scripts/merge-session-transcript.py debug/2026-09-07T08-03-27
  ./scripts/merge-session-transcript.py debug/2026-09-07T08-03-27 -o ~/Downloads/meeting.txt
  ./scripts/merge-session-transcript.py debug/2026-09-07T08-03-27 --to-downloads

When DEBUG_SAVE sessions finalize, the Rust backend temporarily auto-runs this
script with --to-downloads (see TEMP_AUTO_EXPORT_MERGED_TO_DOWNLOADS).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SEGMENT_FILES = ("mic.segments.json", "system.segments.json")


def debug_root() -> Path:
    return Path(__file__).resolve().parent.parent / "debug"


def latest_session_dir() -> Path:
    root = debug_root()
    sessions = sorted(
        (p for p in root.iterdir() if p.is_dir()),
        key=lambda p: p.name,
    )
    if not sessions:
        raise SystemExit(f"No session directories found in {root}")
    return sessions[-1]


def load_segments(session_dir: Path) -> list[dict]:
    segments: list[dict] = []
    missing = []
    for name in SEGMENT_FILES:
        path = session_dir / name
        if not path.exists():
            missing.append(name)
            continue
        stream = name.split(".", 1)[0]
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise SystemExit(f"{path} is not a JSON array")
        for item in raw:
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            segments.append(
                {
                    "stream": stream,
                    "segmentId": item.get("segmentId", ""),
                    "speaker": item.get("speaker") or stream,
                    "text": text,
                    "startMs": int(item.get("startMs", 0)),
                    "endMs": int(item.get("endMs", 0)),
                }
            )
    if missing and not segments:
        raise SystemExit(
            f"No segment files found in {session_dir} (looked for {', '.join(SEGMENT_FILES)})"
        )
    segments.sort(key=lambda s: (s["startMs"], s["endMs"], s["stream"], s["segmentId"]))
    return segments


def format_timestamp(ms: int) -> str:
    total_seconds = max(ms, 0) // 1000
    hours, rem = divmod(total_seconds, 3600)
    minutes, seconds = divmod(rem, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def render_transcript(session_dir: Path, segments: list[dict]) -> str:
    lines = [
        f"Session: {session_dir.name}",
        f"Segments: {len(segments)} (mic + system, ordered by start time)",
        "",
    ]
    for seg in segments:
        stamp = format_timestamp(seg["startMs"])
        lines.append(f"[{stamp}] {seg['speaker']}: {seg['text']}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge mic and system session segments into conversation order"
    )
    parser.add_argument(
        "session_dir",
        nargs="?",
        type=Path,
        help="DEBUG_SAVE session directory (default: latest under debug/)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write transcript to this path (default: stdout)",
    )
    parser.add_argument(
        "--to-downloads",
        action="store_true",
        help="Write to ~/Downloads/transcript-<session>.txt",
    )
    args = parser.parse_args()

    session_dir = (args.session_dir or latest_session_dir()).expanduser().resolve()
    if not session_dir.is_dir():
        raise SystemExit(f"Session directory not found: {session_dir}")

    transcript = render_transcript(session_dir, load_segments(session_dir))
    output = args.output
    if args.to_downloads:
        if output is not None:
            raise SystemExit("Use either --output or --to-downloads, not both")
        downloads = Path.home() / "Downloads"
        output = downloads / f"transcript-{session_dir.name}.txt"

    if output is not None:
        output = output.expanduser()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(transcript, encoding="utf-8")
        print(f"Wrote {output}", file=sys.stderr)
    else:
        sys.stdout.write(transcript)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
