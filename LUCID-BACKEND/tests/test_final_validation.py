#!/usr/bin/env python3
"""
Final Validation Test for Dynamic Fallback Parser
Tests the actual implementation from enhanced_agent.py
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

def test_parser():
    """Run comprehensive tests on the actual parser."""
    agent = EnhancedLuciferAgent()
    
    test_cases = [
        # Previously failing cases
        ('Folder creation', 'make a folder called projects', ['projects', 'directory']),
        ('Move + create', 'move backup.py to old_scripts and create version.py', ['move', 'version.py']),
        ('Web scraper', 'create folder webscraper, make scraper.py', ['webscraper', 'scraper.py']),
        ('API client', 'build directory api_client with client.py', ['api_client', 'client.py']),
        ('Data pipeline', 'create processor.py that reads csv', ['processor.py', 'read']),
        ('Shell script', 'create deploy.sh that pushes to production', ['deploy.sh', 'push']),
        ('JS file', 'make app.js that handles routing', ['app.js', 'handle']),
        ('Generate keyword', 'generate report.py that creates pdfs', ['report.py', 'create']),
        
        # Additional variants
        ('Multiple files', 'create utils folder with helper.py and test.py', ['utils', 'helper.py', 'test.py']),
        ('Ruby script', 'make script.rb that processes data', ['script.rb', 'process']),
        ('Text file', 'create notes.txt', ['notes.txt']),
        ('Move without create', 'move old.py to archive', ['move', 'old.py', 'archive']),
        ('Run command', 'create test.py and run it', ['test.py', 'run']),
        ('Vague request', 'do something useful', ['file']),
        ('Long request', 'create comprehensive data analysis script with pandas and matplotlib', ['script']),
    ]
    
    print('='*70)
    print('FINAL VALIDATION TEST - Dynamic Fallback Parser')
    print('='*70)
    
    passed = 0
    failed = 0
    failures = []
    
    for name, request, expected_keywords in test_cases:
        steps = agent._parse_dynamic_steps(request)
        all_text = ' '.join(steps).lower()
        
        # Check if all expected keywords are present
        missing = [kw for kw in expected_keywords if kw.lower() not in all_text]
        
        if not missing and len(steps) >= 2:  # At least 2 steps
            passed += 1
            status = '✅ PASS'
        else:
            failed += 1
            status = '❌ FAIL'
            reason = f"Missing: {', '.join(missing)}" if missing else f"Only {len(steps)} steps"
            failures.append((name, reason))
        
        print(f'\n{status} - {name}')
        print(f'  Request: {request}')
        print(f'  Steps ({len(steps)}): {steps[:3]}')  # Show first 3 steps
        if missing:
            print(f'  Missing keywords: {missing}')
    
    print(f'\n{"="*70}')
    print(f'RESULTS: {passed}/{len(test_cases)} passed ({passed/len(test_cases)*100:.1f}%)')
    print(f'{"="*70}')
    
    if failures:
        print(f'\nFailed tests:')
        for name, reason in failures:
            print(f'  ❌ {name}: {reason}')
    else:
        print('\n🎉 ALL TESTS PASSED!')
    
    return passed == len(test_cases)

if __name__ == '__main__':
    success = test_parser()
    sys.exit(0 if success else 1)
