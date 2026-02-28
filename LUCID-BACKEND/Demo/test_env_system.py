#!/usr/bin/env python3
"""
🩸 Complete Test for LuciferAI Environment & Module System
Tests both environment scanning and module tracking
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

from environment_scanner import EnvironmentScanner, scan_environments, search_environment
from module_tracker import ModuleTracker

PURPLE = '\033[35m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
RESET = '\033[0m'

print(f"""
{PURPLE}╔════════════════════════════════════════════════════════════╗
║  🩸 LuciferAI Environment & Module System Test           ║
╚════════════════════════════════════════════════════════════╝{RESET}
""")

print(f"{YELLOW}This comprehensive test will:{RESET}")
print(f"  1. Scan ALL virtual environments (conda, venv, Luci, pyenv)")
print(f"  2. Show which environment is currently active")
print(f"  3. Display all packages across all sources")
print(f"  4. Demonstrate search functionality")
print()

input(f"{YELLOW}Press Enter to start Part 1: Environment Scanning...{RESET}")
print()

# ═══════════════════════════════════════════════════════════
# Part 1: Environment Scanning
# ═══════════════════════════════════════════════════════════

print(f"{BLUE}{'='*60}{RESET}")
print(f"{PURPLE}PART 1: Environment Scanner{RESET}")
print(f"{BLUE}{'='*60}{RESET}\n")

scanner = EnvironmentScanner()
scanner.scan_all()
scanner.display_detailed()

print(f"{GREEN}✅ Environment scanning complete!{RESET}\n")

# Search for an environment
print(f"{YELLOW}Testing environment search...{RESET}\n")
search_environment("test")  # Search for any env with 'test' in name

input(f"\n{YELLOW}Press Enter to continue to Part 2: Module Tracking...{RESET}")
print()

# ═══════════════════════════════════════════════════════════
# Part 2: Module Tracking
# ═══════════════════════════════════════════════════════════

print(f"{BLUE}{'='*60}{RESET}")
print(f"{PURPLE}PART 2: Module Tracker{RESET}")
print(f"{BLUE}{'='*60}{RESET}\n")

module_tracker = ModuleTracker()
module_tracker.scan_all()
module_tracker.display_detailed()

print(f"{GREEN}✅ Module tracking complete!{RESET}\n")

# Search for a module
print(f"{YELLOW}Testing module search...{RESET}\n")
module_tracker.search_package("pip")

input(f"\n{YELLOW}Press Enter to see the summary...{RESET}")
print()

# ═══════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════

print(f"{PURPLE}{'='*60}{RESET}")
print(f"{GREEN}✅ Complete System Test Finished!{RESET}")
print(f"{PURPLE}{'='*60}{RESET}\n")

print(f"{YELLOW}📊 Test Summary:{RESET}\n")

# Environment summary
total_envs = (len(scanner.conda_envs) + len(scanner.luci_envs) + 
              len(scanner.pyenv_envs) + len(scanner.venv_envs))
print(f"  {BLUE}Environments Found:{RESET} {total_envs}")
if scanner.conda_envs:
    print(f"    • Conda: {len(scanner.conda_envs)}")
if scanner.luci_envs:
    print(f"    • Luci: {len(scanner.luci_envs)}")
if scanner.pyenv_envs:
    print(f"    • Pyenv: {len(scanner.pyenv_envs)}")
if scanner.venv_envs:
    print(f"    • Venv: {len(scanner.venv_envs)}")

print()

# Module summary
total_packages = (len(module_tracker.system_packages) + 
                 len(module_tracker.luciferai_packages) +
                 len(module_tracker.brew_packages))
print(f"  {PURPLE}Packages Found:{RESET} {total_packages}")
print(f"    • System: {len(module_tracker.system_packages)}")
print(f"    • LuciferAI Global: {len(module_tracker.luciferai_packages)}")
print(f"    • Homebrew: {len(module_tracker.brew_packages)}")
if module_tracker.active_env_packages:
    print(f"    • Active Env: {len(module_tracker.active_env_packages)}")

print()
print(f"{PURPLE}{'='*60}{RESET}\n")

print(f"{YELLOW}💡 Use these commands in LuciferAI:{RESET}\n")

print(f"{BLUE}Environment Commands:{RESET}")
print(f"  {GREEN}environments{RESET}              - List all environments")
print(f"  {GREEN}env search myproject{RESET}      - Search for environment")
print(f"  {GREEN}luci create myproject{RESET}     - Create new Luci env")
print()

print(f"{BLUE}Module Commands:{RESET}")
print(f"  {GREEN}modules{RESET}                   - Show all packages")
print(f"  {GREEN}modules search requests{RESET}   - Search for package")
print(f"  {GREEN}luci-install flask{RESET}        - Install to LuciferAI global")
print()

print(f"{PURPLE}{'='*60}{RESET}")
print(f"{GREEN}System test complete! 🩸{RESET}")
print(f"{PURPLE}{'='*60}{RESET}\n")
