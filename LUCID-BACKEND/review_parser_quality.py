#!/usr/bin/env python3
"""
Review parser quality - verify task checklists are meaningful and accurate.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

agent = EnhancedLuciferAgent()

# Meaningful real-world test cases
test_cases = [
    ('Your original request', 'make a script that opens the default native browser and name it gary browser and put it in a folder named browserstart on desktop'),
    ('Web scraper', 'create a python script that fetches data from reddit api and saves to json file and call it reddit scraper in downloads'),
    ('System monitor', 'build a shell script that monitors cpu memory and disk usage every minute and logs to file and name it system monitor on desktop'),
    ('Email automation', 'make a script that sends automated email reports to team and call it email bot in a folder named automation tools'),
    ('File organizer', 'create a tool that organizes files by extension and moves them to appropriate folders and name it file organizer'),
    ('Multi-file app', 'Create a todo application with main.py for interface tasks.py for logic and config.json for settings in folder called todo_app on desktop'),
    ('Simple purpose', 'script that opens chrome'),
    ('Data processor', 'create script that parses csv files and generates reports'),
    ('Backup tool', 'build a script that compresses important folders and uploads to cloud and name it backup manager'),
    ('Image processor', 'make a tool that resizes and optimizes images and call it image optimizer in downloads'),
]

print('='*80)
print('PARSER QUALITY REVIEW - Verifying Meaningful Task Checklists')
print('='*80)

all_quality = True

for name, request in test_cases:
    print(f'\n📋 {name}')
    print(f'Request: {request[:75]}...' if len(request) > 75 else f'Request: {request}')
    
    steps = agent._parse_dynamic_steps(request)
    
    print(f'\n✅ Generated Checklist ({len(steps)} steps):')
    for i, step in enumerate(steps, 1):
        print(f'  {i}. {step}')
    
    # Quality checks
    all_text = ' '.join(steps).lower()
    
    print(f'\n🔍 Quality Analysis:')
    
    # Check 1: Specific paths
    has_paths = '/' in ' '.join(steps)
    status1 = 'YES - includes full paths' if has_paths else 'GENERIC - no paths'
    print(f'  ✓ Specific paths: {status1}')
    
    # Check 2: Purpose included
    action_words = ['opens', 'fetches', 'monitors', 'sends', 'parses', 'organizes', 'compresses', 'resizes', 'optimizes']
    has_purpose = any(action in all_text for action in action_words)
    status2 = 'YES - action verbs present' if has_purpose else 'NO - missing purpose'
    print(f'  ✓ Purpose clear: {status2}')
    
    # Check 3: Entities captured
    if 'gary browser' in request:
        found = 'gary_browser' in all_text
        print(f"  ✓ File name: {'YES - gary_browser.py found' if found else 'MISSING'}")
        if not found: all_quality = False
    if 'browserstart' in request:
        found = 'browserstart' in all_text
        print(f"  ✓ Folder name: {'YES - browserstart found' if found else 'MISSING'}")
        if not found: all_quality = False
    if 'desktop' in request.lower():
        found = 'desktop' in all_text
        print(f"  ✓ Location: {'YES - Desktop found' if found else 'MISSING'}")
        if not found: all_quality = False
    if 'main.py' in request:
        files_found = all(f in all_text for f in ['main.py', 'tasks.py', 'config.json'])
        print(f"  ✓ Multi-files: {'YES - all files found' if files_found else 'MISSING some files'}")
        if not files_found: all_quality = False
    
    # Check 4: Implementation step
    has_impl = 'write' in all_text or 'implement' in all_text
    status4 = 'YES - write/implement step' if has_impl else 'NO implementation step'
    print(f'  ✓ Implementation: {status4}')
    if not has_impl: all_quality = False
    
    # Check 5: Test step
    has_test = 'test' in all_text
    status5 = 'YES - test step included' if has_test else 'NO test step'
    print(f'  ✓ Testing: {status5}')
    if not has_test: all_quality = False
    
    # Overall assessment
    is_quality = (has_paths or has_purpose) and has_impl and has_test
    if is_quality:
        print(f'\n  ✅ WARP AI QUALITY')
    else:
        print(f'\n  ⚠️  NEEDS IMPROVEMENT')
        all_quality = False
    
    print('-'*80)

print('\n' + '='*80)
if all_quality:
    print('🎉 ALL TEST CASES PRODUCE WARP AI QUALITY CHECKLISTS!')
else:
    print('⚠️  Some test cases need improvement')
print('='*80 + '\n')
