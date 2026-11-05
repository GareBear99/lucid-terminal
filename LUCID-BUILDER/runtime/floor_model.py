"""runtime/floor_model.py

ARC Regression Floor — frozen baseline every candidate must beat.

The floor model is a locked reference build. It does not change when
new incumbents are promoted. Candidates are rejected (or archive-only)
if they fall below the floor on core operator capabilities — even if
they beat the current incumbent overall.

This prevents slow drift: a model that looks like an improvement
overall but quietly degrades core skills will be caught by the floor.

Usage
─────
    from runtime.floor_model import FloorModel

    floor = FloorModel()
    violation = floor.check(candidate_scores)
    if violation:
        print("Floor breached:", violation)

Updating the floor
──────────────────
Run:
    python3 runtime/floor_model.py --set-floor --from-scoreboard

This locks the current incumbent's core scores as the new floor.
Only do this intentionally when the stack has reached a new tier.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FLOOR_PATH = ROOT / "configs" / "stack" / "regression_floor.json"

# Core capabilities that MUST NOT regress below the floor.
# These are the skills that make the system trustworthy, not just smart.
FLOOR_CAPABILITIES: list[str] = [
    "repair",
    "calibration",
    "planning",
    "compression",
    "paraphrase_stability",
]

# Default floor values if no floor file exists.
# These are conservative baselines — easy to beat, hard to fall below.
DEFAULT_FLOOR: dict[str, float] = {
    "repair":              0.40,
    "calibration":         0.50,
    "planning":            0.50,
    "compression":         0.40,
    "paraphrase_stability": 0.40,
    "overall_weighted_score": 0.35,
    "failure_rate":        0.30,   # ceiling — must stay below
}


class FloorModel:
    """Frozen regression floor for ARC-Neuron candidate gating."""

    def __init__(self, floor_path: Path | None = None) -> None:
        self._path = floor_path or FLOOR_PATH
        self._floor = self._load()

    def _load(self) -> dict[str, float]:
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                return data.get("scores", DEFAULT_FLOOR)
            except Exception:
                pass
        return dict(DEFAULT_FLOOR)

    @property
    def scores(self) -> dict[str, float]:
        return dict(self._floor)

    def check(self, candidate: dict[str, Any]) -> list[str]:
        """Return list of floor violations. Empty = candidate passed the floor."""
        violations: list[str] = []

        # Field name mapping: floor uses human-readable names,
        # candidate entry uses the promote_candidate.py naming convention.
        # calibration is stored as calibration_error (1 - calibration_score)
        # so the floor for calibration is a CEILING on calibration_error.
        field_map = {
            "repair":              "repair_success",
            "calibration":         None,              # handled specially below
            "planning":            "planning",
            "compression":         "compression",
            "paraphrase_stability":"paraphrase_stability",
        }

        for cap in FLOOR_CAPABILITIES:
            floor_val = self._floor.get(cap, 0.0)

            if cap == "calibration":
                # calibration_error = 1 - calibration_score
                # lower calibration_error = better calibration
                # floor stores the minimum calibration score required,
                # so max acceptable calibration_error = 1 - floor_val
                cand_err = float(candidate.get("calibration_error", 1.0))
                max_err = round(1.0 - floor_val, 4)
                if cand_err > max_err:
                    violations.append(
                        f"calibration: calibration_error={cand_err:.3f} "
                        f"> max_allowed={max_err:.3f} (floor score={floor_val:.3f})"
                    )
                continue

            # Try both the canonical name and the _success/_quality alias
            alt = field_map.get(cap, cap)
            cand_val = float(
                candidate.get(cap, candidate.get(alt + "_success",
                              candidate.get(alt, 0.0)))
            )
            if cand_val < floor_val:
                violations.append(
                    f"{cap}: {cand_val:.3f} < floor {floor_val:.3f}"
                )

        # failure_rate is a ceiling — must stay BELOW floor value
        floor_fr = self._floor.get("failure_rate", 1.0)
        cand_fr  = float(candidate.get("failure_rate", 0.0))
        if cand_fr > floor_fr:
            violations.append(
                f"failure_rate: {cand_fr:.3f} > floor ceiling {floor_fr:.3f}"
            )

        return violations

    def set_floor(self, scores: dict[str, Any], note: str = "") -> None:
        """Lock new floor values. Call only intentionally on tier promotion."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "locked_at":  datetime.now(timezone.utc).isoformat(),
            "note":       note,
            "scores":     {cap: float(scores.get(cap, DEFAULT_FLOOR.get(cap, 0.0)))
                           for cap in list(FLOOR_CAPABILITIES) + ["overall_weighted_score", "failure_rate"]},
        }
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self._floor = payload["scores"]

    def status(self) -> dict[str, Any]:
        locked_at = None
        note = ""
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                locked_at = data.get("locked_at")
                note = data.get("note", "")
            except Exception:
                pass
        return {
            "floor_path":  str(self._path),
            "locked_at":   locked_at,
            "note":        note,
            "scores":      self._floor,
            "capabilities_guarded": FLOOR_CAPABILITIES,
        }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Manage the ARC regression floor model")
    ap.add_argument("--status",         action="store_true", help="Show current floor")
    ap.add_argument("--set-floor",      action="store_true", help="Lock a new floor")
    ap.add_argument("--from-scoreboard",action="store_true", help="Use incumbent from scoreboard as source")
    ap.add_argument("--from-scored",    default=None,        help="Path to scored_outputs.json")
    ap.add_argument("--note",           default="",          help="Reason for floor update")
    ap.add_argument("--scoreboard",     default=str(ROOT / "results" / "scoreboard.json"))
    args = ap.parse_args()

    floor = FloorModel()

    if args.status:
        print(json.dumps(floor.status(), indent=2))
        return

    if args.set_floor:
        source: dict[str, Any] = {}
        if args.from_scoreboard:
            sb = json.loads(Path(args.scoreboard).read_text(encoding="utf-8"))
            inc = next(
                (m for m in sb.get("models", []) if m.get("incumbent")),
                None
            )
            if inc is None:
                inc = max(sb.get("models", [{}]),
                          key=lambda m: m.get("overall_weighted_score", 0.0),
                          default={})
            source = inc
            print(f"Setting floor from incumbent: {source.get('model', '?')}")
        elif args.from_scored:
            sc = json.loads(Path(args.from_scored).read_text(encoding="utf-8"))
            source = {
                "repair":              sc.get("summary", {}).get("repair", 0.0),
                "calibration":         1.0 - sc.get("summary", {}).get("calibration", 0.0),
                "planning":            sc.get("summary", {}).get("planning", 0.0),
                "compression":         sc.get("summary", {}).get("compression", 0.0),
                "paraphrase_stability":sc.get("summary", {}).get("paraphrase_stability", 0.0),
                "overall_weighted_score": sc.get("overall_weighted_score", 0.0),
                "failure_rate":        sc.get("failure_count", 0) / max(1, len(sc.get("results", [1]))),
            }

        if not source:
            print("Error: need --from-scoreboard or --from-scored")
            raise SystemExit(1)

        # Apply a 10% safety margin so the floor is below current performance
        safety = 0.90
        floor_scores = {
            k: round(float(v) * safety, 4)
            for k, v in source.items()
            if k in FLOOR_CAPABILITIES + ["overall_weighted_score"]
        }
        # failure_rate floor is a ceiling — make it 10% more permissive (higher)
        fr = float(source.get("failure_rate", DEFAULT_FLOOR["failure_rate"]))
        floor_scores["failure_rate"] = round(min(1.0, fr * (1 / safety)), 4)

        floor.set_floor(floor_scores, note=args.note or f"Auto-set from {source.get('model','unknown')}")
        print(json.dumps({"ok": True, "floor_set": floor_scores}, indent=2))


if __name__ == "__main__":
    main()
