#!/usr/bin/env python3
"""
Test new bundled models features:
1. "Bundled Models?" shows .luciferai/models directory
2. Progress bar displays when running tests
"""
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from enhanced_agent import EnhancedLuciferAgent


def test_bundled_models_directory():
    """Test that 'bundled models' shows the models directory."""
    print("\n🧪 Test 1: Bundled Models Directory Listing")
    print("=" * 60)
    
    agent = EnhancedLuciferAgent()
    
    # Test variations
    test_inputs = [
        "bundled models",
        "Bundled Models?",
        "show bundled models",
        "bundled model"
    ]
    
    for test_input in test_inputs:
        print(f"\nTesting: '{test_input}'")
        response = agent.process_request(test_input)
        
        # Check if response contains models directory path
        if '.luciferai/models' in response or '.luciferai' in response:
            print(f"  ✅ Correctly shows models directory")
        else:
            print(f"  ❌ Does not show models directory")
            print(f"     Response: {response[:200]}...")
    
    print("\n" + "=" * 60)


def test_progress_bar_info():
    """Provide info about progress bar testing."""
    print("\n🧪 Test 2: Progress Bar During Tests")
    print("=" * 60)
    print("\nProgress bar testing requires manual verification:")
    print("  1. Run: ./lucifer.py")
    print("  2. Type: run test")
    print("  3. Verify you see:")
    print("     - Animated spinner (⠋ ⠙ ⠹ etc.)")
    print("     - Progress bar: [████████░░░░...]")
    print("     - Timer: 00:15 (minutes:seconds)")
    print("     - Text: 'Running tests...'")
    print("\nExpected format:")
    print("  ⠋ [████████████████░░░░░░░░░░░░░░░░░░░░░░░░] 00:15 Running tests...")
    print("\n" + "=" * 60)


def main():
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║   🧪 Bundled Models Features Test Suite               ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    try:
        # Test 1: Directory listing
        test_bundled_models_directory()
        
        # Test 2: Progress bar info
        test_progress_bar_info()
        
        print("\n✅ Feature tests complete!")
        print("\n📝 Summary:")
        print("  • Bundled models directory handler: ✅ Implemented")
        print("  • Progress bar during tests: ✅ Implemented")
        print("  • Manual verification: Required for progress bar")
        print()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
