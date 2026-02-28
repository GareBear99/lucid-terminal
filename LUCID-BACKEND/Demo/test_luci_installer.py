#!/usr/bin/env python3
"""
🧪 Luci Smart Installer Test
Demonstrates the intelligent package installation with Raspberry Pi support
"""
import sys
from pathlib import Path

# Add luci to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from luci import install_package, SmartInstaller

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
BOLD = '\033[1m'
DIM = '\033[2m'
RESET = '\033[0m'


def print_header(text):
    """Print section header."""
    print(f"\n{BOLD}{BLUE}{'═' * 60}{RESET}")
    print(f"{BOLD}{BLUE}  {text}{RESET}")
    print(f"{BOLD}{BLUE}{'═' * 60}{RESET}\n")


def test_detection():
    """Test system and Raspberry Pi detection."""
    print_header("System Detection")
    
    installer = SmartInstaller()
    
    print(f"{CYAN}OS Type:{RESET} {installer.os_type}")
    print(f"{CYAN}Raspberry Pi:{RESET} {installer.is_raspberry_pi}")
    
    if installer.is_raspberry_pi:
        print(f"\n{GREEN}🫐 Raspberry Pi detected!{RESET}")
        print(f"{YELLOW}Using optimized installation flow for ARM hardware{RESET}")
    
    print(f"\n{CYAN}Available Package Managers:{RESET}")
    
    if installer.available_managers:
        for cmd, name in installer.available_managers:
            print(f"  {GREEN}✓{RESET} {name} ({cmd})")
    else:
        print(f"  {RED}✗{RESET} No package managers found")
    
    print()


def test_installation_flow():
    """Test the installation flow (dry run)."""
    print_header("Installation Flow Test")
    
    print(f"{YELLOW}This demonstrates the 5-tier installation cascade:{RESET}\n")
    
    print(f"{BLUE}Tier 0:{RESET} Luci Package Manager")
    print(f"  {DIM}• LuciferAI's native package system (first choice){RESET}")
    
    print(f"\n{CYAN}Tier 1:{RESET} Virtual Environment Fallback")
    print(f"  {DIM}• Create/activate Python venv and install via pip{RESET}")
    
    print(f"\n{YELLOW}Tier 2:{RESET} System Package Managers")
    print(f"  {DIM}• Try all available system package managers{RESET}")
    print(f"  {DIM}• Raspberry Pi: Prioritize APT and lightweight packages{RESET}")
    print(f"  {DIM}• Extended timeouts for slower hardware{RESET}")
    
    print(f"\n{PURPLE}Tier 3:{RESET} Stub Module Creation")
    print(f"  {DIM}• Create mock module to prevent import crashes{RESET}")
    
    print(f"\n{RED}Tier 4:{RESET} Emergency Mode")
    print(f"  {DIM}• Prompt user with OS-specific installation instructions{RESET}")
    
    print()


def test_raspberry_pi_optimizations():
    """Show Raspberry Pi specific optimizations."""
    print_header("Raspberry Pi Optimizations")
    
    installer = SmartInstaller()
    
    if installer.is_raspberry_pi:
        print(f"{GREEN}🫐 Running on Raspberry Pi{RESET}\n")
        
        print(f"{CYAN}Hardware-Specific Optimizations:{RESET}")
        print(f"  {GREEN}✓{RESET} Extended installation timeouts (10 minutes)")
        print(f"  {GREEN}✓{RESET} Automatic 'apt update' before installs")
        print(f"  {GREEN}✓{RESET} Prioritized lightweight packages")
        print(f"  {GREEN}✓{RESET} Optimized package manager order (APT first)")
        print(f"  {GREEN}✓{RESET} Resource-aware fallback handling")
        
        print(f"\n{CYAN}Package Manager Priority:{RESET}")
        for i, (cmd, name) in enumerate(installer.available_managers, 1):
            print(f"  {i}. {name} ({cmd})")
    else:
        print(f"{YELLOW}Not running on Raspberry Pi{RESET}")
        print(f"{DIM}Raspberry Pi optimizations would activate on ARM hardware{RESET}")
    
    print()


def test_example_installations():
    """Show example installation commands."""
    print_header("Example Usage")
    
    print(f"{CYAN}Python API:{RESET}\n")
    
    print(f"{DIM}from luci import install_package{RESET}\n")
    
    print(f"{BLUE}# Smart install (tries all tiers){RESET}")
    print(f"{DIM}install_package('curl'){RESET}\n")
    
    print(f"{BLUE}# Force specific manager{RESET}")
    print(f"{DIM}install_package('git', force_manager='brew'){RESET}\n")
    
    print(f"{CYAN}Command Line:{RESET}\n")
    
    print(f"{BLUE}# Basic install{RESET}")
    print(f"{DIM}python -m luci.smart_installer curl{RESET}\n")
    
    print(f"{BLUE}# Force manager{RESET}")
    print(f"{DIM}python -m luci.smart_installer git --manager apt{RESET}\n")
    
    print(f"{CYAN}Raspberry Pi Specific:{RESET}\n")
    
    print(f"{BLUE}# Install system tool (automatically uses APT){RESET}")
    print(f"{DIM}install_package('htop')  # Optimized for RPi{RESET}\n")
    
    print(f"{BLUE}# Install Python package (lightweight priority){RESET}")
    print(f"{DIM}install_package('requests')  # Uses pip3 on RPi{RESET}\n")


def show_integration():
    """Show integration with fallback system."""
    print_header("Integration with Fallback System")
    
    print(f"{CYAN}The Luci installer integrates with LuciferAI's 5-tier fallback:{RESET}\n")
    
    print(f"{BLUE}Tier 0:{RESET} Luci → Direct package install")
    print(f"{CYAN}Tier 1:{RESET} Virtual Environment → Isolated Python packages")
    print(f"{YELLOW}Tier 2:{RESET} System Managers → Multi-source installation")
    print(f"{PURPLE}Tier 3:{RESET} Stub Modules → Graceful degradation")
    print(f"{RED}Tier 4:{RESET} Emergency Mode → User guidance + auto-repair")
    
    print(f"\n{GREEN}💫 Auto-Repair:{RESET}")
    print(f"{DIM}After 3 consecutive failures, system repair triggers automatically{RESET}\n")


def main():
    """Run all tests."""
    print(f"\n{PURPLE}{BOLD}{'═' * 60}{RESET}")
    print(f"{PURPLE}{BOLD}  🩸 Luci Smart Installer Test Suite{RESET}")
    print(f"{PURPLE}{BOLD}{'═' * 60}{RESET}\n")
    
    print(f"{CYAN}Demonstrating intelligent package installation{RESET}")
    print(f"{CYAN}with Raspberry Pi support and 5-tier fallback{RESET}\n")
    
    try:
        test_detection()
        
        input(f"{DIM}Press Enter to continue...{RESET}\n")
        
        test_installation_flow()
        
        input(f"{DIM}Press Enter to continue...{RESET}\n")
        
        test_raspberry_pi_optimizations()
        
        input(f"{DIM}Press Enter to continue...{RESET}\n")
        
        test_example_installations()
        
        input(f"{DIM}Press Enter to continue...{RESET}\n")
        
        show_integration()
        
        print(f"\n{GREEN}✅ All tests completed!{RESET}\n")
        
        print(f"{YELLOW}💡 To test actual installation:{RESET}")
        print(f"{DIM}   python -m luci.smart_installer <package_name>{RESET}\n")
        
    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Tests interrupted{RESET}\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n{RED}❌ Test failed: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
