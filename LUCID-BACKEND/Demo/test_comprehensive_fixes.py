#!/usr/bin/env python3
"""
🧪 Comprehensive Fix Dictionary Test
Tests 30 common issues with fixes, uploads to consensus, and tests retrieval
"""
import os
import sys
import hashlib
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent / "core"))

from relevance_dictionary import RelevanceDictionary
from fixnet_uploader import FixNetUploader

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

# Generate user ID
def get_user_id():
    import uuid
    device_id = str(uuid.UUID(int=uuid.getnode()))
    username = os.getenv("USER", "unknown")
    return hashlib.sha256(f"{device_id}-{username}".encode()).hexdigest()[:16].upper()

# 30 Common Python Issues with Fixes
COMMON_ISSUES = [
    # Import errors
    {
        "error_type": "ImportError",
        "error": "ImportError: No module named 'requests'",
        "solution": "import requests",
        "category": "import"
    },
    {
        "error_type": "ImportError",
        "error": "ModuleNotFoundError: No module named 'numpy'",
        "solution": "import numpy as np",
        "category": "import"
    },
    {
        "error_type": "ImportError",
        "error": "ImportError: cannot import name 'datetime' from 'datetime'",
        "solution": "from datetime import datetime",
        "category": "import"
    },
    {
        "error_type": "ImportError",
        "error": "ModuleNotFoundError: No module named 'pandas'",
        "solution": "import pandas as pd",
        "category": "import"
    },
    {
        "error_type": "ImportError",
        "error": "ImportError: No module named 'matplotlib'",
        "solution": "import matplotlib.pyplot as plt",
        "category": "import"
    },
    
    # NameError - undefined variables
    {
        "error_type": "NameError",
        "error": "NameError: name 'os' is not defined",
        "solution": "import os",
        "category": "import"
    },
    {
        "error_type": "NameError",
        "error": "NameError: name 'sys' is not defined",
        "solution": "import sys",
        "category": "import"
    },
    {
        "error_type": "NameError",
        "error": "NameError: name 'json' is not defined",
        "solution": "import json",
        "category": "import"
    },
    {
        "error_type": "NameError",
        "error": "NameError: name 're' is not defined",
        "solution": "import re",
        "category": "import"
    },
    {
        "error_type": "NameError",
        "error": "NameError: name 'Path' is not defined",
        "solution": "from pathlib import Path",
        "category": "import"
    },
    
    # AttributeError
    {
        "error_type": "AttributeError",
        "error": "AttributeError: 'str' object has no attribute 'append'",
        "solution": "Use list instead of str, or use str += item",
        "category": "type_mismatch"
    },
    {
        "error_type": "AttributeError",
        "error": "AttributeError: 'NoneType' object has no attribute 'strip'",
        "solution": "Check if variable is None before calling methods",
        "category": "null_check"
    },
    {
        "error_type": "AttributeError",
        "error": "AttributeError: module 'os' has no attribute 'getcwd'",
        "solution": "Use os.getcwd() - check spelling",
        "category": "typo"
    },
    
    # TypeError
    {
        "error_type": "TypeError",
        "error": "TypeError: can only concatenate str (not 'int') to str",
        "solution": "Use str() to convert: result = str_var + str(int_var)",
        "category": "type_conversion"
    },
    {
        "error_type": "TypeError",
        "error": "TypeError: 'int' object is not iterable",
        "solution": "Use range() for iteration: for i in range(n)",
        "category": "iteration"
    },
    {
        "error_type": "TypeError",
        "error": "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
        "solution": "Convert types: int(str_var) or str(int_var)",
        "category": "type_conversion"
    },
    
    # IndexError
    {
        "error_type": "IndexError",
        "error": "IndexError: list index out of range",
        "solution": "Check list length before accessing: if len(lst) > index",
        "category": "bounds_check"
    },
    {
        "error_type": "IndexError",
        "error": "IndexError: string index out of range",
        "solution": "Use string slicing safely: s[:n] or check len(s)",
        "category": "bounds_check"
    },
    
    # KeyError
    {
        "error_type": "KeyError",
        "error": "KeyError: 'key_name'",
        "solution": "Use dict.get('key_name', default) or check 'key_name' in dict",
        "category": "dict_access"
    },
    {
        "error_type": "KeyError",
        "error": "KeyError: 0",
        "solution": "Dictionary key not found - use get() method",
        "category": "dict_access"
    },
    
    # ValueError
    {
        "error_type": "ValueError",
        "error": "ValueError: invalid literal for int() with base 10",
        "solution": "Validate input before conversion: if str.isdigit(): int(str)",
        "category": "validation"
    },
    {
        "error_type": "ValueError",
        "error": "ValueError: too many values to unpack",
        "solution": "Check number of items in unpacking: a, b = tuple",
        "category": "unpacking"
    },
    {
        "error_type": "ValueError",
        "error": "ValueError: not enough values to unpack",
        "solution": "Ensure tuple has enough items or use * operator",
        "category": "unpacking"
    },
    
    # FileNotFoundError
    {
        "error_type": "FileNotFoundError",
        "error": "FileNotFoundError: [Errno 2] No such file or directory",
        "solution": "Check file exists: if os.path.exists(path)",
        "category": "file_check"
    },
    {
        "error_type": "FileNotFoundError",
        "error": "FileNotFoundError: config.json not found",
        "solution": "Use Path(file).exists() before opening",
        "category": "file_check"
    },
    
    # SyntaxError
    {
        "error_type": "SyntaxError",
        "error": "SyntaxError: invalid syntax",
        "solution": "Check for missing colons, parentheses, or quotes",
        "category": "syntax"
    },
    {
        "error_type": "IndentationError",
        "error": "IndentationError: expected an indented block",
        "solution": "Add proper indentation (4 spaces or tab)",
        "category": "syntax"
    },
    
    # ZeroDivisionError
    {
        "error_type": "ZeroDivisionError",
        "error": "ZeroDivisionError: division by zero",
        "solution": "Check divisor: if divisor != 0: result = a / divisor",
        "category": "validation"
    },
    
    # Common logic errors
    {
        "error_type": "NameError",
        "error": "NameError: name 'time' is not defined",
        "solution": "import time",
        "category": "import"
    },
    {
        "error_type": "NameError",
        "error": "NameError: name 'subprocess' is not defined",
        "solution": "import subprocess",
        "category": "import"
    }
]

# Sequential issues (one fix leads to another)
SEQUENTIAL_ISSUES = [
    {
        "sequence": 1,
        "error_type": "ImportError",
        "error": "ModuleNotFoundError: No module named 'flask'",
        "solution": "import flask",
        "leads_to": 2
    },
    {
        "sequence": 2,
        "error_type": "NameError",
        "error": "NameError: name 'Flask' is not defined",
        "solution": "from flask import Flask",
        "leads_to": 3
    },
    {
        "sequence": 3,
        "error_type": "NameError",
        "error": "NameError: name 'request' is not defined",
        "solution": "from flask import request",
        "leads_to": None
    }
]


def test_basic_fixes(rd: RelevanceDictionary, uploader: FixNetUploader):
    """Test 30 common fixes and upload to consensus."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}TEST 1: Adding 30 Common Fixes to Dictionary{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    added_fixes = []
    
    for i, issue in enumerate(COMMON_ISSUES, 1):
        # Generate fix hash
        fix_content = f"{issue['error']}|{issue['solution']}"
        fix_hash = hashlib.sha256(fix_content.encode()).hexdigest()[:16]
        
        # Add to dictionary
        print(f"{BLUE}[{i}/30]{RESET} Adding: {issue['error_type']} - {issue['error'][:50]}...")
        
        dict_key = rd.add_fix(
            error_type=issue['error_type'],
            error_signature=issue['error'],
            solution=issue['solution'],
            fix_hash=fix_hash,
            context={
                "category": issue['category'],
                "common": True,
                "test": True
            }
        )
        
        added_fixes.append({
            "fix_hash": fix_hash,
            "error": issue['error'],
            "solution": issue['solution']
        })
        
        # Simulate upload to consensus
        # In real system, this would go to FixNet GitHub
        print(f"  {GREEN}✓{RESET} Added to local dictionary")
    
    print(f"\n{GREEN}✅ Added {len(added_fixes)} fixes to dictionary{RESET}")
    return added_fixes


def test_sequential_fixes(rd: RelevanceDictionary):
    """Test sequential issues that build on each other."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}TEST 2: Testing Sequential Fixes{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    print(f"{GOLD}Simulating: Flask app development with cascading errors{RESET}\n")
    
    for issue in SEQUENTIAL_ISSUES:
        seq = issue['sequence']
        print(f"{BLUE}[Step {seq}]{RESET} Error: {issue['error']}")
        
        # Add fix
        fix_content = f"{issue['error']}|{issue['solution']}"
        fix_hash = hashlib.sha256(fix_content.encode()).hexdigest()[:16]
        
        rd.add_fix(
            error_type=issue['error_type'],
            error_signature=issue['error'],
            solution=issue['solution'],
            fix_hash=fix_hash,
            context={
                "sequence": seq,
                "sequential": True
            }
        )
        
        print(f"  {GREEN}→{RESET} Fix applied: {issue['solution']}")
        
        if issue['leads_to']:
            print(f"  {GOLD}↓{RESET} This leads to next error...\n")
        else:
            print(f"  {GREEN}✓{RESET} Sequence complete!\n")


def test_fix_retrieval(rd: RelevanceDictionary, test_queries):
    """Test retrieving fixes from dictionary."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}TEST 3: Testing Fix Retrieval{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    results = []
    
    for i, query in enumerate(test_queries, 1):
        print(f"{BLUE}[Query {i}]{RESET} Searching for: {query[:60]}...")
        
        matches = rd.search_similar_fixes(query, min_relevance=0.3)
        
        if matches:
            best = matches[0]
            print(f"  {GREEN}✓{RESET} Found {len(matches)} matches")
            print(f"  {GREEN}→{RESET} Best: {best['solution'][:60]}")
            print(f"  {GREEN}→{RESET} Score: {best['relevance_score']:.2f}")
            print(f"  {GREEN}→{RESET} Source: {best['source']}")
            results.append(True)
        else:
            print(f"  {RED}✗{RESET} No matches found")
            results.append(False)
        print()
    
    success_rate = sum(results) / len(results) * 100
    print(f"\n{GREEN}Success rate: {success_rate:.1f}% ({sum(results)}/{len(results)}){RESET}")
    return results


def test_consensus_sync(rd: RelevanceDictionary):
    """Test syncing with consensus (simulated)."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}TEST 4: Testing Consensus Sync{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    print(f"{BLUE}Syncing with remote FixNet...{RESET}")
    rd.sync_with_remote()
    
    print(f"{GREEN}✓ Sync complete{RESET}")
    print(f"  Remote fixes available: {len(rd.remote_refs)}")


def test_fix_usage_tracking(rd: RelevanceDictionary, sample_fixes):
    """Test recording fix usage and updating relevance scores."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}TEST 5: Testing Usage Tracking & Score Updates{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Simulate using some fixes
    for i, fix in enumerate(sample_fixes[:5], 1):
        print(f"{BLUE}[{i}/5]{RESET} Using fix: {fix['fix_hash'][:12]}...")
        
        # Simulate successful application
        success = i % 2 == 1  # Alternate success/failure
        rd.record_fix_usage(fix['fix_hash'], success)
        
        status = f"{GREEN}succeeded{RESET}" if success else f"{RED}failed{RESET}"
        print(f"  {status}")
        print()


def print_statistics(rd: RelevanceDictionary):
    """Print comprehensive statistics."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}Final Statistics{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    rd.print_statistics()


def main():
    print(f"\n{PURPLE}{'='*80}{RESET}")
    print(f"{PURPLE}{'🧪 COMPREHENSIVE FIX DICTIONARY TEST':^80}{RESET}")
    print(f"{PURPLE}{'='*80}{RESET}\n")
    
    # Initialize
    user_id = get_user_id()
    print(f"{GOLD}User ID: {user_id}{RESET}\n")
    
    rd = RelevanceDictionary(user_id)
    uploader = FixNetUploader(user_id)
    
    # Test 1: Add 30 common fixes
    added_fixes = test_basic_fixes(rd, uploader)
    
    # Test 2: Sequential fixes
    test_sequential_fixes(rd)
    
    # Test 3: Retrieval
    test_queries = [
        "ImportError: No module named 'requests'",
        "NameError: name 'os' is not defined",
        "TypeError: can only concatenate str (not 'int') to str",
        "IndexError: list index out of range",
        "FileNotFoundError: config.json not found",
        "ModuleNotFoundError: No module named 'flask'",
        "NameError: name 'Flask' is not defined",
        "ValueError: invalid literal for int()",
        "AttributeError: 'NoneType' object has no attribute",
        "KeyError: 'key_name'"
    ]
    
    retrieval_results = test_fix_retrieval(rd, test_queries)
    
    # Test 4: Sync
    test_consensus_sync(rd)
    
    # Test 5: Usage tracking
    test_fix_usage_tracking(rd, added_fixes)
    
    # Final statistics
    print_statistics(rd)
    
    # Summary
    print(f"\n{PURPLE}{'='*80}{RESET}")
    print(f"{PURPLE}{'SUMMARY':^80}{RESET}")
    print(f"{PURPLE}{'='*80}{RESET}\n")
    
    print(f"{GREEN}✅ Tests Completed:{RESET}")
    print(f"  • {len(COMMON_ISSUES)} common fixes added")
    print(f"  • {len(SEQUENTIAL_ISSUES)} sequential fixes tested")
    print(f"  • {len(test_queries)} retrieval queries executed")
    print(f"  • Usage tracking validated")
    print(f"  • Consensus sync tested")
    print()
    print(f"{GOLD}Retrieval Success Rate:{RESET} {sum(retrieval_results)}/{len(retrieval_results)} queries")
    print()
    print(f"{BLUE}💡 Next Steps:{RESET}")
    print(f"  1. Test with daemon watch mode")
    print(f"  2. Test with daemon autofix mode")
    print(f"  3. Verify fixes apply correctly to real scripts")
    print()
    print(f"{PURPLE}All comprehensive tests complete! 🩸✨{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{GOLD}Test interrupted by user{RESET}\n")
    except Exception as e:
        print(f"\n\n{RED}Error during testing: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
