from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCOREBOARD = ROOT / "results" / "scoreboard.json"
OUT = ROOT / "reports" / "experiment_comparison.json"


def load_models() -> list[dict[str, Any]]:
    if not SCOREBOARD.exists():
        return []
    data = json.loads(SCOREBOARD.read_text(encoding="utf-8"))
    return data.get("models", [])


def main() -> None:
    models = load_models()
    ranked = sorted(models, key=lambda m: m.get("overall_weighted_score", 0), reverse=True)
    best = ranked[0] if ranked else None
    worst = ranked[-1] if ranked else None
    report = {
        "model_count": len(ranked),
        "best": best,
        "worst": worst,
        "ranked_models": ranked,
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
