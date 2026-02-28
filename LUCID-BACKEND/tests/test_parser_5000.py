#!/usr/bin/env python3
"""
5000-Test Comprehensive Parser Suite
Generates diverse test cases programmatically to test all parser capabilities.
"""
import sys
import random
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

# Test data pools
ACTIONS = ['opens', 'launches', 'fetches', 'parses', 'monitors', 'processes', 
           'sends', 'generates', 'creates', 'builds', 'optimizes', 'compiles', 
           'analyzes', 'converts', 'transforms']

TARGETS = ['browser', 'chrome', 'firefox', 'safari', 'api data', 'json files', 
           'csv data', 'xml documents', 'system health', 'cpu usage', 'memory stats',
           'images', 'videos', 'audio files', 'emails', 'reports', 'logs', 
           'database records', 'files', 'directories', 'network traffic']

NAMES = ['helper', 'tool', 'manager', 'processor', 'analyzer', 'monitor', 
         'scraper', 'fetcher', 'generator', 'optimizer', 'handler', 'converter',
         'transformer', 'validator', 'sanitizer', 'formatter', 'parser', 'builder']

FOLDERS = ['tools', 'scripts', 'automation', 'utilities', 'apps', 'projects', 
           'data', 'processing', 'analysis', 'monitoring', 'development', 'testing',
           'production', 'staging', 'deployment', 'infrastructure']

LOCATIONS = ['desktop', 'downloads', 'documents']

EXTENSIONS = ['.py', '.sh', '.js', '.rb', '.pl', '.json', '.txt', '.yaml', '.yml']

def generate_test_cases(count=5000):
    """Generate diverse test cases."""
    random.seed(42)  # Reproducible tests
    tests = []
    
    # Category 1: Simple file creation (500 tests)
    for i in range(500):
        name = random.choice(NAMES)
        ext = random.choice(EXTENSIONS)
        tests.append(f"create a file called {name}{ext}")
    
    # Category 2: File with location (500 tests)
    for i in range(500):
        name = random.choice(NAMES)
        ext = random.choice(EXTENSIONS)
        loc = random.choice(LOCATIONS)
        tests.append(f"make {name}{ext} in {loc}")
    
    # Category 3: Script with purpose (800 tests)
    for i in range(800):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        tests.append(f"create a script that {action} {target}")
    
    # Category 4: Named script with purpose (800 tests)
    for i in range(800):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        name = random.choice(NAMES)
        connector = random.choice(['call it', 'name it'])
        tests.append(f"make a script that {action} {target} and {connector} {name}")
    
    # Category 5: Script with location (500 tests)
    for i in range(500):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        loc = random.choice(LOCATIONS)
        tests.append(f"create script that {action} {target} in {loc}")
    
    # Category 6: Script with folder (600 tests)
    for i in range(600):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        folder = random.choice(FOLDERS)
        tests.append(f"make script that {action} {target} in a folder named {folder}")
    
    # Category 7: Complete specification (800 tests)
    for i in range(800):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        name = random.choice(NAMES)
        folder = random.choice(FOLDERS)
        loc = random.choice(LOCATIONS)
        tests.append(f"create a script that {action} {target} and call it {name} and put it in a folder named {folder} on {loc}")
    
    # Category 8: Multi-file applications (300 tests)
    for i in range(300):
        folder = random.choice(FOLDERS)
        loc = random.choice(LOCATIONS)
        tests.append(f"Create an application with main.py utils.py and config.json in a folder called {folder} on {loc}")
    
    # Category 9: Shell scripts (300 tests)
    for i in range(300):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        name = random.choice(NAMES)
        tests.append(f"make a shell script that {action} {target} and call it {name}")
    
    # Category 10: Python scripts (300 tests)
    for i in range(300):
        action = random.choice(ACTIONS)
        target = random.choice(TARGETS)
        name = random.choice(NAMES)
        tests.append(f"build a python script that {action} {target} and name it {name}")
    
    # Category 11: Folder creation (200 tests)
    for i in range(200):
        folder = random.choice(FOLDERS)
        loc = random.choice(LOCATIONS)
        tests.append(f"create a folder named {folder} on {loc}")
    
    # Category 12: Edge cases (200 tests)
    edge_cases = [
        "create script",
        "make a file",
        "build an app",
        "make helper in tools folder on desktop",
        "create data.json",
    ]
    for i in range(200):
        tests.append(random.choice(edge_cases))
    
    return tests[:count]

def run_5000_tests():
    """Run 5000 comprehensive tests."""
    print("\n" + "="*80)
    print("🚀 5000-TEST COMPREHENSIVE SUITE")
    print("="*80 + "\n")
    
    agent = EnhancedLuciferAgent()
    tests = generate_test_cases(5000)
    
    passed = 0
    failed = 0
    failed_tests = []
    
    print("Generating and testing 5000 diverse parser requests...")
    print("This will take a few minutes...\n")
    
    for i, request in enumerate(tests, 1):
        try:
            steps = agent._parse_dynamic_steps(request)
            
            # Basic validation
            all_text = ' '.join(steps).lower()
            
            # Must have at least 2 steps
            has_steps = len(steps) >= 2
            
            # Not vague
            is_vague = any(phrase in all_text for phrase in ['do something', 'generic', 'handle things'])
            
            # Actionable
            first_words = [s.split()[0].lower() if s.split() else '' for s in steps]
            is_actionable = any(w in ['create', 'write', 'implement', 'make', 'test', 'build', 'add', 'generate', 'determine'] for w in first_words)
            
            if has_steps and not is_vague and is_actionable:
                passed += 1
            else:
                failed += 1
                if len(failed_tests) < 50:
                    failed_tests.append((i, request, steps))
        
        except Exception as e:
            failed += 1
            if len(failed_tests) < 50:
                failed_tests.append((i, request, [f"ERROR: {e}"]))
        
        # Progress every 500 tests
        if i % 500 == 0:
            print(f"[{i}/5000] Tested... (Pass rate so far: {passed/i*100:.1f}%)")
    
    # Summary
    print("\n" + "="*80)
    print("📊 5000-TEST RESULTS")
    print("="*80)
    print(f"Total Tests: 5000")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {passed/50:.1f}%")
    print("="*80 + "\n")
    
    # Show sample failures
    if failed_tests:
        print("\n" + "="*80)
        print(f"🔍 SAMPLE FAILURES (showing first 10 of {len(failed_tests)})")
        print("="*80)
        for i, (test_num, request, steps) in enumerate(failed_tests[:10], 1):
            print(f"\n[Failure #{i}] Test #{test_num}")
            print(f"Request: {request}")
            print(f"Steps ({len(steps)}):")
            for j, step in enumerate(steps, 1):
                print(f"  {j}. {step}")
            print("-" * 80)
    
    if passed >= 4950:
        print("\n🎉 EXCEPTIONAL! 99%+ pass rate on 5000 diverse tests!\n")
    elif passed >= 4750:
        print("\n✅ EXCELLENT! 95%+ pass rate on 5000 tests!\n")
    elif passed >= 4500:
        print("\n👍 GREAT! 90%+ pass rate on 5000 tests!\n")
    elif passed >= 4000:
        print("\n✔️  GOOD! 80%+ pass rate!\n")
    else:
        print("\n⚠️  Needs improvement - below 80% pass rate.\n")
    
    return passed >= 4500

if __name__ == "__main__":
    run_5000_tests()
