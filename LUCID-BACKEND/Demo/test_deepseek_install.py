#!/usr/bin/env python3
"""
Test deepseek-coder installation commands and typo corrections
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from enhanced_agent import EnhancedLuciferAgent

print("\n" + "="*60)
print("🧪 Testing deepseek-coder Installation Commands")
print("="*60 + "\n")

agent = EnhancedLuciferAgent()

# Test commands
test_commands = [
    "install deepseek",           # Correct spelling
    "install deepseak",           # Common typo
    "install deep seek",          # Spaced version
    "install deep-seek",          # Hyphenated variant
]

for i, cmd in enumerate(test_commands, 1):
    print(f"\n{'─'*60}")
    print(f"Test {i}: {cmd}")
    print(f"{'─'*60}\n")
    
    # Simulate the command (without actually installing)
    response = agent._route_request(cmd)
    
    # Show what would happen
    if "deepseek" in response.lower() or "deepseak" in response.lower():
        print("✅ Command recognized and routed correctly")
        print(f"Response preview: {response[:200]}...")
    else:
        print("❌ Command not recognized properly")
        print(f"Response: {response[:200]}...")
    
    print()

print("\n" + "="*60)
print("✅ All deepseek installation tests complete!")
print("="*60 + "\n")
