from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.task_loader import load_benchmark_index
from scorers.rubric import score_record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="results/model_outputs.jsonl")
    parser.add_argument("--output", default="results/scored_outputs.json")
    args = parser.parse_args()

    inp = Path(args.input)
    task_index = load_benchmark_index(ROOT / 'benchmarks')
    results = []
    aggregates: dict[str, list[float]] = {}
    failures = 0
    with inp.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            task = task_index.get(rec["task_id"])
            score = score_record(rec.get("output_text", ""), task=task)
            rec.update(score)
            rec["task_reference"] = task.get("reference") if task else None
            results.append(rec)
            aggregates.setdefault(rec["benchmark_name"], []).append(score["normalized_score"])
            if not rec.get('ok'):
                failures += 1

    summary = {k: round(sum(v) / len(v), 4) for k, v in aggregates.items()}
    payload = {
        "results": results,
        "summary": summary,
        "failure_count": failures,
        "overall_weighted_score": round(sum(summary.values()) / max(1, len(summary)), 4),
        "scorer_version": "v2-task-aware",
    }
    out = Path(args.output)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"ok": failures == 0, "output": str(out), "overall_weighted_score": payload["overall_weighted_score"], "failure_count": failures}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
