#!/usr/bin/env python3
"""Regression tests for the 2026-11-03 LuciferAI_Local fixes, as landed in
lucid-terminal's vendored LUCID-BACKEND/ (the built-in LuciferAI plugin).

Adapted from LuciferAI_Local/tests/test_lucifer_fixes_2026.py. The vendored
tree diverges in one deliberate way: Ollama is DISABLED outright in
core/llm_backend.py (not merely demoted to a fallback), so check #5 below
asserts that instead of the upstream llamafile-before-Ollama source order.

Covers the defects verified in LuciferAI_Local-REVIEW.md:
  1. One canonical model layout (all components agree).
  2. Generation stream detection (stall timeout, not wall-clock).
  3. llamafile APE runs through `sh` on every platform.
  4. A requested model that is missing fails loudly (no silent TinyLlama).
  5. Ollama is disabled in this build (never the preferred/default backend).
  6. Setup ends with a working model + binary in the canonical locations.
  7. The dead `.llamafile` download one-liner is gone.
  8. Auto-fix: correct fixes only, measured honestly (no invented %).

Run:  python3 tests/test_lucifer_fixes_2026.py
No model, no network, no Ollama needed. Exit code 0 = all pass.
"""
import ast
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "core"))

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


def main():
    print("LuciferAI_Local 2026-11-03 fix regression tests\n")

    # --- 1. Canonical layout: every component resolves the same paths ---
    from core.lucifer_paths import llamafile_path, models_dir, project_root
    from core import llm_backend
    from core import llamafile_agent as la_mod

    check("canonical: project root is the repo root",
          project_root() == REPO_ROOT, str(project_root()))
    check("canonical: binary is <project>/.luciferai/bin/llamafile",
          llamafile_path() == REPO_ROOT / ".luciferai" / "bin" / "llamafile")
    check("canonical: models dir is <project>/models",
          models_dir() == REPO_ROOT / "models")
    check("canonical: llm_backend MODELS_DIR agrees",
          llm_backend.MODELS_DIR == REPO_ROOT / "models")

    # --- 4. Fail loudly on a missing requested model ---
    try:
        la_mod.LlamafileAgent(model_name="mistral")
        check("fail-loud: missing mistral raises FileNotFoundError", False,
              "silently fell back (or found a model)")
    except FileNotFoundError as e:
        check("fail-loud: missing mistral raises FileNotFoundError", True, str(e)[:80])
    except Exception as e:
        check("fail-loud: missing mistral raises FileNotFoundError", False,
              f"wrong exception: {type(e).__name__}: {e}")

    try:
        la_mod.LlamafileAgent(model_path="/nonexistent/nope.gguf")
        check("fail-loud: explicit missing model path raises", False)
    except FileNotFoundError:
        check("fail-loud: explicit missing model path raises", True)

    # Positive control: an explicit existing file constructs fine.
    with tempfile.NamedTemporaryFile(suffix=".gguf", delete=False) as tf:
        tf.write(b"GGUF")
        fake_gguf = tf.name
    try:
        agent = la_mod.LlamafileAgent(model_path=fake_gguf,
                                      llamafile_path="/bin/true")
        check("construct: explicit existing model + binary works",
              agent.available and agent.model_path == Path(fake_gguf))
    finally:
        os.unlink(fake_gguf)

    # NativeLlamafileBackend: missing model raises (no silent TinyLlama).
    try:
        llm_backend.NativeLlamafileBackend("mistral")
        check("fail-loud: backend missing mistral raises", False)
    except FileNotFoundError:
        check("fail-loud: backend missing mistral raises", True)

    # --- 5. Ollama is disabled in this vendored build ---
    # (Upstream demotes Ollama to a fallback; the vendored build disables
    # it outright — stricter, same direction. _detect_backend must never
    # consult Ollama, and _check_ollama must return False.)
    backend = llm_backend.LLMBackend.__new__(llm_backend.LLMBackend)
    backend.model = "mistral"
    backend.verbose = False
    import inspect
    src = inspect.getsource(llm_backend.LLMBackend._detect_backend)
    check("ollama disabled: _detect_backend never calls _check_ollama",
          "_check_ollama(" not in src and "OllamaBackend(" not in src
          and "native-llamafile" in src)
    check("ollama disabled: _check_ollama() returns False",
          llm_backend.LLMBackend._check_ollama(backend) is False)

    # --- 3. sh wrapper on every platform + 2. streaming default on ---
    # Mock Popen: fake process whose stdout yields tokens then EOF.
    class FakeStdout:
        def __init__(self, chunks):
            self._chunks = list(chunks)
        def read(self, n=-1):
            if not self._chunks:
                return b""
            return self._chunks.pop(0)

    class FakeStderr:
        def read(self):
            return b""

    class FakeProc:
        def __init__(self, chunks):
            self.stdout = FakeStdout(chunks)
            self.stderr = FakeStderr()
            self.returncode = 0
        def poll(self):
            return 0
        def kill(self):
            pass
        def wait(self, timeout=None):
            return 0

    seen_cmds = []
    real_popen = subprocess.Popen

    def fake_popen(cmd, **kw):
        seen_cmds.append(cmd)
        return FakeProc([b"ba", b"nana"])

    agent = la_mod.LlamafileAgent.__new__(la_mod.LlamafileAgent)
    agent.FIRST_TOKEN_TIMEOUT = 30.0
    agent.STALL_TIMEOUT = 30.0
    agent.ABSOLUTE_TIMEOUT = 60.0
    la_mod.subprocess.Popen = fake_popen
    try:
        res = agent._run_llamafile_streaming(["sh", "llamafile", "-m", "x"])
    finally:
        la_mod.subprocess.Popen = real_popen
    check("stream: helper returns streamed output", res.stdout == "banana",
          repr(res.stdout))
    check("stream: first token timed", res.first_token_s is not None
          and res.first_token_s < 5)
    check("sh wrapper: cmd starts with 'sh'", seen_cmds and seen_cmds[0][0] == "sh",
          str(seen_cmds[0][:2]) if seen_cmds else "no cmd captured")

    # Stall detection: a process that never yields a token must time out
    # quickly when the stall window is short (not after a wall-clock run).
    # NOTE: the fake stdout must BLOCK (like a real pipe), not return b""
    # immediately — an empty read means EOF, not silence.
    class SilentStdout:
        def read(self, n=-1):
            time.sleep(30)
            return b""

    class SilentProc(FakeProc):
        def __init__(self):
            self.stdout = SilentStdout()
            self.stderr = FakeStderr()
            self.returncode = None
        def poll(self):
            return None

    agent2 = la_mod.LlamafileAgent.__new__(la_mod.LlamafileAgent)
    agent2.FIRST_TOKEN_TIMEOUT = 1.0
    agent2.STALL_TIMEOUT = 1.0
    agent2.ABSOLUTE_TIMEOUT = 30.0
    la_mod.subprocess.Popen = lambda cmd, **kw: SilentProc()
    t0 = time.monotonic()
    try:
        agent2._run_llamafile_streaming(["sh", "llamafile"])
        check("stream-stall: silent process raises TimeoutError", False)
    except TimeoutError as e:
        dt = time.monotonic() - t0
        check("stream-stall: silent process raises TimeoutError", dt < 10,
              f"{e} after {dt:.1f}s")
    finally:
        la_mod.subprocess.Popen = real_popen

    # Backend generate() defaults to streaming (stall detection on).
    from core.llm_backend import NativeLlamafileBackend
    sig_src = inspect.getsource(NativeLlamafileBackend.generate)
    check("stream: backend generate() defaults stream=True",
          "kwargs.get('stream', True)" in sig_src)
    check("sh wrapper: backend builds cmd with 'sh' unconditionally",
          "'sh', str(self.llamafile_path)" in sig_src
          and "platform.system()" not in sig_src)

    # --- 8. Auto-fix: _generate_fix returns correct fixes only ---
    from core.enhanced_agent import EnhancedLuciferAgent
    gen = EnhancedLuciferAgent._generate_fix
    check("autofix: ModuleNotFoundError -> 'import X' (not 'from X import *')",
          gen(None, "x.py", "ModuleNotFoundError: No module named 'requests'",
              "ModuleNotFoundError") == "import requests")
    check("autofix: NameError 'os' -> 'import os'",
          gen(None, "x.py", "NameError: name 'os' is not defined",
              "NameError") == "import os")
    check("autofix: unknown NameError -> None (no fake TODO fix)",
          gen(None, "x.py", "NameError: name 'foo' is not defined",
              "NameError") is None)
    check("autofix: SyntaxError -> None (not a wrong guess)",
          gen(None, "x.py", "SyntaxError: expected ':'", "SyntaxError") is None)

    # Autofix colon repair works on modern Python's "expected ':'".
    from core.autofix import AutoFixer
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as tf:
        tf.write("def foo()\n    print('hi')\n")
        bad_path = tf.name
    try:
        fixer = AutoFixer()
        ok, _msg = fixer.fix_file(bad_path)
        src = Path(bad_path).read_text()
        compiles = True
        try:
            ast.parse(src)
        except SyntaxError:
            compiles = False
        check("autofix: missing colon repaired on 'expected :' (py3.10+)",
              ok and compiles, repr(src[:40]))
    finally:
        os.unlink(bad_path)

    # --- 7. No dead .llamafile one-liner anywhere ---
    hits = []
    for p in list(REPO_ROOT.rglob("*.py")) + [REPO_ROOT / "lucifer.py"]:
        if "__pycache__" in str(p) or p.name == "test_lucifer_fixes_2026.py":
            continue
        try:
            t = p.read_text(errors="ignore")
        except Exception:
            continue
        if "tinyllama-1.1b-chat.llamafile" in t:
            hits.append(str(p.relative_to(REPO_ROOT)))
    check("no .llamafile model download dead-end remains", not hits,
          ", ".join(hits) if hits else "")

    # --- 6. Setup script targets the canonical layout + verifies ---
    setup = (REPO_ROOT / "setup_bundled_models.sh").read_text()
    check("setup: models go to <project>/models",
          'MODELS_DIR="$PROJECT_ROOT/models"' in setup)
    check("setup: llamafile 0.10.6 (not 0.8.x)",
          "0.10.6" in setup and "0.8.6" not in setup)
    check("setup: verifies binary runs + GGUF magic before claiming success",
          "head -c 4" in setup and "--version" in setup)

    print()
    failed = [n for n, ok, _ in RESULTS if not ok]
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    if failed:
        print("FAILED: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
