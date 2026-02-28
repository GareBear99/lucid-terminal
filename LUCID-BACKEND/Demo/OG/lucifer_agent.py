#!/usr/bin/env python3
# LuciferAgent — AI Reasoning Core for LuciferAI ecosystem
# Provides intelligent error analysis, fix suggestion, and basic auto-repair logic.

import os
import re
import json
from datetime import datetime

LOG_DIR = os.path.expanduser("~/LuciferAI/logs")
os.makedirs(LOG_DIR, exist_ok=True)
AGENT_MEMORY = os.path.join(LOG_DIR, "agent_memory.json")

class LuciferAgent:
    def __init__(self):
        self.memory = self._load_memory()

    # -------------------------------------------------------
    # Persistent Memory
    # -------------------------------------------------------
    def _load_memory(self):
        if os.path.exists(AGENT_MEMORY):
            try:
                with open(AGENT_MEMORY, "r") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _save_memory(self):
        with open(AGENT_MEMORY, "w") as f:
            json.dump(self.memory, f, indent=2)

    def remember(self, file_path, error, suggestion):
        self.memory[file_path] = {
            "error": error,
            "suggestion": suggestion,
            "timestamp": datetime.now().isoformat()
        }
        self._save_memory()

    # -------------------------------------------------------
    # Primary Reasoning Engine
    # -------------------------------------------------------
    def reason_about_error(self, error_text):
        """
        Analyze raw Python traceback text and generate a human-readable fix suggestion.
        This does NOT call an external model — it uses pattern reasoning.
        """
        if not error_text:
            return "No error text provided."

        # 1. Missing modules
        if "ModuleNotFoundError" in error_text:
            missing = self._extract_between(error_text, "No module named", "'")
            if missing:
                return f"Install the missing module using: pip install {missing}"

        # 2. AttributeError
        if "AttributeError" in error_text:
            match = re.search(r"'([^']+)' object has no attribute '([^']+)'", error_text)
            if match:
                obj, attr = match.groups()
                return f"Ensure object '{obj}' actually defines attribute '{attr}' or correct the reference."

        # 3. SyntaxError
        if "SyntaxError" in error_text:
            return "Check your syntax near the reported line — missing colon, parenthesis, or indentation."

        # 4. IndentationError
        if "IndentationError" in error_text:
            return "Fix inconsistent indentation (tabs/spaces)."

        # 5. NameError
        if "NameError" in error_text:
            match = re.search(r"name '([^']+)' is not defined", error_text)
            if match:
                name = match.group(1)
                return f"Variable '{name}' is not defined. Ensure it's declared before use."

        # 6. Timeout
        if "Timeout" in error_text:
            return "The script may be stuck in an infinite loop — add timeout handling or review loops."

        # 7. FileNotFoundError
        if "FileNotFoundError" in error_text:
            return "Check file paths and ensure referenced files exist."

        # Fallback
        return "Unrecognized error. Manual inspection may be required."

    # -------------------------------------------------------
    # Helpers
    # -------------------------------------------------------
    def _extract_between(self, text, prefix, quote):
        try:
            start = text.index(prefix)
            sub = text[start + len(prefix):]
            part = sub.split(quote)[1]
            return part.strip()
        except Exception:
            return None

    # -------------------------------------------------------
    # Direct Fix Interface (used by LuciferCore)
    # -------------------------------------------------------
    def analyze_and_fix(self, file_path):
        """Read last error for this file and apply reasoning."""
        if file_path not in self.memory:
            return f"ℹ️ No stored error to analyze for {os.path.basename(file_path)}"
        entry = self.memory[file_path]
        suggestion = self.reason_about_error(entry.get("error", ""))
        return f"🧠 Last error:\n{entry['error']}\n\n🧩 Suggested fix:\n{suggestion}"
