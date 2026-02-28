#!/usr/bin/env python3
"""
Test Luci Environment Manager
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from luci_env_manager import get_luci_env_manager

def test_environment_creation():
    """Test creating a new environment."""
    print("=" * 60)
    print("TEST: Environment Creation")
    print("=" * 60)
    print()
    
    manager = get_luci_env_manager()
    
    # Test script with dependencies
    test_script = Path.home() / "Desktop" / "test_watchdog.py"
    dependencies = ["watchdog", "requests"]
    
    print(f"Creating environment for: {test_script}")
    print(f"Dependencies: {dependencies}")
    print()
    
    env_path, is_new = manager.find_or_create_environment(str(test_script), dependencies)
    
    if env_path:
        print(f"\n✅ Success! Environment path: {env_path}")
        print(f"   New environment: {is_new}")
    else:
        print("\n❌ Failed to create environment")
    
    print()

def test_environment_reuse():
    """Test reusing an existing environment."""
    print("=" * 60)
    print("TEST: Environment Reuse")
    print("=" * 60)
    print()
    
    manager = get_luci_env_manager()
    
    # Same script and dependencies
    test_script = Path.home() / "Desktop" / "test_watchdog.py"
    dependencies = ["watchdog", "requests"]
    
    print(f"Looking for existing environment...")
    print(f"Script: {test_script}")
    print(f"Dependencies: {dependencies}")
    print()
    
    env_path, is_new = manager.find_or_create_environment(str(test_script), dependencies)
    
    if env_path:
        print(f"\n✅ Found! Environment path: {env_path}")
        print(f"   New environment: {is_new}")
        if not is_new:
            print("   ✨ Successfully reused existing environment!")
    else:
        print("\n❌ Failed")
    
    print()

def test_list_environments():
    """Test listing all environments."""
    print("=" * 60)
    print("TEST: List Environments")
    print("=" * 60)
    print()
    
    manager = get_luci_env_manager()
    envs = manager.list_environments()
    
    if envs:
        print(f"Found {len(envs)} environment(s):\n")
        for env in envs:
            print(f"  📦 {env['name']}")
            print(f"     Script: {env.get('script_path', 'unknown')}")
            print(f"     Deps: {', '.join(env.get('dependencies', []))}")
            print(f"     Python: {env.get('python', 'unknown')}")
            print()
    else:
        print("No environments found")
    
    print()

def test_import_detection():
    """Test detecting imports from code."""
    print("=" * 60)
    print("TEST: Import Detection")
    print("=" * 60)
    print()
    
    from enhanced_agent import EnhancedLuciferAgent
    agent = EnhancedLuciferAgent()
    
    test_code = """
import os
import sys
import watchdog
from flask import Flask
from pathlib import Path
import requests
import json
"""
    
    print("Test code:")
    print(test_code)
    print()
    
    detected = agent._detect_third_party_imports(test_code)
    
    print(f"Detected third-party imports: {detected}")
    print()

if __name__ == "__main__":
    print("\n🩸 Luci Environment Manager - Test Suite\n")
    
    try:
        test_import_detection()
        test_environment_creation()
        test_environment_reuse()
        test_list_environments()
        
        print("=" * 60)
        print("✅ All tests completed!")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
