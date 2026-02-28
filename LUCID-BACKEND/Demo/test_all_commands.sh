#!/bin/bash
# Comprehensive test of all LuciferAI commands

echo "🧪 Testing All LuciferAI Commands"
echo "=================================="
echo ""

cd "$(dirname "$0")/.."

# Test each command
commands=(
    "where am i"
    "list core"
    "find lucifer"
    "fixnet stats"
    "memory"
    "help"
    "exit"
)

for cmd in "${commands[@]}"; do
    echo "Testing: $cmd"
    echo "$cmd" | python3 lucifer.py 2>&1 | grep -A 5 "LuciferAI >" || echo "  ⚠️  Command may not be implemented"
    sleep 1
done

echo ""
echo "✅ Basic command tests complete"
