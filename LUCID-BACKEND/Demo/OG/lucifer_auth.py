#!/usr/bin/env python3
# 🔐 LuciferAuth — Gatekeeper and Version Sentinel of LuciferAI

import os, json, base64, hashlib, subprocess, time, threading
from pathlib import Path
from Crypto.Cipher import AES
from datetime import datetime
from lucifer_logger import LuciferLogger

RESET="\033[0m"; GOLD="\033[33m"; RED="\033[31m"; GREEN="\033[32m"; PURPLE="\033[35m"

AI_DIR = Path.home() / "LuciferAI"
AUTH_FILE = AI_DIR / "lucifer_auth.json"
CONFIG_FILE = AI_DIR / "lucifer_config.json"
LOG = LuciferLogger()

# ───────────────────────────── UTILITIES ───────────────────────────── #
def _key(pwd): return hashlib.sha256(pwd.encode()).digest()
def _pad(s): return s + (16 - len(s)%16) * chr(16 - len(s)%16)
def _unpad(s): return s[:-ord(s[-1])]

def encrypt(text, password):
    cipher = AES.new(_key(password), AES.MODE_ECB)
    return base64.b64encode(cipher.encrypt(_pad(text).encode())).decode()

def decrypt(enc, password):
    cipher = AES.new(_key(password), AES.MODE_ECB)
    return _unpad(cipher.decrypt(base64.b64decode(enc)).decode())

# ───────────────────────────── AUTH CLASS ───────────────────────────── #
class LuciferAuth:
    def __init__(self):
        os.makedirs(AI_DIR, exist_ok=True)
        self.auth_data = self._load_auth()
        self.config = self._load_config()

    # Load / Save
    def _load_auth(self):
        if not AUTH_FILE.exists():
            return {}
        with open(AUTH_FILE) as f:
            try: return json.load(f)
            except: return {}

    def _save_auth(self):
        with open(AUTH_FILE, "w") as f:
            json.dump(self.auth_data, f, indent=2)

    def _load_config(self):
        if not CONFIG_FILE.exists():
            base = {"version": "1.0.0", "admin_user": "root", "admin_key": "LuciferKey"}
            with open(CONFIG_FILE, "w") as f: json.dump(base, f, indent=2)
            return base
        with open(CONFIG_FILE) as f: return json.load(f)

    def _save_config(self):
        with open(CONFIG_FILE, "w") as f: json.dump(self.config, f, indent=2)

    # ───────────────────────────── LOGIN / LOGOUT ───────────────────────────── #
    def login(self, username, password):
        self.auth_data["user"] = username
        self.auth_data["key"] = encrypt(password, username)
        self._save_auth()
        LOG.log_event("login", username, "User authenticated.")
        print(f"{GREEN}✅ Logged in as {username}{RESET}")

    def logout(self):
        self.auth_data.clear()
        self._save_auth()
        LOG.log_event("logout", "-", "User logged out.")
        print(f"{GOLD}👋 Logged out.{RESET}")

    def is_authenticated(self):
        return "user" in self.auth_data and "key" in self.auth_data

    def get_user(self):
        return self.auth_data.get("user")

    # ───────────────────────────── ADMIN UPDATE ───────────────────────────── #
    def admin_update(self):
        """Bump version & push to LuciferAI repo — admin only."""
        user = self.get_user()
        if not user:
            print(f"{RED}❌ Must be logged in.{RESET}")
            return
        key_input = input("🔑 Enter key: ")
        try:
            decoded = decrypt(self.auth_data["key"], user)
        except:
            print(f"{RED}❌ Authentication failure.{RESET}")
            return

        if user == self.config["admin_user"] and key_input == self.config["admin_key"]:
            print(f"{PURPLE}⚙️ Authenticated admin — performing update...{RESET}")
            self._bump_version()
            self._git_push()
        else:
            print(f"{RED}🚫 Access denied — not admin or bad key.{RESET}")

    def _bump_version(self):
        version = self.config.get("version","1.0.0")
        parts = version.split(".")
        print(f"Current version: {version}")
        bump = input("Enter which digit to bump (1/2/3): ").strip() or "3"
        bump = int(bump)
        parts[bump-1] = str(int(parts[bump-1])+1)
        for i in range(bump,len(parts)):
            if i>=(bump): parts[i]="0"
        new_version=".".join(parts)
        self.config["version"]=new_version
        self._save_config()
        print(f"{GREEN}🔼 Version bumped to {new_version}{RESET}")
        LOG.log_event("version_bump", new_version, "Admin version update applied.")

    def _git_push(self):
        try:
            subprocess.run(["git","add","-A"],cwd=AI_DIR)
            subprocess.run(["git","commit","-m","LuciferAI auto-admin update"],cwd=AI_DIR)
            subprocess.run(["git","push"],cwd=AI_DIR)
            LOG.log_event("git_push","LuciferAI Repo","Admin update pushed.")
            print(f"{GREEN}☁️ Repo pushed successfully!{RESET}")
        except Exception as e:
            print(f"{RED}❌ Git push failed:{RESET} {e}")
            LOG.log_event("git_push_fail","LuciferAI Repo",str(e))

    # ───────────────────────────── SYNC SYSTEM (non-admin) ───────────────────────────── #
    def sync(self):
        """Pulls latest repo & pushes logs to GitHub; auto every 6h"""
        print(f"{PURPLE}☁️ Syncing LuciferAI state...{RESET}")
        self._git_pull()
        self._push_logs()
        LOG.log_event("sync","LuciferAI","Sync completed.")

    def _git_pull(self):
        try:
            subprocess.run(["git","pull"],cwd=AI_DIR)
            print(f"{GREEN}⬇️ Pulled latest updates from repo.{RESET}")
        except Exception as e:
            print(f"{RED}⚠️ Git pull failed:{RESET} {e}")

    def _push_logs(self):
        try:
            subprocess.run(["git","add","logs/lucifer_memory.json"],cwd=AI_DIR)
            subprocess.run(["git","commit","-m","LuciferAI log sync"],cwd=AI_DIR)
            subprocess.run(["git","push"],cwd=AI_DIR)
            print(f"{GREEN}📘 Logs synced successfully.{RESET}")
        except Exception as e:
            print(f"{RED}⚠️ Log push failed:{RESET} {e}")

    # ───────────────────────────── AUTO SYNC TIMER ───────────────────────────── #
    def start_auto_sync(self):
        def loop():
            while True:
                time.sleep(21600)  # 6 hours
                print(f"{GOLD}🕐 Auto-syncing...{RESET}")
                self.sync()
        threading.Thread(target=loop, daemon=True).start()
