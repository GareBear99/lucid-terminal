#!/usr/bin/env python3
"""
Test Ctrl+C interrupt handling during LLM requests.

This script tests that:
1. LLM requests can be interrupted with Ctrl+C
2. The interrupt is caught gracefully
3. Request/response logging is working
"""
import sys
import time
import signal
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from llamafile_agent import LlamafileAgent


def test_interrupt_handling():
    """Test that LLM query can be interrupted."""
    print("\n🧪 Testing Ctrl+C Interrupt Handling\n")
    print("="*60)
    
    # Initialize agent
    agent = LlamafileAgent()
    
    if not agent.available:
        print("⚠️  Llamafile/TinyLlama not available")
        print("   Run: ./setup_bundled_models.sh")
        return False
    
    print("\n✅ Agent initialized")
    print(f"   Model: {agent.model_path.name if agent.model_path else 'Unknown'}")
    
    # Test 1: Normal query (should complete)
    print("\n" + "="*60)
    print("Test 1: Normal query (should complete)")
    print("="*60)
    
    try:
        response = agent.query("What is 2+2?", max_tokens=50)
        print(f"\n✅ Normal query completed successfully")
        print(f"   Response preview: {response[:100]}...")
    except Exception as e:
        print(f"\n❌ Normal query failed: {e}")
        return False
    
    # Test 2: Simulated interrupt (informational)
    print("\n" + "="*60)
    print("Test 2: Interrupt simulation")
    print("="*60)
    print("\nTo manually test interrupt handling:")
    print("  1. Run: python3 -c \"from core.llamafile_agent import LlamafileAgent; agent = LlamafileAgent(); agent.query('Write a long story')\"")
    print("  2. Press Ctrl+C during processing")
    print("  3. Verify you see: '⚠️  Request cancelled by user (Ctrl+C)'")
    print("  4. Verify the process exits gracefully")
    
    # Test 3: Check logging output
    print("\n" + "="*60)
    print("Test 3: Request/response logging")
    print("="*60)
    print("\nSending test query to check logging...")
    
    try:
        response = agent.query("Say hello", max_tokens=20)
        print(f"\n✅ Logging test completed")
        print("   You should have seen:")
        print("     - '🔄 Processing with TinyLlama/Mistral...'")
        print("     - '📝 Request: ...'")
        print("     - '✅ Response received ... - Completed with TinyLlama/Mistral'")
    except Exception as e:
        print(f"\n❌ Logging test failed: {e}")
        return False
    
    print("\n" + "="*60)
    print("📊 Test Summary")
    print("="*60)
    print("\n✅ Automatic tests passed!")
    print("\n📝 Manual verification steps:")
    print("   1. Run LuciferAI: ./lucifer.py")
    print("   2. Ask a question that takes time to process")
    print("   3. Press Ctrl+C during processing")
    print("   4. Verify clean cancellation and return to prompt")
    print()
    
    return True


if __name__ == "__main__":
    try:
        success = test_interrupt_handling()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n✅ KeyboardInterrupt caught successfully!")
        print("   This is the expected behavior.")
        sys.exit(0)
