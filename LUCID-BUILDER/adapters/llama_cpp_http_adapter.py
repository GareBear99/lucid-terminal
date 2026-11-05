from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from adapters.base import ModelAdapter, ModelResponse


class LlamaCppHttpAdapter(ModelAdapter):
    name = "llama_cpp_http"

    def __init__(self, endpoint: str | None = None, model: str | None = None, timeout_seconds: int | None = None) -> None:
        base_url = (
            os.environ.get("COGNITION_BASE_URL")
            or os.environ.get("COGNITION_GGUF_BASE_URL")
            or os.environ.get("LLAMA_CPP_BASE_URL")
            or "http://127.0.0.1:8080"
        ).rstrip("/")
        self.endpoint = endpoint or f"{base_url}/v1/chat/completions"
        self.model = (
            model
            or os.environ.get("COGNITION_MODEL_NAME")
            or os.environ.get("LLAMA_CPP_MODEL")
            or "gguf-candidate"
        )
        self.timeout_seconds = int(
            timeout_seconds
            or os.environ.get("COGNITION_TIMEOUT_SECONDS")
            or os.environ.get("LLAMA_CPP_TIMEOUT_SECONDS")
            or 60
        )

    def backend_identity(self) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "endpoint": self.endpoint,
            "model": self.model,
            "transport": "http-openai-compatible",
        }

    def _request_json(self, url: str, payload: dict[str, Any] | None = None, method: str = "GET") -> tuple[dict[str, Any] | None, str | None, int | None, float]:
        started = time.perf_counter()
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                body = resp.read().decode("utf-8")
                status = getattr(resp, "status", 200)
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            if not body.strip():
                return None, "Empty response body", status, elapsed
            return json.loads(body), None, status, elapsed
        except urllib.error.HTTPError as exc:
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            try:
                body = exc.read().decode("utf-8")
            except Exception:
                body = ""
            return None, f"HTTP {exc.code}: {body or exc.reason}", exc.code, elapsed
        except urllib.error.URLError as exc:
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            return None, f"URL error: {exc.reason}", None, elapsed
        except json.JSONDecodeError as exc:
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            return None, f"Invalid JSON response: {exc}", None, elapsed
        except Exception as exc:
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            return None, str(exc), None, elapsed

    def healthcheck(self) -> dict[str, Any]:
        health_url = self.endpoint.replace('/v1/chat/completions', '/health')
        payload, error, status, latency_ms = self._request_json(health_url, method='GET')
        return {
            "ok": error is None,
            "endpoint": health_url,
            "status": status,
            "latency_ms": latency_ms,
            "error": error,
            "payload": payload,
            "identity": self.backend_identity(),
        }

    def smokecheck(self, prompt: str = "Reply with the single word READY.") -> dict[str, Any]:
        response = self.generate(prompt, system_prompt="You are a concise backend healthcheck agent.")
        return {
            "ok": response.ok and bool(response.text.strip()),
            "text": response.text[:120],
            "error": response.error,
            "latency_ms": response.latency_ms,
            "identity": self.backend_identity(),
        }

    def generate(self, prompt: str, *, system_prompt: str = "", context: dict | None = None) -> ModelResponse:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt or "You are a cognition-core candidate."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
        data, error, _status, latency_ms = self._request_json(self.endpoint, payload=payload, method='POST')
        if error is not None or data is None:
            return ModelResponse(
                text="",
                meta={"adapter": self.name, "endpoint": self.endpoint, "model": self.model},
                ok=False,
                error=error or "No response payload returned.",
                latency_ms=latency_ms,
                backend_identity=f"{self.name}:{self.model}@{self.endpoint}",
            )
        try:
            choice = data["choices"][0]
            message = choice.get("message", {})
            text = message.get("content", "")
            if not isinstance(text, str) or not text.strip():
                raise KeyError("content")
            usage = data.get("usage", {})
            return ModelResponse(
                text=text,
                meta={"adapter": self.name, "endpoint": self.endpoint, "model": self.model, "raw_finish_reason": choice.get("finish_reason")},
                ok=True,
                latency_ms=latency_ms,
                finish_reason=choice.get("finish_reason"),
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                backend_identity=f"{self.name}:{self.model}@{self.endpoint}",
            )
        except Exception:
            return ModelResponse(
                text="",
                meta={"adapter": self.name, "endpoint": self.endpoint, "model": self.model, "raw_response": data},
                ok=False,
                error="Response missing choices[0].message.content",
                latency_ms=latency_ms,
                backend_identity=f"{self.name}:{self.model}@{self.endpoint}",
            )
