from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ── Gate v2 thresholds (mirrors specs/promotion_gate_v2.yaml) ─────────────
HARD_REJECT = {
    "repair_success_floor": 0.30,
    "failure_rate_ceiling": 0.25,
    "quantization_retention_floor": 0.90,
}

REGRESSION_CEILINGS = {
    "repair_success":       0.04,
    "calibration_error":    0.03,
    "reasoning":            0.05,
    "planning":             0.05,
    "critique":             0.06,
    "compression":          0.06,
    "paraphrase_stability": 0.06,
}


def _hard_reject_check(entry: dict, incumbent: dict | None) -> tuple[bool, str]:
    """Return (should_reject, reason).  Any True → immediate reject."""
    repair = float(entry.get("repair_success", 1.0))
    if repair < HARD_REJECT["repair_success_floor"]:
        return True, f"repair_success={repair:.3f} below floor {HARD_REJECT['repair_success_floor']}"

    failure_rate = float(entry.get("failure_rate", 0.0))
    if failure_rate > HARD_REJECT["failure_rate_ceiling"]:
        return True, f"failure_rate={failure_rate:.3f} above ceiling {HARD_REJECT['failure_rate_ceiling']}"

    return False, ""


def _regression_check(entry: dict, incumbent: dict) -> list[str]:
    """Return list of regression violation strings (empty = passed)."""
    violations = []
    for cap, ceiling in REGRESSION_CEILINGS.items():
        cand_val = float(entry.get(cap, 0.0))
        inc_val  = float(incumbent.get(cap, 0.0))
        # calibration_error: higher is worse
        if cap == "calibration_error":
            delta = cand_val - inc_val
        else:
            delta = inc_val - cand_val   # drop → positive delta → regression
        if delta > ceiling:
            violations.append(
                f"{cap}: candidate={cand_val:.3f} incumbent={inc_val:.3f} "
                f"regression={delta:.3f} > allowed={ceiling}"
            )
    return violations


def _bundle_candidate(candidate: str) -> str | None:
    """Run bundle_promoted_candidate.py and return the bundle path."""
    bundle_script = ROOT / "scripts" / "ops" / "bundle_promoted_candidate.py"
    if not bundle_script.exists():
        return None
    proc = subprocess.run(
        [sys.executable, str(bundle_script), "--candidate", candidate],
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode == 0:
        for line in reversed(proc.stdout.splitlines()):
            if line.strip().startswith("{"):
                try:
                    data = json.loads(line)
                    return data.get("bundle_path")
                except Exception:
                    pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scored", default="results/scored_outputs.json")
    parser.add_argument("--scoreboard", default="results/scoreboard.json")
    parser.add_argument("--model-name", default="heuristic_minimal_doctrine")
    parser.add_argument("--candidate", default=None,
                        help="Candidate name for Arc-RAR bundling (optional)")
    parser.add_argument("--report", default="reports/promotion_decision.json")
    parser.add_argument("--skip-bundle", action="store_true",
                        help="Skip Arc-RAR bundling (faster, for CI)")
    parser.add_argument("--floor-path", default=None,
                        help="Override path to regression_floor.json (for testing)")
    args = parser.parse_args()

    scored = json.loads(Path(args.scored).read_text(encoding="utf-8"))
    scoreboard_path = Path(args.scoreboard)
    scoreboard = (
        json.loads(scoreboard_path.read_text(encoding="utf-8"))
        if scoreboard_path.exists()
        else {"models": []}
    )

    summary = scored.get("summary", {})
    results = scored.get("results", [])
    sample  = results[0] if results else {}

    entry = {
        "candidate_id":        f"cand_{uuid4().hex[:10]}",
        "run_id":              sample.get("run_id"),
        "model":               args.model_name,
        "adapter":             sample.get("adapter"),
        "backend_identity":    sample.get("backend_identity"),
        "prompt_profile":      sample.get("prompt_profile"),
        "benchmark_version":   "seed_tasks_v2",
        "scorer_version":      scored.get("scorer_version", "unknown"),
        "reasoning":           summary.get("reasoning", 0.0),
        "planning_quality":    summary.get("planning", 0.0),
        "planning":            summary.get("planning", 0.0),
        "critique_usefulness": summary.get("critique", 0.0),
        "critique":            summary.get("critique", 0.0),
        "repair_success":      summary.get("repair", 0.0),
        "compression_retention": summary.get("compression", 0.0),
        "compression":         summary.get("compression", 0.0),
        "calibration_error":   round(1.0 - summary.get("calibration", 0.0), 4),
        "paraphrase_stability": summary.get("paraphrase_stability", 0.0),
        "overall_weighted_score": scored.get("overall_weighted_score", 0.0),
        "failure_rate":        round(
            scored.get("failure_count", 0) / max(1, len(results)), 4
        ),
        "latency_summary_ms": {
            "avg": round(
                sum(r.get("latency_ms", 0.0) for r in results) / max(1, len(results)), 2
            ),
            "max": max((r.get("latency_ms", 0.0) for r in results), default=0.0),
        },
        "artifacts": {
            "scored_outputs": args.scored,
            "promotion_report": args.report,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "incumbent":   False,
        "gate_version": 2,
    }

    # ── Floor model check ─────────────────────────────────────────────────
    import sys as _sys
    if str(ROOT) not in _sys.path:
        _sys.path.insert(0, str(ROOT))
    from runtime.floor_model import FloorModel
    floor = FloorModel(floor_path=Path(args.floor_path) if args.floor_path else None)
    floor_violations = floor.check(entry)

    # Non-promotable adapters (heuristic/synthetic) must never become incumbent.
    # Filter them out before finding the incumbent baseline.
    _NON_PROMOTABLE = {"heuristic", "echo"}
    promotable_models = [
        m for m in scoreboard.get("models", [])
        if m.get("adapter") not in _NON_PROMOTABLE
        and m.get("promotable", True) is not False
    ]

    incumbent = max(
        promotable_models,
        key=lambda m: m.get("overall_weighted_score", 0.0),
        default=None,
    )

    # ── Gate v2 evaluation ────────────────────────────────────────────────
    hard_rejected, hard_reason = _hard_reject_check(entry, incumbent)
    regression_violations: list[str] = []
    promoted = False
    decision_reason = ""

    if hard_rejected:
        decision_reason = f"[HARD REJECT] {hard_reason}"
        decision = "reject"
    elif floor_violations:
        decision_reason = "Floor model breach: " + "; ".join(floor_violations)
        decision = "reject"
    elif incumbent is None:
        promoted = True
        decision = "promote"
        decision_reason = "No incumbent — first candidate accepted as baseline."
    else:
        regression_violations = _regression_check(entry, incumbent)
        better_score = (
            entry["overall_weighted_score"] > incumbent.get("overall_weighted_score", 0.0)
        )
        no_failure_regression = (
            entry["failure_rate"] <= incumbent.get("failure_rate", 1.0)
        )
        if regression_violations:
            decision = "archive_only"
            decision_reason = (
                "Regression threshold exceeded: " + "; ".join(regression_violations)
            )
        elif not better_score:
            decision = "archive_only"
            decision_reason = (
                f"Score {entry['overall_weighted_score']:.4f} did not beat incumbent "
                f"{incumbent.get('overall_weighted_score', 0.0):.4f}."
            )
        elif not no_failure_regression:
            decision = "archive_only"
            decision_reason = (
                f"failure_rate={entry['failure_rate']:.4f} regressed vs incumbent "
                f"{incumbent.get('failure_rate', 0.0):.4f}."
            )
        else:
            promoted = True
            decision = "promote"
            decision_reason = (
                "Candidate improved weighted score with no disqualifying regressions."
            )

    # ── update scoreboard ─────────────────────────────────────────────────
    deduped = [
        m for m in scoreboard.get("models", [])
        if m.get("run_id") != entry.get("run_id")
    ]

    # Only touch incumbent flags when we have a real promotion.
    # archive_only and reject must never displace the current incumbent.
    if promoted:
        for model in deduped:
            model["incumbent"] = False

    entry["incumbent"] = promoted or (not promoted and not any(m.get("incumbent") for m in deduped))
    entry["decision"] = decision
    if decision != "reject":
        deduped.append(entry)
    scoreboard["models"] = deduped
    scoreboard_path.write_text(json.dumps(scoreboard, indent=2), encoding="utf-8")

    # ── Arc-RAR bundle (promote or archive_only) ──────────────────────────
    bundle_path = None
    if decision != "reject" and not args.skip_bundle and args.candidate:
        bundle_path = _bundle_candidate(args.candidate)

    # ── write report ──────────────────────────────────────────────────────
    report = {
        "ok": True,
        "candidate": entry,
        "incumbent_before": incumbent,
        "promoted": promoted,
        "decision": decision,
        "decision_reason": decision_reason,
        "hard_rejected": hard_rejected,
        "floor_violations": floor_violations,
        "regression_violations": regression_violations,
        "arc_rar_bundle": bundle_path,
        "gate_version": 2,
    }
    Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "promoted": promoted,
        "decision": decision,
        "report": args.report,
        "overall_weighted_score": entry["overall_weighted_score"],
        "arc_rar_bundle": bundle_path,
        "regression_violations": regression_violations,
    }, indent=2))


if __name__ == "__main__":
    main()
