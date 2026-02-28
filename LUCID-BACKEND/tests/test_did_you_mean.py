#!/usr/bin/env python3
"""
Test script for "did you mean" logic on all LLM-related commands.
Tests typos and variations to ensure fuzzy matching works correctly.
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))
sys.path.insert(0, str(Path(__file__).parent / "tools"))

from enhanced_agent import EnhancedLuciferAgent
from lucifer_colors import c

# Colors
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
PURPLE = "\033[35m"
DIM = "\033[2m"
RESET = "\033[0m"


def test_command(agent, command, expected_suggestion=None):
    """Test a single command and check for suggestions."""
    print(f"{CYAN}Testing:{RESET} {DIM}{command}{RESET}")
    
    try:
        response = agent.process_request(command)
        
        # Check if suggestion was made
        if expected_suggestion:
            if expected_suggestion.lower() in str(response).lower():
                print(f"  {GREEN}✓ Correctly suggested: {expected_suggestion}{RESET}\n")
                return True
            else:
                print(f"  {RED}✗ Expected suggestion: {expected_suggestion}{RESET}")
                print(f"  {DIM}Got: {response[:100]}{RESET}\n")
                return False
        else:
            print(f"  {GREEN}✓ Processed{RESET}\n")
            return True
    except Exception as e:
        print(f"  {RED}✗ Error: {e}{RESET}\n")
        return False


def main():
    print(f"{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}🧪 Testing 'Did You Mean' Logic for LLM Commands{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Initialize agent
    print(f"{CYAN}Initializing Enhanced LuciferAI...{RESET}\n")
    agent = EnhancedLuciferAgent()
    print()
    
    # Test categories
    test_cases = {
        "LLM Enable Command Typos": [
            ("llm enble llama3.2", "llm enable"),
            ("llm enbale mistral", "llm enable"),
            ("llm enabel deepseek", "llm enable"),
        ],
        "LLM Disable Command Typos": [
            ("llm disbale llama3.2", "llm disable"),
            ("llm disble mistral", "llm disable"),
            ("llm diable deepseek", "llm disable"),
            ("llm disabel llama3.2", "llm disable"),
        ],
        "LLM List Command Typos": [
            ("llm lst", "llm list"),
            ("llm lsit", "llm list"),
            ("llm lits", "llm list"),
            ("llms lst", "llms"),
            ("models lst", "models list"),
            ("model lst", "models list"),
        ],
        "Models Info Command Typos": [
            ("model info", "models info"),
            ("mdoel info", "models info"),
            ("mdoels info", "models info"),
        ],
        "Zip/Unzip Command Typos": [
            ("zp myfile.txt", "zip"),
            ("ziip myfile.txt", "zip"),
            ("unzp archive.zip", "unzip"),
            ("unziip archive.zip", "unzip"),
            ("uzp archive.zip", "unzip"),
        ],
        "Common Command Typos": [
            ("hlep", "help"),
            ("hlp", "help"),
            ("hepl", "help"),
            ("hep", "help"),
            ("lsit", "list"),
            ("lst", "list"),
            ("raed test.py", "read"),
            ("reda test.py", "read"),
            ("mvoe file.txt dest/", "move"),
            ("mve file.txt dest/", "move"),
        ],
        "Valid Commands (Should Process Normally)": [
            ("llm list", None),
            ("llm enable llama3.2", None),
            ("llm disable mistral", None),
            ("models info", None),
            ("help", None),
            ("zip test.txt", None),
            ("unzip archive.zip", None),
        ],
    }
    
    # Track results
    total_tests = 0
    passed_tests = 0
    failed_tests = []
    
    # Run tests
    for category, tests in test_cases.items():
        print(f"{PURPLE}{'='*70}{RESET}")
        print(f"{YELLOW}📋 {category}{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        for command, expected in tests:
            total_tests += 1
            if test_command(agent, command, expected):
                passed_tests += 1
            else:
                failed_tests.append((command, expected))
        
        print()
    
    # Summary
    print(f"{PURPLE}{'='*70}{RESET}")
    print(f"{CYAN}📊 Test Summary{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    pass_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
    
    print(f"  Total Tests: {total_tests}")
    print(f"  {GREEN}Passed: {passed_tests}{RESET}")
    print(f"  {RED}Failed: {len(failed_tests)}{RESET}")
    print(f"  Pass Rate: {pass_rate:.1f}%\n")
    
    if failed_tests:
        print(f"{RED}Failed Tests:{RESET}\n")
        for command, expected in failed_tests:
            print(f"  {RED}✗{RESET} {command}")
            print(f"    {DIM}Expected: {expected}{RESET}\n")
    else:
        print(f"{GREEN}🎉 All tests passed!{RESET}\n")
    
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Exit with appropriate code
    sys.exit(0 if len(failed_tests) == 0 else 1)


if __name__ == "__main__":
    main()
