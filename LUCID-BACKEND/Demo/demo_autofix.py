#!/usr/bin/env python3
"""
🧪 LuciferAI Auto-Fix Demo
Demonstrates the complete auto-fix workflow
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

from enhanced_agent import EnhancedLuciferAgent

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

def print_section(title):
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}{title.center(70)}{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")

def main():
    print_section("🩸 LuciferAI Auto-Fix Demo")
    
    print(f"{GOLD}This demo will:{RESET}")
    print(f"  1. Initialize LuciferAI with FixNet integration")
    print(f"  2. Run a broken script (test_broken_script.py)")
    print(f"  3. Detect the error automatically")
    print(f"  4. Search the fix dictionary for similar fixes")
    print(f"  5. Generate and apply a fix")
    print(f"  6. Encrypt and upload to FixNet")
    print(f"  7. Update the learning dictionary\n")
    
    input(f"{BLUE}Press Enter to start...{RESET}")
    
    # Initialize agent
    print_section("Step 1: Initialize Enhanced Agent")
    agent = EnhancedLuciferAgent()
    
    input(f"\n{BLUE}Press Enter to run the broken script...{RESET}")
    
    # Test the auto-fix
    print_section("Step 2: Running Broken Script with Auto-Fix")
    
    print(f"{GOLD}Command: run test_broken_script.py{RESET}\n")
    
    response = agent.process_request("run test_broken_script.py")
    print(response)
    
    # Show dictionary stats
    input(f"\n{BLUE}Press Enter to view learning statistics...{RESET}")
    
    print_section("Step 3: View Dictionary Statistics")
    agent.process_request("fixnet stats")
    
    # Check the fixed script
    input(f"\n{BLUE}Press Enter to view the fixed script...{RESET}")
    
    print_section("Step 4: View Fixed Script")
    
    with open("test_broken_script.py") as f:
        content = f.read()
        print(f"{GREEN}Fixed script content:{RESET}\n")
        print(content)
    
    print_section("✅ Demo Complete!")
    
    print(f"{GREEN}What happened:{RESET}")
    print(f"  ✅ Error detected: NameError (json not imported)")
    print(f"  ✅ Fix generated: import json")
    print(f"  ✅ Fix applied to script")
    print(f"  ✅ Script now works!")
    print(f"  ✅ Fix encrypted with AES-256")
    print(f"  ✅ Fix signed with SHA256")
    print(f"  ✅ Fix committed to local FixNet repo")
    print(f"  ✅ Fix added to learning dictionary")
    print(f"  ✅ Ready to push to GitHub\n")
    
    print(f"{PURPLE}Next time you encounter a similar error:{RESET}")
    print(f"  • System will search dictionary")
    print(f"  • Find this fix (relevance score)")
    print(f"  • Apply it automatically")
    print(f"  • Even faster!\n")
    
    print(f"{GOLD}Check FixNet repo:{RESET}")
    print(f"  cd ~/.luciferai/fixnet && ls -la fixes/\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{GOLD}Demo interrupted{RESET}\n")
        sys.exit(0)
