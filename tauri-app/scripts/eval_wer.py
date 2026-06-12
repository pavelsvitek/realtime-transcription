#!/usr/bin/env python3
"""Evaluate ASR hypothesis against a reference transcript (word-level WER)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def word_edit_counts(reference: list[str], hypothesis: list[str]) -> tuple[int, int, int]:
    n, m = len(reference), len(hypothesis)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if reference[i - 1] == hypothesis[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)

    i, j = n, m
    subs = ins = dels = 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and reference[i - 1] == hypothesis[j - 1]:
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            subs += 1
            i -= 1
            j -= 1
        elif j > 0 and dp[i][j] == dp[i][j - 1] + 1:
            ins += 1
            j -= 1
        else:
            dels += 1
            i -= 1
    return subs, ins, dels


def duplicate_bigrams(words: list[str]) -> int:
    if len(words) < 4:
        return 0
    return sum(
        1
        for i in range(len(words) - 3)
        if words[i] == words[i + 2] and words[i + 1] == words[i + 3]
    )


def evaluate(reference: str, hypothesis: str) -> dict:
    ref_norm = normalize(reference)
    hyp_norm = normalize(hypothesis)
    ref_words = ref_norm.split()
    hyp_words = hyp_norm.split()
    subs, ins, dels = word_edit_counts(ref_words, hyp_words)
    ref_len = max(len(ref_words), 1)
    wer = (subs + ins + dels) / ref_len

    return {
        "referenceWords": len(ref_words),
        "hypothesisWords": len(hyp_words),
        "substitutions": subs,
        "insertions": ins,
        "deletions": dels,
        "wer": round(wer, 4),
        "werPercent": round(wer * 100, 2),
        "duplicateBigramCount": duplicate_bigrams(hyp_words),
        "normalizedReference": ref_norm,
        "normalizedHypothesis": hyp_norm,
    }


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute WER for a transcript hypothesis")
    parser.add_argument("reference", type=Path, help="Reference transcript file")
    parser.add_argument("hypothesis", type=Path, help="Hypothesis transcript file")
    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path("test-output/baseline/report.json"),
        help="Baseline report for regression check",
    )
    parser.add_argument(
        "--max-regression",
        type=float,
        default=0.02,
        help="Fail if WER increases more than this vs baseline (absolute)",
    )
    parser.add_argument(
        "--save-run",
        action="store_true",
        help="Save transcript + report under test-output/runs/<timestamp>/",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Write report.json to baseline path",
    )
    parser.add_argument(
        "--skip-baseline",
        action="store_true",
        help="Skip regression check against baseline",
    )
    args = parser.parse_args()

    reference = args.reference.read_text(encoding="utf-8")
    hypothesis = args.hypothesis.read_text(encoding="utf-8")
    report = evaluate(reference, hypothesis)
    report["referenceFile"] = str(args.reference)
    report["hypothesisFile"] = str(args.hypothesis)
    report["evaluatedAt"] = datetime.now(timezone.utc).isoformat()

    print(json.dumps(report, indent=2))

    if args.save_run:
        stamp = datetime.now().strftime("%Y-%m-%dT%H%M%S")
        run_dir = Path("test-output/runs") / stamp
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "transcript.txt").write_text(hypothesis, encoding="utf-8")
        (run_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Saved run to {run_dir}", file=sys.stderr)

    if args.update_baseline:
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        args.baseline.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Updated baseline at {args.baseline}", file=sys.stderr)

    if args.baseline.exists() and not args.update_baseline and not args.skip_baseline:
        baseline = load_json(args.baseline)
        delta = report["wer"] - baseline.get("wer", report["wer"])
        print(
            f"Baseline WER: {baseline.get('werPercent', baseline.get('wer', 0) * 100):.2f}% "
            f"| Current: {report['werPercent']:.2f}% | Delta: {delta * 100:+.2f}%",
            file=sys.stderr,
        )
        if delta > args.max_regression:
            print(
                f"REGRESSION: WER increased by {delta * 100:.2f}% "
                f"(limit {args.max_regression * 100:.2f}%)",
                file=sys.stderr,
            )
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
