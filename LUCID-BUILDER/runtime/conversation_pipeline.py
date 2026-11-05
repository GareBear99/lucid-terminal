"""runtime/conversation_pipeline.py

THE CANONICAL CONVERSATION PIPELINE
─────────────────────────────────────
Every interaction with the system must pass through this module.
No side channels. No parallel state. One path.

Flow
────
  user prompt
    └─► run_conversation()
          ├─ adapter.generate()         (model produces response)
          ├─ write receipt              (immutable event record)
          ├─ update OmnibinaryStore     (binary mirror, O(1) indexed)
          ├─ tag training eligibility   (good/bad/neutral)
          └─ return ConversationRecord

  export_training_candidates()
    └─ scans store for eligible records
    └─ writes SFT + preference JSONL datasets

The pipeline enforces:
  - every conversation has a receipt (SHA-256 prompt hash + response hash)
  - every conversation is mirrored to the Omnibinary ledger
  - training-eligible conversations can be exported without manual curation
  - nothing touches model weights — weight updates happen only via the
    governed train/promote loop in scripts/training/
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]

# Lazy import to avoid hard dependency when not using Omnibinary
def _get_spine():
    import sys
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from runtime.learning_spine import LearningEvent, OmnibinaryStore
    return LearningEvent, OmnibinaryStore


# ── data types ────────────────────────────────────────────────────────────────

@dataclass
class ConversationRecord:
    """Immutable record of one conversation turn."""
    conversation_id: str
    turn_id: str
    ts_utc: str
    adapter: str
    prompt: str
    system_prompt: str
    response_text: str
    response_ok: bool
    latency_ms: float | None
    finish_reason: str | None
    backend_identity: str | None
    meta: dict[str, Any]

    # Training eligibility — set by caller or by auto-tag
    training_eligible: bool = False
    training_score: float = 0.0
    preferred: bool | None = None       # True = chosen, False = rejected, None = unlabelled
    correction: str | None = None       # Human-supplied better answer, if any

    # Integrity
    prompt_sha256: str = ""
    response_sha256: str = ""
    receipt_id: str = field(default_factory=lambda: uuid4().hex)

    def __post_init__(self) -> None:
        if not self.prompt_sha256:
            self.prompt_sha256 = hashlib.sha256(
                self.prompt.encode("utf-8")
            ).hexdigest()
        if not self.response_sha256:
            self.response_sha256 = hashlib.sha256(
                self.response_text.encode("utf-8")
            ).hexdigest()


# ── pipeline ──────────────────────────────────────────────────────────────────

class ConversationPipeline:
    """The single canonical conversation pipeline.

    Parameters
    ──────────
    adapter
        Any ModelAdapter instance (exemplar, heuristic, llama_cpp_http, etc.)
    store_path
        Path to the OmnibinaryStore ledger file.  Defaults to
        artifacts/omnibinary/arc_conversations.obin inside the repo root.
    conversation_id
        Session identifier. Auto-generated if not supplied.
    """

    DEFAULT_STORE = ROOT / "artifacts" / "omnibinary" / "arc_conversations.obin"

    def __init__(
        self,
        adapter: Any,
        store_path: Path | None = None,
        conversation_id: str | None = None,
    ) -> None:
        self.adapter = adapter
        self.conversation_id = conversation_id or uuid4().hex
        self._store_path = store_path or self.DEFAULT_STORE
        LearningEvent, OmnibinaryStore = _get_spine()
        self._store = OmnibinaryStore(self._store_path)
        self._LearningEvent = LearningEvent
        self._history: list[ConversationRecord] = []

    # ── core interaction ──────────────────────────────────────────────────────

    def run_conversation(
        self,
        prompt: str,
        *,
        system_prompt: str = "Plan, critique, repair, calibrate.",
        context: dict | None = None,
        auto_tag: bool = True,
    ) -> ConversationRecord:
        """Run one conversation turn through the full pipeline.

        Steps
        ─────
        1. Call adapter.generate()
        2. Build ConversationRecord
        3. Auto-tag training eligibility
        4. Mirror to OmnibinaryStore (indexed, O(1) retrievable)
        5. Append to session history
        6. Return record
        """
        turn_id = uuid4().hex
        started = time.perf_counter()
        response = self.adapter.generate(
            prompt, system_prompt=system_prompt, context=context
        )
        latency_ms = round((time.perf_counter() - started) * 1000, 2)

        record = ConversationRecord(
            conversation_id=self.conversation_id,
            turn_id=turn_id,
            ts_utc=datetime.now(timezone.utc).isoformat(),
            adapter=getattr(self.adapter, "name", str(type(self.adapter).__name__)),
            prompt=prompt,
            system_prompt=system_prompt,
            response_text=response.text,
            response_ok=response.ok,
            latency_ms=response.latency_ms or latency_ms,
            finish_reason=response.finish_reason,
            backend_identity=response.backend_identity,
            meta=response.meta or {},
        )

        if auto_tag:
            record = self._auto_tag(record)

        # Mirror to Omnibinary
        event = self._LearningEvent(
            ts_utc=int(time.time()),
            source=f"pipeline:{record.adapter}",
            event_type="conversation_turn",
            payload=asdict(record),
            event_id=record.receipt_id,
        )
        self._store.append(event)

        self._history.append(record)
        return record

    # ── training tagging ──────────────────────────────────────────────────────

    def _auto_tag(self, record: ConversationRecord) -> ConversationRecord:
        """Heuristic auto-tagging of training eligibility.

        A record is eligible if:
          - response was ok (no error)
          - response has meaningful content (≥50 chars)
          - adapter is promotable (not synthetic-only)
        Score is a simple quality proxy — rubric scoring can refine this.
        """
        from scorers.rubric import score_record
        is_promotable = getattr(self.adapter, "promotable", True)
        has_content = len(record.response_text.strip()) >= 50
        if record.response_ok and has_content and is_promotable:
            score_result = score_record(record.response_text)
            record.training_score = float(score_result.get("normalized_score", 0.0))
            record.training_eligible = record.training_score >= 0.2
        return record

    # ── labelling ─────────────────────────────────────────────────────────────

    def label_turn(
        self,
        turn_id: str,
        *,
        preferred: bool,
        correction: str | None = None,
    ) -> bool:
        """Add a human preference label to a prior turn (updates in-memory only;
        call flush_labels() to persist to the store).

        preferred=True  → this response is good (chosen)
        preferred=False → this response is bad (rejected)
        correction      → the better response text
        """
        for rec in self._history:
            if rec.turn_id == turn_id:
                rec.preferred = preferred
                rec.correction = correction
                rec.training_eligible = True
                return True
        return False

    # ── export ────────────────────────────────────────────────────────────────

    def export_training_candidates(
        self,
        sft_path: Path,
        preference_path: Path | None = None,
        min_score: float = 0.2,
    ) -> dict[str, Any]:
        """Export eligible turns as SFT + optional preference JSONL files.

        SFT format: {"prompt": ..., "target": ..., "capability": ..., ...}
        Preference format: {"prompt": ..., "chosen": ..., "rejected": ...}
        """
        sft_path.parent.mkdir(parents=True, exist_ok=True)
        sft_count = 0
        pref_count = 0

        # Scan the full store (not just session history) for exportable records
        eligible_by_prompt: dict[str, list[ConversationRecord]] = {}
        for event in self._store.scan():
            if event.event_type != "conversation_turn":
                continue
            rec_data = event.payload
            score = float(rec_data.get("training_score", 0.0))
            eligible = bool(rec_data.get("training_eligible", False))
            if not eligible or score < min_score:
                continue
            prompt = rec_data.get("prompt", "")
            rec_obj = ConversationRecord(**{
                k: rec_data.get(k, v)
                for k, v in ConversationRecord.__dataclass_fields__.items()  # type: ignore[attr-defined]
            })
            eligible_by_prompt.setdefault(prompt, []).append(rec_obj)

        with sft_path.open("w", encoding="utf-8") as sf:
            pf = open(preference_path, "w", encoding="utf-8") if preference_path else None
            try:
                for prompt, records in eligible_by_prompt.items():
                    # SFT: best-scored record per prompt
                    best = max(records, key=lambda r: r.training_score)
                    target = best.correction or best.response_text
                    sft_record = {
                        "prompt": prompt,
                        "target": target,
                        "capability": "generic",
                        "source": f"pipeline:{best.adapter}",
                        "training_score": best.training_score,
                        "ts_utc": best.ts_utc,
                        "receipt_id": best.receipt_id,
                    }
                    sf.write(json.dumps(sft_record, ensure_ascii=False) + "\n")
                    sft_count += 1

                    # Preference pairs: chosen vs rejected
                    if pf:
                        chosen = [r for r in records if r.preferred is True]
                        rejected = [r for r in records if r.preferred is False]
                        if chosen and rejected:
                            pair = {
                                "prompt": prompt,
                                "chosen": (chosen[0].correction or chosen[0].response_text),
                                "rejected": rejected[0].response_text,
                                "source": f"pipeline:{best.adapter}",
                                "ts_utc": best.ts_utc,
                            }
                            pf.write(json.dumps(pair, ensure_ascii=False) + "\n")
                            pref_count += 1
            finally:
                if pf:
                    pf.close()

        result: dict[str, Any] = {
            "sft_path": str(sft_path),
            "sft_records": sft_count,
        }
        if preference_path:
            result["preference_path"] = str(preference_path)
            result["preference_pairs"] = pref_count
        return result

    # ── inspection ────────────────────────────────────────────────────────────

    def get_turn(self, turn_id: str) -> ConversationRecord | None:
        """O(1) retrieval of any turn by turn_id or receipt_id from Omnibinary store.

        The Omnibinary event_id equals receipt_id (not turn_id). This method
        accepts either — it first tries the input as-is (works if receipt_id
        is passed), then scans session history to map turn_id → receipt_id.
        """
        # Direct lookup — works if receipt_id is passed
        event = self._store.get(turn_id)
        if event is not None:
            return ConversationRecord(**event.payload)

        # Fallback: map turn_id → receipt_id via session history
        for rec in self._history:
            if rec.turn_id == turn_id:
                event = self._store.get(rec.receipt_id)
                if event is not None:
                    return ConversationRecord(**event.payload)

        return None

    def session_history(self) -> list[ConversationRecord]:
        return list(self._history)

    def store_stats(self) -> dict[str, Any]:
        return self._store.stats()

    def verify_store(self) -> dict[str, Any]:
        return self._store.verify()


# ── standalone helper: run one prompt ────────────────────────────────────────

def run_one_prompt(
    adapter: Any,
    prompt: str,
    *,
    system_prompt: str = "Plan, critique, repair, calibrate.",
    store_path: Path | None = None,
    conversation_id: str | None = None,
    auto_tag: bool = True,
) -> ConversationRecord:
    """Convenience wrapper for one-shot prompts through the canonical pipeline."""
    pipeline = ConversationPipeline(
        adapter,
        store_path=store_path,
        conversation_id=conversation_id,
    )
    return pipeline.run_conversation(
        prompt,
        system_prompt=system_prompt,
        auto_tag=auto_tag,
    )
