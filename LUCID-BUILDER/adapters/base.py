from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class ModelResponse:
    text: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)
    ok: bool = True
    error: str | None = None
    latency_ms: float | None = None
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    backend_identity: str | None = None


class ModelAdapter(ABC):
    name: str = "base"
    promotable: bool = True

    def healthcheck(self) -> dict[str, Any]:
        return {"ok": True, "adapter": self.name, "note": "No explicit healthcheck implemented."}

    def backend_identity(self) -> dict[str, Any]:
        return {"adapter": self.name}

    @abstractmethod
    def generate(self, prompt: str, *, system_prompt: str = "", context: dict | None = None) -> ModelResponse:
        raise NotImplementedError
