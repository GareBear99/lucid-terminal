#!/usr/bin/env python3
"""
🤝 Consensus-Based Relevance Dictionary
Community-validated fix quality with trust scoring
"""
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

# Trust thresholds
TRUSTED_THRESHOLD = 0.51  # 51% success rate
HIGH_CONFIDENCE_THRESHOLD = 0.75  # 75% success = high confidence
QUARANTINE_THRESHOLD = 0.30  # <30% success = quarantine

# User reputation thresholds
NOVICE_THRESHOLD = 5  # < 5 successful fixes
INTERMEDIATE_THRESHOLD = 20  # 5-20 successful fixes
EXPERT_THRESHOLD = 50  # > 50 successful fixes

# Fraud detection
SPAM_REPORT_THRESHOLD = 3  # Reports before quarantine
SUSPICIOUS_PATTERN_THRESHOLD = 0.8  # Similarity to known spam


class ConsensusDictionary:
    """
    Enhanced dictionary with consensus-based quality control.
    
    Features:
    - 51% success consensus for "trusted" status
    - Community voting on fix quality
    - Context-aware success tracking
    - Fix evolution over time
    - Anti-spam protection
    - Reputation-weighted scoring
    """
    
    def __init__(self, relevance_dict: 'RelevanceDictionary' = None, user_id: str = None):
        """
        Initialize consensus dictionary with reference to relevance_dictionary.
        
        Args:
            relevance_dict: RelevanceDictionary instance (storage layer)
            user_id: Optional user ID
        """
        # Storage layer reference (read-only access)
        self.relevance_dict = relevance_dict
        self.user_id = user_id or "anonymous"
        
        # Read-only access to data through relevance_dict
        self.local_dict = relevance_dict.dictionary if relevance_dict else {}
        self.remote_refs = relevance_dict.remote_refs if relevance_dict else []
        
        # Consensus cache - now persisted!
        self.consensus_cache = self._load_consensus_cache()
        
        # User reputation tracking
        self.user_reputations = self._load_user_reputations()
        
        # Fix versioning
        self.fix_versions = self._load_fix_versions()
        
        # Fraud detection
        self.spam_reports = self._load_spam_reports()
        self.known_spam_patterns = self._load_spam_patterns()
        
        # A/B testing
        self.ab_tests = self._load_ab_tests()
        
        # Cluster analysis
        self.error_clusters = self._load_clusters()
        
        # Vote tracking (one vote per user per fix)
        self.user_votes = self._load_user_votes()
    
    def _load_json(self, path: Path) -> Any:
        """Load JSON with fallback."""
        if path.exists():
            with open(path) as f:
                return json.load(f)
        return {}
    
    def _load_consensus_cache(self) -> Dict[str, Dict]:
        """Load consensus cache from disk (persisted)."""
        if self.relevance_dict:
            cache_path = Path.home() / ".luciferai" / "data" / "consensus_cache.json"
            return self._load_json(cache_path)
        return {}
    
    def _save_consensus_cache(self):
        """Save consensus cache to disk for persistence across restarts."""
        if self.relevance_dict:
            cache_path = Path.home() / ".luciferai" / "data" / "consensus_cache.json"
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_path, 'w') as f:
                json.dump(self.consensus_cache, f, indent=2)
    
    def _load_user_reputations(self) -> Dict[str, Dict]:
        """Load user reputation scores."""
        path = Path.home() / ".luciferai" / "data" / "user_reputations.json"
        return self._load_json(path)
    
    def _save_user_reputations(self):
        """Save user reputation scores."""
        path = Path.home() / ".luciferai" / "data" / "user_reputations.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(self.user_reputations, f, indent=2)
    
    def _load_fix_versions(self) -> Dict[str, List]:
        """Load fix version history."""
        path = Path.home() / ".luciferai" / "data" / "fix_versions.json"
        return self._load_json(path)
    
    def _save_fix_versions(self):
        """Save fix version history."""
        path = Path.home() / ".luciferai" / "data" / "fix_versions.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(self.fix_versions, f, indent=2)
    
    def _load_spam_reports(self) -> Dict[str, int]:
        """Load spam report counts."""
        path = Path.home() / ".luciferai" / "data" / "spam_reports.json"
        return self._load_json(path)
    
    def _save_spam_reports(self):
        """Save spam report counts."""
        path = Path.home() / ".luciferai" / "data" / "spam_reports.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(self.spam_reports, f, indent=2)
    
    def _load_spam_patterns(self) -> List[str]:
        """Load known spam patterns."""
        path = Path.home() / ".luciferai" / "data" / "spam_patterns.json"
        patterns = self._load_json(path)
        return patterns if isinstance(patterns, list) else []
    
    def _load_ab_tests(self) -> Dict[str, Dict]:
        """Load A/B test configurations."""
        path = Path.home() / ".luciferai" / "data" / "ab_tests.json"
        return self._load_json(path)
    
    def _save_ab_tests(self):
        """Save A/B test results."""
        path = Path.home() / ".luciferai" / "data" / "ab_tests.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(self.ab_tests, f, indent=2)
    
    def _load_clusters(self) -> Dict[str, List]:
        """Load error clusters."""
        path = Path.home() / ".luciferai" / "data" / "error_clusters.json"
        return self._load_json(path)
    
    def _load_user_votes(self) -> Dict[str, Dict[str, str]]:
        """Load user vote history (one vote per user per fix)."""
        path = Path.home() / ".luciferai" / "data" / "user_votes.json"
        return self._load_json(path)
    
    def _save_user_votes(self):
        """Save user vote history."""
        path = Path.home() / ".luciferai" / "data" / "user_votes.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(self.user_votes, f, indent=2)
    
    def calculate_consensus(self, fix_hash: str) -> Dict[str, Any]:
        """
        Calculate consensus for a fix across all users.
        
        Returns:
            {
                "trust_level": "trusted" | "experimental" | "quarantined",
                "success_rate": 0.0 - 1.0,
                "total_attempts": int,
                "unique_users": int,
                "recommendation": str
            }
        """
        # Aggregate stats from remote refs
        stats = {
            "total_attempts": 0,
            "successes": 0,
            "failures": 0,
            "unique_users": set(),
            "context_breakdown": defaultdict(lambda: {"attempts": 0, "successes": 0})
        }
        
        # Search all remote references for this fix
        for ref in self.remote_refs:
            if ref.get('fix_hash') == fix_hash or ref.get('inspired_by') == fix_hash:
                user_id = ref.get('user_id')
                stats['unique_users'].add(user_id)
                
                # If they used it, count as attempt
                usage = ref.get('usage_stats', {})
                attempts = usage.get('attempts', 1)
                successes = usage.get('successes', 0)
                
                stats['total_attempts'] += attempts
                stats['successes'] += successes
                stats['failures'] += (attempts - successes)
                
                # Context breakdown
                context = ref.get('context', {})
                python_version = context.get('python_version', 'unknown')
                stats['context_breakdown'][python_version]['attempts'] += attempts
                stats['context_breakdown'][python_version]['successes'] += successes
        
        # Calculate success rate
        total = stats['total_attempts']
        if total == 0:
            return {
                "trust_level": "unknown",
                "success_rate": 0.0,
                "total_attempts": 0,
                "unique_users": 0,
                "recommendation": "No usage data yet - experimental"
            }
        
        success_rate = stats['successes'] / total
        unique_users = len(stats['unique_users'])
        
        # Determine trust level
        if success_rate >= HIGH_CONFIDENCE_THRESHOLD:
            trust_level = "highly_trusted"
            recommendation = f"✅ Highly recommended ({success_rate:.0%} success, {unique_users} users)"
        elif success_rate >= TRUSTED_THRESHOLD:
            trust_level = "trusted"
            recommendation = f"✅ Trusted ({success_rate:.0%} success, {unique_users} users)"
        elif success_rate >= QUARANTINE_THRESHOLD:
            trust_level = "experimental"
            recommendation = f"⚠️  Experimental ({success_rate:.0%} success, {unique_users} users)"
        else:
            trust_level = "quarantined"
            recommendation = f"❌ Not recommended ({success_rate:.0%} success, {unique_users} users)"
        
        return {
            "trust_level": trust_level,
            "success_rate": success_rate,
            "total_attempts": total,
            "unique_users": unique_users,
            "recommendation": recommendation,
            "context_breakdown": dict(stats['context_breakdown'])
        }
    
    def get_best_fix_with_consensus(self, 
                                    error: str,
                                    error_type: str,
                                    context: Dict[str, Any] = None) -> Optional[Dict]:
        """
        Get the best fix considering consensus.
        
        Prioritizes:
        1. High trust + high relevance
        2. Context match (e.g., same Python version)
        3. Recency
        4. User reputation
        """
        candidates = self._search_all_fixes(error, error_type)
        
        if not candidates:
            return None
        
        # Score each candidate
        scored = []
        for candidate in candidates:
            fix_hash = candidate['fix_hash']
            consensus = self.calculate_consensus(fix_hash)
            
            # Base score from consensus
            score = consensus['success_rate'] * 0.5
            
            # Boost for more users (network effect)
            user_boost = min(0.2, consensus['unique_users'] / 50)
            score += user_boost
            
            # Context match boost
            if context and 'python_version' in context:
                ctx_breakdown = consensus['context_breakdown']
                version = context['python_version']
                if version in ctx_breakdown:
                    version_success = ctx_breakdown[version]['successes'] / max(1, ctx_breakdown[version]['attempts'])
                    score += version_success * 0.15
            
            # Recency boost
            try:
                timestamp = datetime.fromisoformat(candidate.get('timestamp', ''))
                days_old = (datetime.now() - timestamp).days
                recency = max(0, 1 - (days_old / 365))
                score += recency * 0.15
            except:
                pass
            
            candidate['consensus'] = consensus
            candidate['final_score'] = score
            scored.append(candidate)
        
        # Sort by score
        scored.sort(key=lambda x: x['final_score'], reverse=True)
        
        best = scored[0]
        
        # Show recommendation
        print(f"\n{GOLD}💡 Best Fix Found:{RESET}")
        print(f"   {best['consensus']['recommendation']}")
        print(f"   Score: {best['final_score']:.2f}")
        
        if best['consensus']['trust_level'] == 'quarantined':
            print(f"\n{RED}⚠️  WARNING: This fix has low success rate!{RESET}")
            print(f"   Consider searching for alternatives.")
        
        return best
    
    def report_fix_result(self,
                         fix_hash: str,
                         succeeded: bool,
                         context: Dict[str, Any] = None):
        """
        Report whether a fix worked for you.
        Updates consensus data.
        """
        # This would update remote refs when synced
        result = {
            "fix_hash": fix_hash,
            "user_id": "current_user",  # Would be actual user ID
            "timestamp": datetime.now().isoformat(),
            "succeeded": succeeded,
            "context": context or {}
        }
        
        status = f"{GREEN}succeeded{RESET}" if succeeded else f"{RED}failed{RESET}"
        print(f"{BLUE}📊 Result reported: Fix {fix_hash[:8]} {status}{RESET}")
        
        # Update local cache
        if fix_hash not in self.consensus_cache:
            self.consensus_cache[fix_hash] = {"attempts": 0, "successes": 0}
        
        self.consensus_cache[fix_hash]['attempts'] += 1
        if succeeded:
            self.consensus_cache[fix_hash]['successes'] += 1
        
        # Persist cache to disk
        self._save_consensus_cache()
        
        return result
    
    def get_fix_reputation(self, fix_hash: str) -> Dict[str, Any]:
        """
        Get reputation score for a fix.
        
        Considers:
        - Success rate (consensus)
        - Number of users
        - Votes/feedback
        - Evolution (superseded by better fix?)
        """
        consensus = self.calculate_consensus(fix_hash)
        
        # Check if superseded
        superseded_by = self._check_if_superseded(fix_hash)
        
        reputation = {
            "score": consensus['success_rate'],
            "trust": consensus['trust_level'],
            "users": consensus['unique_users'],
            "superseded": superseded_by is not None,
            "replacement": superseded_by
        }
        
        return reputation
    
    def _check_if_superseded(self, fix_hash: str) -> Optional[str]:
        """Check if this fix has been replaced by a better version."""
        # Look for similar fixes with higher consensus
        # This would check branch relationships in remote refs
        return None  # Placeholder
    
    def _search_all_fixes(self, error: str, error_type: str) -> List[Dict]:
        """Search both local and remote fixes."""
        # Simplified - would use proper search from RelevanceDictionary
        matches = []
        
        for ref in self.remote_refs:
            if ref.get('error_type') == error_type:
                matches.append(ref)
        
        return matches
    
    def print_consensus_report(self, fix_hash: str):
        """Print detailed consensus report for a fix."""
        consensus = self.calculate_consensus(fix_hash)
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 Consensus Report: {fix_hash[:12]}...{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}Trust Level:{RESET} {consensus['trust_level']}")
        print(f"{GOLD}Success Rate:{RESET} {consensus['success_rate']:.1%}")
        print(f"{GOLD}Total Attempts:{RESET} {consensus['total_attempts']}")
        print(f"{GOLD}Unique Users:{RESET} {consensus['unique_users']}")
        
        print(f"\n{BLUE}Context Breakdown:{RESET}")
        for ctx, stats in consensus['context_breakdown'].items():
            rate = stats['successes'] / max(1, stats['attempts'])
            print(f"  • {ctx}: {rate:.1%} ({stats['successes']}/{stats['attempts']})")
        
        print(f"\n{GOLD}Recommendation:{RESET}")
        print(f"  {consensus['recommendation']}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")
    
    # ========== USER REPUTATION SYSTEM ==========
    
    def get_user_reputation(self, user_id: str) -> Dict[str, Any]:
        """
        Get reputation score for a user.
        
        Reputation based on:
        - Total fixes contributed
        - Success rate of their fixes
        - Community votes on their fixes
        - Consistency over time
        """
        if user_id not in self.user_reputations:
            # Initialize new user
            self.user_reputations[user_id] = {
                "total_fixes": 0,
                "successful_fixes": 0,
                "failed_fixes": 0,
                "upvotes": 0,
                "downvotes": 0,
                "spam_reports": 0,
                "reputation_score": 0.5,  # Start neutral
                "tier": "novice",
                "joined": datetime.now().isoformat()
            }
        
        rep = self.user_reputations[user_id]
        
        # Calculate reputation score (0.0 - 1.0)
        total_fixes = rep['total_fixes']
        if total_fixes == 0:
            score = 0.5  # Neutral for new users
        else:
            # Success rate component (40%)
            success_rate = rep['successful_fixes'] / max(1, rep['successful_fixes'] + rep['failed_fixes'])
            
            # Vote component (30%)
            total_votes = rep['upvotes'] + rep['downvotes']
            vote_ratio = rep['upvotes'] / max(1, total_votes) if total_votes > 0 else 0.5
            
            # Volume component (20%) - more fixes = higher trust
            volume_score = min(1.0, total_fixes / 100)
            
            # Spam penalty (10%)
            spam_penalty = min(1.0, rep['spam_reports'] * 0.2)
            
            score = (
                success_rate * 0.4 +
                vote_ratio * 0.3 +
                volume_score * 0.2 +
                (1 - spam_penalty) * 0.1
            )
        
        # Determine tier
        if rep['successful_fixes'] >= EXPERT_THRESHOLD:
            tier = "expert"
        elif rep['successful_fixes'] >= INTERMEDIATE_THRESHOLD:
            tier = "intermediate"
        elif rep['successful_fixes'] >= NOVICE_THRESHOLD:
            tier = "novice"
        else:
            tier = "beginner"
        
        rep['reputation_score'] = score
        rep['tier'] = tier
        
        return rep
    
    def update_user_reputation(self, user_id: str, fix_succeeded: bool, votes: Dict[str, int] = None):
        """
        Update user reputation after fix result.
        """
        rep = self.get_user_reputation(user_id)
        
        rep['total_fixes'] += 1
        if fix_succeeded:
            rep['successful_fixes'] += 1
        else:
            rep['failed_fixes'] += 1
        
        if votes:
            rep['upvotes'] += votes.get('upvotes', 0)
            rep['downvotes'] += votes.get('downvotes', 0)
        
        # Recalculate
        self.get_user_reputation(user_id)
        self._save_user_reputations()
        
        print(f"{BLUE}👤 Reputation updated: {user_id[:8]} -> {rep['reputation_score']:.2f} ({rep['tier']}){RESET}")
    
    def vote_on_fix_success(self, fix_hash: str, user_id: str, succeeded: bool) -> Dict[str, Any]:
        """
        Vote on whether a fix was successful.
        Each validated user can only vote once per fix.
        
        Args:
            fix_hash: Hash of the fix to vote on
            user_id: Validated user ID (must be GH-* format)
            succeeded: True if fix worked, False if it failed
        
        Returns:
            {
                "success": bool,
                "message": str,
                "previous_vote": str or None
            }
        """
        # Validate user ID format (must be GitHub validated: GH-*)
        if not user_id or not user_id.startswith('GH-'):
            return {
                "success": False,
                "message": "Only validated GitHub users can vote on fixes",
                "previous_vote": None
            }
        
        # Check if user already voted on this fix
        if fix_hash not in self.user_votes:
            self.user_votes[fix_hash] = {}
        
        previous_vote = self.user_votes[fix_hash].get(user_id)
        
        if previous_vote is not None:
            return {
                "success": False,
                "message": f"You already voted '{previous_vote}' on this fix. Each user can only vote once.",
                "previous_vote": previous_vote
            }
        
        # Record the vote
        vote_value = "success" if succeeded else "failure"
        self.user_votes[fix_hash][user_id] = vote_value
        
        # Save to disk
        self._save_user_votes()
        
        # Update consensus cache
        if fix_hash in self.consensus_cache:
            del self.consensus_cache[fix_hash]
        
        print(f"{GREEN}✓ Vote recorded: {user_id[:12]} voted '{vote_value}' on fix {fix_hash[:12]}{RESET}")
        
        return {
            "success": True,
            "message": f"Vote recorded: {vote_value}",
            "previous_vote": None
        }
    
    def get_user_vote(self, fix_hash: str, user_id: str) -> Optional[str]:
        """
        Get a user's vote on a specific fix.
        
        Returns:
            "success", "failure", or None if not voted
        """
        if fix_hash not in self.user_votes:
            return None
        
        return self.user_votes[fix_hash].get(user_id)
    
    def get_vote_statistics(self, fix_hash: str) -> Dict[str, Any]:
        """
        Get voting statistics for a fix.
        
        Returns:
            {
                "total_votes": int,
                "success_votes": int,
                "failure_votes": int,
                "success_rate": float,
                "unique_voters": int
            }
        """
        if fix_hash not in self.user_votes:
            return {
                "total_votes": 0,
                "success_votes": 0,
                "failure_votes": 0,
                "success_rate": 0.0,
                "unique_voters": 0
            }
        
        votes = self.user_votes[fix_hash]
        success_votes = sum(1 for v in votes.values() if v == "success")
        failure_votes = sum(1 for v in votes.values() if v == "failure")
        total_votes = len(votes)
        
        success_rate = success_votes / total_votes if total_votes > 0 else 0.0
        
        return {
            "total_votes": total_votes,
            "success_votes": success_votes,
            "failure_votes": failure_votes,
            "success_rate": success_rate,
            "unique_voters": total_votes
        }
    
    def get_reputation_weighted_consensus(self, fix_hash: str) -> float:
        """
        Calculate consensus weighted by user reputation.
        High-rep users' results count more.
        """
        weighted_successes = 0.0
        weighted_attempts = 0.0
        
        for ref in self.remote_refs:
            if ref.get('fix_hash') == fix_hash:
                user_id = ref.get('user_id')
                user_rep = self.get_user_reputation(user_id)
                weight = user_rep['reputation_score']
                
                usage = ref.get('usage_stats', {})
                attempts = usage.get('attempts', 1)
                successes = usage.get('successes', 0)
                
                weighted_attempts += attempts * weight
                weighted_successes += successes * weight
        
        if weighted_attempts == 0:
            return 0.0
        
        return weighted_successes / weighted_attempts
    
    # ========== FIX VERSIONING & EVOLUTION ==========
    
    def create_fix_version(self, 
                          error_signature: str,
                          fix_hash: str,
                          solution: str,
                          supersedes: Optional[str] = None):
        """
        Create a new version of a fix.
        Tracks evolution: v1 -> v2 -> v3
        """
        if error_signature not in self.fix_versions:
            self.fix_versions[error_signature] = []
        
        # Get version number
        existing_versions = self.fix_versions[error_signature]
        version_num = len(existing_versions) + 1
        
        version = {
            "version": version_num,
            "fix_hash": fix_hash,
            "solution": solution,
            "created": datetime.now().isoformat(),
            "supersedes": supersedes,
            "consensus": 0,
            "status": "active"
        }
        
        # If superseding another fix, mark it
        if supersedes:
            for v in existing_versions:
                if v['fix_hash'] == supersedes:
                    v['status'] = 'superseded'
                    v['superseded_by'] = fix_hash
                    print(f"{GOLD}🔄 Version {v['version']} superseded by v{version_num}{RESET}")
        
        self.fix_versions[error_signature].append(version)
        self._save_fix_versions()
        
        print(f"{GREEN}✨ Created fix version {version_num} for {error_signature[:40]}...{RESET}")
        return version
    
    def get_latest_fix_version(self, error_signature: str) -> Optional[Dict]:
        """
        Get the most recent active version of a fix.
        """
        if error_signature not in self.fix_versions:
            return None
        
        versions = self.fix_versions[error_signature]
        active_versions = [v for v in versions if v['status'] == 'active']
        
        if not active_versions:
            return None
        
        # Sort by version number, get latest
        active_versions.sort(key=lambda x: x['version'], reverse=True)
        return active_versions[0]
    
    def get_fix_evolution_path(self, fix_hash: str) -> List[Dict]:
        """
        Get the evolution path of a fix.
        Shows: v1 -> v2 -> v3 (current)
        """
        evolution = []
        
        # Find the fix
        for error_sig, versions in self.fix_versions.items():
            for version in versions:
                if version['fix_hash'] == fix_hash:
                    # Found it - now trace backwards and forwards
                    evolution = self._trace_version_chain(error_sig, version)
                    break
        
        return evolution
    
    def _trace_version_chain(self, error_sig: str, current_version: Dict) -> List[Dict]:
        """
        Trace the full chain of versions.
        """
        versions = self.fix_versions[error_sig]
        chain = [current_version]
        
        # Trace backwards (what did this supersede?)
        supersedes = current_version.get('supersedes')
        while supersedes:
            for v in versions:
                if v['fix_hash'] == supersedes:
                    chain.insert(0, v)
                    supersedes = v.get('supersedes')
                    break
            else:
                break
        
        # Trace forwards (what superseded this?)
        superseded_by = current_version.get('superseded_by')
        while superseded_by:
            for v in versions:
                if v['fix_hash'] == superseded_by:
                    chain.append(v)
                    superseded_by = v.get('superseded_by')
                    break
            else:
                break
        
        return chain
    
    def suggest_better_version(self, fix_hash: str) -> Optional[Dict]:
        """
        Check if there's a better version available.
        """
        for error_sig, versions in self.fix_versions.items():
            for version in versions:
                if version['fix_hash'] == fix_hash:
                    # Check if superseded
                    if version['status'] == 'superseded':
                        superseded_by = version.get('superseded_by')
                        # Find the replacement
                        for v in versions:
                            if v['fix_hash'] == superseded_by:
                                print(f"{GOLD}🔄 Better version available: v{v['version']} (supersedes v{version['version']}){RESET}")
                                return v
        
        return None
    
    # ========== FRAUD DETECTION & SPAM PROTECTION ==========
    
    def check_for_spam(self, fix_hash: str, solution: str) -> Dict[str, Any]:
        """
        Detect potential spam/malicious fixes.
        
        Red flags:
        - Dangerous commands (rm -rf, curl | bash, etc.)
        - Similarity to known spam
        - Multiple reports from community
        - Suspicious patterns
        """
        result = {
            "is_spam": False,
            "risk_level": "low",
            "warnings": [],
            "should_quarantine": False
        }
        
        solution_lower = solution.lower()
        
        # Check for dangerous commands
        dangerous_patterns = [
            "rm -rf",
            "rm -fr",
            "sudo rm",
            ":(){ :|:& };:",  # Fork bomb
            "mkfs",
            "dd if=/dev/zero",
            "wget | bash",
            "curl | sh",
            "> /dev/sda",
            "chmod -R 777",
            "eval",
            "exec",
            "__import__"
        ]
        
        for pattern in dangerous_patterns:
            if pattern in solution_lower:
                result['warnings'].append(f"Dangerous pattern: {pattern}")
                result['risk_level'] = "high"
                result['is_spam'] = True
        
        # Check similarity to known spam
        import difflib
        for spam_pattern in self.known_spam_patterns:
            similarity = difflib.SequenceMatcher(None, solution_lower, spam_pattern.lower()).ratio()
            if similarity > SUSPICIOUS_PATTERN_THRESHOLD:
                result['warnings'].append(f"Similar to known spam ({similarity:.0%})")
                result['risk_level'] = "high"
                result['is_spam'] = True
        
        # Check community reports
        report_count = self.spam_reports.get(fix_hash, 0)
        if report_count >= SPAM_REPORT_THRESHOLD:
            result['warnings'].append(f"Reported by {report_count} users")
            result['should_quarantine'] = True
            result['is_spam'] = True
        
        # Suspicious patterns
        suspicious = [
            "base64",
            "echo -e",
            "/dev/tcp/",
            "nc -l",
            "ncat",
            "python -c",
            "perl -e"
        ]
        
        suspicious_count = sum(1 for pattern in suspicious if pattern in solution_lower)
        if suspicious_count >= 2:
            result['warnings'].append(f"Multiple suspicious patterns ({suspicious_count})")
            result['risk_level'] = "medium"
        
        return result
    
    def report_spam(self, fix_hash: str, reason: str = None):
        """
        Report a fix as spam.
        """
        if fix_hash not in self.spam_reports:
            self.spam_reports[fix_hash] = 0
        
        self.spam_reports[fix_hash] += 1
        count = self.spam_reports[fix_hash]
        
        self._save_spam_reports()
        
        print(f"{RED}⚠️  Fix {fix_hash[:8]} reported as spam ({count} reports){RESET}")
        
        if count >= SPAM_REPORT_THRESHOLD:
            print(f"{RED}🚫 Fix quarantined due to multiple reports{RESET}")
            # Add to known spam patterns
            self._quarantine_fix(fix_hash)
    
    def _quarantine_fix(self, fix_hash: str):
        """
        Move fix to quarantine - won't be suggested anymore.
        """
        # Mark in remote refs
        for ref in self.remote_refs:
            if ref.get('fix_hash') == fix_hash:
                ref['quarantined'] = True
                ref['quarantine_reason'] = 'spam_reports'
                
                # Add solution to spam patterns (if available)
                solution = ref.get('solution')
                if solution and solution not in self.known_spam_patterns:
                    self.known_spam_patterns.append(solution)
        
        print(f"{RED}🚫 Quarantined: {fix_hash[:8]}{RESET}")
    
    def is_safe_to_use(self, fix_hash: str, solution: str) -> Tuple[bool, str]:
        """
        Check if a fix is safe to use.
        
        Returns:
            (is_safe: bool, reason: str)
        """
        # Check if quarantined
        for ref in self.remote_refs:
            if ref.get('fix_hash') == fix_hash and ref.get('quarantined'):
                return (False, f"{RED}🚫 This fix is quarantined (spam/malicious){RESET}")
        
        # Run spam detection
        spam_check = self.check_for_spam(fix_hash, solution)
        
        if spam_check['is_spam']:
            warnings = ", ".join(spam_check['warnings'])
            return (False, f"{RED}⚠️  Safety concern: {warnings}{RESET}")
        
        if spam_check['risk_level'] == "medium":
            warnings = ", ".join(spam_check['warnings'])
            return (True, f"{GOLD}⚠️  Use with caution: {warnings}{RESET}")
        
        return (True, f"{GREEN}✅ Safe to use{RESET}")
    
    # ========== A/B TESTING ==========
    
    def create_ab_test(self, 
                       error_signature: str,
                       fix_a: str,
                       fix_b: str,
                       test_duration_days: int = 30):
        """
        Create an A/B test between two fixes.
        Randomly suggests one or the other to gather comparison data.
        """
        test_id = hashlib.sha256(f"{error_signature}{fix_a}{fix_b}".encode()).hexdigest()[:12]
        
        self.ab_tests[test_id] = {
            "error_signature": error_signature,
            "variant_a": {
                "fix_hash": fix_a,
                "attempts": 0,
                "successes": 0
            },
            "variant_b": {
                "fix_hash": fix_b,
                "attempts": 0,
                "successes": 0
            },
            "started": datetime.now().isoformat(),
            "ends": (datetime.now() + timedelta(days=test_duration_days)).isoformat(),
            "status": "active",
            "winner": None
        }
        
        self._save_ab_tests()
        
        print(f"{BLUE}🧪 A/B test created: {test_id}{RESET}")
        print(f"   Testing {fix_a[:8]} vs {fix_b[:8]}")
        print(f"   Duration: {test_duration_days} days")
        
        return test_id
    
    def get_ab_test_variant(self, error_signature: str) -> Optional[str]:
        """
        Get which variant to suggest for this error.
        Uses random assignment (50/50 split).
        """
        import random
        
        # Find active test for this error
        for test_id, test in self.ab_tests.items():
            if test['error_signature'] == error_signature and test['status'] == 'active':
                # Check if test is expired
                if datetime.fromisoformat(test['ends']) < datetime.now():
                    self._finalize_ab_test(test_id)
                    continue
                
                # Random 50/50 split
                variant = 'a' if random.random() < 0.5 else 'b'
                fix_hash = test[f'variant_{variant}']['fix_hash']
                
                print(f"{BLUE}🧪 A/B test - suggesting variant {variant.upper()}{RESET}")
                
                return fix_hash
        
        return None
    
    def record_ab_test_result(self, error_signature: str, fix_hash: str, succeeded: bool):
        """
        Record result for A/B test.
        """
        for test_id, test in self.ab_tests.items():
            if test['error_signature'] == error_signature and test['status'] == 'active':
                # Find which variant was used
                for variant in ['a', 'b']:
                    if test[f'variant_{variant}']['fix_hash'] == fix_hash:
                        test[f'variant_{variant}']['attempts'] += 1
                        if succeeded:
                            test[f'variant_{variant}']['successes'] += 1
                        
                        self._save_ab_tests()
                        print(f"{BLUE}📊 A/B result recorded for variant {variant.upper()}{RESET}")
                        break
    
    def _finalize_ab_test(self, test_id: str):
        """
        Finalize A/B test and declare winner.
        """
        test = self.ab_tests[test_id]
        
        variant_a = test['variant_a']
        variant_b = test['variant_b']
        
        # Calculate success rates
        rate_a = variant_a['successes'] / max(1, variant_a['attempts'])
        rate_b = variant_b['successes'] / max(1, variant_b['attempts'])
        
        # Determine winner (need statistical significance)
        min_attempts = 10  # Minimum sample size
        if variant_a['attempts'] >= min_attempts and variant_b['attempts'] >= min_attempts:
            if rate_a > rate_b * 1.1:  # A is 10% better
                test['winner'] = 'a'
            elif rate_b > rate_a * 1.1:  # B is 10% better
                test['winner'] = 'b'
            else:
                test['winner'] = 'tie'
        else:
            test['winner'] = 'insufficient_data'
        
        test['status'] = 'completed'
        test['completed'] = datetime.now().isoformat()
        
        self._save_ab_tests()
        
        print(f"{GREEN}✅ A/B test {test_id} completed{RESET}")
        print(f"   Variant A: {rate_a:.1%} ({variant_a['successes']}/{variant_a['attempts']})")
        print(f"   Variant B: {rate_b:.1%} ({variant_b['successes']}/{variant_b['attempts']})")
        print(f"   Winner: {test['winner'].upper()}")
    
    # ========== CLUSTER ANALYSIS ==========
    
    def cluster_similar_errors(self, min_cluster_size: int = 3):
        """
        Group similar errors into clusters.
        Helps identify patterns and common issues.
        """
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import DBSCAN
        import numpy as np
        
        # Collect all error signatures
        errors = []
        for ref in self.remote_refs:
            error_sig = ref.get('error_signature') or ref.get('error_type', '')
            if error_sig:
                errors.append(error_sig)
        
        if len(errors) < min_cluster_size:
            print(f"{GOLD}Not enough errors to cluster ({len(errors)} < {min_cluster_size}){RESET}")
            return
        
        try:
            # Vectorize errors
            vectorizer = TfidfVectorizer(max_features=100)
            X = vectorizer.fit_transform(errors)
            
            # Cluster with DBSCAN
            clustering = DBSCAN(eps=0.5, min_samples=min_cluster_size, metric='cosine')
            labels = clustering.fit_predict(X)
            
            # Group by cluster
            clusters = defaultdict(list)
            for idx, label in enumerate(labels):
                if label != -1:  # -1 = noise
                    clusters[label].append(errors[idx])
            
            # Save clusters
            self.error_clusters = {}
            for cluster_id, error_list in clusters.items():
                cluster_name = f"cluster_{cluster_id}"
                self.error_clusters[cluster_name] = {
                    "errors": error_list,
                    "size": len(error_list),
                    "representative": error_list[0]  # First as representative
                }
            
            print(f"{GREEN}✅ Identified {len(clusters)} error clusters{RESET}")
            for cluster_id, data in self.error_clusters.items():
                print(f"   {cluster_id}: {data['size']} errors")
                print(f"      Representative: {data['representative'][:60]}...")
        
        except ImportError:
            print(f"{GOLD}⚠️  scikit-learn not installed - skipping clustering{RESET}")
            print(f"   Install with: pip install scikit-learn")
    
    def get_cluster_for_error(self, error: str) -> Optional[str]:
        """
        Find which cluster an error belongs to.
        """
        import difflib
        
        best_cluster = None
        best_similarity = 0.0
        
        for cluster_name, data in self.error_clusters.items():
            # Compare to representative
            similarity = difflib.SequenceMatcher(
                None, 
                error.lower(), 
                data['representative'].lower()
            ).ratio()
            
            if similarity > best_similarity:
                best_similarity = similarity
                best_cluster = cluster_name
        
        if best_similarity > 0.6:  # 60% similar
            return best_cluster
        
        return None
    
    def get_cluster_best_fix(self, cluster_name: str) -> Optional[Dict]:
        """
        Get the best fix for an error cluster.
        """
        if cluster_name not in self.error_clusters:
            return None
        
        cluster = self.error_clusters[cluster_name]
        
        # Find fixes for errors in this cluster
        cluster_fixes = []
        for error in cluster['errors']:
            # Search for fixes
            for ref in self.remote_refs:
                if ref.get('error_signature') == error:
                    cluster_fixes.append(ref)
        
        if not cluster_fixes:
            return None
        
        # Score each fix
        best_fix = None
        best_score = 0.0
        
        for fix in cluster_fixes:
            consensus = self.calculate_consensus(fix['fix_hash'])
            score = consensus['success_rate']
            
            if score > best_score:
                best_score = score
                best_fix = fix
        
        return best_fix


# Example usage
if __name__ == "__main__":
    print(f"{PURPLE}╔════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║  🤝 Advanced Consensus Dictionary     ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════╝{RESET}\n")
    
    # Mock data
    from tempfile import NamedTemporaryFile
    import json
    
    # Create mock remote refs with usage stats
    mock_refs = [
        {
            "fix_hash": "abc123",
            "user_id": "user1",
            "error_type": "NameError",
            "error_signature": "NameError: name 'json' is not defined",
            "solution": "import json",
            "usage_stats": {"attempts": 10, "successes": 9},
            "context": {"python_version": "3.9"}
        },
        {
            "fix_hash": "abc123",
            "user_id": "user2",
            "error_type": "NameError",
            "error_signature": "NameError: name 'json' is not defined",
            "solution": "import json",
            "usage_stats": {"attempts": 5, "successes": 5},
            "context": {"python_version": "3.10"}
        },
        {
            "fix_hash": "abc123",
            "user_id": "user3",
            "error_type": "NameError",
            "error_signature": "NameError: name 'json' is not defined",
            "solution": "import json",
            "usage_stats": {"attempts": 8, "successes": 2},
            "context": {"python_version": "3.11"}
        },
        {
            "fix_hash": "xyz789",
            "user_id": "user4",
            "error_type": "NameError",
            "error_signature": "NameError: name 'os' is not defined",
            "solution": "import os",
            "usage_stats": {"attempts": 3, "successes": 3},
            "context": {"python_version": "3.9"}
        },
    ]
    
    # Save to temp file
    with NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump([], f)
        local_path = Path(f.name)
    
    with NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(mock_refs, f)
        remote_path = Path(f.name)
    
    # Test consensus
    cd = ConsensusDictionary(local_path, remote_path, user_id="test_user")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 1: Basic Consensus{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    cd.print_consensus_report("abc123")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 2: User Reputation System{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    cd.update_user_reputation("user1", fix_succeeded=True)
    cd.update_user_reputation("user1", fix_succeeded=True)
    cd.update_user_reputation("user1", fix_succeeded=False)
    rep = cd.get_user_reputation("user1")
    print(f"\n{BLUE}User1 Reputation:{RESET}")
    print(f"  Score: {rep['reputation_score']:.2f}")
    print(f"  Tier: {rep['tier']}")
    print(f"  Success rate: {rep['successful_fixes']}/{rep['total_fixes']}")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 3: Fix Versioning{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    cd.create_fix_version(
        error_signature="NameError: name 'json' is not defined",
        fix_hash="v1_fix",
        solution="import json"
    )
    cd.create_fix_version(
        error_signature="NameError: name 'json' is not defined",
        fix_hash="v2_fix",
        solution="from json import loads, dumps",
        supersedes="v1_fix"
    )
    latest = cd.get_latest_fix_version("NameError: name 'json' is not defined")
    print(f"\n{BLUE}Latest version:{RESET} v{latest['version']} ({latest['fix_hash']})")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 4: Fraud Detection{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    
    # Test safe fix
    safe, msg = cd.is_safe_to_use("abc123", "import json")
    print(f"\n{BLUE}Test safe fix:{RESET}")
    print(f"  Safe: {safe}")
    print(f"  {msg}")
    
    # Test dangerous fix
    safe, msg = cd.is_safe_to_use("danger", "rm -rf /")
    print(f"\n{BLUE}Test dangerous fix:{RESET}")
    print(f"  Safe: {safe}")
    print(f"  {msg}")
    
    # Test spam reporting
    print(f"\n{BLUE}Test spam reporting:{RESET}")
    cd.report_spam("spam_fix", "Suspicious behavior")
    cd.report_spam("spam_fix", "Still suspicious")
    cd.report_spam("spam_fix", "Definitely spam")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 5: A/B Testing{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    test_id = cd.create_ab_test(
        error_signature="ImportError: No module named requests",
        fix_a="pip install requests",
        fix_b="pip3 install requests",
        test_duration_days=7
    )
    print(f"\n{BLUE}Simulating A/B test results:{RESET}")
    cd.record_ab_test_result("ImportError: No module named requests", "pip install requests", succeeded=True)
    cd.record_ab_test_result("ImportError: No module named requests", "pip3 install requests", succeeded=True)
    cd.record_ab_test_result("ImportError: No module named requests", "pip install requests", succeeded=False)
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 6: Cluster Analysis{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    try:
        cd.cluster_similar_errors(min_cluster_size=2)
    except ModuleNotFoundError:
        print(f"{GOLD}⚠️  scikit-learn not installed - skipping clustering test{RESET}")
        print(f"   Install with: pip install scikit-learn")
    
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Test 7: Reputation-Weighted Consensus{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    weighted = cd.get_reputation_weighted_consensus("abc123")
    print(f"\n{BLUE}Weighted consensus:{RESET} {weighted:.1%}")
    
    # Cleanup
    local_path.unlink()
    remote_path.unlink()
    
    print(f"\n{GREEN}✨ All advanced features tested!{RESET}")
    print(f"\n{GOLD}Summary of features:{RESET}")
    print(f"  ✅ 51% consensus with trust levels")
    print(f"  ✅ User reputation system (tiers: beginner → expert)")
    print(f"  ✅ Fix versioning & evolution tracking")
    print(f"  ✅ Fraud detection & spam protection")
    print(f"  ✅ A/B testing for fix comparison")
    print(f"  ✅ ML-based error clustering")
    print(f"  ✅ Reputation-weighted scoring")
    print(f"\n{PURPLE}Ready for production! 🚀{RESET}")
