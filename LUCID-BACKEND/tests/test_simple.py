#!/usr/bin/env python3
"""Simple direct test of LLM backend"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from llm_backend import LLMBackend

# Test queries
test_queries = [
    "What is ls?",
    "Define the word 'algorithm'",
    "hello",
    "What is python?",
    "What is git?"
]

print("\n🧪 Simple LLM Backend Test")
print("="*60)

# Create backend
print("\n📡 Initializing LLM backend...")
llm = LLMBackend(verbose=True)

if not llm.is_available():
    print("❌ No LLM backend available!")
    sys.exit(1)

print(f"✅ Backend type: {llm.get_backend_type()}")
print("="*60)

# Test each query
for i, query in enumerate(test_queries, 1):
    print(f"\n\n{'='*60}")
    print(f"Test {i}/{len(test_queries)}: {query}")
    print("="*60)
    
    try:
        response = llm.chat([{"role": "user", "content": query}])
        
        # Show first 200 chars of response
        if response:
            preview = response[:200]
            if len(response) > 200:
                preview += "..."
            print(f"\n✅ Response ({len(response)} chars):")
            print(f"{preview}")
        else:
            print("\n❌ Empty response!")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")

print("\n\n" + "="*60)
print("Test complete!")
print("="*60)
