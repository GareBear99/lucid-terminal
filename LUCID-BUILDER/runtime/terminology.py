"""runtime/terminology.py

ARC Live Terminology Layer — automatic word/meaning learning from conversation.

The language module is the permanent truth spine. This module is the live
intake layer that reads conversations and extracts:
  - definitions  ("X means Y")
  - aliases      ("X is also called Y")
  - corrections  ("X does NOT mean Y; it means Z")
  - relationships ("X feeds into Y", "X is a component of Y")
  - canonical terms ("we call this X")

Extracted records are stored in the Omnibinary conversation store as
event_type='terminology_event' and written to the local terminology
JSON database for immediate retrieval.

The terminology store is intentionally simple — it is not a full
knowledge graph. It is a governed accumulation surface that feeds
the language module and future training waves.

Usage
─────
    from runtime.terminology import TerminologyStore

    store = TerminologyStore()
    store.absorb_from_conversation(conversation_text)
    store.lookup("omnibinary")
    store.dump_for_training()
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TERM_DB_PATH = ROOT / "artifacts" / "omnibinary" / "terminology.json"

# ── extraction patterns ───────────────────────────────────────────────────────
# These patterns catch common definitional sentence structures in English.
_PATTERNS: list[tuple[str, str, re.Pattern]] = [
    ("definition", "X means Y",
     re.compile(r"['\"]?(\w[\w\s\-]{1,40})['\"]?\s+(?:means?|is defined as|refers? to|denotes?)\s+(.{10,200})", re.I)),
    ("alias", "X is also called Y",
     re.compile(r"['\"]?(\w[\w\s\-]{1,40})['\"]?\s+(?:is also called|is also known as|aka|a\.k\.a\.)\s+['\"]?(\w[\w\s\-]{1,40})['\"]?", re.I)),
    ("correction", "X does NOT mean Y",
     re.compile(r"['\"]?(\w[\w\s\-]{1,40})['\"]?\s+does\s+not\s+mean\s+(.{5,100})", re.I)),
    ("canonical", "we call this X",
     re.compile(r"(?:we call|we use the term|the term is|coined|named)\s+['\"]?(\w[\w\s\-]{1,40})['\"]?\s+(?:to|for|as)?\s*(.{5,100})", re.I)),
    ("relationship", "X feeds into Y",
     re.compile(r"['\"]?(\w[\w\s\-]{1,30})['\"]?\s+(?:feeds into|produces|enables|provides|supports|is used by|is consumed by)\s+['\"]?(\w[\w\s\-]{1,30})['\"]?", re.I)),
]


# ── data types ────────────────────────────────────────────────────────────────

@dataclass
class TermRecord:
    term_id:     str = field(default_factory=lambda: uuid4().hex[:12])
    term:        str = ""
    record_type: str = "definition"   # definition | alias | correction | canonical | relationship
    value:       str = ""             # the definition / alias target / relationship target
    source_text: str = ""             # the sentence it was extracted from
    confidence:  float = 0.7
    provenance:  str = "conversation_extraction"
    created_at:  str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    session_id:  str = ""
    approved:    bool = False          # True once human-verified


# ── store ─────────────────────────────────────────────────────────────────────

class TerminologyStore:
    """Governs live terminology learning from conversation.

    Stores extracted term records locally in JSON and mirrors to Omnibinary.
    All writes are append-safe. Reads are O(1) via in-memory index.
    """

    def __init__(
        self,
        db_path: Path | None = None,
        obin_path: Path | None = None,
        auto_approve_threshold: float = 0.85,
    ) -> None:
        self._db_path = db_path or TERM_DB_PATH
        self._obin_path = obin_path or (ROOT / "artifacts" / "omnibinary" / "arc_conversations.obin")
        self._auto_approve = auto_approve_threshold
        self._db: dict[str, TermRecord] = {}
        self._term_index: dict[str, list[str]] = {}  # term -> [term_id, ...]
        self._load()

    # ── persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        if self._db_path.exists():
            try:
                raw = json.loads(self._db_path.read_text(encoding="utf-8"))
                for entry in raw.get("records", []):
                    rec = TermRecord(**entry)
                    self._db[rec.term_id] = rec
                    self._term_index.setdefault(rec.term.lower(), []).append(rec.term_id)
            except Exception:
                pass

    def _save(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "record_count": len(self._db),
            "records": [asdict(r) for r in self._db.values()],
        }
        self._db_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _mirror_to_obin(self, rec: TermRecord) -> None:
        try:
            from runtime.learning_spine import LearningEvent, OmnibinaryStore
            store = OmnibinaryStore(self._obin_path)
            ev = LearningEvent(
                ts_utc=int(time.time()),
                source="terminology_store",
                event_type="terminology_event",
                payload=asdict(rec),
                event_id=rec.term_id,
            )
            store.append(ev)
        except Exception:
            pass   # mirror failure is non-fatal

    # ── extraction ────────────────────────────────────────────────────────────

    def extract_from_text(self, text: str, session_id: str = "") -> list[TermRecord]:
        """Extract terminology records from a block of text."""
        records: list[TermRecord] = []
        seen: set[tuple[str, str]] = set()
        for sent in re.split(r"[.!?]\s+", text):
            sent = sent.strip()
            if len(sent) < 10:
                continue
            for record_type, _desc, pattern in _PATTERNS:
                for m in pattern.finditer(sent):
                    term  = m.group(1).strip()
                    value = m.group(2).strip().rstrip(".,;")
                    if not term or not value:
                        continue
                    key = (term.lower(), record_type)
                    if key in seen:
                        continue
                    seen.add(key)
                    # Confidence: higher for corrections and canonicals
                    conf = 0.75 if record_type in ("definition", "relationship") else 0.85
                    rec = TermRecord(
                        term=term,
                        record_type=record_type,
                        value=value,
                        source_text=sent[:300],
                        confidence=conf,
                        session_id=session_id,
                        approved=conf >= self._auto_approve,
                    )
                    records.append(rec)
        return records

    # ── public API ────────────────────────────────────────────────────────────

    def absorb_from_conversation(
        self,
        text: str,
        session_id: str = "",
        mirror: bool = True,
    ) -> list[TermRecord]:
        """Extract and store terminology from conversation text.

        Returns list of newly added records.
        """
        extracted = self.extract_from_text(text, session_id=session_id)
        new_records: list[TermRecord] = []
        for rec in extracted:
            # Dedup: skip if same term+type+value already stored
            existing_ids = self._term_index.get(rec.term.lower(), [])
            duplicate = any(
                self._db[eid].record_type == rec.record_type
                and self._db[eid].value.lower() == rec.value.lower()
                for eid in existing_ids
                if eid in self._db
            )
            if duplicate:
                continue
            self._db[rec.term_id] = rec
            self._term_index.setdefault(rec.term.lower(), []).append(rec.term_id)
            new_records.append(rec)
            if mirror:
                self._mirror_to_obin(rec)
        if new_records:
            self._save()
        return new_records

    def lookup(self, term: str) -> list[TermRecord]:
        """Return all records for a term (case-insensitive)."""
        ids = self._term_index.get(term.lower(), [])
        return [self._db[i] for i in ids if i in self._db]

    def approve(self, term_id: str) -> bool:
        """Human-approve a terminology record."""
        if term_id in self._db:
            self._db[term_id].approved = True
            self._save()
            return True
        return False

    def correct(self, term: str, correct_value: str, session_id: str = "") -> TermRecord:
        """Record a correction: 'term does NOT mean X; it means correct_value'."""
        rec = TermRecord(
            term=term,
            record_type="correction",
            value=correct_value,
            source_text=f"[manual correction] {term} means: {correct_value}",
            confidence=0.99,
            session_id=session_id,
            approved=True,
        )
        self._db[rec.term_id] = rec
        self._term_index.setdefault(rec.term.lower(), []).append(rec.term_id)
        self._save()
        self._mirror_to_obin(rec)
        return rec

    def stats(self) -> dict[str, Any]:
        type_counts: dict[str, int] = {}
        approved = 0
        for rec in self._db.values():
            type_counts[rec.record_type] = type_counts.get(rec.record_type, 0) + 1
            if rec.approved:
                approved += 1
        return {
            "total_records": len(self._db),
            "approved_records": approved,
            "pending_approval": len(self._db) - approved,
            "by_type": type_counts,
            "unique_terms": len(self._term_index),
        }

    def dump_for_training(self, output_path: Path | None = None) -> dict[str, Any]:
        """Export approved records as SFT training pairs for the next model wave."""
        out = output_path or ROOT / "datasets" / "language_reasoning" / "terminology_sft.jsonl"
        out.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with out.open("w", encoding="utf-8") as f:
            for rec in self._db.values():
                if not rec.approved:
                    continue
                if rec.record_type == "definition":
                    prompt = f"What does '{rec.term}' mean in the ARC system?"
                    target = rec.value
                elif rec.record_type == "alias":
                    prompt = f"What is another name for '{rec.term}'?"
                    target = f"'{rec.term}' is also known as '{rec.value}'."
                elif rec.record_type == "correction":
                    prompt = f"Is this correct: '{rec.term}' means something different from its common usage?"
                    target = f"Correct: '{rec.term}' specifically means: {rec.value}"
                elif rec.record_type == "relationship":
                    prompt = f"How does '{rec.term}' relate to other system components?"
                    target = f"'{rec.term}' {rec.value}."
                else:
                    continue
                record = {
                    "prompt": prompt, "target": target,
                    "capability": "lexical_accuracy",
                    "source": f"terminology_store:{rec.provenance}",
                    "term_id": rec.term_id,
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1
        return {"output": str(out), "sft_records": count}


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="ARC Terminology Store")
    ap.add_argument("--stats",    action="store_true")
    ap.add_argument("--lookup",   default=None, metavar="TERM")
    ap.add_argument("--absorb",   default=None, metavar="TEXT")
    ap.add_argument("--correct",  nargs=2, metavar=("TERM","VALUE"))
    ap.add_argument("--dump",     action="store_true", help="Export training pairs")
    args = ap.parse_args()

    store = TerminologyStore()

    if args.stats:
        print(json.dumps(store.stats(), indent=2))
    elif args.lookup:
        records = store.lookup(args.lookup)
        print(json.dumps([asdict(r) for r in records], indent=2))
    elif args.absorb:
        new = store.absorb_from_conversation(args.absorb)
        print(json.dumps({"new_records": len(new), "records": [asdict(r) for r in new]}, indent=2))
    elif args.correct:
        rec = store.correct(args.correct[0], args.correct[1])
        print(json.dumps(asdict(rec), indent=2))
    elif args.dump:
        result = store.dump_for_training()
        print(json.dumps(result, indent=2))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
