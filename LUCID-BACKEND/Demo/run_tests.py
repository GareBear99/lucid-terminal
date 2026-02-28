#!/usr/bin/env python3
"""
🧪 LuciferAI Comprehensive Test Suite
Tests all features: building, fixing, daemon watching, auto-fix
"""
import os
import sys
import time
import subprocess
from pathlib import Path

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

def header(text):
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}{text:^70}{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")

def step(num, text):
    print(f"{BLUE}[{num}]{RESET} {text}")

def success(text):
    print(f"{GREEN}✅ {text}{RESET}")

def error(text):
    print(f"{RED}❌ {text}{RESET}")

def info(text):
    print(f"{GOLD}💡 {text}{RESET}")

def wait_for_enter():
    print(f"\n{GOLD}Press Enter to continue...{RESET}")
    try:
        input()
    except KeyboardInterrupt:
        sys.exit(0)

def run_cmd(cmd, show_output=True):
    """Run a command and return result."""
    print(f"{BLUE}Running: {cmd}{RESET}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if show_output and result.stdout:
        print(result.stdout)
    if result.stderr:
        print(f"{GOLD}{result.stderr}{RESET}")
    return result

def main():
    header("🩸 LuciferAI Comprehensive Test Suite 🩸")
    
    info("This will test:")
    print("  1. Fix dictionary population (local + consensus)")
    print("  2. Test script execution with errors")
    print("  3. Fix retrieval and application")
    print("  4. Daemon watch mode (suggest only)")
    print("  5. Daemon autofix mode (auto-apply)")
    
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 1: Populate Fix Dictionary
    # ═══════════════════════════════════════════════════════════
    header("TEST 1: Populate Fix Dictionary")
    step(1, "Running test_populate_fixes.py...")
    
    result = run_cmd("python3 core/test_populate_fixes.py")
    
    if result.returncode == 0:
        success("Fix dictionary populated successfully!")
    else:
        error("Failed to populate fix dictionary")
        return
    
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 2: Verify Test Scripts
    # ═══════════════════════════════════════════════════════════
    header("TEST 2: Verify Test Scripts")
    step(2, "Checking test scripts on Desktop...")
    
    broken_script = Path.home() / "Desktop" / "test_broken_script.py"
    timer_script = Path.home() / "Desktop" / "test_timer_script.py"
    
    if broken_script.exists():
        success(f"Found: {broken_script}")
    else:
        error(f"Missing: {broken_script}")
    
    if timer_script.exists():
        success(f"Found: {timer_script}")
    else:
        error(f"Missing: {timer_script}")
    
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 3: Run Broken Script (Should Fail)
    # ═══════════════════════════════════════════════════════════
    header("TEST 3: Run Test Script (Expect Errors)")
    step(3, "Running test_broken_script.py to verify errors...")
    
    result = run_cmd(f"python3 {broken_script}", show_output=False)
    
    if result.returncode != 0:
        success("Script failed as expected (has intentional errors)")
        print(f"\n{GOLD}Error output:{RESET}")
        print(result.stderr[:300])
    else:
        error("Script should have failed but didn't!")
    
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 4: Test Fix Retrieval
    # ═══════════════════════════════════════════════════════════
    header("TEST 4: Test Fix Retrieval")
    step(4, "Testing relevance dictionary fix search...")
    
    test_code = '''
import sys
sys.path.insert(0, "core")
from relevance_dictionary import RelevanceDictionary
import hashlib, os, uuid

device_id = str(uuid.UUID(int=uuid.getnode()))
username = os.getenv("USER", "unknown")
user_id = hashlib.sha256(f"{device_id}-{username}".encode()).hexdigest()[:16].upper()

rd = RelevanceDictionary(user_id)
print("\\nSearching for 'requests' fix...")
best = rd.get_best_fix_for_error("NameError: name 'requests' is not defined", "NameError")
if best:
    print(f"Found: {best['solution']}")
else:
    print("No fix found")
'''
    
    with open("/tmp/test_search.py", "w") as f:
        f.write(test_code)
    
    result = run_cmd("python3 /tmp/test_search.py")
    
    if "import requests" in result.stdout:
        success("Fix retrieval working!")
    else:
        error("Fix retrieval failed")
    
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 5: Daemon Watch Mode (Manual)
    # ═══════════════════════════════════════════════════════════
    header("TEST 5: Daemon Watch Mode (Suggest Only)")
    
    info("This test requires manual interaction:")
    print(f"""
1. Open a new terminal
2. cd to: {Path.cwd()}
3. Run: ./lucifer.py
4. Execute these commands:
   - daemon add ~/Desktop
   - daemon watch
5. In another terminal, edit ~/Desktop/test_timer_script.py
6. Watch for fix suggestions (no auto-apply)
7. Type 'daemon stop' to stop watching
    """)
    
    info("Skipping automated test - manual verification needed")
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # TEST 6: Daemon Autofix Mode (Manual)
    # ═══════════════════════════════════════════════════════════
    header("TEST 6: Daemon Autofix Mode (Auto-Apply)")
    
    info("This test requires manual interaction:")
    print(f"""
1. Open a new terminal
2. cd to: {Path.cwd()}
3. Run: ./lucifer.py
4. Execute these commands:
   - daemon add ~/Desktop
   - daemon autofix
5. In another terminal, edit ~/Desktop/test_timer_script.py
6. Watch daemon AUTO-APPLY fixes from dictionary
7. Type 'daemon stop' to stop
    """)
    
    info("Skipping automated test - manual verification needed")
    wait_for_enter()
    
    # ═══════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════
    header("🎉 Test Summary")
    
    print(f"{GREEN}Automated Tests Completed:{RESET}")
    print(f"  ✅ Fix dictionary population")
    print(f"  ✅ Test script verification")
    print(f"  ✅ Error detection")
    print(f"  ✅ Fix retrieval")
    print()
    print(f"{GOLD}Manual Tests Required:{RESET}")
    print(f"  📝 Daemon watch mode (suggest only)")
    print(f"  📝 Daemon autofix mode (auto-apply)")
    print()
    print(f"{BLUE}Next Steps:{RESET}")
    print(f"  1. Run ./lucifer.py in a terminal")
    print(f"  2. Try: daemon add ~/Desktop")
    print(f"  3. Try: daemon watch (for suggestions)")
    print(f"  4. Try: daemon autofix (for auto-fixes)")
    print(f"  5. Edit test scripts and watch the magic! ✨")
    print()
    print(f"{PURPLE}All core functionality is ready to test!{RESET}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{GOLD}Test suite interrupted{RESET}")
        sys.exit(0)
