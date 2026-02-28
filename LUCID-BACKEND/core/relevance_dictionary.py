#!/usr/bin/env python3
"""
🧩 LuciferAI Relevance Dictionary - Collaborative Fix Learning
Builds intelligent error-to-solution mappings with user branching and relevance scoring
"""
import os
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from collections import defaultdict
import difflib

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
DICT_FILE = LUCIFER_HOME / "data" / "fix_dictionary.json"
LOCAL_BRANCHES = LUCIFER_HOME / "data" / "user_branches.json"
# UNIFIED: Single source of truth for remote refs
FIXNET_REFS = LUCIFER_HOME / "fixnet" / "refs.json"
CONTEXT_BRANCHES = LUCIFER_HOME / "data" / "context_branches.json"
SCRIPT_COUNTERS = LUCIFER_HOME / "data" / "script_counters.json"
# DEPRECATED: Old location - migrated to FIXNET_REFS
REMOTE_REFS_DEPRECATED = LUCIFER_HOME / "sync" / "remote_fix_refs.json"

# Ensure directories
DICT_FILE.parent.mkdir(parents=True, exist_ok=True)


class RelevanceDictionary:
    """
    Manages collaborative fix learning with branching and relevance scoring.
    
    Structure:
    - Local dictionary: user's own fixes
    - Branch links: connections to fixes that helped solve issues
    - Remote references: other users' fixes from GitHub
    - Relevance scores: weighted by success rate
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.dictionary: Dict[str, List[Dict]] = self._load_dictionary()
        self.branches: Dict[str, List[str]] = self._load_branches()
        self.remote_refs: List[Dict] = self._load_remote_refs()
        self.context_branches: Dict[str, Dict] = self._load_context_branches()
        self.script_counters: Dict[str, Dict] = self._load_script_counters()
    
    def _load_dictionary(self) -> Dict[str, List[Dict]]:
        """Load local fix dictionary."""
        if DICT_FILE.exists():
            with open(DICT_FILE) as f:
                return json.load(f)
        return {}
    
    def _save_dictionary(self):
        """Save local fix dictionary."""
        with open(DICT_FILE, 'w') as f:
            json.dump(self.dictionary, f, indent=2)
    
    def _load_branches(self) -> Dict[str, List[str]]:
        """Load branch connections."""
        if LOCAL_BRANCHES.exists():
            with open(LOCAL_BRANCHES) as f:
                return json.load(f)
        return {}
    
    def _save_branches(self):
        """Save branch connections."""
        with open(LOCAL_BRANCHES, 'w') as f:
            json.dump(self.branches, f, indent=2)
    
    def _load_remote_refs(self) -> List[Dict]:
        """
        Load remote fix references from FixNet.
        UNIFIED: Single source of truth at ~/.luciferai/fixnet/refs.json
        Migrates from deprecated location if needed.
        """
        refs = []
        
        # Load from UNIFIED location
        if FIXNET_REFS.exists():
            with open(FIXNET_REFS) as f:
                refs = json.load(f)
        
        # MIGRATION: Check deprecated location and merge
        if REMOTE_REFS_DEPRECATED.exists():
            with open(REMOTE_REFS_DEPRECATED) as f:
                deprecated_refs = json.load(f)
                
                if deprecated_refs:
                    # Merge unique refs from deprecated location
                    ref_hashes = {r.get('fix_hash') for r in refs if r.get('fix_hash')}
                    migrated_count = 0
                    
                    for dep_ref in deprecated_refs:
                        if dep_ref.get('fix_hash') and dep_ref['fix_hash'] not in ref_hashes:
                            refs.append(dep_ref)
                            ref_hashes.add(dep_ref['fix_hash'])
                            migrated_count += 1
                    
                    # Save merged refs to unified location
                    if migrated_count > 0:
                        FIXNET_REFS.parent.mkdir(parents=True, exist_ok=True)
                        with open(FIXNET_REFS, 'w') as f:
                            json.dump(refs, f, indent=2)
                        print(f"{GREEN}🔄 Migrated {migrated_count} refs from deprecated location to {FIXNET_REFS}{RESET}")
        
        return refs
    
    def _load_context_branches(self) -> Dict[str, Dict]:
        """Load context-aware branches (script-specific variations)."""
        if CONTEXT_BRANCHES.exists():
            with open(CONTEXT_BRANCHES) as f:
                return json.load(f)
        return {}
    
    def _save_context_branches(self):
        """Save context-aware branches."""
        with open(CONTEXT_BRANCHES, 'w') as f:
            json.dump(self.context_branches, f, indent=2)
    
    def _load_script_counters(self) -> Dict[str, Dict]:
        """Load per-script fix counters and reasoning."""
        if SCRIPT_COUNTERS.exists():
            with open(SCRIPT_COUNTERS) as f:
                return json.load(f)
        return {}
    
    def _save_script_counters(self):
        """Save per-script fix counters."""
        with open(SCRIPT_COUNTERS, 'w') as f:
            json.dump(self.script_counters, f, indent=2)
    
    def _extract_keywords_from_fix(self, error_signature: str, solution: str, 
                                    error_type: str) -> List[str]:
        """
        Extract meaningful keywords from error and solution for searchability.
        Similar to template keyword extraction.
        """
        import re
        
        keywords = set()
        
        # Add error type
        if error_type:
            keywords.add(error_type.lower().replace('error', '').replace('exception', ''))
        
        # Extract words from error signature
        error_words = re.findall(r'\b\w+\b', error_signature.lower())
        # Extract words from solution
        solution_words = re.findall(r'\b\w+\b', solution.lower())
        
        # Stop words to filter out
        stop_words = {'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 
                     'that', 'this', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
                     'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                     'should', 'may', 'might', 'must', 'can', 'error', 'line', 'file'}
        
        # Add meaningful words
        for word in error_words + solution_words:
            if word not in stop_words and len(word) > 2:
                keywords.add(word)
        
        # Extract library/module names (common patterns)
        lib_patterns = ['import', 'from', 'module', 'package', 'library']
        combined_text = f"{error_signature} {solution}".lower()
        
        for pattern in lib_patterns:
            if pattern in combined_text:
                # Try to extract library name after the pattern
                parts = combined_text.split(pattern)
                if len(parts) > 1:
                    next_words = parts[1].strip().split()[:2]
                    keywords.update(w for w in next_words if w not in stop_words)
        
        return list(keywords)[:15]  # Limit to 15 most relevant keywords
    
    def _generate_fix_hash(self, error_signature: str, solution: str, user_id: str) -> str:
        """
        Generate a unique hash ID for a fix.
        
        Args:
            error_signature: The error signature
            solution: The solution text
            user_id: User's client ID
        
        Returns:
            16-character hex hash
        """
        import hashlib
        combined = f"{error_signature}:{solution}:{user_id}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    def _check_hash_conflicts(self, fix_hash: str, exclude_key: str = None) -> bool:
        """
        Check if a hash conflicts with existing fixes in LOCAL and GLOBAL consensus.
        Cross-checks:
        1. Local dictionary fixes
        2. Remote FixNet refs (from all sources)
        3. Consensus dictionary remote refs
        
        Args:
            fix_hash: Hash to check
            exclude_key: Dictionary key to exclude from check (for current fix)
        
        Returns:
            True if conflict exists, False otherwise
        """
        # Check LOCAL dictionary
        for key, fixes in self.dictionary.items():
            if exclude_key and key == exclude_key:
                continue
            for fix in fixes:
                if fix.get('fix_hash') == fix_hash:
                    return True
        
        # Check REMOTE refs (loaded from all sources)
        for remote_fix in self.remote_refs:
            if remote_fix.get('fix_hash') == fix_hash:
                return True
        
        # NOTE: remote_refs already includes both FIXNET_REFS and REMOTE_REFS
        # from _load_remote_refs() which merges them
        
        return False
    
    def cleanup_orphaned_fixes(self):
        """
        Migrate and repair fixes - backfill missing keywords, fix hashes.
        Only removes truly broken fixes (no error_signature AND no solution).
        Sorts fixes by relevance after cleanup.
        """
        migrated_keywords = 0
        fixed_hashes = 0
        removed_count = 0
        
        for key in list(self.dictionary.keys()):
            fixes = self.dictionary[key]
            valid_fixes = []
            
            for fix in fixes:
                # Check if fix has enough data to be useful
                error_sig = fix.get('error_signature', '')
                solution = fix.get('solution', '')
                error_type = fix.get('error_type', '')
                
                # If no error_signature AND no solution - truly broken, remove
                if not error_sig and not solution:
                    removed_count += 1
                    continue
                
                # MIGRATE: Backfill missing keywords
                if not fix.get('keywords') or len(fix['keywords']) == 0:
                    keywords = self._extract_keywords_from_fix(error_sig, solution, error_type)
                    if keywords:
                        fix['keywords'] = keywords
                        fix['version'] = fix.get('version', 1) + 1
                        migrated_keywords += 1
                
                # MIGRATE: Backfill missing fields
                if not fix.get('script_name') and fix.get('script_path'):
                    fix['script_name'] = Path(fix['script_path']).name
                if not fix.get('version'):
                    fix['version'] = 1
                if not fix.get('author_label'):
                    try:
                        from core.founder_config import get_author_label
                    except ImportError:
                        from founder_config import get_author_label
                    fix['author_label'] = get_author_label(fix.get('user_id', self.user_id))
                
                # FIX: Missing or invalid hash
                fix_hash = fix.get('fix_hash')
                if not fix_hash or fix_hash == 'unknown':
                    new_hash = self._generate_fix_hash(error_sig, solution, fix.get('user_id', self.user_id))
                    fix['fix_hash'] = new_hash
                    fixed_hashes += 1
                
                # FIX: Hash conflict
                elif self._check_hash_conflicts(fix['fix_hash'], exclude_key=key):
                    import time
                    new_hash = self._generate_fix_hash(error_sig, solution + str(time.time()), fix.get('user_id', self.user_id))
                    fix['fix_hash'] = new_hash
                    fixed_hashes += 1
                
                valid_fixes.append(fix)
            
            # Sort fixes by relevance (highest first)
            valid_fixes.sort(key=lambda x: x.get('relevance_score', 0), reverse=True)
            
            if valid_fixes:
                self.dictionary[key] = valid_fixes
            else:
                del self.dictionary[key]
        
        # Report
        if migrated_keywords > 0 or fixed_hashes > 0 or removed_count > 0:
            self._save_dictionary()
            print(f"{CYAN}🔧 Fix Dictionary Migration:{RESET}")
            if migrated_keywords > 0:
                print(f"{GREEN}   ✅ Backfilled keywords: {migrated_keywords} fixes{RESET}")
            if fixed_hashes > 0:
                print(f"{GREEN}   ✅ Regenerated hashes: {fixed_hashes} fixes{RESET}")
            if removed_count > 0:
                print(f"{YELLOW}   ⚠️  Removed broken: {removed_count} fixes{RESET}")
            print()
        
        return removed_count
    
    def find_similar_fix(self, error_signature: str, solution: str) -> Optional[str]:
        """
        Find existing fix with similar error and solution.
        Returns fix_hash if found.
        """
        normalized_error = self._normalize_error(error_signature)
        normalized_solution = solution.lower().strip()
        
        for key, fixes in self.dictionary.items():
            # Check if normalized errors are similar
            if self._calculate_similarity(normalized_error, key) > 0.85:
                for fix in fixes:
                    # Check if solutions are very similar
                    existing_solution = fix['solution'].lower().strip()
                    if self._calculate_similarity(normalized_solution, existing_solution) > 0.85:
                        return fix['fix_hash']
        
        return None
    
    def merge_keywords_into_fix(self, fix_hash: str, new_keywords: List[str]) -> bool:
        """
        Merge new keywords into existing fix.
        Deduplicates and updates the fix.
        """
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                if fix['fix_hash'] == fix_hash:
                    existing_keywords = set(fix.get('keywords', []))
                    new_keywords_set = set(new_keywords)
                    
                    # Merge keywords
                    merged = existing_keywords | new_keywords_set
                    
                    # Update fix
                    fix['keywords'] = list(merged)
                    fix['updated'] = datetime.now().isoformat()
                    fix['version'] = fix.get('version', 1) + 1
                    
                    self._save_dictionary()
                    print(f"{CYAN}🔄 Merged {len(new_keywords_set - existing_keywords)} new keywords into fix {fix_hash[:8]}{RESET}")
                    return True
        
        return False
    
    def add_fix(self,
                error_type: str,
                error_signature: str,
                solution: str,
                fix_hash: str,
                context: Dict[str, Any],
                commit_url: Optional[str] = None,
                script_path: Optional[str] = None,
                inspired_by: Optional[str] = None,
                variation_reason: Optional[str] = None,
                keywords: Optional[List[str]] = None) -> str:
        """
        Add a new fix to the dictionary with smart keyword management:
        - Cleanup orphaned fixes (no keywords)
        - Extract keywords automatically
        - Check for duplicates and merge keywords
        - Only save if has valid keywords
        
        Args:
            error_type: Classification of error (NameError, SyntaxError, etc.)
            error_signature: Normalized error pattern
            solution: Fix that was applied
            fix_hash: Unique hash of the fix
            context: Additional context
            commit_url: GitHub commit URL if uploaded
            script_path: Path to script where fix was applied
            inspired_by: Hash of fix that inspired this one
            variation_reason: Why this variation was needed
            keywords: Optional manual keywords (auto-generated if not provided)
        
        Returns:
            Dictionary key for this fix
        """
        # STEP 1: Cleanup orphaned fixes before adding new one
        self.cleanup_orphaned_fixes()
        
        # STEP 2: Extract or validate keywords
        if not keywords:
            keywords = self._extract_keywords_from_fix(error_signature, solution, error_type)
        
        # Ensure we have keywords
        if not keywords or len(keywords) == 0:
            print(f"{RED}⚠️  Cannot save fix without keywords - would be unsearchable{RESET}")
            # Still track counter but don't save to dictionary
            script_name = Path(script_path).name if script_path else "unknown"
            self._increment_script_counter(script_name, error_type, fix_hash, solution, variation_reason)
            return ""
        
        # STEP 3: Check if similar fix already exists
        existing_fix_hash = self.find_similar_fix(error_signature, solution)
        
        if existing_fix_hash:
            # Similar fix exists - merge keywords
            self.merge_keywords_into_fix(existing_fix_hash, keywords)
            print(f"{CYAN}🔄 Updated existing fix with new keywords{RESET}")
            print(f"{BLUE}   Keywords: {', '.join(keywords[:5])}{'...' if len(keywords) > 5 else ''}{RESET}")
            return self._normalize_error(error_signature)
        
        # STEP 4: Create new fix entry
        # Normalize error signature for matching
        normalized_key = self._normalize_error(error_signature)
        
        # Track script-specific counter
        script_name = Path(script_path).name if script_path else "unknown"
        self._increment_script_counter(script_name, error_type, fix_hash, solution, variation_reason)
        
        # Check if founder and add label
        try:
            from core.founder_config import is_founder, get_author_label
            from core.time_validator import get_consensus_timestamp
        except ImportError:
            from founder_config import is_founder, get_author_label
            from time_validator import get_consensus_timestamp
        
        # Get validated timestamp (only if online)
        ts_info = get_consensus_timestamp()
        
        # Create fix entry with keywords
        fix_entry = {
            "fix_hash": fix_hash,
            "user_id": self.user_id,
            "author_label": get_author_label(self.user_id),  # Add founder label if applicable
            "error_type": error_type,
            "error_signature": error_signature,
            "solution": solution,
            "keywords": keywords,  # Add keywords
            "context": context,
            "commit_url": commit_url,
            "script_path": script_path,
            "script_name": script_name,
            "success_count": 1,
            "usage_count": 1,
            "relevance_score": 1.0,
            "version": 1,
            "branches": [],  # Will link to related fixes
            "inspired_by": inspired_by,
            "variation_reason": variation_reason
        }
        
        # Only add timestamp if validated (online and accurate)
        if ts_info['validated']:
            fix_entry['timestamp'] = ts_info['timestamp']
            fix_entry['timezone'] = ts_info['timezone']
            fix_entry['utc_offset'] = ts_info['utc_offset']
        
        # Add to dictionary
        if normalized_key not in self.dictionary:
            self.dictionary[normalized_key] = []
        
        self.dictionary[normalized_key].append(fix_entry)
        self._save_dictionary()
        
        # Create context branch if inspired by another fix
        if inspired_by:
            self._create_context_branch(fix_hash, inspired_by, script_name, variation_reason)
        
        print(f"{GREEN}📚 Added to dictionary: {normalized_key}{RESET}")
        print(f"{BLUE}   Fix hash: {fix_hash[:12]}...{RESET}")
        print(f"{BLUE}   Keywords: {', '.join(keywords[:5])}{'...' if len(keywords) > 5 else ''}{RESET}")
        if script_name:
            print(f"{BLUE}   Script: {script_name}{RESET}")
        if inspired_by:
            print(f"{PURPLE}   🌿 Branched from: {inspired_by[:12]}...{RESET}")
            if variation_reason:
                print(f"{CYAN}   📝 Reason: {variation_reason}{RESET}")
        
        return normalized_key
    
    def search_similar_fixes(self, 
                             error: str,
                             error_type: Optional[str] = None,
                             min_relevance: float = 0.5) -> List[Dict[str, Any]]:
        """
        Search for similar fixes in local and remote dictionaries.
        
        Args:
            error: Error message to match
            error_type: Optional error type filter
            min_relevance: Minimum relevance score threshold
        
        Returns:
            List of matching fixes sorted by relevance
        """
        normalized = self._normalize_error(error)
        matches = []
        
        # Search local dictionary
        print(f"{BLUE}🔍 Searching local dictionary...{RESET}")
        local_matches = self._search_local(normalized, error_type, min_relevance)
        matches.extend(local_matches)
        
        # Search remote references
        print(f"{BLUE}🌐 Searching remote FixNet...{RESET}")
        remote_matches = self._search_remote(normalized, error_type, min_relevance)
        matches.extend(remote_matches)
        
        # Sort by relevance score
        matches.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        if matches:
            print(f"{GREEN}✅ Found {len(matches)} similar fixes{RESET}")
        else:
            print(f"{GOLD}💡 No similar fixes found - this will be the first!{RESET}")
        
        return matches
    
    def search_by_keywords(self, *search_keywords: str) -> List[Dict[str, Any]]:
        """
        Search for fixes by keywords/tags.
        Similar to template search - finds fixes with matching keywords.
        
        Args:
            *search_keywords: One or more keywords to search for
        
        Returns:
            List of matching fixes sorted by relevance
        """
        matches = []
        search_keywords_set = set(kw.lower() for kw in search_keywords)
        
        print(f"{BLUE}🔍 Searching fixes by keywords: {', '.join(search_keywords)}...{RESET}")
        
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                fix_keywords = set(kw.lower() for kw in fix.get('keywords', []))
                
                # Calculate keyword match score
                matched_keywords = search_keywords_set & fix_keywords
                
                if matched_keywords:
                    match_score = len(matched_keywords) / len(search_keywords_set)
                    
                    match = fix.copy()
                    match['keyword_match_score'] = match_score
                    match['matched_keywords'] = list(matched_keywords)
                    match['source'] = 'local'
                    matches.append(match)
        
        # Sort by keyword match score
        matches.sort(key=lambda x: x['keyword_match_score'], reverse=True)
        
        if matches:
            print(f"{GREEN}✅ Found {len(matches)} fixes matching keywords{RESET}")
            for match in matches[:3]:  # Show top 3
                print(f"{BLUE}   • {match['error_type']}: {', '.join(match['matched_keywords'])}{RESET}")
        else:
            print(f"{GOLD}💡 No fixes found with these keywords{RESET}")
        
        return matches
    
    def search_by_program(self, program_name: str) -> List[Dict[str, Any]]:
        """
        Search for fixes related to a specific program, library, or module.
        Now also searches keywords for better results.
        
        Args:
            program_name: Name of program/library (e.g., 'numpy', 'pandas', 'flask')
        
        Returns:
            List of matching fixes
        """
        program_lower = program_name.lower()
        matches = []
        
        print(f"{BLUE}🔍 Searching for fixes related to '{program_name}'...{RESET}")
        
        # Search local dictionary
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                # Check in keywords first (best match)
                fix_keywords = [kw.lower() for kw in fix.get('keywords', [])]
                if program_lower in fix_keywords:
                    match = fix.copy()
                    match['source'] = 'local'
                    match['match_type'] = 'keyword'
                    matches.append(match)
                    continue
                
                # Check in solution, error signature, and context
                solution = fix.get('solution', '').lower()
                error_sig = fix.get('error_signature', '').lower()
                context_str = str(fix.get('context', {})).lower()
                
                if (program_lower in solution or 
                    program_lower in error_sig or 
                    program_lower in context_str):
                    match = fix.copy()
                    match['source'] = 'local'
                    matches.append(match)
        
        # Search remote references
        for ref in self.remote_refs:
            error_type = ref.get('error_type', '').lower()
            script = ref.get('script', '').lower()
            
            if program_lower in error_type or program_lower in script:
                match = {
                    'fix_hash': ref['fix_hash'],
                    'user_id': ref['user_id'],
                    'error_type': ref.get('error_type', 'Unknown'),
                    'timestamp': ref.get('timestamp'),
                    'source': 'remote',
                    'note': 'Encrypted - contributed by another user'
                }
                matches.append(match)
        
        if matches:
            print(f"{GREEN}✅ Found {len(matches)} fixes related to '{program_name}'{RESET}")
        else:
            print(f"{GOLD}💡 No fixes found for '{program_name}'{RESET}")
        
        return matches
    
    def _search_local(self,
                     normalized_error: str,
                     error_type: Optional[str],
                     min_relevance: float) -> List[Dict]:
        """Search local dictionary."""
        matches = []
        
        for key, fixes in self.dictionary.items():
            # Calculate similarity
            similarity = self._calculate_similarity(normalized_error, key)
            
            if similarity < 0.3:  # Too different
                continue
            
            for fix in fixes:
                # Filter by error type if specified
                if error_type and fix['error_type'] != error_type:
                    continue
                
                # Calculate relevance
                relevance = self._calculate_relevance(fix, similarity)
                
                if relevance >= min_relevance:
                    match = fix.copy()
                    match['relevance_score'] = relevance
                    match['source'] = 'local'
                    match['similarity'] = similarity
                    matches.append(match)
        
        return matches
    
    def _search_remote(self,
                      normalized_error: str,
                      error_type: Optional[str],
                      min_relevance: float) -> List[Dict]:
        """Search remote references."""
        matches = []
        
        for ref in self.remote_refs:
            # Skip own fixes (already in local)
            if ref.get('user_id') == self.user_id:
                continue
            
            # Filter by error type
            if error_type and ref.get('error_type') != error_type:
                continue
            
            # Calculate similarity (using limited metadata)
            script_similarity = 0.3  # Base score for same error type
            
            # We can't see the actual error text (encrypted), but we can use metadata
            if ref.get('script'):
                # Higher score if script names are similar
                script_similarity += 0.2
            
            relevance = script_similarity
            
            if relevance >= min_relevance:
                match = {
                    'fix_hash': ref['fix_hash'],
                    'user_id': ref['user_id'],
                    'error_type': ref.get('error_type', 'Unknown'),
                    'timestamp': ref.get('timestamp'),
                    'encrypted_file': ref.get('encrypted_file'),
                    'relevance_score': relevance,
                    'source': 'remote',
                    'note': 'Encrypted - contributed by another user'
                }
                matches.append(match)
        
        return matches
    
    def _increment_script_counter(self, script_name: str, error_type: str, 
                                   fix_hash: str, solution: str, reason: Optional[str]):
        """Track how many times a similar fix was applied to different scripts."""
        if script_name not in self.script_counters:
            self.script_counters[script_name] = {
                "total_fixes": 0,
                "error_types": {},
                "fix_history": []
            }
        
        counter = self.script_counters[script_name]
        counter["total_fixes"] += 1
        
        if error_type not in counter["error_types"]:
            counter["error_types"][error_type] = 0
        counter["error_types"][error_type] += 1
        
        # Track this fix
        fix_record = {
            "fix_hash": fix_hash,
            "error_type": error_type,
            "solution": solution,
            "timestamp": datetime.now().isoformat(),
            "variation_reason": reason
        }
        counter["fix_history"].append(fix_record)
        
        self._save_script_counters()
    
    def _create_context_branch(self, new_fix_hash: str, inspired_by_hash: str,
                               script_name: str, reason: Optional[str]):
        """Create a context-aware branch showing why fix varies across scripts."""
        branch_key = f"{inspired_by_hash}:{new_fix_hash}"
        
        self.context_branches[branch_key] = {
            "original_fix": inspired_by_hash,
            "variant_fix": new_fix_hash,
            "script_context": script_name,
            "variation_reason": reason or "Applied to different script",
            "created": datetime.now().isoformat(),
            "relationship_type": "context_variant"
        }
        
        self._save_context_branches()
    
    def create_branch(self,
                     original_fix_hash: str,
                     inspired_by_hash: str,
                     relationship: str = "solved_similar",
                     script_context: Optional[str] = None,
                     variation_reason: Optional[str] = None):
        """
        Create a branch connection between fixes.
        
        Args:
            original_fix_hash: Your fix
            inspired_by_hash: Fix that helped solve it
            relationship: Type of relationship
            script_context: Script where variant was applied
            variation_reason: Why this variation exists
        """
        if original_fix_hash not in self.branches:
            self.branches[original_fix_hash] = []
        
        branch_link = {
            "target_hash": inspired_by_hash,
            "relationship": relationship,
            "created": datetime.now().isoformat(),
            "script_context": script_context,
            "variation_reason": variation_reason
        }
        
        self.branches[original_fix_hash].append(branch_link)
        self._save_branches()
        
        # Also update the fix entry in dictionary
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                if fix['fix_hash'] == original_fix_hash:
                    if 'branches' not in fix:
                        fix['branches'] = []
                    fix['branches'].append(branch_link)
                    self._save_dictionary()
                    break
        
        # Create context branch if script-specific
        if script_context and variation_reason:
            self._create_context_branch(original_fix_hash, inspired_by_hash, script_context, variation_reason)
        
        print(f"{PURPLE}🌿 Branch created: {original_fix_hash[:8]} → {inspired_by_hash[:8]}{RESET}")
        if script_context:
            print(f"{CYAN}   Context: {script_context}{RESET}")
        if variation_reason:
            print(f"{BLUE}   Reason: {variation_reason}{RESET}")
    
    def record_fix_usage(self, fix_hash: str, succeeded: bool):
        """
        Record that a fix was used and whether it succeeded.
        Updates relevance scores.
        """
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                if fix['fix_hash'] == fix_hash:
                    fix['usage_count'] += 1
                    if succeeded:
                        fix['success_count'] += 1
                    
                    # Recalculate relevance score
                    success_rate = fix['success_count'] / fix['usage_count']
                    usage_weight = min(1.0, fix['usage_count'] / 10)  # Cap at 10 uses
                    fix['relevance_score'] = (success_rate * 0.7) + (usage_weight * 0.3)
                    
                    self._save_dictionary()
                    
                    status = f"{GREEN}succeeded{RESET}" if succeeded else f"{RED}failed{RESET}"
                    print(f"{BLUE}📊 Updated fix {fix_hash[:8]}: {status}, score: {fix['relevance_score']:.2f}{RESET}")
                    return
    
    def get_best_fix_for_error(self, error: str, error_type: Optional[str] = None) -> Optional[Dict]:
        """
        Get the best fix for a given error.
        
        Returns:
            Best matching fix or None
        """
        matches = self.search_similar_fixes(error, error_type, min_relevance=0.3)
        
        if not matches:
            return None
        
        # Return highest scoring local fix (we can't decrypt remote ones)
        local_matches = [m for m in matches if m['source'] == 'local']
        
        if local_matches:
            best = local_matches[0]
            print(f"{GOLD}💡 Best fix found (score: {best['relevance_score']:.2f}){RESET}")
            return best
        
        # If only remote matches, suggest pattern
        print(f"{GOLD}💡 {len(matches)} similar fixes found by other users (encrypted){RESET}")
        print(f"{BLUE}   This suggests the error is common - fix will be logged to help others{RESET}")
        return None
    
    def get_branch_tree(self, fix_hash: str, depth: int = 3) -> Dict[str, Any]:
        """
        Get the branch tree for a fix (what it helped solve).
        
        Args:
            fix_hash: Root fix hash
            depth: Maximum depth to traverse
        
        Returns:
            Tree structure of branches
        """
        if fix_hash not in self.branches or depth == 0:
            return {"hash": fix_hash, "branches": []}
        
        tree = {
            "hash": fix_hash,
            "branches": []
        }
        
        for branch in self.branches[fix_hash]:
            child_tree = self.get_branch_tree(branch['target_hash'], depth - 1)
            child_tree['relationship'] = branch['relationship']
            tree['branches'].append(child_tree)
        
        return tree
    
    def sync_with_remote(self):
        """
        Sync local dictionary with remote FixNet references.
        Updates relevance scores based on collective usage.
        UNIFIED: Uses single source at ~/.luciferai/fixnet/refs.json
        """
        print(f"{BLUE}🔄 Syncing with FixNet...{RESET}")
        
        # Reload remote refs (includes migration from deprecated location)
        self.remote_refs = self._load_remote_refs()
        
        # Save to UNIFIED location
        FIXNET_REFS.parent.mkdir(parents=True, exist_ok=True)
        with open(FIXNET_REFS, 'w') as f:
            json.dump(self.remote_refs, f, indent=2)
        
        print(f"{GREEN}✅ Synced {len(self.remote_refs)} remote fixes{RESET}")
    
    def _normalize_error(self, error: str) -> str:
        """Normalize error for consistent matching."""
        # Remove file paths, line numbers, variable names
        normalized = error.lower()
        
        # Remove line numbers
        normalized = ' '.join(w for w in normalized.split() if not w.isdigit())
        
        # Remove file paths
        normalized = normalized.split('file')[0] if 'file' in normalized else normalized
        
        # Keep only error type and core message
        for delimiter in ['\n', 'traceback', 'during handling']:
            if delimiter in normalized:
                normalized = normalized.split(delimiter)[0]
        
        return normalized.strip()[:200]  # Limit length
    
    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity between two strings."""
        return difflib.SequenceMatcher(None, str1, str2).ratio()
    
    def _calculate_relevance(self, fix: Dict, base_similarity: float) -> float:
        """
        Calculate relevance score for a fix.
        
        Factors:
        - Similarity to current error (40%)
        - Success rate (30%)
        - Recency (20%)
        - Usage count (10%)
        """
        success_rate = fix.get('success_count', 1) / max(fix.get('usage_count', 1), 1)
        
        # Recency score (newer = higher)
        try:
            timestamp = datetime.fromisoformat(fix['timestamp'])
            days_old = (datetime.now() - timestamp).days
            recency = max(0, 1 - (days_old / 365))  # Decay over a year
        except:
            recency = 0.5
        
        # Usage score
        usage = min(1.0, fix.get('usage_count', 1) / 10)
        
        # Weighted combination
        relevance = (
            base_similarity * 0.4 +
            success_rate * 0.3 +
            recency * 0.2 +
            usage * 0.1
        )
        
        return relevance
    
    def get_script_insights(self, script_name: Optional[str] = None) -> Dict[str, Any]:
        """Get insights about fixes applied to specific scripts."""
        if script_name:
            if script_name in self.script_counters:
                return self.script_counters[script_name]
            return {}
        
        # Return all script insights
        return self.script_counters
    
    def analyze_fix_variations(self, base_fix_hash: str) -> List[Dict]:
        """Analyze how a fix has been adapted for different scripts."""
        variations = []
        
        # Find all fixes inspired by this one
        for key, fixes in self.dictionary.items():
            for fix in fixes:
                if fix.get('inspired_by') == base_fix_hash:
                    variations.append({
                        "fix_hash": fix['fix_hash'],
                        "script": fix.get('script_name', 'unknown'),
                        "solution": fix['solution'],
                        "reason": fix.get('variation_reason', 'Not specified'),
                        "timestamp": fix['timestamp'],
                        "success_rate": fix['success_count'] / fix['usage_count']
                    })
        
        return variations
    
    def print_statistics(self):
        """Print dictionary statistics."""
        total_fixes = sum(len(fixes) for fixes in self.dictionary.values())
        total_branches = sum(len(branches) for branches in self.branches.values())
        context_branches_count = len(self.context_branches)
        total_scripts = len(self.script_counters)
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 Relevance Dictionary Statistics{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        print(f"{GOLD}User ID:{RESET} {self.user_id}")
        print(f"{GOLD}Total Errors Indexed:{RESET} {len(self.dictionary)}")
        print(f"{GOLD}Total Fixes:{RESET} {total_fixes}")
        print(f"{GOLD}Branch Connections:{RESET} {total_branches}")
        print(f"{GOLD}Context Branches:{RESET} {context_branches_count}")
        print(f"{GOLD}Scripts Tracked:{RESET} {total_scripts}")
        print(f"{GOLD}Remote Fixes Available:{RESET} {len(self.remote_refs)}")
        
        # Top error types
        error_types = defaultdict(int)
        for fixes in self.dictionary.values():
            for fix in fixes:
                error_types[fix.get('error_type', 'Unknown')] += 1
        
        if error_types:
            print(f"\n{BLUE}Top Error Types:{RESET}")
            for error_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"  • {error_type}: {count}")
        
        # Script-specific insights
        if self.script_counters:
            print(f"\n{BLUE}Most Fixed Scripts:{RESET}")
            sorted_scripts = sorted(self.script_counters.items(), 
                                  key=lambda x: x[1]['total_fixes'], reverse=True)[:5]
            for script, data in sorted_scripts:
                print(f"  • {script}: {data['total_fixes']} fixes")
        
        # Context branch examples
        if self.context_branches:
            print(f"\n{PURPLE}Recent Context Branches:{RESET}")
            recent = sorted(self.context_branches.items(), 
                          key=lambda x: x[1]['created'], reverse=True)[:3]
            for branch_key, data in recent:
                print(f"  • {data['original_fix'][:8]} → {data['variant_fix'][:8]}")
                print(f"    Script: {data['script_context']}")
                print(f"    Reason: {data['variation_reason']}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")


# Test the relevance dictionary
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing Relevance Dictionary{RESET}\n")
    
    # Create test dictionary
    test_user_id = "TEST_USER_ABC123"
    rd = RelevanceDictionary(test_user_id)
    
    # Test 1: Add a fix
    print(f"{GOLD}Test 1: Adding a fix{RESET}")
    fix_key = rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'session' is not defined",
        solution="Added: from core import session",
        fix_hash="abc123def456",
        context={"line": 42, "function": "parse_request"},
        commit_url="https://github.com/test/commit/abc123"
    )
    print(f"{GREEN}✅ Fix added with key: {fix_key}{RESET}\n")
    
    # Test 2: Search for similar
    print(f"{GOLD}Test 2: Searching for similar errors{RESET}")
    matches = rd.search_similar_fixes("NameError: name 'request' is not defined")
    print(f"{GREEN}✅ Found {len(matches)} matches{RESET}\n")
    
    # Test 3: Create branch
    print(f"{GOLD}Test 3: Creating branch connection{RESET}")
    rd.create_branch("abc123def456", "xyz789", "solved_similar")
    print(f"{GREEN}✅ Branch created{RESET}\n")
    
    # Test 4: Record usage
    print(f"{GOLD}Test 4: Recording fix usage{RESET}")
    rd.record_fix_usage("abc123def456", succeeded=True)
    print(f"{GREEN}✅ Usage recorded{RESET}\n")
    
    # Test 5: Statistics
    print(f"{GOLD}Test 5: Dictionary statistics{RESET}")
    rd.print_statistics()
    
    print(f"{PURPLE}✨ All tests complete{RESET}")
