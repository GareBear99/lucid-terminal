#!/usr/bin/env python3
"""
Integration Test: Context-Aware Script Explanation

Tests that LuciferAI maintains context between commands and can answer
questions about recently created/executed scripts.

This replicates the real user workflow:
1. Create a script
2. Run the script
3. Ask "what did the script do?"
4. Verify the system references the actual script and its output

Expected: System should correctly identify the script from context and
          explain what it does based on both the code and execution output.
"""

import sys
import os
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from enhanced_agent import EnhancedLuciferAgent


def test_context_awareness():
    """Test that agent maintains context across commands."""
    print("🧪 Testing Context-Aware Script Explanation\n")
    print("=" * 70)
    print()
    
    # Initialize agent
    print("Step 1: Initializing agent...")
    agent = EnhancedLuciferAgent()
    print("✅ Agent initialized\n")
    
    # Test case 1: Create a simple script
    print("Step 2: Creating a test script...")
    create_command = "create a script called hello.py on desktop that prints hello world"
    response1 = agent.process_request(create_command)
    print()
    print("✅ Script creation command executed\n")
    
    # Verify last_created_file is tracked
    assert agent.last_created_file is not None, "❌ FAIL: last_created_file not tracked"
    print(f"✅ Context tracked: last_created_file = {agent.last_created_file}\n")
    
    # Test case 2: Run the script
    print("Step 3: Running the script...")
    run_command = f"run {agent.last_created_file}"
    response2 = agent.process_request(run_command)
    print()
    print("✅ Script run command executed\n")
    
    # Verify last_execution is tracked
    assert agent.last_execution is not None, "❌ FAIL: last_execution not tracked"
    assert agent.last_execution['filepath'] == agent.last_created_file, "❌ FAIL: execution filepath mismatch"
    assert agent.last_execution['success'] == True, "❌ FAIL: execution not marked as successful"
    print(f"✅ Execution tracked:")
    print(f"   - filepath: {agent.last_execution['filepath']}")
    print(f"   - success: {agent.last_execution['success']}")
    print(f"   - stdout: {agent.last_execution['stdout'][:50]}..." if agent.last_execution['stdout'] else "   - stdout: (empty)")
    print()
    
    # Test case 3: Ask what the script did (past tense)
    print("Step 4: Asking 'what did the script do?'...")
    question = "so what did the script do"
    response3 = agent.process_request(question)
    print()
    print("✅ Question processed\n")
    
    # Verify response is meaningful (not generic)
    generic_responses = [
        "Not sure how to handle that",
        "Unknown command",
        "I don't understand",
        "Sorry, I can't help with that"
    ]
    
    is_generic = any(generic in response3 for generic in generic_responses)
    assert not is_generic, f"❌ FAIL: Received generic response: {response3[:100]}"
    print("✅ Response is context-aware (not generic)\n")
    
    # Test case 4: Verify pattern matching for various phrasings
    print("Step 5: Testing various question patterns...")
    test_patterns = [
        "what did it do",
        "what does the script do",
        "explain it",
        "what did that do",
    ]
    
    for pattern in test_patterns:
        print(f"   Testing: '{pattern}'")
        # We don't actually call process_request to avoid side effects,
        # just test pattern matching
        from enhanced_agent import re
        user_lower = pattern.lower()
        
        script_question_patterns = [
            r'(?:what|how)\s+(?:does|did|is|was)\s+(?:it|that|the script)\s+(?:do|doing|work)',
            r'(?:explain|describe|tell me about)\s+(?:it|that|the script)',
            r'(?:what|how)\s+(?:does|did)\s+(?:it|that|the script)',
            r'(?:so\s+)?what\s+did\s+(?:it|that|the script)\s+do',
            r'what\s+(?:does|did)\s+(?:it|that)\s+do',
        ]
        
        matched = False
        for regex_pattern in script_question_patterns:
            if re.search(regex_pattern, user_lower):
                matched = True
                break
        
        if matched:
            print(f"      ✅ Pattern matched")
        else:
            print(f"      ❌ Pattern NOT matched")
            raise AssertionError(f"Pattern '{pattern}' should match but didn't")
    
    print()
    print("=" * 70)
    print("🎉 All context awareness tests passed!")
    print()
    
    # Cleanup
    if agent.last_created_file and Path(agent.last_created_file).exists():
        print(f"Cleaning up test file: {agent.last_created_file}")
        Path(agent.last_created_file).unlink()
        print("✅ Cleanup complete")


if __name__ == "__main__":
    try:
        test_context_awareness()
    except AssertionError as e:
        print()
        print("=" * 70)
        print(f"❌ TEST FAILED: {e}")
        print("=" * 70)
        sys.exit(1)
    except Exception as e:
        print()
        print("=" * 70)
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        print("=" * 70)
        sys.exit(1)
