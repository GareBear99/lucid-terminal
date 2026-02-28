#!/usr/bin/env python3
"""
🔍 Script Watcher Daemon
Watches Python scripts for errors and shows consensus fixes
"""
import time
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import sys

# Add core to path
sys.path.insert(0, str(Path(__file__).parent))

from colors import c
from single_key_input import get_single_key_input


class ScriptWatcherDaemon:
    """
    Daemon that watches Python scripts and suggests fixes from consensus.
    """
    
    def __init__(self, dictionary=None):
        self.watching_files = {}
        self.autofix_enabled = {}
        self.observer = None
        self.dictionary = dictionary  # RelevanceDictionary for consensus fixes
    
    def find_script(self, filename: str) -> Path:
        """Find script by name in common locations."""
        import platform
        
        search_locations = [
            Path.cwd(),
            Path.home() / 'Desktop',
            Path.home() / 'Documents',
            Path.home() / 'Downloads',
        ]
        
        # Platform-specific locations
        if platform.system() == 'Darwin':  # macOS
            search_locations.extend([
                Path.home() / 'Desktop' / 'Projects',
                Path.home() / 'Library' / 'Application Support',
            ])
        
        matches = []
        
        for location in search_locations:
            if not location.exists():
                continue
            
            exact = location / filename
            if exact.exists() and exact.is_file():
                matches.append(exact)
            
            try:
                for item in location.rglob(filename):
                    if item.is_file() and item not in matches:
                        matches.append(item)
                        if len(matches) >= 20:
                            break
            except PermissionError:
                continue
            
            if len(matches) >= 20:
                break
        
        if not matches:
            return None
        
        if len(matches) == 1:
            return matches[0]
        
        # Multiple matches - let user choose
        return self._select_from_matches(matches, filename)
    
    def _select_from_matches(self, matches: list, filename: str) -> Path:
        """Let user select from multiple matches."""
        print()
        print(c(f"🔍 Found {len(matches)} scripts matching '{filename}':", "yellow"))
        print()
        
        for i, path in enumerate(matches, 1):
            try:
                rel_path = path.relative_to(Path.cwd())
                display_path = f"./{rel_path}"
            except ValueError:
                display_path = str(path).replace(str(Path.home()), '~')
            
            print(c(f"  [{i}] {display_path}", "cyan"))
        
        print(c(f"  [0] Cancel", "dim"))
        print()
        
        if len(matches) > 9:
            try:
                choice = input(c(f"Select script (1-{len(matches)} or 0): ", "yellow")).strip()
                choice_num = int(choice)
            except (ValueError, EOFError, KeyboardInterrupt):
                print(c("\n❌ Cancelled", "yellow"))
                return None
        else:
            valid_keys = [str(i) for i in range(len(matches) + 1)]
            choice = get_single_key_input(
                c(f"Select script (1-{len(matches)} or 0): ", "yellow"),
                valid_keys=valid_keys
            )
            choice_num = int(choice)
        
        print()
        
        if choice_num == 0:
            print(c("❌ Cancelled", "yellow"))
            return None
        elif 1 <= choice_num <= len(matches):
            selected = matches[choice_num - 1]
            print(c(f"✅ Selected: {selected.name}", "green"))
            return selected
        else:
            print(c("❌ Invalid selection", "red"))
            return None
    
    def confirm_path(self, script_path: Path) -> bool:
        """Ask user to confirm script path."""
        print()
        print(c(f"📍 Found script:", "cyan"))
        print(c(f"   {script_path}", "yellow"))
        print()
        
        choice = get_single_key_input(
            c("Watch this file? (y/n): ", "cyan"),
            valid_keys=['y', 'n', 'Y', 'N']
        )
        
        return choice.lower() == 'y'
    
    def ask_autofix(self) -> bool:
        """Ask user if they want autofix enabled."""
        print()
        print(c("🔧 Autofix Mode", "yellow"))
        print(c("   When enabled: Automatically applies fixes", "dim"))
        print(c("   When disabled: Shows top 3 consensus suggestions", "dim"))
        print()
        
        choice = get_single_key_input(
            c("Enable autofix? (y/n): ", "cyan"),
            valid_keys=['y', 'n', 'Y', 'N']
        )
        
        return choice.lower() == 'y'
    
    def check_script_errors(self, script_path: Path) -> dict:
        """Check script for errors."""
        errors = []
        
        # Syntax check
        try:
            with open(script_path) as f:
                compile(f.read(), str(script_path), 'exec')
        except SyntaxError as e:
            errors.append({
                'type': 'SyntaxError',
                'message': str(e),
                'line': e.lineno,
                'text': e.text
            })
        except Exception as e:
            errors.append({
                'type': type(e).__name__,
                'message': str(e),
                'line': None,
                'text': None
            })
        
        # Runtime check
        if not errors:
            result = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode != 0:
                stderr = result.stderr
                if 'ModuleNotFoundError' in stderr or 'ImportError' in stderr:
                    lines = stderr.split('\n')
                    for line in lines:
                        if 'Error' in line:
                            errors.append({
                                'type': 'ImportError',
                                'message': line.strip(),
                                'line': None,
                                'text': None
                            })
                            break
                elif 'NameError' in stderr:
                    lines = stderr.split('\n')
                    for line in lines:
                        if 'NameError' in line:
                            errors.append({
                                'type': 'NameError',
                                'message': line.strip(),
                                'line': None,
                                'text': None
                            })
                            break
        
        return {
            'has_errors': len(errors) > 0,
            'errors': errors,
            'script': str(script_path)
        }
    
    def get_consensus_fixes(self, error: dict, top_n: int = 3) -> list:
        """Get top N fixes from consensus."""
        if not self.dictionary:
            return []
        
        error_type = error['type']
        error_msg = error['message']
        
        # Search consensus
        all_fixes = self.dictionary.search_similar_fixes(error_msg, min_relevance=0.3)
        
        # Filter and sort
        relevant_fixes = [f for f in all_fixes if f.get('source') == 'remote']
        relevant_fixes.sort(key=lambda x: x.get('relevance_score', 0), reverse=True)
        
        return relevant_fixes[:top_n]
    
    def show_fix_suggestions(self, error: dict, fixes: list):
        """Show top fixes with code snippets on white background."""
        print()
        print(c(f"💡 Top {len(fixes)} Consensus Fixes:", "cyan"))
        print()
        
        for i, fix in enumerate(fixes, 1):
            score = fix.get('relevance_score', 0)
            solution = fix.get('solution', 'N/A')
            usage = fix.get('usage_stats', {})
            attempts = usage.get('attempts', 0)
            successes = usage.get('successes', 0)
            success_rate = (successes / attempts * 100) if attempts > 0 else 0
            
            print(c(f"  [{i}] Score: {score:.2f} | Success Rate: {success_rate:.0f}%", "yellow"))
            print()
            
            # Show code snippet with white background
            print("\033[47m\033[30m" + "  " + solution + "\033[0m")  # White bg, black text
            print()
    
    def apply_fix(self, script_path: Path, fix: str) -> bool:
        """Apply fix to the script."""
        try:
            with open(script_path, 'r') as f:
                lines = f.readlines()
            
            # Add import at appropriate location
            insert_pos = 0
            for i, line in enumerate(lines):
                if line.strip().startswith('#') or line.strip() == '':
                    insert_pos = i + 1
                elif line.strip().startswith('import') or line.strip().startswith('from'):
                    insert_pos = i + 1
                else:
                    break
            
            lines.insert(insert_pos, fix + '\n')
            
            with open(script_path, 'w') as f:
                f.writelines(lines)
            
            return True
        except Exception as e:
            print(c(f"❌ Failed to apply fix: {e}", "red"))
            return False
    
    def _check_and_report(self, script_path: Path):
        """Check script and show suggestions or auto-fix."""
        result = self.check_script_errors(script_path)
        
        if not result['has_errors']:
            print(c("   ✅ No errors found", "green"))
            return
        
        print()
        print(c(f"   ⚠️  Found {len(result['errors'])} error(s)", "yellow"))
        print()
        
        for error in result['errors']:
            print(c(f"   Error: {error['type']}", "red"))
            print(c(f"   {error['message']}", "dim"))
            
            if error['line']:
                print(c(f"   Line {error['line']}: {error['text']}", "dim"))
            
            print()
            
            # Get consensus fixes
            consensus_fixes = self.get_consensus_fixes(error, top_n=3)
            
            autofix = self.autofix_enabled.get(str(script_path), False)
            
            if autofix and consensus_fixes:
                # Auto-apply best fix
                best_fix = consensus_fixes[0]
                print(c("   🔧 Applying top consensus fix...", "yellow"))
                print(c(f"   {best_fix['solution']}", "cyan"))
                
                success = self.apply_fix(script_path, best_fix['solution'])
                
                if success:
                    print(c("   ✅ Fix applied", "green"))
                    # Re-check
                    time.sleep(0.5)
                    new_result = self.check_script_errors(script_path)
                    if not new_result['has_errors']:
                        print(c("   ✅ Script now runs without errors!", "green"))
                else:
                    print(c("   ❌ Could not apply fix", "red"))
            elif consensus_fixes:
                # Show suggestions
                self.show_fix_suggestions(error, consensus_fixes)
            else:
                print(c("   💭 No consensus fixes found", "dim"))
            
            print()
    
    def watch_script(self, script_name: str):
        """Watch a script for errors."""
        print()
        print(c("🔍 Searching for script...", "cyan"))
        
        script_path = self.find_script(script_name)
        
        if not script_path:
            print()
            print(c(f"❌ Could not find script: {script_name}", "red"))
            return
        
        if not self.confirm_path(script_path):
            print()
            print(c("❌ Cancelled", "yellow"))
            return
        
        autofix = self.ask_autofix()
        
        self.watching_files[str(script_path)] = True
        self.autofix_enabled[str(script_path)] = autofix
        
        print()
        print(c("✅ Now watching script", "green"))
        print(c(f"   Mode: {'Autofix' if autofix else 'Suggest (Top 3)'}", "yellow"))
        print()
        
        # Initial check
        print(c("🔬 Running initial check...", "cyan"))
        self._check_and_report(script_path)
        
        # Set up file watcher
        self._start_watching(script_path)
    
    def _start_watching(self, script_path: Path):
        """Start file system watcher."""
        
        class ScriptHandler(FileSystemEventHandler):
            def __init__(self, daemon, path):
                self.daemon = daemon
                self.path = path
            
            def on_modified(self, event):
                if event.src_path == str(self.path):
                    print()
                    print(c(f"📝 File modified: {self.path.name}", "cyan"))
                    self.daemon._check_and_report(self.path)
        
        handler = ScriptHandler(self, script_path)
        self.observer = Observer()
        self.observer.schedule(handler, str(script_path.parent), recursive=False)
        self.observer.start()
        
        print(c("👁️  Watching for changes... (Ctrl+C to stop)", "yellow"))
        print()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print()
            print(c("\n🛑 Stopped watching", "yellow"))
            self.observer.stop()
        
        self.observer.join()


def main():
    """CLI interface."""
    daemon = ScriptWatcherDaemon()
    
    if len(sys.argv) < 2:
        print()
        print(c("🔍 Script Watcher Daemon", "purple"))
        print()
        print(c("Usage:", "cyan"))
        print(c("  python script_watcher_daemon.py watch <script_name>", "yellow"))
        print()
        return
    
    command = sys.argv[1]
    
    if command == "watch":
        if len(sys.argv) < 3:
            print(c("❌ Please specify a script name", "red"))
            return
        
        script_name = sys.argv[2]
        daemon.watch_script(script_name)


if __name__ == "__main__":
    main()
