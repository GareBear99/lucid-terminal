#!/usr/bin/env python3
# 🧠 LuciferCore — The Central Nervous System of LuciferAI

import os, threading, time
from pathlib import Path
from lucifer_builder import LuciferBuilder
from lucifer_daemon import LuciferDaemon
from lucifer_auth import LuciferAuth
from lucifer_logger import LuciferLogger

RESET="\033[0m"; RED="\033[31m"; GREEN="\033[32m"; GOLD="\033[33m"; PURPLE="\033[35m"

AI_DIR = Path.home() / "LuciferAI"
os.makedirs(AI_DIR, exist_ok=True)

class LuciferCore:
    def __init__(self):
        self.builder = LuciferBuilder()
        self.daemon = LuciferDaemon()
        self.auth = LuciferAuth()
        self.log = LuciferLogger()
        self.daemon_thread = None
        self.active = True
        self.auth.start_auto_sync()  # start background auto-sync

    # ───────────────────────────── DISPATCHER ───────────────────────────── #
    def handle_command(self, cmd, args):
        cmd = cmd.lower()
        try:
            if cmd == "help":
                self._help()
            elif cmd == "build":
                if len(args) < 1:
                    print(f"{RED}Usage: build [path] [template]{RESET}")
                else:
                    path = args[0]
                    template = args[1] if len(args) > 1 else "default"
                    self.builder.build(path, template)
            elif cmd == "run":
                if len(args) < 1: print(f"{RED}Usage: run [path]{RESET}")
                else: self.builder.run(args[0])
            elif cmd == "fix":
                if len(args) < 1: print(f"{RED}Usage: fix [path]{RESET}")
                else: self.builder.fix(args[0])
            elif cmd == "ai":
                if len(args) < 1: print(f"{RED}Usage: ai [path]{RESET}")
                else: self.builder.ai(args[0])
            elif cmd == "daemon":
                self._daemon_control(args)
            elif cmd == "memory":
                self.log.show_memory()
            elif cmd == "auth":
                self._auth_menu()
            elif cmd == "sync":
                self.auth.sync()
            elif cmd == "admin_update":
                self.auth.admin_update()
            elif cmd == "find":
                self._search_files(args)
            elif cmd == "clear":
                os.system("clear")
            elif cmd == "exit":
                self.active = False
            else:
                print(f"{RED}❓ Unknown command. Type 'help'.{RESET}")
        except Exception as e:
            print(f"{RED}💀 Command error:{RESET} {e}")
            self.log.log_event("command_error", cmd, str(e))

    # ───────────────────────────── HELP ───────────────────────────── #
    def _help(self):
        print(f"""
{PURPLE}Available Commands:{RESET}
  build [path] [template]   → create a new script
  run [path]                → run a script
  fix [path]                → apply auto-fix
  ai [path]                 → intelligent analysis
  memory                    → view memory logs
  daemon add [path]         → add watcher
  daemon remove [path]      → remove watcher
  daemon list               → list watchers
  daemon start              → start background watcher
  daemon stop               → stop watcher
  auth login [user] [key]   → authenticate
  auth logout               → log out
  sync                      → pull latest updates + push logs
  admin_update              → admin-only version bump + repo push
  find [name]               → search local filesystem
  clear                     → clear console
  help                      → show this message
  exit                      → quit
""")

    # ───────────────────────────── AUTH SYSTEM ───────────────────────────── #
    def _auth_menu(self):
        print(f"{PURPLE}LuciferAuth Menu:{RESET}\n  login [user] [pass]\n  logout")
        raw = input("auth> ").strip().split()
        if not raw: return
        action = raw[0].lower()
        if action == "login" and len(raw) >= 3:
            self.auth.login(raw[1], raw[2])
        elif action == "logout":
            self.auth.logout()
        else:
            print(f"{RED}Usage: login [user] [pass] or logout{RESET}")

    # ───────────────────────────── FILE SEARCH ───────────────────────────── #
    def _search_files(self, args):
        if not args:
            print(f"{RED}Usage: find [keyword]{RESET}")
            return
        keyword = args[0].lower()
        print(f"{PURPLE}🔍 Searching for '{keyword}'...{RESET}")
        matches = []
        for root, dirs, files in os.walk(str(Path.home())):
            for f in files:
                if keyword in f.lower():
                    matches.append(os.path.join(root, f))
        if not matches:
            print(f"{RED}No matches found.{RESET}")
        else:
            print(f"{GOLD}Found {len(matches)} matches:{RESET}")
            for m in matches[:20]:
                print(f"  • {m}")
            if len(matches) > 20:
                print(f"{PURPLE}...and {len(matches)-20} more...{RESET}")
        self.log.log_event("find", keyword, f"{len(matches)} results.")

    # ───────────────────────────── DAEMON CONTROL ───────────────────────────── #
    def _daemon_control(self, args):
        if not args:
            print(f"{RED}Usage: daemon [add/remove/list/start/stop] [path]{RESET}")
            return
        action = args[0].lower()
        if action == "add" and len(args) >= 2:
            self.daemon.add_path(args[1])
        elif action == "remove" and len(args) >= 2:
            self.daemon.remove_path(args[1])
        elif action == "list":
            self.daemon.list_paths()
        elif action == "start":
            self.daemon.start()
        elif action == "stop":
            self.daemon.stop()
        else:
            print(f"{RED}Usage: daemon [add/remove/list/start/stop] [path]{RESET}")
