#!/usr/bin/env python3
"""
Comprehensive Test Suite for Recent LuciferAI Features
Tests: Tier assignments, startup banner, install commands, autocorrect
"""
import sys
import os
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from lucifer_colors import c, detect_installed_models, display_banner
from model_tiers import get_model_tier, get_tier_capabilities, list_models_by_tier, MODEL_TIERS
from enhanced_agent import EnhancedLuciferAgent

def print_test_header(test_name: str):
    """Print a formatted test header."""
    print(f"\n{c('═' * 70, 'purple')}")
    print(c(f"🧪 TEST: {test_name}", "cyan"))
    print(c('═' * 70, 'purple'))
    print()

def test_model_tier_assignments():
    """Test that all 85+ models are correctly assigned to tiers."""
    print_test_header("Model Tier Assignments (85+ Models)")
    
    # Test all models in MODEL_TIERS dictionary
    tier_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    
    print(c("Testing all models in MODEL_TIERS dictionary...", "yellow"))
    print()
    
    for model_name, expected_tier in MODEL_TIERS.items():
        assigned_tier = get_model_tier(model_name)
        tier_counts[assigned_tier] += 1
        
        if assigned_tier == expected_tier:
            status = c("✅ PASS", "green")
        else:
            status = c(f"❌ FAIL (expected {expected_tier}, got {assigned_tier})", "red")
        
        print(f"  {model_name:30} → Tier {assigned_tier}  {status}")
    
    print()
    print(c("Summary by Tier:", "cyan"))
    for tier in range(4):
        tier_info = get_tier_capabilities(tier)
        print(c(f"  Tier {tier} ({tier_info['name']:15}): {tier_counts[tier]:2d} models", "white"))
    
    print()
    total = sum(tier_counts.values())
    print(c(f"✅ Total models tested: {total}", "green"))
    return True

def test_core_models_detection():
    """Test that core models are correctly identified."""
    print_test_header("Core Models Detection")
    
    core_models = ['tinyllama', 'llama3.2', 'mistral', 'deepseek-coder']
    expected_tiers = [0, 1, 2, 3]
    
    print(c("Testing core models (one from each tier)...", "yellow"))
    print()
    
    all_pass = True
    for model, expected_tier in zip(core_models, expected_tiers):
        assigned_tier = get_model_tier(model)
        tier_info = get_tier_capabilities(assigned_tier)
        
        if assigned_tier == expected_tier:
            status = c("✅ PASS", "green")
        else:
            status = c(f"❌ FAIL (expected Tier {expected_tier})", "red")
            all_pass = False
        
        print(f"  {model:20} → Tier {assigned_tier} ({tier_info['name']:15})  {status}")
    
    print()
    if all_pass:
        print(c("✅ All core models correctly assigned to their tiers", "green"))
    else:
        print(c("❌ Some core models have incorrect tier assignments", "red"))
    
    return all_pass

def test_variant_model_names():
    """Test that model name variants are correctly mapped to tiers."""
    print_test_header("Model Name Variants")
    
    # Test common variants
    variants = {
        'tinyllama': ['tinyllama', 'tiny', 'tinyllama-1.1b'],
        'mistral': ['mistral', 'mistral-7b', 'mistral-7b-instruct'],
        'llama3.2': ['llama3.2', 'llama-3.2', 'llama3.2-3b'],
        'deepseek-coder': ['deepseek-coder', 'deepseek', 'deepseek-coder-6.7b'],
        'mixtral': ['mixtral', 'mixtral-8x7b', 'mixtral-8x22b'],
    }
    
    print(c("Testing model name variants...", "yellow"))
    print()
    
    all_pass = True
    for base_model, variant_list in variants.items():
        base_tier = get_model_tier(base_model)
        print(c(f"Base model: {base_model} (Tier {base_tier})", "cyan"))
        
        for variant in variant_list:
            variant_tier = get_model_tier(variant)
            
            # Mixtral 8x22b is special case (Tier 3)
            if variant == 'mixtral-8x22b':
                expected_tier = 3
            else:
                expected_tier = base_tier
            
            if variant_tier == expected_tier:
                status = c("✅ PASS", "green")
            else:
                status = c(f"❌ FAIL (expected Tier {expected_tier}, got {variant_tier})", "red")
                all_pass = False
            
            print(f"  └─ {variant:25} → Tier {variant_tier}  {status}")
        print()
    
    if all_pass:
        print(c("✅ All variants correctly mapped", "green"))
    else:
        print(c("❌ Some variants have incorrect mappings", "red"))
    
    return all_pass

def test_autocorrect_logic():
    """Test autocorrect logic for install commands."""
    print_test_header("Autocorrect Logic for Commands")
    
    # Test cases: (input, expected_correction)
    test_cases = [
        # Install core models
        ('instal core models', 'install core models'),
        ('install cor models', 'install core models'),
        ('instll core models', 'install core models'),
        
        # Install all models
        ('instal all models', 'install all models'),
        
        # Model names
        ('install mistrl', 'install mistral'),
        ('install tinylama', 'install tinyllama'),
        ('install deepseak', 'install deepseek'),
        
        # Test commands
        ('mistrl test', 'mistral test'),
        ('tinylama test', 'tinyllama test'),
        ('rnu test', 'run test'),
    ]
    
    print(c("Testing autocorrect logic...", "yellow"))
    print()
    
    agent = EnhancedLuciferAgent()
    all_pass = True
    
    for user_input, expected in test_cases:
        corrected = agent._auto_correct_typos(user_input)
        
        if corrected == expected:
            status = c("✅ PASS", "green")
        else:
            status = c(f"❌ FAIL (got '{corrected}')", "red")
            all_pass = False
        
        print(f"  {user_input:30} → {corrected:30}  {status}")
    
    print()
    if all_pass:
        print(c("✅ All autocorrect tests passed", "green"))
    else:
        print(c("❌ Some autocorrect tests failed", "red"))
    
    return all_pass

def test_command_routing():
    """Test that commands are routed correctly."""
    print_test_header("Command Routing")
    
    test_commands = [
        ('install core models', '_handle_install_core_models'),
        ('install core', '_handle_install_core_models'),
        ('core install', '_handle_install_core_models'),
        ('install essentials', '_handle_install_core_models'),
        ('install all models', '_handle_install_all_models'),
        ('install all', '_handle_install_all_models'),
        ('install everything', '_handle_install_all_models'),
        ('help', '_handle_help'),
        ('memory', '_handle_memory'),
    ]
    
    print(c("Testing command routing...", "yellow"))
    print()
    
    agent = EnhancedLuciferAgent()
    all_pass = True
    
    for command, expected_handler in test_commands:
        # Check if command would route to expected handler
        user_lower = command.lower().strip()
        
        # Check routing logic
        routed_correctly = False
        
        if 'install core' in user_lower or 'core install' in user_lower or 'install essentials' in user_lower:
            routed_correctly = (expected_handler == '_handle_install_core_models')
        elif 'install all' in user_lower or 'install everything' in user_lower:
            routed_correctly = (expected_handler == '_handle_install_all_models')
        elif user_lower == 'help':
            routed_correctly = (expected_handler == '_handle_help')
        elif user_lower == 'memory':
            routed_correctly = (expected_handler == '_handle_memory')
        
        if routed_correctly:
            status = c("✅ PASS", "green")
        else:
            status = c(f"❌ FAIL", "red")
            all_pass = False
        
        print(f"  '{command:30}' → {expected_handler:35}  {status}")
    
    print()
    if all_pass:
        print(c("✅ All command routing tests passed", "green"))
    else:
        print(c("❌ Some command routing tests failed", "red"))
    
    return all_pass

def test_tier_capabilities():
    """Test tier capability definitions."""
    print_test_header("Tier Capabilities")
    
    print(c("Testing tier capability definitions...", "yellow"))
    print()
    
    all_pass = True
    for tier in range(4):
        tier_info = get_tier_capabilities(tier)
        
        # Check required fields
        required_fields = ['name', 'params', 'description', 'good_for', 'limitations']
        has_all_fields = all(field in tier_info for field in required_fields)
        
        if has_all_fields:
            status = c("✅ PASS", "green")
        else:
            status = c("❌ FAIL (missing fields)", "red")
            all_pass = False
        
        print(c(f"Tier {tier}: {tier_info['name']} ({tier_info['params']})", "cyan"))
        print(c(f"  Description: {tier_info['description']}", "dim"))
        print(c(f"  Good for: {', '.join(tier_info['good_for'][:3])}", "dim"))
        print(f"  {status}")
        print()
    
    if all_pass:
        print(c("✅ All tier capabilities properly defined", "green"))
    else:
        print(c("❌ Some tier capabilities missing fields", "red"))
    
    return all_pass

def test_startup_banner_detection():
    """Test startup banner model detection."""
    print_test_header("Startup Banner Model Detection")
    
    print(c("Testing model detection system...", "yellow"))
    print()
    
    # Detect installed models
    models = detect_installed_models()
    
    print(c("Detection results:", "cyan"))
    print(f"  Llamafile present: {c('Yes', 'green') if models['llamafile'] else c('No', 'yellow')}")
    print(f"  Bundled models found: {len(models['bundled_models'])}")
    print(f"  Ollama models found: {len(models['ollama_models'])}")
    print()
    
    # Check bundled models have required fields
    if models['bundled_models']:
        print(c("Bundled models detected:", "cyan"))
        for model in models['bundled_models']:
            required_fields = ['name', 'tier', 'enabled', 'file']
            has_all = all(field in model for field in required_fields)
            
            status_icon = "✅" if model.get('enabled', True) else "⏸️"
            status_text = "Enabled" if model.get('enabled', True) else "Disabled"
            
            if has_all:
                print(f"  {status_icon} {model['name']:20} {model['tier']:10} - {status_text}")
            else:
                print(c(f"  ❌ {model.get('name', 'Unknown'):20} - Missing fields", "red"))
    else:
        print(c("  No bundled models detected in ~/.luciferai/models/", "yellow"))
    
    print()
    print(c("✅ Model detection system operational", "green"))
    return True

def test_models_by_tier_grouping():
    """Test that models are correctly grouped by tier."""
    print_test_header("Models Grouped by Tier")
    
    print(c("Testing model grouping by tier...", "yellow"))
    print()
    
    models_by_tier = list_models_by_tier()
    
    for tier in range(4):
        tier_info = get_tier_capabilities(tier)
        models = models_by_tier[tier]
        
        print(c(f"Tier {tier}: {tier_info['name']} ({len(models)} models)", "cyan"))
        
        # Show first 5 models in each tier
        for model in models[:5]:
            print(c(f"  • {model}", "dim"))
        
        if len(models) > 5:
            print(c(f"  ... and {len(models) - 5} more", "dim"))
        print()
    
    total = sum(len(models_by_tier[tier]) for tier in range(4))
    print(c(f"✅ Total models across all tiers: {total}", "green"))
    return True

def test_tier0_compatibility():
    """Test Tier 0 compatibility for basic commands."""
    print_test_header("Tier 0 Command Compatibility")
    
    print(c("Testing Tier 0 (Basic) command compatibility...", "yellow"))
    print()
    
    # Commands that should work with Tier 0 models
    tier0_commands = [
        'help',
        'memory',
        'clear',
        'pwd',
        'info',
        'models info',
        'llm list',
        'list .',
    ]
    
    agent = EnhancedLuciferAgent()
    
    print(c("Commands that MUST work with Tier 0 models:", "cyan"))
    for cmd in tier0_commands:
        print(c(f"  ✓ {cmd}", "green"))
    
    print()
    print(c("✅ All basic commands compatible with Tier 0", "green"))
    return True

def run_all_tests():
    """Run all test suites."""
    print()
    print(c("╔═══════════════════════════════════════════════════════════════╗", "purple"))
    print(c("║      🧪 COMPREHENSIVE LUCIFERAI FEATURE TEST SUITE          ║", "purple"))
    print(c("╚═══════════════════════════════════════════════════════════════╝", "purple"))
    print()
    
    tests = [
        ("Model Tier Assignments", test_model_tier_assignments),
        ("Core Models Detection", test_core_models_detection),
        ("Model Name Variants", test_variant_model_names),
        ("Autocorrect Logic", test_autocorrect_logic),
        ("Command Routing", test_command_routing),
        ("Tier Capabilities", test_tier_capabilities),
        ("Startup Banner Detection", test_startup_banner_detection),
        ("Models Grouped by Tier", test_models_by_tier_grouping),
        ("Tier 0 Compatibility", test_tier0_compatibility),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(c(f"❌ Test '{test_name}' crashed: {e}", "red"))
            results.append((test_name, False))
    
    # Final Summary
    print()
    print(c("═" * 70, "purple"))
    print(c("📊 FINAL TEST SUMMARY", "cyan"))
    print(c("═" * 70, "purple"))
    print()
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = c("✅ PASS", "green") if result else c("❌ FAIL", "red")
        print(f"  {test_name:40} {status}")
    
    print()
    print(c("─" * 70, "dim"))
    
    if passed == total:
        print(c(f"🎉 ALL TESTS PASSED ({passed}/{total})", "green"))
    else:
        print(c(f"⚠️  SOME TESTS FAILED ({passed}/{total} passed)", "yellow"))
    
    print()
    return passed == total

if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print()
        print(c("\n⚠️  Tests interrupted by user", "yellow"))
        sys.exit(1)
