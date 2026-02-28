#!/usr/bin/env python3
# 🩸 LuciferLogger — Memory Spine of LuciferAI
# Records builds, runs, errors, and auto-fixes with timestamps and session tracking.

import os, json, time
from pathlib import Path
from datetime import datetime

RESET="\033[0m"; RED="\033[31m"; GREEN="\033[32m"; GOLD="\033[33m"; PURPLE="\033[35m"

AI_DIR = Path.home() / "LuciferAI"
LOGS_DIR = AI_DIR / "logs"
LOG_FILE = LOGS_DIR / "lucifer_memory.json"
os.makedirs(LOGS_DIR, exist_ok=True)

class LuciferLogger:
    def __init__(self):
        self.memory = self._load_memory()

    # ─────────────────────────────── LOAD / SAVE ─────────────────────────────── #
    def _load_memory(self):
        if not LOG_FILE.exists():
            with open(LOG_FILE, "w") as f:
                json.dump([], f)
        with open(LOG_FILE) as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []

    def _save_memory(self):
        with open(LOG_FILE, "w") as f:
            json.dump(self.memory, f, indent=2)

    # ─────────────────────────────── LOG EVENT ─────────────────────────────── #
    def log_event(self, event_type, target, message):
        entry = {
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "event": event_type,
            "target": target,
            "message": message
        }
        self.memory.append(entry)
        self._save_memory()

    # ─────────────────────────────── DISPLAY MEMORY ─────────────────────────────── #
    def display_memory(self):
        print(f"{PURPLE}🧠 Stored LuciferAI Events:{RESET}")
        if not self.memory:
            print(f"{GOLD}No stored data.{RESET}")
            return
        for e in self.memory[-20:]:
            print(f"{GOLD}[{e['time']}] {RESET}{e['event']} → {e['target']}")
            print(f"   {e['message']}")

    # ─────────────────────────────── ERROR RETRIEVAL ─────────────────────────────── #
    def get_last_error_for(self, target):
        errors = [e for e in self.memory if e["target"] == target and "fail" in e["event"]]
        return errors[-1]["message"] if errors else None

    def get_similar_errors(self, text):
        matches = [e for e in self.memory if text[:20] in e.get("message", "")]
        if matches:
            print(f"{GOLD}Found {len(matches)} similar logged errors:{RESET}")
            for e in matches[-5:]:
                print(f"  [{e['time']}] {e['message'][:100]}...")
        else:
            print(f"{RED}No similar errors found in memory.{RESET}")
