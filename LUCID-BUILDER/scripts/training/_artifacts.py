from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def candidate_dir(candidate: str) -> Path:
    path = ROOT / "exports" / "candidates" / candidate
    path.mkdir(parents=True, exist_ok=True)
    return path


def stage_dir(candidate: str, stage: str) -> Path:
    path = candidate_dir(candidate) / stage
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_stage_manifest(candidate: str, stage: str, payload: dict) -> tuple[Path, dict]:
    out_dir = stage_dir(candidate, stage)
    artifact_id = payload.get("artifact_id") or f"{stage}_{uuid4().hex[:12]}"
    payload = {
        "artifact_id": artifact_id,
        "stage": stage,
        "candidate": candidate,
        "created_at": payload.get("created_at") or utc_now(),
        **payload,
    }
    manifest = out_dir / "artifact_manifest.json"
    manifest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return manifest, payload
