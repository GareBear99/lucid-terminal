from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.model_factory import build_adapter
from runtime.task_loader import load_jsonl


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", default="heuristic")
    parser.add_argument("--prompt-profile", default="minimal_doctrine")
    parser.add_argument("--output", default="results/model_outputs.jsonl")
    parser.add_argument("--endpoint", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--artifact", default=None)
    parser.add_argument("--command-template", default=None)
    parser.add_argument("--timeout-seconds", type=float, default=None)
    parser.add_argument("--first-output-timeout-seconds", type=float, default=None)
    parser.add_argument("--idle-timeout-seconds", type=float, default=None)
    parser.add_argument("--max-output-bytes", type=int, default=None)
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    build_kwargs = {}
    if args.endpoint:
        build_kwargs["endpoint"] = args.endpoint
    if args.model:
        build_kwargs["model"] = args.model
    if args.artifact:
        build_kwargs['artifact'] = args.artifact
    if args.command_template:
        build_kwargs['command_template'] = args.command_template
    if args.timeout_seconds is not None:
        build_kwargs['timeout_seconds'] = args.timeout_seconds
    if args.first_output_timeout_seconds is not None:
        build_kwargs['first_output_timeout_seconds'] = args.first_output_timeout_seconds
    if args.idle_timeout_seconds is not None:
        build_kwargs['idle_timeout_seconds'] = args.idle_timeout_seconds
    if args.max_output_bytes is not None:
        build_kwargs['max_output_bytes'] = args.max_output_bytes
    if args.adapter in {'exemplar', 'local_exemplar'} and args.top_k:
        build_kwargs['top_k'] = args.top_k
    adapter = build_adapter(args.adapter, **build_kwargs)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    records = 0
    failures = 0
    run_id = f"run_{uuid4().hex[:12]}"
    system_prompt = {
        "full_doctrine": "Think in plans, critique weak points, repair conservatively, calibrate uncertainty.",
        "minimal_doctrine": "Plan, critique, repair, calibrate.",
        "bare_prompt": "",
    }.get(args.prompt_profile, "Plan, critique, repair, calibrate.")

    with out.open("w", encoding="utf-8") as f:
        for bench_file in sorted((ROOT / "benchmarks").rglob("*.jsonl")):
            for task in load_jsonl(bench_file):
                started = time.perf_counter()
                try:
                    response = adapter.generate(task["prompt"], system_prompt=system_prompt, context=task)
                except Exception as exc:
                    response = None
                    error = str(exc)
                else:
                    error = response.error
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                record = {
                    "run_id": run_id,
                    "task_id": task["id"],
                    "benchmark_name": bench_file.parent.name,
                    "capability": task.get("capability"),
                    "scoring": task.get("scoring"),
                    "adapter": args.adapter,
                    "prompt_profile": args.prompt_profile,
                    "model": build_kwargs.get("model") or getattr(adapter, 'model', None),
                    "ok": bool(response.ok) if response is not None else False,
                    "error": error,
                    "latency_ms": response.latency_ms if response and response.latency_ms is not None else latency_ms,
                    "finish_reason": response.finish_reason if response is not None else 'failed',
                    "output_text": response.text if response is not None else "",
                    "meta": response.meta if response is not None else {"adapter": args.adapter},
                    "backend_identity": response.backend_identity if response is not None else None,
                }
                if not record["ok"]:
                    failures += 1
                f.write(json.dumps(record) + "\n")
                records += 1
    summary = {"ok": failures == 0, "adapter": args.adapter, "prompt_profile": args.prompt_profile, "records": records, "failures": failures, "run_id": run_id, "output": str(out)}
    print(json.dumps(summary, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
