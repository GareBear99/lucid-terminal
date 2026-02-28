#!/usr/bin/env python3
# 🔁 LuciferSync — Auto-Updater & Version Synchronizer

import os, subprocess, json, time
from pathlib import Path
from datetime import datetime

AI_DIR = Path.home() / "LuciferAI"
VERSION_FILE = AI_DIR / "lucifer_version.txt"
SYNC_LOG = AI_DIR / "logs" / "sync_log.json"
AUTO_UPDATE_INTERVAL = 21600  # 6 hours

RESET="\033[0m"; RED="\033[31m"; PURPLE="\033[35m"; GOLD="\033[33m"; GREEN="\033[32m"

class LuciferSync:
    def __init__(self):
        self.repo_url = "https://github.com/TheRustySpoon/LuciferAI.git"
        self.last_sync = None
        os.makedirs(AI_DIR / "logs", exist_ok=True)

    def log_sync(self, action, status):
        entry = {"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                 "action": action, "status": status}
        if SYNC_LOG.exists():
            data = json.load(open(SYNC_LOG))
        else:
            data = []
        data.append(entry)
        with open(SYNC_LOG, "w") as f:
            json.dump(data, f, indent=2)

    def get_local_version(self):
        if VERSION_FILE.exists():
            return VERSION_FILE.read_text().strip()
        return "Unknown"

    def check_remote_version(self):
        """Compare remote version.txt with local version."""
        try:
            subprocess.run(["git", "-C", str(AI_DIR), "fetch", "origin"], capture_output=True)
            remote_ver = subprocess.check_output(
                ["git", "-C", str(AI_DIR), "show", "origin/main:lucifer_version.txt"],
                text=True
            ).strip()
            return remote_ver
        except Exception:
            return None

    def auto_check_for_updates(self):
        """Check for updates on boot or timer cycle."""
        print(f"{PURPLE}🧭 Checking for LuciferAI updates...{RESET}")
        local_ver = self.get_local_version()
        remote_ver = self.check_remote_version()
        if not remote_ver:
            print(f"{RED}⚠️ Could not fetch remote version.{RESET}")
            return
        if local_ver != remote_ver:
            print(f"{GOLD}📦 Update available! Local: {local_ver} → Remote: {remote_ver}{RESET}")
            choice = input("🔄 Sync to update? [Y/n]: ").strip().lower()
            if choice in ("y", "yes", ""):
                self.pull_latest()
            else:
                print(f"{RED}⚠️ Update skipped by user.{RESET}")
        else:
            print(f"{GREEN}✅ LuciferAI is up-to-date (v{local_ver}).{RESET}")
        self.log_sync("check", "done")

    def pull_latest(self):
        """Pull latest repo state."""
        print(f"{GOLD}🔄 Syncing LuciferAI with GitHub...{RESET}")
        try:
            subprocess.run(["git", "-C", str(AI_DIR), "pull", "origin", "main"], check=True)
            print(f"{GREEN}✅ LuciferAI updated successfully.{RESET}")
            self.log_sync("pull", "success")
        except subprocess.CalledProcessError:
            print(f"{RED}❌ Git pull failed. Check your connection or credentials.{RESET}")
            self.log_sync("pull", "failed")

    def auto_daemon(self):
        """Background thread that auto-syncs every 6 hours."""
        def loop():
            while True:
                self.auto_check_for_updates()
                time.sleep(AUTO_UPDATE_INTERVAL)
        import threading
        t = threading.Thread(target=loop, daemon=True)
        t.start()
        print(f"{GOLD}🕓 Auto-sync daemon running every 6h.{RESET}")

if __name__ == "__main__":
    syncer = LuciferSync()
    syncer.auto_check_for_updates()
