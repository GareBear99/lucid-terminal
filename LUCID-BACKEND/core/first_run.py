#!/usr/bin/env python3
"""
🩸 LuciferAI First Run Setup
Automatically installs LuciferAI globally on first run per user ID
"""
import os
import sys
import subprocess
import json
from pathlib import Path

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
RESET = '\033[0m'

LUCIFER_HOME = Path.home() / ".luciferai"
FIRST_RUN_FILE = LUCIFER_HOME / ".first_run_complete"
INSTALL_FLAG_FILE = LUCIFER_HOME / ".global_install_complete"


def check_first_run(user_id: str) -> bool:
    """Check if this is the first run for this user ID."""
    if not FIRST_RUN_FILE.exists():
        return True
    
    try:
        with open(FIRST_RUN_FILE, 'r') as f:
            data = json.load(f)
            return data.get('user_id') != user_id
    except:
        return True


def check_global_install() -> bool:
    """Check if LuciferAI is installed globally."""
    try:
        result = subprocess.run(
            ['which', 'LuciferAI'],
            capture_output=True,
            text=True,
            timeout=2
        )
        return result.returncode == 0
    except:
        return False


def prompt_global_install() -> bool:
    """Prompt user to install globally."""
    print(f"\n{PURPLE}╔════════════════════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║     🩸 LuciferAI First Run Setup                     ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════════════════════╝{RESET}\n")
    
    print(f"{YELLOW}Welcome to LuciferAI!{RESET}\n")
    print(f"This appears to be your first time running LuciferAI.")
    print(f"Would you like to install it globally?\n")
    
    print(f"{GREEN}Benefits of global installation:{RESET}")
    print(f"  ✅ Use '{BLUE}LuciferAI{RESET}' command from anywhere")
    print(f"  ✅ No need to navigate to project directory")
    print(f"  ✅ Available in all terminals")
    print(f"  ✅ Auto-completion support\n")
    
    while True:
        response = input(f"{YELLOW}Install globally? [Y/n]: {RESET}").strip().lower()
        
        if response in ['', 'y', 'yes']:
            return True
        elif response in ['n', 'no']:
            return False
        else:
            print(f"{RED}Please enter 'y' or 'n'{RESET}")


def install_globally() -> bool:
    """Install LuciferAI globally."""
    print(f"\n{YELLOW}📦 Installing LuciferAI globally...{RESET}\n")
    
    # Get project directory
    project_dir = Path(__file__).parent.parent
    
    # Try pip install
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-e', str(project_dir)],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            print(f"{GREEN}✅ Successfully installed LuciferAI globally!{RESET}\n")
            
            # Check if command is available
            if check_global_install():
                print(f"{GREEN}✅ 'LuciferAI' command is now available!{RESET}\n")
                print(f"{YELLOW}You can now use:{RESET}")
                print(f"  {BLUE}LuciferAI{RESET}          # From any directory")
                print(f"  {BLUE}luciferai{RESET}          # Lowercase version")
                print(f"  {BLUE}lucifer{RESET}            # Short version\n")
                return True
            else:
                print(f"{YELLOW}⚠️  Command installed but not found in PATH{RESET}")
                print(f"{BLUE}You may need to add pip's bin directory to PATH:{RESET}")
                print(f'{BLUE}export PATH="$PATH:$(python3 -m site --user-base)/bin"{RESET}\n')
                return True
        else:
            # Try --user installation
            print(f"{YELLOW}Trying user installation...{RESET}")
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'install', '--user', '-e', str(project_dir)],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                print(f"{GREEN}✅ Successfully installed LuciferAI (user mode)!{RESET}\n")
                return True
            else:
                print(f"{RED}❌ Installation failed{RESET}")
                print(f"{YELLOW}Error:{RESET} {result.stderr[:200]}")
                return False
                
    except Exception as e:
        print(f"{RED}❌ Installation failed: {e}{RESET}")
        return False


def mark_first_run_complete(user_id: str):
    """Mark first run as complete for this user ID."""
    LUCIFER_HOME.mkdir(exist_ok=True)
    
    data = {
        'user_id': user_id,
        'completed': True,
        'timestamp': str(Path.home())
    }
    
    with open(FIRST_RUN_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def mark_install_complete():
    """Mark global installation as complete."""
    INSTALL_FLAG_FILE.touch()


def run_first_run_setup(user_id: str):
    """Run first-run setup process."""
    # Check if this is first run
    if not check_first_run(user_id):
        return  # Already completed for this user
    
    # Check if already installed globally
    if check_global_install():
        print(f"\n{GREEN}✅ LuciferAI is already installed globally{RESET}")
        mark_first_run_complete(user_id)
        mark_install_complete()
        return
    
    # Check if installation was previously declined
    if INSTALL_FLAG_FILE.exists():
        mark_first_run_complete(user_id)
        return
    
    # Prompt for installation
    if prompt_global_install():
        success = install_globally()
        
        if success:
            mark_install_complete()
            
            print(f"{PURPLE}════════════════════════════════════════════════════════${RESET}")
            print(f"{GREEN}Setup complete! You can now use 'LuciferAI' command 🩸${RESET}")
            print(f"{PURPLE}════════════════════════════════════════════════════════${RESET}\n")
            
            # Suggest restarting
            print(f"{YELLOW}💡 Tip: Restart your terminal or run:{RESET}")
            print(f'{BLUE}   source ~/.bashrc  # or source ~/.zshrc{RESET}\n')
        else:
            print(f"\n{YELLOW}Installation was not successful.{RESET}")
            print(f"{BLUE}You can install manually later with:{RESET}")
            print(f"{BLUE}   ./install.sh{RESET}\n")
    else:
        print(f"\n{YELLOW}Skipping global installation.{RESET}")
        print(f"{BLUE}You can install later with:{RESET}")
        print(f"{BLUE}   ./install.sh{RESET}\n")
        
        # Mark as declined
        mark_install_complete()
    
    # Mark first run complete
    mark_first_run_complete(user_id)


if __name__ == "__main__":
    # Test
    run_first_run_setup("TEST_USER_123")
