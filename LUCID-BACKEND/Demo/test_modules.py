#!/usr/bin/env python3
"""
🩸 Test LuciferAI Module Tracking System
Shows all packages across different environments
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

from module_tracker import ModuleTracker

PURPLE = '\033[35m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
RESET = '\033[0m'

print(f"""
{PURPLE}╔════════════════════════════════════════════════════════════╗
║     🩸 LuciferAI Module Tracking System Test             ║
╚════════════════════════════════════════════════════════════╝{RESET}
""")

print(f"{YELLOW}This test will:{RESET}")
print(f"  1. Scan all package managers (pip, brew, conda)")
print(f"  2. Check LuciferAI global environment")
print(f"  3. Check active Luci environment (if any)")
print(f"  4. Display comprehensive module overview")
print()

input(f"{YELLOW}Press Enter to start...{RESET}")
print()

# Create tracker and scan
tracker = ModuleTracker()
tracker.scan_all()

# Display results
tracker.display_detailed()

print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}")
print(f"{GREEN}✅ Module tracking test complete!{RESET}")
print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")

print(f"{YELLOW}💡 Try these commands in LuciferAI:{RESET}")
print(f"  {GREEN}modules{RESET}                    - Show all packages")
print(f"  {GREEN}modules search requests{RESET}    - Search for 'requests'")
print(f"  {GREEN}luci-install flask{RESET}         - Install to LuciferAI global")
print()

# Test search
print(f"{YELLOW}Testing search functionality...{RESET}\n")
tracker.search_package("requests")

print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
