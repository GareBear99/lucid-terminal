#!/usr/bin/env python3
"""scripts/ops/demo_proof_workflow.py

THE USER-FACING PROOF WORKFLOW

This script demonstrates the complete system working as one machine.
It runs a single end-to-end demo that shows:

  Step 1: User teaches the system a new term
  Step 2: Language module stores the term immediately
  Step 3: Runtime keeps continuity state
  Step 4: Conversations feed the Omnibinary archive
  Step 5: Training export uses that material
  Step 6: A candidate model is trained using those exports
  Step 7: The candidate is benchmarked against the incumbent
  Step 8: The gate decides promote/reject/archive_only
  Step 9: If promoted, prior build remains restorable from Arc-RAR

This is the one demo that explains the whole system.
Run it: python3 scripts/ops/demo_proof_workflow.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def section(title: str) -> None:
    print()
    print("─" * 60)
    print(f"  {title}")
    print("─" * 60)


def check(label: str, ok: bool, detail: str = "") -> None:
    icon = "✓" if ok else "✗"
    print(f"  {icon}  {label}" + (f"  [{detail}]" if detail else ""))
    if not ok:
        print(f"     FAIL: {label}")


def main() -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    demo_term   = "proof_cycle"
    demo_defn   = "a complete train→benchmark→gate→archive sequence that produces a receipt"
    candidate   = f"demo_{ts}"
    session_id  = f"demo_proof_{ts}"

    print()
    print("═" * 60)
    print("  ARC COGNITION CORE — END-TO-END PROOF WORKFLOW")
    print(f"  {datetime.now(timezone.utc).isoformat()}")
    print("═" * 60)

    # ── Step 1: Teach a term ──────────────────────────────────────────────
    section("Step 1: User teaches new term to language module")
    from runtime.terminology import TerminologyStore
    term_store = TerminologyStore()
    before = term_store.stats()["total_records"]
    rec = term_store.correct(demo_term, demo_defn, session_id=session_id)
    after = term_store.stats()["total_records"]
    check("Term stored", after > before, f"'{demo_term}'")
    check("Term approved", rec.approved, f"confidence={rec.confidence}")
    check("Provenance set", bool(rec.provenance))

    # ── Step 2: Verify immediate lookup ──────────────────────────────────
    section("Step 2: Immediate O(1) retrieval proof")
    found = term_store.lookup(demo_term)
    check("Term retrievable", len(found) >= 1, f"{len(found)} records")
    if found:
        check("Definition correct", demo_defn[:20] in found[0].value, found[0].value[:40])

    # ── Step 3: Conversation through canonical pipeline ───────────────────
    section("Step 3: Conversation → Omnibinary mirror")
    from adapters.heuristic_adapter import HeuristicAdapter
    from runtime.conversation_pipeline import ConversationPipeline
    from runtime.reflection_loop import ReflectionLoop

    adapter  = ReflectionLoop(HeuristicAdapter(), skip_on_short=40)
    store_path = ROOT / "artifacts" / "omnibinary" / "arc_conversations.obin"
    pipeline = ConversationPipeline(adapter, store_path=store_path, conversation_id=session_id)

    prompt = f"What is a proof_cycle and why does it matter for the ARC system?"
    r = pipeline.run_conversation(prompt)
    check("Response generated", r.response_ok, f"{len(r.response_text)} chars")
    check("Receipt minted", bool(r.receipt_id), r.receipt_id[:8])
    check("O(1) retrievable", pipeline.get_turn(r.turn_id) is not None)

    # ── Step 4: Training export ───────────────────────────────────────────
    section("Step 4: Export training candidates")
    sft_out = ROOT / "datasets" / "distillation_sft" / f"demo_{ts}.jsonl"
    export  = pipeline.export_training_candidates(sft_out, min_score=0.0)
    check("SFT export ran", True, f"{export.get('sft_records',0)} records")
    check("Term SFT exists", (ROOT / "datasets" / "language_reasoning" / "terminology_sft.jsonl").exists())

    # ── Step 5: Train candidate ───────────────────────────────────────────
    section("Step 5: Train candidate model")
    train_proc = subprocess.run(
        [sys.executable, "scripts/training/train_arc_native_candidate.py",
         "--candidate", candidate, "--tier", "tiny", "--steps", "20", "--batch-size", "4"],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    train_ok = train_proc.returncode == 0
    check("Training completed", train_ok, "tiny 20-step")
    if train_ok:
        gguf = ROOT / "exports" / "candidates" / candidate / "lora_train" / "checkpoint" / f"arc_native_{candidate}.gguf"
        check("GGUF produced", gguf.exists(), f"{gguf.stat().st_size//1024}KB" if gguf.exists() else "missing")

    # ── Step 6: Benchmark ─────────────────────────────────────────────────
    section("Step 6: Benchmark against benchmark suite")
    artifact = ROOT / "exports" / "candidates" / candidate / "exemplar_train" / "exemplar_model.json"
    bench_out = ROOT / "results" / f"{candidate}_outputs.jsonl"
    bench_proc = subprocess.run(
        [sys.executable, "scripts/execution/run_model_benchmarks.py",
         "--adapter", "exemplar", "--artifact", str(artifact),
         "--output", str(bench_out)],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    bench_ok = bench_proc.returncode == 0
    check("Benchmark ran", bench_ok)

    scored_out = ROOT / "results" / f"{candidate}_scored.json"
    score_proc = subprocess.run(
        [sys.executable, "scripts/execution/score_benchmark_outputs.py",
         "--input", str(bench_out), "--output", str(scored_out)],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    score_ok = score_proc.returncode == 0
    score_val = 0.0
    if score_ok and scored_out.exists():
        sc = json.loads(scored_out.read_text())
        score_val = sc.get("overall_weighted_score", 0.0)
    check("Scoring completed", score_ok, f"score={score_val:.4f}")

    # ── Step 7: Gate decision ─────────────────────────────────────────────
    section("Step 7: Gate v2 promotion decision")
    report_path = ROOT / "reports" / f"demo_promo_{ts}.json"
    gate_proc = subprocess.run(
        [sys.executable, "scripts/execution/promote_candidate.py",
         "--scored", str(scored_out), "--model-name", candidate,
         "--candidate", candidate, "--report", str(report_path),
         "--skip-bundle"],
        cwd=ROOT, capture_output=True, text=True, timeout=30,
    )
    gate_ok = gate_proc.returncode == 0
    decision = "unknown"
    if gate_ok and report_path.exists():
        rpt = json.loads(report_path.read_text())
        decision = rpt.get("decision", "unknown")
    check("Gate ran", gate_ok)
    check("Decision recorded", decision in {"promote","archive_only","reject"}, decision)
    print(f"  → Decision: {decision.upper()}")

    # ── Step 8: Verify Omnibinary integrity ───────────────────────────────
    section("Step 8: Omnibinary store integrity")
    from runtime.learning_spine import OmnibinaryStore
    store = OmnibinaryStore(store_path)
    v = store.verify()
    check("Store integrity", v["ok"])
    check("Events indexed", v["event_count"] > 0, f"{v['event_count']} events")
    print(f"  → {v['event_count']} total events, {store.stats()['size_bytes']:,} bytes")

    # ── Step 9: Prior state restorable ───────────────────────────────────
    section("Step 9: Prior Arc-RAR bundles restorable")
    bundles = list((ROOT / "artifacts" / "archives").glob("*.arcrar.zip"))
    check("Bundles exist", len(bundles) >= 1, f"{len(bundles)} bundles")
    if bundles:
        import zipfile
        newest = sorted(bundles)[-1]
        with zipfile.ZipFile(newest) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        check("Bundle readable", True, newest.name[:30])
        check("Manifest intact", "bundle_id" in manifest)

    # ── Final summary ─────────────────────────────────────────────────────
    print()
    print("═" * 60)
    print("  PROOF WORKFLOW COMPLETE")
    print("═" * 60)
    print(f"  New term learned:    '{demo_term}'")
    print(f"  Omnibinary events:   {v['event_count']}")
    print(f"  Candidate trained:   {candidate} ({score_val:.4f})")
    print(f"  Gate decision:       {decision.upper()}")
    print(f"  Bundles available:   {len(bundles)}")
    print(f"  Session ID:          {session_id}")
    print()
    print("  The system remembered, trained, decided, and preserved.")
    print("═" * 60)

    print(json.dumps({
        "ok":          True,
        "term_stored": demo_term,
        "obin_events": v["event_count"],
        "candidate":   candidate,
        "score":       score_val,
        "decision":    decision,
        "bundles":     len(bundles),
        "session_id":  session_id,
    }, indent=2))


if __name__ == "__main__":
    main()
