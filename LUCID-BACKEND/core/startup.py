#!/usr/bin/env python3
"""
🩸 LuciferAI Startup Handler
Boot sequence with integrated fallback system
"""
import os
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent))

from fallback_system import FallbackSystem, get_fallback_system
from emergency_cli import start_emergency_mode

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'


def check_python_version():
    """Verify Python version requirements."""
    if sys.version_info < (3, 7):
        print(f"{RED}❌ Python 3.7+ required{RESET}")
        print(f"{YELLOW}Current version: {sys.version}{RESET}")
        return False
    return True


def boot_luciferai():
    """
    Main boot sequence with fallback system integration.
    
    Flow:
    1. Check Python version
    2. Initialize fallback system
    3. Audit environment (Tier 0)
    4. Attempt to import critical modules
    5. Fall back through tiers if needed
    6. Start appropriate mode (Normal/Emergency)
    """
    print(f"\n{PURPLE}🩸 LuciferAI{RESET} {DIM}Starting...{RESET}\n")
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Initialize fallback system
    fallback = get_fallback_system()
    
    # Tier 0: Environment audit
    print(f"{BLUE}Running environment audit...{RESET}\n")
    env = fallback.check_system_env()
    
    # Check if we have critical dependencies
    critical_missing = []
    for dep, available in env['dependencies'].items():
        if not available:
            critical_missing.append(dep)
    
    if critical_missing:
        print(f"{YELLOW}⚠️  Missing dependencies: {', '.join(critical_missing)}{RESET}\n")
    
    # Try importing critical Python modules
    print(f"{BLUE}Checking Python modules...{RESET}\n")
    
    modules_to_check = [
        ('colorama', 'colorama'),
        ('requests', 'requests'),
        ('psutil', 'psutil'),
    ]
    
    missing_modules = []
    for module_name, import_name in modules_to_check:
        try:
            __import__(import_name)
            print(f"{GREEN}✓{RESET} {module_name}")
        except ImportError:
            print(f"{RED}✗{RESET} {module_name}")
            missing_modules.append(module_name)
    
    print()
    
    # Fallback cascade
    if missing_modules or critical_missing:
        print(f"{YELLOW}Issues detected, entering fallback cascade...{RESET}\n")
        
        # Tier 1: Virtual Environment
        if missing_modules:
            print(f"{CYAN}Attempting Tier 1: Virtual Environment{RESET}")
            if not fallback.fallback_virtual_env():
                # Tier 1 failed, try Tier 2
                print(f"{YELLOW}Tier 1 failed, escalating to Tier 2...{RESET}\n")
                
                # Tier 2: Mirror/Package Manager
                for module in missing_modules:
                    fallback.fallback_mirror_download(module)
                
                # Re-check after Tier 2
                still_missing = []
                for module_name, import_name in modules_to_check:
                    try:
                        __import__(import_name)
                    except ImportError:
                        still_missing.append(module_name)
                
                if still_missing:
                    # Tier 3: Stub modules
                    print(f"{PURPLE}Tier 2 incomplete, creating stubs (Tier 3)...{RESET}\n")
                    for module in still_missing:
                        fallback.fallback_stub_module(module)
        
        # Check if auto-repair should trigger
        if fallback.should_auto_repair():
            print(f"{GREEN}Auto-repair threshold reached, attempting repair...{RESET}\n")
            if fallback.system_repair():
                print(f"{GREEN}✅ System repaired successfully{RESET}\n")
                fallback.current_tier = 0
                fallback.fallback_streak = 0
    
    # Decide which mode to start
    if fallback.current_tier >= 4:
        # Emergency mode
        print(f"{RED}Catastrophic failure - entering Emergency CLI{RESET}\n")
        fallback.fallback_emergency_cli()
        start_emergency_mode()
        sys.exit(0)
    
    elif fallback.current_tier > 0:
        # Degraded mode but functional
        tier_icons = ["🟢", "🩹", "🔄", "🧩", "☠️"]
        tier_names = ["Native", "Virtual Env", "Mirror", "Stub", "Emergency"]
        
        print(f"{YELLOW}⚠️  Running in degraded mode{RESET}")
        print(f"   Tier: {tier_icons[fallback.current_tier]} {tier_names[fallback.current_tier]}")
        print(f"   Streak: {fallback.fallback_streak}\n")
    
    else:
        # Native mode - all good
        print(f"{GREEN}✅ Environment healthy - native mode{RESET}\n")
    
    # Continue to main application
    print(f"{CYAN}Proceeding to main application...{RESET}\n")
    
    return fallback.current_tier


def verify_dependencies():
    """
    Verify all dependencies are available.
    Called by main application to ensure environment is ready.
    """
    fallback = get_fallback_system()
    
    if fallback.current_tier == 0:
        return True
    
    print(f"{YELLOW}⚠️  Running in fallback mode (Tier {fallback.current_tier}){RESET}")
    return fallback.current_tier < 4


if __name__ == "__main__":
    try:
        tier = boot_luciferai()
        
        if tier < 4:
            print(f"{GREEN}🩸 LuciferAI ready{RESET}\n")
        
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Startup interrupted{RESET}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{RED}❌ Startup failed: {e}{RESET}")
        print(f"{YELLOW}Entering emergency mode...{RESET}\n")
        
        fallback = get_fallback_system()
        fallback.fallback_emergency_cli()
        start_emergency_mode()
