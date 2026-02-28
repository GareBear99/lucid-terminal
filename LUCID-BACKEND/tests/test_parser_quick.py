#!/usr/bin/env python3
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

agent = EnhancedLuciferAgent()

# Test the previously failing cases
failing_cases = [
    ('Folder creation', 'make a folder called projects'),
    ('Move + create', 'move backup.py to old_scripts and create a new version.py'),
    ('Web scraper', 'create a folder webscraper, make scraper.py that fetches data'),
    ('API client', 'build a directory api_client with client.py that handles http'),
    ('Data pipeline', 'create processor.py that reads csv files'),
    ('Shell script', 'create deploy.sh that pushes to production'),
    ('JS file', 'make app.js that handles routing'),
    ('Generate keyword', 'generate report.py that creates pdfs'),
]

print('Testing improved parser on previously failing cases:')
print('='*70)
for name, test in failing_cases:
    steps = agent._parse_dynamic_steps(test)
    print(f'\n{name}:')
    print(f'REQUEST: {test}')
    print(f'STEPS ({len(steps)}):')
    for i, step in enumerate(steps, 1):
        print(f'  {i}. {step}')
