#!/usr/bin/env python3
"""Evaluate local WhisperKit and xAI batch STT on NOTSOFAR eval-small.

Downloads a subset of meetings (default 10), transcribes each with the selected
backends, and reports speaker-agnostic WER against gold transcripts.

Examples:
  python3 scripts/eval_notsofar.py
  python3 scripts/eval_notsofar.py --n-meetings 10
  python3 scripts/eval_notsofar.py --n-meetings 80 --backends xai
  python3 scripts/eval_notsofar.py --n-meetings 3 --backends local
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
import wave
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SCRIPT_DIR = Path(__file__).resolve().parent
APP_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))
from eval_wer import evaluate  # noqa: E402

EVAL_SPLIT = "benchmark-datasets/eval_set/240629.1_eval_small_with_GT"
TRANSCRIPT_NAMES = ("gt_transcription.json", "transcript.json", "gt_transcript.json")
SC_PREFERENCE = ("meetup_0", "plaza_0", "studio_0", "panacast_0")
XAI_STT_URL = "https://api.x.ai/v1/stt"
XAI_KEY_FILE = (
    Path.home() / "Library/Application Support/com.pavel.amie/xai_api_key"
)
TAG_RE = re.compile(r"<[^>]+>")
BACKENDS = ("local", "xai")


def parse_backends(raw: str) -> list[str]:
    chosen: list[str] = []
    for part in raw.split(","):
        name = part.strip().lower()
        if not name:
            continue
        if name not in BACKENDS:
            raise argparse.ArgumentTypeError(
                f"unknown backend {part!r}; expected local and/or xai"
            )
        if name not in chosen:
            chosen.append(name)
    if not chosen:
        raise argparse.ArgumentTypeError("at least one backend is required")
    return chosen


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NOTSOFAR eval-small WER for local WhisperKit vs xAI batch STT"
    )
    parser.add_argument(
        "--n-meetings",
        type=int,
        default=10,
        help="How many eval-small meetings to score (sorted IDs, default 10)",
    )
    parser.add_argument(
        "--backends",
        type=parse_backends,
        default=["local", "xai"],
        help="Comma-separated backends: local, xai (default local,xai)",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=APP_ROOT / "eval-data" / "notsofar",
        help="Cache root for downloaded meetings",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Hypotheses + summary.json (default test-output/notsofar/<timestamp>)",
    )
    parser.add_argument(
        "--hf-repo",
        default="microsoft/NOTSOFAR",
        help="Hugging Face dataset repo (override to use a mirror)",
    )
    return parser.parse_args()


HF_HEADERS = {"User-Agent": "realtime-transcription-notsofar-eval"}


class HuggingFaceDataset:
    """Download helpers. Uses huggingface_hub when installed, else the public HF HTTP API."""

    def __init__(self, repo: str) -> None:
        self.repo = repo
        self._hub_download = None
        self._list_repo_tree = None
        try:
            from huggingface_hub import hf_hub_download, list_repo_tree

            self._hub_download = hf_hub_download
            self._list_repo_tree = list_repo_tree
        except ImportError:
            pass

    def list_meeting_ids(self) -> list[str]:
        ids: list[str] = []
        if self._list_repo_tree is not None:
            tree = self._list_repo_tree(
                self.repo,
                repo_type="dataset",
                path_in_repo=f"{EVAL_SPLIT}/MTG",
                recursive=False,
            )
            for item in tree:
                name = Path(getattr(item, "path", "")).name
                if name.startswith("MTG_") and "." not in name:
                    ids.append(name)
        else:
            url = (
                f"https://huggingface.co/api/datasets/{self.repo}/tree/main/"
                f"{EVAL_SPLIT}/MTG"
            )
            with urlopen(Request(url, headers=HF_HEADERS), timeout=60) as response:
                entries = json.loads(response.read().decode("utf-8"))
            for entry in entries:
                name = Path(str(entry.get("path", ""))).name
                if entry.get("type") == "directory" and name.startswith("MTG_"):
                    ids.append(name)
        ids.sort()
        if not ids:
            raise SystemExit(f"no MTG_* meetings found in {self.repo} {EVAL_SPLIT}/MTG")
        return ids

    def download(self, relative: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.stat().st_size > 0:
            return dest
        if self._hub_download is not None:
            src = self._hub_download(
                repo_id=self.repo, filename=relative, repo_type="dataset"
            )
            if Path(src).resolve() != dest.resolve():
                shutil.copy2(src, dest)
            return dest
        url = f"https://huggingface.co/datasets/{self.repo}/resolve/main/{relative}"
        request = Request(url, headers=HF_HEADERS)
        with urlopen(request, timeout=300) as response:
            dest.write_bytes(response.read())
        return dest


def meeting_remote(meeting_id: str, *parts: str) -> str:
    return "/".join((EVAL_SPLIT, "MTG", meeting_id, *parts))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def pick_sc_device(devices: list[dict[str, Any]]) -> dict[str, Any] | None:
    sc: list[dict[str, Any]] = []
    for device in devices:
        if device.get("is_close_talk"):
            continue
        if device.get("is_mc"):
            continue
        sc.append(device)
    if not sc:
        return None

    def rank(device: dict[str, Any]) -> int:
        name = str(device.get("device_name") or device.get("device_alias") or "")
        for index, pref in enumerate(SC_PREFERENCE):
            if pref == name or pref in name:
                return index
        return len(SC_PREFERENCE)

    sc.sort(key=rank)
    return sc[0]


def wav_relative_path(device: dict[str, Any]) -> str | None:
    raw = device.get("wav_file_names") or device.get("wav_file_name")
    if raw is None:
        return None
    if isinstance(raw, list):
        names = [str(item).strip() for item in raw if str(item).strip()]
    else:
        names = [part.strip() for part in str(raw).split(",") if part.strip()]
    return names[0] if names else None


def strip_markup(text: str) -> str:
    return " ".join(TAG_RE.sub(" ", text).split())


def gold_text_from_transcript(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("utterances", "segments", "transcription", "transcripts"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
        else:
            payload = payload.get("text")
    if isinstance(payload, str):
        return strip_markup(payload)
    if not isinstance(payload, list):
        return ""

    utterances: list[tuple[float, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        text = strip_markup(str(item.get("text") or item.get("transcript") or ""))
        if not text:
            continue
        start = item.get("start_time", item.get("start", item.get("begin_time", 0.0)))
        try:
            start_f = float(start)
        except (TypeError, ValueError):
            start_f = 0.0
        utterances.append((start_f, text))
    utterances.sort(key=lambda pair: pair[0])
    return " ".join(text for _, text in utterances)


def wav_duration_sec(path: Path) -> float | None:
    try:
        with wave.open(str(path), "rb") as handle:
            frames = handle.getnframes()
            rate = handle.getframerate()
            if rate <= 0:
                return None
            return frames / float(rate)
    except Exception:
        return None


def resolve_xai_api_key() -> str:
    env = os.environ.get("XAI_API_KEY", "").strip()
    if env:
        return env
    if XAI_KEY_FILE.exists():
        key = XAI_KEY_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key
    raise SystemExit(
        "xAI API key not set. Export XAI_API_KEY or save it in Settings "
        f"({XAI_KEY_FILE})"
    )


def post_xai_stt(api_key: str, wav_path: Path) -> str:
    boundary = f"----NotsofarEval{uuid.uuid4().hex}"
    body = BytesIO()

    def write_field(name: str, value: str) -> None:
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.write(f"{value}\r\n".encode())

    write_field("format", "true")
    write_field("language", "en")
    write_field("model", "grok-voice-transcribe-2.0")
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="file"; filename="{wav_path.name}"\r\n'.encode()
    )
    body.write(b"Content-Type: audio/wav\r\n\r\n")
    body.write(wav_path.read_bytes())
    body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())

    request = Request(
        XAI_STT_URL,
        data=body.getvalue(),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urlopen(request, timeout=600) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"xAI STT HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"xAI STT request failed: {exc}") from exc

    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError(f"xAI STT returned no text: {payload!r}")
    return text


def download_meeting(
    hub: HuggingFaceDataset,
    meeting_id: str,
    dest_dir: Path,
) -> dict[str, Any] | None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    devices_path = dest_dir / "devices.json"
    try:
        hub.download(meeting_remote(meeting_id, "devices.json"), devices_path)
    except Exception as exc:
        print(f"  skip {meeting_id}: devices.json ({exc})", file=sys.stderr)
        return None

    try:
        devices = load_json(devices_path)
    except json.JSONDecodeError as exc:
        print(f"  skip {meeting_id}: invalid devices.json ({exc})", file=sys.stderr)
        return None
    if not isinstance(devices, list):
        print(f"  skip {meeting_id}: devices.json is not a list", file=sys.stderr)
        return None

    device = pick_sc_device(devices)
    if device is None:
        print(f"  skip {meeting_id}: no far-field single-channel device", file=sys.stderr)
        return None
    wav_rel = wav_relative_path(device)
    if not wav_rel:
        print(f"  skip {meeting_id}: device has no wav path", file=sys.stderr)
        return None

    wav_path = dest_dir / wav_rel
    try:
        hub.download(meeting_remote(meeting_id, wav_rel), wav_path)
    except Exception as exc:
        print(f"  skip {meeting_id}: wav {wav_rel} ({exc})", file=sys.stderr)
        return None

    transcript_path: Path | None = None
    payload: Any = None
    for name in TRANSCRIPT_NAMES:
        candidate = dest_dir / name
        try:
            hub.download(meeting_remote(meeting_id, name), candidate)
            payload = load_json(candidate)
            transcript_path = candidate
            break
        except Exception:
            continue
    if transcript_path is None or payload is None:
        print(f"  skip {meeting_id}: no gold transcript JSON", file=sys.stderr)
        return None

    reference = gold_text_from_transcript(payload)
    if not reference.strip():
        print(f"  skip {meeting_id}: empty gold transcript", file=sys.stderr)
        return None

    ref_path = dest_dir / "reference.txt"
    ref_path.write_text(reference + "\n", encoding="utf-8")
    device_name = str(device.get("device_name") or device.get("device_alias") or "unknown")
    return {
        "id": meeting_id,
        "audio": str(wav_path),
        "device": device_name,
        "reference": reference,
        "referenceFile": str(ref_path),
        "durationSec": wav_duration_sec(wav_path),
    }


def run_local(meetings: list[dict[str, Any]], out_dir: Path) -> dict[str, str]:
    hyp_dir = out_dir / "local"
    hyp_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "local-manifest.json"
    manifest = [{"id": m["id"], "audio": m["audio"]} for m in meetings]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    cmd = [
        "cargo",
        "run",
        "--quiet",
        "--manifest-path",
        str(APP_ROOT / "src-tauri" / "Cargo.toml"),
        "--bin",
        "file_transcribe",
        "--",
        "--manifest",
        str(manifest_path),
        "--out-dir",
        str(hyp_dir),
        "--backend",
        "local",
    ]
    print("Running local WhisperKit file pipeline...", file=sys.stderr)
    result = subprocess.run(cmd, cwd=str(APP_ROOT))
    if result.returncode != 0:
        print(
            f"file_transcribe exited {result.returncode}; scoring any hypotheses that were written",
            file=sys.stderr,
        )

    hypotheses: dict[str, str] = {}
    for meeting in meetings:
        path = hyp_dir / f"{meeting['id']}.txt"
        if path.exists():
            hypotheses[meeting["id"]] = path.read_text(encoding="utf-8")
        else:
            print(f"  missing local hypothesis for {meeting['id']}", file=sys.stderr)
    return hypotheses


def run_xai(meetings: list[dict[str, Any]], out_dir: Path) -> dict[str, str]:
    api_key = resolve_xai_api_key()
    hyp_dir = out_dir / "xai"
    hyp_dir.mkdir(parents=True, exist_ok=True)
    hypotheses: dict[str, str] = {}
    print("Running xAI batch STT...", file=sys.stderr)
    for index, meeting in enumerate(meetings, start=1):
        meeting_id = meeting["id"]
        hyp_path = hyp_dir / f"{meeting_id}.txt"
        print(
            f"  [{index}/{len(meetings)}] {meeting_id}",
            file=sys.stderr,
        )
        try:
            text = post_xai_stt(api_key, Path(meeting["audio"]))
        except Exception as exc:
            print(f"  ERROR {meeting_id}: {exc}", file=sys.stderr)
            continue
        hyp_path.write_text(text + "\n", encoding="utf-8")
        hypotheses[meeting_id] = text
    return hypotheses


def score_backend(
    meetings: list[dict[str, Any]], hypotheses: dict[str, str]
) -> dict[str, dict[str, Any]]:
    reports: dict[str, dict[str, Any]] = {}
    for meeting in meetings:
        hyp = hypotheses.get(meeting["id"])
        if hyp is None:
            continue
        report = evaluate(meeting["reference"], hyp)
        # Drop bulky normalized strings from the saved per-meeting summary.
        compact = {
            key: value
            for key, value in report.items()
            if key not in ("normalizedReference", "normalizedHypothesis")
        }
        reports[meeting["id"]] = compact
    return reports


def aggregate(reports: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if not reports:
        return {"macroWer": None, "microWer": None, "meetings": 0}
    macro = sum(item["wer"] for item in reports.values()) / len(reports)
    subs = sum(item["substitutions"] for item in reports.values())
    ins = sum(item["insertions"] for item in reports.values())
    dels = sum(item["deletions"] for item in reports.values())
    ref_words = sum(item["referenceWords"] for item in reports.values())
    micro = (subs + ins + dels) / max(ref_words, 1)
    return {
        "macroWer": round(macro, 4),
        "macroWerPercent": round(macro * 100, 2),
        "microWer": round(micro, 4),
        "microWerPercent": round(micro * 100, 2),
        "meetings": len(reports),
        "referenceWords": ref_words,
        "substitutions": subs,
        "insertions": ins,
        "deletions": dels,
    }


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "   —"
    minutes = seconds / 60.0
    return f"{minutes:5.1f}m"


def print_table(
    meetings: list[dict[str, Any]],
    per_backend: dict[str, dict[str, dict[str, Any]]],
    aggregates: dict[str, dict[str, Any]],
    backends: list[str],
) -> None:
    headers = ["meeting", "dur"] + backends
    widths = {"meeting": 12, "dur": 7}
    for backend in backends:
        widths[backend] = max(8, len(backend) + 2)

    def fmt_wer(report: dict[str, Any] | None) -> str:
        if not report:
            return "     —"
        return f"{report['werPercent']:6.1f}%"

    def fmt_agg(backend: str, key: str) -> str:
        stats = aggregates.get(backend)
        if not stats or stats.get(key) is None:
            return "     —"
        return f"{stats[key]:6.1f}%"

    print("")
    print(
        f"{'meeting':<{widths['meeting']}} {'dur':>{widths['dur']}} "
        + " ".join(f"{name:>{widths[name]}}" for name in backends)
    )
    for meeting in meetings:
        cells = [
            f"{meeting['id']:<{widths['meeting']}}",
            f"{format_duration(meeting.get('durationSec')):>{widths['dur']}}",
        ]
        for backend in backends:
            cells.append(
                f"{fmt_wer(per_backend.get(backend, {}).get(meeting['id'])):>{widths[backend]}}"
            )
        print(" ".join(cells))

    print(
        f"{'macro':<{widths['meeting']}} {'':>{widths['dur']}} "
        + " ".join(f"{fmt_agg(b, 'macroWerPercent'):>{widths[b]}}" for b in backends)
    )
    print(
        f"{'micro':<{widths['meeting']}} {'':>{widths['dur']}} "
        + " ".join(f"{fmt_agg(b, 'microWerPercent'):>{widths[b]}}" for b in backends)
    )


def main() -> int:
    args = parse_args()
    if args.n_meetings < 1:
        print("--n-meetings must be >= 1", file=sys.stderr)
        return 2

    backends: list[str] = args.backends
    stamp = datetime.now().strftime("%Y-%m-%dT%H%M%S")
    out_dir = args.out_dir or (APP_ROOT / "test-output" / "notsofar" / stamp)
    out_dir = out_dir if out_dir.is_absolute() else APP_ROOT / out_dir
    data_dir = args.data_dir if args.data_dir.is_absolute() else APP_ROOT / args.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    hub = HuggingFaceDataset(args.hf_repo)
    started = time.perf_counter()
    timings: dict[str, float] = {}

    t0 = time.perf_counter()
    meeting_ids = hub.list_meeting_ids()
    selected_ids = meeting_ids[: args.n_meetings]
    print(
        f"NOTSOFAR eval-small: {len(meeting_ids)} meetings available, "
        f"using {len(selected_ids)} from {args.hf_repo}",
        file=sys.stderr,
    )

    meetings: list[dict[str, Any]] = []
    for meeting_id in selected_ids:
        print(f"Downloading {meeting_id}...", file=sys.stderr)
        prepared = download_meeting(
            hub,
            meeting_id,
            data_dir / meeting_id,
        )
        if prepared is not None:
            meetings.append(prepared)
    timings["download"] = time.perf_counter() - t0

    if not meetings:
        print("no meetings downloaded successfully", file=sys.stderr)
        return 1

    (out_dir / "meetings.json").write_text(
        json.dumps(
            [
                {
                    "id": m["id"],
                    "audio": m["audio"],
                    "device": m["device"],
                    "durationSec": m["durationSec"],
                    "referenceFile": m["referenceFile"],
                }
                for m in meetings
            ],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    hypotheses: dict[str, dict[str, str]] = {}
    if "local" in backends:
        t0 = time.perf_counter()
        hypotheses["local"] = run_local(meetings, out_dir)
        timings["local"] = time.perf_counter() - t0
    if "xai" in backends:
        t0 = time.perf_counter()
        hypotheses["xai"] = run_xai(meetings, out_dir)
        timings["xai"] = time.perf_counter() - t0

    per_backend = {
        backend: score_backend(meetings, hyps) for backend, hyps in hypotheses.items()
    }
    aggregates = {backend: aggregate(reports) for backend, reports in per_backend.items()}
    timings["total"] = time.perf_counter() - started

    summary = {
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "hfRepo": args.hf_repo,
        "evalSplit": EVAL_SPLIT,
        "nMeetingsRequested": args.n_meetings,
        "nMeetingsScored": len(meetings),
        "backends": backends,
        "macroWer": {
            backend: aggregates[backend]["macroWer"] for backend in aggregates
        },
        "microWer": {
            backend: aggregates[backend]["microWer"] for backend in aggregates
        },
        "aggregates": aggregates,
        "wallTimeSec": {key: round(value, 2) for key, value in timings.items()},
        "meetings": [
            {
                "id": meeting["id"],
                "durationSec": meeting["durationSec"],
                "device": meeting["device"],
                "audio": meeting["audio"],
                "referenceWords": next(
                    (
                        reports[meeting["id"]]["referenceWords"]
                        for reports in per_backend.values()
                        if meeting["id"] in reports
                    ),
                    None,
                ),
                "backends": {
                    backend: reports.get(meeting["id"])
                    for backend, reports in per_backend.items()
                },
            }
            for meeting in meetings
        ],
    }
    summary_path = out_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print_table(meetings, per_backend, aggregates, backends)
    print(f"\nWrote {summary_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
