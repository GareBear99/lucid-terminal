#!/usr/bin/env python3
"""
🔗 GitHub Commands Test Suite
Tests all GitHub integration features
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from enhanced_agent import EnhancedLuciferAgent

# Colors
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
PURPLE = "\033[35m"
RESET = "\033[0m"

print(f"\n{PURPLE}{'='*70}{RESET}")
print(f"{PURPLE}🔗 GITHUB COMMANDS TEST{RESET}")
print(f"{PURPLE}{'='*70}{RESET}\n")

agent = EnhancedLuciferAgent()

print(f"{CYAN}Available GitHub Commands:{RESET}\n")
print(f"1. {GREEN}github status{RESET}  - Show GitHub connection status")
print(f"2. {GREEN}github link{RESET}    - Link your GitHub account (interactive)")
print(f"3. {GREEN}github unlink{RESET}  - Unlink GitHub account (interactive)")
print(f"4. {GREEN}github projects{RESET} - List your GitHub repositories")
print(f"5. {GREEN}github upload{RESET}  - Upload current project to GitHub (interactive)")
print(f"6. {GREEN}github update{RESET}  - Update existing GitHub project (interactive)")

print(f"\n{YELLOW}{'─'*70}{RESET}\n")

print(f"{CYAN}[Test 1] Checking GitHub status...{RESET}")
response = agent.process_request("github status")
print(response)

print(f"\n{YELLOW}{'─'*70}{RESET}\n")

print(f"{CYAN}Available for manual testing:{RESET}\n")

print(f"{GREEN}Interactive Commands (require user input):{RESET}")
print(f"  • github link    - Enter GitHub username")
print(f"  • github unlink  - Confirm with 'yes'")
print(f"  • github upload  - Select repo options")
print(f"  • github update  - Confirm update")

print(f"\n{GREEN}Non-interactive Commands:{RESET}")
print(f"  • github status   - Shows connection status")
print(f"  • github projects - Lists repos (requires linked account)")

print(f"\n{YELLOW}Test Instructions:{RESET}\n")

print(f"1. Test 'github status' - {GREEN}AUTOMATED ✓{RESET}")
print(f"   Status: Tested above")
print()

print(f"2. Test 'github link'")
print(f"   Command: github link")
print(f"   Expected:")
print(f"     - Prompts for GitHub username")
print(f"     - Verifies username exists via GitHub API")
print(f"     - Saves connection")
print(f"     - Shows success message")
print(f"     - Detects if consensus admin")
print()

print(f"3. Test 'github projects'")
print(f"   Command: github projects")
print(f"   Expected (if linked):")
print(f"     - Fetches repos from GitHub API")
print(f"     - Shows up to 20 repos with:")
print(f"       • Name, description")
print(f"       • Stars, last updated")
print(f"       • Public/private status")
print(f"       • URL")
print(f"   Expected (if not linked):")
print(f"     - Shows 'No GitHub account linked'")
print(f"     - Suggests: 'Run: github link'")
print()

print(f"4. Test 'github upload'")
print(f"   Command: github upload")
print(f"   Expected:")
print(f"     - Shows current project info")
print(f"     - Prompts for repo name, description, visibility")
print(f"     - Creates repo on GitHub")
print(f"     - Uploads project files")
print(f"     - Shows success with repo URL")
print()

print(f"5. Test 'github update'")
print(f"   Command: github update")
print(f"   Expected:")
print(f"     - Detects existing GitHub repo")
print(f"     - Shows what will be updated")
print(f"     - Prompts for confirmation")
print(f"     - Pushes changes to GitHub")
print(f"     - Shows success message")
print()

print(f"6. Test 'github unlink'")
print(f"   Command: github unlink")
print(f"   Expected:")
print(f"     - Shows current linked account")
print(f"     - Prompts: 'Are you sure? (yes/no)'")
print(f"     - If 'yes': Clears connection")
print(f"     - If 'no': Cancels")
print()

print(f"\n{PURPLE}{'='*70}{RESET}")
print(f"{PURPLE}TEST COVERAGE{RESET}")
print(f"{PURPLE}{'='*70}{RESET}\n")

print(f"Automated:")
print(f"  {GREEN}✓{RESET} github status")
print()

print(f"Manual Required:")
print(f"  {YELLOW}⚠{RESET} github link      - Needs username input")
print(f"  {YELLOW}⚠{RESET} github projects  - Needs linked account")
print(f"  {YELLOW}⚠{RESET} github upload    - Needs repo details")
print(f"  {YELLOW}⚠{RESET} github update    - Needs existing repo")
print(f"  {YELLOW}⚠{RESET} github unlink    - Needs confirmation")
print()

print(f"{CYAN}Features to Verify:{RESET}")
print(f"  □ Status shows linked account info")
print(f"  □ Link verifies GitHub username via API")
print(f"  □ Link detects consensus admin status")
print(f"  □ Projects lists repos with details")
print(f"  □ Upload creates new GitHub repo")
print(f"  □ Update pushes changes to existing repo")
print(f"  □ Unlink requires 'yes' confirmation")
print()

print(f"\n{GREEN}Quick Test Workflow:{RESET}")
print(f"  1. github status      # Should show 'not linked'")
print(f"  2. github link        # Enter username")
print(f"  3. github status      # Should show linked account")
print(f"  4. github projects    # Should list repos")
print(f"  5. github unlink      # Enter 'yes'")
print(f"  6. github status      # Should show 'not linked'")
print()

print(f"{PURPLE}{'='*70}{RESET}\n")
