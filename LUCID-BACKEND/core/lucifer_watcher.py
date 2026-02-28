#!/usr/bin/env python3
"""
👁️ LuciferWatcher — Autonomous File Watcher with Auto-Fix
Watches files for changes, detects errors, and automatically applies fixes from consensus dictionary
"""
import os
import sys
import time
import subprocess
import threading
from pathlib import Path
from typing import Set, Dict, Optional

# Add to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from lucifer_colors import c, Emojis, print_success, print_error, print_info, ErrorFeedback
from lucifer_logger import LuciferLogger
from relevance_dictionary import RelevanceDictionary
import hashlib


class LuciferWatcher:
    """
    Autonomous file watcher that:
    - Watches directories for Python file changes
    - Detects errors when files are saved
    - Automatically applies fixes from consensus dictionary
    - Logs all auto-fix attempts
    """
    
    def __init__(self, user_id: str):
        self.watch_paths: Set[str] = set()
        self.file_timestamps: Dict[str, float] = {}
        self.running = False
        self.thread = None
        self.user_id = user_id
        self.mode = "watch"  # "watch" (suggest only) or "autofix" (apply fixes)
        
        # Initialize components
        self.dictionary = RelevanceDictionary(user_id)
        self.logger = LuciferLogger()
        
        # Only show mode if actively watching files
        mode_display = "N/A" if not self.watch_paths else self.mode
        print(c(f"{Emojis.GHOST} LuciferWatcher initialized (mode: {mode_display})", "purple"))
    
    # ─────────────────────────────── WATCH CONTROL ─────────────────────────────── #
    def add_path(self, path: str):
        """Add a file or directory to watch."""
        p = os.path.expanduser(path)
        if not os.path.exists(p):
            print_error(f"Path not found: {p}")
            return
        
        self.watch_paths.add(p)
        print(c(f"{Emojis.GHOST} Watching: {p}", "purple"))
        self.logger.log_event("watcher_add", p, "Added to file watcher")
    
    def remove_path(self, path: str):
        """Remove a path from watch list."""
        p = os.path.expanduser(path)
        if p in self.watch_paths:
            self.watch_paths.remove(p)
            print(c(f"{Emojis.CROSS} Removed from watch: {p}", "red"))
            self.logger.log_event("watcher_remove", p, "Removed from watcher")
        else:
            ErrorFeedback.warning("Path not in watch list")
    
    def list_paths(self):
        """List all watched paths."""
        if not self.watch_paths:
            print_info("No paths currently watched")
            return
        
        print(c(f"\n{Emojis.GHOST} Currently Watching:", "purple"))
        for p in sorted(self.watch_paths):
            print(f"  • {p}")
        print()
    
    def set_mode(self, mode: str):
        """Set watcher mode: 'watch' (suggest) or 'autofix' (apply)."""
        if mode not in ["watch", "autofix"]:
            ErrorFeedback.warning(f"Invalid mode: {mode}. Use 'watch' or 'autofix'")
            return
        
        old_mode = self.mode
        self.mode = mode
        mode_color = "cyan" if mode == "watch" else "green"
        mode_desc = "suggesting fixes" if mode == "watch" else "auto-applying fixes"
        print(c(f"{Emojis.GHOST} Mode changed: {old_mode.upper()} → {mode.upper()} ({mode_desc})", mode_color))
        self.logger.log_event("watcher_mode_change", "-", f"Mode changed to {mode}")
    
    def start(self, mode: Optional[str] = None):
        """Start the file watcher."""
        if self.running:
            ErrorFeedback.warning("Watcher already running")
            return
        
        if not self.watch_paths:
            ErrorFeedback.warning("No paths to watch. Use 'daemon add <path>' first")
            return
        
        # Set mode if provided
        if mode:
            self.set_mode(mode)
        
        self.running = True
        self.thread = threading.Thread(target=self._watch_loop, daemon=True)
        self.thread.start()
        
        mode_desc = "suggesting fixes" if self.mode == "watch" else "auto-applying fixes"
        mode_color = "cyan" if self.mode == "watch" else "green"
        print_success(f"LuciferWatcher started - {mode_desc} for {len(self.watch_paths)} path(s)")
        print(c(f"{Emojis.GHOST} Active mode: {self.mode.upper()}", mode_color))
        self.logger.log_event("watcher_start", "-", f"Started {self.mode} mode on {len(self.watch_paths)} paths")
    
    def stop(self):
        """Stop the file watcher."""
        if not self.running:
            ErrorFeedback.warning("Watcher not running")
            return
        
        self.running = False
        print(c(f"{Emojis.GHOST} LuciferWatcher stopped", "yellow"))
        self.logger.log_event("watcher_stop", "-", "Watcher stopped")
    
    # ─────────────────────────────── WATCH LOOP ─────────────────────────────── #
    def _watch_loop(self):
        """Main watch loop - checks files for changes."""
        while self.running:
            for path in list(self.watch_paths):
                if os.path.isfile(path):
                    self._check_file(path)
                elif os.path.isdir(path):
                    for root, _, files in os.walk(path):
                        for f in files:
                            if f.endswith('.py'):  # Only watch Python files
                                full = os.path.join(root, f)
                                self._check_file(full)
            
            time.sleep(2)  # Check every 2 seconds
    
    def _check_file(self, file_path: str):
        """Check if a file has changed and auto-fix if needed."""
        try:
            mtime = os.path.getmtime(file_path)
            
            # File changed?
            if file_path not in self.file_timestamps or self.file_timestamps[file_path] != mtime:
                self.file_timestamps[file_path] = mtime
                
                # Only process if not the first time (avoid running on startup)
                old_mtime = self.file_timestamps.get(file_path)
                if old_mtime is not None and old_mtime != mtime:
                    print(c(f"\n{Emojis.MAGNIFIER} Change detected: {os.path.basename(file_path)}", "cyan"))
                    
                    if self.mode == "autofix":
                        self._auto_fix_file(file_path)
                    else:
                        self._suggest_fix_file(file_path)
        
        except Exception:
            pass  # File might be deleted or moved
    
    # ─────────────────────────────── SUGGEST FIX ─────────────────────────────── #
    def _suggest_fix_file(self, file_path: str):
        """
        Detect errors and suggest fixes (watch mode).
        """
        # Step 1: Check for errors
        error = self._detect_error(file_path)
        
        if not error:
            print(c(f"  {Emojis.CHECKMARK} No errors detected", "green"))
            self.logger.log_event("watch_check_success", file_path, "File runs successfully")
            return
        
        # Step 2: Search for fixes
        print(c(f"  {Emojis.WRENCH} Error detected - searching for fixes...", "yellow"))
        error_type = self._classify_error(error)
        
        best_fix = self.dictionary.get_best_fix_for_error(error, error_type)
        
        if not best_fix:
            print(c(f"  {Emojis.CROSS} No matching fix found", "red"))
            print(c(f"  {Emojis.LIGHTBULB} Run 'lucifer fix {file_path}' to get AI assistance", "yellow"))
            self.logger.log_event("watch_no_fix", file_path, f"{error_type}: {error[:100]}")
            return
        
        # Step 3: Suggest fix
        fix_source = "consensus" if best_fix.get('source') == 'remote' else "local"
        print(c(f"\n  {Emojis.SPARKLE} Suggested {fix_source} fix (score: {best_fix['relevance_score']:.2f}):", "green"))
        print(c(f"  → {best_fix['solution']}", "cyan"))
        print(c(f"  {Emojis.LIGHTBULB} Run 'lucifer fix {file_path}' to apply", "yellow"))
        self.logger.log_event("watch_suggest", file_path, f"Suggested {fix_source} fix: {best_fix['solution'][:50]}")
    
    # ─────────────────────────────── AUTO-FIX ─────────────────────────────── #
    def _auto_fix_file(self, file_path: str):
        """
        Automatically check and fix a file:
        1. Run the file to detect errors
        2. Search consensus dictionary for fixes
        3. Apply best matching fix
        4. Log results
        """
        # Step 1: Check for errors
        error = self._detect_error(file_path)
        
        if not error:
            print(c(f"  {Emojis.CHECKMARK} No errors detected", "green"))
            self.logger.log_event("watch_check_success", file_path, "File runs successfully")
            return
        
        # Step 2: Search consensus dictionary
        print(c(f"  {Emojis.WRENCH} Error detected - searching for fix...", "yellow"))
        error_type = self._classify_error(error)
        
        # Get best fix from local dictionary AND remote consensus
        best_fix = self.dictionary.get_best_fix_for_error(error, error_type)
        
        if not best_fix:
            print(c(f"  {Emojis.CROSS} No matching fix found in consensus", "red"))
            self.logger.log_event("watch_no_fix", file_path, f"{error_type}: {error[:100]}")
            return
        
        # Step 3: Apply fix
        fix_source = "consensus" if best_fix.get('source') == 'remote' else "local"
        print(c(f"  {Emojis.SPARKLE} Applying {fix_source} fix (score: {best_fix['relevance_score']:.2f})", "green"))
        
        success = self._apply_fix(file_path, best_fix['solution'], error)
        
        # Record usage
        if 'fix_hash' in best_fix:
            self.dictionary.record_fix_usage(best_fix['fix_hash'], success)
        
        if success:
            print_success(f"Auto-fix applied: {os.path.basename(file_path)}")
            self.logger.log_event("watch_fix_success", file_path, f"Applied {fix_source} fix: {best_fix['solution'][:50]}")
        else:
            print_error(f"Auto-fix failed: {os.path.basename(file_path)}")
            self.logger.log_event("watch_fix_fail", file_path, f"Fix attempt failed")
    
    def _detect_error(self, file_path: str) -> str:
        """Run the file and detect any errors."""
        try:
            result = subprocess.run(
                ["python3", file_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return ""  # No error
            
            return result.stderr.strip()
        
        except subprocess.TimeoutExpired:
            return "TimeoutError: Script execution timed out"
        except Exception as e:
            return f"ExecutionError: {str(e)}"
    
    def _classify_error(self, error: str) -> str:
        """Classify error type."""
        error_lower = error.lower()
        
        if "nameerror" in error_lower:
            return "NameError"
        elif "syntaxerror" in error_lower:
            return "SyntaxError"
        elif "importerror" in error_lower or "modulenotfound" in error_lower:
            return "ImportError"
        elif "typeerror" in error_lower:
            return "TypeError"
        elif "attributeerror" in error_lower:
            return "AttributeError"
        elif "timeout" in error_lower:
            return "TimeoutError"
        else:
            return "Unknown"
    
    def _apply_fix(self, file_path: str, solution: str, original_error: str) -> bool:
        """
        Apply a fix to the file.
        Currently handles import-related fixes.
        """
        try:
            # Read current content
            with open(file_path, 'r') as f:
                original_content = f.read()
            
            # For import fixes
            if solution.startswith(("import ", "from ")):
                lines = original_content.split('\n')
                
                # Find insertion point (after shebang/docstring)
                insert_pos = 0
                in_docstring = False
                
                for i, line in enumerate(lines):
                    if line.startswith('#!'):
                        insert_pos = i + 1
                    elif line.strip().startswith('"""') or line.strip().startswith("'''"):
                        if not in_docstring:
                            in_docstring = True
                        else:
                            in_docstring = False
                            insert_pos = i + 1
                    elif not in_docstring and line.strip() and not line.startswith('#'):
                        break
                
                # Add import
                lines.insert(insert_pos, solution)
                new_content = '\n'.join(lines)
                
                # Write back
                with open(file_path, 'w') as f:
                    f.write(new_content)
                
                # Test if it works
                test_result = self._detect_error(file_path)
                
                if not test_result:
                    return True  # Success!
                else:
                    # Revert if still fails
                    with open(file_path, 'w') as f:
                        f.write(original_content)
                    return False
            
            return False  # Other fix types not yet supported
        
        except Exception as e:
            print_error(f"Error applying fix: {e}")
            return False


# Test if run directly
if __name__ == "__main__":
    import hashlib
    import uuid
    
    # Generate test user ID
    device_id = str(uuid.UUID(int=uuid.getnode()))
    username = os.getenv("USER", "unknown")
    user_id = hashlib.sha256(f"{device_id}-{username}".encode()).hexdigest()[:16].upper()
    
    watcher = LuciferWatcher(user_id)
    
    print("\n" + c("="*60, "purple"))
    print(c(f"{Emojis.GHOST} LuciferWatcher Test", "purple"))
    print(c("="*60, "purple") + "\n")
    
    # Test commands
    watcher.add_path(".")
    watcher.list_paths()
    
    print(c("\nTo use:", "yellow"))
    print("  watcher.start()  # Start watching")
    print("  watcher.stop()   # Stop watching")
