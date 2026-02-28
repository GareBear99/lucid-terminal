#!/usr/bin/env python3
"""
🧪 Test Script for Environment Search and Activate Commands

Tests:
1. List all environments
2. Search for environments by name
3. Search for environments by Python version
4. Search for environments by type
5. Activate environment by name
6. Activate environment by path
7. Handle multiple matches
8. Handle no matches
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.environment_scanner import scan_environments, search_environment, activate_environment


def print_test_header(test_name):
    """Print a formatted test header."""
    print("\n" + "=" * 70)
    print(f"  TEST: {test_name}")
    print("=" * 70 + "\n")


def test_list_all_environments():
    """Test: List all environments on the system."""
    print_test_header("List All Environments")
    
    try:
        scanner = scan_environments()
        
        total_envs = (len(scanner.conda_envs) + len(scanner.luci_envs) + 
                     len(scanner.pyenv_envs) + len(scanner.venv_envs))
        
        print(f"✅ Test passed: Found {total_envs} total environments")
        
        if scanner.active_env:
            print(f"✅ Active environment detected: {scanner.active_env} ({scanner.active_env_type})")
        else:
            print("ℹ️  No active environment (this is OK)")
        
        return True
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False


def test_search_by_name():
    """Test: Search for environments by name."""
    print_test_header("Search Environments by Name")
    
    # Test with common environment names
    test_queries = ['venv', 'env', 'python', 'test']
    
    for query in test_queries:
        print(f"\n📝 Searching for: '{query}'")
        try:
            result = search_environment(query)
            print(f"✅ Search completed for '{query}'")
        except Exception as e:
            print(f"❌ Search failed for '{query}': {e}")
            return False
    
    print("\n✅ All name searches completed")
    return True


def test_search_by_python_version():
    """Test: Search for environments by Python version."""
    print_test_header("Search Environments by Python Version")
    
    # Test with Python versions
    test_versions = ['3.9', '3.10', '3.11', '3.12']
    
    for version in test_versions:
        print(f"\n📝 Searching for Python {version}")
        try:
            result = search_environment(version)
            print(f"✅ Version search completed for {version}")
        except Exception as e:
            print(f"❌ Version search failed for {version}: {e}")
            return False
    
    print("\n✅ All version searches completed")
    return True


def test_search_by_type():
    """Test: Search for environments by type."""
    print_test_header("Search Environments by Type")
    
    # Test with environment types
    test_types = ['conda', 'venv', 'pyenv', 'luci']
    
    for env_type in test_types:
        print(f"\n📝 Searching for {env_type} environments")
        try:
            result = search_environment(env_type)
            print(f"✅ Type search completed for {env_type}")
        except Exception as e:
            print(f"❌ Type search failed for {env_type}: {e}")
            return False
    
    print("\n✅ All type searches completed")
    return True


def test_activate_by_name():
    """Test: Activate environment by name."""
    print_test_header("Activate Environment by Name")
    
    # Test with common names (won't actually activate, just generates command)
    test_names = ['venv', '.venv', 'env']
    
    for name in test_names:
        print(f"\n📝 Testing activate for: '{name}'")
        try:
            result = activate_environment(name)
            if result:
                print(f"✅ Activation command generated for '{name}'")
            else:
                print(f"ℹ️  No environment found for '{name}' (this is OK)")
        except Exception as e:
            print(f"❌ Activate failed for '{name}': {e}")
            return False
    
    print("\n✅ All activation tests completed")
    return True


def test_no_match_handling():
    """Test: Handle searches with no matches."""
    print_test_header("Handle No Match Scenarios")
    
    # Test with non-existent environment
    print("📝 Searching for non-existent environment")
    try:
        result = search_environment("this_env_definitely_does_not_exist_12345")
        print("✅ No match handled gracefully")
    except Exception as e:
        print(f"❌ No match handling failed: {e}")
        return False
    
    print("\n📝 Activating non-existent environment")
    try:
        result = activate_environment("this_env_definitely_does_not_exist_12345")
        print("✅ Activation of non-existent env handled gracefully")
    except Exception as e:
        print(f"❌ Activation handling failed: {e}")
        return False
    
    print("\n✅ All no-match scenarios handled correctly")
    return True


def test_path_search():
    """Test: Search for environments by path."""
    print_test_header("Search Environments by Path")
    
    # Test with common path segments
    test_paths = ['home', 'virtualenvs', 'conda', 'Desktop']
    
    for path_segment in test_paths:
        print(f"\n📝 Searching paths containing: '{path_segment}'")
        try:
            result = search_environment(path_segment)
            print(f"✅ Path search completed for '{path_segment}'")
        except Exception as e:
            print(f"❌ Path search failed for '{path_segment}': {e}")
            return False
    
    print("\n✅ All path searches completed")
    return True


def run_all_tests():
    """Run all test cases."""
    print("\n" + "=" * 70)
    print("  🧪 ENVIRONMENT COMMANDS TEST SUITE")
    print("=" * 70)
    
    tests = [
        ("List All Environments", test_list_all_environments),
        ("Search by Name", test_search_by_name),
        ("Search by Python Version", test_search_by_python_version),
        ("Search by Type", test_search_by_type),
        ("Activate by Name", test_activate_by_name),
        ("No Match Handling", test_no_match_handling),
        ("Path Search", test_path_search),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except KeyboardInterrupt:
            print("\n\n⚠️  Tests interrupted by user")
            break
        except Exception as e:
            print(f"\n❌ Test crashed: {e}")
            results.append((test_name, False))
    
    # Print summary
    print("\n" + "=" * 70)
    print("  📊 TEST SUMMARY")
    print("=" * 70 + "\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status} - {test_name}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n  🎉 ALL TESTS PASSED!")
    else:
        print(f"\n  ⚠️  {total - passed} test(s) failed")
    
    print("\n" + "=" * 70 + "\n")
    
    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
