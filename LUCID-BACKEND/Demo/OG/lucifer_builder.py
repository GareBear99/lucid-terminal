#!/usr/bin/env python3
# ⚙️ LuciferBuilder — Architect and Surgeon of LuciferAI
# Handles script creation, execution, fixing, and AI-assisted analysis.

import os, subprocess, time, json, re
from pathlib import Path
from lucifer_logger import LuciferLogger

RESET="\033[0m"; RED="\033[31m"; GREEN="\033[32m"; GOLD="\033[33m"; PURPLE="\033[35m"

AI_DIR = Path.home() / "LuciferAI"
LOG = LuciferLogger()
TEMPLATE_DIR = AI_DIR / "templates"
os.makedirs(TEMPLATE_DIR, exist_ok=True)

class LuciferBuilder:
    def __init__(self):
        self.default_template = (
            "#!/usr/bin/env python3\n"
            "# LuciferAI Generated Script\n"
            "print('LuciferAI script created successfully!')\n"
        )

    # ───────────────────────────── BUILD ───────────────────────────── #
    def build(self, path, template="default"):
        path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        if template == "default":
            content = self.default_template
        else:
            tpl_path = TEMPLATE_DIR / f"{template}.py"
            if tpl_path.exists():
                with open(tpl_path) as f:
                    content = f.read()
            else:
                print(f"{RED}❌ Template '{template}' not found. Using default.{RESET}")
                content = self.default_template

        with open(path, "w") as f:
            f.write(content)
        os.chmod(path, 0o755)
        LOG.log_event("build", path, f"Created new script using template '{template}'.")
        print(f"{PURPLE}✨ Created script:{RESET} {path}")

    # ───────────────────────────── RUN ───────────────────────────── #
    def run(self, path):
        path = os.path.expanduser(path)
        if not os.path.exists(path):
            print(f"{RED}❌ File not found: {path}{RESET}")
            LOG.log_event("run_fail", path, "File not found.")
            return

        print(f"{GOLD}[{time.strftime('%H:%M:%S')}] RUN: Executed {path}{RESET}")
        try:
            result = subprocess.run(["python3", path], capture_output=True, text=True, timeout=15)
            if result.returncode == 0:
                print(f"{GREEN}\n✅ {os.path.basename(path)} ran successfully:{RESET}")
                print(result.stdout.strip() or "(no output)")
                LOG.log_event("run_success", path, result.stdout.strip())
            else:
                print(f"{RED}\n⚠️ {os.path.basename(path)} failed:{RESET}")
                print(result.stderr.strip())
                LOG.log_event("run_fail", path, result.stderr.strip())
        except subprocess.TimeoutExpired:
            print(f"{RED}⏰ Execution timed out.{RESET}")
            LOG.log_event("run_fail_timeout", path, "Timeout.")
        except Exception as e:
            print(f"{RED}❌ Error: {e}{RESET}")
            LOG.log_event("run_fail_exception", path, str(e))

    # ───────────────────────────── FIX ───────────────────────────── #
    def fix(self, path):
        path = os.path.expanduser(path)
        last_error = LOG.get_last_error_for(path)
        if not last_error:
            print(f"{GOLD}ℹ️ No stored error to analyze for {os.path.basename(path)}{RESET}")
            return

        print(f"{PURPLE}🧠 Analyzing {path}...{RESET}")
        fix_suggestion = self._generate_fix(path, last_error)
        if fix_suggestion:
            print(f"{GREEN}🩹 Suggested Fix:{RESET}\n{fix_suggestion}")
            LOG.log_event("fix_suggested", path, fix_suggestion)
        else:
            print(f"{RED}❌ Could not generate fix automatically.{RESET}")

    # ───────────────────────────── AI (Mistral-ready) ───────────────────────────── #
    def ai(self, path):
        path = os.path.expanduser(path)
        print(f"{PURPLE}🧠 Analyzing {path} with LuciferAI reasoning engine...{RESET}")
        self.run(path)
        # Mistral integration will go here (semantic analysis + rewriting)
        LOG.log_event("ai_analyze", path, "Placeholder AI reasoning complete.")
        print(f"{GOLD}🤖 AI analysis complete. (Mistral module pending){RESET}")

    # ───────────────────────────── Internal Fix Generator ───────────────────────────── #
    def _generate_fix(self, path, error):
        """
        Basic fix heuristic: handles ImportError, SyntaxError, ModuleNotFoundError.
        Later replaced by AI reasoning module.
        """
        fix_log = []
        if "ModuleNotFoundError" in error:
            mod = re.findall(r"No module named '([^']+)'", error)
            if mod:
                pkg = mod[0]
                suggestion = f"pip install {pkg}"
                fix_log.append(suggestion)
                return f"Missing module detected: '{pkg}'. Suggested: {suggestion}"
        elif "SyntaxError" in error:
            fix_log.append("Review syntax near the reported line.")
            return "SyntaxError detected — check recent edits."
        elif "Timeout" in error:
            return "Consider adding timeout handling to loops."
        else:
            LOG.get_similar_errors(error)
            return None
