#!/usr/bin/env python3
"""Resident local reply — instant reply for the per-chat dropdown.

Covers the instant-reply build (Gary, 2026-11-06): a local model
selected in the per-chat dropdown must reply INSTANTLY, not
cold-load on every reply. The mechanism is resident llamafile
servers in core/llm_backend.py — the first reply for a model starts
one `llamafile --server` for it (the one-time load); every later
reply for that model POSTs to the already-running server.

Tests (no real llamafile binary or model file needed — a tiny fake
HTTP server stands in for the llamafile server, and the spawn is
recorded, not executed):
- a local model replies twice and the server is started ONCE (the
  second reply reuses the resident server — no cold-load, no second
  spawn), and the server sees both completion requests;
- return_stats comes back from the resident server's timings;
- a different model gets its own resident server;
- shutdown_resident_servers() clears the registry (no orphan);
- the per-chat dropdown choice is honored for general questions:
  _prefer_requested_model returns the request's selected model when
  it can answer, else None (tier fallback).

Run with: python3 LUCID-BACKEND/tests/test_resident_local_reply.py
Exit code is non-zero on any failure.
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Same two roots stdio_agent.py itself sets up.
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.enhanced_agent import EnhancedLuciferAgent
from core import llm_backend as lb
from core.llm_backend import NativeLlamafileBackend

FAILURES = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


class _FakeProcess:
    """A stand-in for the llamafile server subprocess."""

    def __init__(self):
        self.killed = False

    def poll(self):
        return None  # still running

    def kill(self):
        self.killed = True


class _FakeLlamafileHandler(BaseHTTPRequestHandler):
    """A llamafile server: /health + /completion. Records every
    completion request (prompt + count) so the test can prove the
    resident server was reused."""

    completions = []
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, status=404)

    def do_POST(self):
        if self.path != "/completion":
            self._send_json({"error": "not found"}, status=404)
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = {}
        type(self).completions.append(payload)
        self._send_json(
            {
                "content": "canned reply",
                "timings": {"prompt_n": 5, "predicted_n": 3},
            }
        )


def _bare_backend(model):
    """A NativeLlamafileBackend without __init__ (no real model file
    needed — the resident path only passes the path through)."""
    backend = object.__new__(NativeLlamafileBackend)
    backend.model = model
    backend.model_path = Path(f"/tmp/fake-models/{model}.gguf")
    backend.llamafile_path = Path("/tmp/fake/llamafile")
    backend.verbose = False
    return backend


def test_resident_server_reused_across_replies():
    """The mandated test: two replies for the same local model start
    ONE server (the second reply reuses it — no cold-load)."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeLlamafileHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    _FakeLlamafileHandler.completions = []
    spawn_calls = []
    fake_processes = []

    def fake_spawn(model, model_path, spawn_port):
        proc = _FakeProcess()
        fake_processes.append(proc)
        spawn_calls.append((model, str(model_path), spawn_port))
        return proc

    orig_find = lb._find_free_port
    orig_spawn = lb._spawn_resident_server
    lb._find_free_port = lambda *a, **k: port
    lb._spawn_resident_server = fake_spawn
    try:
        backend = _bare_backend("tinyllama")
        first = backend.generate("hello", max_tokens=50)
        second = backend.generate("hello again", max_tokens=50)
        check("first reply returns the resident completion", first == "canned reply", repr(first))
        check("second reply returns the resident completion", second == "canned reply", repr(second))
        check(
            "server started exactly once across two replies (no cold-load on the second)",
            len(spawn_calls) == 1,
            f"spawn called {len(spawn_calls)} times: {spawn_calls}",
        )
        check(
            "resident server saw both completion requests",
            len(_FakeLlamafileHandler.completions) == 2,
            f"saw {len(_FakeLlamafileHandler.completions)}",
        )
        prompts = [c.get("prompt", "") for c in _FakeLlamafileHandler.completions]
        check("both prompts reached the resident server", "hello" in prompts[0] and "hello again" in prompts[1], repr(prompts))

        # return_stats comes back from the resident server's timings.
        text, stats = backend.generate("hi", max_tokens=50, return_stats=True)
        check("return_stats returns the completion text", text == "canned reply", repr(text))
        check(
            "return_stats carries the server timings",
            stats.get("prompt_tokens") == 5 and stats.get("generated_tokens") == 3,
            repr(stats),
        )

        # A different model gets its own resident server (instant for
        # it too, once loaded) — switching models stays instant for a
        # model whose server is already up.
        other = _bare_backend("llama3.2")
        other.generate("hey", max_tokens=50)
        check(
            "a different model starts its own resident server",
            len(spawn_calls) == 2 and spawn_calls[1][0] == "llama3.2",
            repr(spawn_calls),
        )
        check(
            "both models are resident at once",
            set(lb._RESIDENT_SERVERS.keys()) == {"tinyllama", "llama3.2"},
            repr(sorted(lb._RESIDENT_SERVERS.keys())),
        )

        # Shutdown kills every resident server and clears the registry.
        lb.shutdown_resident_servers()
        check("shutdown clears the resident registry", len(lb._RESIDENT_SERVERS) == 0)
        check(
            "shutdown killed every resident server process",
            all(p.killed for p in fake_processes),
            f"killed={[p.killed for p in fake_processes]}",
        )
    finally:
        lb._find_free_port = orig_find
        lb._spawn_resident_server = orig_spawn
        lb.shutdown_resident_servers()
        server.shutdown()
        server.server_close()


def test_prefer_requested_model():
    """The dropdown's local choice is the model that replies: the
    request's selected model wins when it can answer, else None (the
    caller falls back to tier selection)."""
    agent = object.__new__(EnhancedLuciferAgent)
    agent.ollama_model = "tinyllama"
    check(
        "requested low-tier model wins over higher tiers",
        agent._prefer_requested_model(["tinyllama", "llama3.2", "mistral"]) == "tinyllama",
    )
    agent.ollama_model = "mistral"
    check(
        "requested model wins when it is usable",
        agent._prefer_requested_model(["tinyllama", "llama3.2", "mistral"]) == "mistral",
    )
    agent.ollama_model = "not-a-model"
    check(
        "unknown requested model falls back (None)",
        agent._prefer_requested_model(["tinyllama", "llama3.2"]) is None,
    )
    agent.ollama_model = None
    check(
        "no requested model falls back (None)",
        agent._prefer_requested_model(["tinyllama"]) is None,
    )


if __name__ == "__main__":
    test_resident_server_reused_across_replies()
    test_prefer_requested_model()
    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} check(s): {', '.join(FAILURES)}")
        sys.exit(1)
    print("ALL CHECKS PASSED")
