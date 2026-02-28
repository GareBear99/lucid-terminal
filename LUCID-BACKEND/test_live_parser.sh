#!/bin/bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local

# Start fresh Python and simulate the request
python3 << 'EOF'
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

print("\n" + "="*80)
print("TESTING PARSER IN FRESH PROCESS")
print("="*80)

agent = EnhancedLuciferAgent()
request = "make a script that runs browser"

print(f"\nRequest: {request}")
steps = agent._parse_dynamic_steps(request)

print(f"\n📋 Generated Checklist ({len(steps)} steps):")
for i, step in enumerate(steps, 1):
    print(f"  [ ] {i}. {step}")

print("\n" + "="*80)
print("✅ This is what will show in LuciferAI after restart")
print("="*80 + "\n")
EOF
