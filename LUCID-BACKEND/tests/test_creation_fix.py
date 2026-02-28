#!/usr/bin/env python3
"""
Test that creation intents don't trigger file search
"""
import sys
from pathlib import Path

# Add project to path
sys.path.insert(0, str(Path(__file__).parent))

from core.nlp_parser import NaturalLanguageParser

def test_creation_intent():
    """Test that 'create' intent doesn't search for files"""
    parser = NaturalLanguageParser(ollama_available=False)
    
    test_cases = [
        "create a file called test.py",
        "make a new script named hello.py",
        "build a folder with a file server.py",
        "put a file in the folder"
    ]
    
    print("🧪 Testing creation intent fix...\n")
    
    for cmd in test_cases:
        print(f"Testing: {cmd}")
        result = parser.parse_command(cmd)
        
        if result['intent'] == 'create':
            if len(result['file_candidates']) == 0:
                print(f"  ✅ PASS: No file search triggered")
            else:
                print(f"  ❌ FAIL: Found {len(result['file_candidates'])} candidates (should be 0)")
                print(f"     Candidates: {result['file_candidates']}")
        else:
            print(f"  ⚠️  Intent detected as: {result['intent']}")
        print()
    
    print("✅ Test complete!")

if __name__ == "__main__":
    test_creation_intent()
