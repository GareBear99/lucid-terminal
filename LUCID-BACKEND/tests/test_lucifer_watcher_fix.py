#!/usr/bin/env python3
"""Tests for the LuciferWatcher daemon fixes (run as a script, not pytest).

    python3 tests/test_lucifer_watcher_fix.py

Covers:
  1. _check_file mtime bug: first sighting ignored, unchanged mtime ignored,
     changed mtime detected (the old code stored the new mtime before reading
     the old one, so change detection could never fire).
  2. Watch mode never writes the watched file.
  3. AutoFixer.fix_file does not write the file back when the fix fails
     (the old code saved anyway and reported "Partial fix applied").
  4. Exactly one _handle_daemon_command exists and it is the LuciferWatcher
     one (the ScriptWatcherDaemon duplicate is gone).

The test redirects HOME to a temp dir before importing anything, so
LuciferLogger / RelevanceDictionary never touch the real ~/LuciferAI.
"""
import io
import os
import sys
import tempfile
import time
from contextlib import redirect_stdout
from pathlib import Path

_FAKE_HOME = tempfile.mkdtemp(prefix="lucifer-test-home-")
os.environ["HOME"] = _FAKE_HOME

REPO_ROOT = Path(__file__).resolve().parent.parent
CORE_DIR = REPO_ROOT / "core"
sys.path.insert(0, str(CORE_DIR))
# enhanced_agent (via nlp_parser) imports `core.llm_backend`, so the repo
# root must be on the path too — same as stdio_agent.py.
sys.path.insert(0, str(REPO_ROOT))

from lucifer_watcher import LuciferWatcher  # noqa: E402
from autofix import AutoFixer  # noqa: E402

passed = []
failed = []


def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"  PASS {name}")
    else:
        failed.append(name)
        print(f"  FAIL {name} {detail}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="watcher-test-"))
    good = tmp / "good.py"
    good.write_text("print('hello')\n")
    broken = tmp / "broken.py"
    broken.write_text("import definitely_missing_module_xyz\nprint('x')\n")

    watcher = LuciferWatcher("TESTUSER")
    watcher.add_path(str(tmp))

    # --- 1. _check_file mtime behaviour ---
    out = io.StringIO()
    with redirect_stdout(out):
        watcher._check_file(str(good))  # first sighting: baseline only
    check("first sighting ignored", "Change detected" not in out.getvalue())

    out = io.StringIO()
    with redirect_stdout(out):
        watcher._check_file(str(good))  # unchanged mtime: nothing
    check("unchanged mtime ignored", "Change detected" not in out.getvalue())

    time.sleep(0.05)
    os.utime(str(good), (time.time() + 5, time.time() + 5))  # force a new mtime
    out = io.StringIO()
    with redirect_stdout(out):
        watcher._check_file(str(good))  # changed mtime: MUST detect now
    check("changed mtime detected", "Change detected" in out.getvalue(),
          f"got: {out.getvalue()!r}")

    # --- 2. Watch mode never writes the file ---
    before = broken.read_text()
    out = io.StringIO()
    with redirect_stdout(out):
        watcher._check_file(str(broken))  # first sighting: baseline
    with redirect_stdout(out):
        os.utime(str(broken), (time.time() + 10, time.time() + 10))
        watcher._check_file(str(broken))  # change -> suggest path
    check("watch mode detects broken file", "Change detected" in out.getvalue())
    check("watch mode never writes the file", broken.read_text() == before)

    # --- 3. AutoFixer does not write back on failure ---
    unfixable = tmp / "unfixable.py"
    unfixable.write_text("def broken(\n    print('oops'\n")
    orig = unfixable.read_text()
    fixer = AutoFixer()
    success, message = fixer.fix_file(str(unfixable))
    check("unfixable file returns False", success is False, f"got {success} {message!r}")
    check("failed fix leaves file unchanged", unfixable.read_text() == orig)
    check("failure message says unchanged", "unchanged" in message, f"got {message!r}")

    # Fixable file still works (missing colon).
    fixable = tmp / "fixable.py"
    fixable.write_text("if True\n    print('yes')\n")
    success, message = fixer.fix_file(str(fixable))
    check("fixable file still fixed", success is True, f"got {success} {message!r}")
    check("fixable file gained colon", "if True:" in fixable.read_text())

    # --- 4. One daemon handler, LuciferWatcher-based commands reachable ---
    import enhanced_agent  # noqa: E402  (heavy import; may take a few seconds)
    import inspect  # noqa: E402
    handlers = [m for m in dir(enhanced_agent.EnhancedLuciferAgent)
                if m == "_handle_daemon_command"]
    check("exactly one _handle_daemon_command", len(handlers) == 1)
    src = inspect.getsource(enhanced_agent.EnhancedLuciferAgent._handle_daemon_command)
    check("handler is the LuciferWatcher one", "self.watcher.add_path" in src
          and "ScriptWatcherDaemon" not in src)
    check("handler has watch/status branches",
          "self.watcher.start" in src and "watcher.running" in src)

    print(f"\n{len(passed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
