#!/usr/bin/env python3
# 👾 LuciferAI Agent (Mistral-Compatible) — Reasoning, Repair, and Cross-Log Search

import os, json, random, re, time
from pathlib import Path
from datetime import datetime
from lucifer_logger import LuciferLogger

AI_DIR = Path.home() / "LuciferAI"
LOGS_DIR = AI_DIR / "logs"
GLOBAL_LOGS_FILE = LOGS_DIR / "global_fixes.json"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

RESET="\033[0m"; RED="\033[31m"; PURPLE="\033[35m"; GOLD="\033[33m"; BLUE="\033[34m"

logger = LuciferLogger()

# ────────────────────────────── UTILITIES ────────────────────────────── #
def print_status(msg, color=PURPLE, sym="💀"):
    print(f"{color}{sym} {msg}{RESET}")

def _save_global_fixes(data):
    with open(GLOBAL_LOGS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def _load_global_fixes():
    if GLOBAL_LOGS_FILE.exists():
        with open(GLOBAL_LOGS_FILE) as f:
            return json.load(f)
    return []

# ────────────────────────────── LUCIFER AGENT ────────────────────────────── #
class LuciferAgent:
    def __init__(self):
        self.global_fixes = _load_global_fixes()

    # ─────────────── Reason about a file ─────────────── #
    def reason_about_script(self, path):
        print_status(f"Analyzing {path} for logical consistency...")
        try:
            with open(path, "r") as f:
                code = f.read()
            # Placeholder reasoning (expand for Mistral)
            lines = code.count("\n")
            functions = len(re.findall(r"def ", code))
            comments = len(re.findall(r"#", code))
            complexity = functions * 2 + comments
            print_status(f"📊 Lines: {lines}, Functions: {functions}, Comments: {comments}")
            print_status("💀 Preliminary analysis suggests balanced structure.")
            logger.log_event("ai_analysis", path, f"{lines} lines, {functions} defs, {comments} comments")
        except Exception as e:
            print_status(f"⚠️ Failed to analyze {path}: {e}", color=RED)

    # ─────────────── Suggest fix based on logs ─────────────── #
    def suggest_fix(self, path, error_text):
        print_status("🧩 Searching memory for similar error patterns...")
        suggestions = []
        keyword = self._extract_keyword(error_text)
        for record in self.global_fixes:
            if keyword and keyword in record.get("error", "").lower():
                suggestions.append(record.get("fix", ""))
        if suggestions:
            suggestion = random.choice(suggestions)
            print_status("🔮 Found potential fix in global memory.")
            return suggestion
        # default suggestion pattern
        fix_hint = self._basic_fix_hint(error_text)
        logger.log_event("fix_suggestion", path, fix_hint)
        return fix_hint

    # ─────────────── Extract keyword ─────────────── #
    def _extract_keyword(self, error_text):
        try:
            words = re.findall(r"[A-Za-z_]+", error_text)
            common = [w.lower() for w in words if len(w) > 4]
            return common[0] if common else None
        except:
            return None

    # ─────────────── Generate generic fix hint ─────────────── #
    def _basic_fix_hint(self, error_text):
        if "import" in error_text.lower():
            return "Try installing the missing module using pip or checking the import path."
        elif "syntax" in error_text.lower():
            return "Check indentation, missing colons, or unmatched parentheses."
        elif "name" in error_text.lower():
            return "Verify variable or function names exist and are correctly spelled."
        elif "file" in error_text.lower():
            return "Ensure referenced files exist and have correct paths."
        return "No automatic fix recognized — review logic manually."

    # ─────────────── Record a new global fix ─────────────── #
    def record_fix(self, error, fix):
        entry = {
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": error[:400],
            "fix": fix[:400]
        }
        self.global_fixes.append(entry)
        _save_global_fixes(self.global_fixes)

    # ─────────────── Search global logs for patterns ─────────────── #
    def search_global_logs(self, keyword):
        matches = []
        for record in self.global_fixes:
            if keyword.lower() in json.dumps(record).lower():
                matches.append(f"[{record['time']}] fix → {record['fix']}")
        return matches[-10:]
