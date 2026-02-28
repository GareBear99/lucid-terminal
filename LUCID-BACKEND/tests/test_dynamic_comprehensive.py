#!/usr/bin/env python3
"""
Comprehensive test suite for dynamic fallback step parsing
Tests edge cases, real-world scenarios, and various request patterns
"""
import sys
import re
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))


def parse_dynamic_steps(request: str) -> list:
    """Parse user request into dynamic steps for Tier 0/1 fallback."""
    request_lower = request.lower()
    steps = []
    
    # Action keywords to detect
    directory_keywords = ['directory', 'folder', 'dir']
    move_keywords = ['move', 'mv', 'transfer', 'relocate']
    create_keywords = ['create', 'make', 'build', 'generate', 'write']
    script_keywords = ['script', 'file', '.py', '.sh', '.js', '.txt']
    run_keywords = ['run', 'execute', 'test', 'launch']
    
    # Detect directory/folder creation
    has_directory = any(kw in request_lower for kw in directory_keywords)
    has_create = any(kw in request_lower for kw in create_keywords)
    
    if has_directory and has_create:
        # Extract directory name if possible
        dir_match = re.search(r'(?:directory|folder|dir)\s+(?:called|named)?\s*["\']?([\w-]+)', request_lower)
        dir_name = dir_match.group(1) if dir_match else "directory"
        steps.append(f"Create {dir_name} directory")
    
    # Detect move operations
    has_move = any(kw in request_lower for kw in move_keywords)
    if has_move:
        # Extract file being moved if possible
        file_match = re.search(r'move\s+([\w.-]+)', request_lower)
        file_name = file_match.group(1) if file_match else "file"
        
        # Extract destination if possible
        dest_match = re.search(r'(?:to|into)\s+(?:the\s+)?([\w-]+)', request_lower)
        dest_name = dest_match.group(1) if dest_match else "destination"
        
        steps.append(f"Move {file_name} to {dest_name}")
    
    # Detect script/file creation (separate from directory)
    has_script = any(kw in request_lower for kw in script_keywords)
    if has_script and has_create:
        # Extract script name if possible
        script_match = re.search(r'(?:script|file)\s+(?:called|named)?\s*["\']?([\w.-]+\.[\w]+)', request_lower)
        if script_match:
            script_name = script_match.group(1)
            steps.append(f"Create {script_name}")
        else:
            steps.append("Create script file")
        
        # Extract what the script should do
        purpose_match = re.search(r'(?:that|which|to)\s+(.{1,40})', request_lower)
        if purpose_match:
            purpose = purpose_match.group(1).strip()
            # Clean up common trailing words
            purpose = re.sub(r'\s+(?:and|then|,).*$', '', purpose)
            steps.append(f"Write code to {purpose}")
        else:
            # Use a portion of the request
            steps.append(f"Write code for: {request[:45]}")
    
    # Detect run/test operations (but not for non-executable files or filenames)
    # Look for run/test/execute as actual actions, not just in filenames
    has_run_action = False
    for kw in run_keywords:
        # Check if keyword appears as an action (not in filename)
        # e.g. "and run it" or "then test" but not "run.py"
        pattern = rf'\b{kw}\b(?!\.(py|sh|js))'  # word boundary, not followed by file extension
        if re.search(pattern, request_lower):
            # Make sure it's not part of a filename like "run.py"
            # Check if preceded by action words or followed by pronouns
            context_pattern = rf'(?:and|then|also)\s+{kw}|{kw}\s+(?:it|the|this)'
            if re.search(context_pattern, request_lower):
                has_run_action = True
                break
    
    # Only add run step for executable file types with explicit run action
    executable_extensions = ['.py', '.sh', '.js', '.rb', '.pl']
    has_executable = any(ext in request_lower for ext in executable_extensions)
    if has_run_action and has_script and has_executable:
        steps.append("Run and test the script")
    
    # Fallback: if no steps detected, create generic 3-step plan
    if not steps:
        steps = [
            "Create the file",
            "Verify file exists",
            f"Write code for: {request[:45]}"
        ]
    
    # Limit to reasonable number of steps (3-5 for Tier 0/1)
    if len(steps) > 5:
        steps = steps[:5]
    elif len(steps) < 3:
        # Pad with verification step if needed
        steps.append("Verify creation")
    
    return steps


class TestResult:
    """Track test results."""
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.failed_tests = []
    
    def record(self, test_name, passed, details=None):
        self.total += 1
        if passed:
            self.passed += 1
        else:
            self.failed += 1
            self.failed_tests.append((test_name, details))
    
    def print_summary(self):
        print(f"\n{'='*70}")
        print(f"TEST SUMMARY")
        print(f"{'='*70}")
        print(f"Total Tests: {self.total}")
        print(f"✅ Passed: {self.passed}")
        print(f"❌ Failed: {self.failed}")
        print(f"Success Rate: {(self.passed/self.total*100):.1f}%")
        
        if self.failed_tests:
            print(f"\n{'='*70}")
            print("FAILED TESTS:")
            print(f"{'='*70}")
            for name, details in self.failed_tests:
                print(f"\n❌ {name}")
                if details:
                    print(f"   {details}")


def test_request(result: TestResult, test_name: str, request: str, 
                 expected_keywords: list = None, expected_step_count: int = None,
                 should_not_contain: list = None):
    """Test a request and validate results."""
    print(f"\n{'─'*70}")
    print(f"TEST: {test_name}")
    print(f"REQUEST: {request}")
    print(f"{'─'*70}")
    
    steps = parse_dynamic_steps(request)
    
    print(f"PARSED STEPS ({len(steps)} steps):")
    for i, step in enumerate(steps, 1):
        print(f"  {i}. {step}")
    
    # Validate
    passed = True
    failure_reasons = []
    all_steps_text = " ".join(steps).lower()
    
    # Check expected keywords
    if expected_keywords:
        print(f"\nVALIDATION - Expected keywords:")
        for keyword in expected_keywords:
            found = keyword.lower() in all_steps_text
            status = "✓" if found else "✗"
            print(f"  {status} '{keyword}': {'PASS' if found else 'FAIL'}")
            if not found:
                passed = False
                failure_reasons.append(f"Missing keyword: {keyword}")
    
    # Check step count
    if expected_step_count:
        count_ok = len(steps) == expected_step_count
        status = "✓" if count_ok else "✗"
        print(f"\nVALIDATION - Step count:")
        print(f"  {status} Expected {expected_step_count}, got {len(steps)}: {'PASS' if count_ok else 'FAIL'}")
        if not count_ok:
            passed = False
            failure_reasons.append(f"Wrong step count: expected {expected_step_count}, got {len(steps)}")
    
    # Check should not contain
    if should_not_contain:
        print(f"\nVALIDATION - Should NOT contain:")
        for keyword in should_not_contain:
            found = keyword.lower() in all_steps_text
            status = "✓" if not found else "✗"
            result_text = "PASS" if not found else "FAIL (found but shouldn't)"
            print(f"  {status} '{keyword}': {result_text}")
            if found:
                passed = False
                failure_reasons.append(f"Unwanted keyword found: {keyword}")
    
    result.record(test_name, passed, "; ".join(failure_reasons) if failure_reasons else None)
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}")
    
    return steps


def main():
    """Run comprehensive test suite."""
    print("=" * 70)
    print("COMPREHENSIVE DYNAMIC FALLBACK TEST SUITE")
    print("=" * 70)
    
    result = TestResult()
    
    # ============================================================================
    # CATEGORY 1: Basic Single Operations
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 1: BASIC SINGLE OPERATIONS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Basic script creation",
        "create a script hello.py",
        expected_keywords=["hello.py", "create"],
        expected_step_count=3
    )
    
    test_request(
        result,
        "Basic folder creation",
        "make a folder called projects",
        expected_keywords=["projects", "directory"],
        expected_step_count=3
    )
    
    test_request(
        result,
        "Basic move operation",
        "move file.txt to documents",
        expected_keywords=["move", "file.txt", "documents"],
        expected_step_count=2
    )
    
    # ============================================================================
    # CATEGORY 2: Multi-Part Requests
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 2: MULTI-PART REQUESTS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Directory + file creation",
        "create a folder utils and create init.py in it",
        expected_keywords=["utils", "init.py"],
        should_not_contain=["run", "test the script"]  # Should NOT add run step
    )
    
    test_request(
        result,
        "Move + create combined",
        "move backup.py to old_scripts and create a new version.py",
        expected_keywords=["move", "backup.py", "old_scripts", "version.py"]
    )
    
    test_request(
        result,
        "Create + run combination",
        "create test_suite.py and run it",
        expected_keywords=["test_suite.py", "run"],
        should_not_contain=["verify creation"]  # Should have run step instead
    )
    
    # ============================================================================
    # CATEGORY 3: Script Purpose Extraction
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 3: SCRIPT PURPOSE EXTRACTION")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Script with 'that' clause",
        "make a script that downloads images",
        expected_keywords=["script", "download"]
    )
    
    test_request(
        result,
        "Script with 'which' clause",
        "create a file which processes json data",
        expected_keywords=["file", "process"]
    )
    
    test_request(
        result,
        "Script with 'to' clause",
        "write a script to backup my files",
        expected_keywords=["script", "backup"]
    )
    
    # ============================================================================
    # CATEGORY 4: Edge Cases - Filename Confusion
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 4: EDGE CASES - FILENAME CONFUSION")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Filename contains 'run' - should NOT trigger run action",
        "create run.py in the scripts folder",
        expected_keywords=["run.py"],
        should_not_contain=["run and test"]  # Should NOT add run action
    )
    
    test_request(
        result,
        "Filename contains 'test' - should NOT trigger test action",
        "create test_data.txt in tests directory",
        expected_keywords=["test_data.txt"],
        should_not_contain=["run and test"]  # Should NOT add test action for .txt
    )
    
    test_request(
        result,
        "Filename 'execute.sh' - should NOT trigger execute action",
        "make execute.sh file",
        expected_keywords=["execute.sh"],
        should_not_contain=["run and test"]
    )
    
    # ============================================================================
    # CATEGORY 5: Complex Real-World Scenarios
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 5: COMPLEX REAL-WORLD SCENARIOS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Web scraper project",
        "create a folder webscraper, make scraper.py that fetches data from urls, and test it",
        expected_keywords=["webscraper", "scraper.py", "fetch", "test"]
    )
    
    test_request(
        result,
        "API client setup",
        "build a directory api_client with client.py that handles http requests",
        expected_keywords=["api_client", "client.py", "handle"]
    )
    
    test_request(
        result,
        "Data processing pipeline",
        "create processor.py that reads csv files and generates reports",
        expected_keywords=["processor.py", "read", "csv"]
    )
    
    # ============================================================================
    # CATEGORY 6: File Type Variations
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 6: FILE TYPE VARIATIONS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Shell script",
        "create deploy.sh that pushes to production",
        expected_keywords=["deploy.sh", "push"]
    )
    
    test_request(
        result,
        "JavaScript file",
        "make app.js that handles routing",
        expected_keywords=["app.js", "handle"]
    )
    
    test_request(
        result,
        "Text file (non-executable)",
        "create notes.txt with project details",
        expected_keywords=["notes.txt"],
        should_not_contain=["run"]  # Text files should not have run step
    )
    
    test_request(
        result,
        "JSON config file",
        "make config.json for settings",
        expected_keywords=["config.json"],
        should_not_contain=["run"]
    )
    
    # ============================================================================
    # CATEGORY 7: Ambiguous/Vague Requests
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 7: AMBIGUOUS/VAGUE REQUESTS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Very vague request",
        "do something",
        expected_keywords=["file"],
        expected_step_count=3  # Should fall back to generic 3 steps
    )
    
    test_request(
        result,
        "Incomplete request",
        "create a script",
        expected_keywords=["script", "file"],
        expected_step_count=3
    )
    
    test_request(
        result,
        "No clear action",
        "help me with files",
        expected_step_count=3  # Generic fallback
    )
    
    # ============================================================================
    # CATEGORY 8: Long/Complex Descriptions
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 8: LONG/COMPLEX DESCRIPTIONS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Very long description",
        "create a comprehensive machine learning model training script that loads datasets, preprocesses data, trains multiple models, evaluates performance, and saves results",
        expected_keywords=["script"],
        expected_step_count=3  # Should condense to 3-5 steps
    )
    
    test_request(
        result,
        "Multiple actions in sequence",
        "create utils folder, then make helper.py that does validation, then create test.py that tests it, and run both",
        expected_keywords=["utils", "helper.py", "test.py", "run"]
    )
    
    # ============================================================================
    # CATEGORY 9: Special Characters and Paths
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 9: SPECIAL CHARACTERS AND PATHS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Filename with underscores",
        "create my_awesome_script.py",
        expected_keywords=["my_awesome_script.py"]
    )
    
    test_request(
        result,
        "Filename with hyphens",
        "make data-processor.py",
        expected_keywords=["data-processor.py"]
    )
    
    test_request(
        result,
        "Folder with numbers",
        "create folder project2024",
        expected_keywords=["project2024"]
    )
    
    # ============================================================================
    # CATEGORY 10: Action Variations
    # ============================================================================
    print(f"\n{'='*70}")
    print("CATEGORY 10: ACTION VARIATIONS")
    print(f"{'='*70}")
    
    test_request(
        result,
        "Using 'build' keyword",
        "build a script analyzer.py",
        expected_keywords=["analyzer.py"]
    )
    
    test_request(
        result,
        "Using 'generate' keyword",
        "generate report.py that creates pdfs",
        expected_keywords=["report.py", "create"]
    )
    
    test_request(
        result,
        "Using 'write' keyword",
        "write a file logger.py",
        expected_keywords=["logger.py"]
    )
    
    # Print final summary
    result.print_summary()


if __name__ == "__main__":
    main()
