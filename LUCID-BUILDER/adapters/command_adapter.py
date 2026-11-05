from __future__ import annotations

import json
import os
import selectors
import shlex
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from adapters.base import ModelAdapter, ModelResponse


class CommandAdapter(ModelAdapter):
    name = "command"
    promotable = True

    def __init__(
        self,
        command_template: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        first_output_timeout_seconds: float | None = None,
        idle_timeout_seconds: float | None = None,
        max_output_bytes: int | None = None,
        **_: Any,
    ) -> None:
        self.command_template = command_template or os.getenv("COGNITION_COMMAND_TEMPLATE")
        if not self.command_template:
            raise ValueError("command_template is required for command adapter")
        self.model = model or os.getenv("COGNITION_MODEL_PATH") or os.getenv("COGNITION_MODEL_NAME") or ""
        self.timeout_seconds = float(timeout_seconds or os.getenv("COGNITION_TIMEOUT_SECONDS") or 120)
        self.first_output_timeout_seconds = float(first_output_timeout_seconds or os.getenv("COGNITION_FIRST_OUTPUT_TIMEOUT_SECONDS") or 30)
        self.idle_timeout_seconds = float(idle_timeout_seconds or os.getenv("COGNITION_IDLE_TIMEOUT_SECONDS") or 20)
        self.max_output_bytes = int(max_output_bytes or os.getenv("COGNITION_MAX_OUTPUT_BYTES") or 262144)

    def backend_identity(self) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "model": self.model,
            "command_template": self.command_template,
            "timeout_seconds": self.timeout_seconds,
            "first_output_timeout_seconds": self.first_output_timeout_seconds,
            "idle_timeout_seconds": self.idle_timeout_seconds,
            "max_output_bytes": self.max_output_bytes,
        }

    def _build_command(self, prompt: str, system_prompt: str) -> tuple[list[str], tempfile.TemporaryDirectory[str]]:
        tempdir = tempfile.TemporaryDirectory(prefix="cognition_command_")
        temp_path = Path(tempdir.name)
        prompt_file = temp_path / "prompt.txt"
        system_prompt_file = temp_path / "system_prompt.txt"
        combined_prompt_file = temp_path / "combined_prompt.txt"
        prompt_file.write_text(prompt, encoding="utf-8")
        system_prompt_file.write_text(system_prompt, encoding="utf-8")
        combined_prompt_file.write_text(f"[SYSTEM]\n{system_prompt}\n\n[USER]\n{prompt}\n", encoding="utf-8")
        command = self.command_template.format(
            prompt=prompt,
            system_prompt=system_prompt,
            model=self.model,
            prompt_file=str(prompt_file),
            system_prompt_file=str(system_prompt_file),
            combined_prompt_file=str(combined_prompt_file),
        )
        return shlex.split(command), tempdir

    def healthcheck(self) -> dict[str, Any]:
        probe, tempdir = self._build_command("READY", "healthcheck")
        executable = probe[0] if probe else ""
        executable_exists = bool(executable) and (Path(executable).exists() or shutil.which(executable) is not None)
        model_required = "{model}" in self.command_template
        model_exists = (not model_required) or (bool(self.model) and Path(self.model).exists())
        tempdir.cleanup()
        return {
            "ok": executable_exists and model_exists,
            "adapter": self.name,
            "model": self.model,
            "model_required": model_required,
            "model_exists": model_exists,
            "executable": executable,
            "executable_exists": executable_exists,
            "timeout_seconds": self.timeout_seconds,
            "first_output_timeout_seconds": self.first_output_timeout_seconds,
            "idle_timeout_seconds": self.idle_timeout_seconds,
            "max_output_bytes": self.max_output_bytes,
        }

    def smokecheck(self, prompt: str = "Reply with READY.") -> dict[str, Any]:
        response = self.generate(prompt, system_prompt="backend smokecheck")
        return {
            "ok": response.ok and bool(response.text.strip()),
            "text": response.text[:120],
            "error": response.error,
            "finish_reason": response.finish_reason,
            "latency_ms": response.latency_ms,
            "meta": response.meta,
        }

    def _response(self, *, started: float, command: list[str], stdout: bytearray, stderr: bytearray, returncode: int, finish_reason: str, state_trace: list[dict[str, Any]], error: str | None) -> ModelResponse:
        out_text = bytes(stdout).decode("utf-8", errors="replace").strip()
        err_text = bytes(stderr).decode("utf-8", errors="replace").strip()
        text = out_text
        meta: dict[str, Any] = {
            "command": command,
            "returncode": returncode,
            "stderr": err_text,
            "state_trace": state_trace,
            "stdout_bytes": len(stdout),
            "stderr_bytes": len(stderr),
        }
        if out_text.startswith("{"):
            try:
                payload = json.loads(out_text)
            except Exception:
                payload = None
            if isinstance(payload, dict):
                text = str(payload.get("text", payload.get("output", out_text))).strip()
                if isinstance(payload.get("meta"), dict):
                    meta.update(payload["meta"])
        first_output_ms = None
        for row in state_trace:
            if row.get("state") == "GENERATING":
                first_output_ms = row.get("t_ms")
                break
        meta["first_output_ms"] = first_output_ms
        meta["output_preview"] = text[:200]
        ok = returncode == 0 and bool(text) and error is None
        if not ok and error is None:
            error = err_text or f"command exited {returncode}"
        return ModelResponse(
            text=text,
            meta=meta,
            ok=ok,
            error=error,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            finish_reason=finish_reason,
            backend_identity=f"{self.name}:{self.model}",
        )

    def generate(self, prompt: str, *, system_prompt: str = "", context: dict | None = None) -> ModelResponse:
        started = time.perf_counter()
        command, tempdir = self._build_command(prompt, system_prompt)
        state_trace: list[dict[str, Any]] = []

        def mark(state: str, **extra: Any) -> None:
            row = {"state": state, "t_ms": round((time.perf_counter() - started) * 1000, 2)}
            row.update(extra)
            state_trace.append(row)

        executable = command[0] if command else ""
        if not executable or (Path(executable).exists() is False and shutil.which(executable) is None):
            mark("FAILED", reason="missing_executable")
            try:
                return self._response(started=started, command=command, stdout=bytearray(), stderr=bytearray(), returncode=127, finish_reason="failed", state_trace=state_trace, error="command executable not found")
            finally:
                tempdir.cleanup()
        if "{model}" in self.command_template and (not self.model or not Path(self.model).exists()):
            mark("FAILED", reason="missing_model")
            try:
                return self._response(started=started, command=command, stdout=bytearray(), stderr=bytearray(), returncode=2, finish_reason="failed", state_trace=state_trace, error="model path required by command template was not provided or does not exist")
            finally:
                tempdir.cleanup()

        mark("BOOTING")
        try:
            proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
        except Exception as exc:
            mark("FAILED", reason="spawn_error")
            try:
                return self._response(started=started, command=command, stdout=bytearray(), stderr=bytearray(), returncode=1, finish_reason="failed", state_trace=state_trace, error=str(exc))
            finally:
                tempdir.cleanup()

        selector = selectors.DefaultSelector()
        if proc.stdout is not None:
            selector.register(proc.stdout, selectors.EVENT_READ, data="stdout")
        if proc.stderr is not None:
            selector.register(proc.stderr, selectors.EVENT_READ, data="stderr")

        stdout = bytearray()
        stderr = bytearray()
        first_output_seen = False
        last_output_at = time.perf_counter()
        loading_marked = False
        tokenizing_marked = False
        output_events = 0
        finish_reason = "completed"
        error: str | None = None

        while True:
            now = time.perf_counter()
            elapsed = now - started
            if elapsed > self.timeout_seconds:
                finish_reason = "timed_out"
                error = f"runtime timeout after {self.timeout_seconds}s"
                mark("TIMED_OUT", reason="overall_timeout")
                proc.kill()
                break
            if not first_output_seen and elapsed > self.first_output_timeout_seconds:
                finish_reason = "stalled_tokenization"
                error = f"no generation within {self.first_output_timeout_seconds}s"
                if not tokenizing_marked:
                    mark("TOKENIZING", reason="no_generation_timeout")
                    tokenizing_marked = True
                mark("FAILED", reason="first_output_timeout")
                proc.kill()
                break
            if first_output_seen and (now - last_output_at) > self.idle_timeout_seconds:
                finish_reason = "stalled_generation"
                error = f"generation heartbeat stalled for {self.idle_timeout_seconds}s"
                mark("STREAM_IDLE", reason="idle_timeout")
                mark("FAILED", reason="stalled_generation")
                proc.kill()
                break

            events = selector.select(timeout=0.1)
            if events and not loading_marked:
                mark("MODEL_LOADING")
                loading_marked = True
            if events:
                for key, _ in events:
                    stream_name = key.data
                    fileobj = key.fileobj
                    chunk = fileobj.read1(4096) if hasattr(fileobj, 'read1') else fileobj.read(4096)
                    if not chunk:
                        try:
                            selector.unregister(fileobj)
                        except Exception:
                            pass
                        continue
                    if stream_name == "stdout":
                        stdout.extend(chunk)
                        if not first_output_seen:
                            first_output_seen = True
                            mark("GENERATING")
                        output_events += 1
                        last_output_at = time.perf_counter()
                    else:
                        stderr.extend(chunk)
                        if not first_output_seen and not tokenizing_marked:
                            mark("TOKENIZING")
                            tokenizing_marked = True
                    if len(stdout) > self.max_output_bytes:
                        finish_reason = "failed"
                        error = f"output exceeded max_output_bytes={self.max_output_bytes}"
                        mark("FAILED", reason="max_output_bytes")
                        proc.kill()
                        break
                if error:
                    break
            elif proc.poll() is not None:
                break

        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()
            proc.wait(timeout=2)
        if finish_reason == "completed":
            mark("COMPLETED", output_events=output_events)
        return self._response(started=started, command=command, stdout=stdout, stderr=stderr, returncode=proc.returncode or 0, finish_reason=finish_reason, state_trace=state_trace, error=error)
