#!/usr/bin/env python3
"""
Quality validation for dynamic parser.
Ensures steps are meaningful, accurate, and Warp AI quality.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

def validate_step_quality(request, steps):
    """Validate that steps are meaningful and accurate."""
    issues = []
    
    # Check 1: Steps should not be generic/vague
    generic_phrases = [
        "verify task completion",
        "complete the operation", 
        "finish the process",
        "handle remaining items"
    ]
    for step in steps:
        for phrase in generic_phrases:
            if phrase in step.lower():
                issues.append(f"Generic step: '{step}'")
    
    # Check 2: Extract expected entities from request
    request_lower = request.lower()
    
    # Folder names
    folder_patterns = [
        "folder named ", "folder called ", "in a folder named ",
        "in a folder called ", "in folder named ", "in folder called "
    ]
    expected_folders = []
    for pattern in folder_patterns:
        if pattern in request_lower:
            start = request_lower.find(pattern) + len(pattern)
            rest = request[start:].split()[0]
            expected_folders.append(rest.lower())
    
    # File names
    filename_patterns = [
        "name it ", "call it ", "called ", "named ",
        ".py", ".sh", ".json", ".txt", ".js", ".rb"
    ]
    expected_files = []
    for pattern in filename_patterns:
        if pattern in request_lower:
            # Extract the name
            if pattern.startswith("."):
                # Extension
                words = request_lower.split()
                for i, w in enumerate(words):
                    if pattern in w:
                        expected_files.append(words[i-1] if i > 0 else "")
            else:
                start = request_lower.find(pattern) + len(pattern)
                # Get next few words
                rest = request[start:].split()[:3]
                expected_files.append(" ".join(rest).lower())
    
    # Locations
    expected_locations = []
    location_patterns = ["desktop", "downloads", "documents"]
    for loc in location_patterns:
        if loc in request_lower:
            expected_locations.append(loc)
    
    # Purposes/actions
    expected_actions = []
    action_patterns = [
        "opens ", "launches ", "fetches ", "parses ",
        "creates ", "monitors ", "processes ", "sends ",
        "logs ", "generates ", "that opens", "that launches",
        "that fetches", "that parses"
    ]
    for pattern in action_patterns:
        if pattern in request_lower:
            expected_actions.append(pattern.strip())
    
    # Check 3: Validate entities are in steps
    all_steps_text = " ".join(steps).lower()
    
    # Check folders
    for folder in expected_folders:
        if folder and folder not in all_steps_text:
            issues.append(f"Missing folder '{folder}' in steps")
    
    # Check files (at least one should appear)
    if expected_files:
        file_found = False
        for fname in expected_files:
            if fname and fname in all_steps_text:
                file_found = True
                break
        if not file_found:
            issues.append(f"Expected file not found in steps: {expected_files}")
    
    # Check locations
    for loc in expected_locations:
        if loc not in all_steps_text:
            issues.append(f"Missing location '{loc}' in steps")
    
    # Check actions/purposes
    if expected_actions and not any(action.replace("that ", "").strip() in all_steps_text for action in expected_actions):
        issues.append(f"Missing expected action/purpose in steps")
    
    # Check 4: Steps should have specific details
    vague_steps = []
    for step in steps:
        # Too short (less than 10 chars) is probably vague
        if len(step) < 10:
            vague_steps.append(step)
    
    if vague_steps:
        issues.append(f"Vague/too-short steps: {vague_steps}")
    
    # Check 5: Steps should form logical sequence
    # For file creation, should have: folder creation, file creation, write content
    if "create" in request_lower or "make" in request_lower or "build" in request_lower:
        has_folder_step = any("folder" in s.lower() or "directory" in s.lower() for s in steps)
        has_file_step = any("file" in s.lower() or ".py" in s.lower() or ".sh" in s.lower() for s in steps)
        has_content_step = any("write" in s.lower() or "add" in s.lower() or "content" in s.lower() for s in steps)
        
        if not has_file_step and "file" in request_lower:
            issues.append("Missing file creation step for file request")
        if not has_content_step:
            issues.append("Missing content/write step")
    
    return issues

# Quality test cases
QUALITY_TESTS = [
    {
        "name": "Browser script with location",
        "request": "make a script that opens the default native browser and name it gary browser and put it in a folder named browserstart on desktop",
        "expect": {
            "folders": ["browserstart"],
            "files": ["gary_browser", "gary browser"],
            "locations": ["desktop"],
            "actions": ["opens", "browser"]
        }
    },
    {
        "name": "File in documents",
        "request": "create a file named config.json in documents",
        "expect": {
            "files": ["config.json"],
            "locations": ["documents"]
        }
    },
    {
        "name": "Script with purpose and name",
        "request": "create a script that fetches api data and call it data fetcher in downloads",
        "expect": {
            "files": ["data_fetcher", "data fetcher"],
            "locations": ["downloads"],
            "actions": ["fetches"]
        }
    },
    {
        "name": "Complex paragraph request",
        "request": "I need a comprehensive web automation script that opens my browser navigates to github logs in and stars repositories. Call it github auto star and put it in a folder named automation tools on desktop.",
        "expect": {
            "folders": ["automation tools", "automation_tools"],
            "files": ["github_auto_star", "github auto star"],
            "locations": ["desktop"],
            "actions": ["opens"]
        }
    },
    {
        "name": "Multi-file application",
        "request": "Create a todo list application with main.py for the interface tasks.py for logic and config.json for settings in a folder called todo_app on desktop",
        "expect": {
            "folders": ["todo_app"],
            "files": ["main.py", "tasks.py", "config.json"],
            "locations": ["desktop"]
        }
    },
    {
        "name": "Shell script inference",
        "request": "make a shell script that monitors system health and name it health check on desktop",
        "expect": {
            "files": ["health_check", "health check", ".sh"],
            "locations": ["desktop"],
            "actions": ["monitors"]
        }
    },
    {
        "name": "Save to location",
        "request": "save the script to downloads",
        "expect": {
            "locations": ["downloads"],
            "files": ["script"]
        }
    },
    {
        "name": "Put it in variant",
        "request": "create a script and put it in documents",
        "expect": {
            "locations": ["documents"]
        }
    },
]

def run_quality_tests():
    """Run quality validation tests."""
    agent = EnhancedLuciferAgent()
    
    print("\n" + "="*80)
    print("🎯 PARSER QUALITY VALIDATION")
    print("="*80 + "\n")
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(QUALITY_TESTS, 1):
        name = test["name"]
        request = test["request"]
        
        print(f"\n[Test {i}/{len(QUALITY_TESTS)}] {name}")
        print(f"Request: {request[:80]}...")
        
        try:
            steps = agent._parse_dynamic_steps(request)
            
            print(f"\nGenerated {len(steps)} steps:")
            for j, step in enumerate(steps, 1):
                print(f"  {j}. {step}")
            
            # Validate quality
            issues = validate_step_quality(request, steps)
            
            if issues:
                print(f"\n❌ Quality Issues Found:")
                for issue in issues:
                    print(f"   - {issue}")
                failed += 1
            else:
                print(f"\n✅ High quality - all entities and structure valid")
                passed += 1
        
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            failed += 1
    
    # Summary
    print("\n" + "="*80)
    print("📊 QUALITY TEST SUMMARY")
    print("="*80)
    print(f"Total: {len(QUALITY_TESTS)}")
    print(f"✅ High Quality: {passed}")
    print(f"❌ Issues Found: {failed}")
    print(f"Quality Score: {(passed/len(QUALITY_TESTS)*100):.1f}%")
    print("="*80 + "\n")
    
    if passed == len(QUALITY_TESTS):
        print("🎉 PERFECT! Warp AI quality achieved!\n")
    elif passed >= len(QUALITY_TESTS) * 0.8:
        print("✅ GOOD! Most steps are high quality!\n")
    else:
        print("⚠️  Needs improvement - steps lack detail/accuracy.\n")

if __name__ == "__main__":
    run_quality_tests()
