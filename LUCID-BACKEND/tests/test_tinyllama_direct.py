#!/usr/bin/env python3
"""
Direct test of TinyLlama agent without full LuciferAI stack
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.llamafile_agent import LlamafileAgent

def test_query(query: str, description: str):
    """Test a single query directly."""
    print(f"\n{'='*60}")
    print(f"🧪 TEST: {description}")
    print(f"📝 User Input: {query}")
    print(f"{'='*60}\n")
    
    agent = LlamafileAgent()
    
    if not agent.available:
        print("❌ TinyLlama not available")
        return False
    
    response = agent.query(query)
    
    print(f"\n💬 RESPONSE:\n{response}\n")
    print(f"{'='*60}\n")
    
    # Check if response is valid (not error or refusal)
    is_success = (
        response and 
        not response.startswith("❌") and 
        not "cannot fulfill" in response.lower() and
        len(response.strip()) > 20
    )
    
    if is_success:
        print("✅ SUCCESS - Got valid response")
    else:
        print("⚠️  FAILED - Invalid or no response")
    
    return is_success

def main():
    """Run direct tests on failed queries."""
    
    print("\n🧪 TinyLlama Direct Testing Suite")
    print("Testing queries that failed in full suite\n")
    
    tests = [
        # Zodiac tests
        ("What is a Virgo?", "Zodiac: Define sign"),
        ("When is Aries season?", "Zodiac: Date range"),
        ("What zodiac sign is someone born in August?", "Zodiac: Birth month"),
        ("If I was born on March 25th what am I?", "Zodiac: Specific date"),
        ("What are the traits of a Leo?", "Zodiac: Characteristics"),
        ("What element is associated with Scorpio?", "Zodiac: Element"),
        
        # Memory tests
        ("My name is Alice", "Memory: Set fact"),
        ("What's my name?", "Memory: Recall fact"),
        
        # Simple queries
        ("What is ls?", "Query: Terminal command"),
        ("Define the word 'algorithm'", "Query: Definition"),
    ]
    
    results = []
    for query, description in tests:
        success = test_query(query, description)
        results.append((description, success))
        
        if not success:
            print("❌ Test failed - stopping here to fix")
            break
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}\n")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    print(f"Passed: {passed}/{total}")
    print()
    
    for desc, success in results:
        status = "✅" if success else "❌"
        print(f"{status} {desc}")

if __name__ == "__main__":
    main()
