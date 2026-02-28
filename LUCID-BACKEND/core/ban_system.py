#!/usr/bin/env python3
"""
🚫 FixNet Ban System - 3-Strike Progressive Penalties
Protects against hackers, spammers, and data leaks
"""
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"
BAN_LIST_FILE = LUCIFER_HOME / "data" / "ban_list.json"
RATE_LIMIT_FILE = LUCIFER_HOME / "data" / "rate_limits.json"


class BanSystem:
    """
    3-Strike Progressive Ban System
    
    Strike 1: Warning + 24h temp ban
    Strike 2: Warning + 7 day temp ban  
    Strike 3: Permanent ban
    
    Violations:
    - Mass uploading (>20 fixes/hour)
    - Malicious code (dangerous commands)
    - Spam/duplicate flooding
    - Low quality fixes (<20% success)
    - Data leak attempts
    """
    
    def __init__(self):
        self.ban_list = self._load_ban_list()
        self.rate_limits = self._load_rate_limits()
    
    def _load_ban_list(self) -> Dict[str, Any]:
        """Load ban list."""
        if BAN_LIST_FILE.exists():
            with open(BAN_LIST_FILE) as f:
                return json.load(f)
        return {}
    
    def _save_ban_list(self):
        """Save ban list."""
        BAN_LIST_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(BAN_LIST_FILE, 'w') as f:
            json.dump(self.ban_list, f, indent=2)
    
    def _load_rate_limits(self) -> Dict[str, List]:
        """Load rate limit tracking."""
        if RATE_LIMIT_FILE.exists():
            with open(RATE_LIMIT_FILE) as f:
                return json.load(f)
        return {}
    
    def _save_rate_limits(self):
        """Save rate limit tracking."""
        RATE_LIMIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RATE_LIMIT_FILE, 'w') as f:
            json.dump(self.rate_limits, f, indent=2)
    
    def check_user_banned(self, user_id: str) -> tuple[bool, Optional[str]]:
        """
        Check if user is banned.
        
        Returns:
            (is_banned: bool, reason: str)
        """
        if user_id not in self.ban_list:
            return (False, None)
        
        ban_info = self.ban_list[user_id]
        
        # Check if permanently banned
        if ban_info.get('permanent_ban'):
            return (
                True,
                f"{RED}🚫 PERMANENTLY BANNED{RESET}\n"
                f"Reason: {ban_info['reason']}\n"
                f"Date: {ban_info['banned_at']}\n"
                f"Strikes: {ban_info['strikes']}/3"
            )
        
        # Check if temp ban expired
        if ban_info.get('temp_ban_until'):
            ban_until = datetime.fromisoformat(ban_info['temp_ban_until'])
            if datetime.now() < ban_until:
                remaining = ban_until - datetime.now()
                days = remaining.days
                hours = remaining.seconds // 3600
                
                return (
                    True,
                    f"{GOLD}⏱️  TEMPORARILY BANNED{RESET}\n"
                    f"Time remaining: {days}d {hours}h\n"
                    f"Reason: {ban_info['reason']}\n"
                    f"Strikes: {ban_info['strikes']}/3"
                )
            else:
                # Ban expired - clear temp ban
                ban_info.pop('temp_ban_until', None)
                self._save_ban_list()
                print(f"{GREEN}✅ Temp ban expired for {user_id[:8]}{RESET}")
                return (False, None)
        
        return (False, None)
    
    def issue_strike(self, user_id: str, violation: str, details: Dict[str, Any] = None):
        """
        Issue a strike to a user.
        
        Strike 1: 24h ban
        Strike 2: 7 day ban
        Strike 3: Permanent ban
        """
        if user_id not in self.ban_list:
            self.ban_list[user_id] = {
                "strikes": 0,
                "violations": [],
                "permanent_ban": False
            }
        
        ban_info = self.ban_list[user_id]
        ban_info['strikes'] += 1
        
        # Record violation
        ban_info['violations'].append({
            "type": violation,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        })
        
        strikes = ban_info['strikes']
        
        print(f"\n{RED}{'='*60}{RESET}")
        print(f"{RED}⚠️  STRIKE ISSUED: {user_id[:8]}{RESET}")
        print(f"{RED}{'='*60}{RESET}\n")
        print(f"{GOLD}Violation:{RESET} {violation}")
        print(f"{GOLD}Strike:{RESET} {strikes}/3")
        
        if strikes == 1:
            # Strike 1: 24h ban
            ban_until = datetime.now() + timedelta(hours=24)
            ban_info['temp_ban_until'] = ban_until.isoformat()
            ban_info['reason'] = f"Strike 1: {violation}"
            
            print(f"{GOLD}Penalty:{RESET} 24-hour temporary ban")
            print(f"{GOLD}Ban expires:{RESET} {ban_until.strftime('%Y-%m-%d %H:%M')}")
            print(f"\n{BLUE}💡 This is your first warning. Future violations will result in longer bans.{RESET}")
        
        elif strikes == 2:
            # Strike 2: 7 day ban
            ban_until = datetime.now() + timedelta(days=7)
            ban_info['temp_ban_until'] = ban_until.isoformat()
            ban_info['reason'] = f"Strike 2: {violation}"
            
            print(f"{GOLD}Penalty:{RESET} 7-day temporary ban")
            print(f"{GOLD}Ban expires:{RESET} {ban_until.strftime('%Y-%m-%d %H:%M')}")
            print(f"\n{RED}⚠️  FINAL WARNING: One more strike = permanent ban{RESET}")
        
        elif strikes >= 3:
            # Strike 3: Permanent ban
            ban_info['permanent_ban'] = True
            ban_info['banned_at'] = datetime.now().isoformat()
            ban_info['reason'] = f"Strike 3: {violation}"
            ban_info.pop('temp_ban_until', None)  # Remove temp ban
            
            print(f"{RED}Penalty:{RESET} PERMANENT BAN")
            print(f"\n{RED}🚫 User permanently banned from FixNet{RESET}")
            print(f"{RED}All fixes from this user will be quarantined{RESET}")
        
        print(f"\n{RED}{'='*60}{RESET}\n")
        
        self._save_ban_list()
        
        # Log to ban history
        self._log_ban_action(user_id, strikes, violation)
    
    def check_rate_limit(self, user_id: str) -> tuple[bool, Optional[str]]:
        """
        Check if user is mass uploading.
        
        Limits:
        - Max 20 fixes per hour
        - Max 100 fixes per day
        
        Returns:
            (is_violating: bool, reason: str)
        """
        now = datetime.now()
        
        if user_id not in self.rate_limits:
            self.rate_limits[user_id] = []
        
        # Get recent uploads
        uploads = [
            datetime.fromisoformat(ts)
            for ts in self.rate_limits[user_id]
            if datetime.fromisoformat(ts) > now - timedelta(days=1)
        ]
        
        # Clean old entries
        self.rate_limits[user_id] = [ts.isoformat() for ts in uploads]
        
        # Count in last hour
        hour_ago = now - timedelta(hours=1)
        last_hour = [ts for ts in uploads if ts > hour_ago]
        
        if len(last_hour) >= 20:
            return (
                True,
                f"Mass uploading: {len(last_hour)} fixes in last hour (limit: 20)"
            )
        
        if len(uploads) >= 100:
            return (
                True,
                f"Daily limit exceeded: {len(uploads)} fixes today (limit: 100)"
            )
        
        return (False, None)
    
    def record_upload(self, user_id: str):
        """Record an upload timestamp for rate limiting."""
        if user_id not in self.rate_limits:
            self.rate_limits[user_id] = []
        
        self.rate_limits[user_id].append(datetime.now().isoformat())
        self._save_rate_limits()
    
    def check_malicious_content(self, solution: str) -> tuple[bool, Optional[str]]:
        """
        Check if fix contains malicious code.
        
        Returns:
            (is_malicious: bool, reason: str)
        """
        solution_lower = solution.lower()
        
        # Critical dangerous patterns (instant strike)
        critical_patterns = [
            ("rm -rf /", "System destruction attempt"),
            ("rm -rf ~", "Home directory destruction"),
            (":(){ :|:& };:", "Fork bomb"),
            ("mkfs", "Filesystem format attempt"),
            ("> /dev/sda", "Disk overwrite attempt"),
            ("dd if=/dev/zero of=/dev/", "Disk wipe attempt"),
        ]
        
        for pattern, reason in critical_patterns:
            if pattern in solution_lower:
                return (True, f"CRITICAL: {reason}")
        
        # Data leak patterns
        leak_patterns = [
            "cat /etc/passwd",
            "cat /etc/shadow",
            "cat ~/.ssh/",
            "curl http://",  # Suspicious outbound
            "wget http://",
            "/dev/tcp/",
            "nc -l",
            "ncat",
        ]
        
        leak_count = sum(1 for p in leak_patterns if p in solution_lower)
        if leak_count >= 2:
            return (True, "Potential data leak attempt")
        
        # Obfuscation (trying to hide malicious code)
        obfuscation = [
            "base64 -d",
            "eval(",
            "exec(",
            "__import__('os').system",
            "subprocess.Popen",
        ]
        
        obf_count = sum(1 for p in obfuscation if p in solution_lower)
        if obf_count >= 2:
            return (True, "Obfuscated/hidden code execution")
        
        return (False, None)
    
    def validate_upload(self, user_id: str, solution: str, fix_quality: float) -> tuple[bool, Optional[str]]:
        """
        Comprehensive upload validation.
        
        Returns:
            (is_allowed: bool, reason: str)
        """
        # Check 1: Is user banned?
        is_banned, ban_reason = self.check_user_banned(user_id)
        if is_banned:
            return (False, ban_reason)
        
        # Check 2: Rate limiting
        is_rate_limited, rate_reason = self.check_rate_limit(user_id)
        if is_rate_limited:
            self.issue_strike(user_id, "Rate Limit Violation", {
                "reason": rate_reason
            })
            return (False, f"{RED}❌ {rate_reason}{RESET}")
        
        # Check 3: Malicious content
        is_malicious, mal_reason = self.check_malicious_content(solution)
        if is_malicious:
            self.issue_strike(user_id, "Malicious Code", {
                "reason": mal_reason,
                "solution_preview": solution[:200]
            })
            return (False, f"{RED}🚫 {mal_reason}{RESET}")
        
        # Check 4: Low quality spam (if quality data available)
        if fix_quality is not None and fix_quality < 0.2:
            # Track low quality fixes
            if not hasattr(self, '_low_quality_count'):
                self._low_quality_count = {}
            
            self._low_quality_count[user_id] = self._low_quality_count.get(user_id, 0) + 1
            
            if self._low_quality_count[user_id] >= 10:
                self.issue_strike(user_id, "Low Quality Spam", {
                    "reason": f"{self._low_quality_count[user_id]} fixes with <20% success rate"
                })
                return (False, f"{RED}❌ Too many low-quality fixes{RESET}")
        
        # All checks passed
        self.record_upload(user_id)
        return (True, None)
    
    def _log_ban_action(self, user_id: str, strikes: int, violation: str):
        """Log ban action to file."""
        log_file = LUCIFER_HOME / "logs" / "ban_log.txt"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] Strike {strikes}/3 - {user_id[:8]}: {violation}\n"
        
        with open(log_file, 'a') as f:
            f.write(log_entry)
    
    def get_ban_statistics(self) -> Dict[str, Any]:
        """Get ban system statistics."""
        stats = {
            "total_users_tracked": len(self.ban_list),
            "users_with_strikes": sum(1 for u in self.ban_list.values() if u['strikes'] > 0),
            "strike_1_users": sum(1 for u in self.ban_list.values() if u['strikes'] == 1),
            "strike_2_users": sum(1 for u in self.ban_list.values() if u['strikes'] == 2),
            "permanently_banned": sum(1 for u in self.ban_list.values() if u.get('permanent_ban')),
            "currently_temp_banned": 0
        }
        
        # Count current temp bans
        now = datetime.now()
        for user_info in self.ban_list.values():
            if user_info.get('temp_ban_until'):
                ban_until = datetime.fromisoformat(user_info['temp_ban_until'])
                if now < ban_until:
                    stats['currently_temp_banned'] += 1
        
        return stats
    
    def print_statistics(self):
        """Print ban system statistics."""
        stats = self.get_ban_statistics()
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}🚫 Ban System Statistics{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}Total users tracked:{RESET} {stats['total_users_tracked']}")
        print(f"{GOLD}Users with strikes:{RESET} {stats['users_with_strikes']}")
        print(f"  {BLUE}Strike 1:{RESET} {stats['strike_1_users']}")
        print(f"  {GOLD}Strike 2:{RESET} {stats['strike_2_users']}")
        print(f"  {RED}Permanently banned:{RESET} {stats['permanently_banned']}")
        print(f"{GOLD}Currently temp banned:{RESET} {stats['currently_temp_banned']}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")


# Test
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing Ban System{RESET}\n")
    
    ban_sys = BanSystem()
    
    # Test 1: Normal upload
    print(f"{GOLD}Test 1: Normal upload{RESET}")
    allowed, reason = ban_sys.validate_upload("test_user", "import json", 0.8)
    print(f"Allowed: {allowed}\n")
    
    # Test 2: Malicious code
    print(f"{GOLD}Test 2: Malicious code{RESET}")
    allowed, reason = ban_sys.validate_upload("hacker_user", "rm -rf /", None)
    print(f"Allowed: {allowed}")
    print(f"Reason: {reason}\n")
    
    # Test 3: Rate limit
    print(f"{GOLD}Test 3: Rate limit (mass upload){RESET}")
    for i in range(25):
        ban_sys.record_upload("spammer_user")
    allowed, reason = ban_sys.check_rate_limit("spammer_user")
    print(f"Rate limited: {allowed}")
    print(f"Reason: {reason}\n")
    
    # Test 4: Check banned user
    print(f"{GOLD}Test 4: Check banned user{RESET}")
    is_banned, reason = ban_sys.check_user_banned("hacker_user")
    print(f"Banned: {is_banned}")
    if reason:
        print(reason)
    
    # Stats
    ban_sys.print_statistics()
    
    print(f"\n{GREEN}✨ Ban system tests complete{RESET}")
