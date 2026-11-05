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
    ap.add_argument('--base-model', default='unset')
    ap.add_argument('--mode', choices=['auto', 'scaffold', 'external'], default='auto')
    args = ap.parse_args()
    py = sys.executable
    steps = [
        [py, 'scripts/training/train_lora_candidate.py', '--candidate', args.candidate, '--base-model', args.base_model, '--mode', args.mode],
        [py, 'scripts/training/train_preference_candidate.py', '--candidate', args.candidate, '--mode', args.mode],
        [py, 'scripts/training/merge_adapters_stub.py', '--candidate', args.candidate, '--base-model', args.base_model, '--mode', args.mode],
        [py, 'scripts/training/export_gguf_candidate.py', '--candidate', args.candidate, '--mode', args.mode],
    ]
    results = [run(step) for step in steps]
    ok = all(r['returncode'] == 0 for r in results)
    print(json.dumps({'ok': ok, 'mode': args.mode, 'steps': results}, indent=2))
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
