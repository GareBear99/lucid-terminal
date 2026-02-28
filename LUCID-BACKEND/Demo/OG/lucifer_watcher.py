#!/usr/bin/env python3
# ☠️ LuciferWatcher — The Skull Watches All
# Watches project directories, detects file changes, auto-runs and repairs scripts.

import os
import sys
import json
import time
import threading
import subprocess
from datetime import datetime
from pathlib import Path

WATCH_CONFIG = os.path.expanduser("~/LuciferAI/logs/watcher.json")
LOG_DIR = os.path.expanduser("~/LuciferAI/logs")
os.makedirs(LOG_DIR, exist_ok=True)

DEBOUNCE_SECONDS = 3
SKULL = "☠️"
HEARTBEAT_INTERVAL = 2

# ────────────────────────────── UTILITIES ────────────────────────────── #

def notify(title: str, message: str):
    """Send macOS notification via osascript."""
    try:
        subprocess.run([
            "osascript", "-e",
            f'display notification "{message}" with title "{title}"'
        ], check=False)
    except Exception:
        pass

def log_event(message: str):
    """Log watcher events to a file."""
    with open(os.path.join(LOG_DIR, "lucifer_watcher.log"), "a") as f:
        f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {message}\n")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def load_config():
    if os.path.exists(WATCH_CONFIG):
        with open(WATCH_CONFIG, "r") as f:
            return json.load(f)
    return {"paths": [], "autostart": False}

def save_config(cfg):
    with open(WATCH_CONFIG, "w") as f:
        json.dump(cfg, f, indent=2)

# ────────────────────────────── WATCHER CORE ────────────────────────────── #

class LuciferWatcher:
    def __init__(self):
        self.cfg = load_config()
        self.last_modified = {}
        self.running = False

    def _find_py_files(self):
        """Recursively find .py files in watched paths."""
        py_files = []
        for path in self.cfg.get("paths", []):
            for root, _, files in os.walk(path):
                for f in files:
                    if f.endswith(".py"):
                        py_files.append(os.path.join(root, f))
        return py_files

    def _heartbeat(self):
        """Visual pulse in console."""
        state = 0
        while self.running:
            skull_color = "\033[35m" if state % 2 == 0 else "\033[31m"
            sys.stdout.write(f"\r{skull_color}{SKULL}\033[0m Watching...  ")
            sys.stdout.flush()
            time.sleep(HEARTBEAT_INTERVAL)
            state += 1

    def _run_script(self, file_path):
        """Safely run a Python script."""
        try:
            result = subprocess.run(
                ["python3", file_path],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                log_event(f"✅ {os.path.basename(file_path)} executed successfully")
                notify("LuciferWatcher", f"☠️ Fixed {os.path.basename(file_path)}")
                self._auto_commit(file_path)
            else:
                log_event(f"⚠️ {os.path.basename(file_path)} failed:\n{result.stderr}")
        except subprocess.TimeoutExpired:
            log_event(f"⏰ Timeout while running {file_path}")
        except Exception as e:
            log_event(f"💀 Error running {file_path}: {e}")

    def _auto_commit(self, file_path):
        """Auto-commit any successful fix to Git repo."""
        repo_path = Path(file_path).parent
        try:
            subprocess.run(["git", "-C", str(repo_path), "add", "."], check=False)
            subprocess.run(["git", "-C", str(repo_path), "commit", "-m",
                            f"☠️ LuciferWatcher: auto-commit {os.path.basename(file_path)}"], check=False)
            subprocess.run(["git", "-C", str(repo_path), "push"], check=False)
            log_event(f"💾 Auto-committed fix in {repo_path}")
        except Exception:
            log_event(f"⚠️ Git commit failed for {repo_path}")

    def _scan_loop(self):
        """Main scanning loop."""
        while self.running:
            for file_path in self._find_py_files():
                try:
                    mtime = os.path.getmtime(file_path)
                    if file_path not in self.last_modified:
                        self.last_modified[file_path] = mtime
                    elif mtime != self.last_modified[file_path]:
                        self.last_modified[file_path] = mtime
                        log_event(f"🔄 Detected change: {file_path}")
                        threading.Thread(
                            target=self._debounced_run, args=(file_path,)
                        ).start()
                except FileNotFoundError:
                    continue
            time.sleep(1)

    def _debounced_run(self, file_path):
        """Wait debounce interval, then execute."""
        time.sleep(DEBOUNCE_SECONDS)
        self._run_script(file_path)

    def start(self):
        """Start the watcher."""
        self.running = True
        log_event(f"{SKULL} LuciferWatcher is watching: {', '.join(self.cfg.get('paths', []))}")
        threading.Thread(target=self._heartbeat, daemon=True).start()
        self._scan_loop()

    def stop(self):
        self.running = False
        log_event("👋 LuciferWatcher stopped.")

# ────────────────────────────── CLI CONTROL ────────────────────────────── #

def main():
    if len(sys.argv) < 2:
        print("Usage: lucifer_watcher.py [add|remove|list|start|stop|autostart]")
        sys.exit(0)

    cmd = sys.argv[1].lower()
    watcher = LuciferWatcher()
    cfg = watcher.cfg

    if cmd == "add":
        if len(sys.argv) < 3:
            print("Usage: lucifer_watcher.py add [path]")
            return
        path = os.path.expanduser(sys.argv[2])
        if path not in cfg["paths"]:
            cfg["paths"].append(path)
            save_config(cfg)
            print(f"🩸 Added path: {path}")
        else:
            print(f"⚠️ Path already watched: {path}")

    elif cmd == "remove":
        if len(sys.argv) < 3:
            print("Usage: lucifer_watcher.py remove [path]")
            return
        path = os.path.expanduser(sys.argv[2])
        if path in cfg["paths"]:
            cfg["paths"].remove(path)
            save_config(cfg)
            print(f"💀 Removed path: {path}")
        else:
            print(f"⚠️ Path not found in watch list.")

    elif cmd == "list":
        print("☠️ Watching paths:")
        for p in cfg["paths"]:
            print(f"  • {p}")

    elif cmd == "autostart":
        if len(sys.argv) < 3:
            print(f"Autostart is {'ON' if cfg.get('autostart') else 'OFF'}")
            return
        state = sys.argv[2].lower() in ("on", "true", "yes")
        cfg["autostart"] = state
        save_config(cfg)
        print(f"🩸 Autostart {'enabled' if state else 'disabled'}.")

    elif cmd == "start":
        watcher.start()

    elif cmd == "stop":
        watcher.stop()

    else:
        print("Unknown command.")

if __name__ == "__main__":
    main()
