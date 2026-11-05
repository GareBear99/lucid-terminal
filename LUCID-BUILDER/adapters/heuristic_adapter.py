from __future__ import annotations

from adapters.base import ModelAdapter, ModelResponse


KEYWORDS = {
    "plan": "Plan: identify the goal, preserve constraints, choose the smallest safe path, then validate.",
    "critique": "Critique: check missing evidence, regression risk, and whether the proposed fix is too broad.",
    "repair": "Repair: prefer a narrow revision that preserves working interfaces and add a targeted regression test.",
    "compress": "Compression: preserve the goal, blockers, constraints, and next action before narrative detail.",
    "calibrate": "Calibration: state likely surfaces and confidence bounds instead of claiming exact certainty.",
}


class HeuristicAdapter(ModelAdapter):
    name = "heuristic"
    promotable = False

    def backend_identity(self) -> dict:
        return {"adapter": self.name, "mode": "synthetic-baseline", "promotable": self.promotable}

    def healthcheck(self) -> dict:
        return {"ok": True, "adapter": self.name, "mode": "synthetic-baseline", "note": "Heuristic adapter is for smoke tests only and should not be treated as a live backend."}

    def generate(self, prompt: str, *, system_prompt: str = "", context: dict | None = None) -> ModelResponse:
        lowered = prompt.lower()
        lines = []
        if system_prompt:
            lines.append("Doctrine active.")
        for key, text in KEYWORDS.items():
            if key in lowered:
                lines.append(text)
        if not lines:
            lines.append("Orient: extract the task, constraints, likely risks, then answer conservatively.")
        lines.append("Confidence: bounded by available evidence.")
        return ModelResponse(text="\n".join(lines), meta={"adapter": self.name, "matched": [k for k in KEYWORDS if k in lowered], "promotable": self.promotable}, ok=True, backend_identity=f"{self.name}:synthetic-baseline")
