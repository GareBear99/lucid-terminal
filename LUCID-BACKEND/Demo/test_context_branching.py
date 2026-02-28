#!/usr/bin/env python3
"""
🌳 Context-Aware Branching & Consensus Upload Demo

Demonstrates:
1. First fix applied to auth.py
2. Similar error in api_handler.py
3. Variation needed for different context
4. Local branching with reasoning
5. Upload to consensus with branch metadata
6. Script counters tracking variations
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from relevance_dictionary import RelevanceDictionary
from fixnet_uploader import FixNetUploader

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"


def print_header(text):
    """Print formatted header."""
    print(f"\n{PURPLE}{'='*70}{RESET}")
    print(f"{PURPLE}{text}{RESET}")
    print(f"{PURPLE}{'='*70}{RESET}\n")


def print_step(num, total, text):
    """Print step indicator."""
    print(f"{BLUE}[{num}/{total}]{RESET} {CYAN}{text}{RESET}\n")


def demo_context_branching():
    """Demonstrate context-aware branching and consensus upload."""
    
    print_header("🌳 Context-Aware Branching & Consensus Upload Demo")
    
    # Initialize
    user_id = "DEMO_USER_ABC123"
    rd = RelevanceDictionary(user_id)
    uploader = FixNetUploader(user_id)
    
    print(f"{CYAN}User ID:{RESET} {user_id}")
    print(f"{CYAN}Session:{RESET} Demonstrating fix variations across scripts\n")
    
    input(f"{YELLOW}Press Enter to start...{RESET}\n")
    
    # ============================================================
    # STEP 1: First fix - auth.py
    # ============================================================
    print_header("[1/5] First Fix: Missing import in auth.py")
    
    print(f"{CYAN}Scenario:{RESET}")
    print(f"  • Script: auth.py")
    print(f"  • Error: NameError: name 'session' is not defined")
    print(f"  • Context: Flask authentication system\n")
    
    fix1_hash = "fix_auth_abc123"
    fix1_solution = "from flask import session"
    
    print(f"{GREEN}Applying fix...{RESET}\n")
    
    # Add to local dictionary
    rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'session' is not defined",
        solution=fix1_solution,
        fix_hash=fix1_hash,
        context={"line": 42, "function": "authenticate_user"},
        script_path="/project/auth.py"
    )
    
    print(f"{GREEN}✅ Fix added to local dictionary{RESET}")
    print(f"{BLUE}   Fix hash: {fix1_hash}{RESET}")
    print(f"{BLUE}   Script: auth.py{RESET}")
    print(f"{BLUE}   Solution: {fix1_solution}{RESET}\n")
    
    input(f"{YELLOW}Press Enter to continue...{RESET}\n")
    
    # ============================================================
    # STEP 2: Similar error in different script
    # ============================================================
    print_header("[2/5] Similar Error: Different script context")
    
    print(f"{CYAN}Scenario:{RESET}")
    print(f"  • Script: api_handler.py")
    print(f"  • Error: NameError: name 'session' is not defined")
    print(f"  • Context: API endpoint handler\n")
    
    print(f"{YELLOW}🔍 Searching for similar fixes...{RESET}\n")
    matches = rd.search_similar_fixes(
        "NameError: name 'session' is not defined",
        error_type="NameError"
    )
    
    if matches:
        print(f"{GREEN}✅ Found {len(matches)} matching fix(es):{RESET}\n")
        for i, match in enumerate(matches[:3], 1):
            print(f"  {BLUE}{i}. {match['solution']}{RESET}")
            print(f"     Score: {match['relevance_score']:.2f}")
            print(f"     From: {match.get('script_name', 'unknown')}\n")
    
    input(f"{YELLOW}Press Enter to continue...{RESET}\n")
    
    # ============================================================
    # STEP 3: Apply variation with reasoning
    # ============================================================
    print_header("[3/5] Creating Context Variant")
    
    print(f"{CYAN}Analysis:{RESET}")
    print(f"  • Found fix from auth.py works similarly")
    print(f"  • BUT: API context needs request.session instead")
    print(f"  • Reason: Blueprint-specific import pattern\n")
    
    fix2_hash = "fix_api_def456"
    fix2_solution = "from flask import session, request"
    variation_reason = "API blueprint requires both session and request imports for endpoint context"
    
    print(f"{GREEN}Creating variant fix...{RESET}\n")
    
    # Add variant to local dictionary
    rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'session' is not defined",
        solution=fix2_solution,
        fix_hash=fix2_hash,
        context={"line": 78, "function": "handle_api_request"},
        script_path="/project/api_handler.py",
        inspired_by=fix1_hash,
        variation_reason=variation_reason
    )
    
    print(f"{GREEN}✅ Context variant created{RESET}\n")
    
    # Show script counters
    print(f"{CYAN}📊 Script counters updated:{RESET}\n")
    
    auth_stats = rd.get_script_insights("auth.py")
    api_stats = rd.get_script_insights("api_handler.py")
    
    print(f"  {BLUE}auth.py:{RESET}")
    print(f"    Total fixes: {auth_stats.get('total_fixes', 0)}")
    print(f"    Error types: {list(auth_stats.get('error_types', {}).keys())}\n")
    
    print(f"  {BLUE}api_handler.py:{RESET}")
    print(f"    Total fixes: {api_stats.get('total_fixes', 0)}")
    print(f"    Error types: {list(api_stats.get('error_types', {}).keys())}\n")
    
    input(f"{YELLOW}Press Enter to continue...{RESET}\n")
    
    # ============================================================
    # STEP 4: Analyze variations
    # ============================================================
    print_header("[4/5] Analyzing Fix Variations")
    
    print(f"{CYAN}Finding all variations of original fix...{RESET}\n")
    
    variations = rd.analyze_fix_variations(fix1_hash)
    
    if variations:
        print(f"{GREEN}Found {len(variations)} variation(s):{RESET}\n")
        for var in variations:
            print(f"  {PURPLE}🌿 {var['fix_hash'][:12]}...{RESET}")
            print(f"     Script: {var['script']}")
            print(f"     Solution: {var['solution']}")
            print(f"     Reason: {var['reason']}")
            print(f"     Success: {var['success_rate']:.0%}\n")
    else:
        print(f"{YELLOW}No variations yet (would show after second fix is used){RESET}\n")
    
    input(f"{YELLOW}Press Enter to continue...{RESET}\n")
    
    # ============================================================
    # STEP 5: Upload to consensus
    # ============================================================
    print_header("[5/5] Uploading to Consensus with Branch Metadata")
    
    print(f"{CYAN}Preparing to upload variant to GitHub consensus...{RESET}\n")
    
    print(f"{YELLOW}Upload Details:{RESET}")
    print(f"  • Original fix: {fix1_hash[:12]}... (auth.py)")
    print(f"  • Variant fix: {fix2_hash[:12]}... (api_handler.py)")
    print(f"  • Relationship: context_variant")
    print(f"  • Reason: {variation_reason}\n")
    
    input(f"{YELLOW}Press Enter to upload (simulation)...{RESET}\n")
    
    # Simulate upload
    commit_url, was_uploaded, uploaded_hash = uploader.full_fix_upload_flow(
        script_path="/project/api_handler.py",
        error="NameError: name 'session' is not defined",
        solution=fix2_solution,
        context={"line": 78, "function": "handle_api_request"},
        inspired_by=fix1_hash,
        variation_reason=variation_reason,
        force_upload=False  # Will use smart filter
    )
    
    # ============================================================
    # Summary
    # ============================================================
    print_header("✅ Demo Complete - Summary")
    
    print(f"{CYAN}What happened:{RESET}\n")
    
    print(f"{GREEN}1. Local Fix Dictionary:{RESET}")
    print(f"   • Stored both fixes with context")
    print(f"   • Created branch: {fix1_hash[:8]} → {fix2_hash[:8]}")
    print(f"   • Tracked variation reason\n")
    
    print(f"{GREEN}2. Script Counters:{RESET}")
    print(f"   • auth.py: 1 fix (NameError)")
    print(f"   • api_handler.py: 1 fix (NameError)")
    print(f"   • Recorded why each fix differs\n")
    
    print(f"{GREEN}3. Context Branches:{RESET}")
    print(f"   • Linked {fix2_hash[:8]} back to {fix1_hash[:8]}")
    print(f"   • Explained: '{variation_reason}'\n")
    
    print(f"{GREEN}4. Consensus Upload:{RESET}")
    if was_uploaded:
        print(f"   • ✅ Uploaded to GitHub consensus")
        print(f"   • Included branch metadata")
        print(f"   • Other users can see the variation pattern")
        print(f"   • Link: {commit_url}\n")
    else:
        print(f"   • 📝 Saved locally (smart filter or no GitHub config)")
        print(f"   • Fix hash: {uploaded_hash[:12]}...")
        print(f"   • Would upload with branch metadata when configured\n")
    
    print(f"{PURPLE}Benefits:{RESET}")
    print(f"  • Community learns WHY fixes vary")
    print(f"  • Context-specific solutions tracked")
    print(f"  • Better recommendations for similar contexts")
    print(f"  • Local patterns contribute to global knowledge\n")
    
    # Show statistics
    rd.print_statistics()


if __name__ == "__main__":
    try:
        demo_context_branching()
    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Demo interrupted{RESET}\n")
    except Exception as e:
        print(f"\n{RED}Error: {e}{RESET}\n")
        import traceback
        traceback.print_exc()
