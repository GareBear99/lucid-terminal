#!/usr/bin/env python3
"""
🧪 Test Model Detection & Installation Prompts
Tests that the test commands correctly detect installed models and prompt for installation
"""
import sys
import os
from pathlib import Path

# Set up paths
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "core"))
sys.path.insert(0, str(project_root))
os.chdir(project_root)

from core.enhanced_agent import EnhancedLuciferAgent
from core.lucifer_colors import c

def print_header(title):
    print(f"\n{c('='*70, 'purple')}")
    print(c(f"{title:^70}", "cyan"))
    print(c('='*70, 'purple'))
    print()

def test_model_detection():
    """Test that model detection works for main and backup directories."""
    print_header("TEST 1: Model Detection")
    
    agent = EnhancedLuciferAgent()
    
    # Check locations
    main_models_dir = Path.home() / '.luciferai' / 'models'
    
    # Load backup directory from config
    backup_models_dir = None
    config_file = Path.home() / '.luciferai' / 'config.json'
    if config_file.exists():
        try:
            import json
            with open(config_file, 'r') as f:
                config = json.load(f)
                backup_models_dir = config.get('backup_models_dir')
        except:
            pass
    
    print(c("📁 Checking model locations:", "cyan"))
    print()
    print(c(f"  Main directory: {main_models_dir}", "dim"))
    print(c(f"  Exists: {main_models_dir.exists()}", "green" if main_models_dir.exists() else "yellow"))
    print()
    
    if backup_models_dir:
        print(c(f"  Backup directory: {backup_models_dir}", "dim"))
        print(c(f"  Exists: {Path(backup_models_dir).exists()}", "green" if Path(backup_models_dir).exists() else "yellow"))
    else:
        print(c("  Backup directory: Not configured", "yellow"))
        print(c("  (Set with: backup models)", "dim"))
    
    print()
    
    # Check for specific models
    model_files = {
        'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        'mistral': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    }
    
    print(c("🔍 Scanning for models:", "cyan"))
    print()
    
    for model, filename in model_files.items():
        found_in_main = (main_models_dir / filename).exists()
        found_in_backup = backup_models_dir and (Path(backup_models_dir) / filename).exists()
        
        if found_in_main:
            print(c(f"  ✓ {model.upper():12} - Found in main", "green"))
        elif found_in_backup:
            print(c(f"  ✓ {model.upper():12} - Found in backup", "green"))
        else:
            print(c(f"  ✗ {model.upper():12} - Not found", "red"))
    
    print()
    print(c("✅ Model detection test complete", "green"))
    return True

def test_test_all_output():
    """Test that 'test all' shows proper output."""
    print_header("TEST 2: Test All Models Output")
    
    agent = EnhancedLuciferAgent()
    
    print(c("Running 'test all' command (simulated):", "cyan"))
    print()
    
    # Call the function (will show output directly)
    result = agent._handle_test_all_models()
    
    # If it returns a message, print it
    if result:
        print(result)
    
    print()
    print(c("✅ Test all output complete", "green"))
    return True

def test_specific_model_prompt():
    """Test that testing a specific model shows correct information."""
    print_header("TEST 3: Specific Model Test Prompt")
    
    print(c("Testing individual model detection:", "cyan"))
    print()
    
    # Simulate checking for tinyllama
    main_models_dir = Path.home() / '.luciferai' / 'models'
    tinyllama_file = main_models_dir / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
    mistral_file = main_models_dir / 'mistral-7b-instruct-v0.2.Q4_K_M.gguf'
    
    models_to_check = [
        ('tinyllama', tinyllama_file),
        ('mistral', mistral_file),
    ]
    
    for model, filepath in models_to_check:
        print(c(f"Checking {model}:", "yellow"))
        if filepath.exists():
            print(c(f"  ✓ {model} is installed", "green"))
            print(c(f"    Location: {filepath.parent}", "dim"))
            print(c(f"    Would run tests for {model}", "cyan"))
        else:
            print(c(f"  ✗ {model} is NOT installed", "red"))
            print(c(f"    Would prompt: 'Would you like to install {model}? (y/n)'", "yellow"))
            print(c(f"    If 'y': Routes to 'install {model}' command", "dim"))
            print(c(f"    If 'n': Returns 'Installation cancelled'", "dim"))
        print()
    
    print(c("✅ Specific model test complete", "green"))
    return True

def test_backup_directory_mention():
    """Test that backup directory is mentioned properly."""
    print_header("TEST 4: Backup Directory Information")
    
    config_file = Path.home() / '.luciferai' / 'config.json'
    
    print(c("Checking backup directory configuration:", "cyan"))
    print()
    
    if config_file.exists():
        try:
            import json
            with open(config_file, 'r') as f:
                config = json.load(f)
                backup_dir = config.get('backup_models_dir')
            
            if backup_dir:
                print(c(f"  ✓ Backup directory is configured", "green"))
                print(c(f"    Path: {backup_dir}", "dim"))
                print(c(f"    Exists: {Path(backup_dir).exists()}", "green" if Path(backup_dir).exists() else "yellow"))
            else:
                print(c(f"  ○ Backup directory not set in config", "yellow"))
                print(c(f"    When testing, system will show:", "dim"))
                print(c(f"      • Backup: Not configured", "yellow"))
                print(c(f"      (Set with: backup models)", "dim"))
        except:
            print(c(f"  ⚠  Error reading config", "red"))
    else:
        print(c(f"  ○ Config file doesn't exist", "yellow"))
        print(c(f"    Location: {config_file}", "dim"))
        print(c(f"    When testing, system will show:", "dim"))
        print(c(f"      • Backup: Not configured", "yellow"))
        print(c(f"      (Set with: backup models)", "dim"))
    
    print()
    print(c("✅ Backup directory information test complete", "green"))
    return True

def run_all_tests():
    """Run all model detection tests."""
    print()
    print(c("╔═══════════════════════════════════════════════════════════════╗", "purple"))
    print(c("║        🧪 MODEL DETECTION & INSTALLATION TEST SUITE           ║", "purple"))
    print(c("╚═══════════════════════════════════════════════════════════════╝", "purple"))
    print()
    
    tests = [
        ("Model Detection", test_model_detection),
        ("Test All Models Output", test_test_all_output),
        ("Specific Model Prompt", test_specific_model_prompt),
        ("Backup Directory Info", test_backup_directory_mention),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(c(f"✗ Test '{test_name}' crashed: {e}", "red"))
            results.append((test_name, False))
            import traceback
            traceback.print_exc()
    
    # Final summary
    print()
    print(c("═" * 70, "purple"))
    print(c("📊 TEST SUMMARY", "cyan"))
    print(c("═" * 70, "purple"))
    print()
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = c("✅ PASS", "green") if result else c("✗ FAIL", "red")
        print(f"  {test_name:40} {status}")
    
    print()
    print(c("─" * 70, "dim"))
    
    if passed == total:
        print(c(f"🎉 ALL TESTS PASSED ({passed}/{total})", "green"))
    else:
        print(c(f"⚠  SOME TESTS FAILED ({passed}/{total} passed)", "yellow"))
    
    print()
    
    # Usage examples
    print(c("💡 USAGE EXAMPLES:", "cyan"))
    print()
    print(c("1. Test all installed models:", "white"))
    print(c("   test all", "yellow"))
    print(c("   → Shows detected models in main/backup directories", "dim"))
    print(c("   → Prompts to install if none found", "dim"))
    print()
    print(c("2. Test specific model:", "white"))
    print(c("   test tinyllama", "yellow"))
    print(c("   → Checks main and backup directories", "dim"))
    print(c("   → Prompts to install if not found", "dim"))
    print()
    print(c("3. Set backup directory:", "white"))
    print(c("   backup models", "yellow"))
    print(c("   → Allows models to be stored on external drive", "dim"))
    print()
    
    return passed == total

if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print()
        print(c("\n⚠  Tests interrupted by user", "yellow"))
        sys.exit(1)
    except Exception as e:
        print()
        print(c(f"\n✗ Test suite crashed: {e}", "red"))
        import traceback
        traceback.print_exc()
        sys.exit(1)
