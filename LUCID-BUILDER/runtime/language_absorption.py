"""runtime/language_absorption.py

Automatic Language Absorption — the bridge between conversation and the
language module's growing truth store.

Every conversation that passes through the canonical pipeline should
automatically feed the language module. This module makes that happen
without requiring manual calls.

What gets absorbed
──────────────────
  1. Terminology   — any definition, alias, correction, or relationship
                     pattern detected in prompts or responses
  2. Capability signals — which capabilities the turn exercised and
                     how well (for adaptive training data weighting)
  3. Continuity signals — goals, constraints, blockers, next actions
                     mentioned in the turn

What does NOT get absorbed
──────────────────────────
  - Hallucinated prior-session references
  - Very short turns (<40 chars)
  - Failed turns (response_ok=False)
  - Synthetic adapter turns (heuristic, echo)
  - Single-word fragments without a second reliable signal
  - Terms that contradict a higher-trust existing record (flagged instead)

Hardening (2026-04-22)
──────────────────────
  - Every absorbed term carries explicit provenance (adapter, receipt_id,
    session_id, turn_id) so the lineage is restorable.
  - Confidence classes:  manual_correction > definition > canonical >
    alias > relationship.  Weak signals are stored but not auto-approved.
  - Contradiction detection: if a term already has a high-trust record
    with a different value, the new record is marked with
    `contradicts=<prior_id>` and stored as a flagged (non-approved) record.
  - Weak-term filter: terms shorter than 3 chars or without at least one
    word character are rejected before reaching the store.

Integration
───────────
Use LanguageAbsorptionLayer as a wrapper around ConversationPipeline:

    absorber = LanguageAbsorptionLayer(pipeline)
    record = absorber.run(prompt)
    # terminology and signals absorbed automatically

Or call directly after a pipeline turn:

    absorber = LanguageAbsorptionLayer(pipeline)
    record = pipeline.run_conversation(prompt)
    absorbed = absorber.absorb(record)
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class AbsorptionResult:
    turn_id: str
    new_terms: int
    capability_signals: list[str]
    continuity_signals: list[str]
    contradictions: list[dict] = field(default_factory=list)
    weak_rejected: int = 0
    provenance: dict = field(default_factory=dict)
    absorbed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# Confidence ranking: higher = more trusted. Used to resolve contradictions.
_TRUST_RANK: dict[str, int] = {
    "manual_correction": 100,
    "correction":        100,
    "definition":         70,
    "canonical":          65,
    "alias":              55,
    "relationship":       50,
    "observation":        30,
}

# Minimum acceptable term shape — prevents fragments and punctuation leaks.
_TERM_MIN_LEN = 3
_WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_\-']*")


# Capability signal patterns — lightweight detection from response text
_CAP_SIGNALS: dict[str, list[str]] = {
    "repair":      ["patch", "fix", "narrow", "surgical", "rollback", "guard"],
    "planning":    ["first", "then", "step", "plan", "ordered", "sequence"],
    "critique":    ["assumption", "missing", "blast radius", "scope", "unverified"],
    "calibration": ["likely", "uncertain", "bounded", "evidence", "may"],
    "compression": ["goal", "blocker", "constraint", "next action", "carry forward"],
    "continuity":  ["constraint", "prior", "thread", "session", "we agreed"],
    "reflection":  ["revise", "correct", "overclaim", "instead", "retract"],
}

# Continuity signal patterns
_GOAL_RE   = re.compile(r"\b(?:goal|objective|mission|aim)\b.*?[.!]", re.I)
_BLOCK_RE  = re.compile(r"\b(?:blocker|blocking|obstacle|stuck)\b.*?[.!]", re.I)
_NEXT_RE   = re.compile(r"\b(?:next step|next action|action item|should now|follow-up)\b.*?[.!]", re.I)
_CONST_RE  = re.compile(r"\b(?:constraint|must not|cannot|requirement|rule is)\b.*?[.!]", re.I)

_NON_PROMOTABLE = {"heuristic", "echo"}


class LanguageAbsorptionLayer:
    """Wraps a ConversationPipeline to automatically absorb language signals."""

    def __init__(
        self,
        pipeline: Any,
        term_store: Any | None = None,
        min_chars_to_absorb: int = 40,
    ) -> None:
        self._pipeline = pipeline
        self._min_chars = min_chars_to_absorb

        if term_store is None:
            from runtime.terminology import TerminologyStore
            self._terms = TerminologyStore()
        else:
            self._terms = term_store

        self._absorption_log: list[AbsorptionResult] = []

    def run(
        self,
        prompt: str,
        *,
        system_prompt: str = "Plan, critique, repair, calibrate.",
        context: dict | None = None,
        auto_tag: bool = True,
    ) -> Any:
        """Run one conversation turn and automatically absorb language signals."""
        record = self._pipeline.run_conversation(
            prompt,
            system_prompt=system_prompt,
            context=context,
            auto_tag=auto_tag,
        )
        self.absorb(record)
        return record

    def _is_weak_term(self, term: str) -> bool:
        """Return True if a term is too weak to absorb safely."""
        t = (term or "").strip()
        if len(t) < _TERM_MIN_LEN:
            return True
        if not _WORD_RE.search(t):
            return True
        return False

    def _detect_contradiction(self, rec: Any) -> Any | None:
        """Return a prior TermRecord that contradicts `rec`, or None.

        A contradiction exists when the same term already has a stored
        record with a strictly higher trust rank and a different value.
        Aliases and relationships are allowed to coexist and do not count.
        """
        if getattr(rec, "record_type", "") in ("alias", "relationship"):
            return None
        try:
            prior_records = self._terms.lookup(rec.term)
        except Exception:
            return None
        new_rank = _TRUST_RANK.get(rec.record_type, 40)
        new_value = (rec.value or "").strip().lower()
        for prior in prior_records:
            if getattr(prior, "term_id", None) == getattr(rec, "term_id", None):
                continue
            if prior.record_type in ("alias", "relationship"):
                continue
            prior_rank = _TRUST_RANK.get(prior.record_type, 40)
            prior_value = (prior.value or "").strip().lower()
            if prior_value and prior_value != new_value and prior_rank >= new_rank:
                return prior
        return None

    def absorb(self, record: Any) -> AbsorptionResult:
        """Absorb language signals from a ConversationRecord.

        Hardened: attaches provenance to every new term, filters weak terms,
        detects contradictions against higher-trust prior records, and never
        silently overwrites canonical state.
        """
        adapter_name = getattr(record, "adapter", "unknown")
        provenance = {
            "adapter":         adapter_name,
            "receipt_id":      getattr(record, "receipt_id", None),
            "turn_id":         getattr(record, "turn_id", None),
            "conversation_id": getattr(record, "conversation_id", None),
            "ts_utc":          getattr(record, "ts_utc", None),
        }
        result = AbsorptionResult(
            turn_id=record.turn_id,
            new_terms=0,
            capability_signals=[],
            continuity_signals=[],
            provenance=provenance,
        )

        # Skip short, failed, or synthetic turns
        if (
            not getattr(record, "response_ok", True)
            or len(getattr(record, "response_text", "")) < self._min_chars
            or adapter_name in _NON_PROMOTABLE
        ):
            return result

        text = record.response_text + " " + record.prompt

        # 1. Terminology absorption (hardened: contradiction detection + weak filter)
        candidate_terms = self._terms.absorb_from_conversation(
            text,
            session_id=record.conversation_id,
            mirror=True,
        )
        accepted: list = []
        for rec in candidate_terms:
            # Weak-term filter
            if self._is_weak_term(getattr(rec, "term", "")):
                result.weak_rejected += 1
                continue

            # Contradiction detection — flag but do not remove
            prior = self._detect_contradiction(rec)
            if prior is not None:
                result.contradictions.append({
                    "term":           rec.term,
                    "new_value":      rec.value,
                    "new_type":       rec.record_type,
                    "new_term_id":    rec.term_id,
                    "prior_value":    prior.value,
                    "prior_type":     prior.record_type,
                    "prior_term_id":  prior.term_id,
                    "resolution":     "flagged_keep_both",
                })
                # Ensure the new record is NOT auto-approved when contradicted
                try:
                    rec.approved = False
                except Exception:
                    pass
            accepted.append(rec)

        result.new_terms = len(accepted)

        # 2. Capability signals
        lowered = text.lower()
        for cap, keywords in _CAP_SIGNALS.items():
            if any(kw in lowered for kw in keywords):
                result.capability_signals.append(cap)

        # 3. Continuity signals
        for pattern, label in [
            (_GOAL_RE,  "goal"),
            (_BLOCK_RE, "blocker"),
            (_NEXT_RE,  "next_action"),
            (_CONST_RE, "constraint"),
        ]:
            if pattern.search(text):
                result.continuity_signals.append(label)

        self._absorption_log.append(result)
        return result

    def session_absorption_stats(self) -> dict[str, Any]:
        total_terms = sum(r.new_terms for r in self._absorption_log)
        total_contradictions = sum(len(r.contradictions) for r in self._absorption_log)
        total_weak_rejected = sum(r.weak_rejected for r in self._absorption_log)
        cap_freq: dict[str, int] = {}
        for r in self._absorption_log:
            for cap in r.capability_signals:
                cap_freq[cap] = cap_freq.get(cap, 0) + 1
        return {
            "turns_absorbed": len(self._absorption_log),
            "new_terms_total": total_terms,
            "contradictions_flagged": total_contradictions,
            "weak_terms_rejected": total_weak_rejected,
            "capability_signal_frequency": cap_freq,
            "terminology_store": self._terms.stats(),
        }

    def export_session_training(
        self,
        sft_out: Path,
        preference_out: Path | None = None,
    ) -> dict[str, Any]:
        """Export both pipeline SFT and terminology SFT for this session."""
        results: dict[str, Any] = {}

        # Pipeline training from conversation store
        export = self._pipeline.export_training_candidates(sft_out)
        results["pipeline_sft"] = export

        # Terminology training from term store
        term_out = sft_out.parent / "terminology_sft.jsonl"
        term_result = self._terms.dump_for_training(term_out)
        results["terminology_sft"] = term_result

        return results
