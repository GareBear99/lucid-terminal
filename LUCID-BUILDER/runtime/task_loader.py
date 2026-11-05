from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable


REQUIRED_TASK_FIELDS = {"id", "capability", "domain", "difficulty", "prompt", "reference", "scoring", "tags"}


def validate_task_record(record: dict, *, source: Path, lineno: int) -> dict:
    missing = sorted(REQUIRED_TASK_FIELDS - set(record.keys()))
    if missing:
        raise ValueError(f"{source}:{lineno}: missing required task fields: {', '.join(missing)}")
    return record


def load_jsonl(path: Path) -> Iterable[dict]:
    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if path.parts and "benchmarks" in path.parts:
                yield validate_task_record(record, source=path, lineno=lineno)
            else:
                yield record


def load_benchmark_index(benchmarks_root: Path) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for bench_file in sorted(benchmarks_root.rglob("*.jsonl")):
        for task in load_jsonl(bench_file):
            task = dict(task)
            task["benchmark_name"] = bench_file.parent.name
            task["source_file"] = str(bench_file)
            index[task["id"]] = task
    return index
