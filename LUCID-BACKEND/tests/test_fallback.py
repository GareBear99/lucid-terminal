#!/usr/bin/env python3
"""
Test script to demonstrate Luci! fallback with confirmation.
This simulates a scenario where brew fails and asks to try conda.
"""
import sys
from pathlib import Path

# Add luci to path
sys.path.insert(0, str(Path(__file__).parent / "luci"))

from package_manager import PackageManager

# Monkey-patch to simulate failure on first try
original_install = PackageManager._install_via_source

def mock_install(self, package_name, source, verbose):
    """Simulate failure on brew, success on conda."""
    if source == 'brew':
        print(f"🔴 Simulating brew failure for testing...")
        return False  # Simulate failure
    else:
        return original_install(self, package_name, source, verbose)

PackageManager._install_via_source = mock_install

# Test the fallback
print("=" * 60)
print("Testing Luci! Fallback with Confirmation")
print("=" * 60)
print()
print("This will:")
print("1. Try to install via brew (will fail)")
print("2. Ask if you want to try conda")
print("3. Install via conda if you press 'y'")
print()
print("-" * 60)
print()

pm = PackageManager()
pm.install("test-package")
