#!/usr/bin/env python3
"""
🧠 Smart Upload Filter - Prevents Duplicate Fix Pollution
Only uploads novel fixes, significant variations, and branch relationships to GitHub
"""
import hashlib
import json
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
import difflib

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

# Thresholds
NOVELTY_THRESHOLD = 0.7  # 70% different to be considered novel
MIN_BRANCH_RELEVANCE = 0.6  # Minimum relevance to create branch


class SmartUploadFilter:
    """
    Decides whether a fix should be uploaded to GitHub or kept local only.
    
    Upload Criteria:
    1. Novel fix (not similar to existing global fixes)
    2. Significant variation (different approach)
    3. Branch relationship (explicitly inspired by another fix)
    
    Keep Local Only:
    - Duplicate fixes
    - Minor variations
    - Personal repeated fixes
    """
    
    def __init__(self, dictionary, uploader):
        self.dictionary = dictionary
        self.uploader = uploader
        self.upload_log = self._load_upload_log()
    
    def _load_upload_log(self) -> Dict[str, Any]:
        """Load history of what we've uploaded."""
        log_file = Path.home() / ".luciferai" / "sync" / "upload_history.json"
        if log_file.exists():
            with open(log_file) as f:
                return json.load(f)
        return {"uploaded_hashes": [], "rejected_duplicates": 0, "novel_count": 0}
    
    def _save_upload_log(self):
        """Save upload history."""
        log_file = Path.home() / ".luciferai" / "sync" / "upload_history.json"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, 'w') as f:
            json.dump(self.upload_log, f, indent=2)
    
    def should_upload(self, 
                     error: str,
                     solution: str,
                     error_type: str,
                     inspired_by: Optional[Dict] = None) -> Tuple[bool, str]:
        """
        Determine if fix should be uploaded to GitHub.
        
        Args:
            error: Error message
            solution: Fix solution
            error_type: Type of error
            inspired_by: If inspired by another fix (branch relationship)
        
        Returns:
            (should_upload: bool, reason: str)
        """
        # Calculate fix signature
        fix_signature = self._create_fix_signature(error, solution, error_type)
        
        # Check 1: Already uploaded this exact fix?
        if fix_signature in self.upload_log.get("uploaded_hashes", []):
            self.upload_log["rejected_duplicates"] = self.upload_log.get("rejected_duplicates", 0) + 1
            self._save_upload_log()
            return (
                False, 
                f"{GOLD}📁 Local only - You've already uploaded this fix{RESET}"
            )
        
        # Check 2: Is this a branch relationship? (Always upload branches)
        if inspired_by:
            print(f"{PURPLE}🌿 Branch relationship detected - will upload{RESET}")
            return (
                True,
                f"{GREEN}🌿 Uploading branch: inspired by fix {inspired_by.get('fix_hash', 'unknown')[:8]}{RESET}"
            )
        
        # Check 3: Is this novel compared to global FixNet?
        novelty_score = self._calculate_novelty(error, solution, error_type)
        
        if novelty_score >= NOVELTY_THRESHOLD:
            self.upload_log["novel_count"] = self.upload_log.get("novel_count", 0) + 1
            self.upload_log.setdefault("uploaded_hashes", []).append(fix_signature)
            self._save_upload_log()
            
            return (
                True,
                f"{GREEN}✨ Novel fix (novelty: {novelty_score:.2f}) - uploading to help community{RESET}"
            )
        
        # Check 4: Significant variation of existing fix?
        if 0.4 <= novelty_score < NOVELTY_THRESHOLD:
            variation_significance = self._assess_variation_significance(solution)
            
            if variation_significance > 0.7:
                self.upload_log.setdefault("uploaded_hashes", []).append(fix_signature)
                self._save_upload_log()
                
                return (
                    True,
                    f"{BLUE}🔄 Significant variation (score: {variation_significance:.2f}) - uploading{RESET}"
                )
        
        # Default: Keep local only
        self.upload_log["rejected_duplicates"] = self.upload_log.get("rejected_duplicates", 0) + 1
        self._save_upload_log()
        
        return (
            False,
            f"{GOLD}📁 Local only - Similar fix exists globally (novelty: {novelty_score:.2f}){RESET}"
        )
    
    def _create_fix_signature(self, error: str, solution: str, error_type: str) -> str:
        """Create unique signature for a fix."""
        # Normalize for comparison
        normalized = f"{error_type}:{self._normalize_error(error)}:{solution.lower().strip()}"
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]
    
    def _normalize_error(self, error: str) -> str:
        """Normalize error message for comparison."""
        # Remove variable names, line numbers, file paths
        normalized = error.lower()
        
        # Remove line numbers
        import re
        normalized = re.sub(r'line \d+', 'line N', normalized)
        normalized = re.sub(r'\d+', 'N', normalized)
        
        # Remove file paths
        normalized = re.sub(r'/[^\s]+', '/path', normalized)
        
        # Remove specific variable names (keep error pattern)
        normalized = re.sub(r"'[^']+' is not defined", "'VAR' is not defined", normalized)
        normalized = re.sub(r"'[^']+' has no attribute", "'OBJ' has no attribute", normalized)
        
        return normalized.strip()[:200]
    
    def _calculate_novelty(self, error: str, solution: str, error_type: str) -> float:
        """
        Calculate how novel this fix is compared to global FixNet.
        
        Returns:
            0.0 = Exact duplicate
            1.0 = Completely novel
        """
        # Get all remote fixes for this error type
        remote_fixes = [
            ref for ref in self.dictionary.remote_refs 
            if ref.get('error_type') == error_type
        ]
        
        if not remote_fixes:
            # No global fixes for this error type = completely novel
            return 1.0
        
        # Compare error patterns
        normalized_error = self._normalize_error(error)
        max_similarity = 0.0
        
        for remote_fix in remote_fixes:
            # We can't see their solution (encrypted), but we can compare error patterns
            # and metadata to estimate similarity
            
            # Check timestamp - very recent fixes might be duplicates
            if self._is_recent_upload(remote_fix):
                # Likely duplicate from another user who just fixed the same thing
                max_similarity = max(max_similarity, 0.9)
            
            # Check if error type + script name combo exists
            if remote_fix.get('script') and self._similar_context(remote_fix):
                max_similarity = max(max_similarity, 0.7)
        
        # Also check local dictionary for our own past uploads
        local_matches = self.dictionary._search_local(
            normalized_error, 
            error_type, 
            min_relevance=0.3
        )
        
        for local_match in local_matches:
            if local_match.get('commit_url'):  # Previously uploaded
                # Compare solutions
                solution_similarity = difflib.SequenceMatcher(
                    None,
                    solution.lower(),
                    local_match.get('solution', '').lower()
                ).ratio()
                max_similarity = max(max_similarity, solution_similarity)
        
        # Novelty = 1 - max_similarity
        return 1.0 - max_similarity
    
    def _is_recent_upload(self, remote_fix: Dict) -> bool:
        """Check if remote fix was uploaded very recently (last hour)."""
        try:
            from datetime import datetime, timedelta
            timestamp = datetime.fromisoformat(remote_fix.get('timestamp', ''))
            return datetime.now() - timestamp < timedelta(hours=1)
        except:
            return False
    
    def _similar_context(self, remote_fix: Dict) -> bool:
        """Check if remote fix has similar context (script name, etc)."""
        # Placeholder - would compare script names, error locations, etc.
        return False
    
    def _assess_variation_significance(self, solution: str) -> float:
        """
        Assess if this variation is significant enough to upload.
        
        Examples of significant variations:
        - Different import style (from X import Y vs import X)
        - Different approach (try/except vs if/else)
        - Performance improvement
        
        Returns:
            0.0 - 1.0 significance score
        """
        # Look for keywords indicating different approaches
        significant_patterns = [
            'try:', 'except:', 'with', 'async', 'await',
            'lambda', 'comprehension', 'generator',
            '@decorator', 'class', 'def'
        ]
        
        score = 0.5  # Base score
        
        for pattern in significant_patterns:
            if pattern in solution.lower():
                score += 0.1
        
        return min(1.0, score)
    
    def get_upload_stats(self) -> Dict[str, Any]:
        """Get statistics about uploads."""
        return {
            "novel_uploads": self.upload_log.get("novel_count", 0),
            "rejected_duplicates": self.upload_log.get("rejected_duplicates", 0),
            "total_uploaded": len(self.upload_log.get("uploaded_hashes", [])),
            "rejection_rate": (
                self.upload_log.get("rejected_duplicates", 0) / 
                max(1, self.upload_log.get("rejected_duplicates", 0) + self.upload_log.get("novel_count", 0))
            ) * 100
        }
    
    def print_stats(self):
        """Print upload statistics."""
        stats = self.get_upload_stats()
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 Smart Upload Filter Statistics{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GREEN}✅ Novel uploads:{RESET} {stats['novel_uploads']}")
        print(f"{GOLD}📁 Rejected duplicates:{RESET} {stats['rejected_duplicates']}")
        print(f"{BLUE}📤 Total uploaded:{RESET} {stats['total_uploaded']}")
        print(f"{PURPLE}📉 Rejection rate:{RESET} {stats['rejection_rate']:.1f}%")
        
        if stats['rejection_rate'] > 50:
            print(f"\n{GREEN}✨ Good! Preventing duplicate pollution.{RESET}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")


# Test the filter
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing Smart Upload Filter{RESET}\n")
    
    # Mock dictionary and uploader
    class MockDict:
        def __init__(self):
            self.remote_refs = [
                {
                    "error_type": "NameError",
                    "timestamp": "2025-10-22T10:00:00",
                    "script": "test.py"
                }
            ]
        
        def _search_local(self, error, error_type, min_relevance):
            return []
    
    class MockUploader:
        pass
    
    filter_sys = SmartUploadFilter(MockDict(), MockUploader())
    
    # Test 1: Novel fix
    print(f"{GOLD}Test 1: Novel fix (new error type){RESET}")
    should_upload, reason = filter_sys.should_upload(
        error="ValueError: invalid literal for int()",
        solution="Added try/except with validation",
        error_type="ValueError",
        inspired_by=None
    )
    print(f"Upload: {should_upload}")
    print(f"Reason: {reason}\n")
    
    # Test 2: Duplicate fix
    print(f"{GOLD}Test 2: Duplicate fix{RESET}")
    should_upload, reason = filter_sys.should_upload(
        error="NameError: name 'json' is not defined",
        solution="import json",
        error_type="NameError",
        inspired_by=None
    )
    print(f"Upload: {should_upload}")
    print(f"Reason: {reason}\n")
    
    # Test 3: Branch relationship
    print(f"{GOLD}Test 3: Branch relationship{RESET}")
    should_upload, reason = filter_sys.should_upload(
        error="NameError: name 'os' is not defined",
        solution="import os",
        error_type="NameError",
        inspired_by={"fix_hash": "abc123def", "solution": "import sys"}
    )
    print(f"Upload: {should_upload}")
    print(f"Reason: {reason}\n")
    
    # Test 4: Same fix again (should reject)
    print(f"{GOLD}Test 4: Same fix again{RESET}")
    should_upload, reason = filter_sys.should_upload(
        error="ValueError: invalid literal for int()",
        solution="Added try/except with validation",
        error_type="ValueError",
        inspired_by=None
    )
    print(f"Upload: {should_upload}")
    print(f"Reason: {reason}\n")
    
    # Show stats
    filter_sys.print_stats()
    
    print(f"{PURPLE}✨ Filter tests complete{RESET}")
