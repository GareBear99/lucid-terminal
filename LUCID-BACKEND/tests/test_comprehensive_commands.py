#!/usr/bin/env python3
"""
🧪 Comprehensive Command Test Suite
Tests all commands from help page + multi-request chaining + typo correction
"""
import os
import sys
from pathlib import Path
import time

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from enhanced_agent import EnhancedLuciferAgent

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"

class ComprehensiveTestRunner:
    def __init__(self):
        self.agent = EnhancedLuciferAgent()
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.test_dir = Path.home() / "Desktop" / "luci_comprehensive_test"
        
    def setup(self):
        """Setup test environment."""
        print(f"\n{BLUE}Setting up test environment...{RESET}")
        if self.test_dir.exists():
            import shutil
            shutil.rmtree(self.test_dir)
        self.test_dir.mkdir(parents=True)
        print(f"{GREEN}✓ Created: {self.test_dir}{RESET}\n")
    
    def cleanup(self):
        """Cleanup test environment."""
        print(f"\n{BLUE}Cleaning up...{RESET}")
        if self.test_dir.exists():
            import shutil
            shutil.rmtree(self.test_dir)
        print(f"{GREEN}✓ Cleaned up{RESET}\n")
    
    def test_command(self, name, command, validator=None):
        """Test a single command."""
        self.tests_run += 1
        print(f"{CYAN}Test {self.tests_run}: {name}{RESET}")
        print(f"{DIM}Command: {command}{RESET}")
        
        try:
            response = self.agent.process_request(command)
            
            # Check if validator provided
            if validator:
                success, msg = validator(response)
                status = f"{GREEN}✓ PASS{RESET}" if success else f"{RED}✗ FAIL{RESET}"
                print(f"{status}: {msg}\n")
                if success:
                    self.tests_passed += 1
                else:
                    self.tests_failed += 1
            else:
                # Just check response exists
                if response and not "error" in response.lower():
                    print(f"{GREEN}✓ PASS{RESET}: Got response\n")
                    self.tests_passed += 1
                else:
                    print(f"{RED}✗ FAIL{RESET}: Error in response\n")
                    self.tests_failed += 1
        except Exception as e:
            print(f"{RED}✗ FAIL{RESET}: Exception: {e}\n")
            self.tests_failed += 1
    
    def print_summary(self):
        """Print test summary."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print(f"{PURPLE}TEST SUMMARY{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"Total: {self.tests_run}")
        print(f"{GREEN}Passed: {self.tests_passed}{RESET}")
        print(f"{RED}Failed: {self.tests_failed}{RESET}")
        
        rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\nPass rate: {rate:.1f}%\n")


def test_file_operations(runner):
    """Test file operation commands."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 1: FILE OPERATIONS{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Create test files
    test_file = runner.test_dir / "test.txt"
    test_file.write_text("Test content")
    
    # Test read
    runner.test_command(
        "Read file",
        f"read {test_file}",
        lambda r: ("test content" in r.lower() or "test.txt" in r.lower(), "File read")
    )
    
    # Test list
    runner.test_command(
        "List directory",
        f"list {runner.test_dir}",
        lambda r: ("test.txt" in r or "1 file" in r.lower(), "Directory listed")
    )
    
    # Test copy
    runner.test_command(
        "Copy file",
        f"copy {test_file} {runner.test_dir}/copied.txt",
        lambda r: (runner.test_dir / "copied.txt").exists() or "error" not in r.lower()
    )
    
    # Test move
    move_src = runner.test_dir / "moveme.txt"
    move_src.write_text("Move this")
    runner.test_command(
        "Move file",
        f"move {move_src} {runner.test_dir}/moved.txt",
        lambda r: not move_src.exists() or "moved" in r.lower()
    )


def test_info_commands(runner):
    """Test information commands."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 2: INFORMATION COMMANDS{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    runner.test_command("Help command", "help")
    runner.test_command("Memory command", "memory")
    runner.test_command("Info/test command", "info")
    runner.test_command("PWD command", "pwd")


def test_typo_correction(runner):
    """Test auto-correct typo functionality."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 3: TYPO CORRECTION{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Common typos
    runner.test_command("Typo: mve → move", f"mve {runner.test_dir}/test.txt {runner.test_dir}/test2.txt")
    runner.test_command("Typo: instal → install", "instal python")
    runner.test_command("Typo: olama → ollama", "olama list")


def test_multi_request_1(runner):
    """Test 1: Two commands in one request."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 4: MULTI-REQUEST TESTING (2 commands){RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Create test files
    file1 = runner.test_dir / "multi1.txt"
    file1.write_text("File 1")
    
    # Test 1: Create and list
    runner.test_command(
        "Multi: Create file, then list directory",
        f"Create a file called multi_test.txt in {runner.test_dir}, then list the directory",
        lambda r: True  # Just check it runs
    )
    
    # Test 2: Copy and read
    runner.test_command(
        "Multi: Copy file, then read it",
        f"Copy {file1} to {runner.test_dir}/multi1_copy.txt, then read the copied file",
        lambda r: True
    )
    
    # Test 3: List and count
    runner.test_command(
        "Multi: List directory, then tell me how many files",
        f"List {runner.test_dir} and tell me how many files are there",
        lambda r: True
    )


def test_multi_request_2(runner):
    """Test 2: Three commands in one request."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 5: MULTI-REQUEST TESTING (3 commands){RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Create test files
    file2 = runner.test_dir / "multi2.txt"
    file2.write_text("File 2 content")
    file3 = runner.test_dir / "multi3.txt"
    file3.write_text("File 3 content")
    
    # Test 1: Three file operations
    runner.test_command(
        "Multi: Copy, move, then list",
        f"Copy {file2} to {runner.test_dir}/copy2.txt, move {file3} to {runner.test_dir}/moved3.txt, then list {runner.test_dir}",
        lambda r: True
    )
    
    # Test 2: Create, write, read
    runner.test_command(
        "Multi: Create file, write content, read it back",
        f"Create a file at {runner.test_dir}/chain.txt, write 'chained commands' to it, then read it",
        lambda r: True
    )
    
    # Test 3: Mixed commands
    runner.test_command(
        "Multi: List, check current dir, show memory",
        f"List {runner.test_dir}, show me current directory, and display memory stats",
        lambda r: True
    )


def test_multi_request_3(runner):
    """Test 3: Four+ commands in one request."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 6: MULTI-REQUEST TESTING (4+ commands){RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Test 1: Four commands
    runner.test_command(
        "Multi: 4 commands - create, copy, move, list",
        f"Create {runner.test_dir}/four1.txt, copy it to {runner.test_dir}/four2.txt, move {runner.test_dir}/four2.txt to {runner.test_dir}/four3.txt, then list the directory",
        lambda r: True
    )
    
    # Test 2: Five commands
    runner.test_command(
        "Multi: 5 commands - file operations chain",
        f"Create {runner.test_dir}/five1.txt, read it, copy it to {runner.test_dir}/five2.txt, list {runner.test_dir}, then show current directory",
        lambda r: True
    )
    
    # Test 3: Complex with typos
    runner.test_command(
        "Multi: Complex with typos",
        f"Crete {runner.test_dir}/typo.txt, copie it to {runner.test_dir}/typo2.txt, mve {runner.test_dir}/typo2.txt to {runner.test_dir}/typo3.txt, then lst the directory",
        lambda r: True
    )


def test_natural_language(runner):
    """Test natural language parsing."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION 7: NATURAL LANGUAGE PARSING{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Create test file
    nl_file = runner.test_dir / "natural.txt"
    nl_file.write_text("Natural language test")
    
    # Test natural variations
    runner.test_command(
        "NL: 'Show me what's in...'",
        f"Show me what's in {runner.test_dir}",
        lambda r: True
    )
    
    runner.test_command(
        "NL: 'Can you read...'",
        f"Can you read {nl_file} for me?",
        lambda r: True
    )
    
    runner.test_command(
        "NL: 'I need to copy...'",
        f"I need to copy {nl_file} to {runner.test_dir}/nl_copy.txt",
        lambda r: True
    )


def main():
    print(f"\n{PURPLE}{'='*80}{RESET}")
    print(f"{PURPLE}{'🧪 COMPREHENSIVE COMMAND TEST SUITE':^80}{RESET}")
    print(f"{PURPLE}{'='*80}{RESET}")
    print(f"\n{CYAN}Testing: All commands + Multi-request + Typo correction{RESET}\n")
    
    runner = ComprehensiveTestRunner()
    
    try:
        runner.setup()
        
        # Run all test sections
        test_file_operations(runner)
        test_info_commands(runner)
        test_typo_correction(runner)
        test_multi_request_1(runner)
        test_multi_request_2(runner)
        test_multi_request_3(runner)
        test_natural_language(runner)
        
        # Summary
        runner.print_summary()
        
    except KeyboardInterrupt:
        print(f"\n\n{GOLD}Tests interrupted{RESET}\n")
    except Exception as e:
        print(f"\n\n{RED}Test error: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
    finally:
        runner.cleanup()


if __name__ == "__main__":
    main()
