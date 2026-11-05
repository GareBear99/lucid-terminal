from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(cmd: list[str]) -> dict:
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return {'cmd': cmd, 'returncode': proc.returncode, 'stdout': proc.stdout, 'stderr': proc.stderr}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    args = ap.parse_args()
    py = sys.executable
    artifact = ROOT / 'exports' / 'candidates' / args.candidate / 'exemplar_train' / 'exemplar_model.json'
    steps = [
        [py, 'scripts/training/train_exemplar_candidate.py', '--candidate', args.candidate],
        [py, 'scripts/execution/run_model_benchmarks.py', '--adapter', 'exemplar', '--artifact', str(artifact), '--output', f'results/{args.candidate}_model_outputs.jsonl'],
        [py, 'scripts/execution/score_benchmark_outputs.py', '--input', f'results/{args.candidate}_model_outputs.jsonl', '--output', f'results/{args.candidate}_scored_outputs.json'],
    ]
    results = [run(step) for step in steps]
    ok = all(r['returncode'] == 0 for r in results)
    print(json.dumps({'ok': ok, 'candidate': args.candidate, 'steps': results}, indent=2))
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
