from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


def run(cmd: list[str], cwd: Path) -> dict:
    proc = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    return {
        "cmd": cmd,
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
    }


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    results = {
        "validation": run([sys.executable, "scripts/validate_repo.py"], root),
        "dataset_count": run([sys.executable, "scripts/build_dataset.py"], root),
        "benchmark_count": run([sys.executable, "scripts/run_benchmarks.py"], root),
        "readiness_report": run([sys.executable, "scripts/execution/generate_readiness_report.py"], root),
    }
    out = root / "reports/local_candidate_smoke.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps({k: v["returncode"] for k, v in results.items()}, indent=2))


if __name__ == "__main__":
    main()
