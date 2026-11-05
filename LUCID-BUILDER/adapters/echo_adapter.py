from __future__ import annotations

from adapters.base import ModelAdapter, ModelResponse


class EchoAdapter(ModelAdapter):
    name = "echo"

    def generate(self, prompt: str, *, system_prompt: str = "", context: dict | None = None) -> ModelResponse:
        combined = f"{system_prompt}\n{prompt}".strip()
        return ModelResponse(text=combined[:4000], meta={"adapter": self.name, "mode": "echo"})
