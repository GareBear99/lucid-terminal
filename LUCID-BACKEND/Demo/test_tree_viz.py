#!/usr/bin/env python3
"""
Test Tree Visualizer - Demonstrates visual directory tree display
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from tree_visualizer import (
    show_directory_tree,
    format_operation_tree,
    preview_move_operation,
    preview_create_operation
)

def test_simple_directory():
    """Test simple directory listing."""
    print("=" * 60)
    print("TEST 1: Simple Directory Tree")
    print("=" * 60)
    print()
    
    # Show current directory
    result = show_directory_tree(".", max_depth=2)
    print(result)
    print()

def test_with_annotations():
    """Test directory tree with annotations."""
    print("=" * 60)
    print("TEST 2: Directory Tree with Annotations")
    print("=" * 60)
    print()
    
    # Show luci_environments with annotations
    annotations = {
        "README.md": "Full documentation",
        "QUICKSTART.md": "Quick reference",
        "environments.json": "Metadata tracking"
    }
    
    result = show_directory_tree(
        "/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local/luci_environments",
        annotations=annotations,
        max_depth=2
    )
    print(result)
    print()

def test_operation_preview():
    """Test operation preview tree."""
    print("=" * 60)
    print("TEST 3: Create Operation Preview")
    print("=" * 60)
    print()
    
    # Example: Creating a project structure
    structure = {
        'src/': {
            'main.py': 'Entry point',
            'utils.py': 'Utility functions',
            'config.py': 'Configuration'
        },
        'tests/': {
            'test_main.py': 'Unit tests',
            'test_utils.py': 'Test utilities'
        },
        'README.md': 'Project documentation',
        'requirements.txt': 'Python dependencies',
        '.gitignore': 'Git ignore rules'
    }
    
    result = format_operation_tree("my_project", structure)
    print(result)
    print()

def test_move_preview():
    """Test move operation preview."""
    print("=" * 60)
    print("TEST 4: Move Operation Preview")
    print("=" * 60)
    print()
    
    items = [
        "script1.py",
        "script2.py",
        "config.json"
    ]
    
    result = preview_move_operation(
        source="/Users/TheRustySpoon/Desktop",
        destination="/Users/TheRustySpoon/Desktop/Projects",
        items=items
    )
    print(result)
    print()

def test_luci_environments():
    """Test showing luci environments structure."""
    print("=" * 60)
    print("TEST 5: Luci Environments Structure")
    print("=" * 60)
    print()
    
    structure = {
        'README.md': 'Full documentation',
        'QUICKSTART.md': 'Quick reference',
        'environments.json': 'Metadata tracking',
        'luci_<name>_<hash>/': {
            'bin/': {
                'python3': 'Python interpreter',
                'pip3': 'Package installer'
            },
            'lib/': 'Python libraries'
        }
    }
    
    result = format_operation_tree("luci_environments", structure)
    print(result)
    print()

if __name__ == "__main__":
    print("\n🌳 Tree Visualizer - Test Suite\n")
    
    try:
        test_simple_directory()
        test_with_annotations()
        test_operation_preview()
        test_move_preview()
        test_luci_environments()
        
        print("=" * 60)
        print("✅ All tests completed!")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
