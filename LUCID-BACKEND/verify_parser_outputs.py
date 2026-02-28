#!/usr/bin/env python3
"""
Verify parser outputs match your exact requirements.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

agent = EnhancedLuciferAgent()

# Test the key requests you asked for
tests = [
    'make a script that opens the default native browser and name it gary browser and put it in a folder named browserstart on desktop',
    'Create a todo list application with main.py for the interface tasks.py for logic and config.json for settings in a folder called todo_app on desktop',
    'I need a comprehensive web automation script that opens my browser navigates to github logs in and stars repositories. Call it github auto star and put it in a folder named automation tools on desktop',
    'create a script that fetches api data and call it data fetcher in downloads',
    'make a shell script that monitors system health and name it health check on desktop'
]

print('='*80)
print('VERIFYING PARSER OUTPUT QUALITY')
print('='*80)

all_passed = True

for i, request in enumerate(tests, 1):
    print(f'\n[{i}] Request: {request[:70]}...')
    steps = agent._parse_dynamic_steps(request)
    print(f'\nGenerated {len(steps)} steps:')
    for j, step in enumerate(steps, 1):
        print(f'  {j}. {step}')
    
    # Check key elements
    print('\n✓ Verification:')
    all_text = ' '.join(steps).lower()
    test_passed = True
    
    # Check for folder names
    if 'browserstart' in request:
        check = 'browserstart' in all_text
        print(f"  - Folder 'browserstart': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'automation tools' in request:
        check = 'automation_tools' in all_text
        print(f"  - Folder 'automation_tools': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'todo_app' in request:
        check = 'todo_app' in all_text
        print(f"  - Folder 'todo_app': {'✅' if check else '❌'}")
        if not check: test_passed = False
    
    # Check for file names
    if 'gary browser' in request:
        check = 'gary_browser.py' in all_text
        print(f"  - File 'gary_browser.py': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'github auto star' in request:
        check = 'github_auto_star.py' in all_text
        print(f"  - File 'github_auto_star.py': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'data fetcher' in request:
        check = 'data_fetcher.py' in all_text
        print(f"  - File 'data_fetcher.py': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'health check' in request:
        check = 'health_check' in all_text
        print(f"  - File 'health_check': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'main.py' in request:
        check = all(f in all_text for f in ['main.py', 'tasks.py', 'config.json'])
        print(f"  - Files 'main.py, tasks.py, config.json': {'✅' if check else '❌'}")
        if not check: test_passed = False
    
    # Check for locations
    if 'desktop' in request:
        check = 'desktop' in all_text
        print(f"  - Location 'Desktop': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'downloads' in request:
        check = 'downloads' in all_text
        print(f"  - Location 'Downloads': {'✅' if check else '❌'}")
        if not check: test_passed = False
    
    # Check for purposes
    if 'opens' in request and 'browser' in request:
        check = 'opens' in all_text and 'browser' in all_text
        print(f"  - Purpose 'opens browser': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'fetches' in request:
        check = 'fetches' in all_text or 'fetch' in all_text
        print(f"  - Purpose 'fetches': {'✅' if check else '❌'}")
        if not check: test_passed = False
    if 'monitors' in request:
        check = 'monitors' in all_text or 'monitor' in all_text
        print(f"  - Purpose 'monitors': {'✅' if check else '❌'}")
        if not check: test_passed = False
    
    # Check for write/implementation steps
    has_write = any(w in all_text for w in ['write', 'implement'])
    print(f"  - Has write/implement step: {'✅' if has_write else '❌'}")
    if not has_write: test_passed = False
    
    # Check for test step
    has_test = 'test' in all_text
    print(f"  - Has test step: {'✅' if has_test else '❌'}")
    if not has_test: test_passed = False
    
    if test_passed:
        print('\n  ✅ ALL CHECKS PASSED FOR THIS TEST')
    else:
        print('\n  ❌ SOME CHECKS FAILED')
        all_passed = False
    
    print('-'*80)

print('\n' + '='*80)
if all_passed:
    print('🎉 SUCCESS! All parser outputs are accurate and meaningful!')
else:
    print('⚠️  Some outputs need improvement')
print('='*80 + '\n')
