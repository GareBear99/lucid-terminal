#!/usr/bin/env python3
"""
🧪 LuciferAI Fallback System Test
Demonstrates and tests all 5 tiers of the fallback system
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from fallback_system import FallbackSystem

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


def test_tier_0():
    """Test Tier 0: Environment Detection."""
    print_header("Tier 0: Environment Detection")
    
    system = FallbackSystem()
    env = system.check_system_env()
    
    print(f"{CYAN}OS Type:{RESET} {env['os']}")
    print(f"{CYAN}Kernel:{RESET} {env['kernel']}")
    print(f"{CYAN}Python:{RESET} {env['python']}")
    print(f"{CYAN}PATH Integrity:{RESET} {env['path_integrity']}\n")
    
    print(f"{CYAN}Package Managers:{RESET}")
    for mgr, available in env['package_managers'].items():
        icon = f"{GREEN}✓{RESET}" if available else f"{DIM}✗{RESET}"
        print(f"  {icon} {mgr}")
    
    print(f"\n{CYAN}Critical Dependencies:{RESET}")
    for dep, available in env['dependencies'].items():
        icon = f"{GREEN}✓{RESET}" if available else f"{RED}✗{RESET}"
        print(f"  {icon} {dep}")
    
    return system


def test_tier_1(system):
    """Test Tier 1: Virtual Environment Fallback."""
    print_header("Tier 1: Virtual Environment Fallback")
    
    print(f"{YELLOW}This will create a virtual environment if needed.{RESET}")
    print(f"{DIM}Press Enter to continue or Ctrl+C to skip...{RESET}")
    
    try:
        input()
        success = system.fallback_virtual_env()
        
        if success:
            print(f"\n{GREEN}✅ Tier 1 test passed{RESET}")
        else:
            print(f"\n{RED}❌ Tier 1 test failed{RESET}")
        
        return success
    
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Skipped{RESET}")
        return False


def test_tier_2(system):
    """Test Tier 2: Mirror Binary Fallback."""
    print_header("Tier 2: Mirror Binary Fallback")
    
    print(f"{YELLOW}This will attempt to install packages via package managers.{RESET}")
    print(f"{DIM}Test package: 'curl' (usually already installed){RESET}")
    print(f"{DIM}Press Enter to continue or Ctrl+C to skip...{RESET}")
    
    try:
        input()
        success = system.fallback_mirror_download('curl')
        
        if success:
            print(f"\n{GREEN}✅ Tier 2 test passed{RESET}")
        else:
            print(f"\n{YELLOW}⚠️  Tier 2 test completed (may have been already installed){RESET}")
        
        return success
    
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Skipped{RESET}")
        return False


def test_tier_3(system):
    """Test Tier 3: Stub Module Creation."""
    print_header("Tier 3: Stub Module Creation")
    
    print(f"{PURPLE}Creating stub module for testing...{RESET}\n")
    
    stub_file = system.fallback_stub_module('test_module')
    
    if stub_file and stub_file.exists():
        print(f"{GREEN}✅ Tier 3 test passed{RESET}")
        print(f"{DIM}Stub created at: {stub_file}{RESET}")
        
        # Show stub content
        print(f"\n{CYAN}Stub content:{RESET}")
        with open(stub_file, 'r') as f:
            for line in f.readlines()[:10]:
                print(f"{DIM}{line.rstrip()}{RESET}")
        
        return True
    else:
        print(f"{RED}❌ Tier 3 test failed{RESET}")
        return False


def test_tier_4(system):
    """Test Tier 4: Emergency CLI Mode."""
    print_header("Tier 4: Emergency CLI Mode")
    
    print(f"{RED}This would normally enter emergency CLI mode.{RESET}")
    print(f"{DIM}Simulating emergency state creation...{RESET}\n")
    
    success = system.fallback_emergency_cli()
    
    if success:
        print(f"{GREEN}✅ Tier 4 test passed{RESET}")
        print(f"{DIM}To actually enter emergency mode, run: python core/emergency_cli.py{RESET}")
        return True
    else:
        print(f"{RED}❌ Tier 4 test failed{RESET}")
        return False


def test_recovery(system):
    """Test System Recovery."""
    print_header("Recovery: System Repair")
    
    print(f"{GREEN}Testing automated system repair...{RESET}")
    print(f"{YELLOW}This will attempt to rebuild the environment.{RESET}")
    print(f"{DIM}Press Enter to continue or Ctrl+C to skip...{RESET}")
    
    try:
        input()
        success = system.system_repair()
        
        if success:
            print(f"\n{GREEN}✅ System repair test passed{RESET}")
        else:
            print(f"\n{YELLOW}⚠️  System repair completed with warnings{RESET}")
        
        return success
    
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Skipped{RESET}")
        return False


def test_integrity_verification(system):
    """Test binary integrity verification."""
    print_header("Security: Integrity Verification")
    
    print(f"{CYAN}Testing SHA256 verification...{RESET}\n")
    
    # Create a test file
    test_file = Path("/tmp/lucifer_test_file.txt")
    test_content = b"LuciferAI Test Content"
    
    with open(test_file, 'wb') as f:
        f.write(test_content)
    
    # Calculate hash
    import hashlib
    expected_hash = hashlib.sha256(test_content).hexdigest()
    
    print(f"{DIM}Test file: {test_file}{RESET}")
    print(f"{DIM}Expected hash: {expected_hash[:16]}...{RESET}\n")
    
    # Verify
    success = system.verify_fallback_integrity(test_file, expected_hash)
    
    # Test with wrong hash
    print(f"\n{CYAN}Testing verification failure...{RESET}\n")
    wrong_success = system.verify_fallback_integrity(test_file, "wrong_hash")
    
    # Cleanup
    test_file.unlink()
    
    if success and not wrong_success:
        print(f"\n{GREEN}✅ Integrity verification test passed{RESET}")
        return True
    else:
        print(f"\n{RED}❌ Integrity verification test failed{RESET}")
        return False


def display_summary(results):
    """Display test summary."""
    print_header("Test Summary")
    
    total = len(results)
    passed = sum(1 for r in results.values() if r)
    
    for test_name, result in results.items():
        icon = f"{GREEN}✓{RESET}" if result else f"{RED}✗{RESET}"
        print(f"  {icon} {test_name}")
    
    print(f"\n{BOLD}Results:{RESET} {passed}/{total} tests passed\n")
    
    if passed == total:
        print(f"{GREEN}🎉 All tests passed!{RESET}\n")
    else:
        print(f"{YELLOW}⚠️  Some tests failed or were skipped{RESET}\n")


def main():
    """Run all fallback system tests."""
    print(f"\n{PURPLE}{BOLD}{'═' * 60}{RESET}")
    print(f"{PURPLE}{BOLD}  🧪 LuciferAI Fallback System Test Suite{RESET}")
    print(f"{PURPLE}{BOLD}{'═' * 60}{RESET}\n")
    
    print(f"{CYAN}This will test all 5 tiers of the fallback system:{RESET}")
    print(f"  {DIM}Tier 0:{RESET} Environment Detection")
    print(f"  {CYAN}Tier 1:{RESET} Virtual Environment Fallback")
    print(f"  {YELLOW}Tier 2:{RESET} Mirror Binary Fallback")
    print(f"  {PURPLE}Tier 3:{RESET} Stub Module Creation")
    print(f"  {RED}Tier 4:{RESET} Emergency CLI Mode")
    print(f"  {GREEN}Recovery:{RESET} System Repair")
    print(f"  {BLUE}Security:{RESET} Integrity Verification\n")
    
    results = {}
    
    try:
        # Initialize system and test Tier 0
        system = test_tier_0()
        results["Tier 0: Environment Detection"] = True
        
        input(f"\n{DIM}Press Enter to continue...{RESET}\n")
        
        # Test Tier 1
        results["Tier 1: Virtual Environment"] = test_tier_1(system)
        
        # Test Tier 2
        results["Tier 2: Mirror Fallback"] = test_tier_2(system)
        
        # Test Tier 3
        results["Tier 3: Stub Layer"] = test_tier_3(system)
        
        # Test Tier 4
        results["Tier 4: Emergency CLI"] = test_tier_4(system)
        
        # Test Recovery
        results["System Repair"] = test_recovery(system)
        
        # Test Security
        results["Integrity Verification"] = test_integrity_verification(system)
        
        # Display summary
        display_summary(results)
        
    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Tests interrupted by user{RESET}\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n{RED}❌ Test suite failed: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
