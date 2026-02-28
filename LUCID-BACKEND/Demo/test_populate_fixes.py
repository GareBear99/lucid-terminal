#!/usr/bin/env python3
"""
Populate test fixes for LuciferAI testing
Creates both local and consensus (remote) fixes
"""
import os
import sys
import json
import hashlib
from pathlib import Path
from datetime import datetime

# Add core to path
sys.path.insert(0, str(Path(__file__).parent))
from relevance_dictionary import RelevanceDictionary

PURPLE = "\033[35m"
GREEN = "\033[32m"
GOLD = "\033[33m"
RESET = "\033[0m"

def generate_user_id():
    """Generate test user ID."""
    import uuid
    device_id = str(uuid.UUID(int=uuid.getnode()))
    username = os.getenv("USER", "unknown")
    return hashlib.sha256(f"{device_id}-{username}".encode()).hexdigest()[:16].upper()

def populate_local_fixes(rd: RelevanceDictionary):
    """Add sample local fixes."""
    print(f"\n{GOLD}Adding local fixes...{RESET}")
    
    # Fix 1: requests import
    fix_hash_1 = hashlib.sha256(f"fix-requests-{datetime.now()}".encode()).hexdigest()[:16]
    rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'requests' is not defined",
        solution="import requests",
        fix_hash=fix_hash_1,
        context={"category": "import", "module": "requests"}
    )
    
    # Fix 2: datetime import
    fix_hash_2 = hashlib.sha256(f"fix-datetime-{datetime.now()}".encode()).hexdigest()[:16]
    rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'datetime' is not defined",
        solution="from datetime import datetime",
        fix_hash=fix_hash_2,
        context={"category": "import", "module": "datetime"}
    )
    
    # Fix 3: json import
    fix_hash_3 = hashlib.sha256(f"fix-json-{datetime.now()}".encode()).hexdigest()[:16]
    rd.add_fix(
        error_type="NameError",
        error_signature="NameError: name 'json' is not defined",
        solution="import json",
        fix_hash=fix_hash_3,
        context={"category": "import", "module": "json"}
    )
    
    print(f"{GREEN}✅ Added 3 local fixes{RESET}")

def populate_consensus_fixes():
    """Add sample consensus (remote) fixes."""
    print(f"\n{GOLD}Adding consensus fixes...{RESET}")
    
    # Path for remote refs (simulating consensus)
    lucifer_home = Path.home() / ".luciferai"
    fixnet_dir = lucifer_home / "fixnet"
    fixnet_dir.mkdir(parents=True, exist_ok=True)
    refs_file = fixnet_dir / "refs.json"
    
    # Create consensus fixes (simulating other users' contributions)
    consensus_fixes = []
    
    # Consensus Fix 1: numpy import
    consensus_fixes.append({
        "fix_hash": hashlib.sha256(b"consensus-numpy-fix").hexdigest()[:16],
        "user_id": "CONSENSUS_USER_001",
        "error_type": "ModuleNotFoundError",
        "timestamp": datetime.now().isoformat(),
        "script": "data_analysis.py",
        "note": "Common numpy import fix from community"
    })
    
    # Consensus Fix 2: pandas import
    consensus_fixes.append({
        "fix_hash": hashlib.sha256(b"consensus-pandas-fix").hexdigest()[:16],
        "user_id": "CONSENSUS_USER_002",
        "error_type": "ModuleNotFoundError",
        "timestamp": datetime.now().isoformat(),
        "script": "dataframe_ops.py",
        "note": "Pandas import fix shared by community"
    })
    
    # Consensus Fix 3: os.path import
    consensus_fixes.append({
        "fix_hash": hashlib.sha256(b"consensus-ospath-fix").hexdigest()[:16],
        "user_id": "CONSENSUS_USER_003",
        "error_type": "NameError",
        "timestamp": datetime.now().isoformat(),
        "script": "file_handler.py",
        "note": "Common path handling fix"
    })
    
    # Save consensus refs
    with open(refs_file, 'w') as f:
        json.dump(consensus_fixes, f, indent=2)
    
    print(f"{GREEN}✅ Added 3 consensus fixes to {refs_file}{RESET}")

def test_retrieval(rd: RelevanceDictionary):
    """Test fix retrieval."""
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}Testing Fix Retrieval{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    
    # Test 1: Search for requests error
    print(f"\n{GOLD}Test 1: Searching for 'requests' error{RESET}")
    matches = rd.search_similar_fixes("NameError: name 'requests' is not defined", "NameError")
    print(f"Found {len(matches)} matches")
    if matches:
        best = matches[0]
        print(f"  Best: {best['solution']} (score: {best['relevance_score']:.2f}, source: {best['source']})")
    
    # Test 2: Search for datetime error
    print(f"\n{GOLD}Test 2: Searching for 'datetime' error{RESET}")
    best_fix = rd.get_best_fix_for_error("NameError: name 'datetime' is not defined", "NameError")
    if best_fix:
        print(f"  Best: {best_fix['solution']} (score: {best_fix['relevance_score']:.2f})")
    
    # Test 3: Show statistics
    print(f"\n{GOLD}Test 3: Dictionary Statistics{RESET}")
    rd.print_statistics()

if __name__ == "__main__":
    print(f"\n{PURPLE}{'='*60}{RESET}")
    print(f"{PURPLE}🧪 Populating Test Fixes{RESET}")
    print(f"{PURPLE}{'='*60}{RESET}")
    
    # Generate user ID
    user_id = generate_user_id()
    print(f"{GOLD}User ID: {user_id}{RESET}")
    
    # Initialize dictionary
    rd = RelevanceDictionary(user_id)
    
    # Populate fixes
    populate_local_fixes(rd)
    populate_consensus_fixes()
    
    # Sync to load consensus
    rd.sync_with_remote()
    
    # Test retrieval
    test_retrieval(rd)
    
    print(f"\n{GREEN}✅ Test data populated successfully!{RESET}")
    print(f"{GOLD}You can now test fix functionality with the broken scripts{RESET}\n")
