#!/usr/bin/env python3
"""
🩸 LuciferLogger — Memory Spine of LuciferAI
Records builds, runs, errors, and auto-fixes with timestamps and session tracking.
"""
import os
import json
import sys
from pathlib import Path
from datetime import datetime

# Add to path for color imports
sys.path.insert(0, str(Path(__file__).parent))
from lucifer_colors import c, Emojis

AI_DIR = Path.home() / "LuciferAI"
LOGS_DIR = AI_DIR / "logs"
LOG_FILE = LOGS_DIR / "lucifer_memory.json"
os.makedirs(LOGS_DIR, exist_ok=True)


class LuciferLogger:
    def __init__(self):
        self.memory = self._load_memory()
    
    # ─────────────────────────────── LOAD / SAVE ─────────────────────────────── #
    def _load_memory(self):
        """Load memory from JSON file."""
        if not LOG_FILE.exists():
            with open(LOG_FILE, "w") as f:
                json.dump([], f)
        
        with open(LOG_FILE) as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    
    def _save_memory(self):
        """Save memory to JSON file."""
        with open(LOG_FILE, "w") as f:
            json.dump(self.memory, f, indent=2)
    
    # ─────────────────────────────── LOG EVENT ─────────────────────────────── #
    def log_event(self, event_type, target, message):
        """Log an event to memory."""
        entry = {
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "event": event_type,
            "target": target,
            "message": message
        }
        self.memory.append(entry)
        self._save_memory()
    
    # ─────────────────────────────── DISPLAY MEMORY ─────────────────────────────── #
    def show_memory(self):
        """Display recent memory entries."""
        print(c(f"\n{Emojis.BRAIN} LuciferAI Memory Log", "purple"))
        print(c("═" * 60, "purple"))
        
        if not self.memory:
            print(c(f"\n{Emojis.LIGHTBULB} No stored data yet", "yellow"))
            return
        
        # Show last 20 entries
        recent = self.memory[-20:]
        for e in recent:
            try:
                event_color = self._get_event_color(e.get("event", "unknown"))
                time_str = e.get("time", "N/A")
                event_str = e.get("event", "unknown")
                target_str = e.get("target", "N/A")
                message = e.get("message", "")
                
                print(f"\n{c(f'[{time_str}]', 'dim')} {c(event_str, event_color)} → {target_str}")
                print(f"   {message[:100]}{'...' if len(message) > 100 else ''}")
            except Exception as ex:
                print(c(f"  Error displaying log entry: {ex}", "red"))
                continue
        
        print(c(f"\n{Emojis.CHECKMARK} Showing last {len(recent)} events", "green"))
        print(c(f"Total events logged: {len(self.memory)}", "dim"))
    
    def _get_event_color(self, event_type):
        """Get color based on event type."""
        if "success" in event_type:
            return "green"
        elif "fail" in event_type or "error" in event_type:
            return "red"
        elif "fix" in event_type:
            return "yellow"
        else:
            return "cyan"
    
    # ─────────────────────────────── ERROR RETRIEVAL ─────────────────────────────── #
    def get_last_error_for(self, target):
        """Get the last error for a specific target."""
        errors = [e for e in self.memory if e["target"] == target and "fail" in e["event"]]
        return errors[-1]["message"] if errors else None
    
    def get_similar_errors(self, text):
        """Find similar errors in memory."""
        matches = [e for e in self.memory if text[:20] in e.get("message", "")]
        
        if matches:
            print(c(f"\n{Emojis.MAGNIFIER} Found {len(matches)} similar logged errors:", "yellow"))
            for e in matches[-5:]:
                print(c(f"  [{e['time']}]", "dim") + f" {e['message'][:100]}...")
        else:
            print(c(f"{Emojis.CROSS} No similar errors found in memory", "red"))
        
        return matches


# Test if run directly
if __name__ == "__main__":
    logger = LuciferLogger()
    
    # Test logging
    logger.log_event("test", "test_script.py", "This is a test event")
    logger.log_event("run_success", "example.py", "Script executed successfully")
    logger.log_event("run_fail", "broken.py", "NameError: 'x' is not defined")
    
    # Display memory
    logger.show_memory()
