#!/usr/bin/env python3
"""
🔄 FixNet Auto-Sync Daemon
Automatically syncs fixes between local and global (GitHub) at regular intervals
"""
import time
import threading
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
import json
import schedule

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"
FIXNET_LOCAL = LUCIFER_HOME / "fixnet"
DAEMON_CONFIG = LUCIFER_HOME / "data" / "daemon_config.json"
SYNC_LOG = LUCIFER_HOME / "logs" / "sync.log"


class FixNetDaemon:
    """
    Background daemon that auto-syncs fixes.
    
    Features:
    - Periodic local → GitHub push
    - Periodic GitHub → local pull
    - Configurable intervals
    - Conflict resolution
    - Activity logging
    - Bandwidth throttling
    """
    
    def __init__(self, 
                 push_interval_minutes: int = 30,
                 pull_interval_minutes: int = 15,
                 auto_start: bool = True):
        self.push_interval = push_interval_minutes
        self.pull_interval = pull_interval_minutes
        self.running = False
        self.thread = None
        
        self.config = self._load_config()
        self.stats = {
            "pushes": 0,
            "pulls": 0,
            "conflicts": 0,
            "last_push": None,
            "last_pull": None,
            "started": None
        }
        
        if auto_start:
            self.start()
    
    def _load_config(self) -> dict:
        """Load daemon configuration."""
        if DAEMON_CONFIG.exists():
            with open(DAEMON_CONFIG) as f:
                return json.load(f)
        
        # Default config
        config = {
            "enabled": True,
            "push_interval": self.push_interval,
            "pull_interval": self.pull_interval,
            "auto_resolve_conflicts": True,
            "max_retries": 3,
            "quiet_hours": {
                "enabled": False,
                "start": "22:00",
                "end": "08:00"
            },
            "bandwidth_limit": None,  # None = unlimited
            "sync_on_wifi_only": False
        }
        
        self._save_config(config)
        return config
    
    def _save_config(self, config: dict = None):
        """Save daemon configuration."""
        if config is None:
            config = self.config
        
        DAEMON_CONFIG.parent.mkdir(parents=True, exist_ok=True)
        with open(DAEMON_CONFIG, 'w') as f:
            json.dump(config, f, indent=2)
    
    def start(self):
        """Start the sync daemon in background."""
        if self.running:
            print(f"{GOLD}Daemon already running{RESET}")
            return
        
        self.running = True
        self.stats['started'] = datetime.now().isoformat()
        
        # Schedule tasks
        schedule.every(self.pull_interval).minutes.do(self._sync_pull)
        schedule.every(self.push_interval).minutes.do(self._sync_push)
        
        # Idle maintenance tasks
        schedule.every(1).hours.do(self._autofix_python_files)
        schedule.every(2).hours.do(self._cleanup_dictionary)
        schedule.every(4).hours.do(self._organize_user_fixes)
        schedule.every(6).hours.do(self._cleanup_branches)
        schedule.every(8).hours.do(self._merge_similar_fixes)
        schedule.every(12).hours.do(self._optimize_repo)
        
        # Run in background thread
        self.thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.thread.start()
        
        print(f"{GREEN}✅ FixNet Daemon started{RESET}")
        print(f"   Pull interval: {self.pull_interval} minutes")
        print(f"   Push interval: {self.push_interval} minutes")
        
        # Initial sync
        self._sync_pull()
    
    def stop(self):
        """Stop the daemon."""
        self.running = False
        schedule.clear()
        
        if self.thread:
            self.thread.join(timeout=5)
        
        print(f"{BLUE}🛑 FixNet Daemon stopped{RESET}")
        self._print_stats()
    
    def _run_scheduler(self):
        """Run the scheduler loop."""
        while self.running:
            schedule.run_pending()
            time.sleep(1)
    
    def _sync_pull(self):
        """Pull updates from GitHub."""
        if not self.config.get('enabled', True):
            return
        
        if self._is_quiet_hours():
            self._log("Skipping pull (quiet hours)")
            return
        
        self._log("🔽 Pulling updates from GitHub...")
        
        try:
            # Change to FixNet directory
            if not FIXNET_LOCAL.exists():
                self._log("FixNet directory not found - skipping pull")
                return
            
            # Git pull
            result = subprocess.run(
                ["git", "pull", "--rebase"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                output = result.stdout.strip()
                if "Already up to date" in output:
                    self._log("✅ Already up to date")
                else:
                    self._log(f"✅ Pulled updates: {output[:100]}")
                    self.stats['pulls'] += 1
                
                self.stats['last_pull'] = datetime.now().isoformat()
            else:
                # Check for conflicts
                if "CONFLICT" in result.stderr:
                    self._log(f"⚠️  Merge conflict detected")
                    self.stats['conflicts'] += 1
                    
                    if self.config.get('auto_resolve_conflicts', True):
                        self._auto_resolve_conflicts()
                else:
                    self._log(f"❌ Pull failed: {result.stderr[:200]}")
        
        except subprocess.TimeoutExpired:
            self._log("❌ Pull timeout - network issue?")
        except Exception as e:
            self._log(f"❌ Pull error: {str(e)[:200]}")
    
    def _sync_push(self):
        """Push local changes to GitHub."""
        if not self.config.get('enabled', True):
            return
        
        if self._is_quiet_hours():
            self._log("Skipping push (quiet hours)")
            return
        
        self._log("🔼 Pushing local fixes to GitHub...")
        
        try:
            if not FIXNET_LOCAL.exists():
                self._log("FixNet directory not found - skipping push")
                return
            
            # Check if there are changes to push
            status_result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True
            )
            
            if not status_result.stdout.strip():
                # No local changes
                # Check if ahead of remote
                ahead_result = subprocess.run(
                    ["git", "rev-list", "--count", "HEAD@{upstream}..HEAD"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True,
                    text=True
                )
                
                ahead_count = int(ahead_result.stdout.strip() or 0)
                if ahead_count == 0:
                    self._log("✅ Nothing to push")
                    return
            
            # Add all changes
            subprocess.run(
                ["git", "add", "."],
                cwd=FIXNET_LOCAL,
                capture_output=True
            )
            
            # Commit with auto-generated message
            commit_msg = f"[Auto-sync] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            commit_result = subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True
            )
            
            if commit_result.returncode != 0 and "nothing to commit" not in commit_result.stdout:
                self._log(f"⚠️  Commit failed: {commit_result.stderr[:200]}")
                return
            
            # Push to GitHub
            push_result = subprocess.run(
                ["git", "push"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if push_result.returncode == 0:
                self._log(f"✅ Pushed to GitHub")
                self.stats['pushes'] += 1
                self.stats['last_push'] = datetime.now().isoformat()
            else:
                # Check if need to pull first
                if "rejected" in push_result.stderr:
                    self._log("⚠️  Push rejected - pulling first...")
                    self._sync_pull()
                    # Retry push after pull
                    retry_result = subprocess.run(
                        ["git", "push"],
                        cwd=FIXNET_LOCAL,
                        capture_output=True,
                        text=True
                    )
                    if retry_result.returncode == 0:
                        self._log("✅ Pushed after pull")
                        self.stats['pushes'] += 1
                    else:
                        self._log(f"❌ Push failed after pull: {retry_result.stderr[:200]}")
                else:
                    self._log(f"❌ Push failed: {push_result.stderr[:200]}")
        
        except subprocess.TimeoutExpired:
            self._log("❌ Push timeout - network issue?")
        except Exception as e:
            self._log(f"❌ Push error: {str(e)[:200]}")
    
    def _auto_resolve_conflicts(self):
        """Automatically resolve merge conflicts."""
        self._log("🔧 Auto-resolving conflicts...")
        
        try:
            # Strategy: Accept remote changes for refs.json (it's append-only)
            # Keep local changes for actual fix files
            
            # Get list of conflicted files
            status = subprocess.run(
                ["git", "diff", "--name-only", "--diff-filter=U"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True
            )
            
            conflicted_files = status.stdout.strip().split('\n')
            
            for file in conflicted_files:
                if not file:
                    continue
                
                if file == "refs.json":
                    # Accept remote version for refs.json
                    subprocess.run(
                        ["git", "checkout", "--theirs", file],
                        cwd=FIXNET_LOCAL,
                        capture_output=True
                    )
                    self._log(f"   Resolved {file} (accepted remote)")
                else:
                    # Keep local version for fix files
                    subprocess.run(
                        ["git", "checkout", "--ours", file],
                        cwd=FIXNET_LOCAL,
                        capture_output=True
                    )
                    self._log(f"   Resolved {file} (kept local)")
                
                # Stage the resolved file
                subprocess.run(
                    ["git", "add", file],
                    cwd=FIXNET_LOCAL,
                    capture_output=True
                )
            
            # Complete the merge
            subprocess.run(
                ["git", "commit", "--no-edit"],
                cwd=FIXNET_LOCAL,
                capture_output=True
            )
            
            self._log("✅ Conflicts auto-resolved")
        
        except Exception as e:
            self._log(f"❌ Auto-resolve failed: {str(e)[:200]}")
    
    def _is_quiet_hours(self) -> bool:
        """Check if currently in quiet hours."""
        quiet = self.config.get('quiet_hours', {})
        if not quiet.get('enabled', False):
            return False
        
        now = datetime.now().time()
        start = datetime.strptime(quiet['start'], '%H:%M').time()
        end = datetime.strptime(quiet['end'], '%H:%M').time()
        
        if start < end:
            return start <= now <= end
        else:
            # Crosses midnight
            return now >= start or now <= end
    
    def _log(self, message: str):
        """Log daemon activity."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        
        # Print to console
        print(log_entry)
        
        # Write to log file
        SYNC_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_LOG, 'a') as f:
            f.write(log_entry + '\n')
    
    def _print_stats(self):
        """Print daemon statistics."""
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 FixNet Daemon Statistics{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}Pushes:{RESET} {self.stats['pushes']}")
        print(f"{GOLD}Pulls:{RESET} {self.stats['pulls']}")
        print(f"{GOLD}Conflicts:{RESET} {self.stats['conflicts']}")
        
        if self.stats['last_push']:
            print(f"{GOLD}Last push:{RESET} {self.stats['last_push']}")
        if self.stats['last_pull']:
            print(f"{GOLD}Last pull:{RESET} {self.stats['last_pull']}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")
    
    def get_status(self) -> dict:
        """Get current daemon status."""
        return {
            "running": self.running,
            "config": self.config,
            "stats": self.stats,
            "next_pull": self._get_next_scheduled("pull"),
            "next_push": self._get_next_scheduled("push")
        }
    
    def _get_next_scheduled(self, job_type: str) -> str:
        """Get next scheduled time for job."""
        for job in schedule.jobs:
            if job_type in str(job.job_func):
                return str(job.next_run)
        return "N/A"
    
    def force_sync(self):
        """Force immediate sync (pull + push)."""
        print(f"{BLUE}🔄 Forcing immediate sync...{RESET}")
        self._sync_pull()
        time.sleep(2)
        self._sync_push()
        print(f"{GREEN}✅ Force sync complete{RESET}")
    
    # ========== IDLE MAINTENANCE TASKS ==========
    
    def _autofix_python_files(self):
        """Auto-fix syntax and indentation issues in Python files."""
        self._log("🔧 Running autofix on Python files...")
        
        try:
            # Import autofix module
            import sys
            from pathlib import Path
            core_path = Path(__file__).parent
            if str(core_path) not in sys.path:
                sys.path.insert(0, str(core_path))
            
            from autofix import AutoFixer
            
            # Find all Python files in common directories
            target_dirs = [
                LUCIFER_HOME / "scripts",
                LUCIFER_HOME / "core",
                FIXNET_LOCAL
            ]
            
            fixer = AutoFixer()
            fixed_count = 0
            checked_count = 0
            
            for target_dir in target_dirs:
                if not target_dir.exists():
                    continue
                
                # Find Python files
                py_files = list(target_dir.rglob("*.py"))
                
                for py_file in py_files:
                    checked_count += 1
                    success, message = fixer.fix_file(str(py_file), aggressive=False)
                    
                    if success and "successfully" in message:
                        fixed_count += 1
                        self._log(f"   Fixed: {py_file.name}")
            
            if fixed_count > 0:
                self._log(f"✅ Autofixed {fixed_count}/{checked_count} Python files")
            else:
                self._log(f"✅ Checked {checked_count} files - no fixes needed")
        
        except Exception as e:
            self._log(f"❌ Autofix failed: {str(e)[:200]}")
    
    def _cleanup_dictionary(self):
        """Clean up the dictionary during idle time."""
        self._log("🧹 Starting dictionary cleanup...")
        
        try:
            refs_file = FIXNET_LOCAL / "refs.json"
            if not refs_file.exists():
                self._log("No refs.json found")
                return
            
            with open(refs_file) as f:
                refs = json.load(f)
            
            original_count = len(refs)
            
            # Remove duplicate entries (same fix_hash)
            seen_hashes = set()
            cleaned_refs = []
            duplicates = 0
            
            for ref in refs:
                fix_hash = ref.get('fix_hash')
                if fix_hash not in seen_hashes:
                    seen_hashes.add(fix_hash)
                    cleaned_refs.append(ref)
                else:
                    duplicates += 1
            
            # Remove quarantined fixes older than 30 days
            from datetime import datetime, timedelta
            cutoff_date = datetime.now() - timedelta(days=30)
            
            quarantine_removed = 0
            final_refs = []
            
            for ref in cleaned_refs:
                if ref.get('quarantined'):
                    try:
                        timestamp = datetime.fromisoformat(ref.get('timestamp', ''))
                        if timestamp < cutoff_date:
                            quarantine_removed += 1
                            continue
                    except:
                        pass
                final_refs.append(ref)
            
            # Sort by timestamp (newest first)
            final_refs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            if len(final_refs) < original_count:
                # Save cleaned version
                with open(refs_file, 'w') as f:
                    json.dump(final_refs, f, indent=2)
                
                removed = original_count - len(final_refs)
                self._log(f"✅ Cleaned dictionary: removed {removed} entries")
                self._log(f"   - {duplicates} duplicates")
                self._log(f"   - {quarantine_removed} old quarantined fixes")
                
                # Commit the cleanup
                subprocess.run(
                    ["git", "add", "refs.json"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True
                )
                subprocess.run(
                    ["git", "commit", "-m", f"[Cleanup] Removed {removed} duplicate/old entries"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True
                )
            else:
                self._log("✅ Dictionary clean - no cleanup needed")
        
        except Exception as e:
            self._log(f"❌ Dictionary cleanup failed: {str(e)[:200]}")
    
    def _cleanup_branches(self):
        """Clean up orphaned branches and merge logs."""
        self._log("🌿 Cleaning up branches...")
        
        try:
            if not FIXNET_LOCAL.exists():
                return
            
            # Get list of all branches
            result = subprocess.run(
                ["git", "branch", "-r"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                return
            
            branches = result.stdout.strip().split('\n')
            stale_branches = []
            
            # Check each branch for staleness (no commits in 90 days)
            from datetime import datetime, timedelta
            cutoff_date = datetime.now() - timedelta(days=90)
            
            for branch in branches:
                branch = branch.strip()
                if not branch or '->' in branch or 'master' in branch or 'main' in branch:
                    continue
                
                # Get last commit date
                commit_result = subprocess.run(
                    ["git", "log", "-1", "--format=%ci", branch],
                    cwd=FIXNET_LOCAL,
                    capture_output=True,
                    text=True
                )
                
                if commit_result.returncode == 0 and commit_result.stdout.strip():
                    try:
                        last_commit = datetime.strptime(
                            commit_result.stdout.strip()[:19],
                            '%Y-%m-%d %H:%M:%S'
                        )
                        
                        if last_commit < cutoff_date:
                            stale_branches.append(branch)
                    except:
                        pass
            
            if stale_branches:
                self._log(f"Found {len(stale_branches)} stale branches (>90 days old)")
                # Note: Don't auto-delete remote branches - just log them
                for branch in stale_branches[:5]:  # Show first 5
                    self._log(f"   - {branch}")
            else:
                self._log("✅ No stale branches found")
        
        except Exception as e:
            self._log(f"❌ Branch cleanup failed: {str(e)[:200]}")
    
    def _optimize_repo(self):
        """Optimize the Git repository."""
        self._log("⚡ Optimizing repository...")
        
        try:
            if not FIXNET_LOCAL.exists():
                return
            
            # Git garbage collection
            gc_result = subprocess.run(
                ["git", "gc", "--auto"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if gc_result.returncode == 0:
                self._log("✅ Git GC complete")
            
            # Prune old objects
            prune_result = subprocess.run(
                ["git", "prune"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                timeout=60
            )
            
            if prune_result.returncode == 0:
                self._log("✅ Pruned old objects")
            
            # Get repo size
            size_result = subprocess.run(
                ["du", "-sh", str(FIXNET_LOCAL)],
                capture_output=True,
                text=True
            )
            
            if size_result.returncode == 0:
                size = size_result.stdout.split()[0]
                self._log(f"📦 Repository size: {size}")
            
            # Check for large files
            large_files = subprocess.run(
                ["find", str(FIXNET_LOCAL), "-type", "f", "-size", "+1M"],
                capture_output=True,
                text=True
            )
            
            if large_files.stdout.strip():
                files = large_files.stdout.strip().split('\n')
                self._log(f"⚠️  Found {len(files)} files >1MB")
        
        except subprocess.TimeoutExpired:
            self._log("❌ Optimization timeout")
        except Exception as e:
            self._log(f"❌ Optimization failed: {str(e)[:200]}")
    
    def _organize_user_fixes(self):
        """Organize fixes by user and quality - create user branches."""
        self._log("📂 Organizing user fixes...")
        
        try:
            refs_file = FIXNET_LOCAL / "refs.json"
            if not refs_file.exists():
                return
            
            with open(refs_file) as f:
                refs = json.load(f)
            
            # Group fixes by user
            user_fixes = {}
            for ref in refs:
                user_id = ref.get('user_id', 'unknown')
                if user_id not in user_fixes:
                    user_fixes[user_id] = []
                user_fixes[user_id].append(ref)
            
            self._log(f"Found fixes from {len(user_fixes)} users")
            
            # Analyze each user's fixes
            high_quality_users = []
            low_quality_users = []
            
            for user_id, fixes in user_fixes.items():
                if len(fixes) < 3:
                    continue  # Need at least 3 fixes to evaluate
                
                # Calculate user quality score
                total_attempts = 0
                total_successes = 0
                spam_reports = 0
                
                for fix in fixes:
                    if fix.get('quarantined'):
                        spam_reports += 1
                    
                    usage = fix.get('usage_stats', {})
                    total_attempts += usage.get('attempts', 0)
                    total_successes += usage.get('successes', 0)
                
                if total_attempts > 0:
                    success_rate = total_successes / total_attempts
                    
                    # High quality: >70% success, <5% spam
                    spam_rate = spam_reports / len(fixes)
                    
                    if success_rate > 0.7 and spam_rate < 0.05:
                        high_quality_users.append((user_id, success_rate, len(fixes)))
                    elif success_rate < 0.3 or spam_rate > 0.2:
                        low_quality_users.append((user_id, success_rate, len(fixes)))
            
            if high_quality_users:
                self._log(f"✅ {len(high_quality_users)} high-quality contributors:")
                for user_id, rate, count in high_quality_users[:5]:
                    self._log(f"   • {user_id[:8]}: {rate:.1%} success ({count} fixes)")
            
            if low_quality_users:
                self._log(f"⚠️  {len(low_quality_users)} low-quality contributors")
                # Flag for review
                self._flag_low_quality_users(low_quality_users)
        
        except Exception as e:
            self._log(f"❌ Organization failed: {str(e)[:200]}")
    
    def _flag_low_quality_users(self, users):
        """Flag low-quality users for potential cleanup."""
        flag_file = FIXNET_LOCAL / "flagged_users.json"
        
        flagged = []
        for user_id, rate, count in users:
            flagged.append({
                "user_id": user_id,
                "success_rate": rate,
                "fix_count": count,
                "flagged_at": datetime.now().isoformat(),
                "action": "review_needed"
            })
        
        with open(flag_file, 'w') as f:
            json.dump(flagged, f, indent=2)
        
        self._log(f"📝 Flagged {len(flagged)} users for review")
    
    def _merge_similar_fixes(self):
        """Merge duplicate/similar fixes to reduce clutter."""
        self._log("🔀 Merging similar fixes...")
        
        try:
            refs_file = FIXNET_LOCAL / "refs.json"
            if not refs_file.exists():
                return
            
            with open(refs_file) as f:
                refs = json.load(f)
            
            # Group by error signature
            error_groups = {}
            for ref in refs:
                error_sig = self._normalize_error(ref.get('error_signature', ''))
                if error_sig not in error_groups:
                    error_groups[error_sig] = []
                error_groups[error_sig].append(ref)
            
            merged_count = 0
            final_refs = []
            
            for error_sig, fixes in error_groups.items():
                if len(fixes) <= 1:
                    final_refs.extend(fixes)
                    continue
                
                # Keep only the best fix for each error
                best_fix = self._find_best_fix(fixes)
                
                # Mark others as merged
                for fix in fixes:
                    if fix['fix_hash'] == best_fix['fix_hash']:
                        # Keep the best one
                        if 'merged_from' not in best_fix:
                            best_fix['merged_from'] = []
                        final_refs.append(best_fix)
                    else:
                        # Record that this was merged
                        best_fix['merged_from'].append({
                            'fix_hash': fix['fix_hash'],
                            'user_id': fix['user_id'],
                            'merged_at': datetime.now().isoformat()
                        })
                        merged_count += 1
            
            if merged_count > 0:
                # Save merged version
                with open(refs_file, 'w') as f:
                    json.dump(final_refs, f, indent=2)
                
                self._log(f"✅ Merged {merged_count} duplicate fixes")
                
                # Commit the merge
                subprocess.run(
                    ["git", "add", "refs.json"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True
                )
                subprocess.run(
                    ["git", "commit", "-m", f"[Merge] Combined {merged_count} similar fixes"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True
                )
            else:
                self._log("✅ No similar fixes to merge")
        
        except Exception as e:
            self._log(f"❌ Merge failed: {str(e)[:200]}")
    
    def _find_best_fix(self, fixes):
        """Find the best fix among similar ones."""
        # Score each fix
        best_fix = None
        best_score = -1
        
        for fix in fixes:
            score = 0
            
            # Success rate
            usage = fix.get('usage_stats', {})
            attempts = usage.get('attempts', 0)
            successes = usage.get('successes', 0)
            
            if attempts > 0:
                score += (successes / attempts) * 0.5  # 50% weight
            
            # Usage count (popularity)
            score += min(attempts / 10, 1.0) * 0.2  # 20% weight
            
            # Recency
            try:
                timestamp = datetime.fromisoformat(fix.get('timestamp', ''))
                days_old = (datetime.now() - timestamp).days
                recency = max(0, 1 - (days_old / 365))
                score += recency * 0.2  # 20% weight
            except:
                pass
            
            # Not quarantined
            if not fix.get('quarantined'):
                score += 0.1  # 10% bonus
            
            if score > best_score:
                best_score = score
                best_fix = fix
        
        return best_fix
    
    def _normalize_error(self, error: str) -> str:
        """Normalize error message for comparison."""
        import re
        normalized = error.lower()
        
        # Remove line numbers
        normalized = re.sub(r'line \d+', 'line N', normalized)
        normalized = re.sub(r'\d+', 'N', normalized)
        
        # Remove file paths
        normalized = re.sub(r'/[^\s]+', '/path', normalized)
        
        # Remove specific variable names
        normalized = re.sub(r"'[^']+' is not defined", "'VAR' is not defined", normalized)
        normalized = re.sub(r"'[^']+' has no attribute", "'OBJ' has no attribute", normalized)
        
        return normalized.strip()[:200]


# CLI for managing daemon
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "start":
            daemon = FixNetDaemon()
            print(f"\n{GREEN}Daemon running in foreground. Press Ctrl+C to stop.{RESET}\n")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                daemon.stop()
        
        elif command == "config":
            daemon = FixNetDaemon(auto_start=False)
            print(f"\n{PURPLE}Current Configuration:{RESET}\n")
            print(json.dumps(daemon.config, indent=2))
        
        elif command == "status":
            daemon = FixNetDaemon(auto_start=False)
            status = daemon.get_status()
            print(f"\n{PURPLE}Daemon Status:{RESET}")
            print(f"  Running: {status['running']}")
            print(f"  Pushes: {status['stats']['pushes']}")
            print(f"  Pulls: {status['stats']['pulls']}")
        
        elif command == "sync":
            daemon = FixNetDaemon(auto_start=False)
            daemon.force_sync()
        
        elif command == "help":
            print(f"""
{PURPLE}FixNet Daemon - Auto-sync fixes between local and GitHub{RESET}

Usage: python3 fixnet_daemon.py [command]

Commands:
  start    Start daemon in foreground
  stop     Stop running daemon
  status   Show daemon status
  config   Show current configuration
  sync     Force immediate sync
  help     Show this help

Configuration file: {DAEMON_CONFIG}
Log file: {SYNC_LOG}
""")
        else:
            print(f"{RED}Unknown command: {command}{RESET}")
            print(f"Run 'python3 fixnet_daemon.py help' for usage")
    else:
        # Default: start daemon
        daemon = FixNetDaemon()
        print(f"\n{GREEN}Daemon running. Press Ctrl+C to stop.{RESET}\n")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            daemon.stop()
