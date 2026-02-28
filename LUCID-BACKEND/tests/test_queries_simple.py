#!/usr/bin/env python3
"""
Simple test for AI queries using LLMBackend directly
Tests only the first 5 queries to verify everything works
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from llm_backend import LLMBackend
from response_validator import ResponseValidator

# Test queries (just first batch)
test_queries = [
    ("What is ls?", "Query: Simple terminal command"),
    ("Define the word 'algorithm'", "Query: Common technical word"),
    ("hello", "Query: Simple greeting"),
    ("What is python?", "Query: Programming language"),
    ("What is git?", "Query: Version control"),
]

print("\n🧪 LuciferAI Simple Query Test")
print("Testing first 5 queries with active model")
print("="*60)

# Initialize backend
print("\n📡 Initializing LLM backend...")
llm = LLMBackend(verbose=True)

if not llm.is_available():
    print("❌ No LLM backend available!")
    sys.exit(1)

backend_type = llm.get_backend_type()
print(f"✅ Backend: {backend_type}")
print("="*60)

# Run tests
passed = 0
failed = 0

for i, (query, description) in enumerate(test_queries, 1):
    print(f"\n\n{'='*60}")
    print(f"🧪 TEST {i}/{len(test_queries)}: {description}")
    print(f"📝 Input: {query}")
    print("="*60)
    
    try:
        # Get response
        response = llm.chat([{"role": "user", "content": query}])
        
        # Validate response (Tier 0 for TinyLlama)
        result, status, details = ResponseValidator.validate_response(
            query, description, response, tier=0
        )
        
        score = ResponseValidator.get_score(result)
        
        # Show result
        if response:
            preview = response[:150]
            if len(response) > 150:
                preview += "..."
            print(f"\n💬 Response ({len(response)} chars):")
            print(f"   {preview}")
        else:
            print("\n❌ Empty response!")
        
        print(f"\n{result} [{score}%] - {status}")
        
        if details.get('keywords_found'):
            print(f"   Keywords: {', '.join(details['keywords_found'][:5])}")
        
        if details.get('issues'):
            print(f"   Issues: {', '.join(details['issues'])}")
        
        if result == "✅ SUCCESS":
            passed += 1
        else:
            failed += 1
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        failed += 1

# Summary
print(f"\n\n{'='*60}")
print(f"📊 TEST SUMMARY")
print("="*60)
print(f"Total: {len(test_queries)}")
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print(f"Success Rate: {(passed/len(test_queries)*100):.1f}%")
print("="*60)
