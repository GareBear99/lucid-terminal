#!/usr/bin/env python3
"""
Manual Test: Context-Aware Conversation Flow

This simulates the exact user workflow from your example:
1. User: "create a script called test.py on my desktop that prints hello world"
2. Agent: [creates script]
3. User: "run test.py"
4. Agent: [runs script, outputs "Hello world"]
5. User: "so what did the script do"
6. Agent: [should explain that it prints "Hello world"]

Run this to verify the context awareness fix works correctly.
"""

import sys
import os
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))


def simulate_conversation():
    """Simulate the exact user conversation flow."""
    print("\n" + "=" * 70)
    print("🧪 Manual Context Awareness Test")
    print("=" * 70 + "\n")
    
    print("Initializing LuciferAI Enhanced Agent...")
    from enhanced_agent import EnhancedLuciferAgent
    agent = EnhancedLuciferAgent()
    print()
    
    # Conversation flow
    commands = [
        "create a script called test.py on my desktop that prints hello world",
        "run ~/Desktop/test.py",
        "so what did the script do"
    ]
    
    for i, command in enumerate(commands, 1):
        print("\n" + "-" * 70)
        print(f"USER (Step {i}): {command}")
        print("-" * 70 + "\n")
        
        try:
            response = agent.process_request(command)
            
            # Show response if not empty
            if response and response.strip():
                print("\nAGENT RESPONSE:")
                print(response)
            
            # Debug info after each step
            if i == 1:
                print("\n[DEBUG] Context after creation:")
                print(f"  last_created_file: {agent.last_created_file}")
                print(f"  last_execution: {agent.last_execution}")
            elif i == 2:
                print("\n[DEBUG] Context after execution:")
                print(f"  last_created_file: {agent.last_created_file}")
                print(f"  last_execution: {agent.last_execution}")
                if agent.last_execution:
                    print(f"  execution stdout: {agent.last_execution.get('stdout', 'None')}")
            elif i == 3:
                print("\n[DEBUG] Context when answering question:")
                print(f"  last_created_file: {agent.last_created_file}")
                print(f"  last_execution: {agent.last_execution}")
        
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            break
    
    print("\n" + "=" * 70)
    print("Test Complete")
    print("=" * 70 + "\n")
    
    # Cleanup
    test_file = Path.home() / "Desktop" / "test.py"
    if test_file.exists():
        print(f"Cleaning up: {test_file}")
        test_file.unlink()
        print("✅ Cleanup complete\n")


if __name__ == "__main__":
    simulate_conversation()
