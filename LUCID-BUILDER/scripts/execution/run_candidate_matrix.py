from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "scripts" / "execution" / "run_model_benchmarks.py"
SCORER = ROOT / "scripts" / "execution" / "score_benchmark_outputs.py"
PROMOTE = ROOT / "scripts" / "execution" / "promote_candidate.py"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a matrix of candidate adapters through the lab.")
    parser.add_argument("--adapters", nargs="+", default=["echo", "heuristic"])
    args = parser.parse_args()
    for adapter in args.adapters:
        subprocess.check_call([sys.executable, str(RUNNER), "--adapter", adapter], cwd=ROOT)
        subprocess.check_call([sys.executable, str(SCORER)], cwd=ROOT)
        subprocess.check_call([sys.executable, str(PROMOTE), "--model-name", f"{adapter}_candidate"], cwd=ROOT)


if __name__ == "__main__":
    main()
