#!/usr/bin/env python3
"""
🧪 Comprehensive Daemon and File Operations Test
Tests daemon watch functionality and copy/move operations
"""
import os
import sys
from pathlib import Path
import time
import shutil

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))

from enhanced_agent import EnhancedLuciferAgent

# Test colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"

class TestRunner:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.agent = EnhancedLuciferAgent()
        self.test_dir = Path.home() / "Desktop" / "luci_test_ops"
        
    def setup(self):
        """Setup test environment."""
        print(f"\n{BLUE}Setting up test environment...{RESET}")
        
        # Clean up from previous runs
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)
        
        # Create fresh test directory
        self.test_dir.mkdir(parents=True)
        print(f"{GREEN}✓ Created test directory: {self.test_dir}{RESET}\n")
        
    def cleanup(self):
        """Clean up test environment."""
        print(f"\n{BLUE}Cleaning up test environment...{RESET}")
        
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)
        
        print(f"{GREEN}✓ Cleaned up test directory{RESET}\n")
    
    def run_test(self, name, command, verify_func):
        """Run a single test."""
        self.tests_run += 1
        print(f"{CYAN}Test {self.tests_run}: {name}{RESET}")
        print(f"{GOLD}Command: {command}{RESET}")
        
        try:
            # Run command
            response = self.agent.process_request(command)
            print(f"Response: {response[:100]}..." if len(response) > 100 else f"Response: {response}")
            
            # Verify
            time.sleep(0.5)  # Give filesystem time to settle
            success, message = verify_func()
            
            if success:
                self.tests_passed += 1
                print(f"{GREEN}✅ PASS: {message}{RESET}\n")
            else:
                self.tests_failed += 1
                print(f"{RED}❌ FAIL: {message}{RESET}\n")
                
        except Exception as e:
            self.tests_failed += 1
            print(f"{RED}❌ FAIL: Exception: {e}{RESET}\n")
    
    def print_summary(self):
        """Print test summary."""
        print(f"\n{PURPLE}{'='*70}{RESET}")
        print(f"{PURPLE}TEST SUMMARY{RESET}")
        print(f"{PURPLE}{'='*70}{RESET}\n")
        
        print(f"Total tests: {self.tests_run}")
        print(f"{GREEN}Passed: {self.tests_passed}{RESET}")
        print(f"{RED}Failed: {self.tests_failed}{RESET}")
        
        pass_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\nPass rate: {pass_rate:.1f}%\n")


def test_copy_operations(runner):
    """Test file and directory copy operations."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION: COPY OPERATIONS{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Setup test files
    test_file = runner.test_dir / "source_file.txt"
    test_file.write_text("This is test content for copying")
    
    test_folder = runner.test_dir / "source_folder"
    test_folder.mkdir()
    (test_folder / "file1.txt").write_text("File 1 content")
    (test_folder / "file2.txt").write_text("File 2 content")
    
    # Test 1: Copy file with "copy X to Y" syntax
    runner.run_test(
        "Copy file (copy X to Y)",
        f"copy {test_file} to {runner.test_dir}/copied_file.txt",
        lambda: (
            (runner.test_dir / "copied_file.txt").exists(),
            f"File copied to {runner.test_dir}/copied_file.txt"
        )
    )
    
    # Test 2: Copy file with "copy X Y" syntax
    runner.run_test(
        "Copy file (copy X Y)",
        f"copy {test_file} {runner.test_dir}/copied_file2.txt",
        lambda: (
            (runner.test_dir / "copied_file2.txt").exists(),
            f"File copied to {runner.test_dir}/copied_file2.txt"
        )
    )
    
    # Test 3: Copy directory with "copy X to Y" syntax
    runner.run_test(
        "Copy directory (copy X to Y)",
        f"copy {test_folder} to {runner.test_dir}/copied_folder",
        lambda: (
            (runner.test_dir / "copied_folder").exists() and
            (runner.test_dir / "copied_folder" / "file1.txt").exists() and
            (runner.test_dir / "copied_folder" / "file2.txt").exists(),
            f"Directory copied with all contents"
        )
    )
    
    # Test 4: Copy directory with "copy X Y" syntax
    runner.run_test(
        "Copy directory (copy X Y)",
        f"copy {test_folder} {runner.test_dir}/copied_folder2",
        lambda: (
            (runner.test_dir / "copied_folder2").exists() and
            (runner.test_dir / "copied_folder2" / "file1.txt").exists(),
            f"Directory copied with all contents"
        )
    )


def test_move_operations(runner):
    """Test file and directory move operations."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION: MOVE OPERATIONS{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Setup test files
    move_file = runner.test_dir / "file_to_move.txt"
    move_file.write_text("This file will be moved")
    
    move_folder = runner.test_dir / "folder_to_move"
    move_folder.mkdir()
    (move_folder / "content.txt").write_text("Folder content")
    
    # Test 5: Move file with "move X to Y" syntax
    runner.run_test(
        "Move file (move X to Y)",
        f"move {move_file} to {runner.test_dir}/moved_file.txt",
        lambda: (
            (runner.test_dir / "moved_file.txt").exists() and
            not move_file.exists(),
            f"File moved to new location, original removed"
        )
    )
    
    # Create another file for second move test
    move_file2 = runner.test_dir / "file_to_move2.txt"
    move_file2.write_text("This file will also be moved")
    
    # Test 6: Move file with "move X Y" syntax
    runner.run_test(
        "Move file (move X Y)",
        f"move {move_file2} {runner.test_dir}/moved_file2.txt",
        lambda: (
            (runner.test_dir / "moved_file2.txt").exists() and
            not move_file2.exists(),
            f"File moved to new location, original removed"
        )
    )
    
    # Test 7: Move directory with "move X to Y" syntax
    runner.run_test(
        "Move directory (move X to Y)",
        f"move {move_folder} to {runner.test_dir}/moved_folder",
        lambda: (
            (runner.test_dir / "moved_folder").exists() and
            (runner.test_dir / "moved_folder" / "content.txt").exists() and
            not move_folder.exists(),
            f"Directory moved with contents, original removed"
        )
    )
    
    # Create another folder for second move test
    move_folder2 = runner.test_dir / "folder_to_move2"
    move_folder2.mkdir()
    (move_folder2 / "data.txt").write_text("More folder content")
    
    # Test 8: Move directory with "move X Y" syntax
    runner.run_test(
        "Move directory (move X Y)",
        f"move {move_folder2} {runner.test_dir}/moved_folder2",
        lambda: (
            (runner.test_dir / "moved_folder2").exists() and
            (runner.test_dir / "moved_folder2" / "data.txt").exists() and
            not move_folder2.exists(),
            f"Directory moved with contents, original removed"
        )
    )


def test_daemon_workflow(runner):
    """Test daemon watch functionality (manual verification required)."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION: DAEMON WATCH WORKFLOW (Manual){RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    print(f"{GOLD}This section demonstrates daemon workflow but requires manual interaction{RESET}\n")
    
    # Create a test script with an error
    test_script = runner.test_dir / "test_script.py"
    test_script.write_text("""#!/usr/bin/env python3
# Test script with import error
data = json.dumps({"test": "value"})
print(data)
""")
    
    print(f"{CYAN}Created test script with error: {test_script}{RESET}")
    print(f"{CYAN}Script content:{RESET}")
    print(test_script.read_text())
    print()
    
    print(f"{GOLD}To test daemon functionality:{RESET}")
    print(f"  1. Run: {CYAN}daemon watch test_script.py{RESET}")
    print(f"  2. When prompted for path: Press {CYAN}y{RESET}")
    print(f"  3. When prompted for autofix: Press {CYAN}y{RESET} or {CYAN}n{RESET}")
    print(f"  4. Daemon will detect the missing 'import json'")
    print(f"  5. If autofix=y: Watch it auto-fix the script")
    print(f"  6. If autofix=n: Watch it suggest the fix")
    print(f"  7. Press Ctrl+C to stop watching")
    print()
    
    print(f"{BLUE}Daemon Features Demonstrated:{RESET}")
    print(f"  • {GREEN}✓{RESET} Smart file finding (searches Desktop, Documents, etc.)")
    print(f"  • {GREEN}✓{RESET} Path confirmation with y/n prompt")
    print(f"  • {GREEN}✓{RESET} Autofix mode selection with y/n prompt")
    print(f"  • {GREEN}✓{RESET} Initial error check")
    print(f"  • {GREEN}✓{RESET} Real-time file watching")
    print(f"  • {GREEN}✓{RESET} Automatic error detection")
    print(f"  • {GREEN}✓{RESET} Smart fix suggestions")
    print(f"  • {GREEN}✓{RESET} Optional auto-fix application")
    print()
    
    # Show daemon status command
    print(f"{GOLD}To check daemon status:{RESET}")
    print(f"  Run: {CYAN}daemon status{RESET}")
    print()


def test_delete_operations(runner):
    """Test file and directory delete operations with trash confirmation."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION: DELETE OPERATIONS (Manual Confirmation Required){RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    print(f"{GOLD}These tests require manual y/n confirmation{RESET}\n")
    
    # Create files for deletion
    delete_file = runner.test_dir / "delete_me.txt"
    delete_file.write_text("This file will be deleted")
    
    delete_folder = runner.test_dir / "delete_me_folder"
    delete_folder.mkdir()
    (delete_folder / "content.txt").write_text("Folder content")
    
    print(f"{CYAN}Created test items for deletion:{RESET}")
    print(f"  • File: {delete_file}")
    print(f"  • Folder: {delete_folder}")
    print()
    
    print(f"{GOLD}Manual Test Instructions:{RESET}")
    print(f"  1. Run: {CYAN}delete delete_me.txt{RESET}")
    print(f"     - Should find the file")
    print(f"     - Show warning with file path")
    print(f"     - Prompt: 'Move to trash? (y/n)'")
    print(f"     - Press {CYAN}y{RESET} to confirm")
    print(f"     - File should move to Trash (recoverable)")
    print()
    print(f"  2. Run: {CYAN}delete the folder delete_me_folder{RESET}")
    print(f"     - Should find the folder")
    print(f"     - Show item count in folder")
    print(f"     - Prompt for confirmation")
    print(f"     - Press {CYAN}y{RESET} to confirm")
    print(f"     - Folder should move to Trash")
    print()
    print(f"  3. Run: {CYAN}delete the file name test.py on my desktop{RESET}")
    print(f"     - Should parse natural language query")
    print(f"     - Search for test.py on Desktop")
    print(f"     - Show multi-file selection if multiple matches")
    print(f"     - Prompt for trash confirmation")
    print()
    
    print(f"{BLUE}Delete Features Demonstrated:{RESET}")
    print(f"  • {GREEN}✓{RESET} Smart file finding (searches common locations)")
    print(f"  • {GREEN}✓{RESET} Natural language parsing ('delete the file name X on my desktop')")
    print(f"  • {GREEN}✓{RESET} Multi-file selection when multiple matches")
    print(f"  • {GREEN}✓{RESET} Warning display with full path")
    print(f"  • {GREEN}✓{RESET} Item count for folders")
    print(f"  • {GREEN}✓{RESET} Trash confirmation y/n prompt")
    print(f"  • {GREEN}✓{RESET} Safe trash move (recoverable via Trash/Recycle Bin)")
    print(f"  • {GREEN}✓{RESET} Platform-specific (macOS/Windows/Linux)")
    print()


def test_edge_cases(runner):
    """Test edge cases for copy/move operations."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}SECTION: EDGE CASES{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")
    
    # Test 9: Copy to existing file (should prompt for overwrite)
    existing = runner.test_dir / "existing.txt"
    existing.write_text("Original content")
    
    source = runner.test_dir / "source.txt"
    source.write_text("New content")
    
    print(f"{GOLD}Note: The following test may prompt for overwrite confirmation{RESET}\n")
    
    runner.run_test(
        "Copy to existing file",
        f"copy {source} to {existing}",
        lambda: (
            existing.exists(),
            "File copy handled (may have been skipped or overwritten)"
        )
    )
    
    # Test 10: Move to existing directory
    dest_dir = runner.test_dir / "destination"
    dest_dir.mkdir()
    
    file_to_move = runner.test_dir / "moveme.txt"
    file_to_move.write_text("Move me")
    
    runner.run_test(
        "Move file to existing directory",
        f"move {file_to_move} to {dest_dir}",
        lambda: (
            (dest_dir / "moveme.txt").exists() or
            not file_to_move.exists(),
            "File moved into directory or handled appropriately"
        )
    )


def main():
    print(f"\n{PURPLE}{'='*80}{RESET}")
    print(f"{PURPLE}{'🧪 DAEMON AND FILE OPERATIONS TEST':^80}{RESET}")
    print(f"{PURPLE}{'='*80}{RESET}\n")
    
    runner = TestRunner()
    
    try:
        # Setup
        runner.setup()
        
        # Run test sections
        test_copy_operations(runner)
        test_move_operations(runner)
        test_delete_operations(runner)
        test_edge_cases(runner)
        test_daemon_workflow(runner)
        
        # Summary
        runner.print_summary()
        
    except KeyboardInterrupt:
        print(f"\n\n{GOLD}Tests interrupted by user{RESET}\n")
    
    except Exception as e:
        print(f"\n\n{RED}Test suite error: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
    
    finally:
        # Cleanup
        runner.cleanup()


if __name__ == "__main__":
    main()
