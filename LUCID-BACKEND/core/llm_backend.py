#!/usr/bin/env python3
"""
🧠 Unified LLM Backend - Native llamafile execution with GGUF models
Provides a single interface for all LLM operations via native llamafile subprocess calls
"""
import atexit
import os
import json
import socket
import subprocess
import time
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"  # user *state* only (history, llm_state) — NOT models
# Canonical model layout (core/lucifer_paths.py — single source of truth).
try:
    from core.lucifer_paths import llamafile_path as _canonical_llamafile_path
    from core.lucifer_paths import models_dir as _canonical_models_dir
except ImportError:  # core/ already on sys.path
    from lucifer_paths import llamafile_path as _canonical_llamafile_path
    from lucifer_paths import models_dir as _canonical_models_dir
PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = _canonical_models_dir()


class LLMBackend:
    """
    Unified interface for LLM operations.

    Automatically detects and uses:
    1. Native llamafile (preferred — local only, no server, no Ollama)
    2. Ollama (disabled in this build — see _check_ollama)

    All LLM functions work identically regardless of backend.
    """
    
    def __init__(self, model: str = "llama3.2", verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.backend_type = None
        self.backend = None
        
        # Tier-based timeouts (in seconds)
        self.tier_timeouts = {
            'tinyllama': 20,         # Tier 0: Fast responses
            'llama3.2': 30,          # Tier 1: Moderate
            'mistral': 45,           # Tier 2: More complex
            'deepseek-coder': 60,    # Tier 3: Most capable, may need more time
            'llama3.1-70b': 120,     # Tier 4: Ultra models need more time
            'mixtral-8x22b': 120,    # Tier 4: Ultra models
            'qwen-72b': 120          # Tier 4: Ultra models
        }
        
        # Conversation memory - maintains up to 200 messages (100 exchanges)
        self.conversation_history: List[Dict[str, str]] = []
        self.max_history = 200  # 200 messages total (request + response pairs)
        
        # Detect and initialize backend
        self._detect_backend()
    
    def _detect_backend(self):
        """Detect which LLM backend is available.

        Native llamafile only (local only, no server). Ollama is never
        consulted in this build — Gary's direction is no Ollama, and the
        vendored build disables it outright (see _check_ollama), which is
        stricter than the upstream llamafile-first-with-Ollama-fallback.
        """
        # Native llamafile (subprocess - local only, no server)
        if self._check_native_llamafile():
            self.backend_type = "native-llamafile"
            self.backend = NativeLlamafileBackend(self.model, self.verbose)
            if self.verbose:
                print(f"{GREEN}✅ Using native llamafile backend{RESET}")
            return

        # No backend available
        self.backend_type = None
        self.backend = None
        if self.verbose:
            print(f"{GOLD}⚠️  No native llamafile found. Please ensure '{_canonical_llamafile_path()}' exists.{RESET}")

    def _check_ollama(self) -> bool:
        """Check if Ollama is available and running."""
        # Disabled in this build: LuciferAI runs on local llamafile only.
        return False

    def _check_native_llamafile(self) -> bool:
        """Check if native llamafile binary exists (canonical layout)."""
        return _canonical_llamafile_path().exists()
    
    def is_available(self) -> bool:
        """Check if any LLM backend is available."""
        return self.backend is not None
    
    def get_backend_type(self) -> Optional[str]:
        """Get the active backend type."""
        return self.backend_type
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """
        Send chat messages to LLM and get response.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            **kwargs: Additional options (temperature, max_tokens, etc.)
        
        Returns:
            String response from LLM
        """
        if not self.backend:
            raise RuntimeError("No LLM backend available")
        
        # Don't override timeout - let backend use smart inactivity-based timeouts
        # Tier-based timeouts were causing premature termination during model loading
        # The backend will use: 
        # - 45s inactivity timeout (no tokens generated)
        # - 10min absolute maximum (streaming) or 5min (non-streaming)
        pass
        
        # Get response from backend
        response = self.backend.chat(messages, **kwargs)
        
        # Handle return_stats parameter
        return_stats = kwargs.get('return_stats', False)
        if return_stats and isinstance(response, tuple):
            # Backend returned (text, stats) tuple
            response_text = response[0]
            response_stats = response[1]
        else:
            # Backend returned just text
            response_text = response if not isinstance(response, tuple) else response[0]
            response_stats = None
        
        # Update conversation history (only if messages represent a single exchange)
        # Add the last user message and the assistant response
        if messages and not kwargs.get('skip_history', False):
            # Find the last user message
            for msg in reversed(messages):
                if msg['role'] == 'user':
                    self.conversation_history.append(msg)
                    break
            
            # Add assistant response
            self.conversation_history.append({
                'role': 'assistant',
                'content': response_text
            })
            
            # Trim history to max_history (keep most recent messages)
            if len(self.conversation_history) > self.max_history:
                # Keep system messages and trim from the middle
                system_msgs = [m for m in self.conversation_history if m['role'] == 'system']
                other_msgs = [m for m in self.conversation_history if m['role'] != 'system']
                
                # Keep most recent messages
                trimmed_msgs = other_msgs[-(self.max_history - len(system_msgs)):]
                self.conversation_history = system_msgs + trimmed_msgs
        
        # Return tuple if stats requested, otherwise just text
        if return_stats and response_stats is not None:
            return (response_text, response_stats)
        return response_text
    
    def generate(self, prompt: str, **kwargs):
        """
        Generate completion for a prompt.
        
        Args:
            prompt: Text prompt
            **kwargs: Additional options (temperature, max_tokens, etc.)
        
        Returns:
            String completion from LLM
        """
        if not self.backend:
            raise RuntimeError("No LLM backend available")
        
        # Don't override timeout - let backend use smart inactivity-based timeouts
        # (Same reasoning as in chat() method above)
        return self.backend.generate(prompt, **kwargs)
    
    def list_models(self) -> List[str]:
        """List available models."""
        if not self.backend:
            return []
        
        return self.backend.list_models()
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model
        if self.backend:
            self.backend.set_model(model)
    
    def get_conversation_history(self) -> List[Dict[str, str]]:
        """Get the current conversation history."""
        return self.conversation_history.copy()
    
    def clear_conversation_history(self):
        """Clear the conversation history (e.g., when starting a new chat)."""
        self.conversation_history = []
    
    def add_system_message(self, content: str):
        """Add a system message to conversation history."""
        self.conversation_history.append({
            'role': 'system',
            'content': content
        })
    
    def get_conversation_length(self) -> int:
        """Get the number of messages in conversation history."""
        return len(self.conversation_history)


class OpenAIBackend:
    """Backend implementation for OpenAI-compatible APIs (llamafile)."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.base_url = "http://localhost:11434/v1"
        # Get actual model ID from API
        self._actual_model_id = self._get_actual_model_id()
    
    def _get_actual_model_id(self) -> str:
        """Get the actual model ID from the API."""
        import requests
        try:
            response = requests.get("http://localhost:11434/v1/models", timeout=2)
            if response.status_code == 200:
                models = response.json().get('data', [])
                if models:
                    return models[0]['id']  # Use first available model
        except:
            pass
        # Fallback to original model name
        return self.model
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to OpenAI-compatible API."""
        import requests
        
        # Extract options
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        repeat_penalty = kwargs.get('repeat_penalty', 1.15)  # Prevent repetition
        top_p = kwargs.get('top_p', 0.9)
        
        payload = {
            "model": self._actual_model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "frequency_penalty": repeat_penalty - 1.0,  # OpenAI API uses frequency_penalty
            "top_p": top_p
        }
        
        response = requests.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['choices'][0]['message']['content']
        else:
            raise RuntimeError(f"OpenAI API error: {response.status_code} - {response.text}")
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using OpenAI-compatible API (via chat endpoint)."""
        # Convert prompt to chat format since llamafile supports chat better
        messages = [{"role": "user", "content": prompt}]
        return self.chat(messages, **kwargs)
    
    def list_models(self) -> List[str]:
        """List available models from OpenAI-compatible API."""
        import requests
        
        try:
            response = requests.get(f"{self.base_url.replace('/v1', '')}/v1/models", timeout=5)
            if response.status_code == 200:
                models = response.json().get('data', [])
                return [m['id'] for m in models]
        except:
            pass
        
        return []
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model


class OllamaBackend:
    """Backend implementation for Ollama."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.base_url = "http://localhost:11434"
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to Ollama."""
        import requests
        
        # Extract options
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        stream = kwargs.get('stream', False)
        format_json = kwargs.get('format', None)
        
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        if format_json == "json":
            payload["format"] = "json"
        
        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['message']['content']
        else:
            raise RuntimeError(f"Ollama API error: {response.status_code}")
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using Ollama."""
        import requests
        
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        response = requests.post(
            f"{self.base_url}/api/generate",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['response']
        else:
            raise RuntimeError(f"Ollama API error: {response.status_code}")
    
    def list_models(self) -> List[str]:
        """List available Ollama models."""
        import requests
        
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                return [m['name'] for m in models]
        except:
            pass
        
        return []
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model


# ============================================================================
# Resident llamafile servers — instant local reply (Gary, 2026-11-06).
#
# The AI chat's local path used to cold-load the model on EVERY reply:
# NativeLlamafileBackend.generate() spawned a fresh `llamafile -m <gguf>
# -p <prompt>` subprocess per reply, so the whole GGUF was re-read from
# disk and re-loaded into memory before a single token was generated.
# Picking a model in the per-chat dropdown only chose WHICH file the
# next reply cold-loaded — it never made local instant.
#
# A resident server keeps the model LOADED. The first reply for a model
# starts one llamafile server for it (`llamafile -m <gguf> --server`,
# OpenAI-compatible on 127.0.0.1) and waits for it to become healthy
# (the one-time load). Every later reply for that model POSTs its prompt
# to the already-running server instead of spawning a fresh process —
# no cold-load, so the reply starts immediately. Switching chats or
# switching models stays instant for a model whose server is already
# up; a model never used in this session loads once on its first reply,
# then stays resident.
#
# RESIDENCY (plain, so Gary can see it and call it):
# - Which models stay loaded: every local model that has answered a
#   reply in this Lucid session. Loaded lazily on first use (first
#   reply for that model pays the one-time load), never preloaded at
#   startup, and never evicted while Lucid is open — there is no idle
#   timeout and no max-resident cap in this build.
# - What runs while Lucid is open: one resident llamafile server
#   process per used local model (each holding its GGUF in RAM), plus
#   the Python stdio backend itself. A 7B Q4_K_M model holds ~4 GB;
#   using several large models in one session adds up, and on the
#   8 GB Mac that can pressure memory. That is the trade for instant
#   reply. (Gary's OpenClaw rule — "only activate per call, then
#   shut off, NO always-on servers" — is for OpenClaw, his second
#   agent on the Mac mini, NOT for Lucid's local models; this
#   residency is Lucid-side and is what Gary asked for here.)
# - When a model unloads: when the Python stdio backend process exits
#   (Lucid quits / the backend stops). An atexit hook kills every
#   resident server, so no llamafile server survives Lucid. The
#   Electron-side LlamafileManager (lucidCore, the terminal core) runs
#   its OWN servers on 11434-12000; these Python-side resident servers
#   use 12200-12400 so the two never collide on a port, and a model
#   used by both sides has one server per side (a known duplication —
#   a future consolidation could share one server per model, out of
#   scope here).
# - Failure: if a resident server cannot start (or a request to it
#   fails), generate() falls back to the old subprocess path, so a
#   reply still comes back — just slow, as today. A failed resident
#   server never blocks a reply.
# ============================================================================

#: Port range for the Python-side resident servers. The Electron-side
#: LlamafileManager uses 11434-12000, so this range never collides
#: with it (and never with Ollama's 11434).
RESIDENT_SERVER_PORT_START = 12200
RESIDENT_SERVER_PORT_END = 12400

#: How long a newly started resident server may take to load its model
#: and answer /health. A big model can take a minute or more; 120s
#: covers it. Past this, the caller falls back to the subprocess path.
RESIDENT_SERVER_READY_TIMEOUT_S = 120


class _ResidentServer:
    """One resident llamafile server: a model kept loaded in a
    long-running `llamafile --server` process on 127.0.0.1."""

    def __init__(self, model: str, model_path: Path, port: int, process: subprocess.Popen) -> None:
        self.model = model
        self.model_path = model_path
        self.port = port
        self.process = process

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def is_alive(self) -> bool:
        """True while the server process is still running."""
        return self.process.poll() is None

    def is_healthy(self) -> bool:
        """True when the process is alive AND /health answers."""
        if not self.is_alive():
            return False
        try:
            import requests

            resp = requests.get(f"{self.base_url}/health", timeout=2)
            return resp.status_code == 200
        except Exception:
            return False


# Canonical model name -> resident server for it. Module-level so a
# server started by one LLMBackend instance is reused by the next —
# NativeLlamafileBackend is constructed fresh per query, so an
# instance-level registry would cold-load on every reply (the bug).
_RESIDENT_SERVERS: Dict[str, _ResidentServer] = {}


def _find_free_port(
    start: int = RESIDENT_SERVER_PORT_START,
    end: int = RESIDENT_SERVER_PORT_END,
) -> int:
    """A free localhost port in [start, end] — bind-probe, so it never
    hands out a port another process is already on. Raises when none
    is free (the caller falls back to the subprocess path)."""
    for port in range(start, end + 1):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
        finally:
            sock.close()
    raise RuntimeError(
        f"No free port for a resident llamafile server in {start}-{end}"
    )


def _spawn_resident_server(
    model: str, model_path: Path, port: int
) -> subprocess.Popen:
    """Start `llamafile --server` for one model. The llamafile binary
    is an APE binary: it must run through sh on EVERY platform (the
    same rule as the subprocess path — direct exec fails with ENOEXEC
    where APE binfmt is not registered). stdout/stderr go to DEVNULL:
    a long-running server logs continuously, and an unread PIPE would
    fill and block it. Readiness is proven by /health, not by logs."""
    cmd = [
        "sh", str(_canonical_llamafile_path()),
        "-m", str(model_path),
        "--server",
        "--port", str(port),
        "--host", "127.0.0.1",
        "--nobrowser",
    ]
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _wait_for_resident_server(
    port: int,
    process: subprocess.Popen,
    timeout: float = RESIDENT_SERVER_READY_TIMEOUT_S,
) -> bool:
    """Poll /health until the server answers or the timeout elapses.
    Returns False immediately when the process dies on startup (it
    can never become healthy) and on timeout. True when healthy."""
    import requests

    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            return False
        try:
            resp = requests.get(f"http://127.0.0.1:{port}/health", timeout=2)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def ensure_resident_server(model: str, model_path: Path) -> _ResidentServer:
    """The resident server for one model, starting it on first use.
    A healthy existing server is returned as-is (the instant path —
    no spawn, no load). A dead server is dropped and re-started.
    Raises when no server can be started (the caller falls back to
    the subprocess path)."""
    from core.model_files_map import get_canonical_name

    key = get_canonical_name(model)
    existing = _RESIDENT_SERVERS.get(key)
    if existing is not None:
        if existing.is_healthy():
            return existing
        # Dead server: drop it (and kill the process if it lingers).
        try:
            existing.process.kill()
        except Exception:
            pass
        del _RESIDENT_SERVERS[key]
    port = _find_free_port()
    process = _spawn_resident_server(key, model_path, port)
    if not _wait_for_resident_server(port, process):
        try:
            process.kill()
        except Exception:
            pass
        raise RuntimeError(
            f"Resident llamafile server for '{key}' did not become healthy on port {port}"
        )
    server = _ResidentServer(key, model_path, port, process)
    _RESIDENT_SERVERS[key] = server
    return server


def resident_generate(
    model: str,
    model_path: Path,
    prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 300,
    timeout: float = 600,
) -> "tuple[str, Dict[str, int]]":
    """(content, token stats) from the model's resident server — no
    cold-load. Ensures the server (starts it on first use), then POSTs
    the prompt to its /completion endpoint. The prompt is the same
    string the subprocess path sends with -p, so the reply is the same
    shape as today, just without the load. Raises on any failure; the
    caller falls back to the subprocess path."""
    import requests

    server = ensure_resident_server(model, model_path)
    resp = requests.post(
        f"{server.base_url}/completion",
        json={
            "prompt": prompt,
            "temperature": temperature,
            "n_predict": max_tokens,
            "stream": False,
        },
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Resident server for '{server.model}' answered HTTP {resp.status_code}: {resp.text[:200]}"
        )
    data = resp.json()
    content = data.get("content")
    if not isinstance(content, str):
        raise RuntimeError(
            f"Resident server for '{server.model}' returned no completion content"
        )
    timings = data.get("timings") if isinstance(data.get("timings"), dict) else {}
    stats = {
        "prompt_tokens": int(timings.get("prompt_n", 0) or 0),
        "generated_tokens": int(timings.get("predicted_n", 0) or 0),
        "total_tokens": int(timings.get("prompt_n", 0) or 0)
        + int(timings.get("predicted_n", 0) or 0),
    }
    return content, stats


def shutdown_resident_servers() -> None:
    """Kill every resident server. Called at backend exit (atexit) so
    no llamafile server survives Lucid, and by tests to reset state."""
    for server in list(_RESIDENT_SERVERS.values()):
        try:
            server.process.kill()
        except Exception:
            pass
    _RESIDENT_SERVERS.clear()


atexit.register(shutdown_resident_servers)


class NativeLlamafileBackend:
    """Backend implementation for native llamafile (subprocess calls)."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.llamafile_path = _canonical_llamafile_path()
        self.model_path = self._get_model_path()

    def _get_model_path(self) -> Path:
        """Get the model file path based on model name.

        Exact mapped file first, then any GGUF of the SAME model (e.g. a
        v0.3 file when the map lists v0.2). A missing model is a hard error —
        the old code silently fell back to TinyLlama.
        """
        from core.model_files_map import get_model_file, get_canonical_name

        canonical_name = get_canonical_name(self.model)
        model_file = get_model_file(canonical_name)

        if model_file:
            model_path = MODELS_DIR / model_file
            if model_path.exists():
                return model_path

        # Same-model variant fallback: any GGUF of this model.
        possible_paths = sorted(MODELS_DIR.glob(f"*{canonical_name}*.gguf"))
        if possible_paths:
            return possible_paths[0]
        possible_paths = sorted(MODELS_DIR.glob(f"*{self.model}*.gguf"))
        if possible_paths:
            return possible_paths[0]

        raise FileNotFoundError(
            f"Model '{self.model}' is not installed in {MODELS_DIR}. "
            "Run ./setup_bundled_models.sh or 'luci install "
            f"{self.model}'. Refusing to silently fall back to another model."
        )
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request using native llamafile."""
        # Convert messages to prompt
        prompt = self._messages_to_prompt(messages)
        return self.generate(prompt, **kwargs)
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using native llamafile."""
        import subprocess
        import sys
        import os
        
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 300)
        # Streaming ON by default: it is the generation detector (Gary's
        # rule) — the stall timeout only works while tokens are being read
        # as they arrive. The old default (False) switched the stream
        # detection off in every path that did not ask for it explicitly.
        stream = kwargs.get('stream', True)

        # Resident server first (instant reply): the model stays loaded
        # in a long-running llamafile server, so this reply skips the
        # cold-load. The prompt is the same string the subprocess path
        # sends with -p, so the reply is the same shape as today. The
        # resident call is non-streaming (the model is already loaded,
        # so there is no load stall to detect); a stream_callback, when
        # one is passed, gets the full text once, for compatibility.
        # Falls back to the subprocess path below when the server cannot
        # start or the request fails — a reply still comes back, just
        # slow, as today. A failed resident server never blocks a reply.
        try:
            content, stats = resident_generate(
                self.model,
                self.model_path,
                prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=kwargs.get('timeout', 600),
            )
            stream_callback = kwargs.get('stream_callback', None)
            if stream_callback:
                stream_callback(content, len(content))
            if kwargs.get('return_stats', False):
                return (content, stats)
            return content
        except Exception as e:
            if self.verbose:
                print(f"{GOLD}Resident server unavailable ({e}); falling back to subprocess{RESET}")

        # Build llamafile command. llamafile is an APE binary: it must run
        # through sh on EVERY platform — direct exec fails with ENOEXEC /
        # "Exec format error" where APE binfmt is not registered (Linux).
        cmd = [
            'sh', str(self.llamafile_path),
            '-m', str(self.model_path),
            '-p', prompt,
            '-n', str(max_tokens),
            '--temp', str(temperature),
            '-ngl', '0',  # CPU only for compatibility
            '--silent-prompt'  # Don't echo the prompt
        ]
        
        try:
            if stream:
                # Streaming mode: print tokens as they're generated
                import threading
                import queue
                import time
                
                output_queue = queue.Queue()
                full_output = []
                
                def read_output(pipe, q):
                    """Read output character by character and queue it."""
                    try:
                        while True:
                            char = pipe.read(1)
                            if not char:
                                break
                            q.put(char)
                            full_output.append(char)
                    except:
                        pass
                    finally:
                        q.put(None)  # Signal completion
                
                # Start subprocess
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=0  # Unbuffered
                )
                
                # Start output reader thread
                reader_thread = threading.Thread(target=read_output, args=(process.stdout, output_queue), daemon=True)
                reader_thread.start()
                
                # Print output as it arrives with activity-based timeout
                start_time = time.time()
                last_activity = time.time()  # Track last token received
                timeout = kwargs.get('timeout', 600)  # Total timeout (10 min absolute max)
                inactivity_timeout = kwargs.get('inactivity_timeout', 45)  # Timeout if no tokens for 45s (model loading)
                stream_callback = kwargs.get('stream_callback', None)  # Optional callback for live updates
                show_progress = kwargs.get('show_progress', True)  # Show token counter
                
                # Token counting for visual feedback
                char_count = 0
                token_estimate = 0
                last_progress_update = time.time()
                model_loading = True  # Flag for loading phase
                
                while True:
                    try:
                        char = output_queue.get(timeout=1)
                        if char is None:  # Completion signal
                            break
                        
                        # First token received - model is loaded
                        if model_loading:
                            model_loading = False
                            load_time = time.time() - start_time
                            if show_progress:
                                sys.stdout.write(f"\r{GREEN}✓ Model loaded ({load_time:.1f}s){RESET}\n")
                                sys.stdout.flush()
                        
                        char_count += 1
                        token_estimate = char_count // 4  # ~4 chars per token
                        
                        if stream_callback:
                            # NOTE: do NOT append char here — the reader
                            # thread already appended it to full_output.
                            # Appending again duplicated every character.
                            current_text = ''.join(full_output)
                            if char_count % 5 == 0:
                                stream_callback(current_text, char_count)
                        else:
                            # Default: write directly to stdout with token counter
                            sys.stdout.write(char)
                            sys.stdout.flush()
                        
                        last_activity = time.time()  # Update activity timestamp
                        
                        # Show token counter every 20 chars (~5 tokens)
                        if show_progress and char_count % 20 == 0:
                            elapsed = time.time() - start_time
                            # Don't overwrite output - show inline progress occasionally
                            pass  # Token count shown at end
                            
                    except queue.Empty:
                        current_time = time.time()
                        time_since_activity = current_time - last_activity
                        elapsed_total = current_time - start_time
                        
                        # Show waiting indicator during model loading
                        if model_loading and show_progress:
                            dots = int(elapsed_total) % 4
                            wait_msg = f"\r{GOLD}⏳ Loading model{'.' * dots}{' ' * (3-dots)} ({elapsed_total:.0f}s){RESET}"
                            sys.stdout.write(wait_msg)
                            sys.stdout.flush()
                        elif show_progress and time_since_activity > 3:
                            # Show stall warning if no tokens for 3+ seconds
                            sys.stdout.write(f" {GOLD}[waiting {time_since_activity:.0f}s]{RESET}")
                            sys.stdout.flush()
                        
                        # Check for inactivity (no tokens generated after model loaded)
                        if not model_loading and time_since_activity > inactivity_timeout:
                            process.kill()
                            raise RuntimeError(f"\n{RED}❌ Generation stalled - no tokens for {time_since_activity:.0f}s{RESET}")
                        
                        # Extended timeout during model loading (90s), shorter after (45s)
                        loading_timeout = 90 if model_loading else inactivity_timeout
                        if time_since_activity > loading_timeout:
                            process.kill()
                            phase = "loading" if model_loading else "generating"
                            raise RuntimeError(f"\n{RED}❌ Timeout during {phase} - no activity for {time_since_activity:.0f}s{RESET}")
                        
                        # Check total timeout (absolute maximum)
                        if elapsed_total > timeout:
                            process.kill()
                            raise RuntimeError(f"\n{RED}❌ Total timeout ({timeout}s) exceeded{RESET}")
                        continue
                
                # Wait for process to complete and capture stderr for token stats
                process.wait(timeout=5)
                stderr_output = process.stderr.read() if process.stderr else ""
                
                if process.returncode != 0:
                    raise RuntimeError(f"Llamafile error: {stderr_output}")
                
                output_text = ''.join(full_output).strip()
                
                # Parse token counts from stderr
                token_stats = self._parse_token_stats(stderr_output)
                
                # Return tuple if caller wants stats, otherwise just text for backwards compatibility
                if kwargs.get('return_stats', False):
                    return (output_text, token_stats)
                return output_text
            else:
                # Non-streaming mode: wait for full output
                # Use much longer timeout since we can't detect inactivity in non-streaming
                # On Catalina, model loading can take 30-60s before any output
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=kwargs.get('timeout', 300)  # 5 min for non-streaming (includes model load time)
                )
                
                if result.returncode == 0:
                    output_text = result.stdout.strip()
                    
                    # Parse token counts from stderr
                    token_stats = self._parse_token_stats(result.stderr)
                    
                    # Return tuple if caller wants stats, otherwise just text
                    if kwargs.get('return_stats', False):
                        return (output_text, token_stats)
                    return output_text
                else:
                    raise RuntimeError(f"Llamafile error: {result.stderr}")
        
        except subprocess.TimeoutExpired:
            raise RuntimeError("Llamafile request timed out")
        except Exception as e:
            raise RuntimeError(f"Llamafile error: {e}")
    
    def _parse_token_stats(self, stderr: str) -> Dict[str, int]:
        """Parse token statistics from llamafile stderr output.
        
        Llamafile outputs timing info like:
        llama_print_timings: prompt eval time = ... ms / 2 tokens
        llama_print_timings: eval time = ... ms / 4 runs
        """
        import re
        
        stats = {
            'prompt_tokens': 0,
            'generated_tokens': 0,
            'total_tokens': 0
        }
        
        try:
            # Look for prompt eval line - format: "prompt eval time = ... ms / N tokens"
            prompt_match = re.search(r'prompt eval time\s*=\s*[\d.]+\s*ms\s*/\s*(\d+)\s+tokens', stderr)
            if prompt_match:
                stats['prompt_tokens'] = int(prompt_match.group(1))
            
            # Look for generation eval line - format: "eval time = ... ms / N runs"
            # Note: llamafile uses "runs" not "tokens" for generated output
            gen_match = re.search(r'eval time\s*=\s*[\d.]+\s*ms\s*/\s*(\d+)\s+runs', stderr)
            if gen_match:
                stats['generated_tokens'] = int(gen_match.group(1))
            
            stats['total_tokens'] = stats['prompt_tokens'] + stats['generated_tokens']
        except Exception:
            # If parsing fails, return zeros
            pass
        
        return stats
    
    def _messages_to_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Convert chat messages to prompt format."""
        prompt_parts = []
        
        for msg in messages:
            role = msg['role']
            content = msg['content']
            
            if role == 'system':
                prompt_parts.append(f"System: {content}")
            elif role == 'user':
                prompt_parts.append(f"User: {content}")
            elif role == 'assistant':
                prompt_parts.append(f"Assistant: {content}")
        
        prompt_parts.append("Assistant:")
        return "\n".join(prompt_parts)
    
    def list_models(self) -> List[str]:
        """List available GGUF models."""
        if not MODELS_DIR.exists():
            return []
        
        gguf_files = list(MODELS_DIR.glob("*.gguf"))
        return [f.stem for f in gguf_files]
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model
        self.model_path = self._get_model_path()


# Convenience function
def get_llm_backend(model: str = "llama3.2", verbose: bool = False) -> LLMBackend:
    """
    Get a unified LLM backend.

    Automatically detects and uses native llamafile (Ollama only as a fallback).
    """
    return LLMBackend(model, verbose)


# Test
if __name__ == "__main__":
    print(f"{PURPLE}🧠 Testing Unified LLM Backend{RESET}\n")
    
    # Create backend
    backend = get_llm_backend(verbose=True)
    
    if backend.is_available():
        print(f"\n{GREEN}Backend type: {backend.get_backend_type()}{RESET}\n")
        
        # Test generate
        print(f"{BLUE}Testing generate...{RESET}")
        response = backend.generate("Say 'Hello from LLM backend!'", max_tokens=50)
        print(f"{CYAN}Response: {response}{RESET}\n")
        
        # Test chat
        print(f"{BLUE}Testing chat...{RESET}")
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2+2?"}
        ]
        response = backend.chat(messages, max_tokens=50)
        print(f"{CYAN}Response: {response}{RESET}\n")
        
        # List models
        print(f"{BLUE}Available models:{RESET}")
        models = backend.list_models()
        for model in models:
            print(f"  • {model}")
    else:
        print(f"{RED}❌ No LLM backend available{RESET}")
        print(f"{CYAN}Run ./setup_bundled_models.sh to install llamafile + TinyLlama{RESET}")
