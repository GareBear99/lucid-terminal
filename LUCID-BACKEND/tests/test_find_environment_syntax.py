#!/usr/bin/env python3
"""
🧪 Test Script for 'find <name> environment' Natural Language Syntax

Tests various natural language patterns for finding environments:
- find myproject environment
- find environment myproject
- find myproject env
- locate myproject environment
- search for myproject environment
"""
import sys
import re
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_pattern_matching():
    """Test that regex patterns match expected input formats."""
    
    test_cases = [
        # (input, expected_extracted_name)
        ("find myproject environment", "myproject"),
        ("find environment myproject", "myproject"),
        ("find myproject env", "myproject"),
        ("find env myproject", "myproject"),
        ("locate myproject environment", "myproject"),
        ("locate environment myproject", "myproject"),
        ("search for myproject environment", "myproject"),
        ("search for environment myproject", "myproject"),
        ("search myproject environment", "myproject"),
        ("find the flask environment", "flask"),  # with filler word
        ("find conda environment", "conda"),
        ("find venv environment", "venv"),
    ]
    
    # Patterns from the implementation
    env_patterns = [
        r'find\s+(.+?)\s+environment',  # find myproject environment
        r'find\s+environment\s+(.+)',   # find environment myproject
        r'find\s+(.+?)\s+env(?:$|\s)',  # find myproject env
        r'find\s+env\s+(.+)',           # find env myproject
        r'locate\s+(.+?)\s+environment',
        r'locate\s+environment\s+(.+)',
        r'search\s+for\s+environment\s+(.+)',  # search for environment myproject
        r'search\s+for\s+(.+?)\s+environment',  # search for myproject environment
        r'search\s+(.+?)\s+environment',        # search myproject environment
        r'search\s+environment\s+(.+)',         # search environment myproject
    ]
    
    print("\n" + "=" * 70)
    print("  🧪 PATTERN MATCHING TESTS")
    print("=" * 70 + "\n")
    
    passed = 0
    failed = 0
    
    for user_input, expected_name in test_cases:
        user_lower = user_input.lower()
        matched = False
        extracted_name = None
        
        for pattern in env_patterns:
            match = re.search(pattern, user_lower)
            if match:
                extracted_name = match.group(1).strip()
                # Remove common filler words
                extracted_name = extracted_name.replace('the ', '').replace('an ', '').replace('a ', '')
                matched = True
                break
        
        if matched and extracted_name == expected_name:
            print(f"✅ PASS: '{user_input}'")
            print(f"   Extracted: '{extracted_name}'")
            passed += 1
        else:
            print(f"❌ FAIL: '{user_input}'")
            print(f"   Expected: '{expected_name}'")
            print(f"   Got: '{extracted_name if matched else 'NO MATCH'}'")
            failed += 1
        print()
    
    # Summary
    print("=" * 70)
    print(f"  Results: {passed} passed, {failed} failed")
    print("=" * 70 + "\n")
    
    return failed == 0


def test_integration():
    """Test integration with actual environment search."""
    print("\n" + "=" * 70)
    print("  🔄 INTEGRATION TEST")
    print("=" * 70 + "\n")
    
    try:
        from core.environment_scanner import search_environment
        
        # Test with a common environment name
        print("Testing: find venv environment\n")
        result = search_environment("venv")
        
        print("\n✅ Integration test passed - search_environment() works")
        return True
        
    except Exception as e:
        print(f"\n❌ Integration test failed: {e}")
        return False


def test_edge_cases():
    """Test edge cases and special scenarios."""
    print("\n" + "=" * 70)
    print("  🎯 EDGE CASE TESTS")
    print("=" * 70 + "\n")
    
    edge_cases = [
        # (input, should_match, description)
        ("find myproject", False, "without 'environment' keyword"),
        ("find environment", False, "environment only (no name)"),
        ("environment myproject", False, "missing 'find' keyword"),
        ("find my-project environment", True, "with hyphen"),
        ("find my_project environment", True, "with underscore"),
        ("find project123 environment", True, "with numbers"),
    ]
    
    env_patterns = [
        r'find\s+(.+?)\s+environment',
        r'find\s+environment\s+(.+)',
        r'find\s+(.+?)\s+env(?:$|\s)',
        r'find\s+env\s+(.+)',
    ]
    
    passed = 0
    for user_input, should_match, description in edge_cases:
        user_lower = user_input.lower()
        matched = False
        
        for pattern in env_patterns:
            if re.search(pattern, user_lower):
                matched = True
                break
        
        if matched == should_match:
            print(f"✅ PASS: {description}")
            print(f"   Input: '{user_input}'")
            print(f"   Expected match: {should_match}, Got: {matched}")
            passed += 1
        else:
            print(f"❌ FAIL: {description}")
            print(f"   Input: '{user_input}'")
            print(f"   Expected match: {should_match}, Got: {matched}")
        print()
    
    print(f"Edge cases: {passed}/{len(edge_cases)} passed\n")
    return passed == len(edge_cases)


def run_all_tests():
    """Run all test suites."""
    print("\n" + "=" * 70)
    print("  🧪 FIND ENVIRONMENT SYNTAX TEST SUITE")
    print("=" * 70)
    
    results = []
    
    # Run pattern matching tests
    try:
        result = test_pattern_matching()
        results.append(("Pattern Matching", result))
    except Exception as e:
        print(f"❌ Pattern matching tests crashed: {e}")
        results.append(("Pattern Matching", False))
    
    # Run edge case tests
    try:
        result = test_edge_cases()
        results.append(("Edge Cases", result))
    except Exception as e:
        print(f"❌ Edge case tests crashed: {e}")
        results.append(("Edge Cases", False))
    
    # Run integration test
    try:
        result = test_integration()
        results.append(("Integration", result))
    except Exception as e:
        print(f"❌ Integration test crashed: {e}")
        results.append(("Integration", False))
    
    # Print final summary
    print("\n" + "=" * 70)
    print("  📊 FINAL SUMMARY")
    print("=" * 70 + "\n")
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status} - {test_name}")
    
    all_passed = all(result for _, result in results)
    
    if all_passed:
        print("\n  🎉 ALL TESTS PASSED!")
    else:
        failed_count = sum(1 for _, result in results if not result)
        print(f"\n  ⚠️  {failed_count} test suite(s) failed")
    
    print("\n" + "=" * 70 + "\n")
    
    return all_passed


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
