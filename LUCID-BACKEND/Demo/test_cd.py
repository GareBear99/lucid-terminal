#!/usr/bin/env python3
"""
Test cd command functionality
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "core"))

from enhanced_agent import EnhancedLuciferAgent

def test_cd():
    print("\n" + "="*60)
    print("Testing CD Command")
    print("="*60 + "\n")
    
    agent = EnhancedLuciferAgent()
    
    # Test 1: cd to home
    print("\n[Test 1] cd ~")
    print("-" * 60)
    response = agent.process_request("cd ~")
    print(response)
    
    # Test 2: cd to Desktop
    print("\n\n[Test 2] cd ~/Desktop")
    print("-" * 60)
    response = agent.process_request("cd ~/Desktop")
    print(response)
    
    # Test 3: cd to parent
    print("\n\n[Test 3] cd ..")
    print("-" * 60)
    response = agent.process_request("cd ..")
    print(response)
    
    # Test 4: pwd
    print("\n\n[Test 4] pwd")
    print("-" * 60)
    response = agent.process_request("pwd")
    print(response)
    
    # Test 5: cd back to project
    print("\n\n[Test 5] cd to project directory")
    print("-" * 60)
    response = agent.process_request("cd ~/Desktop/Projects/LuciferAI_Local")
    print(response)
    
    print("\n\n" + "="*60)
    print("All tests completed!")
    print("="*60)

if __name__ == "__main__":
    test_cd()
