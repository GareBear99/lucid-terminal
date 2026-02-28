#!/usr/bin/env python3
"""
🔗 LuciferAI FixNet Integration - Complete System Orchestrator
Ties together: SmartFilter, Uploader, Dictionary, and Agent
"""
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# Import all components
from fixnet_uploader import FixNetUploader
from relevance_dictionary import RelevanceDictionary
from smart_upload_filter import SmartUploadFilter
from consensus_dictionary import ConsensusDictionary

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"


class IntegratedFixNet:
    """
    Complete FixNet system integrating all components:
    - SmartUploadFilter: Decides what to upload
    - FixNetUploader: Handles encryption and GitHub push
    - RelevanceDictionary: Tracks fixes and relevance scoring
    """
    
    def __init__(self, user_id: Optional[str] = None):
        print(f"{PURPLE}🌐 Initializing Integrated FixNet...{RESET}")
        
        # Initialize components (order matters!)
        self.uploader = FixNetUploader(user_id=user_id)
        
        # Storage layer: RelevanceDictionary (owns all file I/O)
        self.dictionary = RelevanceDictionary(user_id=self.uploader.user_id)
        
        # Analytics layer: ConsensusDictionary (read-only, calculates scores)
        self.consensus = ConsensusDictionary(
            relevance_dict=self.dictionary,
            user_id=self.uploader.user_id
        )
        
        # Upload filter
        self.smart_filter = SmartUploadFilter(self.dictionary, self.uploader)
        
        # Wire components together
        self.uploader.smart_filter = self.smart_filter
        
        print(f"{GREEN}✅ FixNet ready (User: {self.uploader.user_id}){RESET}")
        print(f"{BLUE}   📊 Consensus tracking: enabled{RESET}\n")
    
    def apply_fix(self,
                  script_path: str,
                  error: str,
                  solution: str,
                  context: Dict[str, Any] = None,
                  auto_upload: bool = True) -> Dict[str, Any]:
        """
        Complete fix application flow:
        1. Search for similar fixes in dictionary
        2. Decide if should upload (smart filter)
        3. Upload if novel/branching (or keep local)
        4. Update dictionary with relevance tracking
        5. Create branch if inspired by another fix
        
        Args:
            script_path: Path to script that was fixed
            error: Original error message
            solution: Fix that was applied
            context: Additional metadata
            auto_upload: Whether to auto-upload (or just save locally)
        
        Returns:
            Dict with fix info and upload status
        """
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}🔧 LuciferAI Fix Application{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        context = context or {}
        error_type = self.uploader._classify_error(error)
        
        # Step 1: Search for similar fixes
        print(f"{BLUE}[1/5] Checking for similar fixes...{RESET}")
        similar_fixes = self.dictionary.search_similar_fixes(
            error=error,
            error_type=error_type,
            min_relevance=0.3
        )
        
        inspired_by = None
        if similar_fixes and similar_fixes[0].get('source') == 'local':
            best_match = similar_fixes[0]
            print(f"{GOLD}💡 Found similar local fix (relevance: {best_match['relevance_score']:.2f}){RESET}")
            inspired_by = {
                'fix_hash': best_match['fix_hash'],
                'solution': best_match.get('solution', '')
            }
        
        # Step 2-4: Upload (with smart filtering)
        commit_url = None
        was_uploaded = False
        
        if auto_upload:
            print(f"\n{BLUE}[2/5] Processing upload...{RESET}")
            commit_url, was_uploaded, fix_hash = self.uploader.full_fix_upload_flow(
                script_path=script_path,
                error=error,
                solution=solution,
                context=context,
                inspired_by=inspired_by.get('fix_hash') if inspired_by else None
            )
        else:
            print(f"{BLUE}[2/5] Skipping upload (auto_upload=False){RESET}")
            # Still create patch locally
            patch_info = self.uploader.create_fix_patch(script_path, error, solution, context)
            commit_url = None
            was_uploaded = False
            fix_hash = patch_info['fix_hash']
        
        # Step 5: Add to dictionary
        print(f"\n{BLUE}[3/5] Adding to relevance dictionary...{RESET}")
        
        dict_key = self.dictionary.add_fix(
            error_type=error_type,
            error_signature=error,
            solution=solution,
            fix_hash=fix_hash,
            context=context,
            commit_url=commit_url
        )
        
        # Step 6: Create branch if inspired
        if inspired_by and was_uploaded:
            print(f"\n{BLUE}[4/5] Creating branch relationship...{RESET}")
            self.dictionary.create_branch(
                original_fix_hash=fix_hash,
                inspired_by_hash=inspired_by['fix_hash'],
                relationship="inspired_by"
            )
        else:
            print(f"\n{BLUE}[4/5] No branch relationship needed{RESET}")
        
        # Step 7: Sync with remote
        print(f"\n{BLUE}[5/5] Syncing with remote FixNet...{RESET}")
        self.dictionary.sync_with_remote()
        
        # Result summary
        result = {
            'fix_hash': fix_hash,
            'error_type': error_type,
            'was_uploaded': was_uploaded,
            'commit_url': commit_url,
            'local_only': not was_uploaded,
            'inspired_by': inspired_by,
            'dictionary_key': dict_key,
            'similar_fixes_found': len(similar_fixes)
        }
        
        # Print summary
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 Fix Summary{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}Fix Hash:{RESET} {fix_hash[:12]}...")
        print(f"{GOLD}Error Type:{RESET} {error_type}")
        print(f"{GOLD}Upload Status:{RESET} {'✅ Uploaded to GitHub' if was_uploaded else '📁 Saved locally only'}")
        
        if commit_url:
            print(f"{GOLD}Commit URL:{RESET} {commit_url}")
        
        if inspired_by:
            print(f"{GOLD}Inspired By:{RESET} {inspired_by['fix_hash'][:12]}... (branch created)")
        
        print(f"{GOLD}Similar Fixes:{RESET} {len(similar_fixes)} found")
        
        print(f"\n{GREEN}✅ Fix application complete!{RESET}\n")
        
        return result
    
    def search_fixes(self, error: str, error_type: Optional[str] = None) -> list:
        """Search for fixes matching an error."""
        return self.dictionary.search_similar_fixes(error, error_type)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive statistics."""
        dict_stats = {
            'total_local_fixes': sum(len(fixes) for fixes in self.dictionary.dictionary.values()),
            'total_error_types': len(self.dictionary.dictionary),
            'remote_fixes': len(self.dictionary.remote_refs),
            'branch_connections': sum(len(branches) for branches in self.dictionary.branches.values())
        }
        
        filter_stats = self.smart_filter.get_upload_stats()
        
        return {
            'user_id': self.uploader.user_id,
            'dictionary': dict_stats,
            'filter': filter_stats,
            'commits': len(self.uploader.commit_history)
        }
    
    def print_statistics(self):
        """Print comprehensive statistics."""
        stats = self.get_statistics()
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}📊 Integrated FixNet Statistics{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}👤 User ID:{RESET} {stats['user_id']}")
        
        print(f"\n{BLUE}📚 Local Dictionary:{RESET}")
        print(f"   • Total fixes: {stats['dictionary']['total_local_fixes']}")
        print(f"   • Error types: {stats['dictionary']['total_error_types']}")
        print(f"   • Branch connections: {stats['dictionary']['branch_connections']}")
        
        print(f"\n{BLUE}🌐 Remote FixNet:{RESET}")
        print(f"   • Community fixes available: {stats['dictionary']['remote_fixes']}")
        
        print(f"\n{BLUE}🎯 Smart Filter:{RESET}")
        print(f"   • Novel uploads: {stats['filter']['novel_uploads']}")
        print(f"   • Rejected duplicates: {stats['filter']['rejected_duplicates']}")
        print(f"   • Rejection rate: {stats['filter']['rejection_rate']:.1f}%")
        
        print(f"\n{BLUE}📤 GitHub Commits:{RESET}")
        print(f"   • Total commits: {stats['commits']}")
        
        if stats['filter']['rejection_rate'] > 50:
            print(f"\n{GREEN}✨ Excellent! Smart filter is preventing duplicate pollution.{RESET}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")


# CLI for testing
if __name__ == "__main__":
    print(f"{PURPLE}╔════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║   🌐 Integrated FixNet Test Suite     ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════╝{RESET}\n")
    
    # Initialize system
    fixnet = IntegratedFixNet()
    
    # Test 1: Apply a novel fix
    print(f"\n{GOLD}{'='*60}{RESET}")
    print(f"{GOLD}Test 1: Novel fix (should upload){RESET}")
    print(f"{GOLD}{'='*60}{RESET}")
    
    result1 = fixnet.apply_fix(
        script_path="test_script.py",
        error="NameError: name 'json' is not defined",
        solution="import json",
        context={"line": 10, "function": "load_config"},
        auto_upload=True
    )
    
    print(f"\n{GREEN}Result:{RESET} {result1['was_uploaded']}")
    
    # Test 2: Apply same fix again (should reject)
    print(f"\n{GOLD}{'='*60}{RESET}")
    print(f"{GOLD}Test 2: Duplicate fix (should keep local){RESET}")
    print(f"{GOLD}{'='*60}{RESET}")
    
    result2 = fixnet.apply_fix(
        script_path="test_script.py",
        error="NameError: name 'json' is not defined",
        solution="import json",
        context={"line": 15, "function": "save_config"},
        auto_upload=True
    )
    
    print(f"\n{GREEN}Result:{RESET} {result2['was_uploaded']}")
    
    # Test 3: Similar error with different fix (branch)
    print(f"\n{GOLD}{'='*60}{RESET}")
    print(f"{GOLD}Test 3: Variation fix (branch relationship){RESET}")
    print(f"{GOLD}{'='*60}{RESET}")
    
    result3 = fixnet.apply_fix(
        script_path="test_script.py",
        error="NameError: name 'os' is not defined",
        solution="import os",
        context={"line": 20, "function": "check_path"},
        auto_upload=True
    )
    
    print(f"\n{GREEN}Result:{RESET} {result3['was_uploaded']}")
    
    # Test 4: Search for fixes
    print(f"\n{GOLD}{'='*60}{RESET}")
    print(f"{GOLD}Test 4: Search for similar fixes{RESET}")
    print(f"{GOLD}{'='*60}{RESET}")
    
    matches = fixnet.search_fixes("NameError: name 'sys' is not defined", "NameError")
    print(f"\n{GREEN}Found {len(matches)} similar fixes{RESET}")
    
    for i, match in enumerate(matches[:3], 1):
        print(f"\n{BLUE}Match {i}:{RESET}")
        print(f"  Hash: {match['fix_hash'][:12]}...")
        print(f"  Relevance: {match['relevance_score']:.2f}")
        print(f"  Source: {match['source']}")
    
    # Final statistics
    print(f"\n{GOLD}{'='*60}{RESET}")
    print(f"{GOLD}Final Statistics{RESET}")
    print(f"{GOLD}{'='*60}{RESET}")
    
    fixnet.print_statistics()
    
    # Show smart filter stats separately
    fixnet.smart_filter.print_stats()
    
    print(f"\n{GREEN}✨ All integration tests complete!{RESET}")
    print(f"{BLUE}📂 Check ~/.luciferai/ for generated files{RESET}")
