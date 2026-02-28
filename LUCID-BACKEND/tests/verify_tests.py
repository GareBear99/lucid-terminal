#!/usr/bin/env python3
"""
Test Verification Script
Validates that test suite correctly evaluates model responses
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from tests.response_validator import ResponseValidator

def test_query_validation():
    """Test that query validation works correctly."""
    print("Testing Query Validation...")
    
    # Test 1: Good response should pass
    response = "Python is a high-level interpreted programming language known for its simplicity."
    result, status, details = ResponseValidator.validate_response(
        "What is python?", "Query: Programming language definition", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for good Python query, got {result}"
    print(f"  ✓ Python query: {result} - {status}")
    
    # Test 2: Greeting should pass
    response = "Hello! How can I help you today?"
    result, status, details = ResponseValidator.validate_response(
        "hello", "Query: Greeting", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for greeting, got {result}"
    print(f"  ✓ Greeting: {result} - {status}")
    
    # Test 3: Short relevant response should pass
    response = "Lists directory contents"
    result, status, details = ResponseValidator.validate_response(
        "What is ls?", "Query: Simple terminal command", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for ls query, got {result}"
    print(f"  ✓ ls command: {result} - {status}")
    
    print("  ✅ Query validation tests passed!\n")

def test_memory_validation():
    """Test that memory validation works correctly."""
    print("Testing Memory Validation...")
    
    # Test 1: Setting memory with acknowledgment
    response = "Got it, I'll remember that."
    result, status, details = ResponseValidator.validate_response(
        "My name is Alice", "Memory: Set simple fact (name)", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for memory set, got {result}"
    print(f"  ✓ Memory set: {result} - {status}")
    
    # Test 2: Recalling memory
    response = "Your name is Alice."
    result, status, details = ResponseValidator.validate_response(
        "What's my name?", "Memory: Recall simple fact", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for memory recall, got {result}"
    print(f"  ✓ Memory recall: {result} - {status}")
    
    print("  ✅ Memory validation tests passed!\n")

def test_file_validation():
    """Test that file operation validation works correctly."""
    print("Testing File Operation Validation...")
    
    # Test 1: List command with output
    response = "test.py\nREADME.md\nscript.py"
    result, status, details = ResponseValidator.validate_response(
        "list .", "File: List current directory", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for list, got {result}"
    print(f"  ✓ List files: {result} - {status}")
    
    # Test 2: Read file with content
    response = "# Project README\nThis is a test project."
    result, status, details = ResponseValidator.validate_response(
        "read README.md", "File: Read file contents", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for read, got {result}"
    print(f"  ✓ Read file: {result} - {status}")
    
    print("  ✅ File operation validation tests passed!\n")

def test_daemon_validation():
    """Test that daemon/fix validation works correctly."""
    print("Testing Daemon/Fix Validation...")
    
    # Test 1: Daemon watch response
    response = "Watching calculator.py for errors..."
    result, status, details = ResponseValidator.validate_response(
        "daemon watch calculator.py", "Daemon: Watch script for errors", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for daemon watch, got {result}"
    print(f"  ✓ Daemon watch: {result} - {status}")
    
    # Test 2: Fix script response
    response = "Found consensus fix for error. Applied successfully."
    result, status, details = ResponseValidator.validate_response(
        "fix broken_script.py", "Fix: Apply consensus fixes", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for fix, got {result}"
    print(f"  ✓ Fix script: {result} - {status}")
    
    print("  ✅ Daemon/Fix validation tests passed!\n")

def test_model_validation():
    """Test that model management validation works correctly."""
    print("Testing Model Management Validation...")
    
    # Test 1: List models
    response = "Installed models:\n- TinyLlama (Tier 0)\n- Mistral (Tier 2)"
    result, status, details = ResponseValidator.validate_response(
        "llm list", "Model: List installed models", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for llm list, got {result}"
    print(f"  ✓ List models: {result} - {status}")
    
    # Test 2: Enable model
    response = "TinyLlama enabled successfully"
    result, status, details = ResponseValidator.validate_response(
        "llm enable tinyllama", "Model: Enable specific model", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for enable, got {result}"
    print(f"  ✓ Enable model: {result} - {status}")
    
    print("  ✅ Model management validation tests passed!\n")

def test_tier_awareness():
    """Test that validation is tier-aware."""
    print("Testing Tier-Aware Validation...")
    
    # Test 1: Tier 0 should suggest upgrade for complex task
    response = "This task is complex. Consider upgrading to Mistral for better results."
    result, status, details = ResponseValidator.validate_response(
        "Analyze the economic impact...", "Limitation: Complex analysis (should suggest Mistral)", response, 0
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for Tier 0 upgrade suggestion, got {result}"
    print(f"  ✓ Tier 0 limitation: {result} - {status}")
    
    # Test 2: Tier 2 should handle complex task
    response = "The economic impact of cryptocurrency varies significantly across countries due to regulatory frameworks..."
    result, status, details = ResponseValidator.validate_response(
        "Analyze the economic impact...", "Limitation: Complex analysis (should suggest Mistral)", response, 2
    )
    assert result == "✅ SUCCESS", f"Expected SUCCESS for Tier 2 handling, got {result}"
    print(f"  ✓ Tier 2 capability: {result} - {status}")
    
    print("  ✅ Tier-aware validation tests passed!\n")

def main():
    """Run all validation tests."""
    print("="*60)
    print("🧪 Test Verification Suite")
    print("="*60)
    print()
    
    try:
        test_query_validation()
        test_memory_validation()
        test_file_validation()
        test_daemon_validation()
        test_model_validation()
        test_tier_awareness()
        
        print("="*60)
        print("✅ ALL VERIFICATION TESTS PASSED!")
        print("="*60)
        print("\nValidation system is working correctly for all model types.")
        print("Ready to test all 85+ supported models.\n")
        return 0
        
    except AssertionError as e:
        print("\n" + "="*60)
        print("❌ VERIFICATION FAILED")
        print("="*60)
        print(f"Error: {e}\n")
        return 1
    except Exception as e:
        print("\n" + "="*60)
        print("❌ UNEXPECTED ERROR")
        print("="*60)
        print(f"Error: {e}\n")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
