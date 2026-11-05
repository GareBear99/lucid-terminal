from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def run_step(cmd: list[str]) -> dict:
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return {
        "cmd": cmd,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", default="heuristic")
    parser.add_argument("--prompt-profile", default="minimal_doctrine")
    parser.add_argument("--model-name", default="candidate_v1")
    parser.add_argument("--experiment-log", default="results/experiments.jsonl")
    parser.add_argument('--endpoint', default=None)
    parser.add_argument('--model', default=None)
    parser.add_argument('--require-live-backend', action='store_true')
    args = parser.parse_args()

    steps = []
    py = sys.executable
    run_id = f"gate_{uuid4().hex[:12]}"

    def maybe_append(step_cmd: list[str]) -> bool:
        result = run_step(step_cmd)
        steps.append(result)
        return result['returncode'] == 0

    ok = maybe_append([py, "scripts/validate_repo.py"])
    if ok:
        backend_cmd = [py, "scripts/execution/check_local_backend.py", "--adapter", args.adapter]
        if args.endpoint:
            backend_cmd += ["--endpoint", args.endpoint]
        if args.model:
            backend_cmd += ["--model", args.model]
        if args.require_live_backend:
            backend_cmd += ["--require-live-backend"]
        ok = maybe_append(backend_cmd)
    if ok:
        bench_cmd = [py, "scripts/execution/run_model_benchmarks.py", "--adapter", args.adapter, "--prompt-profile", args.prompt_profile]
        if args.endpoint:
            bench_cmd += ["--endpoint", args.endpoint]
        if args.model:
            bench_cmd += ["--model", args.model]
        ok = maybe_append(bench_cmd)
    if ok:
        ok = maybe_append([py, "scripts/execution/score_benchmark_outputs.py"])
    if ok:
        ok = maybe_append([py, "scripts/execution/promote_candidate.py", "--model-name", args.model_name])
    if ok:
        ok = maybe_append([py, "scripts/execution/run_quantization_retention.py"])

    report = {
        "ok": ok,
        "run_id": run_id,
        "model_name": args.model_name,
        "adapter": args.adapter,
        "prompt_profile": args.prompt_profile,
        "steps": steps,
    }
    Path("reports/full_candidate_gate_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    exp = {
        "run_id": run_id,
        "model_name": args.model_name,
        "adapter": args.adapter,
        "prompt_profile": args.prompt_profile,
        "report": "reports/full_candidate_gate_report.json",
        "ok": ok,
    }
    log = Path(args.experiment_log)
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(exp) + "\n")

    print(json.dumps({"ok": ok, "report": "reports/full_candidate_gate_report.json", "experiment_log": str(log), "run_id": run_id}, indent=2))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
