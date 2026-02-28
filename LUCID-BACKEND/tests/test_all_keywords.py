#!/usr/bin/env python3
"""
Comprehensive test of all keyword handlers including fuzzy matching
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.simple_knowledge import handle_simple_query
from core.zodiac_knowledge import handle_zodiac_query

def test_keyword(query: str, description: str, expected_match: bool = True):
    """Test a single keyword query."""
    # Try simple knowledge
    result = handle_simple_query(query)
    
    # Try zodiac if no simple match
    if not result:
        result = handle_zodiac_query(query)
    
    matched = bool(result)
    status = "✅" if matched == expected_match else "❌"
    
    if matched:
        preview = result[:60] + "..." if len(result) > 60 else result
        print(f"{status} {description:50} -> {preview}")
    else:
        print(f"{status} {description:50} -> NO MATCH")
    
    return matched == expected_match

def main():
    """Run comprehensive keyword tests."""
    
    print("\n🧪 Comprehensive Keyword Test Suite")
    print("Testing all knowledge handlers with exact matches and typos\n")
    
    tests = [
        # === EXACT MATCHES ===
        ("What is ls?", "Terminal: ls command", True),
        ("What is python?", "Language: Python definition", True),
        ("Define algorithm", "Concept: Algorithm", True),
        ("What is git?", "Tool: Git VCS", True),
        ("Explain grep", "Command: grep search", True),
        ("What does serendipity mean?", "Word: Serendipity", True),
        ("hello", "Greeting: hello", True),
        ("What is docker?", "Tool: Docker", True),
        ("Define variable", "Concept: Variable", True),
        ("What is npm?", "Tool: NPM", True),
        
        # === ZODIAC ===
        ("What is a Virgo?", "Zodiac: Virgo sign", True),
        ("When is Aries season?", "Zodiac: Aries dates", True),
        ("What are the traits of Leo?", "Zodiac: Leo traits", True),
        ("What element is Scorpio?", "Zodiac: Scorpio element", True),
        
        # === TYPOS AND FUZZY MATCHING ===
        ("What is pythom?", "Typo: pythom -> python", True),
        ("What is dockerr?", "Typo: dockerr -> docker", True),
        ("Define algoritm", "Typo: algoritm -> algorithm", True),
        ("What is gittt?", "Typo: gittt -> git", True),
        ("Explain grepp", "Typo: grepp -> grep", True),
        ("What is virgo?", "Typo: virgo (lowercase) -> Virgo", True),
        
        # === MORE DEFINITIONS ===
        ("What is rust?", "Language: Rust", True),
        ("What is javascript?", "Language: JavaScript", True),
        ("Define boolean", "Type: Boolean", True),
        ("What is json?", "Format: JSON", True),
        ("What is kubernetes?", "Tool: Kubernetes", True),
        ("Define recursion", "Concept: Recursion", True),
        ("What does ephemeral mean?", "Word: Ephemeral", True),
        
        # === COMMANDS ===
        ("What is mkdir?", "Command: mkdir", True),
        ("What is chmod?", "Command: chmod", True),
        ("What is sudo?", "Command: sudo", True),
        ("What is cat?", "Command: cat", True),
        
        # === HOW TO QUERIES ===
        ("How do I create a file?", "HowTo: Create file", True),
        ("How do I create a folder?", "HowTo: Create folder", True),
        
        # === COMPARISONS ===
        ("Compare ls and dir", "Compare: ls vs dir", True),
        
        # === ZODIAC ADVANCED ===
        ("List all zodiac signs", "Zodiac: List all", True),
        ("What sign comes after Gemini?", "Zodiac: Sequential", True),
        ("Which signs are fire signs?", "Zodiac: Fire element", True),
        ("What planet rules Pisces?", "Zodiac: Ruling planet", True),
        
        # === SHOULD NOT MATCH ===
        ("asdfghjkl", "Gibberish: No match", False),
        ("something totally unknown", "Unknown: No match", False),
    ]
    
    passed = 0
    failed = 0
    
    for query, desc, expected in tests:
        if test_keyword(query, desc, expected):
            passed += 1
        else:
            failed += 1
    
    # Summary
    print(f"\n{'='*70}")
    print(f"📊 RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print(f"{'='*70}\n")
    
    if failed == 0:
        print("✅ All keyword tests passed!")
    else:
        print(f"⚠️  {failed} tests failed")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
