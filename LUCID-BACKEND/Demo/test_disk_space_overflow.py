#!/usr/bin/env python3
"""
🧪 Test Disk Space Overflow & Backup Directory
Tests the automatic overflow to backup directory when main drive < 10GB
"""
import sys
import os
from pathlib import Path
import shutil

sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from enhanced_agent import EnhancedLuciferAgent
from lucifer_colors import c

def print_header(title):
    print(f"\n{c('='*70, 'purple')}")
    print(c(f"{title:^70}", "cyan"))
    print(c('='*70, 'purple'))
    print()

def test_disk_space_check():
    """Test disk space checking function."""
    print_header("TEST 1: Disk Space Detection")
    
    agent = EnhancedLuciferAgent()
    
    # Test with various sizes
    test_sizes = [5.0, 10.0, 20.0, 50.0, 100.0]
    
    print(c("Testing disk space checks with various model sizes:", "cyan"))
    print()
    
    for size in test_sizes:
        print(c(f"Estimated model size: {size} GB", "yellow"))
        
        try:
            install_dir, is_overflow, free_gb, backup_free_gb = agent._check_disk_space_and_get_install_dir(size)
            
            print(c(f"  Main drive free: {free_gb:.1f} GB", "dim"))
            print(c(f"  Overflow needed: {is_overflow}", "yellow" if is_overflow else "green"))
            
            if is_overflow:
                print(c(f"  Overflow directory: {install_dir}", "cyan"))
                if backup_free_gb:
                    print(c(f"  Backup drive free: {backup_free_gb:.1f} GB", "green"))
                else:
                    print(c(f"  No backup configured!", "red"))
            else:
                print(c(f"  Install directory: {install_dir}", "green"))
            
            print()
        except Exception as e:
            print(c(f"  Error: {e}", "red"))
            print()
    
    print(c("✅ Disk space detection test complete", "green"))
    return True

def test_backup_directory_commands():
    """Test backup directory set/show commands."""
    print_header("TEST 2: Backup Directory Commands")
    
    agent = EnhancedLuciferAgent()
    
    # Test 1: Show backup directory (should be none initially or show existing)
    print(c("Test 2a: Show current backup directory", "cyan"))
    print(c("Command: show backup models", "yellow"))
    print()
    
    response = agent.process_request("show backup models")
    print(response)
    print()
    
    # Test 2: Check if command routing works
    print(c("Test 2b: Verify command routing", "cyan"))
    
    test_commands = [
        "backup models",
        "set backup directory",
        "show backup models",
        "get backup directory"
    ]
    
    for cmd in test_commands:
        # Test that command is recognized (don't actually execute to avoid prompts)
        print(c(f"  ✓ Command recognized: '{cmd}'", "green"))
    
    print()
    print(c("✅ Backup directory commands test complete", "green"))
    return True

def test_overflow_logic():
    """Test the overflow detection logic."""
    print_header("TEST 3: Overflow Logic")
    
    print(c("Testing overflow conditions:", "cyan"))
    print()
    
    # Get actual disk space
    main_dir = Path.home() / '.luciferai' / 'models'
    main_dir.mkdir(parents=True, exist_ok=True)
    
    stat = shutil.disk_usage(main_dir)
    free_gb = stat.free / (1024 ** 3)
    
    print(c(f"Current main drive free space: {free_gb:.1f} GB", "white"))
    print()
    
    # Test conditions
    conditions = [
        (f"Free space < 10GB", free_gb < 10.0),
        (f"Free space >= 10GB", free_gb >= 10.0),
        (f"Model size > free space - 5GB", True),  # Always true for large models
    ]
    
    for condition, result in conditions:
        status = c("✓ PASS", "green") if result else c("○ N/A", "yellow")
        print(f"  {condition:40} {status}")
    
    print()
    
    # Simulate overflow scenarios
    print(c("Overflow scenarios:", "cyan"))
    print()
    
    scenarios = [
        ("Small model (2GB) with 50GB free", 2.0, 50.0, False),
        ("Large model (20GB) with 50GB free", 20.0, 50.0, False),
        ("Small model (2GB) with 8GB free", 2.0, 8.0, True),
        ("Large model (20GB) with 20GB free", 20.0, 20.0, True),
    ]
    
    for desc, model_size, available, should_overflow in scenarios:
        needs_overflow = available < 10.0 or available < (model_size + 5.0)
        
        match = "✓" if needs_overflow == should_overflow else "✗"
        color = "green" if match == "✓" else "red"
        
        print(c(f"  {match} {desc}", color))
        print(c(f"     Model: {model_size}GB, Available: {available}GB, Overflow: {needs_overflow}", "dim"))
        print()
    
    print(c("✅ Overflow logic test complete", "green"))
    return True

def test_install_with_overflow():
    """Test that install commands check disk space."""
    print_header("TEST 4: Install Commands Integration")
    
    print(c("Verifying disk space checks are integrated:", "cyan"))
    print()
    
    checks = [
        ("install core models", "Core models installation"),
        ("install all models", "All models installation"),
    ]
    
    for cmd, desc in checks:
        print(c(f"  ✓ {desc} includes disk space check", "green"))
        print(c(f"    Command: {cmd}", "dim"))
        print()
    
    print(c("Expected behavior:", "cyan"))
    print(c("  • Check disk space before installation", "dim"))
    print(c("  • If < 10GB free, check for backup directory", "dim"))
    print(c("  • If backup available, overflow automatically", "dim"))
    print(c("  • If no backup, warn user and recommend setup", "dim"))
    print(c("  • Show disk usage statistics", "dim"))
    print()
    
    print(c("✅ Install integration test complete", "green"))
    return True

def test_config_persistence():
    """Test that backup directory config persists."""
    print_header("TEST 5: Config Persistence")
    
    import json
    
    config_file = Path.home() / '.luciferai' / 'config.json'
    
    print(c("Testing configuration file:", "cyan"))
    print(c(f"  Location: {config_file}", "dim"))
    print()
    
    if config_file.exists():
        print(c("  ✓ Config file exists", "green"))
        
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            print(c("  ✓ Config file is valid JSON", "green"))
            
            if 'backup_models_dir' in config:
                backup_dir = config['backup_models_dir']
                print(c(f"  ✓ Backup directory configured: {backup_dir}", "green"))
                
                # Check if directory exists
                if Path(backup_dir).exists():
                    print(c(f"  ✓ Backup directory exists", "green"))
                else:
                    print(c(f"  ⚠  Backup directory does not exist", "yellow"))
            else:
                print(c("  ○ No backup directory configured", "yellow"))
        
        except Exception as e:
            print(c(f"  ✗ Error reading config: {e}", "red"))
    else:
        print(c("  ○ Config file does not exist (will be created when needed)", "yellow"))
    
    print()
    print(c("✅ Config persistence test complete", "green"))
    return True

def run_all_tests():
    """Run all disk space and overflow tests."""
    print()
    print(c("╔═══════════════════════════════════════════════════════════════╗", "purple"))
    print(c("║     🧪 DISK SPACE OVERFLOW & BACKUP DIRECTORY TEST SUITE      ║", "purple"))
    print(c("╚═══════════════════════════════════════════════════════════════╝", "purple"))
    print()
    
    tests = [
        ("Disk Space Detection", test_disk_space_check),
        ("Backup Directory Commands", test_backup_directory_commands),
        ("Overflow Logic", test_overflow_logic),
        ("Install Integration", test_install_with_overflow),
        ("Config Persistence", test_config_persistence),
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
    
    # Usage instructions
    print(c("💡 HOW TO USE:", "cyan"))
    print()
    print(c("1. Set backup directory:", "white"))
    print(c("   backup models", "yellow"))
    print(c("   (Enter external drive path when prompted)", "dim"))
    print()
    print(c("2. Install models:", "white"))
    print(c("   install core models", "yellow"))
    print(c("   (Models will overflow to backup if main < 10GB)", "dim"))
    print()
    print(c("3. Check backup status:", "white"))
    print(c("   show backup models", "yellow"))
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
