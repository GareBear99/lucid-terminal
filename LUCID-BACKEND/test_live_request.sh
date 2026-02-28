#!/bin/bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local

# Clean any previous test files
rm -f custom_script.py 2>/dev/null

# Test the actual request flow
echo "make a script that runs browser" | timeout 120 python3 lucifer.py 2>&1 | grep -A 20 "Task Checklist"
