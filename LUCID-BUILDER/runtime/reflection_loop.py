"""runtime/reflection_loop.py

ARC Self-Reflection Loop — Draft → Critique → Revise → Emit

Every answer goes through three stages before it reaches the user:
  1. Draft   — adapter generates initial response
  2. Critique — same adapter critiques the draft for overconfidence,
                contradiction, missing constraints, and weak evidence
  3. Revise  — adapter produces a tighter final answer incorporating the critique

This is what makes responses feel more like active thinking:
not producing one answer, but producing a better one.

The critique and revise steps use the same adapter, which means:
  - with a weak model:  marginal improvement, but discipline is instilled
  - with a strong model: material improvement in calibration and precision

Integration
───────────
Use ReflectionLoop as a drop-in wrapper around any ModelAdapter:

    from runtime.reflection_loop import ReflectionLoop
    from adapters.exemplar_adapter import ExemplarAdapter

    adapter = ReflectionLoop(ExemplarAdapter(artifact="..."))
    response = adapter.generate("Plan the next training wave.")
    # response.meta["reflection"] contains all three stages
"""
from __future__ import annotations

import time
from dataclasses import asdict
from typing import Any

from adapters.base import ModelAdapter, ModelResponse


_CRITIQUE_SYSTEM = """You are a strict reviewer of your own answers.

Your job: critique the DRAFT ANSWER below for exactly three things:
1. Overconfident claims (words like 'definitely', 'certainly', 'guaranteed')
2. Missing constraints or risks that should have been mentioned
3. Anything that contradicts the system doctrine or stored constraints

Reply in this format only:
ISSUES: <one sentence per issue found, or 'none' if clean>
CONFIDENCE: <high | medium | low — how confident is the draft overall?>
FIX: <one sentence describing what the revision should do differently, or 'none needed'>
"""

_REVISE_SYSTEM = """You are revising your own answer based on a critique.

Apply the critique's FIX instruction to improve the draft.
Preserve everything correct. Change only what the critique identifies.
Do not introduce new claims. Do not lose constraints that were correctly stated.
Output only the revised answer — no preamble, no labels.
"""


class ReflectionLoop(ModelAdapter):
    """Wraps any ModelAdapter with a draft→critique→revise loop.

    Parameters
    ──────────
    adapter       : the underlying ModelAdapter (exemplar, llama_cpp_http, etc.)
    skip_on_short : if draft response is shorter than this many chars, skip
                    the loop (too short to meaningfully critique)
    """

    name = "reflection_loop"

    def __init__(
        self,
        adapter: ModelAdapter,
        skip_on_short: int = 80,
    ) -> None:
        self._adapter = adapter
        self._skip_on_short = skip_on_short
        # Inherit promotable status from wrapped adapter
        self.promotable = getattr(adapter, "promotable", True)

    def backend_identity(self) -> dict[str, Any]:
        inner = self._adapter.backend_identity()
        return {**inner, "reflection_loop": True}

    def healthcheck(self) -> dict[str, Any]:
        return self._adapter.healthcheck()

    def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        context: dict | None = None,
    ) -> ModelResponse:
        started = time.perf_counter()

        # ── Stage 1: Draft ────────────────────────────────────────────────
        draft_response = self._adapter.generate(
            prompt, system_prompt=system_prompt, context=context
        )
        draft_text = draft_response.text.strip()

        # Skip loop for very short or failed drafts
        if not draft_response.ok or len(draft_text) < self._skip_on_short:
            return ModelResponse(
                text=draft_text,
                meta={
                    **draft_response.meta,
                    "reflection": {
                        "skipped": True,
                        "reason": "draft too short or failed",
                        "draft": draft_text,
                    },
                },
                ok=draft_response.ok,
                error=draft_response.error,
                latency_ms=round((time.perf_counter() - started) * 1000, 2),
                finish_reason=draft_response.finish_reason,
                backend_identity=f"reflection_loop:{draft_response.backend_identity}",
            )

        # ── Stage 2: Critique ─────────────────────────────────────────────
        critique_prompt = f"ORIGINAL PROMPT:\n{prompt}\n\nDRAFT ANSWER:\n{draft_text}"
        critique_response = self._adapter.generate(
            critique_prompt, system_prompt=_CRITIQUE_SYSTEM, context=None
        )
        critique_text = critique_response.text.strip()

        # Parse critique to decide if revision is needed
        fix_needed = (
            critique_response.ok
            and critique_text
            and "none needed" not in critique_text.lower()
            and "none" not in _extract_field(critique_text, "FIX").lower()
        )

        # ── Stage 3: Revise ───────────────────────────────────────────────
        final_text = draft_text
        revised_text = ""
        if fix_needed:
            revise_prompt = (
                f"ORIGINAL PROMPT:\n{prompt}\n\n"
                f"DRAFT:\n{draft_text}\n\n"
                f"CRITIQUE:\n{critique_text}"
            )
            revise_response = self._adapter.generate(
                revise_prompt, system_prompt=_REVISE_SYSTEM, context=None
            )
            if revise_response.ok and revise_response.text.strip():
                revised_text = revise_response.text.strip()
                final_text = revised_text

        latency_ms = round((time.perf_counter() - started) * 1000, 2)

        reflection_meta = {
            "skipped":     False,
            "draft":       draft_text,
            "critique":    critique_text,
            "fix_needed":  fix_needed,
            "revised":     revised_text,
            "final_source": "revised" if revised_text else "draft",
        }

        return ModelResponse(
            text=final_text,
            meta={
                **draft_response.meta,
                "reflection": reflection_meta,
                "adapter_inner": draft_response.backend_identity,
            },
            ok=True,
            latency_ms=latency_ms,
            finish_reason="completed",
            backend_identity=f"reflection_loop:{draft_response.backend_identity}",
        )


def _extract_field(text: str, field: str) -> str:
    """Extract 'FIELD: value' from critique output."""
    for line in text.splitlines():
        if line.upper().startswith(f"{field.upper()}:"):
            return line.split(":", 1)[-1].strip()
    return ""
