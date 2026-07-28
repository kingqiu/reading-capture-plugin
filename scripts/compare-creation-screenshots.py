#!/usr/bin/env python3
"""Compare approved Creation Workflow screenshots with an implementation capture set."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


STAGES = [
    "01-project-inspirations",
    "02-material-diagnosis",
    "03-research-control",
    "04-master-brief-review",
    "05-platform-plan",
    "06-content-review",
    "07-visual-plan",
    "08-final-export",
]


def find_image(directory: Path, stem: str) -> Path | None:
    for suffix in (".png", ".jpeg", ".jpg"):
        candidate = directory / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def compare(reference_path: Path, actual_path: Path, diff_path: Path) -> dict:
    with Image.open(reference_path) as reference_source, Image.open(actual_path) as actual_source:
        reference = reference_source.convert("RGB")
        actual = actual_source.convert("RGB")
        result = {
            "reference": str(reference_path),
            "actual": str(actual_path),
            "referenceSize": list(reference.size),
            "actualSize": list(actual.size),
            "dimensionMatch": reference.size == actual.size,
        }
        if reference.size != actual.size:
            result.update({"meanAbsoluteError": None, "changedPixelRatio": None, "diff": None})
            return result

        difference = ImageChops.difference(reference, actual)
        stat = ImageStat.Stat(difference)
        mean_absolute_error = sum(stat.mean) / (3 * 255)
        pixels = difference.load()
        changed = sum(
            1
            for y in range(difference.height)
            for x in range(difference.width)
            if max(pixels[x, y]) > 8
        )
        changed_ratio = changed / (difference.width * difference.height)
        amplified = difference.point(lambda value: min(255, value * 4))
        diff_path.parent.mkdir(parents=True, exist_ok=True)
        amplified.save(diff_path)
        result.update({
            "meanAbsoluteError": round(mean_absolute_error, 6),
            "changedPixelRatio": round(changed_ratio, 6),
            "diff": str(diff_path),
        })
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--actual", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-error", type=float, default=0.02)
    parser.add_argument("--max-changed-ratio", type=float, default=0.08)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    failed = False
    for stage in STAGES:
        reference = find_image(args.reference, stage)
        actual = find_image(args.actual, stage)
        if not reference or not actual:
            records.append({"stage": stage, "error": "missing reference or actual image"})
            failed = True
            continue
        record = {"stage": stage, **compare(reference, actual, args.output / f"diff-{stage}.png")}
        record["passed"] = bool(
            record["dimensionMatch"]
            and record["meanAbsoluteError"] <= args.max_error
            and record["changedPixelRatio"] <= args.max_changed_ratio
        )
        failed = failed or not record["passed"]
        records.append(record)

    report = {
        "schemaVersion": 1,
        "thresholds": {"maxError": args.max_error, "maxChangedPixelRatio": args.max_changed_ratio},
        "passed": not failed,
        "stages": records,
    }
    report_path = args.output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report_path)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
