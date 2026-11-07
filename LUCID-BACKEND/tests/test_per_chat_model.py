#!/usr/bin/env python3
"""Per-chat model + per-chat memory tests for the Lucid stdio backend.

Covers step 5 of the per-chat model build (Gary, 2026-11-06):
- `stdio_agent.process_command` passes the payload's `model` and
  `chat_id` through to the agent (the Electron side sends them in
  the stdio payload; the backend honors them for that call only).
- `EnhancedLuciferAgent` scopes `conversation_history` per chat id
  (a dict keyed by chat id). Before this, one shared list served
  every chat and was never cleared on switch or new chat, so a new
  chat still saw the old chat's context — the cross-chat bleed.
- `_select_model_for_request` honors a per-chat model override when
  it can answer, and falls back to auto-select otherwise.

The agent's real __init__ is heavy (model integrity checks, thermal
analytics, session logging), so the history/selection tests run
against bare instances (object.__new__) with only the fields the
code under test touches. The stdio test runs against a bare
StdioAgent with a recording fake agent.

Run with: python3 LUCID-BACKEND/tests/test_per_chat_model.py
Exit code is non-zero on any failure.
"""

import sys
from pathlib import Path

# Add both core/ (bare `model_files_map` style imports) and the
# backend root (the `core.llm_backend` style imports) to the path —
# the same two roots stdio_agent.py itself sets up.
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.enhanced_agent import EnhancedLuciferAgent
from core.stdio_agent import StdioAgent

FAILURES = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def bare_agent():
    """An EnhancedLuciferAgent without the heavy __init__."""
    agent = object.__new__(EnhancedLuciferAgent)
    agent._chat_histories = {}
    agent._active_chat_id = None
    agent._model_override = None
    return agent


def test_history_scoped_per_chat():
    """The bleed test: a new chat does NOT see the old chat's history."""
    agent = bare_agent()

    # Chat A talks: two exchanges land in A's history.
    agent.set_active_chat("chat-a")
    agent.conversation_history.append({"role": "user", "content": "A first question"})
    agent.conversation_history.append({"role": "assistant", "content": "A first answer"})
    check("chat A history holds its own messages",
          len(agent.conversation_history) == 2)

    # Switching to a new chat starts empty — the old chat's context
    # does not bleed in.
    agent.set_active_chat("chat-b")
    check("new chat starts with an empty history",
          agent.conversation_history == [],
          f"got {agent.conversation_history}")

    # Chat B talks; its history is separate.
    agent.conversation_history.append({"role": "user", "content": "B first question"})
    check("chat B history holds only B's messages",
          agent.conversation_history == [{"role": "user", "content": "B first question"}])

    # Switching back restores A's history, intact and unmixed.
    agent.set_active_chat("chat-a")
    check("switching back restores chat A's history",
          agent.conversation_history == [
              {"role": "user", "content": "A first question"},
              {"role": "assistant", "content": "A first answer"},
          ])
    check("chat A's history has no B messages",
          all("B first" not in m["content"] for m in agent.conversation_history))


def test_history_default_chat_unchanged():
    """No chat id (old callers) keeps the shared default history."""
    agent = bare_agent()
    agent.conversation_history.append({"role": "user", "content": "legacy"})
    check("no chat id uses the default history",
          agent.conversation_history == [{"role": "user", "content": "legacy"}])

    # And a chat id after that still starts empty.
    agent.set_active_chat("chat-a")
    check("a chat id after default use still starts empty",
          agent.conversation_history == [])


def test_history_setter_only_touches_active_chat():
    """Replacing the history (e.g. a clear) never touches another chat."""
    agent = bare_agent()
    agent.set_active_chat("chat-a")
    agent.conversation_history.append({"role": "user", "content": "keep me"})
    agent.set_active_chat("chat-b")
    agent.conversation_history = []
    check("clearing chat B leaves chat A intact",
          agent._chat_histories.get("chat-a") == [{"role": "user", "content": "keep me"}])
    check("chat B is empty after the clear",
          agent._chat_histories.get("chat-b") == [])


def test_select_model_override():
    """A per-chat override wins when it can answer, else auto-select."""
    agent = bare_agent()
    agent.available_models = ["tinyllama", "llama3.2", "mistral"]
    agent.llm_state = {}  # .get(canonical, True): everything enabled
    agent._is_model_corrupted = lambda model: False

    class FakeLocks:
        def __init__(self, locked):
            self.locked = locked

        def get_locked_models(self, exclude_own=True):
            return self.locked

    # Override available + enabled + unlocked -> the override.
    agent.lock_manager = FakeLocks([])
    agent._model_override = "tinyllama"
    check("override wins when it can answer",
          agent._select_model_for_request() == "tinyllama")

    # Override locked -> auto-select (the best enabled model).
    agent.lock_manager = FakeLocks(["tinyllama"])
    agent._model_override = "tinyllama"
    selected = agent._select_model_for_request()
    check("locked override falls back to auto-select",
          selected in ("llama3.2", "mistral") and selected != "tinyllama",
          f"got {selected!r}")

    # Override unknown to this backend -> auto-select.
    agent.lock_manager = FakeLocks([])
    agent._model_override = "not-a-real-model"
    selected = agent._select_model_for_request()
    check("unknown override falls back to auto-select",
          selected in agent.available_models, f"got {selected!r}")

    # Override disabled -> auto-select.
    agent.llm_state = {"tinyllama": False}
    agent._model_override = "tinyllama"
    selected = agent._select_model_for_request()
    check("disabled override falls back to auto-select",
          selected != "tinyllama", f"got {selected!r}")

    # No override -> auto-select as today.
    agent.llm_state = {}
    agent._model_override = None
    selected = agent._select_model_for_request()
    check("no override auto-selects",
          selected in agent.available_models, f"got {selected!r}")


def test_stdio_passes_model_and_chat_id():
    """The stdio 'chat' payload's model + chat_id reach process_request."""
    calls = []

    class FakeAgent:
        env = {"cwd": "/tmp"}

        def process_request(self, message, model=None, chat_id=None):
            calls.append({"message": message, "model": model, "chat_id": chat_id})
            return "fake reply"

    stdio = object.__new__(StdioAgent)
    stdio.agent = FakeAgent()

    response = stdio.process_command({
        "command": "chat",
        "message": "hello",
        "model": "tinyllama",
        "chat_id": "chat-42",
    })
    check("stdio passes the model through",
          calls and calls[0]["model"] == "tinyllama", f"calls={calls}")
    check("stdio passes the chat id through",
          calls and calls[0]["chat_id"] == "chat-42", f"calls={calls}")
    check("stdio still returns success with the reply",
          response.get("status") == "success" and response.get("response") == "fake reply",
          f"response={response}")

    # Absent model/chat_id (Auto / old callers) -> None, as before.
    calls.clear()
    response = stdio.process_command({"command": "chat", "message": "hi"})
    check("stdio with no model/chat_id passes None",
          calls and calls[0]["model"] is None and calls[0]["chat_id"] is None,
          f"calls={calls}")


def main():
    print("Per-chat model + per-chat memory tests\n")
    test_history_scoped_per_chat()
    test_history_default_chat_unchanged()
    test_history_setter_only_touches_active_chat()
    test_select_model_override()
    test_stdio_passes_model_and_chat_id()
    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}")
        return 1
    print("All per-chat model tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
