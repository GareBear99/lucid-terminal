#!/usr/bin/env python3
"""
🧪 Master Controller Validation Tests
Complete test suite for routing, tier enforcement, and fallbacks
"""
import sys
import os
from pathlib import Path

# Add project paths
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from master_controller import MasterController, RouteType
from lucifer_colors import c, Colors, Emojis


class MockEnhancedAgent:
    """Mock agent for testing."""
    def __init__(self):
        self.available_models = ['tinyllama', 'llama3.2', 'mistral', 'deepseek-coder']
        self.llm_state = {
            'tinyllama': {'enabled': True},
            'llama3.2': {'enabled': True},
            'mistral': {'enabled': True},
            'deepseek-coder': {'enabled': True}
        }


def test_route_detection():
    """Test that all route types are properly detected."""
    print(c("\n" + "═" * 70, "purple"))
    print(c("🧪 Test 1: Route Detection", "purple"))
    print(c("═" * 70 + "\n", "purple"))
    
    agent = MockEnhancedAgent()
    controller = MasterController(agent)
    
    test_cases = [
        # Direct system commands
        ("help", RouteType.DIRECT_SYSTEM, "System command"),
        ("exit", RouteType.DIRECT_SYSTEM, "System command"),
        ("memory", RouteType.DIRECT_SYSTEM, "System command"),
        ("clear", RouteType.DIRECT_SYSTEM, "System command"),
        
        # Direct file commands
        ("list", RouteType.DIRECT_FILE, "File operation"),
        ("create file test.py", RouteType.DIRECT_FILE, "File creation"),
        ("delete test.txt", RouteType.DIRECT_FILE, "File deletion"),
        ("read config.json", RouteType.DIRECT_FILE, "File reading"),
        
        # LLM management
        ("llm list", RouteType.DIRECT_LLM_MGMT, "LLM management"),
        ("llm enable mistral", RouteType.DIRECT_LLM_MGMT, "LLM management"),
        ("llm disable all", RouteType.DIRECT_LLM_MGMT, "LLM management"),
        
        # Installation
        ("install mistral", RouteType.DIRECT_INSTALL, "Model installation"),
        ("install core models", RouteType.DIRECT_INSTALL, "Model installation"),
        ("install tier 2", RouteType.DIRECT_INSTALL, "Tier installation"),
        
        # GitHub
        ("github link", RouteType.DIRECT_GITHUB, "GitHub integration"),
        ("github upload", RouteType.DIRECT_GITHUB, "GitHub integration"),
        ("github status", RouteType.DIRECT_GITHUB, "GitHub integration"),
        
        # Environment
        ("environments", RouteType.DIRECT_ENV, "Environment management"),
        ("activate myenv", RouteType.DIRECT_ENV, "Environment activation"),
        
        # Script creation (FIXED - should now detect properly)
        ("make me a script that tells me my gps point", RouteType.SCRIPT_CREATION, "Script with 'tells'"),
        ("create a script that gives me weather", RouteType.SCRIPT_CREATION, "Script with 'gives'"),
        ("write a script that finds files", RouteType.SCRIPT_CREATION, "Script with 'finds'"),
        ("build a program that checks system status", RouteType.SCRIPT_CREATION, "Script with 'checks'"),
        ("make a script that monitors cpu", RouteType.SCRIPT_CREATION, "Script with 'monitors'"),
        ("create a script that converts files", RouteType.SCRIPT_CREATION, "Script with 'converts'"),
        ("write a program that reads data", RouteType.SCRIPT_CREATION, "Script with 'reads'"),
        ("make a script that prints hello", RouteType.SCRIPT_CREATION, "Script with 'prints'"),
        
        # Script fix
        ("fix broken.py", RouteType.SCRIPT_FIX, "Script fixing"),
        ("fix error_script.py", RouteType.SCRIPT_FIX, "Script fixing"),
        
        # Simple questions
        ("what is python", RouteType.QUESTION_SIMPLE, "Simple question"),
        ("who is elon musk", RouteType.QUESTION_SIMPLE, "Simple question"),
        ("when was python created", RouteType.QUESTION_SIMPLE, "Simple question"),
        
        # Complex questions
        ("explain python architecture in detail", RouteType.QUESTION_COMPLEX, "Complex question"),
        ("analyze best practices for security", RouteType.QUESTION_COMPLEX, "Complex question"),
        ("compare react and vue performance", RouteType.QUESTION_COMPLEX, "Complex question"),
    ]
    
    passed = 0
    failed = 0
    
    for command, expected_route, description in test_cases:
        detected_route, metadata = controller.route_command(command)
        
        if detected_route == expected_route:
            print(c(f"✅ PASS", "green") + f" | {description:25s} | '{command}'")
            passed += 1
        else:
            print(c(f"❌ FAIL", "red") + f" | {description:25s} | '{command}'")
            print(c(f"         Expected: {expected_route.value}, Got: {detected_route.value}", "red"))
            failed += 1
    
    print(c(f"\n{'─' * 70}", "dim"))
    print(c(f"Results: {passed} passed, {failed} failed", "cyan"))
    success_rate = (passed / len(test_cases)) * 100
    print(c(f"Success Rate: {success_rate:.1f}%", "cyan"))
    
    return passed, failed


def test_tier_selection():
    """Test that correct models are selected based on tier requirements."""
    print(c("\n" + "═" * 70, "purple"))
    print(c("🧪 Test 2: Tier-Based Model Selection", "purple"))
    print(c("═" * 70 + "\n", "purple"))
    
    agent = MockEnhancedAgent()
    controller = MasterController(agent)
    
    test_cases = [
        (RouteType.DIRECT_SYSTEM, "simple", 0, "System commands don't need LLMs"),
        (RouteType.SCRIPT_CREATION, "simple", 1, "Simple scripts need Tier 1+"),
        (RouteType.SCRIPT_CREATION, "moderate", 2, "Moderate scripts need Tier 2+"),
        (RouteType.SCRIPT_CREATION, "complex", 3, "Complex scripts need Tier 3+"),
        (RouteType.SCRIPT_FIX, "simple", 2, "Script fixing needs Tier 2+"),
        (RouteType.QUESTION_SIMPLE, "simple", 0, "Simple questions work with Tier 0"),
        (RouteType.QUESTION_COMPLEX, "simple", 2, "Complex questions need Tier 2+"),
    ]
    
    passed = 0
    failed = 0
    
    for route_type, complexity, expected_tier, description in test_cases:
        model, tier = controller.select_model_for_task(route_type, complexity)
        
        if tier >= expected_tier:
            print(c(f"✅ PASS", "green") + f" | {description:40s} | Got Tier {tier}")
            passed += 1
        else:
            print(c(f"❌ FAIL", "red") + f" | {description:40s} | Expected Tier {expected_tier}+, Got Tier {tier}")
            failed += 1
    
    print(c(f"\n{'─' * 70}", "dim"))
    print(c(f"Results: {passed} passed, {failed} failed", "cyan"))
    
    return passed, failed


def test_action_verb_fix():
    """Test that the action verb fix works for previously failing commands."""
    print(c("\n" + "═" * 70, "purple"))
    print(c("🧪 Test 3: Action Verb Fix Validation", "purple"))
    print(c("═" * 70 + "\n", "purple"))
    
    agent = MockEnhancedAgent()
    controller = MasterController(agent)
    
    # These commands were failing before the fix (only 40-50% detection)
    # After fix, should be 95%+ detection
    previously_failing = [
        "make me a script that tells me my gps point",
        "create a program that gives weather info",
        "write a script that finds files",
        "build something that checks system status",
        "make a script that monitors cpu usage",
        "create a script that converts images",
        "write a program that reads config files",
        "make a script that saves data",
        "create something that loads user data",
        "write a script that retrieves api data",
        "make a program that downloads files",
        "create a script that uploads images",
        "write something that sends emails",
        "make a script that fetches data",
        "create a program that displays results",
        "write a script that outputs json",
        "make something that calculates totals",
        "create a script that computes averages",
        "write a program that counts lines",
        "make a script that sorts data",
        "create something that filters results",
        "write a script that merges files",
        "make a program that splits data",
        "create a script that navigates directories",
        "write something that analyzes logs",
    ]
    
    passed = 0
    failed = 0
    
    for command in previously_failing:
        detected_route, metadata = controller.route_command(command)
        
        if detected_route == RouteType.SCRIPT_CREATION:
            print(c(f"✅ PASS", "green") + f" | {command}")
            passed += 1
        else:
            print(c(f"❌ FAIL", "red") + f" | {command}")
            print(c(f"         Detected as: {detected_route.value}", "red"))
            failed += 1
    
    print(c(f"\n{'─' * 70}", "dim"))
    print(c(f"Results: {passed} passed, {failed} failed", "cyan"))
    detection_rate = (passed / len(previously_failing)) * 100
    print(c(f"Detection Rate: {detection_rate:.1f}%", "cyan"))
    
    if detection_rate >= 95:
        print(c(f"🎉 SUCCESS! Detection rate meets target (95%+)", "green"))
    else:
        print(c(f"⚠️  Detection rate below target (95%): {detection_rate:.1f}%", "yellow"))
    
    return passed, failed


def test_tier_enforcement():
    """Test that tier capabilities are properly enforced."""
    print(c("\n" + "═" * 70, "purple"))
    print(c("🧪 Test 4: Tier Capability Enforcement", "purple"))
    print(c("═" * 70 + "\n", "purple"))
    
    agent = MockEnhancedAgent()
    controller = MasterController(agent)
    
    test_cases = [
        (0, "generate_new_code", False, "Tier 0 cannot generate code"),
        (1, "generate_new_code", False, "Tier 1 cannot generate new code"),
        (2, "generate_new_code", True, "Tier 2 can generate code"),
        (2, "multi_step_workflow", True, "Tier 2 can do multi-step workflows"),
        (1, "multi_step_workflow", False, "Tier 1 cannot do multi-step workflows"),
        (3, "research_phase", True, "Tier 3 can do research"),
        (2, "research_phase", False, "Tier 2 cannot do research"),
        (4, "security_analysis", True, "Tier 4 can do security analysis"),
        (3, "security_analysis", False, "Tier 3 cannot do security analysis"),
    ]
    
    passed = 0
    failed = 0
    
    for tier, action, should_allow, description in test_cases:
        is_allowed, message = controller.enforce_tier_capabilities(tier, action)
        
        if is_allowed == should_allow:
            print(c(f"✅ PASS", "green") + f" | {description:45s}")
            passed += 1
        else:
            print(c(f"❌ FAIL", "red") + f" | {description:45s}")
            print(c(f"         {message}", "red"))
            failed += 1
    
    print(c(f"\n{'─' * 70}", "dim"))
    print(c(f"Results: {passed} passed, {failed} failed", "cyan"))
    
    return passed, failed


def run_all_tests():
    """Run all validation tests."""
    print(c("\n" + "=" * 70, "cyan"))
    print(c("🎯 MASTER CONTROLLER VALIDATION TEST SUITE", "cyan"))
    print(c("=" * 70 + "\n", "cyan"))
    
    total_passed = 0
    total_failed = 0
    
    # Run all tests
    p1, f1 = test_route_detection()
    total_passed += p1
    total_failed += f1
    
    p2, f2 = test_tier_selection()
    total_passed += p2
    total_failed += f2
    
    p3, f3 = test_action_verb_fix()
    total_passed += p3
    total_failed += f3
    
    p4, f4 = test_tier_enforcement()
    total_passed += p4
    total_failed += f4
    
    # Print final summary
    print(c("\n" + "=" * 70, "cyan"))
    print(c("📊 FINAL TEST RESULTS", "cyan"))
    print(c("=" * 70 + "\n", "cyan"))
    
    print(c(f"Total Tests Run: {total_passed + total_failed}", "white"))
    print(c(f"Tests Passed:    {total_passed}", "green"))
    print(c(f"Tests Failed:    {total_failed}", "red"))
    
    success_rate = (total_passed / (total_passed + total_failed)) * 100
    print(c(f"Success Rate:    {success_rate:.1f}%", "cyan"))
    
    if total_failed == 0:
        print(c(f"\n🎉 ALL TESTS PASSED! System is working perfectly!", "green"))
    elif success_rate >= 90:
        print(c(f"\n✅ Most tests passed. Minor issues need attention.", "yellow"))
    else:
        print(c(f"\n⚠️  Significant failures detected. Review needed.", "red"))
    
    print(c("\n" + "=" * 70 + "\n", "cyan"))
    
    return total_failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
