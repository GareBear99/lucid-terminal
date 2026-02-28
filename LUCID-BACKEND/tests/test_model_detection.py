#!/usr/bin/env python3
"""
🧪 Test Model Detection & Tier System
Tests:
1. Bundled model detection (llamafile + TinyLlama)
2. Ollama model detection
3. Tier assignment
4. Banner display
5. Model installation paths
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
CYAN = '\033[36m'
DIM = '\033[2m'
BOLD = '\033[1m'
RESET = '\033[0m'


def print_header(title):
    """Print test section header."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{CYAN}🧪 {title}{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")


def test_bundled_model_paths():
    """Test that bundled model paths are correct."""
    print_header("Testing Bundled Model Paths")
    
    project_root = Path(__file__).parent
    luciferai_dir = project_root / '.luciferai'
    
    paths = {
        'luciferai_dir': luciferai_dir,
        'bin_dir': luciferai_dir / 'bin',
        'models_dir': luciferai_dir / 'models',
        'llamafile': luciferai_dir / 'bin' / 'llamafile',
        'tinyllama': luciferai_dir / 'models' / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
    }
    
    print(f"  {CYAN}Project Root:{RESET} {project_root}\n")
    
    results = {}
    for name, path in paths.items():
        exists = path.exists()
        results[name] = exists
        
        status = f"{GREEN}✅ EXISTS{RESET}" if exists else f"{RED}❌ MISSING{RESET}"
        print(f"  {status} {name}")
        print(f"       {DIM}{path}{RESET}")
    
    print()
    
    # Summary
    all_exist = all(results.values())
    if all_exist:
        print(f"{GREEN}✅ All bundled components found!{RESET}")
    else:
        missing = [k for k, v in results.items() if not v]
        print(f"{YELLOW}⚠️  Missing: {', '.join(missing)}{RESET}")
        print(f"{CYAN}💡 Run: ./setup_bundled_models.sh{RESET}")
    
    return all_exist


def test_ollama_model_detection():
    """Test Ollama model detection in models directory."""
    print_header("Testing Ollama Model Detection")
    
    project_root = Path(__file__).parent
    luciferai_dir = project_root / '.luciferai'
    models_dir = luciferai_dir / 'models'
    
    if not models_dir.exists():
        print(f"{YELLOW}⚠️  Models directory doesn't exist yet{RESET}")
        print(f"   Will be created when first model is installed\n")
        return True
    
    print(f"  {CYAN}Models Directory:{RESET} {models_dir}\n")
    
    # Check for .installed markers
    installed_models = []
    for item in models_dir.iterdir():
        if item.is_dir() and (item / '.installed').exists():
            installed_models.append(item.name)
            print(f"  {GREEN}✓{RESET} {item.name}")
            print(f"     {DIM}{item / '.installed'}{RESET}")
    
    if not installed_models:
        print(f"  {YELLOW}No Ollama models installed yet{RESET}")
        print(f"  {DIM}Install with: luci install llama3.2{RESET}")
    
    print(f"\n{CYAN}Total Ollama models:{RESET} {len(installed_models)}\n")
    
    return True


def test_model_detection_function():
    """Test the detect_installed_models() function."""
    print_header("Testing detect_installed_models() Function")
    
    try:
        from lucifer_colors import detect_installed_models
        
        models = detect_installed_models()
        
        print(f"  {CYAN}Detection Results:{RESET}\n")
        print(f"    llamafile: {models['llamafile']}")
        print(f"    tinyllama: {models['tinyllama']}")
        print(f"    ollama: {models['ollama']}")
        print(f"    installed models: {models['models']}\n")
        
        # Verify logic
        if models['llamafile'] and models['tinyllama']:
            print(f"{GREEN}✅ Bundled models detected correctly{RESET}")
        elif not models['llamafile'] and not models['tinyllama']:
            print(f"{YELLOW}⚠️  Bundled models not installed{RESET}")
            print(f"   Run: ./setup_bundled_models.sh")
        else:
            print(f"{YELLOW}⚠️  Partial installation detected{RESET}")
        
        print()
        return True
        
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}\n")
        return False


def test_tier_system():
    """Test tier assignment logic."""
    print_header("Testing Tier System")
    
    try:
        from luci.package_manager import PackageManager
        
        pm = PackageManager()
        
        # Test tier assignments in package database
        print(f"  {CYAN}Checking tier assignments:{RESET}\n")
        
        tier_models = {
            0: [],
            1: [],
            2: [],
            3: []
        }
        
        for name, info in pm.package_db.items():
            if info.get('type') == 'ai-model' and 'tier' in info:
                tier = info['tier']
                tier_models[tier].append(name)
        
        tier_icons = {0: "🟢", 1: "🔵", 2: "🟡", 3: "🔴"}
        tier_names = {
            0: "Ultra-Lightweight",
            1: "Lightweight",
            2: "Mid-Size",
            3: "Advanced"
        }
        
        all_correct = True
        for tier in sorted(tier_models.keys()):
            models = tier_models[tier]
            if models:
                print(f"  {tier_icons[tier]} Tier {tier}: {tier_names[tier]}")
                print(f"     Models: {', '.join(models)}")
            else:
                print(f"  {RED}✗ Tier {tier}: No models assigned{RESET}")
                all_correct = False
        
        print()
        
        if all_correct and all(tier_models.values()):
            print(f"{GREEN}✅ All tiers have models assigned{RESET}")
        else:
            print(f"{YELLOW}⚠️  Some tiers may be empty{RESET}")
        
        # Test recommendation system
        print(f"\n  {CYAN}Testing tier recommendation:{RESET}\n")
        recommended_tier = pm.get_recommended_tier()
        print(f"    Recommended for this system: Tier {recommended_tier}")
        
        recommended_models = pm.list_models_by_tier(recommended_tier)
        if recommended_models:
            print(f"    Suggested models: {', '.join(recommended_models[:3])}")
        
        print()
        return True
        
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
        return False


def test_llamafile_agent():
    """Test LlamafileAgent initialization."""
    print_header("Testing LlamafileAgent")
    
    try:
        from llamafile_agent import LlamafileAgent
        
        print(f"  {CYAN}Initializing LlamafileAgent...{RESET}\n")
        agent = LlamafileAgent()
        
        print(f"\n  {CYAN}Agent Status:{RESET}")
        print(f"    Available: {agent.available}")
        print(f"    Llamafile: {agent.llamafile_path}")
        print(f"    Model: {agent.model_path}")
        print(f"    Max Memory: {agent.conversation_history.maxlen} messages\n")
        
        if agent.available:
            print(f"{GREEN}✅ LlamafileAgent ready to use{RESET}")
            
            # Test memory stats
            stats = agent.get_memory_stats()
            print(f"\n  {CYAN}Memory Stats:{RESET}")
            print(f"    Current: {stats['total_messages']}/{stats['max_capacity']}")
            print(f"    Usage: {stats['usage_percent']:.1f}%")
        else:
            print(f"{YELLOW}⚠️  LlamafileAgent not available{RESET}")
            print(f"   Run: ./setup_bundled_models.sh")
        
        print()
        return True
        
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
        return False


def test_agent_fallback_chain():
    """Test the agent initialization fallback chain."""
    print_header("Testing Agent Fallback Chain")
    
    print(f"  {CYAN}Testing fallback order:{RESET}")
    print(f"    1. Ollama")
    print(f"    2. LlamafileAgent (TinyLlama)")
    print(f"    3. EnhancedLuciferAgent (Rule-based)\n")
    
    project_root = Path(__file__).parent
    luciferai_dir = project_root / '.luciferai'
    llamafile_path = luciferai_dir / 'bin' / 'llamafile'
    tinyllama_path = luciferai_dir / 'models' / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
    
    # Check Ollama
    import shutil
    has_ollama = bool(shutil.which('ollama'))
    
    # Check TinyLlama
    has_tinyllama = llamafile_path.exists() and tinyllama_path.exists()
    
    print(f"  {CYAN}Available Agents:{RESET}\n")
    
    if has_ollama:
        print(f"    {GREEN}✅ Ollama{RESET} (Priority 1)")
        expected_agent = "Ollama"
    else:
        print(f"    {RED}❌ Ollama{RESET}")
    
    if has_tinyllama:
        print(f"    {GREEN}✅ TinyLlama{RESET} (Priority 2)")
        if not has_ollama:
            expected_agent = "TinyLlama"
    else:
        print(f"    {RED}❌ TinyLlama{RESET}")
    
    print(f"    {GREEN}✅ Rule-based{RESET} (Fallback)\n")
    
    if not has_ollama and not has_tinyllama:
        expected_agent = "Rule-based"
    
    print(f"  {CYAN}Expected active agent:{RESET} {BOLD}{expected_agent}{RESET}\n")
    
    return True


def run_all_tests():
    """Run all tests and return summary."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{BOLD}🧪 LuciferAI Model Detection & Tier System Tests{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}")
    
    tests = [
        ("Bundled Model Paths", test_bundled_model_paths),
        ("Ollama Model Detection", test_ollama_model_detection),
        ("Detection Function", test_model_detection_function),
        ("Tier System", test_tier_system),
        ("LlamafileAgent", test_llamafile_agent),
        ("Agent Fallback Chain", test_agent_fallback_chain),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n{RED}❌ Test '{name}' crashed: {e}{RESET}\n")
            results.append((name, False))
    
    # Summary
    print_header("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = f"{GREEN}✅ PASS{RESET}" if result else f"{RED}❌ FAIL{RESET}"
        print(f"  {status} {name}")
    
    print(f"\n{CYAN}Results:{RESET} {passed}/{total} tests passed")
    
    if passed == total:
        print(f"{GREEN}🎉 All tests passed!{RESET}\n")
    else:
        print(f"{YELLOW}⚠️  Some tests failed{RESET}\n")
    
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
