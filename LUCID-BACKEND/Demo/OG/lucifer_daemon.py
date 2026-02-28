#!/usr/bin/env python3
# 👁️ LuciferDaemon — Autonomous Watcher Skull
# Watches directories for changes, executes scripts, and logs results.

import os, time, subprocess, threading
from pathlib import Path
from lucifer_logger import LuciferLogger

RESET="\033[0m"; RED="\033[31m"; GREEN="\033[32m"; GOLD="\033[33m"; PURPLE="\033[35m"

AI_DIR = Path.home() / "LuciferAI"
LOG = LuciferLogger()

class LuciferDaemon:
    def __init__(self):
        self.watch_paths = set()
        self.file_timestamps = {}
        self.running = False
        self.thread = None

    # ─────────────────────────────── WATCH CONTROL ─────────────────────────────── #
    def add_path(self, path):
        p = os.path.expanduser(path)
        if not os.path.exists(p):
            print(f"{RED}❌ Path not found: {p}{RESET}")
            return
        self.watch_paths.add(p)
        print(f"{PURPLE}👁️ Added watcher path:{RESET} {p}")
        LOG.log_event("daemon_add", p, "Path added to LuciferDaemon watcher.")

    def remove_path(self, path):
        p = os.path.expanduser(path)
        if p in self.watch_paths:
            self.watch_paths.remove(p)
            print(f"{RED}🗑️ Removed watcher path:{RESET} {p}")
            LOG.log_event("daemon_remove", p, "Path removed from watcher.")
        else:
            print(f"{RED}⚠️ Path not in watch list.{RESET}")

    def list_paths(self):
        if not self.watch_paths:
            print(f"{GOLD}No paths currently watched.{RESET}")
            return
        print(f"{PURPLE}👁️ Currently watching:{RESET}")
        for p in self.watch_paths:
            print(f"  - {p}")

    def start(self):
        if self.running:
            print(f"{RED}⚠️ Daemon already running.{RESET}")
            return
        self.running = True
        self.thread = threading.Thread(target=self._watch_loop, daemon=True)
        self.thread.start()
        print(f"{PURPLE}👁️ LuciferDaemon started. Watching {len(self.watch_paths)} path(s).{RESET}")
        LOG.log_event("daemon_start", "-", "Daemon started.")

    def stop(self):
        if not self.running:
            print(f"{RED}⚠️ Daemon not running.{RESET}")
            return
        self.running = False
        print(f"{GOLD}👁️ LuciferDaemon stopped.{RESET}")
        LOG.log_event("daemon_stop", "-", "Daemon stopped.")

    # ─────────────────────────────── WATCH LOOP ─────────────────────────────── #
    def _watch_loop(self):
        while self.running:
            for path in list(self.watch_paths):
                if os.path.isfile(path):
                    self._check_file(path)
                else:
                    for root, _, files in os.walk(path):
                        for f in files:
                            full = os.path.join(root, f)
                            self._check_file(full)
            time.sleep(2)

    def _check_file(self, file_path):
        try:
            mtime = os.path.getmtime(file_path)
            if file_path not in self.file_timestamps or self.file_timestamps[file_path] != mtime:
                self.file_timestamps[file_path] = mtime
                print(f"{PURPLE}[{time.strftime('%H:%M:%S')}] 🔄 Detected change:{RESET} {file_path}")
                LOG.log_event("file_change", file_path, "Detected file modification.")
                self._execute(file_path)
        except Exception:
            pass

    # ─────────────────────────────── EXECUTION ─────────────────────────────── #
    def _execute(self, file_path):
        if not file_path.endswith(".py"):
            return
        try:
            result = subprocess.run(["python3", file_path], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print(f"{GREEN}[{time.strftime('%H:%M:%S')}] ✅ {os.path.basename(file_path)} executed successfully.{RESET}")
                LOG.log_event("script_success", file_path, result.stdout.strip() or "Executed successfully.")
            else:
                print(f"{RED}[{time.strftime('%H:%M:%S')}] ⚠️ {os.path.basename(file_path)} failed:{RESET}")
                print(result.stderr.strip())
                LOG.log_event("script_fail", file_path, result.stderr.strip())
        except subprocess.TimeoutExpired:
            print(f"{RED}[{time.strftime('%H:%M:%S')}] ⏰ Timeout in {file_path}.{RESET}")
            LOG.log_event("script_fail_timeout", file_path, "Timeout during execution.")
        except Exception as e:
            print(f"{RED}❌ Execution error: {e}{RESET}")
            LOG.log_event("script_fail_exception", file_path, str(e))
